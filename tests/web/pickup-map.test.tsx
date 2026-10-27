// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  PASTO_CENTER,
  isInsidePasto,
  parsePin,
  roundCoordinate,
} from "../../apps/web/src/map/pasto.js";

// The real map of Pasto: pure geography helpers plus the PickupMap behaviour
// (click, drag, "use my location"). Leaflet itself is faked: the test drives
// the handlers the component registers.

describe("Pasto geography", () => {
  it("knows what is inside the service area", () => {
    expect(isInsidePasto(PASTO_CENTER.lat, PASTO_CENTER.lng)).toBe(true);
    expect(isInsidePasto(6.2442, -75.5812)).toBe(false); // Medellín
    expect(isInsidePasto(1.2136, -75)).toBe(false);
    expect(isInsidePasto(1.5, -77.2811)).toBe(false);
  });

  it("rounds a coordinate to six decimals", () => {
    expect(roundCoordinate(1.21361234567)).toBe(1.213612);
    expect(roundCoordinate(-77.28105)).toBe(-77.28105);
  });

  it("parses the form pin only when both fields hold a number inside Pasto", () => {
    expect(parsePin("1.2136", "-77.2811")).toEqual({ lat: 1.2136, lng: -77.2811 });
    expect(parsePin("", "-77.2811")).toBeNull();
    expect(parsePin("1.2136", " ")).toBeNull();
    expect(parsePin("abc", "-77.2811")).toBeNull();
    expect(parsePin("6.2", "-75.5")).toBeNull();
  });
});

type Handler = (event: { latlng: { lat: number; lng: number } }) => void;

const handlers: Record<string, Handler> = {};
const markerHandlers: Record<string, () => void> = {};
let markerPosition = { lat: 0, lng: 0 };
const markerSetLatLng = vi.fn();
const markerRemove = vi.fn();
const mapRemove = vi.fn();
const setView = vi.fn();

const fakeMarker = (position: [number, number]) => {
  markerPosition = { lat: position[0], lng: position[1] };
  const instance = {
    addTo: () => instance,
    on: (name: string, handler: () => void) => {
      markerHandlers[name] = handler;
      return instance;
    },
    getLatLng: () => markerPosition,
    setLatLng: (next: [number, number]) => {
      markerPosition = { lat: next[0], lng: next[1] };
      markerSetLatLng(next);
    },
    remove: markerRemove,
  };
  return instance;
};

const fakeLeaflet = {
  map: () => ({
    on: (name: string, handler: Handler) => {
      handlers[name] = handler;
    },
    setView,
    remove: mapRemove,
  }),
  tileLayer: () => ({ addTo: () => undefined }),
  divIcon: () => ({}),
  marker: fakeMarker,
} as never;

const loadLeaflet = async () => fakeLeaflet;

async function importMap() {
  return import("../../apps/web/src/map/PickupMap.js");
}

describe("PickupMap", () => {
  beforeEach(() => {
    cleanup();
    for (const key of Object.keys(handlers)) delete handlers[key];
    for (const key of Object.keys(markerHandlers)) delete markerHandlers[key];
    markerSetLatLng.mockReset();
    markerRemove.mockReset();
    mapRemove.mockReset();
    setView.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports a click inside Pasto rounded to six decimals", async () => {
    const { PickupMap } = await importMap();
    const onPick = vi.fn();
    render(<PickupMap loadLeaflet={loadLeaflet} lat="" lng="" onPick={onPick} />);

    await waitFor(() => expect(handlers.click).toBeDefined());
    handlers.click?.({ latlng: { lat: 1.21361234567, lng: -77.28105555 } });

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(1.213612, -77.281056);
  });

  it("ignores a click outside Pasto and says so", async () => {
    const { PickupMap } = await importMap();
    const onPick = vi.fn();
    render(<PickupMap loadLeaflet={loadLeaflet} lat="" lng="" onPick={onPick} />);

    await waitFor(() => expect(handlers.click).toBeDefined());
    handlers.click?.({ latlng: { lat: 6.2, lng: -75.5 } });

    expect(onPick).not.toHaveBeenCalled();
    expect(await screen.findByRole("status")).toHaveTextContent("Ese punto queda fuera de Pasto.");
  });

  it("places no pin until the form holds a valid Pasto position", async () => {
    const { PickupMap } = await importMap();
    const { rerender } = render(<PickupMap loadLeaflet={loadLeaflet} lat="" lng="" onPick={vi.fn()} />);

    await waitFor(() => expect(handlers.click).toBeDefined());
    expect(markerHandlers.dragend).toBeUndefined();

    rerender(<PickupMap loadLeaflet={loadLeaflet} lat="6.2" lng="-75.5" onPick={vi.fn()} />);
    expect(markerHandlers.dragend).toBeUndefined();

    rerender(<PickupMap loadLeaflet={loadLeaflet} lat="1.2136" lng="-77.2811" onPick={vi.fn()} />);
    await waitFor(() => expect(markerHandlers.dragend).toBeDefined());
    expect(markerPosition).toEqual({ lat: 1.2136, lng: -77.2811 });
  });

  it("moves the existing pin when the fields change and removes it when they are cleared", async () => {
    const { PickupMap } = await importMap();
    const { rerender } = render(<PickupMap loadLeaflet={loadLeaflet} lat="1.2136" lng="-77.2811" onPick={vi.fn()} />);
    await waitFor(() => expect(markerHandlers.dragend).toBeDefined());

    rerender(<PickupMap loadLeaflet={loadLeaflet} lat="1.22" lng="-77.29" onPick={vi.fn()} />);
    expect(markerSetLatLng).toHaveBeenCalledWith([1.22, -77.29]);

    rerender(<PickupMap loadLeaflet={loadLeaflet} lat="" lng="" onPick={vi.fn()} />);
    expect(markerRemove).toHaveBeenCalledTimes(1);
  });

  it("reports where the pin was dropped after a drag", async () => {
    const { PickupMap } = await importMap();
    const onPick = vi.fn();
    render(<PickupMap loadLeaflet={loadLeaflet} lat="1.2136" lng="-77.2811" onPick={onPick} />);
    await waitFor(() => expect(markerHandlers.dragend).toBeDefined());

    markerPosition = { lat: 1.2201004, lng: -77.2755004 };
    markerHandlers.dragend?.();

    expect(onPick).toHaveBeenCalledWith(1.2201, -77.2755);
  });

  it("uses the device location when it is inside Pasto", async () => {
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (success: (position: { coords: { latitude: number; longitude: number } }) => void) =>
          success({ coords: { latitude: 1.2145, longitude: -77.2799 } }),
      },
    });
    const { PickupMap } = await importMap();
    const onPick = vi.fn();
    const user = userEvent.setup();
    render(<PickupMap loadLeaflet={loadLeaflet} lat="" lng="" onPick={onPick} />);
    await waitFor(() => expect(handlers.click).toBeDefined());

    await user.click(screen.getByRole("button", { name: "Usar mi ubicación" }));

    expect(onPick).toHaveBeenCalledWith(1.2145, -77.2799);
    expect(setView).toHaveBeenCalledWith([1.2145, -77.2799], 16);
  });

  it("explains when the device is outside Pasto and keeps the pin untouched", async () => {
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (success: (position: { coords: { latitude: number; longitude: number } }) => void) =>
          success({ coords: { latitude: 4.711, longitude: -74.0721 } }),
      },
    });
    const { PickupMap } = await importMap();
    const onPick = vi.fn();
    const user = userEvent.setup();
    render(<PickupMap loadLeaflet={loadLeaflet} lat="" lng="" onPick={onPick} />);
    await waitFor(() => expect(handlers.click).toBeDefined());

    await user.click(screen.getByRole("button", { name: "Usar mi ubicación" }));

    expect(onPick).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Estás fuera de Pasto: toca el mapa para elegir el punto.",
    );
  });

  it("explains a denied location permission", async () => {
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (_success: unknown, failure: () => void) => failure(),
      },
    });
    const { PickupMap } = await importMap();
    const user = userEvent.setup();
    render(<PickupMap loadLeaflet={loadLeaflet} lat="" lng="" onPick={vi.fn()} />);
    await waitFor(() => expect(handlers.click).toBeDefined());

    await user.click(screen.getByRole("button", { name: "Usar mi ubicación" }));

    expect(screen.getByRole("status")).toHaveTextContent(
      "No pudimos obtener tu ubicación. Toca el mapa para elegir el punto.",
    );
  });

  it("recenters on Pasto", async () => {
    const { PickupMap } = await importMap();
    const user = userEvent.setup();
    render(<PickupMap loadLeaflet={loadLeaflet} lat="" lng="" onPick={vi.fn()} />);
    await waitFor(() => expect(handlers.click).toBeDefined());

    await user.click(screen.getByRole("button", { name: "Centrar en Pasto" }));

    expect(setView).toHaveBeenCalledWith([PASTO_CENTER.lat, PASTO_CENTER.lng], 14);
  });

  it("destroys the map when it unmounts", async () => {
    const { PickupMap } = await importMap();
    const { unmount } = render(<PickupMap loadLeaflet={loadLeaflet} lat="" lng="" onPick={vi.fn()} />);
    await waitFor(() => expect(handlers.click).toBeDefined());

    unmount();

    expect(mapRemove).toHaveBeenCalledTimes(1);
  });
});
