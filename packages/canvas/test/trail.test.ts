import { describe, expect, it } from "vitest";
import {
  TRAIL_FADE_MS,
  TRAIL_MAX_POINTS,
  TRAIL_MIN_WIDTH,
  TRAIL_TAPER_POINTS,
  TRAIL_WIDTH,
  Trail,
  thin,
  trailSegments,
  type TrailPoint,
} from "../src/trail.js";

/** A stroke along x, one point a diagram unit apart, one every 10 ms. */
function stroke(count: number, start = 0): TrailPoint[] {
  return Array.from({ length: count }, (_, i) => ({ x: i * 2, y: 0, t: start + i * 10 }));
}

describe("the trail's points", () => {
  it("keeps a point and drops one within half a unit of the last", () => {
    const trail = new Trail("#e03131");
    expect(trail.add({ x: 10, y: 10 }, 0)).toBe(true);
    expect(trail.add({ x: 10.2, y: 10.2 }, 5)).toBe(false);
    expect(trail.add({ x: 11, y: 10 }, 10)).toBe(true);
    expect(trail.points.map((p) => [p.x, p.y, p.t])).toEqual([
      [10, 10, 0],
      [11, 10, 10],
    ]);
  });

  it("drops the oldest points past the cap", () => {
    const trail = new Trail("#000");
    for (let i = 0; i < TRAIL_MAX_POINTS + 10; i++) trail.add({ x: i * 2, y: 0 }, i);
    expect(trail.points).toHaveLength(TRAIL_MAX_POINTS);
    expect(trail.points[0]!.t).toBe(10);
    expect(trail.points[TRAIL_MAX_POINTS - 1]!.t).toBe(TRAIL_MAX_POINTS + 9);
  });

  it("lets a point die when it has lived the fade, each from its own moment", () => {
    const trail = new Trail("#000");
    for (const p of stroke(5)) trail.add(p, p.t);
    trail.prune(TRAIL_FADE_MS - 1);
    expect(trail.points).toHaveLength(5);
    trail.prune(TRAIL_FADE_MS);
    expect(trail.points.map((p) => p.t)).toEqual([10, 20, 30, 40]);
    trail.prune(TRAIL_FADE_MS + 25);
    expect(trail.points.map((p) => p.t)).toEqual([30, 40]);
    trail.prune(TRAIL_FADE_MS + 1000);
    expect(trail.alive).toBe(false);
  });

  it("keeps every point whole with a fade of 0, and clears on request", () => {
    const trail = new Trail("#000");
    for (const p of stroke(4)) trail.add(p, p.t);
    trail.prune(1_000_000, 0);
    expect(trail.points).toHaveLength(4);
    trail.clear();
    expect(trail.points).toHaveLength(0);
  });

  it("changes colour in place", () => {
    const trail = new Trail("#111111");
    trail.colour = "#222222";
    expect(trail.colour).toBe("#222222");
  });
});

describe("what to stroke of a trail", () => {
  it("has a segment between each two points, oldest first", () => {
    const segments = trailSegments(stroke(4), 30);
    expect(segments).toHaveLength(3);
    expect(segments.map((s) => s.from.x)).toEqual([0, 2, 4]);
    expect(segments.map((s) => s.to.x)).toEqual([2, 4, 6]);
  });

  it("is nothing for one point or none", () => {
    expect(trailSegments([], 0)).toEqual([]);
    expect(trailSegments([{ x: 1, y: 1, t: 0 }], 0)).toEqual([]);
  });

  it("falls linearly from 1 to 0 over the fade, by the older point of the segment", () => {
    const points: TrailPoint[] = [
      { x: 0, y: 0, t: 0 },
      { x: 10, y: 0, t: 400 },
      { x: 20, y: 0, t: 800 },
    ];
    const [first, second] = trailSegments(points, 800);
    // The first segment's older point has lived the whole fade: gone. The second has lived half.
    expect(first!.from.x).toBe(10);
    expect(first!.opacity).toBeCloseTo(0.5, 5);
    expect(second).toBeUndefined();
    // A point made this very moment is whole.
    const fresh = trailSegments(
      [
        { x: 0, y: 0, t: 0 },
        { x: 10, y: 0, t: 0 },
      ],
      0,
    );
    expect(fresh[0]!.opacity).toBe(1);
  });

  it("leaves out a segment whose older point lived the fade", () => {
    const points = stroke(3);
    expect(trailSegments(points, TRAIL_FADE_MS)).toHaveLength(1);
    expect(trailSegments(points, TRAIL_FADE_MS + 10)).toHaveLength(0);
  });

  it("is 3 px at the newest segment and 1 px from 16 points back", () => {
    const points = stroke(40);
    const segments = trailSegments(points, 390);
    expect(segments[segments.length - 1]!.width).toBe(TRAIL_WIDTH);
    const widths = segments.map((s) => s.width);
    // Strictly thinner going back over the taper, then constant at the minimum.
    const newest = widths.slice(-TRAIL_TAPER_POINTS).reverse();
    for (let i = 1; i < newest.length; i++) expect(newest[i]!).toBeLessThan(newest[i - 1]!);
    expect(newest[newest.length - 1]).toBeCloseTo(TRAIL_MIN_WIDTH, 5);
    for (const width of widths.slice(0, -TRAIL_TAPER_POINTS)) {
      expect(width).toBeCloseTo(TRAIL_MIN_WIDTH, 5);
    }
  });

  it("is 3 px for a fresh point alone", () => {
    const [only] = trailSegments(stroke(2), 10);
    expect(only!.width).toBe(TRAIL_WIDTH);
  });

  it("draws every segment whole, at full width tapering, with a fade of 0", () => {
    const points = stroke(5);
    const segments = trailSegments(points, 1_000_000, 0);
    expect(segments).toHaveLength(4);
    expect(segments.every((s) => s.opacity === 1)).toBe(true);
  });
});

describe("a batch that replays at its own pace", () => {
  it("draws a point only once its moment has come", () => {
    const points: TrailPoint[] = [
      { x: 0, y: 0, t: 100 },
      { x: 10, y: 0, t: 150 },
      { x: 20, y: 0, t: 200 },
    ];
    expect(trailSegments(points, 99)).toEqual([]);
    expect(trailSegments(points, 100)).toEqual([]);
    expect(trailSegments(points, 150).map((s) => s.to.x)).toEqual([10]);
    expect(trailSegments(points, 200).map((s) => s.to.x)).toEqual([10, 20]);
  });

  it("keeps a point that is not due yet through a prune", () => {
    const trail = new Trail("#000");
    trail.add({ x: 0, y: 0 }, 1000);
    trail.add({ x: 5, y: 0 }, 1200);
    trail.prune(900);
    expect(trail.points).toHaveLength(2);
  });
});

describe("thinning a batch", () => {
  it("keeps a short list as it is", () => {
    expect(thin([1, 2, 3], 64)).toEqual([1, 2, 3]);
  });

  it("keeps at most the limit, the first and the last included, in order", () => {
    const items = Array.from({ length: 1000 }, (_, i) => i);
    const kept = thin(items, 64);
    expect(kept).toHaveLength(64);
    expect(kept[0]).toBe(0);
    expect(kept[63]).toBe(999);
    expect([...kept].sort((a, b) => a - b)).toEqual(kept);
  });

  it("copes with a limit of one or none", () => {
    expect(thin([1, 2, 3], 1)).toEqual([3]);
    expect(thin([], 1)).toEqual([]);
  });
});
