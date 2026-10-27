/** Geography of the real map: Pasto, Nariño (Colombia). */

export const PASTO_CENTER = { lat: 1.2136, lng: -77.2811 } as const;

/** Service area: the urban area of Pasto and its surroundings. */
export const PASTO_BOUNDS = {
  south: 1.12,
  west: -77.36,
  north: 1.3,
  east: -77.2,
} as const;

export const MAP_ZOOM = { start: 14, min: 12, max: 19 } as const;

export function isInsidePasto(lat: number, lng: number): boolean {
  return (
    lat >= PASTO_BOUNDS.south &&
    lat <= PASTO_BOUNDS.north &&
    lng >= PASTO_BOUNDS.west &&
    lng <= PASTO_BOUNDS.east
  );
}

/** Six decimals is about 11 cm, plenty for a pickup pin. */
export function roundCoordinate(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/** Reads the form's text fields; null unless both are numbers inside Pasto. */
export function parsePin(lat: string, lng: string): { lat: number; lng: number } | null {
  if (lat.trim() === "" || lng.trim() === "") {
    return null;
  }
  const latValue = Number(lat);
  const lngValue = Number(lng);
  if (Number.isNaN(latValue) || Number.isNaN(lngValue) || !isInsidePasto(latValue, lngValue)) {
    return null;
  }
  return { lat: latValue, lng: lngValue };
}
