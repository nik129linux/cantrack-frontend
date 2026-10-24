import { describe, it, expect } from "vitest";
import {
  AVENUE_JUNCTION,
  AVENUE_NORTHWEST,
  STREET_NORTHEAST,
  chain,
  headingSprite,
  makePolyline,
  offset,
  sampleAt,
} from "../../apps/web/src/city/paths.js";

// Geometry behind the animated city: sampling a polyline gives the exact
// position and heading cars and walkers use on every frame.

describe("polyline sampling", () => {
  const line = makePolyline([
    { x: 0, y: 0 },
    { x: 30, y: 40 },
    { x: 30, y: 140 },
  ]);

  it("measures cumulative and total length", () => {
    expect(line.lengths).toEqual([0, 50, 150]);
    expect(line.total).toBe(150);
  });

  it("interpolates inside the first segment and reports its heading", () => {
    expect(sampleAt(line, 25)).toEqual({ x: 15, y: 20, dx: 0.6, dy: 0.8 });
  });

  it("moves on to the next segment after a corner", () => {
    expect(sampleAt(line, 100)).toEqual({ x: 30, y: 90, dx: 0, dy: 1 });
  });

  it("clamps before the start and after the end", () => {
    expect(sampleAt(line, -10)).toEqual({ x: 0, y: 0, dx: 0.6, dy: 0.8 });
    expect(sampleAt(line, 999)).toEqual({ x: 30, y: 140, dx: 0, dy: 1 });
  });

  it("rejects a line with fewer than two points", () => {
    expect(() => makePolyline([{ x: 1, y: 1 }])).toThrow("A polyline needs at least two points.");
  });
});

describe("path helpers", () => {
  it("chains lines keeping the shared point once", () => {
    expect(
      chain(
        [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
        [
          { x: 1, y: 1 },
          { x: 2, y: 0 },
        ],
      ),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 0 },
    ]);
  });

  it("offsets every point without touching the original", () => {
    const original = [{ x: 10, y: 10 }];
    expect(offset(original, 5, -3)).toEqual([{ x: 15, y: 7 }]);
    expect(original).toEqual([{ x: 10, y: 10 }]);
  });

  it("picks the sprite variant from the horizontal heading only", () => {
    expect(headingSprite(0.8)).toBe("ne");
    expect(headingSprite(0)).toBe("ne");
    expect(headingSprite(-0.8)).toBe("nw");
  });
});

describe("city streets", () => {
  it("the avenue runs up-left and the cross street up-right", () => {
    const avenue = makePolyline(AVENUE_NORTHWEST);
    const street = makePolyline(STREET_NORTHEAST);
    expect(sampleAt(avenue, 10).dx).toBeLessThan(0);
    expect(sampleAt(avenue, 10).dy).toBeLessThan(0);
    expect(sampleAt(street, 10).dx).toBeGreaterThan(0);
    expect(sampleAt(street, 10).dy).toBeLessThan(0);
  });

  it("the cross street starts exactly at the junction of the avenue", () => {
    expect(AVENUE_NORTHWEST[AVENUE_JUNCTION]).toEqual(STREET_NORTHEAST[0]);
  });
});
