import type { SceneBounds } from "@meltemi/diagrams-layout";
import type { Point } from "@meltemi/diagrams-model";

export const round = (value: number): number => {
  const r = Math.round(value * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
};

export function trackLength(points: readonly Point[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    length += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
  }
  return length;
}

/** The point at `fraction` (0 to 1) of a polyline's length. */
export function pointAlong(points: readonly Point[], fraction: number): Point {
  const total = trackLength(points);
  if (total === 0) return points[0]!;
  let left = Math.min(1, Math.max(0, fraction)) * total;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const segment = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= segment || i === points.length - 1) {
      const k = segment === 0 ? 0 : Math.min(1, left / segment);
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
    left -= segment;
  }
  return points[points.length - 1]!;
}

/**
 * The line a pen draws through its points, as points: from the first, a quadratic curve to the
 * midpoint of each inner point and the next, with the inner point as its control, then straight
 * to the last, as the layout writes a pen's path (`penPath`). Each curve is sampled every 4 px of
 * its control polygon, at most 12 times; fewer than three points are the points themselves.
 */
export function smoothTrack(points: readonly Point[]): Point[] {
  const at = (p: Point): Point => ({ x: round(p.x), y: round(p.y) });
  if (points.length < 3) return points.map(at);
  const out: Point[] = [at(points[0]!)];
  let from = points[0]!;
  for (let i = 1; i < points.length - 1; i++) {
    const control = points[i]!;
    const next = points[i + 1]!;
    const to = { x: (control.x + next.x) / 2, y: (control.y + next.y) / 2 };
    const reach =
      Math.hypot(control.x - from.x, control.y - from.y) +
      Math.hypot(to.x - control.x, to.y - control.y);
    const steps = Math.min(12, Math.max(1, Math.ceil(reach / 4)));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const u = 1 - t;
      out.push(
        at({
          x: u * u * from.x + 2 * u * t * control.x + t * t * to.x,
          y: u * u * from.y + 2 * u * t * control.y + t * t * to.y,
        }),
      );
    }
    from = to;
  }
  out.push(at(points[points.length - 1]!));
  return out;
}

/** An SVG path through the points: `M x y L x y …`. */
export function trackPath(points: readonly Point[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${round(p.x)} ${round(p.y)}`).join(" ");
}

/** A circle as a path, so scenes need no circle primitive. */
export function circlePath(cx: number, cy: number, r: number): string {
  const R = round(r);
  return `M${round(cx - r)} ${round(cy)} a${R} ${R} 0 1 0 ${round(2 * r)} 0 a${R} ${R} 0 1 0 ${round(-2 * r)} 0 Z`;
}

/** A rounded rectangle as a path, scaled by `scale` around its centre. */
export function roundedRectPath(bounds: SceneBounds, scale = 1): string {
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  const w = bounds.width * scale;
  const h = bounds.height * scale;
  const x = cx - w / 2;
  const y = cy - h / 2;
  const r = Math.min(bounds.radius * scale, w / 2, h / 2);
  if (r <= 0) {
    return `M${round(x)} ${round(y)} H${round(x + w)} V${round(y + h)} H${round(x)} Z`;
  }
  return [
    `M${round(x + r)} ${round(y)}`,
    `H${round(x + w - r)}`,
    `A${round(r)} ${round(r)} 0 0 1 ${round(x + w)} ${round(y + r)}`,
    `V${round(y + h - r)}`,
    `A${round(r)} ${round(r)} 0 0 1 ${round(x + w - r)} ${round(y + h)}`,
    `H${round(x + r)}`,
    `A${round(r)} ${round(r)} 0 0 1 ${round(x)} ${round(y + h - r)}`,
    `V${round(y + r)}`,
    `A${round(r)} ${round(r)} 0 0 1 ${round(x + r)} ${round(y)}`,
    "Z",
  ].join(" ");
}

/**
 * The radius of a flow particle on a line of `width`: wide enough to be seen on its line in a
 * 960 × 540 GIF, the same in the CSS and the frame profiles.
 */
export function particleRadius(width: number): number {
  return Math.max(4, 1.5 * width);
}
