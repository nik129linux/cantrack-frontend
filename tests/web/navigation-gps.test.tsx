// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const route = vi.hoisted(() => vi.fn());
vi.mock("../../apps/web/src/lib/marketplace.js", () => ({
  fetchWalkingRoute: route, markEnRoute: vi.fn(), sendHeartbeat: vi.fn(),
}));
vi.mock("../../apps/web/src/map/MarkersMap.js", () => ({
  MarkersMap: ({ connect, path }: { connect: boolean; path: unknown[] | null }) =>
    <div data-testid="map" data-connect={String(connect)} data-points={path?.length ?? 0} />,
}));
import { NavPanel } from "../../apps/web/src/walker/NavPanel.js";

let emit: (p: GeolocationPosition) => void;
const position = (latitude = 1.212, longitude = -77.283) =>
  ({ coords: { latitude, longitude } }) as GeolocationPosition;
const target = { requestId: "r1", dogName: "Luna", lat: 1.22, lng: -77.29 };
const streets = {
  source: "osrm", distanceKm: 1.2, minutes: 18,
  geometry: [[1.212, -77.283], [1.215, -77.283], [1.22, -77.29]],
  steps: [{ text: "Sigue por Calle 22", distanceM: 400, startIndex: 0 }],
};
beforeEach(() => {
  route.mockReset();
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: {
    watchPosition: (callback: typeof emit) => { emit = callback; callback(position()); return 1; },
    clearWatch: vi.fn(),
  } });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("GPS and pending street directions", () => {
  it("keeps a pending street response when a new GPS fix arrives", async () => {
    let resolve!: (value: typeof streets) => void;
    route.mockReturnValue(new Promise((done) => { resolve = done; }));
    render(<NavPanel walkerId="w1" target={target} onClose={() => undefined} />);
    await waitFor(() => expect(route).toHaveBeenCalledTimes(1));
    act(() => emit(position(1.212001, -77.283001)));
    await act(async () => resolve(streets));
    expect(await screen.findByRole("list", { name: "Indicaciones" })).toHaveTextContent("Sigue por Calle 22");
    expect(screen.getByTestId("map")).toHaveAttribute("data-points", "3");
    expect(route).toHaveBeenCalledTimes(1);
  });

  it("does not draw a direct line and retries without requiring movement", async () => {
    vi.useFakeTimers();
    route.mockResolvedValueOnce({ ...streets, source: "straight", geometry: [], steps: [] }).mockResolvedValue(streets);
    render(<NavPanel walkerId="w1" target={target} onClose={() => undefined} />);
    await act(async () => {});
    expect(screen.getByTestId("map")).toHaveAttribute("data-connect", "false");
    act(() => emit(position(1.212002, -77.283002)));
    await act(async () => {});
    expect(route).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(15_000));
    expect(route).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("list", { name: "Indicaciones" })).toBeInTheDocument();
  });

  it("ignores an old destination's response after selecting another pickup", async () => {
    let resolveOld!: (value: typeof streets) => void;
    route.mockReturnValueOnce(new Promise((done) => { resolveOld = done; }))
      .mockResolvedValue({ ...streets, steps: [{ text: "Nueva recogida por Carrera 10", distanceM: 80, startIndex: 0 }] });
    const view = render(<NavPanel walkerId="w1" target={target} onClose={() => undefined} />);
    await waitFor(() => expect(route).toHaveBeenCalledTimes(1));
    view.rerender(<NavPanel walkerId="w1" target={{ ...target, requestId: "r2", lat: 1.23 }} onClose={() => undefined} />);
    await screen.findByText("Nueva recogida por Carrera 10");
    await act(async () => resolveOld(streets));
    expect(screen.getByRole("list", { name: "Indicaciones" })).toHaveTextContent("Nueva recogida por Carrera 10");
    expect(screen.queryByText("Sigue por Calle 22")).toBeNull();
  });
});
