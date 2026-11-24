// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const send = vi.hoisted(() => vi.fn());
vi.mock("../../apps/web/src/lib/marketplace.js", () => ({ sendGpsPoints: send }));
import { GPS_BATCH_MS, useGpsStream } from "../../apps/web/src/walker/WalkerRoutesScreen.js";
let fix: (value: GeolocationPosition) => void;
beforeEach(() => {
  vi.useFakeTimers();
  send.mockReset();
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: {
    watchPosition(callback: typeof fix) { fix = callback; return 1; }, clearWatch: vi.fn(),
  } });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe("GPS recovery", () => {
  it("retains a failed batch and retries it in chronological order", async () => {
    send.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValue({});
    const { result } = renderHook(() => useGpsStream("walk-1", () => undefined));
    act(() => fix({ timestamp: Date.now(), coords: { latitude: 1.21, longitude: -77.28 } } as GeolocationPosition));
    await act(async () => vi.advanceTimersByTimeAsync(GPS_BATCH_MS));
    expect(result.current).toBe("retrying");
    act(() => fix({ timestamp: Date.now(), coords: { latitude: 1.22, longitude: -77.28 } } as GeolocationPosition));
    await act(async () => vi.advanceTimersByTimeAsync(GPS_BATCH_MS));
    expect(send.mock.calls[1][1].map((p: { lat: number }) => p.lat)).toEqual([1.21, 1.22]);
    expect(result.current).toBe("sharing");
  });
});
