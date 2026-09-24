// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// FR-06/07: view a route's ordered stops. FR-10: at a stop, take a photo,
// embed it (CLIP, mocked here same as T12), and check in — auto-confirmed
// above the API's threshold, or a manual pick among the route's dogs below
// it. FR-11: undo the most recent check-in.
//
// As in T12, the real CLIP model is not run in this suite — apps/web/src/lib/clip.js
// is mocked at the module boundary. This test only exercises CanTrack's own
// screen logic and its wiring to apps/web/src/lib/api.js.

const mockGetEmbedding = vi.fn();
vi.mock("../../apps/web/src/lib/clip.js", () => ({
  getEmbedding: mockGetEmbedding,
}));

const mockFetchRoute = vi.fn();
const mockCheckIn = vi.fn();
const mockUndoCheckIn = vi.fn();
vi.mock("../../apps/web/src/lib/api.js", () => ({
  fetchRoute: mockFetchRoute,
  checkIn: mockCheckIn,
  undoCheckIn: mockUndoCheckIn,
}));

async function importScreen() {
  return import("../../apps/web/src/walker/WalkerRouteScreen.js");
}

function makePhotoFile(name: string): File {
  return new File(["fake-image-bytes"], name, { type: "image/png" });
}

const ROUTE = {
  id: "route-1",
  stops: [
    { dogId: "dog-1", dogName: "Firulais", pickupTime: "2026-10-01T08:00:00.000Z" },
    { dogId: "dog-2", dogName: "Rex", pickupTime: "2026-10-01T08:15:00.000Z" },
  ],
};

describe("Walker route screen (FR-06, FR-07, FR-10, FR-11)", () => {
  beforeEach(() => {
    mockGetEmbedding.mockReset();
    mockFetchRoute.mockReset();
    mockCheckIn.mockReset();
    mockUndoCheckIn.mockReset();
    mockFetchRoute.mockResolvedValue(ROUTE);
  });

  it("shows the route's stops in order", async () => {
    const { WalkerRouteScreen } = await importScreen();
    render(<WalkerRouteScreen routeId="route-1" />);

    const stops = await screen.findAllByTestId("route-stop");
    expect(stops.map((el) => el.textContent)).toEqual([
      expect.stringContaining("Firulais"),
      expect.stringContaining("Rex"),
    ]);
  });

  it("checks in a stop: embeds the photo and auto-confirms above threshold", async () => {
    mockGetEmbedding.mockResolvedValueOnce([0.9, 0.1, 0, 0]);
    mockCheckIn.mockResolvedValueOnce({ dogId: "dog-1", autoConfirmed: true });

    const { WalkerRouteScreen } = await importScreen();
    const user = userEvent.setup();
    render(<WalkerRouteScreen routeId="route-1" />);

    await screen.findByText("Firulais");
    const [firstCheckInButton] = await screen.findAllByRole("button", { name: /check in/i });
    await user.click(firstCheckInButton);

    const fileInput = screen.getByLabelText(/check-in photo/i);
    await user.upload(fileInput, makePhotoFile("stop-photo.png"));

    await waitFor(() => expect(mockGetEmbedding).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(mockCheckIn).toHaveBeenCalledWith("route-1", expect.any(Array)),
    );
    expect(await screen.findByText(/checked in/i)).toBeInTheDocument();
  });

  it("shows manual candidates when the match isn't confident", async () => {
    mockGetEmbedding.mockResolvedValueOnce([0.5, 0.5, 0, 0]);
    mockCheckIn.mockResolvedValueOnce({
      autoConfirmed: false,
      candidates: [
        { dogId: "dog-1", similarity: 0.6 },
        { dogId: "dog-2", similarity: 0.58 },
      ],
    });

    const { WalkerRouteScreen } = await importScreen();
    const user = userEvent.setup();
    render(<WalkerRouteScreen routeId="route-1" />);

    await screen.findByText("Firulais");
    const [firstCheckInButton] = await screen.findAllByRole("button", { name: /check in/i });
    await user.click(firstCheckInButton);

    const fileInput = screen.getByLabelText(/check-in photo/i);
    await user.upload(fileInput, makePhotoFile("ambiguous.png"));

    expect(await screen.findByText(/which dog/i)).toBeInTheDocument();
  });

  it("undoes the most recent check-in", async () => {
    mockUndoCheckIn.mockResolvedValueOnce({ message: "Check-in undone." });

    const { WalkerRouteScreen } = await importScreen();
    const user = userEvent.setup();
    render(<WalkerRouteScreen routeId="route-1" />);

    await screen.findByText("Firulais");
    await user.click(screen.getByRole("button", { name: /undo/i }));

    await waitFor(() => expect(mockUndoCheckIn).toHaveBeenCalledWith("route-1"));
  });

  it("shows an error when undo fails because there is nothing to undo", async () => {
    mockUndoCheckIn.mockRejectedValueOnce(new Error("Nothing to undo."));

    const { WalkerRouteScreen } = await importScreen();
    const user = userEvent.setup();
    render(<WalkerRouteScreen routeId="route-1" />);

    await screen.findByText("Firulais");
    await user.click(screen.getByRole("button", { name: /undo/i }));

    expect(await screen.findByText(/nothing to undo/i)).toBeInTheDocument();
  });
});
