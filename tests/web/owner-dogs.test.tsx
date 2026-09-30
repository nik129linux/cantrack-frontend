// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// FR-04: owner CRUD dogs. FR-05: enroll a dog with 3 reference photos.
//
// The photos are uploaded to the API, which embeds them on the server (layers: web -> API -> AI).
// The browser must never run the image model: this screen only forwards the File objects through
// enrollPhotos(dogId, files) in apps/web/src/lib/api.ts, which is mocked here.

const mockFetchDogs = vi.fn();
const mockCreateDog = vi.fn();
const mockEnrollPhotos = vi.fn();
vi.mock("../../apps/web/src/lib/api.js", () => ({
  fetchDogs: mockFetchDogs,
  createDog: mockCreateDog,
  enrollPhotos: mockEnrollPhotos,
}));

async function importScreen() {
  return import("../../apps/web/src/owner/OwnerDogsScreen.js");
}

function makePhotoFile(name: string): File {
  return new File(["fake-image-bytes"], name, { type: "image/png" });
}

describe("Owner dogs screen (FR-04, FR-05)", () => {
  beforeEach(() => {
    mockFetchDogs.mockReset();
    mockCreateDog.mockReset();
    mockEnrollPhotos.mockReset();
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

  it("enrolls a dog with 3 photos: uploads the files to the API untouched", async () => {
    mockFetchDogs.mockResolvedValue([{ id: "dog-1", name: "Firulais", breed: "Mixed" }]);
    mockEnrollPhotos.mockResolvedValueOnce({ id: "dog-1", name: "Firulais" });

    const { OwnerDogsScreen } = await importScreen();
    const user = userEvent.setup();
    render(<OwnerDogsScreen />);

    await screen.findByText("Firulais");
    await user.click(screen.getByRole("button", { name: /enroll photos/i }));

    const photos = [
      makePhotoFile("photo1.png"),
      makePhotoFile("photo2.png"),
      makePhotoFile("photo3.png"),
    ];
    await user.upload(screen.getByLabelText(/reference photos/i), photos);
    await user.click(screen.getByRole("button", { name: /save enrollment/i }));

    await waitFor(() => expect(mockEnrollPhotos).toHaveBeenCalledTimes(1));
    const [dogId, files] = mockEnrollPhotos.mock.calls[0] as [string, File[]];
    expect(dogId).toBe("dog-1");
    expect(files.map((f) => f.name)).toEqual(["photo1.png", "photo2.png", "photo3.png"]);
    expect(await screen.findByText(/enrollment saved/i)).toBeInTheDocument();
  });

  it("shows the API's message when enrollment fails", async () => {
    mockFetchDogs.mockResolvedValue([{ id: "dog-1", name: "Firulais", breed: "Mixed" }]);
    mockEnrollPhotos.mockRejectedValueOnce(new Error("Unreadable image."));

    const { OwnerDogsScreen } = await importScreen();
    const user = userEvent.setup();
    render(<OwnerDogsScreen />);

    await screen.findByText("Firulais");
    await user.click(screen.getByRole("button", { name: /enroll photos/i }));
    await user.upload(screen.getByLabelText(/reference photos/i), [
      makePhotoFile("a.png"),
      makePhotoFile("b.png"),
      makePhotoFile("c.png"),
    ]);
    await user.click(screen.getByRole("button", { name: /save enrollment/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/unreadable image/i);
    expect(screen.queryByText(/enrollment saved/i)).not.toBeInTheDocument();
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
    expect(mockEnrollPhotos).not.toHaveBeenCalled();
  });
});
