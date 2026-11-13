/** Distance, bearing and walking time between two points on the map. */

export type Point = { lat: number; lng: number };

/** IUGG mean earth radius in kilometres, the same one the API uses. */
const EARTH_RADIUS_KM = 6371.0088;

/** Walking speed in km/h, the same one the API uses for a leg. */
export const WALK_SPEED_KMH = 4.5;

const toRad = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle distance between two points, in kilometres. O(1). */
export function haversineKm(from: Point, to: Point): number {
  const dPhi = toRad(to.lat - from.lat);
  const dLambda = toRad(to.lng - from.lng);
  const a =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLambda / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

/** Compass bearing from one point to another, 0–360 degrees from north. O(1). */
export function bearingDeg(from: Point, to: Point): number {
  const phi1 = toRad(from.lat);
  const phi2 = toRad(to.lat);
  const dLambda = toRad(to.lng - from.lng);
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

const CARDINALS = [
  "al norte",
  "al noreste",
  "al oriente",
  "al sureste",
  "al sur",
  "al suroeste",
  "al occidente",
  "al noroccidente",
] as const;

/** The bearing as a direction anyone can follow ("al noreste"). O(1). */
export function cardinal(degrees: number): string {
  const index = Math.round((((degrees % 360) + 360) % 360) / 45) % 8;
  return CARDINALS[index]!;
}

/** Metres under a kilometre, kilometres above it ("320 m", "1,2 km"). O(1). */
export function formatDistance(km: number): string {
  if (km < 1) {
    return `${Math.max(0, Math.round((km * 1000) / 10) * 10)} m`;
  }
  return `${km.toFixed(1).replace(".", ",")} km`;
}

/** Minutes on foot for a distance, never below one. O(1). */
export function walkMinutes(km: number): number {
  return Math.max(1, Math.round((km / WALK_SPEED_KMH) * 60));
}

/** Index of the path vertex closest to a point. O(n). */
export function nearestIndex(path: Point[], point: Point): number {
  let best = 0;
  let bestKm = Infinity;
  for (let index = 0; index < path.length; index += 1) {
    const km = haversineKm(path[index]!, point);
    if (km < bestKm) {
      bestKm = km;
      best = index;
    }
  }
  return best;
}

/** Length of a path between two vertex indexes, in kilometres. O(n). */
export function pathKm(path: Point[], fromIndex: number, toIndex: number): number {
  let total = 0;
  for (let index = Math.max(0, fromIndex); index < Math.min(toIndex, path.length - 1); index += 1) {
    total += haversineKm(path[index]!, path[index + 1]!);
  }
  return total;
}

/** A point `fraction` of the way from one point to another. O(1). */
export function lerpPoint(from: Point, to: Point, fraction: number): Point {
  return {
    lat: from.lat + (to.lat - from.lat) * fraction,
    lng: from.lng + (to.lng - from.lng) * fraction,
  };
}
