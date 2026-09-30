// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// FR-06/07: view a route's ordered stops. FR-10: at a stop, take a photo and check in — the photo is
// uploaded to the API, which embeds it and asks the vision model on the server. The result is either
// auto-confirmed or a manual pick among the route's dogs. FR-11: undo the most recent check-in.
//
// The browser never runs the image model. This suite mocks apps/web/src/lib/api.js only.

const mockFetchRoute = vi.fn();
const mockCheckIn = vi.fn();
const mockConfirmCheckIn = vi.fn();
const mockUndoCheckIn = vi.fn();
vi.mock("../../apps/web/src/lib/api.js", () => ({
  fetchRoute: mockFetchRoute,
  checkIn: mockCheckIn,
  confirmCheckIn: mockConfirmCheckIn,
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

const AI_OK = { dogVisible: true, note: "Calm and clean." };

async function openCheckInAndUpload(file: File) {
  const user = userEvent.setup();
  const { WalkerRouteScreen } = await importScreen();
  render(<WalkerRouteScreen routeId="route-1" />);
  await screen.findByText("Firulais");
  const [firstCheckInButton] = await screen.findAllByRole("button", { name: /check in/i });
  await user.click(firstCheckInButton);
  await user.upload(screen.getByLabelText(/check-in photo/i), file);
  return user;
}

describe("Walker route screen (FR-06, FR-07, FR-10, FR-11)", () => {
  beforeEach(() => {
    mockFetchRoute.mockReset();
    mockCheckIn.mockReset();
    mockConfirmCheckIn.mockReset();
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

  it("checks in a stop: uploads the photo file and shows the auto-confirmed dog and the AI note", async () => {
    mockCheckIn.mockResolvedValueOnce({
      autoConfirmed: true,
      dogId: "dog-1",
      dogName: "Firulais",
      similarity: 0.97,
      checkinId: "c-1",
      ai: AI_OK,
    });

    const photo = makePhotoFile("stop-photo.png");
    await openCheckInAndUpload(photo);

    await waitFor(() => expect(mockCheckIn).toHaveBeenCalledWith("route-1", photo));
    expect(await screen.findByText(/checked in firulais/i)).toBeInTheDocument();
    expect(screen.getByText(/calm and clean/i)).toBeInTheDocument();
  });

  it("shows manual candidates by name with their match percentage when the match isn't confident", async () => {
    mockCheckIn.mockResolvedValueOnce({
      autoConfirmed: false,
      candidates: [
        { dogId: "dog-1", dogName: "Firulais", similarity: 0.6 },
        { dogId: "dog-2", dogName: "Rex", similarity: 0.58 },
      ],
      ai: AI_OK,
    });

    await openCheckInAndUpload(makePhotoFile("ambiguous.png"));

    expect(await screen.findByText(/which dog/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/firulais \(60% match\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/rex \(58% match\)/i)).toBeInTheDocument();
  });

  it("confirms the picked candidate through the API and then shows it as checked in", async () => {
    mockCheckIn.mockResolvedValueOnce({
      autoConfirmed: false,
      candidates: [
        { dogId: "dog-1", dogName: "Firulais", similarity: 0.6 },
        { dogId: "dog-2", dogName: "Rex", similarity: 0.58 },
      ],
      ai: AI_OK,
    });
    mockConfirmCheckIn.mockResolvedValueOnce({ dogId: "dog-2", dogName: "Rex", checkinId: "c-9" });

    const user = await openCheckInAndUpload(makePhotoFile("ambiguous.png"));
    await screen.findByText(/which dog/i);

    expect(screen.getByRole("button", { name: /confirm/i })).toBeDisabled();
    await user.click(screen.getByLabelText(/rex \(58% match\)/i));
    await user.click(screen.getByRole("button", { name: /confirm/i }));

    await waitFor(() => expect(mockConfirmCheckIn).toHaveBeenCalledWith("route-1", "dog-2"));
    expect(await screen.findByText(/checked in rex/i)).toBeInTheDocument();
  });

  it("shows the API's message when the photo is rejected", async () => {
    mockCheckIn.mockRejectedValueOnce(new Error("No dog detected in the photo."));

    await openCheckInAndUpload(makePhotoFile("tree.png"));

    expect(await screen.findByRole("alert")).toHaveTextContent(/no dog detected in the photo/i);
    expect(screen.queryByText(/checked in/i)).not.toBeInTheDocument();
  });

  it("shows an error when confirming fails", async () => {
    mockCheckIn.mockResolvedValueOnce({
      autoConfirmed: false,
      candidates: [{ dogId: "dog-1", dogName: "Firulais", similarity: 0.6 }],
      ai: AI_OK,
    });
    mockConfirmCheckIn.mockRejectedValueOnce(new Error("That dog is not on this route."));

    const user = await openCheckInAndUpload(makePhotoFile("ambiguous.png"));
    await screen.findByText(/which dog/i);
    await user.click(screen.getByLabelText(/firulais \(60% match\)/i));
    await user.click(screen.getByRole("button", { name: /confirm/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/not on this route/i);
  });

  it("undoes the most recent check-in", async () => {
    mockUndoCheckIn.mockResolvedValueOnce({ message: "Check-in undone." });

    const { WalkerRouteScreen } = await importScreen();
    const user = userEvent.setup();
    render(<WalkerRouteScreen routeId="route-1" />);

    await screen.findByText("Firulais");
    await user.click(screen.getByRole("button", { name: /undo/i }));

    await waitFor(() => expect(mockUndoCheckIn).toHaveBeenCalledWith("route-1"));
    expect(await screen.findByText(/check-in undone/i)).toBeInTheDocument();
  });

  it("shows an error when undo fails because there is nothing to undo", async () => {
    mockUndoCheckIn.mockRejectedValueOnce(new Error("No check-in found."));

    const { WalkerRouteScreen } = await importScreen();
    const user = userEvent.setup();
    render(<WalkerRouteScreen routeId="route-1" />);

    await screen.findByText("Firulais");
    await user.click(screen.getByRole("button", { name: /undo/i }));

    expect(await screen.findByText(/no check-in found/i)).toBeInTheDocument();
  });
});
