// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// S3: the walker's checkout flow for one accepted request
// (WalkerCheckoutScreen({requestId})). On mount it asks for an existing
// checkout of the request: a draft opens the edit view (the "Note to owner"
// textarea prefilled with the walker's OWN note field — initially a copy of
// the AI observation; aiNote stays read-only provenance — the three AI states
// with their exact texts, the no-dog warning when dogVisible is false, Save
// note / Ask the AI again / Send to owner), nothing opens the upload form
// (1..3 photos with previews). Every button is double-submit protected and
// errors render inline.

const mockFetchRequestCheckout = vi.fn();
const mockCreateCheckout = vi.fn();
const mockUpdateCheckoutNote = vi.fn();
const mockSendCheckout = vi.fn();
const mockRerunAiNote = vi.fn();
vi.mock("../../apps/web/src/lib/api.js", () => ({
  fetchRequestCheckout: mockFetchRequestCheckout,
  createCheckout: mockCreateCheckout,
  updateCheckoutNote: mockUpdateCheckoutNote,
  sendCheckout: mockSendCheckout,
  rerunAiNote: mockRerunAiNote,
}));

function loadScreen(path: string): Promise<any> {
  return import(/* @vite-ignore */ `../../apps/web/src/${path}.js`);
}

async function renderCheckout() {
  const { WalkerCheckoutScreen } = await loadScreen("walker/WalkerCheckoutScreen");
  return render(<WalkerCheckoutScreen requestId="r-1" />);
}

function makePhoto(name: string): File {
  return new File([`bytes-${name}`], name, { type: "image/png" });
}

const DRAFT = {
  id: "c-1",
  requestId: "r-1",
  dogId: "dog-1",
  dogName: "Firulais",
  walkerId: "walker-w",
  status: "draft",
  photos: [{ url: "https://supabase.example/signed/x/1.png?expires=3600", expiresIn: 3600 }],
  aiNote: "Calm and clean.",
  dogVisible: true,
  note: "Calm and clean.",
  aiStatus: "ok",
  sentAt: null,
  createdAt: "2026-10-05T15:00:00+00:00",
};

afterEach(cleanup);

describe("Walker checkout screen (S3)", () => {
  beforeEach(() => {
    mockFetchRequestCheckout.mockReset();
    mockCreateCheckout.mockReset();
    mockUpdateCheckoutNote.mockReset();
    mockSendCheckout.mockReset();
    mockRerunAiNote.mockReset();
    mockFetchRequestCheckout.mockResolvedValue(null);
    // jsdom has no object URLs; the previews need them
    (URL as unknown as Record<string, unknown>).createObjectURL = vi.fn(() => "blob:stub");
    (URL as unknown as Record<string, unknown>).revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    delete (URL as unknown as Record<string, unknown>).createObjectURL;
    delete (URL as unknown as Record<string, unknown>).revokeObjectURL;
  });

  it("shows a loading state while the existing checkout loads", async () => {
    mockFetchRequestCheckout.mockReturnValue(new Promise(() => {}));
    await renderCheckout();
    expect(screen.getByText("Loading checkout...")).toBeInTheDocument();
  });

  it("shows the upload form when the request has no checkout yet", async () => {
    await renderCheckout();
    expect(
      await screen.findByLabelText("Checkout photos (1 to 3)"),
    ).toBeInTheDocument();
  });

  it("rejects 0 or 4 photos before calling the API", async () => {
    const user = userEvent.setup();
    await renderCheckout();

    await user.click(await screen.findByRole("button", { name: "Create checkout" }));
    expect(await screen.findByText("Between 1 and 3 photos are required.")).toBeInTheDocument();

    await user.upload(screen.getByLabelText("Checkout photos (1 to 3)"), [
      makePhoto("a.png"), makePhoto("b.png"), makePhoto("c.png"), makePhoto("d.png"),
    ]);
    await user.click(screen.getByRole("button", { name: "Create checkout" }));
    expect(screen.getAllByText("Between 1 and 3 photos are required.").length).toBeGreaterThan(0);

    expect(mockCreateCheckout).not.toHaveBeenCalled();
  });

  it("previews the picked photos and uploads them untouched", async () => {
    mockCreateCheckout.mockResolvedValue(DRAFT);
    const user = userEvent.setup();
    await renderCheckout();

    const files = [makePhoto("a.png"), makePhoto("b.png")];
    await user.upload(await screen.findByLabelText("Checkout photos (1 to 3)"), files);
    expect(screen.getAllByRole("img")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Create checkout" }));

    await waitFor(() => expect(mockCreateCheckout).toHaveBeenCalledTimes(1));
    const [requestId, sent] = mockCreateCheckout.mock.calls[0] as [string, File[]];
    expect(requestId).toBe("r-1");
    expect(sent.map((f) => f.name)).toEqual(["a.png", "b.png"]);
    // the draft view appears with the walker's note prefilled (the initial
    // copy of the AI observation)
    expect(await screen.findByLabelText("Note to owner")).toHaveValue("Calm and clean.");
    expect(
      screen.getByText("AI observation draft — edit before sending."),
    ).toBeInTheDocument();
  });

  it("prefills the textarea from the walker note, never from the AI field", async () => {
    mockFetchRequestCheckout.mockResolvedValue({
      ...DRAFT,
      aiNote: "The model said this.",
      note: "The walker wrote this.",
    });
    await renderCheckout();
    expect(await screen.findByLabelText("Note to owner")).toHaveValue("The walker wrote this.");
    expect(screen.queryByDisplayValue("The model said this.")).not.toBeInTheDocument();
  });

  it("shows the API error inline when creating fails", async () => {
    mockCreateCheckout.mockRejectedValue(new Error("Unreadable image."));
    const user = userEvent.setup();
    await renderCheckout();

    await user.upload(await screen.findByLabelText("Checkout photos (1 to 3)"), [makePhoto("a.png")]);
    await user.click(screen.getByRole("button", { name: "Create checkout" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Unreadable image.");
  });

  it("disables Create checkout while in flight and calls the API once", async () => {
    let resolveCreate: (value: unknown) => void = () => {};
    mockCreateCheckout.mockImplementation(() => new Promise((r) => { resolveCreate = r; }));
    const user = userEvent.setup();
    await renderCheckout();

    await user.upload(await screen.findByLabelText("Checkout photos (1 to 3)"), [makePhoto("a.png")]);
    const button = screen.getByRole("button", { name: "Create checkout" });
    await user.click(button);
    await user.click(button);

    expect(mockCreateCheckout).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Create checkout" })).toBeDisabled();

    await act(async () => { resolveCreate(DRAFT); });
  });

  it.each([
    ["unavailable", "The AI observation is unavailable; you can still send the photos."],
    ["quota", "Monthly AI limit reached; the note is yours alone."],
  ])("shows the exact text for the %s AI state", async (aiStatus, text) => {
    mockFetchRequestCheckout.mockResolvedValue({
      ...DRAFT, aiStatus, aiNote: null, note: null, dogVisible: null,
    });
    await renderCheckout();
    expect(await screen.findByText(text as string)).toBeInTheDocument();
  });

  it("warns when no dog was detected and still allows sending", async () => {
    mockFetchRequestCheckout.mockResolvedValue({
      ...DRAFT, aiNote: null, note: null, dogVisible: false,
    });
    mockSendCheckout.mockResolvedValue({ id: "c-1", status: "sent" });
    const user = userEvent.setup();
    await renderCheckout();

    expect(
      await screen.findByText("No dog detected in the photos. Check them before sending."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Send to owner" }));
    await waitFor(() => expect(mockSendCheckout).toHaveBeenCalledWith("c-1"));
  });

  it("does not show the no-dog warning when a dog was detected", async () => {
    mockFetchRequestCheckout.mockResolvedValue(DRAFT); // dogVisible: true
    await renderCheckout();
    await screen.findByLabelText("Note to owner");
    expect(
      screen.queryByText("No dog detected in the photos. Check them before sending."),
    ).not.toBeInTheDocument();
  });

  it("saves an edited note with the exact arguments", async () => {
    mockFetchRequestCheckout.mockResolvedValue(DRAFT);
    // PATCH changes only the walker's note; aiNote keeps the model's text
    mockUpdateCheckoutNote.mockResolvedValue({ ...DRAFT, note: "Edited by the walker." });
    const user = userEvent.setup();
    await renderCheckout();

    const note = await screen.findByLabelText("Note to owner");
    await user.clear(note);
    await user.type(note, "Edited by the walker.");
    await user.click(screen.getByRole("button", { name: "Save note" }));

    await waitFor(() =>
      expect(mockUpdateCheckoutNote).toHaveBeenCalledWith("c-1", "Edited by the walker."),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Note saved.");
    expect(screen.getByLabelText("Note to owner")).toHaveValue("Edited by the walker.");
  });

  it("rejects a 201-character note without calling the API", async () => {
    mockFetchRequestCheckout.mockResolvedValue(DRAFT);
    const user = userEvent.setup();
    await renderCheckout();

    const note = await screen.findByLabelText("Note to owner");
    await user.clear(note);
    await user.type(note, "z".repeat(201));
    await user.click(screen.getByRole("button", { name: "Save note" }));

    expect(
      await screen.findByText("The note must be 200 characters or less."),
    ).toBeInTheDocument();
    expect(mockUpdateCheckoutNote).not.toHaveBeenCalled();
  });

  it("sends the checkout to the owner exactly once", async () => {
    mockFetchRequestCheckout.mockResolvedValue(DRAFT);
    mockSendCheckout.mockResolvedValue({ id: "c-1", status: "sent" });
    const user = userEvent.setup();
    await renderCheckout();

    const send = await screen.findByRole("button", { name: "Send to owner" });
    await user.click(send);
    await user.click(send);

    expect(mockSendCheckout).toHaveBeenCalledTimes(1);
    expect(mockSendCheckout).toHaveBeenCalledWith("c-1");
    expect(await screen.findByRole("status")).toHaveTextContent("Sent to the owner.");
  });

  it("shows the 429 quota message inline when the AI re-run is refused", async () => {
    mockFetchRequestCheckout.mockResolvedValue(DRAFT);
    mockRerunAiNote.mockRejectedValue(new Error("Monthly AI limit reached."));
    const user = userEvent.setup();
    await renderCheckout();

    await user.click(await screen.findByRole("button", { name: "Ask the AI again" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Monthly AI limit reached.");
  });

  it("updates the note when the AI re-run succeeds on an untouched draft", async () => {
    mockFetchRequestCheckout.mockResolvedValue(DRAFT);
    // the draft was never edited, so the server replaces BOTH fields; the
    // textarea (bound to note) shows the fresh observation
    mockRerunAiNote.mockResolvedValue({
      ...DRAFT, aiNote: "Second look: all good.", note: "Second look: all good.",
    });
    const user = userEvent.setup();
    await renderCheckout();

    await user.click(await screen.findByRole("button", { name: "Ask the AI again" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Note to owner")).toHaveValue("Second look: all good."),
    );
  });

  it("keeps the edited note in the textarea when the AI re-run succeeds", async () => {
    mockFetchRequestCheckout.mockResolvedValue({ ...DRAFT, note: "Edited by the walker." });
    // an edited note survives the re-run server-side: only aiNote changes
    mockRerunAiNote.mockResolvedValue({
      ...DRAFT, aiNote: "Second look: all good.", note: "Edited by the walker.",
    });
    const user = userEvent.setup();
    await renderCheckout();

    await user.click(await screen.findByRole("button", { name: "Ask the AI again" }));

    await waitFor(() => expect(mockRerunAiNote).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText("Note to owner")).toHaveValue("Edited by the walker.");
  });
});
