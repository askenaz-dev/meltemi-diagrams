import type { Point } from "@meltemi/diagrams-model";
import { polygonPath } from "./geometry.js";
import type { SceneItem } from "./scene.js";
import type { ArrowheadKind } from "./theme.js";

/** A piece of a head: a filled or outlined polygon, a stroked polyline, or a circle. */
export type MarkerPart =
  | { readonly kind: "polygon"; readonly points: readonly Point[]; readonly filled: boolean }
  | { readonly kind: "polyline"; readonly points: readonly Point[] }
  | {
      readonly kind: "circle";
      readonly center: Point;
      readonly r: number;
      readonly filled: boolean;
    };

export interface EndMarker {
  /** The line, ending where the head needs it. */
  readonly line: Point[];
  /** The head's pieces, in the order they are drawn. */
  readonly parts: MarkerPart[];
}

/** The heads of both ends of a line, and the line between them. */
export interface RelationEnds {
  readonly line: Point[];
  readonly start: MarkerPart[];
  readonly end: MarkerPart[];
}

/** Steps of the curve that replaces a bend when corners are rounded. */
const SAMPLES_PER_CORNER = 8;
/** How far a rounded corner starts from its bend, along each segment, at most. */
export const CORNER_RADIUS = 10;

function samePoint(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;
}

function lineLength(points: readonly Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
  }
  return total;
}

/**
 * The line shortened by `by` at its end, along its last segment; when that segment is shorter,
 * the line ends at its previous point, as the triangle head always did.
 */
function trimEnd(points: readonly Point[], by: number): Point[] {
  if (by <= 0 || points.length < 2) return [...points];
  const tip = points[points.length - 1]!;
  const from = points[points.length - 2]!;
  const segment = Math.hypot(tip.x - from.x, tip.y - from.y);
  const line = points.slice(0, -1);
  if (segment > by) {
    const k = (segment - by) / segment;
    line.push({ x: from.x + (tip.x - from.x) * k, y: from.y + (tip.y - from.y) * k });
  } else {
    line.push(from);
  }
  return line;
}

/** How far back from its tip a head of a kind reaches along its line, for the arrow size `length`. */
export function markerReach(kind: ArrowheadKind, length: number): number {
  switch (kind) {
    case "none":
      return 0;
    case "diamond":
    case "diamondOutline":
      return 1.5 * length;
    case "oneOrMany":
      return 1.3 * length;
    case "zeroOrOne":
    case "zeroOrMany":
      return 1.9 * length;
    default:
      return length;
  }
}

/**
 * The head of kind `kind` at the last point of `points`, in a frame where `length` is the theme's
 * arrow size and `width` the base of a triangle, and the line trimmed where the head needs it:
 * filled and outlined shapes stop the line at their back, so nothing shows through an outline.
 */
export function endMarker(
  points: readonly Point[],
  kind: ArrowheadKind,
  length: number,
  width: number,
): EndMarker {
  if (kind === "none" || points.length < 1) return { line: [...points], parts: [] };
  const tip = points[points.length - 1]!;
  let from = points[points.length - 2] ?? { x: tip.x, y: tip.y - 1 };
  if (samePoint(from, tip)) from = { x: tip.x, y: tip.y - 1 };
  const distance = Math.hypot(tip.x - from.x, tip.y - from.y);
  const ux = (tip.x - from.x) / distance;
  const uy = (tip.y - from.y) / distance;
  // `back` along the line from the tip, `side` across it.
  const at = (back: number, side: number): Point => ({
    x: tip.x - ux * back - uy * side,
    y: tip.y - uy * back + ux * side,
  });
  const L = length;
  const W = width;
  const r = 0.45 * L;
  const bar = (back: number): MarkerPart => ({
    kind: "polyline",
    points: [at(back, 0.6 * W), at(back, -0.6 * W)],
  });
  const crowsFoot: MarkerPart = {
    kind: "polyline",
    points: [at(0, 0.6 * W), at(L, 0), at(0, -0.6 * W)],
  };
  const stem: MarkerPart = { kind: "polyline", points: [at(L, 0), tip] };
  const circle = (back: number, filled: boolean): MarkerPart => ({
    kind: "circle",
    center: at(back, 0),
    r,
    filled,
  });
  switch (kind) {
    case "triangle":
    case "triangleOutline":
      return {
        line: trimEnd(points, L),
        parts: [
          {
            kind: "polygon",
            points: [tip, at(L, W / 2), at(L, -W / 2)],
            filled: kind === "triangle",
          },
        ],
      };
    case "open":
      return {
        line: [...points],
        parts: [{ kind: "polyline", points: [at(L, W / 2), tip, at(L, -W / 2)] }],
      };
    case "diamond":
    case "diamondOutline": {
      const D = 1.5 * L;
      return {
        line: trimEnd(points, D),
        parts: [
          {
            kind: "polygon",
            points: [tip, at(D / 2, W / 2), at(D, 0), at(D / 2, -W / 2)],
            filled: kind === "diamond",
          },
        ],
      };
    }
    case "circle":
    case "circleOutline":
      return { line: trimEnd(points, 2 * r), parts: [circle(r, kind === "circle")] };
    case "bar":
      return { line: [...points], parts: [bar(L / 2)] };
    case "cross": {
      const c = 0.6 * L;
      return {
        line: [...points],
        parts: [
          { kind: "polyline", points: [at(c - W / 2, W / 2), at(c + W / 2, -W / 2)] },
          { kind: "polyline", points: [at(c - W / 2, -W / 2), at(c + W / 2, W / 2)] },
        ],
      };
    }
    case "many":
      return { line: [...points], parts: [crowsFoot] };
    case "oneOrMany":
      return { line: [...points], parts: [crowsFoot, bar(1.3 * L)] };
    case "onlyOne":
      return { line: [...points], parts: [bar(L / 2), bar(L)] };
    case "zeroOrOne":
      return {
        line: trimEnd(points, L + 2 * r),
        parts: [stem, bar(L / 2), circle(L + r, false)],
      };
    case "zeroOrMany":
      return {
        line: trimEnd(points, L + 2 * r),
        parts: [stem, crowsFoot, circle(L + r, false)],
      };
  }
}

/**
 * The heads of both ends of a line and the line between them. The start head is the end head's
 * geometry on the reversed line. When the line is too short for both heads, it is kept whole.
 */
export function relationEnds(
  points: readonly Point[],
  start: ArrowheadKind,
  end: ArrowheadKind,
  length: number,
  width: number,
): RelationEnds {
  const atEnd = endMarker(points, end, length, width);
  const atStart = endMarker([...atEnd.line].reverse(), start, length, width);
  const line = [...atStart.line].reverse();
  const kept = lineLength(line) > 0.5 || lineLength(points) < 1 ? line : [...points];
  return { line: kept, start: atStart.parts, end: atEnd.parts };
}

/**
 * The line with every bend replaced by a quadratic curve through it, `radius` from the bend along
 * each segment (half the shorter segment when that is less), sampled in eight steps, so the line
 * stays a polyline for labels, checks and motion.
 */
export function roundCorners(points: readonly Point[], radius: number): Point[] {
  if (points.length < 3 || radius <= 0) return [...points];
  const out: Point[] = [points[0]!];
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1]!;
    const v = points[i]!;
    const b = points[i + 1]!;
    const la = Math.hypot(a.x - v.x, a.y - v.y);
    const lb = Math.hypot(b.x - v.x, b.y - v.y);
    // A straight joint or a doubled point has no corner to round.
    const cross = (v.x - a.x) * (b.y - v.y) - (v.y - a.y) * (b.x - v.x);
    if (la < 1e-6 || lb < 1e-6 || Math.abs(cross) < 1e-6) {
      out.push(v);
      continue;
    }
    const r = Math.min(radius, la / 2, lb / 2);
    const c1 = { x: v.x + ((a.x - v.x) * r) / la, y: v.y + ((a.y - v.y) * r) / la };
    const c2 = { x: v.x + ((b.x - v.x) * r) / lb, y: v.y + ((b.y - v.y) * r) / lb };
    for (let s = 0; s <= SAMPLES_PER_CORNER; s++) {
      const t = s / SAMPLES_PER_CORNER;
      const u = 1 - t;
      out.push({
        x: u * u * c1.x + 2 * u * t * v.x + t * t * c2.x,
        y: u * u * c1.y + 2 * u * t * v.y + t * t * c2.y,
      });
    }
  }
  out.push(points[points.length - 1]!);
  return out;
}

const n = (value: number) => {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? "0" : String(rounded);
};

/** A circle as path data with two arcs. */
export function circleD(center: Point, r: number): string {
  return `M${n(center.x - r)} ${n(center.y)} A${n(r)} ${n(r)} 0 1 0 ${n(center.x + r)} ${n(center.y)} A${n(r)} ${n(r)} 0 1 0 ${n(center.x - r)} ${n(center.y)} Z`;
}

const r2 = (value: number) => {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
};

/** Every point a head reaches, for the bounds of the drawing. */
export function markerPoints(parts: readonly MarkerPart[]): Point[] {
  const out: Point[] = [];
  for (const part of parts) {
    if (part.kind === "circle") {
      const { center: c, r } = part;
      out.push({ x: c.x - r, y: c.y - r }, { x: c.x + r, y: c.y + r });
    } else out.push(...part.points);
  }
  return out;
}

/** A head with every point moved by `move`. */
export function shiftMarker(
  parts: readonly MarkerPart[],
  move: (point: Point) => Point,
): MarkerPart[] {
  return parts.map((part) =>
    part.kind === "circle"
      ? { ...part, center: move(part.center) }
      : { ...part, points: part.points.map(move) },
  );
}

/**
 * The scene items of a head in the line's colour and width: filled shapes are filled with the
 * stroke colour, outlined ones are stroked and unfilled, and lines are never dashed.
 */
export function markerItems(
  parts: readonly MarkerPart[],
  stroke: string,
  strokeWidth: number,
): SceneItem[] {
  return parts.map((part): SceneItem => {
    if (part.kind === "polyline") {
      return {
        kind: "polyline",
        points: part.points.map((p) => ({ x: r2(p.x), y: r2(p.y) })),
        stroke,
        strokeWidth,
        dashed: false,
      };
    }
    const d = part.kind === "circle" ? circleD(part.center, part.r) : polygonPath(part.points);
    return part.filled
      ? { kind: "path", d, fill: stroke, stroke: "none", strokeWidth: 0, dashed: false }
      : { kind: "path", d, fill: "none", stroke, strokeWidth, dashed: false };
  });
}
