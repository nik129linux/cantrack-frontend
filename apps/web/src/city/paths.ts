/** Geometry for the animated city: polylines in island-image pixels and a
 *  sampler that returns position and heading at a given distance. */

export type Point = { x: number; y: number };

/** Size of `public/art/city/island.webp`; every coordinate below lives in it. */
export const ISLAND_SIZE = { width: 1025, height: 906 } as const;

export type Polyline = {
  points: Point[];
  /** Cumulative length at each point; `lengths[0]` is always 0. */
  lengths: number[];
  total: number;
};

export function makePolyline(points: Point[]): Polyline {
  if (points.length < 2) {
    throw new Error("A polyline needs at least two points.");
  }

  const lengths = [0];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1] as Point;
    const current = points[index] as Point;
    lengths.push((lengths[index - 1] as number) + Math.hypot(current.x - previous.x, current.y - previous.y));
  }

  return { points, lengths, total: lengths[lengths.length - 1] as number };
}

export type Sample = {
  x: number;
  y: number;
  /** Unit vector of the segment being walked. */
  dx: number;
  dy: number;
};

/** Position and heading after walking `distance` along the line (clamped to its ends). */
export function sampleAt(line: Polyline, distance: number): Sample {
  const clamped = Math.min(Math.max(distance, 0), line.total);

  let segment = 1;
  while (segment < line.points.length - 1 && (line.lengths[segment] as number) < clamped) {
    segment += 1;
  }

  const from = line.points[segment - 1] as Point;
  const to = line.points[segment] as Point;
  const start = line.lengths[segment - 1] as number;
  const span = (line.lengths[segment] as number) - start;
  const t = span === 0 ? 0 : (clamped - start) / span;

  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    dx: span === 0 ? 0 : (to.x - from.x) / span,
    dy: span === 0 ? 0 : (to.y - from.y) / span,
  };
}

/** Joins lines end to start into one (the shared point is kept once). */
export function chain(...lines: Point[][]): Point[] {
  const joined: Point[] = [];
  for (const line of lines) {
    joined.push(...(joined.length === 0 ? line : line.slice(1)));
  }
  return joined;
}

/** Moves every point sideways in screen space (used for sidewalks and lanes). */
export function offset(points: Point[], dx: number, dy: number): Point[] {
  return points.map((point) => ({ x: point.x + dx, y: point.y + dy }));
}

// One-way streets, measured on the island image. All cars drive away from the
// viewer because the car sheet only has rear views (up-left or up-right).
export const AVENUE_NORTHWEST: Point[] = [
  { x: 660, y: 738 },
  { x: 620, y: 714 },
  { x: 530, y: 650 },
  { x: 470, y: 618 },
  { x: 385, y: 572 },
  { x: 300, y: 516 },
  { x: 215, y: 462 },
  { x: 130, y: 415 },
];

export const STREET_NORTHEAST: Point[] = [
  { x: 470, y: 618 },
  { x: 530, y: 592 },
  { x: 645, y: 518 },
  { x: 735, y: 462 },
  { x: 795, y: 424 },
];

export const STREET_EAST_JOIN: Point[] = [
  { x: 885, y: 588 },
  { x: 780, y: 526 },
  { x: 735, y: 462 },
];

/** Index of the point where AVENUE_NORTHWEST meets STREET_NORTHEAST. */
export const AVENUE_JUNCTION = 3;

export type HeadingSprite = "ne" | "nw";

/** Cars only face away from the viewer: pick the variant from the horizontal heading. */
export function headingSprite(dx: number): HeadingSprite {
  return dx >= 0 ? "ne" : "nw";
}
