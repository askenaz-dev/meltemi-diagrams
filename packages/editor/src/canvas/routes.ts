import {
  isOutlined,
  onOutline,
  shapeMagnets,
  shapeOutline,
  type ShapeOptions,
} from "@meltemi/diagrams-layout/shapes";
import type { Box, Point } from "./geometry.js";
import type { ShapeName } from "./protocol.js";

export type Side = "north" | "south" | "east" | "west";

/** A connector as drawn: its route points, the drawn polyline and the waypoints written for it. */
export interface ConnectorShape {
  readonly points: readonly Point[];
  /** The connector as drawn, the heads cut out; the route points when absent. */
  readonly drawn?: readonly Point[];
  readonly via: readonly Point[];
  readonly fromSide: Side;
  readonly toSide: Side;
}

/** A handle of a selected relation. */
export type RouteHandle =
  | { readonly kind: "end"; readonly end: "from" | "to"; readonly point: Point }
  /** A written waypoint, by index in `via`. */
  | { readonly kind: "bend"; readonly index: number; readonly point: Point }
  /** The middle of a stretch; dragging it inserts a waypoint at `index` of `via`. */
  | { readonly kind: "segment"; readonly index: number; readonly point: Point };

export function routeHandles(connector: ConnectorShape): RouteHandle[] {
  const points = connector.points;
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return [];
  const controls = [first, ...connector.via, last];
  const handles: RouteHandle[] = [
    { kind: "end", end: "from", point: first },
    { kind: "end", end: "to", point: last },
  ];
  connector.via.forEach((point, index) => handles.push({ kind: "bend", index, point }));
  // Each stretch's handle sits on the drawn connector, halfway between its two controls.
  const drawn = outlineOf(connector);
  const along = distancesAlong(drawn, controls);
  for (let i = 0; i < controls.length - 1; i++) {
    const point = pointAlong(drawn, (along[i]! + along[i + 1]!) / 2);
    handles.push({ kind: "segment", index: i, point });
  }
  return handles;
}

/** The polyline of a connector from anchor to anchor along the drawn line, for outlines. */
export function outlineOf(connector: ConnectorShape): Point[] {
  const points = connector.points;
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return [...points];
  if (!connector.drawn || connector.drawn.length === 0) return [...points];
  return [first, ...connector.drawn, last];
}

/** The distance along a polyline of each of `controls`, projected onto it in order. */
function distancesAlong(points: readonly Point[], controls: readonly Point[]): number[] {
  const starts: number[] = [0];
  for (let k = 1; k < points.length; k++) {
    const [a, b] = [points[k - 1]!, points[k]!];
    starts.push(starts[k - 1]! + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const total = starts[starts.length - 1]!;
  const out: number[] = [];
  let floor = 0;
  controls.forEach((c, i) => {
    if (i === 0 || i === controls.length - 1) {
      out.push(i === 0 ? 0 : total);
      return;
    }
    let best = { distance: Infinity, along: floor };
    for (let k = 1; k < points.length; k++) {
      const [a, b] = [points[k - 1]!, points[k]!];
      const length = starts[k]! - starts[k - 1]!;
      const t =
        length === 0
          ? 0
          : Math.max(
              0,
              Math.min(1, ((c.x - a.x) * (b.x - a.x) + (c.y - a.y) * (b.y - a.y)) / length ** 2),
            );
      const along = starts[k - 1]! + t * length;
      if (along < floor) continue;
      const distance = Math.hypot(a.x + (b.x - a.x) * t - c.x, a.y + (b.y - a.y) * t - c.y);
      if (distance < best.distance) best = { distance, along };
    }
    floor = best.along;
    out.push(best.along);
  });
  return out;
}

/** The point at a distance along a polyline. */
function pointAlong(points: readonly Point[], distance: number): Point {
  let left = distance;
  for (let k = 1; k < points.length; k++) {
    const [a, b] = [points[k - 1]!, points[k]!];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= length && length > 0) {
      const t = left / length;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    left -= length;
  }
  return points[points.length - 1]!;
}

export const withBendMoved = (via: readonly Point[], index: number, point: Point): Point[] =>
  via.map((p, i) => (i === index ? point : p));

export const withBendInserted = (via: readonly Point[], index: number, point: Point): Point[] => [
  ...via.slice(0, index),
  point,
  ...via.slice(index),
];

export const withBendRemoved = (via: readonly Point[], index: number): Point[] =>
  via.filter((_, i) => i !== index);

/** The points of a free line, first to last, as its statement writes them. */
export function linePointsOf(points: readonly Point[]): { from: Point; to: Point; via: Point[] } {
  return {
    from: points[0]!,
    to: points[points.length - 1]!,
    via: points.slice(1, -1),
  };
}

/**
 * The points of a free line (first to last) once a handle is dragged to `point`: point `index`
 * moved (`point`), or a bend inserted on the stretch after point `index` (`segment`).
 */
export function withLinePoint(
  points: readonly Point[],
  part: "point" | "segment",
  index: number,
  point: Point,
): Point[] {
  return part === "segment"
    ? [...points.slice(0, index + 1), point, ...points.slice(index + 1)]
    : points.map((p, i) => (i === index ? point : p));
}

/**
 * The end of a line drawn from `start` towards `pointer`: `pointer` itself, or, with `steps`, the
 * nearest point at a multiple of 45° from `start`, a diagonal's two legs equal; `round` puts the
 * result on the grid (lengths along a diagonal stay multiples of it).
 */
export function lineEnd(
  start: Point,
  pointer: Point,
  steps: boolean,
  round: (value: number) => number,
): Point {
  if (!steps) return { x: round(pointer.x), y: round(pointer.y) };
  const dx = pointer.x - start.x;
  const dy = pointer.y - start.y;
  const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  const ux = Math.round(Math.cos(angle));
  const uy = Math.round(Math.sin(angle));
  if (uy === 0) return { x: start.x + round(dx), y: start.y };
  if (ux === 0) return { x: start.x, y: start.y + round(dy) };
  const leg = Math.abs(round((Math.abs(dx) + Math.abs(dy)) / 2));
  return { x: start.x + ux * leg, y: start.y + uy * leg };
}

/** The side of a box closest to a point. */
export function nearestSide(box: Box, point: Point): Side {
  const distances: [Side, number][] = [
    ["north", Math.abs(point.y - box.y)],
    ["south", Math.abs(point.y - (box.y + box.height))],
    ["west", Math.abs(point.x - box.x)],
    ["east", Math.abs(point.x - (box.x + box.width))],
  ];
  distances.sort((a, b) => a[1] - b[1]);
  return distances[0]![0];
}

/** Where a port sits on a box: `position` runs along the side, left to right or top to bottom. */
export function portPosition(box: Box, side: Side, position: number): Point {
  switch (side) {
    case "north":
      return { x: box.x + box.width * position, y: box.y };
    case "south":
      return { x: box.x + box.width * position, y: box.y + box.height };
    case "west":
      return { x: box.x, y: box.y + box.height * position };
    case "east":
      return { x: box.x + box.width, y: box.y + box.height * position };
  }
}

/** The named port within `tolerance` of a point, if any. */
export function nearestPort(
  box: Box,
  ports: readonly { readonly name: string; readonly side: Side; readonly position: number }[],
  point: Point,
  tolerance: number,
): string | undefined {
  let best: { name: string; distance: number } | undefined;
  for (const port of ports) {
    const p = portPosition(box, port.side, port.position);
    const distance = Math.hypot(p.x - point.x, p.y - point.y);
    if (distance <= tolerance && (!best || distance < best.distance))
      best = { name: port.name, distance };
  }
  return best?.name;
}

/** A point a dragged end is drawn to: the middle of a side, a corner or a named port. */
export interface Magnet {
  /** A compass side or a named port. */
  readonly port: string;
  /** The percentage of the side, for compass sides. */
  readonly position?: number;
  readonly point: Point;
}

type Ports = readonly { readonly name: string; readonly side: Side; readonly position: number }[];

/** Shapes drawn with straight sides only: the middles of their sides are magnets too. */
const STRAIGHT: ReadonlySet<ShapeName> = new Set<ShapeName>([
  "diamond",
  "triangle",
  "parallelogram",
  "trapezoid",
  "pentagon",
  "hexagon",
  "octagon",
  "star",
  "callout",
  "arrow",
  "flag",
]);

/** How close, in diagram units, the middle of a side may be to another magnet and still be one. */
const MAGNET_SPACING = 8;

const distanceOf = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** A percentage to two decimals, as the text writes it. */
const percent = (value: number) => Math.round(value * 100) / 100;

/**
 * The magnets of a box and the shape drawn in it (`rectangle` for a plain box), as the layout
 * draws ends: the middle of each side of the box moved onto the outline, the vertices of the
 * outline that lie on the box (the four corners of a box, the points of a diamond, a hexagon or a
 * star; none on ellipses and other curves), the middles of the sides of a shape with straight
 * sides, and the named ports. Each is written as a side and a percentage, or a port; a point that
 * no side and percentage draws back onto it is no magnet.
 */
export function magnets(
  box: Box,
  ports: Ports = [],
  shape: ShapeName = "rectangle",
  options: ShapeOptions = {},
): Magnet[] {
  const out: Magnet[] = [];
  const add = (point: Point, side?: Side) => {
    const written = writtenAt(shape, box, point, side, options);
    if (written) out.push({ port: written.side, position: written.position, point });
  };
  for (const m of shapeMagnets(shape, box, options)) add(m.point, m.side);
  // The middles of straight sides; a rounded polygon's outline samples its corners, so it has none.
  if (STRAIGHT.has(shape) && !options.radius) {
    const outline = shapeOutline(shape, box, options).points;
    outline.forEach((a, i) => {
      const b = outline[(i + 1) % outline.length]!;
      const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (out.some((m) => distanceOf(m.point, middle) < MAGNET_SPACING)) return;
      add(middle);
    });
  }
  return [
    ...out,
    ...ports.map((p) => ({
      port: p.name,
      point: onOutline(shape, box, portPosition(box, p.side, p.position), p.side, options),
    })),
  ];
}

/** The sides of a box from the nearest to a point to the furthest. */
function sidesByDistance(box: Box, point: Point): Side[] {
  const toSides: [Side, number][] = [
    ["north", Math.abs(point.y - box.y)],
    ["south", Math.abs(point.y - (box.y + box.height))],
    ["west", Math.abs(point.x - box.x)],
    ["east", Math.abs(point.x - (box.x + box.width))],
  ];
  return toSides.sort((a, b) => a[1] - b[1]).map(([side]) => side);
}

/** How far along a side a point lies, as a fraction of the side, left to right or top to bottom. */
function fractionAlong(box: Box, side: Side, point: Point): number {
  return side === "north" || side === "south"
    ? (point.x - box.x) / box.width
    : (point.y - box.y) / box.height;
}

/**
 * The side and percentage, as the text writes it (to two decimals), that the layout draws back
 * onto a point of a shape's outline, within half a unit: `side` first, then the nearest sides. A
 * point on an edge that lies along a side's normal (a star's upper edges seen from the east) is
 * met elsewhere from that side, and is written on another. Undefined when no side draws it.
 */
function writtenAt(
  shape: ShapeName,
  box: Box,
  point: Point,
  side?: Side,
  options: ShapeOptions = {},
): { side: Side; position: number } | undefined {
  const sides = sidesByDistance(box, point);
  for (const candidate of side ? [side, ...sides.filter((s) => s !== side)] : sides) {
    const t = fractionAlong(box, candidate, point);
    if (t < -1e-9 || t > 1 + 1e-9) continue;
    const position = Math.min(100, Math.max(0, percent(t * 100)));
    const landed = onOutline(
      shape,
      box,
      portPosition(box, candidate, position / 100),
      candidate,
      options,
    );
    if (distanceOf(landed, point) < 0.5) return { side: candidate, position };
  }
  return undefined;
}

/** The point of a polygon's outline nearest to a point, and how far it is. */
function nearestOnPolygon(
  polygon: readonly Point[],
  point: Point,
): { point: Point; distance: number } {
  let best = { point: polygon[0] ?? point, distance: Infinity };
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = dx * dx + dy * dy;
    const t =
      length === 0
        ? 0
        : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length));
    const p = { x: a.x + dx * t, y: a.y + dy * t };
    const distance = distanceOf(p, point);
    if (distance < best.distance) best = { point: p, distance };
  }
  return best;
}

/** Whether a point lies inside a polygon (even-odd rule). */
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

/**
 * The outline of the shape drawn in a box as path data, without inner lines (a cylinder's rim, a
 * frame's lines): what the canvas outlines a hovered or targeted element with. Shapes whose
 * outline is their box are drawn as the box.
 */
export function highlightPath(shape: ShapeName, box: Box, options: ShapeOptions = {}): string {
  const points = shapeOutline(isOutlined(shape) ? shape : "rectangle", box, options).points;
  const n = (value: number) => String(Math.round(value * 100) / 100);
  return `${points.map((p, i) => `${i === 0 ? "M" : "L"}${n(p.x)} ${n(p.y)}`).join(" ")} Z`;
}

/**
 * Where a dragged end attaches on a box: a named port, a point of its border (`position` a
 * percentage of a side), or nothing written, letting the layout choose (`port` null).
 */
export interface EndAttachment {
  readonly port: string | null;
  readonly position?: number;
  /** The point the end goes to, for the preview: the box's centre when the layout chooses. */
  readonly point: Point;
}

/**
 * How far from the border of a box, or of the shape drawn in it, a point is in diagram units: 0
 * on it, inside or outside.
 */
export function borderDistance(
  box: Box,
  point: Point,
  shape: ShapeName = "rectangle",
  options: ShapeOptions = {},
): number {
  if (isOutlined(shape)) {
    return nearestOnPolygon(shapeOutline(shape, box, options).points, point).distance;
  }
  const dx = Math.max(box.x - point.x, 0, point.x - (box.x + box.width));
  const dy = Math.max(box.y - point.y, 0, point.y - (box.y + box.height));
  if (dx > 0 || dy > 0) return Math.hypot(dx, dy);
  return Math.min(
    point.x - box.x,
    box.x + box.width - point.x,
    point.y - box.y,
    box.y + box.height - point.y,
  );
}

/**
 * The attachment of an end at `pointer` on a box and the shape drawn in it (`rectangle` for a
 * plain box). Within `reach` of the outline it is the point of the outline nearest the pointer,
 * written as a side and a percentage to 1 % that the layout draws back onto the outline, or a
 * magnet within `magnet` of the pointer; `free` (Alt) turns the magnets off. Further inside the
 * shape it is nothing written.
 */
export function attachEnd(
  box: Box,
  ports: Ports,
  pointer: Point,
  reach: { readonly border: number; readonly magnet: number; readonly free?: boolean },
  shape: ShapeName = "rectangle",
  options: ShapeOptions = {},
): EndAttachment {
  const outlined = isOutlined(shape);
  const outline = outlined ? shapeOutline(shape, box, options).points : [];
  const nearest = outlined ? nearestOnPolygon(outline, pointer) : undefined;
  const inside = nearest
    ? nearest.distance > 1e-6 && insidePolygon(outline, pointer)
    : pointer.x > box.x &&
      pointer.x < box.x + box.width &&
      pointer.y > box.y &&
      pointer.y < box.y + box.height;
  if ((nearest ? nearest.distance : borderDistance(box, pointer)) > reach.border) {
    return inside
      ? { port: null, point: { x: box.x + box.width / 2, y: box.y + box.height / 2 } }
      : { port: null, point: pointer };
  }
  if (!reach.free) {
    let best: { magnet: Magnet; distance: number } | undefined;
    for (const magnet of magnets(box, ports, shape, options)) {
      const distance = distanceOf(magnet.point, pointer);
      if (distance <= reach.magnet && (!best || distance < best.distance))
        best = { magnet, distance };
    }
    if (best) {
      const { port, position, point } = best.magnet;
      return position === undefined ? { port, point } : { port, position, point };
    }
  }
  if (!nearest) {
    // The nearest side, and the pointer's projection on it.
    const side = sidesByDistance(box, pointer)[0]!;
    const t = fractionAlong(box, side, pointer);
    const position = Math.min(100, Math.max(0, Math.round(t * 100)));
    return { port: side, position, point: portPosition(box, side, position / 100) };
  }
  // The nearest point of the outline, written on the side whose normal brings it back nearest.
  let best: { side: Side; position: number; point: Point; distance: number } | undefined;
  for (const side of sidesByDistance(box, nearest.point)) {
    const t = fractionAlong(box, side, nearest.point);
    const position = Math.min(100, Math.max(0, Math.round(t * 100)));
    const point = onOutline(shape, box, portPosition(box, side, position / 100), side, options);
    const distance = distanceOf(point, nearest.point);
    if (!best || distance < best.distance - 1e-9) best = { side, position, point, distance };
  }
  return { port: best!.side, position: best!.position, point: best!.point };
}
