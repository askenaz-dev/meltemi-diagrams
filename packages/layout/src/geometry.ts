import type { Point, Port } from "@meltemi/diagrams-model";

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type Side = Exclude<Port, "auto">;

export const ARROW_LENGTH = 8;
export const ARROW_WIDTH = 7;

export function boxCenter(box: Box): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

export function boxFromCenter(center: Point, width: number, height: number): Box {
  return { x: center.x - width / 2, y: center.y - height / 2, width, height };
}

export function boxRight(box: Box): number {
  return box.x + box.width;
}

export function boxBottom(box: Box): number {
  return box.y + box.height;
}

export function unionBoxes(boxes: readonly Box[]): Box | undefined {
  if (boxes.length === 0) return undefined;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, boxRight(b));
    maxY = Math.max(maxY, boxBottom(b));
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function expandBox(box: Box, left: number, top: number, right: number, bottom: number): Box {
  return {
    x: box.x - left,
    y: box.y - top,
    width: box.width + left + right,
    height: box.height + top + bottom,
  };
}

/** The side of `box` that faces `point`, judged relative to the box proportions. */
export function sideFacing(box: Box, point: Point): Side {
  const c = boxCenter(box);
  const dx = point.x - c.x;
  const dy = point.y - c.y;
  const nx = Math.abs(dx) / Math.max(1, box.width / 2);
  const ny = Math.abs(dy) / Math.max(1, box.height / 2);
  if (ny >= nx) return dy >= 0 ? "south" : "north";
  return dx >= 0 ? "east" : "west";
}

/** The point of `side` closest to `neighbour`: its projection onto the side, clamped to the side. */
export function anchorOnSide(box: Box, side: Side, neighbour: Point): Point {
  const x = Math.min(boxRight(box), Math.max(box.x, neighbour.x));
  const y = Math.min(boxBottom(box), Math.max(box.y, neighbour.y));
  switch (side) {
    case "north":
      return { x, y: box.y };
    case "south":
      return { x, y: boxBottom(box) };
    case "west":
      return { x: box.x, y };
    case "east":
      return { x: boxRight(box), y };
  }
}

function isVertical(side: Side): boolean {
  return side === "north" || side === "south";
}

function facing(a: Side, b: Side): boolean {
  return (
    (a === "south" && b === "north") ||
    (a === "north" && b === "south") ||
    (a === "east" && b === "west") ||
    (a === "west" && b === "east")
  );
}

function sideCoordinate(box: Box, side: Side): number {
  switch (side) {
    case "north":
      return box.y;
    case "south":
      return boxBottom(box);
    case "west":
      return box.x;
    case "east":
      return boxRight(box);
  }
}

const samePoint = (a: Point, b: Point) => Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;

/**
 * Connector points from the source box to the target box (decision D3 of the SVG export change):
 * - with waypoints, each side anchors at the projection of its neighbouring waypoint;
 * - facing parallel sides without waypoints meet at the centre of their overlap, or at their own
 *   centres when the extents do not overlap;
 * - perpendicular sides without waypoints get one elbow;
 * - `auto` ports choose the side that faces the neighbouring point.
 */
export function routePoints(
  from: Box,
  fromPort: Port,
  to: Box,
  toPort: Port,
  via: readonly Point[],
): Point[] {
  const fromNeighbour = via[0] ?? boxCenter(to);
  const toNeighbour = via[via.length - 1] ?? boxCenter(from);
  const fromSide = fromPort === "auto" ? sideFacing(from, fromNeighbour) : fromPort;
  const toSide = toPort === "auto" ? sideFacing(to, toNeighbour) : toPort;

  if (via.length > 0) {
    return [
      anchorOnSide(from, fromSide, via[0]!),
      ...via,
      anchorOnSide(to, toSide, via[via.length - 1]!),
    ];
  }

  if (facing(fromSide, toSide)) {
    if (isVertical(fromSide)) {
      const lo = Math.max(from.x, to.x);
      const hi = Math.min(boxRight(from), boxRight(to));
      const x = lo <= hi ? (lo + hi) / 2 : undefined;
      return [
        { x: x ?? boxCenter(from).x, y: sideCoordinate(from, fromSide) },
        { x: x ?? boxCenter(to).x, y: sideCoordinate(to, toSide) },
      ];
    }
    const lo = Math.max(from.y, to.y);
    const hi = Math.min(boxBottom(from), boxBottom(to));
    const y = lo <= hi ? (lo + hi) / 2 : undefined;
    return [
      { x: sideCoordinate(from, fromSide), y: y ?? boxCenter(from).y },
      { x: sideCoordinate(to, toSide), y: y ?? boxCenter(to).y },
    ];
  }

  // Sides that do not face each other leave from their centres; perpendicular ones get an elbow.
  const a = sideCenter(from, fromSide);
  const b = sideCenter(to, toSide);
  if (isVertical(fromSide) !== isVertical(toSide)) {
    const elbow = isVertical(fromSide) ? { x: a.x, y: b.y } : { x: b.x, y: a.y };
    if (!samePoint(elbow, a) && !samePoint(elbow, b)) return [a, elbow, b];
  }
  return [a, b];
}

export function sideCenter(box: Box, side: Side): Point {
  const c = boxCenter(box);
  switch (side) {
    case "north":
      return { x: c.x, y: box.y };
    case "south":
      return { x: c.x, y: boxBottom(box) };
    case "west":
      return { x: box.x, y: c.y };
    case "east":
      return { x: boxRight(box), y: c.y };
  }
}

export function polylineLength(points: readonly Point[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++)
    length += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
  return length;
}

/** The point at `fraction` (0 to 1) of the polyline length. */
export function pointAlong(points: readonly Point[], fraction: number): Point {
  const total = polylineLength(points);
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1 || total === 0) return points[0]!;
  let remaining = Math.max(0, Math.min(1, fraction)) * total;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const segment = Math.hypot(b.x - a.x, b.y - a.y);
    if (remaining <= segment || i === points.length - 1) {
      const t = segment === 0 ? 0 : Math.min(1, remaining / segment);
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    remaining -= segment;
  }
  return points[points.length - 1]!;
}

export type ArrowheadShape = "triangle" | "open" | "none";

export interface Arrowhead {
  /**
   * The connector. A `triangle` pulls its last point back to the base of the head; `open` and
   * `none` keep the full line.
   */
  readonly line: Point[];
  /**
   * `triangle`: tip first, then the two base corners. `open`: one base corner, the tip, the other
   * corner, drawn as an unfilled polyline. `none`: empty.
   */
  readonly head: Point[];
}

export function arrowhead(
  points: readonly Point[],
  length = ARROW_LENGTH,
  width = ARROW_WIDTH,
  shape: ArrowheadShape = "triangle",
): Arrowhead {
  if (shape === "none") return { line: [...points], head: [] };
  const tip = points[points.length - 1]!;
  let from = points[points.length - 2] ?? { x: tip.x, y: tip.y - 1 };
  if (samePoint(from, tip)) from = { x: tip.x, y: tip.y - 1 };
  const dx = tip.x - from.x;
  const dy = tip.y - from.y;
  const distance = Math.hypot(dx, dy);
  const ux = dx / distance;
  const uy = dy / distance;
  const base = { x: tip.x - ux * length, y: tip.y - uy * length };
  const px = -uy * (width / 2);
  const py = ux * (width / 2);
  const left = { x: base.x + px, y: base.y + py };
  const right = { x: base.x - px, y: base.y - py };
  if (shape === "open") return { line: [...points], head: [left, tip, right] };
  const line = points.slice(0, -1);
  line.push(distance > length ? base : from);
  return { line, head: [tip, left, right] };
}

const n = (value: number) => String(Math.round(value * 100) / 100);

/** Cylinder as two paths: the body (drawn first) and the top ellipse. */
export function cylinderPaths(box: Box): { body: string; top: string; ry: number } {
  const rx = box.width / 2;
  const ry = Math.min(8, box.height * 0.15);
  const x = box.x;
  const w = box.width;
  const yt = box.y + ry;
  const yb = boxBottom(box) - ry;
  const body = `M${n(x)} ${n(yt)} L${n(x)} ${n(yb)} A${n(rx)} ${n(ry)} 0 0 0 ${n(x + w)} ${n(yb)} L${n(x + w)} ${n(yt)} A${n(rx)} ${n(ry)} 0 0 1 ${n(x)} ${n(yt)} Z`;
  const top = `M${n(x)} ${n(yt)} A${n(rx)} ${n(ry)} 0 0 1 ${n(x + w)} ${n(yt)} A${n(rx)} ${n(ry)} 0 0 1 ${n(x)} ${n(yt)} Z`;
  return { body, top, ry };
}

/** An ellipse inscribed in the box, as two arcs. */
export function ellipsePath(box: Box): string {
  const c = boxCenter(box);
  const rx = box.width / 2;
  const ry = box.height / 2;
  return `M${n(box.x)} ${n(c.y)} A${n(rx)} ${n(ry)} 0 1 0 ${n(boxRight(box))} ${n(c.y)} A${n(rx)} ${n(ry)} 0 1 0 ${n(box.x)} ${n(c.y)} Z`;
}

export function diamondPath(box: Box): string {
  const c = boxCenter(box);
  return `M${n(c.x)} ${n(box.y)} L${n(boxRight(box))} ${n(c.y)} L${n(c.x)} ${n(boxBottom(box))} L${n(box.x)} ${n(c.y)} Z`;
}

export function polygonPath(points: readonly Point[]): string {
  return `${points.map((p, i) => `${i === 0 ? "M" : "L"}${n(p.x)} ${n(p.y)}`).join(" ")} Z`;
}
