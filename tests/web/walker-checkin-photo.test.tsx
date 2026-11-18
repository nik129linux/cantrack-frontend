// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// "Iniciar paseo" opens a sheet where the walker may take a photo of the dog.
// The server compares it with the owner's reference photos and answers
// ai.match; the AI only advises, so the walk always starts.

const mockRoute = vi.fn();
const mockCheckIn = vi.fn();
const RESIZED = new Blob(["small"], { type: "image/jpeg" });

vi.mock("../../apps/web/src/lib/marketplace.js", () => ({
  fetchDayRoute: mockRoute,
  fetchDayRoutePath: vi.fn().mockRejectedValue(new Error("no street line in this test")),
  fetchWalkDetail: vi.fn(),
  checkInWalk: mockCheckIn,
  checkOutWalk: vi.fn(),
  sendGpsPoints: vi.fn(),
  walkerCancelWalk: vi.fn(),
  fetchWalkingRoute: vi.fn().mockRejectedValue(new Error("no")),
  markEnRoute: vi.fn(),
  sendHeartbeat: vi.fn().mockResolvedValue({}),
}));
vi.mock("../../apps/web/src/lib/image.js", () => ({ resizeImage: vi.fn().mockResolvedValue(RESIZED) }));
vi.mock("../../apps/web/src/map/MarkersMap.js", () => ({ MarkersMap: () => <div data-testid="map" /> }));
vi.mock("../../apps/web/src/walker/OnlinePill.js", () => ({ OnlinePill: () => null }));

function dayRoute() {
  return {
    date: "2026-10-25",
    start: { lat: 1.214, lng: -77.2811 },
    stops: [
      { requestId: "b2", dogName: "Luna", status: "assigned", requestedTime: "2026-10-25T16:00:00+00:00",
        pickupLat: 1.22, pickupLng: -77.29, legKm: 1, legMinutes: 9, legSource: "straight" },
    ],
    totalKm: 1, totalMinutes: 9, nextStopId: "b2", overdue: [], active: null,
  };
}

async function openSheet() {
  const { WalkerRoutesScreen } = await import("../../apps/web/src/walker/WalkerRoutesScreen.js");
  const user = userEvent.setup();
  render(<WalkerRoutesScreen userId="walker-1" />);
  const next = await screen.findByRole("region", { name: "Siguiente parada" });
  await user.click(within(next).getByRole("button", { name: "Iniciar paseo de Luna" }));
  const sheet = await screen.findByRole("region", { name: "Iniciar paseo con Luna" });
  return { user, sheet };
}

async function startWithPhoto(ai: { match: string; similarity: number | null }) {
  mockCheckIn.mockResolvedValue({ id: "b2", status: "in_walk", walkerId: "walker-1", ai });
  const { user, sheet } = await openSheet();
  const input = within(sheet).getByLabelText("Foto de Luna");
  expect(input).toHaveAttribute("accept", "image/*");
  expect(input).toHaveAttribute("capture", "environment");
  await user.upload(input, new File(["raw"], "luna.jpg", { type: "image/jpeg" }));
  await user.click(within(sheet).getByRole("button", { name: "Iniciar paseo" }));
  await waitFor(() => expect(mockCheckIn).toHaveBeenCalledWith("b2", RESIZED));
  expect(await screen.findByText(/Paseo con Luna iniciado/)).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Iniciar paseo con Luna" })).not.toBeInTheDocument();
  return user;
}

beforeEach(() => {
  mockRoute.mockReset().mockResolvedValue(dayRoute());
  mockCheckIn.mockReset();
});
afterEach(cleanup);

describe("Check-in photo", () => {
  it("starts without a photo and shows no AI result", async () => {
    mockCheckIn.mockResolvedValue({ id: "b2", status: "in_walk", walkerId: "walker-1" });
    const { user, sheet } = await openSheet();
    expect(within(sheet).getByRole("button", { name: "Iniciar paseo" })).toBeDisabled();

    await user.click(within(sheet).getByRole("button", { name: "Iniciar sin foto" }));
    await waitFor(() => expect(mockCheckIn).toHaveBeenCalledWith("b2"));
    expect(await screen.findByText(/Paseo con Luna iniciado/)).toBeInTheDocument();
    expect(screen.queryByText(/Es Luna/)).not.toBeInTheDocument();
    expect(screen.queryByText(/No estamos seguros/)).not.toBeInTheDocument();
  });

  it("match: a green confirmation, never the score as a percentage", async () => {
    await startWithPhoto({ match: "match", similarity: 0.9312 });
    expect(screen.getByText("Es Luna ✓")).toBeInTheDocument();
    expect(screen.queryByText(/%|0\.93|93/)).not.toBeInTheDocument();
  });

  it("uncertain: a warning to check by eye that only closes itself", async () => {
    const user = await startWithPhoto({ match: "uncertain", similarity: 0.71 });
    const warning = screen.getByRole("alert");
    expect(warning).toHaveTextContent("No estamos seguros de que sea Luna. Confírmalo a ojo.");
    expect(screen.queryByText(/%|0\.71|71/)).not.toBeInTheDocument();

    await user.click(within(warning).getByRole("button", { name: "Sí, es Luna" }));
    expect(screen.queryByText(/No estamos seguros/)).not.toBeInTheDocument();
    expect(screen.getByText(/Paseo con Luna iniciado/)).toBeInTheDocument();
    expect(mockCheckIn).toHaveBeenCalledTimes(1);
  });

  it("unknown: a neutral note that the dog has no reference photos", async () => {
    await startWithPhoto({ match: "unknown", similarity: null });
    expect(screen.getByText("Luna no tiene fotos de referencia todavía.")).toBeInTheDocument();
  });

  it("unavailable: no error, the walk just starts", async () => {
    await startWithPhoto({ match: "unavailable", similarity: null });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(/Es Luna|No estamos seguros|fotos de referencia/)).not.toBeInTheDocument();
  });

  it("a network failure keeps the sheet open with the usual error", async () => {
    mockCheckIn.mockRejectedValue(new TypeError("Failed to fetch"));
    const { user, sheet } = await openSheet();
    await user.click(within(sheet).getByRole("button", { name: "Iniciar sin foto" }));
    expect(await screen.findByRole("alert")).toHaveClass("wg__warn");
    expect(screen.getByRole("region", { name: "Iniciar paseo con Luna" })).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Iniciar sin foto" })).toBeEnabled();
  });
});
