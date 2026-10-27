/** Pasto, the fallback pickup and weather point. */
export const PASTO = { lat: 1.2136, lng: -77.2811 } as const;

const KEY = "cantrack.homePoint";

export type Point = { lat: number; lng: number };

/**
 * The owner's saved home point (written by Perfil), else Pasto. It is kept in
 * localStorage only so Inicio and Explorar can start without another call;
 * the source of truth stays `GET /owners/{id}/profile`.
 */
export function readHomePoint(): Point {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw) as Partial<Point>;
      if (typeof parsed.lat === "number" && typeof parsed.lng === "number") {
        return { lat: parsed.lat, lng: parsed.lng };
      }
    }
  } catch {
    // Storage blocked or a corrupt value: fall through to Pasto.
  }
  return PASTO;
}

export function saveHomePoint(point: Point | null): void {
  try {
    if (point === null) {
      window.localStorage.removeItem(KEY);
    } else {
      window.localStorage.setItem(KEY, JSON.stringify(point));
    }
  } catch {
    // Not critical.
  }
}
