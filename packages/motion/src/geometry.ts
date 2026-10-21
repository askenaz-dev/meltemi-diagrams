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

/** The radius of a flow particle on a line of `width`. */
export function particleRadius(width: number): number {
  return Math.max(3, width + 1.5);
}
