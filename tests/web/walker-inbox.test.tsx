// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// S1: the walker's inbox (Requests tab). fetchRequests() lists the requests
// addressed to the walker (pending oldest first — ordering is the API's job,
// pinned in tests/py/api/test_requests.py); opening one calls fetchRequest(id),
// and the detail shows ONLY what the API returned: while pending that is the
// limited dog view (name, breed, size, temperament — no pin, no allergies, no
// contacts), after accept the full view. Accept/Decline call acceptRequest /
// declineRequest with the exact id; a non-empty `conflicts` array on accept
// must surface as a time-conflict alert. Errors render inline (role=alert),
// never uncaught. Runtime-computed import so every test is red on its own
// until apps/web/src/walker/WalkerInboxScreen.tsx exists.

const mockFetchRequests = vi.fn();
const mockFetchRequest = vi.fn();
const mockAcceptRequest = vi.fn();
const mockDeclineRequest = vi.fn();
vi.mock("../../apps/web/src/lib/api.js", () => ({
  fetchRequests: mockFetchRequests,
  fetchRequest: mockFetchRequest,
  acceptRequest: mockAcceptRequest,
  declineRequest: mockDeclineRequest,
}));

function loadScreen(path: string): Promise<any> {
  return import(/* @vite-ignore */ `../../apps/web/src/${path}.js`);
}

async function renderInbox() {
  const { WalkerInboxScreen } = await loadScreen("walker/WalkerInboxScreen");
  return render(<WalkerInboxScreen />);
}

const PENDING = {
  id: "r-1",
  status: "pending",
  requestedTime: "2026-10-05T10:00:00+00:00",
  priceCop: 25000,
  createdAt: "2026-10-01T08:00:00+00:00",
  dog: { name: "Firulais", breed: "Mixed", size: "medium", temperament: "friendly" },
};

const DECLINED = {
  id: "r-2",
  status: "declined",
  requestedTime: "2026-10-06T11:00:00+00:00",
  priceCop: 25000,
  createdAt: "2026-10-02T08:00:00+00:00",
  dog: { name: "Rex", breed: "Labrador", size: "large", temperament: "shy" },
};

const ACCEPTED_DETAIL = {
  id: "r-2",
  status: "accepted",
  requestedTime: "2026-10-06T11:00:00+00:00",
  priceCop: 25000,
  createdAt: "2026-10-02T08:00:00+00:00",
  respondedAt: "2026-10-02T09:00:00+00:00",
  pickupLat: 6.2,
  pickupLng: -75.5,
  dog: {
    name: "Rex", breed: "Labrador", size: "large", temperament: "shy",
    energy: "high", leashTrained: true, allergies: "Peanuts",
    medicalNotes: "Hip dysplasia", vetContact: "Vet Laura 3001112233",
    emergencyContact: "Ana 3104445566",
  },
};

const CANCELLED = {
  id: "r-3",
  status: "cancelled",
  requestedTime: "2026-10-07T09:00:00+00:00",
  priceCop: 25000,
  createdAt: "2026-10-03T08:00:00+00:00",
  dog: { name: "Luna", breed: "Poodle", size: "small", temperament: "shy" },
};

afterEach(cleanup);

describe("Walker inbox screen (S1)", () => {
  beforeEach(() => {
    mockFetchRequests.mockReset();
    mockFetchRequest.mockReset();
    mockAcceptRequest.mockReset();
    mockDeclineRequest.mockReset();
    mockFetchRequests.mockResolvedValue([]);
  });

  it("shows a loading state while the inbox loads", async () => {
    mockFetchRequests.mockReturnValue(new Promise(() => {}));
    await renderInbox();
    expect(screen.getByText("Loading requests...")).toBeInTheDocument();
  });

  it("shows the error inline when the inbox fails to load", async () => {
    mockFetchRequests.mockRejectedValue(new Error("Boom"));
    await renderInbox();
    expect(await screen.findByRole("alert")).toHaveTextContent("Boom");
  });

  it("shows the empty state when there are no requests", async () => {
    await renderInbox();
    expect(await screen.findByRole("heading", { name: "No requests yet" })).toBeInTheDocument();
  });

  it("lists every request with its dog, time and status badge", async () => {
    mockFetchRequests.mockResolvedValue([PENDING, DECLINED]);
    await renderInbox();

    expect(await screen.findByText("Firulais")).toBeInTheDocument();
    expect(screen.getByText("2026-10-05T10:00:00+00:00")).toBeInTheDocument();
    expect(screen.getByText("pending")).toBeInTheDocument();
    expect(screen.getByText("Rex")).toBeInTheDocument();
    expect(screen.getByText("declined")).toBeInTheDocument();
  });

  it("opens the limited detail of a pending request: no pin, no allergies, no contacts", async () => {
    mockFetchRequests.mockResolvedValue([PENDING]);
    mockFetchRequest.mockResolvedValue(PENDING);
    const user = userEvent.setup();
    await renderInbox();

    await user.click(await screen.findByText("Firulais"));
    await waitFor(() => expect(mockFetchRequest).toHaveBeenCalledWith("r-1"));

    expect(await screen.findByText("Mixed")).toBeInTheDocument();
    expect(screen.getByText("medium")).toBeInTheDocument();
    expect(screen.getByText("friendly")).toBeInTheDocument();
    expect(screen.queryByText(/allergies/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/medical notes/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/vet contact/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/emergency contact/i)).not.toBeInTheDocument();
    expect(screen.queryByText("6.2, -75.5")).not.toBeInTheDocument();
  });

  it("opens the full detail of an accepted request: pin, allergies and contacts", async () => {
    mockFetchRequests.mockResolvedValue([{ ...DECLINED, status: "accepted" }]);
    mockFetchRequest.mockResolvedValue(ACCEPTED_DETAIL);
    const user = userEvent.setup();
    await renderInbox();

    await user.click(await screen.findByText("Rex"));

    expect(await screen.findByText("Peanuts")).toBeInTheDocument();
    expect(screen.getByText("Vet Laura 3001112233")).toBeInTheDocument();
    expect(screen.getByText("Ana 3104445566")).toBeInTheDocument();
    expect(screen.getByText("6.2, -75.5")).toBeInTheDocument();
  });

  it("accepts a pending request and reloads the inbox", async () => {
    mockFetchRequests.mockResolvedValue([PENDING]);
    mockFetchRequest.mockResolvedValue(PENDING);
    mockAcceptRequest.mockResolvedValue({
      id: "r-1", status: "accepted", respondedAt: "2026-10-02T09:00:00+00:00", conflicts: [],
    });
    const user = userEvent.setup();
    await renderInbox();

    await user.click(await screen.findByText("Firulais"));
    await user.click(await screen.findByRole("button", { name: "Accept" }));

    await waitFor(() => expect(mockAcceptRequest).toHaveBeenCalledWith("r-1"));
    expect(await screen.findByRole("status")).toHaveTextContent("Request accepted.");
    await waitFor(() => expect(mockFetchRequests).toHaveBeenCalledTimes(2));
  });

  it("surfaces time conflicts flagged by the accept", async () => {
    mockFetchRequests.mockResolvedValue([PENDING]);
    mockFetchRequest.mockResolvedValue(PENDING);
    mockAcceptRequest.mockResolvedValue({
      id: "r-1", status: "accepted", respondedAt: "2026-10-02T09:00:00+00:00",
      conflicts: [{ requestId: "r-0", requestedTime: "2026-10-05T09:30:00+00:00" }],
    });
    const user = userEvent.setup();
    await renderInbox();

    await user.click(await screen.findByText("Firulais"));
    await user.click(await screen.findByRole("button", { name: "Accept" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/time conflict/i);
    expect(alert).toHaveTextContent("2026-10-05T09:30:00+00:00");
  });

  it("shows the rejection inline when accepting fails", async () => {
    mockFetchRequests.mockResolvedValue([PENDING]);
    mockFetchRequest.mockResolvedValue(PENDING);
    mockAcceptRequest.mockRejectedValue(new Error("Only a pending request can be accepted."));
    const user = userEvent.setup();
    await renderInbox();

    await user.click(await screen.findByText("Firulais"));
    await user.click(await screen.findByRole("button", { name: "Accept" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Only a pending request can be accepted.",
    );
    await waitFor(() => expect(mockFetchRequests).toHaveBeenCalledTimes(1));
  });

  it("declines a pending request", async () => {
    mockFetchRequests.mockResolvedValue([PENDING]);
    mockFetchRequest.mockResolvedValue(PENDING);
    mockDeclineRequest.mockResolvedValue({
      id: "r-1", status: "declined", respondedAt: "2026-10-02T09:00:00+00:00",
    });
    const user = userEvent.setup();
    await renderInbox();

    await user.click(await screen.findByText("Firulais"));
    await user.click(await screen.findByRole("button", { name: "Decline" }));

    await waitFor(() => expect(mockDeclineRequest).toHaveBeenCalledWith("r-1"));
    expect(await screen.findByRole("status")).toHaveTextContent("Request declined.");
  });

  it("shows the rejection inline when declining fails", async () => {
    mockFetchRequests.mockResolvedValue([PENDING]);
    mockFetchRequest.mockResolvedValue(PENDING);
    mockDeclineRequest.mockRejectedValue(new Error("Nope."));
    const user = userEvent.setup();
    await renderInbox();

    await user.click(await screen.findByText("Firulais"));
    await user.click(await screen.findByRole("button", { name: "Decline" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Nope.");
  });

  it("opens the limited detail of a cancelled request and offers no actions", async () => {
    mockFetchRequests.mockResolvedValue([CANCELLED]);
    mockFetchRequest.mockResolvedValue(CANCELLED);
    const user = userEvent.setup();
    await renderInbox();

    await user.click(await screen.findByText("Luna"));
    await waitFor(() => expect(mockFetchRequest).toHaveBeenCalledWith("r-3"));

    expect(await screen.findByText("small")).toBeInTheDocument();
    expect(screen.getByText("shy")).toBeInTheDocument();
    expect(screen.queryByText(/allergies/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/medical notes/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/vet contact/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/emergency contact/i)).not.toBeInTheDocument();
    expect(screen.queryByText("6.2, -75.5")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Decline" })).not.toBeInTheDocument();
  });

  it("disables Accept while in flight and calls the API exactly once", async () => {
    mockFetchRequests.mockResolvedValue([PENDING]);
    mockFetchRequest.mockResolvedValue(PENDING);
    let resolveAccept: (value: unknown) => void = () => {};
    mockAcceptRequest.mockImplementation(
      () => new Promise((resolve) => { resolveAccept = resolve; }),
    );
    const user = userEvent.setup();
    await renderInbox();

    await user.click(await screen.findByText("Firulais"));
    const accept = await screen.findByRole("button", { name: "Accept" });
    await user.click(accept);
    await user.click(accept);

    expect(mockAcceptRequest).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Accept" })).toBeDisabled();

    await act(async () => {
      resolveAccept({
        id: "r-1", status: "accepted",
        respondedAt: "2026-10-02T09:00:00+00:00", conflicts: [],
      });
    });
  });

  it("disables Decline while in flight and calls the API exactly once", async () => {
    mockFetchRequests.mockResolvedValue([PENDING]);
    mockFetchRequest.mockResolvedValue(PENDING);
    let resolveDecline: (value: unknown) => void = () => {};
    mockDeclineRequest.mockImplementation(
      () => new Promise((resolve) => { resolveDecline = resolve; }),
    );
    const user = userEvent.setup();
    await renderInbox();

    await user.click(await screen.findByText("Firulais"));
    const decline = await screen.findByRole("button", { name: "Decline" });
    await user.click(decline);
    await user.click(decline);

    expect(mockDeclineRequest).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Decline" })).toBeDisabled();

    await act(async () => {
      resolveDecline({
        id: "r-1", status: "declined", respondedAt: "2026-10-02T09:00:00+00:00",
      });
    });
  });
});
