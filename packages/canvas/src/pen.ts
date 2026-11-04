import type { Box, Handle, Point } from "@meltemi/diagrams-editor/canvas";

/**
 * The pure geometry of the pen, the highlighter and the eraser: the path a stroke is drawn with,
 * the simplification of the raw pointer positions at the release, and the distances the eraser
 * hits strokes by. Nothing here touches the page.
 */

/** A number as the scene writes it: to hundredths. */
const hundredths = (value: number): number => Math.round(value * 100) / 100;

/**
 * The path of a stroke through its points, as the layout draws a pen (`penPath`): `M p0`, then for
 * every inner point a quadratic curve to the midpoint between it and the next one with the point as
 * its control, then `L p_last`. Two points are one segment and one point is `M p0 L p0`, which a
 * round cap draws as a dot. The stroke in progress is drawn with it, so it looks as it will be
 * written.
 */
export function penPathOf(points: readonly Point[]): string {
  const at = (p: Point) => `${hundredths(p.x)} ${hundredths(p.y)}`;
  const first = points[0];
  if (first === undefined) return "";
  let d = `M ${at(first)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i]!;
    const next = points[i + 1]!;
    d += ` Q ${at(p)} ${at({ x: (p.x + next.x) / 2, y: (p.y + next.y) / 2 })}`;
  }
  return `${d} L ${at(points[points.length - 1]!)}`;
}

/** The distance from `p` to the segment from `a` to `b`. */
export function pointToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t =
    length === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Whether the segments `a`–`b` and `c`–`d` cross or touch. */
function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const side = (p: Point, q: Point, r: Point) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = side(c, d, a);
  const d2 = side(c, d, b);
  const d3 = side(a, b, c);
  const d4 = side(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** The distance between the segments `a`–`b` and `c`–`d`: 0 when they cross. */
export function segmentToSegment(a: Point, b: Point, c: Point, d: Point): number {
  if (segmentsCross(a, b, c, d)) return 0;
  return Math.min(
    pointToSegment(a, c, d),
    pointToSegment(b, c, d),
    pointToSegment(c, a, b),
    pointToSegment(d, a, b),
  );
}

/**
 * Ramer–Douglas–Peucker: the fewest points of `points`, its first and last kept, from which no
 * dropped point lies further than `tolerance` (in the points' units). A stroke drawn zoomed in
 * keeps its detail and one drawn zoomed out does not carry a point per pixel, since the canvas
 * gives a tolerance of 0.75 screen pixels in diagram units.
 */
export function simplifyStroke(points: readonly Point[], tolerance: number): Point[] {
  if (points.length <= 2) return [...points];
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  // An explicit stack: a long stroke would go too deep for recursion.
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    let farthest = -1;
    let distance = tolerance;
    for (let i = first + 1; i < last; i++) {
      const d = pointToSegment(points[i]!, points[first]!, points[last]!);
      if (d > distance) {
        distance = d;
        farthest = i;
      }
    }
    if (farthest < 0) continue;
    keep[farthest] = 1;
    stack.push([first, farthest], [farthest, last]);
  }
  return points.filter((_, i) => keep[i] === 1);
}

/** A coordinate to a tenth, as a pen statement writes it (`-0` written as `0`). */
const tenth = (value: number): number => Math.round(value * 10) / 10 || 0;

/**
 * The points of a stroke as `createPen` sends them: each to a tenth, a point that repeats the one
 * before it dropped; a stroke whose points all coincide is one point, a dot.
 */
export function tenthPoints(points: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const q = { x: tenth(p.x), y: tenth(p.y) };
    const last = out[out.length - 1];
    if (last && last.x === q.x && last.y === q.y) continue;
    out.push(q);
  }
  return out;
}

/** How many straight pieces each quadratic curve of a stroke is sampled with for hit tests. */
const CURVE_STEPS = 8;

/**
 * The midpoint chain of `penPathOf` as a polyline, each curve sampled in `CURVE_STEPS` pieces: what
 * the eraser measures its distance to. One point is itself.
 */
export function strokeSamples(points: readonly Point[]): Point[] {
  const first = points[0];
  if (first === undefined) return [];
  if (points.length <= 2) return [...points];
  const out: Point[] = [first];
  let from = first;
  for (let i = 1; i < points.length - 1; i++) {
    const control = points[i]!;
    const next = points[i + 1]!;
    const to = { x: (control.x + next.x) / 2, y: (control.y + next.y) / 2 };
    for (let step = 1; step <= CURVE_STEPS; step++) {
      const t = step / CURVE_STEPS;
      const u = 1 - t;
      out.push({
        x: u * u * from.x + 2 * u * t * control.x + t * t * to.x,
        y: u * u * from.y + 2 * u * t * control.y + t * t * to.y,
      });
    }
    from = to;
  }
  out.push(points[points.length - 1]!);
  return out;
}

/**
 * The distance from the eraser's sweep (the segment from where the pointer was to where it is,
 * one point for a press) to a sampled stroke: the eraser misses nothing between two moves.
 */
export function sweepDistance(from: Point, to: Point, samples: readonly Point[]): number {
  if (samples.length === 0) return Infinity;
  if (samples.length === 1) return pointToSegment(samples[0]!, from, to);
  let best = Infinity;
  for (let i = 1; i < samples.length; i++) {
    best = Math.min(best, segmentToSegment(from, to, samples[i - 1]!, samples[i]!));
    if (best === 0) return 0;
  }
  return best;
}

/** The least extent a resize handle leaves a stroke's points along an axis, in diagram units. */
const LEAST_EXTENT = 4;

/**
 * The bounds a resize handle gives a selected stroke: `bounds` (the box of its points grown by half
 * its `width`) with the edges of `handle` moved by `delta`, the opposite side or corner kept where
 * it is. The points' box keeps at least 4 units along an axis it spans (or what it had, when that
 * was less), so it never folds over; an axis it does not span (a level or upright stroke, a dot)
 * keeps its size, since scaling cannot stretch it. With `keep` (Shift) both axes take one factor:
 * a corner's from the axis that changed most, a side's from its own axis, the other axis about its
 * middle. Nothing is snapped: a stroke goes where the hand puts it, as when it is moved.
 */
export function penResize(
  bounds: Box,
  width: number,
  handle: Handle,
  delta: Point,
  keep: boolean,
): Box {
  const half = width / 2;
  const inner = {
    x: bounds.x + half,
    y: bounds.y + half,
    width: Math.max(0, bounds.width - width),
    height: Math.max(0, bounds.height - width),
  };
  const east = handle.includes("e");
  const west = handle.includes("w");
  const south = handle.includes("s");
  const north = handle.includes("n");
  /** The smallest factor an extent may be scaled by; none for an axis the stroke does not span. */
  const least = (size: number) => (size > 0 ? Math.min(LEAST_EXTENT, size) / size : 0);
  /** The factor of an extent whose far edge moved by `moved`. */
  const factor = (size: number, moved: number) =>
    size > 0 ? Math.max(least(size), (size + moved) / size) : 1;
  let fx = east ? factor(inner.width, delta.x) : west ? factor(inner.width, -delta.x) : 1;
  let fy = south ? factor(inner.height, delta.y) : north ? factor(inner.height, -delta.y) : 1;
  if (keep) {
    const across = (east || west) && inner.width > 0;
    const down = (north || south) && inner.height > 0;
    let chosen = 1;
    if (across && down) chosen = Math.abs(fx - 1) >= Math.abs(fy - 1) ? fx : fy;
    else if (across) chosen = fx;
    else if (down) chosen = fy;
    const f = Math.max(chosen, least(inner.width), least(inner.height));
    fx = inner.width > 0 ? f : 1;
    fy = inner.height > 0 ? f : 1;
  }
  const w = inner.width * fx;
  const h = inner.height * fy;
  const x = west ? inner.x + inner.width - w : east ? inner.x : inner.x + (inner.width - w) / 2;
  const y = north ? inner.y + inner.height - h : south ? inner.y : inner.y + (inner.height - h) / 2;
  return { x: x - half, y: y - half, width: w + width, height: h + width };
}

/** Whether the sweep from `from` to `to`, grown by `reach`, can touch `box` at all. */
export function sweepTouches(from: Point, to: Point, reach: number, box: Box): boolean {
  return (
    Math.max(from.x, to.x) + reach >= box.x &&
    Math.min(from.x, to.x) - reach <= box.x + box.width &&
    Math.max(from.y, to.y) + reach >= box.y &&
    Math.min(from.y, to.y) - reach <= box.y + box.height
  );
}
