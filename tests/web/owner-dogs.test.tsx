// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// FR-04: owner CRUD dogs. FR-05: enroll a dog with 3 reference photos,
// each embedded (CLIP) and stored.
//
// The actual CLIP model (transformers.js) is NOT run in this suite — loading
// and running it is slow/network-dependent and belongs to a manual/e2e check,
// not this fast unit suite. Instead, apps/web/src/lib/clip.ts must export a
// getEmbedding(image: Blob): Promise<number[]> function that the enrollment
// screen calls per photo; this test mocks THAT module boundary and asserts
// the screen calls it and forwards the result to the API. See AGENTS.md.

const mockGetEmbedding = vi.fn();
vi.mock("../../apps/web/src/lib/clip.js", () => ({
  getEmbedding: mockGetEmbedding,
}));

const mockFetchDogs = vi.fn();
const mockCreateDog = vi.fn();
const mockEnrollEmbedding = vi.fn();
vi.mock("../../apps/web/src/lib/api.js", () => ({
  fetchDogs: mockFetchDogs,
  createDog: mockCreateDog,
  enrollEmbedding: mockEnrollEmbedding,
}));

async function importScreen() {
  return import("../../apps/web/src/owner/OwnerDogsScreen.js");
}

function makePhotoFile(name: string): File {
  return new File(["fake-image-bytes"], name, { type: "image/png" });
}

describe("Owner dogs screen (FR-04, FR-05)", () => {
  beforeEach(() => {
    mockGetEmbedding.mockReset();
    mockFetchDogs.mockReset();
    mockCreateDog.mockReset();
    mockEnrollEmbedding.mockReset();
    mockFetchDogs.mockResolvedValue([]);
  });

  it("lists the owner's existing dogs", async () => {
    mockFetchDogs.mockResolvedValue([
      { id: "dog-1", name: "Firulais", breed: "Mixed" },
      { id: "dog-2", name: "Rex", breed: "Labrador" },
    ]);

    const { OwnerDogsScreen } = await importScreen();
    render(<OwnerDogsScreen />);

    expect(await screen.findByText("Firulais")).toBeInTheDocument();
    expect(screen.getByText("Rex")).toBeInTheDocument();
  });

  it("creates a new dog from the form", async () => {
    mockCreateDog.mockResolvedValueOnce({ id: "dog-3", name: "Luna", breed: "Poodle" });

    const { OwnerDogsScreen } = await importScreen();
    const user = userEvent.setup();
    render(<OwnerDogsScreen />);

    await user.type(screen.getByLabelText(/name/i), "Luna");
    await user.type(screen.getByLabelText(/breed/i), "Poodle");
    await user.click(screen.getByRole("button", { name: /add dog/i }));

    await waitFor(() =>
      expect(mockCreateDog).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Luna", breed: "Poodle" }),
      ),
    );
  });

  it("rejects creating a dog with no name", async () => {
    const { OwnerDogsScreen } = await importScreen();
    const user = userEvent.setup();
    render(<OwnerDogsScreen />);

    await user.click(screen.getByRole("button", { name: /add dog/i }));

    expect(await screen.findByText(/name/i)).toBeInTheDocument();
    expect(mockCreateDog).not.toHaveBeenCalled();
  });

  it("enrolls a dog with 3 photos: embeds each and submits the embedding", async () => {
    mockFetchDogs.mockResolvedValue([{ id: "dog-1", name: "Firulais", breed: "Mixed" }]);
    mockGetEmbedding
      .mockResolvedValueOnce([0.1, 0.2, 0.3])
      .mockResolvedValueOnce([0.15, 0.22, 0.28])
      .mockResolvedValueOnce([0.12, 0.19, 0.31]);
    mockEnrollEmbedding.mockResolvedValueOnce({ id: "dog-1", embedding: [0.12, 0.2, 0.3] });

    const { OwnerDogsScreen } = await importScreen();
    const user = userEvent.setup();
    render(<OwnerDogsScreen />);

    await screen.findByText("Firulais");
    await user.click(screen.getByRole("button", { name: /enroll photos/i }));

    const fileInput = screen.getByLabelText(/reference photos/i);
    await user.upload(fileInput, [
      makePhotoFile("photo1.png"),
      makePhotoFile("photo2.png"),
      makePhotoFile("photo3.png"),
    ]);

    await user.click(screen.getByRole("button", { name: /save enrollment/i }));

    await waitFor(() => expect(mockGetEmbedding).toHaveBeenCalledTimes(3));
    await waitFor(() =>
      expect(mockEnrollEmbedding).toHaveBeenCalledWith(
        "dog-1",
        expect.any(Array),
      ),
    );
  });

  it("rejects enrollment with fewer than 3 photos", async () => {
    mockFetchDogs.mockResolvedValue([{ id: "dog-1", name: "Firulais", breed: "Mixed" }]);

    const { OwnerDogsScreen } = await importScreen();
    const user = userEvent.setup();
    render(<OwnerDogsScreen />);

    await screen.findByText("Firulais");
    await user.click(screen.getByRole("button", { name: /enroll photos/i }));

    const fileInput = screen.getByLabelText(/reference photos/i);
    await user.upload(fileInput, [makePhotoFile("photo1.png")]);
    await user.click(screen.getByRole("button", { name: /save enrollment/i }));

    expect(await screen.findByText(/3 photos/i)).toBeInTheDocument();
    expect(mockGetEmbedding).not.toHaveBeenCalled();
  });
});
