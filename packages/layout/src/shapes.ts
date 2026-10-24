import type { BOX_SHAPES, Point } from "@meltemi/diagrams-model";
import {
  boxCenter,
  cylinderPaths,
  diamondPath,
  ellipsePath,
  polygonPath,
  type Box,
  type Side,
} from "./geometry.js";

/**
 * A shape of free boxes and flow nodes (`BOX_SHAPES`): the outline an element's box is drawn with.
 * Decisions are diamonds, data stores cylinders and C4 persons persons.
 */
export type BoxShape = (typeof BOX_SHAPES)[number];

/** A default box size. */
export interface ShapeSize {
  readonly width: number;
  readonly height: number;
}

/**
 * Default sizes by shape at the 13 px label size of the `technical.*` themes; the layout scales
 * them with the label size and grows them until the text fits the shape's text area.
 */
export const SHAPE_SIZES: Readonly<Record<BoxShape, ShapeSize>> = {
  rounded: { width: 160, height: 56 },
  rectangle: { width: 160, height: 56 },
  square: { width: 120, height: 120 },
  ellipse: { width: 160, height: 72 },
  circle: { width: 120, height: 120 },
  diamond: { width: 160, height: 80 },
  cylinder: { width: 160, height: 64 },
  pill: { width: 160, height: 56 },
  triangle: { width: 160, height: 96 },
  parallelogram: { width: 160, height: 56 },
  trapezoid: { width: 160, height: 64 },
  pentagon: { width: 160, height: 96 },
  hexagon: { width: 160, height: 64 },
  octagon: { width: 160, height: 72 },
  star: { width: 120, height: 120 },
  cloud: { width: 180, height: 100 },
  document: { width: 160, height: 72 },
  callout: { width: 160, height: 72 },
  arrow: { width: 160, height: 56 },
  framed: { width: 160, height: 56 },
  flag: { width: 160, height: 56 },
  person: { width: 160, height: 104 },
  agent: { width: 160, height: 120 },
  // The icon's square; its label is drawn outside it.
  icon: { width: 64, height: 64 },
};

/** Measures that a few shapes are drawn with; each has a default from the box. */
export interface ShapeOptions {
  /**
   * The corner radius: of a `rounded` box (8 by default), of a `rectangle`, `square` or `framed`
   * box (none by default), of the vertices of a polygon shape (sharp by default; see
   * `CORNERED_POLYGONS`), or of a person's body (3/13 of the shorter side by default) or an agent's
   * (1/10), clamped to half the shorter side, and on a polygon to half of each edge.
   */
  readonly radius?: number;
  /** The radius of a person's head: 2/13 of the shorter side by default. */
  readonly head?: number;
}

/** A shape drawn in a box. */
export interface ShapeOutline {
  /** SVG path data of the drawing: the outline and its inner lines (a cylinder's rim, a frame). */
  readonly d: string;
  /**
   * The outline as a closed polygon, clockwise on screen: the vertices of polygons, samples of
   * curves. Rounded corners of `rounded` boxes are left out: their ends stay on the box.
   */
  readonly points: readonly Point[];
}

/** A point of a shape's outline a connector end can be drawn to, written as a side percentage. */
export interface ShapeMagnet {
  readonly side: Side;
  /** The percentage of the side, 0 to 100, left to right or top to bottom. */
  readonly position: number;
  /** The point on the outline. */
  readonly point: Point;
}

/**
 * Shapes whose outline is their box: connector ends stay on the box. An icon shape's box is the
 * icon's square.
 */
const BOXED: ReadonlySet<BoxShape> = new Set(["rounded", "rectangle", "square", "framed", "icon"]);

/** Whether a shape's outline differs from its box, so that connector ends move onto it. */
export function isOutlined(shape: BoxShape): boolean {
  return !BOXED.has(shape);
}

const n = (value: number) => String(Math.round(value * 100) / 100);

// Details drawn at an absolute size are clamped by the box, so a 24 px box still draws.

/** The vertical radius of a cylinder's rims. */
function cylinderRy(box: Box): number {
  return Math.min(8, box.height * 0.15);
}

/** How far the slanted sides of a hexagon reach in. */
function hexagonSlant(box: Box): number {
  return Math.min(box.width * 0.25, box.height / 2);
}

/** How far the slanted sides of a parallelogram or trapezoid reach in. */
function leanSlant(box: Box): number {
  return Math.min(box.width * 0.2, box.height / 2);
}

/** The cut corners of an octagon. */
function octagonCut(box: Box): number {
  return 0.29 * Math.min(box.width, box.height);
}

/** The height of a document's wave above and below its middle line. */
function documentWave(box: Box): number {
  return Math.min(12, box.height * 0.12, box.width * 0.08);
}

/** The height of a callout's tail. */
function calloutTail(box: Box): number {
  return Math.min(16, box.height * 0.25);
}

/** The length of an arrow's head. */
function arrowHead(box: Box): number {
  return Math.min(box.width * 0.35, box.height);
}

/** How far a framed box's inner lines are from its sides. */
function frameInset(box: Box): number {
  return Math.min(8, box.width * 0.1);
}

/** How deep a flag's notch reaches into its west side. */
function flagNotch(box: Box): number {
  return Math.min(box.width * 0.15, box.height / 2);
}

/** A person: the head above a rounded body. */
function personParts(box: Box, options: ShapeOptions) {
  const short = Math.min(box.width, box.height);
  const r = Math.max(0, Math.min(options.head ?? (short * 2) / 13, box.width / 2, box.height / 3));
  const body = { x: box.x, y: box.y + r * 1.6, width: box.width, height: box.height - r * 1.6 };
  const radius = Math.max(
    0,
    Math.min(options.radius ?? (short * 3) / 13, body.height / 2, body.width / 2),
  );
  const head = { x: box.x + box.width / 2 - r, y: box.y, width: 2 * r, height: 2 * r };
  return { r, body, radius, head };
}

/** An agent's head side, at most these shares of its box's width and height. */
const AGENT_HEAD = { width: 0.3, height: 0.24 } as const;
/** How far an agent's antenna reaches above its head, at most: a share of the box's height. */
const AGENT_REACH = 0.08;

/**
 * An agent: a robot head above a rounded body that holds the text. The head is a rounded square
 * centred on top, with two eyes and a mouth, and an antenna that rises from its top to a dot at the
 * top of the box. The head and the antenna take at most a third of the height, so that connectors
 * spread along a side meet the body. Every measure follows the box, so a 24 px box still draws.
 */
function agentParts(box: Box, options: ShapeOptions) {
  const short = Math.min(box.width, box.height);
  const side = Math.max(0, Math.min(box.width * AGENT_HEAD.width, box.height * AGENT_HEAD.height));
  const reach = Math.min(box.height * AGENT_REACH, side * 0.36);
  const head = { x: box.x + (box.width - side) / 2, y: box.y + reach, width: side, height: side };
  const neck = head.y + side;
  const body = { x: box.x, y: neck, width: box.width, height: box.y + box.height - neck };
  const radius = Math.max(
    0,
    Math.min(options.radius ?? short / 10, body.height / 2, (box.width - side) / 2),
  );
  const dot = Math.min(reach * 0.28, short * 0.03);
  const eye = side * 0.11;
  const eyes = [0.3, 0.7].map((f) => ({ x: head.x + side * f, y: head.y + side * 0.42 }));
  const mouth = { y: head.y + side * 0.74, from: head.x + side * 0.36, to: head.x + side * 0.64 };
  return { body, radius, head, corner: side * 0.24, dot, eye, eyes, mouth };
}

/** The height of an agent's box whose body is at least `body` tall, whatever its width. */
export function agentHeight(body: number): number {
  return body / (1 - AGENT_HEAD.height - AGENT_REACH);
}

/** A circle as path data, drawn clockwise on screen as the outlines are, so it is filled too. */
function circlePath(c: Point, r: number): string {
  const a = `A${n(r)} ${n(r)} 0 1 1`;
  return `M${n(c.x - r)} ${n(c.y)} ${a} ${n(c.x + r)} ${n(c.y)} ${a} ${n(c.x - r)} ${n(c.y)} Z`;
}

/** The points of an elliptical arc from angle `a0` to `a1` (radians, y down), ends included. */
function arc(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  a0: number,
  a1: number,
  steps: number,
): Point[] {
  const out: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    out.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
  }
  return out;
}

/** Samples of a cubic Bézier curve, its start left out. */
function cubic(p0: Point, p1: Point, p2: Point, p3: Point, steps: number): Point[] {
  const out: Point[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push({
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    });
  }
  return out;
}

/** Fractions of the box of the vertices of an apex-up pentagon. */
const PENTAGON: readonly (readonly [number, number])[] = [
  [0.5, 0],
  [1, 0.38],
  [0.81, 1],
  [0.19, 1],
  [0, 0.38],
];

/** A five-point star, its points and inner corners as fractions of the box it fills. */
const STAR: readonly (readonly [number, number])[] = (() => {
  const raw: [number, number][] = [];
  for (let k = 0; k < 10; k++) {
    const angle = -Math.PI / 2 + (k * Math.PI) / 5;
    const r = k % 2 === 0 ? 1 : 0.382;
    raw.push([r * Math.cos(angle), r * Math.sin(angle)]);
  }
  return normalized(raw);
})();
/** The centre of the star, as a fraction of its box's height. */
const STAR_CENTER = 1 / (1 + Math.sin((3 * Math.PI) / 10));

/**
 * A cloud: seven bumps between valleys on an ellipse, each a cubic curve, as fractions of the box
 * the samples of the curves fill.
 */
const CLOUD: readonly (readonly [Point, Point, Point, Point])[] = (() => {
  const valleys = [-158, -112, -64, -16, 34, 92, 140].map((degrees) => (degrees * Math.PI) / 180);
  const polar = (r: number, angle: number): Point => ({
    x: r * Math.cos(angle),
    y: r * Math.sin(angle),
  });
  const curves: [Point, Point, Point, Point][] = valleys.map((a, i) => {
    const b = i + 1 < valleys.length ? valleys[i + 1]! : valleys[0]! + 2 * Math.PI;
    const gap = b - a;
    return [polar(0.74, a), polar(1.3, a + gap * 0.16), polar(1.3, b - gap * 0.16), polar(0.74, b)];
  });
  const samples = curves.flatMap(([p0, p1, p2, p3]) => cubic(p0, p1, p2, p3, 200));
  const x0 = Math.min(...samples.map((p) => p.x));
  const x1 = Math.max(...samples.map((p) => p.x));
  const y0 = Math.min(...samples.map((p) => p.y));
  const y1 = Math.max(...samples.map((p) => p.y));
  const unit = (p: Point): Point => ({ x: (p.x - x0) / (x1 - x0), y: (p.y - y0) / (y1 - y0) });
  return curves.map(([p0, p1, p2, p3]) => [unit(p0), unit(p1), unit(p2), unit(p3)] as const);
})();

/** Points scaled to fill the unit square. */
function normalized(points: readonly (readonly [number, number])[]): [number, number][] {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const w = Math.max(...xs) - x0;
  const h = Math.max(...ys) - y0;
  return points.map(([x, y]) => [(x - x0) / w, (y - y0) / h]);
}

/** The cloud's curves in a box. */
function cloudCurves(box: Box): [Point, Point, Point, Point][] {
  const at = (p: Point): Point => ({ x: box.x + box.width * p.x, y: box.y + box.height * p.y });
  return CLOUD.map(([p0, p1, p2, p3]) => [at(p0), at(p1), at(p2), at(p3)]);
}

/** A document's wave from its bottom-right corner to its bottom-left one, as a cubic curve. */
function documentCurve(box: Box): [Point, Point, Point, Point] {
  const a = documentWave(box);
  const mid = box.y + box.height - a;
  // Control points 2√3·a off the middle line make the wave reach a above and below it.
  const reach = 2 * Math.sqrt(3) * a;
  return [
    { x: box.x + box.width, y: mid },
    { x: box.x + box.width / 2, y: mid - reach },
    { x: box.x + box.width / 2, y: mid + reach },
    { x: box.x, y: mid },
  ];
}

/** The outline of a shape as a polygon, clockwise on screen. */
/**
 * The polygon shapes whose vertices `radius` rounds: each vertex is cut along both of its edges
 * and joined by a curve through it, as draw.io rounds its polygons.
 */
export const CORNERED_POLYGONS: ReadonlySet<BoxShape> = new Set<BoxShape>([
  "diamond",
  "triangle",
  "parallelogram",
  "trapezoid",
  "pentagon",
  "hexagon",
  "octagon",
  "star",
  "arrow",
  "flag",
  "callout",
]);

/**
 * The shapes whose corners `radius` sets: the rectangles, the polygons, and the bodies of persons
 * and agents. Ellipses, circles, pills, cylinders, clouds and documents have no corners.
 */
export const CORNERED_SHAPES: ReadonlySet<BoxShape> = new Set<BoxShape>([
  "rounded",
  "rectangle",
  "square",
  "framed",
  "person",
  "agent",
  ...CORNERED_POLYGONS,
]);

/** The radius a polygon's vertices are rounded with, or 0 when they stay sharp. */
function polygonRadius(shape: BoxShape, options: ShapeOptions): number {
  return CORNERED_POLYGONS.has(shape) ? Math.max(0, options.radius ?? 0) : 0;
}

/** How many segments sample each rounded corner of a polygon's outline. */
const CORNER_SAMPLES = 8;

/**
 * The corners of a polygon rounded by `radius`: for each vertex, the points `min(radius, half of
 * each edge)` from it along the edge before and the edge after it, and the vertex itself, the
 * control point of the quadratic curve between them.
 */
function roundedCorners(
  points: readonly Point[],
  radius: number,
): { from: Point; vertex: Point; to: Point }[] {
  const count = points.length;
  return points.map((vertex, i) => {
    const before = points[(i - 1 + count) % count]!;
    const after = points[(i + 1) % count]!;
    const toward = (other: Point) => {
      const length = Math.hypot(other.x - vertex.x, other.y - vertex.y);
      return { other, length };
    };
    const a = toward(before);
    const b = toward(after);
    const cut = Math.min(radius, a.length / 2, b.length / 2);
    const along = (end: { other: Point; length: number }): Point =>
      end.length === 0
        ? vertex
        : {
            x: vertex.x + ((end.other.x - vertex.x) * cut) / end.length,
            y: vertex.y + ((end.other.y - vertex.y) * cut) / end.length,
          };
    return { from: along(a), vertex, to: along(b) };
  });
}

/** A point of the quadratic curve of a rounded corner, at `t` from 0 (its start) to 1. */
function cornerAt(corner: { from: Point; vertex: Point; to: Point }, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * corner.from.x + 2 * u * t * corner.vertex.x + t * t * corner.to.x,
    y: u * u * corner.from.y + 2 * u * t * corner.vertex.y + t * t * corner.to.y,
  };
}

/** The path data of a polygon whose vertices are rounded by `radius`. */
function roundedPolygonPath(points: readonly Point[], radius: number): string {
  const corners = roundedCorners(points, radius);
  const first = corners[0]!;
  let d = `M${n(first.from.x)} ${n(first.from.y)}`;
  corners.forEach((corner, i) => {
    if (i > 0) d += ` L${n(corner.from.x)} ${n(corner.from.y)}`;
    d += ` Q${n(corner.vertex.x)} ${n(corner.vertex.y)} ${n(corner.to.x)} ${n(corner.to.y)}`;
  });
  return `${d} Z`;
}

/** The outline of a polygon whose vertices are rounded by `radius`, its corners sampled. */
function roundedPolygonPoints(points: readonly Point[], radius: number): Point[] {
  return dedupe(
    roundedCorners(points, radius).flatMap((corner) =>
      Array.from({ length: CORNER_SAMPLES + 1 }, (_, k) => cornerAt(corner, k / CORNER_SAMPLES)),
    ),
  );
}

function silhouette(shape: BoxShape, box: Box, options: ShapeOptions = {}): Point[] {
  const sharp = sharpSilhouette(shape, box, options);
  const radius = polygonRadius(shape, options);
  return radius > 0 ? roundedPolygonPoints(sharp, radius) : sharp;
}

/** A shape's outline with sharp vertices: what `silhouette` rounds. */
function sharpSilhouette(shape: BoxShape, box: Box, options: ShapeOptions = {}): Point[] {
  const { x, y, width: w, height: h } = box;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const P = (px: number, py: number): Point => ({ x: px, y: py });
  switch (shape) {
    case "rounded":
    case "rectangle":
    case "square":
    case "framed":
    case "icon":
      return [P(x, y), P(x + w, y), P(x + w, y + h), P(x, y + h)];
    case "ellipse":
    case "circle":
      return arc(cx, cy, w / 2, h / 2, -Math.PI / 2, (3 * Math.PI) / 2, 96).slice(0, -1);
    case "diamond":
      return [P(cx, y), P(x + w, cy), P(cx, y + h), P(x, cy)];
    case "cylinder": {
      const ry = cylinderRy(box);
      return [
        ...arc(cx, y + ry, w / 2, ry, Math.PI, 2 * Math.PI, 24),
        ...arc(cx, y + h - ry, w / 2, ry, 0, Math.PI, 24),
      ];
    }
    case "pill": {
      const r = Math.min(w, h) / 2;
      return w >= h
        ? [
            ...arc(x + w - r, cy, r, r, -Math.PI / 2, Math.PI / 2, 24),
            ...arc(x + r, cy, r, r, Math.PI / 2, (3 * Math.PI) / 2, 24),
          ]
        : [
            ...arc(cx, y + r, r, r, Math.PI, 2 * Math.PI, 24),
            ...arc(cx, y + h - r, r, r, 0, Math.PI, 24),
          ];
    }
    case "triangle":
      return [P(cx, y), P(x + w, y + h), P(x, y + h)];
    case "parallelogram": {
      const s = leanSlant(box);
      return [P(x + s, y), P(x + w, y), P(x + w - s, y + h), P(x, y + h)];
    }
    case "trapezoid": {
      const s = leanSlant(box);
      return [P(x + s, y), P(x + w - s, y), P(x + w, y + h), P(x, y + h)];
    }
    case "pentagon":
      return PENTAGON.map(([fx, fy]) => P(x + w * fx, y + h * fy));
    case "hexagon": {
      const s = hexagonSlant(box);
      return [
        P(x + s, y),
        P(x + w - s, y),
        P(x + w, cy),
        P(x + w - s, y + h),
        P(x + s, y + h),
        P(x, cy),
      ];
    }
    case "octagon": {
      const c = octagonCut(box);
      return [
        P(x + c, y),
        P(x + w - c, y),
        P(x + w, y + c),
        P(x + w, y + h - c),
        P(x + w - c, y + h),
        P(x + c, y + h),
        P(x, y + h - c),
        P(x, y + c),
      ];
    }
    case "star":
      return STAR.map(([fx, fy]) => P(x + w * fx, y + h * fy));
    case "cloud": {
      const curves = cloudCurves(box);
      return curves.flatMap(([p0, p1, p2, p3]) => cubic(p0, p1, p2, p3, 16));
    }
    case "document": {
      const [p0, p1, p2, p3] = documentCurve(box);
      return [P(x, y), P(x + w, y), p0, ...cubic(p0, p1, p2, p3, 24)];
    }
    case "callout": {
      const t = calloutTail(box);
      const base = y + h - t;
      const left = x + w * 0.2;
      const right = left + Math.min(w * 0.2, t * 1.5);
      return [
        P(x, y),
        P(x + w, y),
        P(x + w, base),
        P(right, base),
        P(x + w * 0.15, y + h),
        P(left, base),
        P(x, base),
      ];
    }
    case "arrow": {
      const neck = x + w - arrowHead(box);
      return [
        P(x, y + h * 0.25),
        P(neck, y + h * 0.25),
        P(neck, y),
        P(x + w, cy),
        P(neck, y + h),
        P(neck, y + h * 0.75),
        P(x, y + h * 0.75),
      ];
    }
    case "flag":
      return [P(x, y), P(x + w, y), P(x + w, y + h), P(x, y + h), P(x + flagNotch(box), cy)];
    case "person": {
      const { r, body, radius } = personParts(box, options);
      const headY = y + r;
      // The head meets the body's top edge on both sides of the middle.
      const meet = Math.sqrt(Math.max(0, r * r - (body.y - headY) ** 2));
      const from = Math.atan2(body.y - headY, -meet);
      const to = Math.atan2(body.y - headY, meet) + 2 * Math.PI;
      const right = x + w;
      const bottom = y + h;
      return dedupe([
        ...arc(cx, headY, r, r, from, to, 32),
        ...arc(right - radius, body.y + radius, radius, radius, -Math.PI / 2, 0, 8),
        ...arc(right - radius, bottom - radius, radius, radius, 0, Math.PI / 2, 8),
        ...arc(x + radius, bottom - radius, radius, radius, Math.PI / 2, Math.PI, 8),
        ...arc(x + radius, body.y + radius, radius, radius, Math.PI, (3 * Math.PI) / 2, 8),
      ]);
    }
    case "agent": {
      // The head's sides, then the body around from the right of the neck.
      const { body, radius, head, corner } = agentParts(box, options);
      const c = Math.min(corner, head.width / 2);
      const right = x + w;
      const bottom = y + h;
      const headRight = head.x + head.width;
      return dedupe([
        P(head.x, body.y),
        ...arc(head.x + c, head.y + c, c, c, Math.PI, (3 * Math.PI) / 2, 6),
        ...arc(headRight - c, head.y + c, c, c, -Math.PI / 2, 0, 6),
        P(headRight, body.y),
        ...arc(right - radius, body.y + radius, radius, radius, -Math.PI / 2, 0, 8),
        ...arc(right - radius, bottom - radius, radius, radius, 0, Math.PI / 2, 8),
        ...arc(x + radius, bottom - radius, radius, radius, Math.PI / 2, Math.PI, 8),
        ...arc(x + radius, body.y + radius, radius, radius, Math.PI, (3 * Math.PI) / 2, 8),
      ]);
    }
  }
}

/** Drops points that repeat the one before them. */
function dedupe(points: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || Math.abs(last.x - p.x) > 1e-9 || Math.abs(last.y - p.y) > 1e-9) out.push(p);
  }
  while (out.length > 1) {
    const first = out[0]!;
    const last = out[out.length - 1]!;
    if (Math.abs(last.x - first.x) > 1e-9 || Math.abs(last.y - first.y) > 1e-9) break;
    out.pop();
  }
  return out;
}

/** A rectangle with rounded corners, as path data. */
function roundedRectPath(box: Box, radius: number): string {
  const { x, y, width: w, height: h } = box;
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  if (r === 0)
    return `M${n(x)} ${n(y)} L${n(x + w)} ${n(y)} L${n(x + w)} ${n(y + h)} L${n(x)} ${n(y + h)} Z`;
  const a = `A${n(r)} ${n(r)} 0 0 1`;
  return (
    `M${n(x + r)} ${n(y)} L${n(x + w - r)} ${n(y)} ${a} ${n(x + w)} ${n(y + r)} ` +
    `L${n(x + w)} ${n(y + h - r)} ${a} ${n(x + w - r)} ${n(y + h)} ` +
    `L${n(x + r)} ${n(y + h)} ${a} ${n(x)} ${n(y + h - r)} ` +
    `L${n(x)} ${n(y + r)} ${a} ${n(x + r)} ${n(y)} Z`
  );
}

/** The two inner lines of a `framed` box, as path data. */
export function framedLines(box: Box): string {
  const f = frameInset(box);
  const bottom = box.y + box.height;
  return `M${n(box.x + f)} ${n(box.y)} L${n(box.x + f)} ${n(bottom)} M${n(box.x + box.width - f)} ${n(box.y)} L${n(box.x + box.width - f)} ${n(bottom)}`;
}

/** Path data of cubic curves joined into one closed outline. */
function curvesPath(
  start: Point,
  curves: readonly (readonly [Point, Point, Point, Point])[],
): string {
  let d = `M${n(start.x)} ${n(start.y)}`;
  for (const [, p1, p2, p3] of curves) {
    d += ` C${n(p1.x)} ${n(p1.y)} ${n(p2.x)} ${n(p2.y)} ${n(p3.x)} ${n(p3.y)}`;
  }
  return `${d} Z`;
}

/**
 * A shape drawn in a box: its path data and its outline as a polygon. Details scale with the box
 * and are clamped by its shorter side, so a 24 px box still draws. Pure and DOM-free: hosts draw
 * pictures, ghosts and highlights with it.
 */
export function shapeOutline(shape: BoxShape, box: Box, options: ShapeOptions = {}): ShapeOutline {
  const points = silhouette(shape, box, options);
  return { d: outlinePath(shape, box, options, points), points };
}

function outlinePath(
  shape: BoxShape,
  box: Box,
  options: ShapeOptions,
  points: readonly Point[],
): string {
  const rounding = polygonRadius(shape, options);
  if (rounding > 0) return roundedPolygonPath(sharpSilhouette(shape, box, options), rounding);
  switch (shape) {
    case "rounded":
      return roundedRectPath(box, options.radius ?? 8);
    case "rectangle":
    case "square":
      return roundedRectPath(box, options.radius ?? 0);
    case "icon":
      return roundedRectPath(box, 0);
    case "pill":
      return roundedRectPath(box, Math.min(box.width, box.height) / 2);
    case "framed":
      return `${roundedRectPath(box, options.radius ?? 0)} ${framedLines(box)}`;
    case "ellipse":
    case "circle":
      return ellipsePath(box);
    case "diamond":
      return diamondPath(box);
    case "cylinder": {
      const { body, top } = cylinderPaths(box);
      return `${body} ${top}`;
    }
    case "person": {
      const { body, radius, head } = personParts(box, options);
      return `${roundedRectPath(body, radius)} ${ellipsePath(head)}`;
    }
    case "agent": {
      const { body, radius, head, corner, dot, eye, eyes, mouth } = agentParts(box, options);
      const cx = box.x + box.width / 2;
      const antenna = `M${n(cx)} ${n(head.y)} L${n(cx)} ${n(box.y + 2 * dot)}`;
      return [
        roundedRectPath(body, radius),
        roundedRectPath(head, corner),
        ...eyes.map((at) => circlePath(at, eye)),
        `M${n(mouth.from)} ${n(mouth.y)} L${n(mouth.to)} ${n(mouth.y)}`,
        antenna,
        circlePath({ x: cx, y: box.y + dot }, dot),
      ].join(" ");
    }
    case "cloud": {
      const curves = cloudCurves(box);
      return curvesPath(curves[0]![0], curves);
    }
    case "document": {
      const curve = documentCurve(box);
      return `M${n(box.x)} ${n(box.y)} L${n(box.x + box.width)} ${n(box.y)} L${n(curve[0].x)} ${n(curve[0].y)} C${n(curve[1].x)} ${n(curve[1].y)} ${n(curve[2].x)} ${n(curve[2].y)} ${n(curve[3].x)} ${n(curve[3].y)} Z`;
    }
    default:
      return polygonPath(points);
  }
}

/**
 * A point turned clockwise on screen by `degrees` about `center` (the direction of SVG's
 * `rotate()`).
 */
export function turnPoint(point: Point, center: Point, degrees: number): Point {
  const angle = (degrees * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos };
}

/**
 * The outline of a shape turned by `degrees` about the centre of its box: the shape's outline, or
 * its box's corners for the shapes drawn as their box.
 */
export function turnedOutline(
  shape: BoxShape,
  box: Box,
  degrees: number,
  options: ShapeOptions = {},
): Point[] {
  const center = boxCenter(box);
  const points = isOutlined(shape)
    ? silhouette(shape, box, options)
    : [
        { x: box.x, y: box.y },
        { x: box.x + box.width, y: box.y },
        { x: box.x + box.width, y: box.y + box.height },
        { x: box.x, y: box.y + box.height },
      ];
  return points.map((p) => turnPoint(p, center, degrees));
}

/**
 * Where a connector end found on a side of a box meets a polygon drawn in it, such as a turned
 * outline: the end slides along the side's inward normal to the first point of the polygon, or
 * goes to the nearest point of it when the normal meets none.
 */
export function onPolygon(polygon: readonly Point[], point: Point, side: Side): Point {
  if (polygon.length < 2) return point;
  const normal = inward(side);
  const t = rayHit(polygon, point, normal);
  return t === undefined
    ? nearestOnOutline(polygon, point).point
    : { x: point.x + normal.x * t, y: point.y + normal.y * t };
}

/**
 * Where the ray from the centre of a box towards `toward` meets the outline of the shape drawn in
 * it, turned by `degrees` about the centre: the shape's silhouette, or the box's corners for the
 * shapes drawn as their box. The centre when `toward` is the centre or the ray meets nothing.
 * Notes draw their leaders from and to these points.
 */
export function boundaryToward(
  shape: BoxShape,
  box: Box,
  degrees: number,
  toward: Point,
  options: ShapeOptions = {},
): Point {
  const center = boxCenter(box);
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-9) return center;
  const polygon =
    degrees !== 0
      ? turnedOutline(shape, box, degrees, options)
      : isOutlined(shape)
        ? silhouette(shape, box, options)
        : [
            { x: box.x, y: box.y },
            { x: box.x + box.width, y: box.y },
            { x: box.x + box.width, y: box.y + box.height },
            { x: box.x, y: box.y + box.height },
          ];
  const unit = { x: dx / length, y: dy / length };
  const t = rayHit(polygon, center, unit);
  return t === undefined ? center : { x: center.x + unit.x * t, y: center.y + unit.y * t };
}

/** Whether a point lies inside a polygon or on its outline. */
export function pointInPolygon(polygon: readonly Point[], point: Point): boolean {
  return insidePolygon(polygon, point) || nearestOnOutline(polygon, point).distance < 1e-6;
}

/** The inward unit normal of a side. */
function inward(side: Side): Point {
  switch (side) {
    case "north":
      return { x: 0, y: 1 };
    case "south":
      return { x: 0, y: -1 };
    case "west":
      return { x: 1, y: 0 };
    case "east":
      return { x: -1, y: 0 };
  }
}

const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;

/** How far along `direction` from `origin` the ray first meets the polygon, or undefined. */
function rayHit(polygon: readonly Point[], origin: Point, direction: Point): number | undefined {
  let best: number | undefined;
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i]!;
    const q = polygon[(i + 1) % polygon.length]!;
    const edge = { x: q.x - p.x, y: q.y - p.y };
    const denominator = cross(direction, edge);
    if (Math.abs(denominator) < 1e-12) continue;
    const w = { x: p.x - origin.x, y: p.y - origin.y };
    const t = cross(w, edge) / denominator;
    const u = cross(w, direction) / denominator;
    if (u < -1e-9 || u > 1 + 1e-9 || t < -1e-6) continue;
    if (best === undefined || t < best) best = t;
  }
  return best;
}

/** The point of a segment nearest to `point`. */
function nearestOnSegment(a: Point, b: Point, point: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t =
    length === 0
      ? 0
      : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length));
  return { x: a.x + dx * t, y: a.y + dy * t };
}

/** The point of a polygon's outline nearest to `point`, and how far it is. */
function nearestOnOutline(
  polygon: readonly Point[],
  point: Point,
): { point: Point; distance: number } {
  let best = { point: polygon[0] ?? point, distance: Infinity };
  for (let i = 0; i < polygon.length; i++) {
    const p = nearestOnSegment(polygon[i]!, polygon[(i + 1) % polygon.length]!, point);
    const distance = Math.hypot(p.x - point.x, p.y - point.y);
    if (distance < best.distance) best = { point: p, distance };
  }
  return best;
}

/** Whether a point lies inside a polygon (even-odd rule); points on the outline may go either way. */
function insidePolygon(polygon: readonly Point[], point: Point): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const p = polygon[i]!;
    const q = polygon[j]!;
    if (p.y > point.y !== q.y > point.y) {
      const x = p.x + ((point.y - p.y) / (q.y - p.y)) * (q.x - p.x);
      if (point.x < x) inside = !inside;
    }
  }
  return inside;
}

/** How far from a corner of its box an end still counts as lying in the corner. */
const CORNER = 1;

/** Whether a point lies in a corner of a box, where two sides meet. */
function atCorner(box: Box, point: Point): boolean {
  const near = (a: number, b: number) => Math.abs(a - b) <= CORNER;
  return (
    (near(point.x, box.x) || near(point.x, box.x + box.width)) &&
    (near(point.y, box.y) || near(point.y, box.y + box.height))
  );
}

/**
 * Where a connector end found on a side of a box meets the shape drawn in it: the end slides along
 * the side's inward normal to the first point of the outline, or goes to the nearest outline point
 * when the normal meets none (between a star's points, beside a callout's tail). An end in a corner
 * of the box (a parallel lane clamped to the end of its side) lies on two sides, and the normal of
 * either only grazes the shape (a cylinder's rim, a diamond's vertex), so it goes to the nearest
 * outline point too. Ends on boxes whose outline is the box (`rounded` included: its corners are
 * left out) stay where they are.
 */
export function onOutline(
  shape: BoxShape,
  box: Box,
  point: Point,
  side: Side,
  options: ShapeOptions = {},
): Point {
  if (!isOutlined(shape)) return point;
  let hit: Point;
  if (atCorner(box, point)) {
    hit = nearestOnOutline(silhouette(shape, box, options), point).point;
  } else if (shape === "ellipse" || shape === "circle") {
    hit = onEllipse(box, point, side);
  } else {
    const polygon = silhouette(shape, box, options);
    const normal = inward(side);
    const t = rayHit(polygon, point, normal);
    hit =
      t === undefined
        ? nearestOnOutline(polygon, point).point
        : { x: point.x + normal.x * t, y: point.y + normal.y * t };
  }
  return Math.abs(hit.x - point.x) < 1e-6 && Math.abs(hit.y - point.y) < 1e-6 ? point : hit;
}

/** Where the normal of a side through `point` meets the ellipse inscribed in the box. */
function onEllipse(box: Box, point: Point, side: Side): Point {
  const c = boxCenter(box);
  const rx = box.width / 2;
  const ry = box.height / 2;
  if (rx <= 0 || ry <= 0) return c;
  if (side === "north" || side === "south") {
    const dx = Math.max(-1, Math.min(1, (point.x - c.x) / rx));
    const dy = ry * Math.sqrt(1 - dx * dx);
    return { x: c.x + dx * rx, y: side === "north" ? c.y - dy : c.y + dy };
  }
  const dy = Math.max(-1, Math.min(1, (point.y - c.y) / ry));
  const dx = rx * Math.sqrt(1 - dy * dy);
  return { x: side === "west" ? c.x - dx : c.x + dx, y: c.y + dy * ry };
}

/** Whether a point lies inside a shape or on its outline. */
export function pointInShape(
  shape: BoxShape,
  box: Box,
  point: Point,
  options: ShapeOptions = {},
): boolean {
  if (!isOutlined(shape)) {
    return (
      point.x >= box.x &&
      point.x <= box.x + box.width &&
      point.y >= box.y &&
      point.y <= box.y + box.height
    );
  }
  if (shape === "ellipse" || shape === "circle") {
    const c = boxCenter(box);
    const rx = box.width / 2;
    const ry = box.height / 2;
    if (rx <= 0 || ry <= 0) return false;
    return ((point.x - c.x) / rx) ** 2 + ((point.y - c.y) / ry) ** 2 <= 1 + 1e-9;
  }
  const polygon = silhouette(shape, box, options);
  return insidePolygon(polygon, point) || nearestOnOutline(polygon, point).distance < 1e-6;
}

/**
 * Whether a segment passes through the inside of a polygon deeper than `inset` pixels: running
 * along the outline or touching it does not count.
 */
export function segmentCrossesPolygon(
  a: Point,
  b: Point,
  polygon: readonly Point[],
  inset = 1,
): boolean {
  const direction = { x: b.x - a.x, y: b.y - a.y };
  const cuts = [0, 1];
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i]!;
    const q = polygon[(i + 1) % polygon.length]!;
    const edge = { x: q.x - p.x, y: q.y - p.y };
    const denominator = cross(direction, edge);
    if (Math.abs(denominator) < 1e-12) continue;
    const w = { x: p.x - a.x, y: p.y - a.y };
    const t = cross(w, edge) / denominator;
    const u = cross(w, direction) / denominator;
    if (t > 0 && t < 1 && u >= 0 && u <= 1) cuts.push(t);
  }
  cuts.sort((x, y) => x - y);
  for (let i = 1; i < cuts.length; i++) {
    const t0 = cuts[i - 1]!;
    const t1 = cuts[i]!;
    if (t1 - t0 < 1e-9) continue;
    // Samples of the piece between two crossings of the outline.
    for (let k = 1; k <= 9; k++) {
      const t = t0 + ((t1 - t0) * k) / 10;
      const p = { x: a.x + direction.x * t, y: a.y + direction.y * t };
      if (insidePolygon(polygon, p) && nearestOnOutline(polygon, p).distance > inset) return true;
    }
  }
  return false;
}

/** Whether a segment passes through the inside of the shape drawn in a box. */
export function segmentCrossesShape(
  shape: BoxShape,
  box: Box,
  a: Point,
  b: Point,
  options: ShapeOptions = {},
  inset = 1,
): boolean {
  return segmentCrossesPolygon(a, b, silhouette(shape, box, options), inset);
}

/** The side and percentage of a point on a box's border, north and south first; or undefined. */
function borderPosition(box: Box, point: Point): { side: Side; position: number } | undefined {
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  const across = box.width === 0 ? 50 : ((point.x - box.x) / box.width) * 100;
  const down = box.height === 0 ? 50 : ((point.y - box.y) / box.height) * 100;
  if (near(point.y, box.y)) return { side: "north", position: across };
  if (near(point.y, box.y + box.height)) return { side: "south", position: across };
  if (near(point.x, box.x)) return { side: "west", position: down };
  if (near(point.x, box.x + box.width)) return { side: "east", position: down };
  return undefined;
}

const SIDES: readonly Side[] = ["north", "east", "south", "west"];

/** The point of a side at a fraction of its length. */
function sidePoint(box: Box, side: Side, fraction: number): Point {
  switch (side) {
    case "north":
      return { x: box.x + box.width * fraction, y: box.y };
    case "south":
      return { x: box.x + box.width * fraction, y: box.y + box.height };
    case "west":
      return { x: box.x, y: box.y + box.height * fraction };
    case "east":
      return { x: box.x + box.width, y: box.y + box.height * fraction };
  }
}

/**
 * The magnets of a shape, the points a dragged connector end snaps to: the middle of each side
 * moved onto the outline, then the vertices that lie on the box (the corners of boxes and
 * documents, the points of polygons and stars). Ellipses, circles and other curved shapes have
 * only the side middles. Each magnet is written as a side and a percentage that the layout moves
 * back onto the same point.
 */
export function shapeMagnets(shape: BoxShape, box: Box, options: ShapeOptions = {}): ShapeMagnet[] {
  const out: ShapeMagnet[] = [];
  const add = (side: Side, position: number, point: Point) => {
    if (out.some((m) => Math.hypot(m.point.x - point.x, m.point.y - point.y) < 0.5)) return;
    out.push({ side, position, point });
  };
  for (const side of SIDES) {
    add(side, 50, onOutline(shape, box, sidePoint(box, side, 0.5), side, options));
  }
  for (const vertex of vertices(shape, box, options)) {
    const at = borderPosition(box, vertex);
    if (at) add(at.side, at.position, vertex);
  }
  return out;
}

/** The vertices of a shape's outline; curves (ellipses, rims, caps, bumps, heads) have none. */
function vertices(shape: BoxShape, box: Box, options: ShapeOptions): Point[] {
  switch (shape) {
    case "ellipse":
    case "circle":
    case "cylinder":
    case "pill":
    case "cloud":
    case "person":
    case "agent":
      return [];
    case "document": {
      // The corners of the page, above the ends of its wave.
      const [right, , , left] = documentCurve(box);
      return [{ x: box.x, y: box.y }, { x: box.x + box.width, y: box.y }, right, left];
    }
    default: {
      const sharp = sharpSilhouette(shape, box, options);
      const radius = polygonRadius(shape, options);
      return radius > 0
        ? roundedCorners(sharp, radius).map((corner) => cornerAt(corner, 0.5))
        : sharp;
    }
  }
}

/**
 * The centre of a shape's text: the centre of its box, moved into the body of cylinders, persons,
 * agents, documents and callouts, towards the base of triangles and pentagons, to the middle of a star, and
 * away from an arrow's head and a flag's notch.
 */
export function shapeTextCenter(shape: BoxShape, box: Box, options: ShapeOptions = {}): Point {
  const center = boxCenter(box);
  switch (shape) {
    case "cylinder":
      return { x: center.x, y: center.y + cylinderRy(box) / 2 };
    case "person": {
      const { body, r } = personParts(box, options);
      return { x: center.x, y: body.y + body.height / 2 + r * 0.3 };
    }
    case "agent": {
      const { body } = agentParts(box, options);
      return { x: center.x, y: body.y + body.height / 2 };
    }
    case "triangle":
      return { x: center.x, y: box.y + (box.height * 2) / 3 };
    case "pentagon":
      return { x: center.x, y: box.y + box.height * 0.55 };
    case "star":
      return { x: center.x, y: box.y + box.height * STAR_CENTER };
    case "document":
      return { x: center.x, y: box.y + (box.height - documentWave(box)) / 2 };
    case "callout":
      return { x: center.x, y: box.y + (box.height - calloutTail(box)) / 2 };
    case "arrow":
      return { x: box.x + (box.width - arrowHead(box) / 2) / 2, y: center.y };
    case "flag":
      return { x: box.x + (box.width + flagNotch(box)) / 2, y: center.y };
    default:
      return center;
  }
}

/**
 * The top and bottom of a shape's text band, where `verticalAlign` places a box's text: the box,
 * the body between the rims of a cylinder, the page above a document's wave and the body above a
 * callout's tail. The rows inside it are read with `shapeTextSpanner`, which keeps an ellipse's
 * text inside its curve and an arrow's in its shaft.
 */
export function shapeTextBand(
  shape: BoxShape,
  box: Box,
  options: ShapeOptions = {},
): { readonly top: number; readonly bottom: number } {
  void options;
  const bottom = box.y + box.height;
  switch (shape) {
    case "cylinder": {
      const ry = cylinderRy(box);
      return { top: box.y + 2 * ry, bottom: bottom - ry };
    }
    case "document":
      return { top: box.y, bottom: bottom - documentWave(box) };
    case "callout":
      return { top: box.y, bottom: bottom - calloutTail(box) };
    default:
      return { top: box.y, bottom };
  }
}

/** Shapes whose text sits at a fixed spot, which `verticalAlign` does not move. */
export const FIXED_TEXT_SHAPES: ReadonlySet<BoxShape> = new Set<BoxShape>([
  "triangle",
  "pentagon",
  "star",
  "person",
  "agent",
  "icon",
]);

const ascending = (a: number, b: number) => a - b;

/** The span of a polygon's row at height `y` that holds `x`, or undefined. */
function scanRow(polygon: readonly Point[], y: number, x: number): [number, number] | undefined {
  const xs: number[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i]!;
    const q = polygon[(i + 1) % polygon.length]!;
    if ((p.y <= y && y < q.y) || (q.y <= y && y < p.y)) {
      xs.push(p.x + ((y - p.y) / (q.y - p.y)) * (q.x - p.x));
    }
  }
  xs.sort(ascending);
  for (let i = 0; i + 1 < xs.length; i += 2) {
    if (xs[i]! <= x + 1e-9 && x <= xs[i + 1]! + 1e-9) return [xs[i]!, xs[i + 1]!];
  }
  return undefined;
}

/** The span of a shape's text area at height `y` that holds `x`, or undefined. */
function textRow(
  shape: BoxShape,
  box: Box,
  y: number,
  x: number,
  options: ShapeOptions,
  polygon: readonly Point[] | undefined,
): [number, number] | undefined {
  switch (shape) {
    case "rounded":
    case "rectangle":
    case "square":
    case "icon":
      return within(y, box.y, box.y + box.height) ? [box.x, box.x + box.width] : undefined;
    case "framed": {
      const f = frameInset(box);
      return within(y, box.y, box.y + box.height) ? [box.x + f, box.x + box.width - f] : undefined;
    }
    case "person": {
      // The text sits in the body, which keeps the whole width as boxes do.
      const { body } = personParts(box, options);
      return within(y, body.y, body.y + body.height) ? [box.x, box.x + box.width] : undefined;
    }
    case "agent": {
      // As a person's: the body, below the head.
      const { body } = agentParts(box, options);
      return within(y, body.y, body.y + body.height) ? [box.x, box.x + box.width] : undefined;
    }
    case "ellipse":
    case "circle": {
      const c = boxCenter(box);
      const rx = box.width / 2;
      const ry = box.height / 2;
      const dy = ry > 0 ? (y - c.y) / ry : 2;
      if (Math.abs(dy) > 1 + 1e-9) return undefined;
      const half = rx * Math.sqrt(Math.max(0, 1 - dy * dy));
      return [c.x - half, c.x + half];
    }
    default: {
      // Every outline spans its box from top to bottom; those rows are read just inside them.
      const bottom = box.y + box.height;
      if (!within(y, box.y, bottom)) return undefined;
      const row = Math.min(bottom - 1e-7, Math.max(box.y + 1e-7, y));
      return scanRow(polygon ?? silhouette(shape, box, options), row, x);
    }
  }
}

/** Whether a row at `y` lies between `top` and `bottom`, to a rounding error. */
function within(y: number, top: number, bottom: number): boolean {
  return y >= top - 1e-9 && y <= bottom + 1e-9;
}

/** Shapes whose text rows are read from their outline polygon. */
const SCANNED: ReadonlySet<BoxShape> = new Set<BoxShape>([
  "diamond",
  "cylinder",
  "pill",
  "triangle",
  "parallelogram",
  "trapezoid",
  "pentagon",
  "hexagon",
  "octagon",
  "star",
  "cloud",
  "document",
  "callout",
  "arrow",
  "flag",
]);

/**
 * The left and right ends of a shape's text area across the rows from `top` to `bottom`: how far
 * every row of the band reaches on each side of `x`, or undefined when a row lies beyond the shape.
 * Rows are measured exactly: a diamond's row at `dy` from the middle is `w·(1 − 2|dy|/h)` wide, an
 * ellipse's `w·√(1 − (2dy/h)²)`.
 */
export function shapeTextSpan(
  shape: BoxShape,
  box: Box,
  top: number,
  bottom: number,
  x: number,
  options: ShapeOptions = {},
): readonly [number, number] | undefined {
  return shapeTextSpanner(shape, box, options)(top, bottom, x);
}

/**
 * `shapeTextSpan` of one box for many bands: the shape's outline is traced once, for callers that
 * try band after band in the same box.
 */
export function shapeTextSpanner(
  shape: BoxShape,
  box: Box,
  options: ShapeOptions = {},
): (top: number, bottom: number, x: number) => readonly [number, number] | undefined {
  const polygon = SCANNED.has(shape) ? silhouette(shape, box, options) : undefined;
  return (top, bottom, x) => {
    const rows = [top, bottom];
    if (polygon) for (const p of polygon) if (p.y > top && p.y < bottom) rows.push(p.y);
    let left = -Infinity;
    let right = Infinity;
    for (const y of rows) {
      const row = textRow(shape, box, y, x, options, polygon);
      if (!row) return undefined;
      left = Math.max(left, row[0]);
      right = Math.min(right, row[1]);
    }
    return [left, right];
  };
}

/**
 * The text area of a shape across the rows from `top` to `bottom`: the widest rectangle centred on
 * `x` that every row of the band holds (the inscribed rectangle of the text), from
 * `shapeTextSpan`. A band beyond the shape has no width.
 */
export function shapeTextArea(
  shape: BoxShape,
  box: Box,
  top: number,
  bottom: number,
  x: number,
  options: ShapeOptions = {},
): Box {
  const span = shapeTextSpan(shape, box, top, bottom, x, options);
  const half = span ? Math.max(0, Math.min(x - span[0], span[1] - x)) : 0;
  return { x: x - half, y: top, width: 2 * half, height: bottom - top };
}
