// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

// Rutas draws the day as one line along the streets (me -> stop -> stop), not
// a straight line between pins. If the street line cannot be had, the old
// pin-to-pin trail stays so the map is never empty.

const mockRoute = vi.fn();
const mockPath = vi.fn();
const lastMapProps: { current: Record<string, unknown> } = { current: {} };

vi.mock("../../apps/web/src/lib/marketplace.js", () => ({
  fetchDayRoute: mockRoute,
  fetchDayRoutePath: mockPath,
  fetchWalkDetail: vi.fn(),
  checkInWalk: vi.fn(),
  checkOutWalk: vi.fn(),
  sendGpsPoints: vi.fn(),
  walkerCancelWalk: vi.fn(),
  fetchWalkingRoute: vi.fn().mockRejectedValue(new Error("no")),
  markEnRoute: vi.fn(),
  sendHeartbeat: vi.fn().mockResolvedValue({}),
}));
vi.mock("../../apps/web/src/map/MarkersMap.js", () => ({
  MarkersMap: (props: Record<string, unknown>) => {
    lastMapProps.current = props;
    return <div data-testid="map" />;
  },
}));
vi.mock("../../apps/web/src/walker/OnlinePill.js", () => ({ OnlinePill: () => null }));

function dayRoute() {
  return {
    date: "2026-10-05",
    start: { lat: 1.2136, lng: -77.2811 },
    stops: [
      { requestId: "p11", dogName: "Luna", status: "assigned", requestedTime: "2026-10-05T16:00:00+00:00",
        pickupLat: 1.215, pickupLng: -77.279, legKm: 0.3, legMinutes: 4, legSource: "straight" },
      { requestId: "p15", dogName: "Max", status: "assigned", requestedTime: "2026-10-05T20:00:00+00:00",
        pickupLat: 1.22, pickupLng: -77.27, legKm: 1.1, legMinutes: 14, legSource: "straight" },
    ],
    totalKm: 1.4, totalMinutes: 18, nextStopId: "p11", overdue: [], active: null,
  };
}

const LINE = [[1.2136, -77.2811], [1.2125, -77.28], [1.215, -77.279], [1.22, -77.27]];

async function open() {
  const { WalkerRoutesScreen } = await import("../../apps/web/src/walker/WalkerRoutesScreen.js");
  render(<WalkerRoutesScreen userId="walker-1" />);
  await screen.findByTestId("map");
}

beforeEach(() => {
  lastMapProps.current = {};
  mockRoute.mockReset().mockResolvedValue(dayRoute());
  mockPath.mockReset().mockResolvedValue({ source: "osrm", distanceKm: 1.9, minutes: 25, geometry: LINE });
});
afterEach(cleanup);

describe("Rutas map", () => {
  it("draws the street line of the day", async () => {
    await open();
    await waitFor(() => expect(lastMapProps.current.path).toEqual(LINE));
    expect(lastMapProps.current.pathStraight).toBeFalsy();
  });

  it("asks for the line of the day on screen", async () => {
    await open();
    await waitFor(() => expect(mockPath).toHaveBeenCalledWith("walker-1", expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)));
  });

  it("marks a straight fallback so it is drawn dashed", async () => {
    mockPath.mockResolvedValue({ source: "straight", distanceKm: 1.4, minutes: 19, geometry: LINE });
    await open();
    await waitFor(() => expect(lastMapProps.current.path).toEqual(LINE));
    expect(lastMapProps.current.pathStraight).toBe(true);
  });

  it("keeps the pin-to-pin trail when the line cannot be had", async () => {
    mockPath.mockRejectedValue(new Error("down"));
    await open();
    await waitFor(() => expect(mockPath).toHaveBeenCalled());
    expect(lastMapProps.current.path ?? null).toBeNull();
    expect(lastMapProps.current.connect).toBe(true);
  });

  it("draws no line once every walk of the day is done", async () => {
    const done = dayRoute();
    done.stops = done.stops.map((stop) => ({ ...stop, status: "done" }));
    mockRoute.mockResolvedValue(done);
    mockPath.mockResolvedValue({ source: "straight", distanceKm: 0, minutes: 0, geometry: [] });
    await open();
    await waitFor(() => expect(mockPath).toHaveBeenCalled());
    await waitFor(() => expect(lastMapProps.current.connect).toBe(false));
    expect(lastMapProps.current.path ?? null).toBeNull();
  });

  it("no straight line to finished walks even when the street line fails", async () => {
    const done = dayRoute();
    done.stops = done.stops.map((stop) => ({ ...stop, status: "done" }));
    mockRoute.mockResolvedValue(done);
    mockPath.mockRejectedValue(new Error("down"));
    await open();
    await waitFor(() => expect(mockPath).toHaveBeenCalled());
    expect(lastMapProps.current.connect).toBe(false);
    expect(lastMapProps.current.path ?? null).toBeNull();
  });

  it("an empty line (fewer than two points) is not drawn", async () => {
    mockPath.mockResolvedValue({ source: "straight", distanceKm: 0, minutes: 0, geometry: [] });
    await open();
    await waitFor(() => expect(mockPath).toHaveBeenCalled());
    expect(lastMapProps.current.path ?? null).toBeNull();
  });
});
