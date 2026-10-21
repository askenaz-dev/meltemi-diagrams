import type { Point, Routing } from "@meltemi/diagrams-model";
import {
  anchorOnSide,
  boxCenter,
  routePoints,
  sideCenter,
  sideFacing,
  type Box,
  type Side,
} from "./geometry.js";

/** One end of a connector: its box and port, with the side and position of a named port. */
export interface ConnectorEnd {
  readonly box: Box;
  /** A compass side, `auto`, or a named port. */
  readonly port: string;
  /**
   * A named port or a point of a side: its side and position on `box`, or, on a turned element,
   * the side it faces and its `point` on the turned outline, which `box` (the drawn box) holds.
   */
  readonly named: {
    readonly side: Side;
    readonly position: number;
    readonly point?: Point;
  } | null;
}

/** The point of a named end: its own, or its position along its side of the box. */
function namedPoint(e: ConnectorEnd): Point {
  return e.named!.point ?? portPoint(e.box, e.named!.side, e.named!.position);
}

/** Spacing between parallel relations. */
export const LANE_SPACING = 16;

/** The point of a named port: its position along the side, left to right or top to bottom. */
export function portPoint(box: Box, side: Side, position: number): Point {
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

const vertical = (side: Side) => side === "north" || side === "south";

/** Outward unit normal of a side. */
export function sideNormal(side: Side): Point {
  switch (side) {
    case "north":
      return { x: 0, y: -1 };
    case "south":
      return { x: 0, y: 1 };
    case "west":
      return { x: -1, y: 0 };
    case "east":
      return { x: 1, y: 0 };
  }
}

/** The side of a point lying on a box's border. */
export function sideOfPoint(box: Box, point: Point): Side {
  const distances: [Side, number][] = [
    ["north", Math.abs(point.y - box.y)],
    ["south", Math.abs(point.y - (box.y + box.height))],
    ["west", Math.abs(point.x - box.x)],
    ["east", Math.abs(point.x - (box.x + box.width))],
  ];
  distances.sort((a, b) => a[1] - b[1]);
  return distances[0]![0];
}

/** Moves an anchor along its side by `offset`, clamped to the side. */
function slide(box: Box, side: Side, point: Point, offset: number): Point {
  if (vertical(side)) {
    return { x: Math.min(box.x + box.width, Math.max(box.x, point.x + offset)), y: point.y };
  }
  return { x: point.x, y: Math.min(box.y + box.height, Math.max(box.y, point.y + offset)) };
}

/** How far each end of a connector moves along its side: one lane for both, or one per end. */
export type Lanes = number | { readonly from: number; readonly to: number };

/**
 * The anchors and the default points of a connector (decision 0006), with named ports anchored at
 * their point and free ends moved along their sides by their lanes (`lane`, in pixels).
 */
export function anchorPoints(
  from: ConnectorEnd,
  to: ConnectorEnd,
  via: readonly Point[],
  lane: Lanes,
): {
  points: Point[];
  fromSide: Side;
  toSide: Side;
} {
  const fromLane = typeof lane === "number" ? lane : lane.from;
  const toLane = typeof lane === "number" ? lane : lane.to;
  if (!from.named && !to.named) {
    const points = routePoints(
      from.box,
      from.port as Side | "auto",
      to.box,
      to.port as Side | "auto",
      via,
    );
    // A written compass port names the side; an anchor in a corner would be ambiguous.
    const fromSide = from.port === "auto" ? sideOfPoint(from.box, points[0]!) : (from.port as Side);
    const toSide =
      to.port === "auto" ? sideOfPoint(to.box, points[points.length - 1]!) : (to.port as Side);
    if ((fromLane !== 0 || toLane !== 0) && via.length === 0) {
      const first = points[0]!;
      const last = points[points.length - 1]!;
      const a = slide(from.box, fromSide, first, fromLane);
      const b = slide(to.box, toSide, last, toLane);
      if (points.length === 3) {
        const elbow = vertical(fromSide) ? { x: a.x, y: b.y } : { x: b.x, y: a.y };
        return { points: [a, elbow, b], fromSide, toSide };
      }
      // Ends in line that take different lanes are joined like ports, square to their sides.
      const inLine = Math.abs(first.x - last.x) < 0.01 || Math.abs(first.y - last.y) < 0.01;
      if (fromLane !== toLane && inLine) {
        return { points: [a, ...portElbows(a, fromSide, b, toSide), b], fromSide, toSide };
      }
      return { points: [a, b], fromSide, toSide };
    }
    return { points, fromSide, toSide };
  }
  const end = (e: ConnectorEnd, neighbour: Point, offset: number): { point: Point; side: Side } => {
    if (e.named) return { point: namedPoint(e), side: e.named.side };
    const side = e.port === "auto" ? sideFacing(e.box, neighbour) : (e.port as Side);
    return {
      point:
        via.length > 0
          ? anchorOnSide(e.box, side, neighbour)
          : slide(e.box, side, sideCenter(e.box, side), offset),
      side,
    };
  };
  const toTarget = to.named ? namedPoint(to) : boxCenter(to.box);
  const fromTarget = from.named ? namedPoint(from) : boxCenter(from.box);
  const a = end(from, via[0] ?? toTarget, fromLane);
  const b = end(to, via[via.length - 1] ?? fromTarget, toLane);
  const points =
    via.length > 0
      ? [a.point, ...via, b.point]
      : [a.point, ...portElbows(a.point, a.side, b.point, b.side), b.point];
  return { points, fromSide: a.side, toSide: b.side };
}

/** Length of the straight stub a connector keeps out of a port before it turns. */
const STUB = 20;

const dot = (p: Point, q: Point) => p.x * q.x + p.y * q.y;

/**
 * Elbows of an orthogonal connector from `a`, leaving along the normal of `aSide`, to `b`, entering
 * along the normal of `bSide`: none when the ports face each other in line, a Z through the
 * middle when they face each other, one elbow for perpendicular sides, and otherwise a path out
 * through a short stub at each end.
 */
function portElbows(a: Point, aSide: Side, b: Point, bSide: Side): Point[] {
  const na = sideNormal(aSide);
  const nb = sideNormal(bSide);
  const ahead = (from: Point, to: Point, normal: Point) =>
    dot({ x: to.x - from.x, y: to.y - from.y }, normal) > 0;
  if (vertical(aSide) === vertical(bSide)) {
    // Facing sides with room between them.
    if (na.x === -nb.x && na.y === -nb.y && ahead(a, b, na)) {
      if (vertical(aSide)) {
        if (a.x === b.x) return [];
        const my = (a.y + b.y) / 2;
        return [
          { x: a.x, y: my },
          { x: b.x, y: my },
        ];
      }
      if (a.y === b.y) return [];
      const mx = (a.x + b.x) / 2;
      return [
        { x: mx, y: a.y },
        { x: mx, y: b.y },
      ];
    }
  } else {
    const elbow = vertical(aSide) ? { x: a.x, y: b.y } : { x: b.x, y: a.y };
    if (ahead(a, elbow, na) && ahead(b, elbow, nb)) return [elbow];
  }
  const a1 = { x: a.x + na.x * STUB, y: a.y + na.y * STUB };
  const b1 = { x: b.x + nb.x * STUB, y: b.y + nb.y * STUB };
  const join = vertical(aSide) ? { x: b1.x, y: a1.y } : { x: a1.x, y: b1.y };
  const out = [a1];
  if (!same(join, a1) && !same(join, b1)) out.push(join);
  out.push(b1);
  return out;
}

const same = (a: Point, b: Point) => Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;

/**
 * Inserts one elbow between consecutive points that differ on both axes. The first segment leaves
 * along the normal of `firstSide`; with `lastSide`, the last one enters along its normal, and two
 * points without waypoints are joined like ports (none, one or two elbows, or stubs).
 */
export function orthogonalize(points: readonly Point[], firstSide: Side, lastSide?: Side): Point[] {
  if (points.length === 2 && lastSide) {
    const [a, b] = points as [Point, Point];
    return [a, ...portElbows(a, firstSide, b, lastSide), b];
  }
  const out: Point[] = [points[0]!];
  let horizontal = !vertical(firstSide);
  for (let i = 1; i < points.length; i++) {
    const a = out[out.length - 1]!;
    const b = points[i]!;
    if (Math.abs(a.x - b.x) > 0.01 && Math.abs(a.y - b.y) > 0.01) {
      // Into the last point, the final segment runs along the normal of its side.
      if (lastSide && i === points.length - 1) horizontal = vertical(lastSide);
      const elbow = horizontal ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
      out.push(elbow);
      horizontal = !horizontal;
    } else {
      horizontal = Math.abs(a.y - b.y) <= 0.01;
    }
    if (!same(out[out.length - 1]!, b)) out.push(b);
  }
  return out;
}

const n = (value: number) => {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? "0" : String(rounded);
};

/**
 * A smooth cubic curve through `points` (Catmull-Rom), leaving and entering perpendicular to the
 * box sides. The curve ends at `end`, the base of the end's head when there is one, and starts at
 * `start`, the base of the start's head; the returned polyline samples it for labels and checks.
 */
export function bezierThrough(
  points: readonly Point[],
  fromSide: Side,
  toSide: Side,
  end: Point,
  start: Point = points[0]!,
): {
  d: string;
  samples: Point[];
} {
  const pts = [start, ...points.slice(1, -1), end];
  const count = pts.length;
  const tangents: Point[] = [];
  for (let i = 0; i < count; i++) {
    const p = pts[i]!;
    if (i === 0 || i === count - 1) {
      const neighbour = pts[i === 0 ? 1 : count - 2]!;
      const length = Math.hypot(neighbour.x - p.x, neighbour.y - p.y);
      const normal = sideNormal(i === 0 ? fromSide : toSide);
      const sign = i === 0 ? 1 : -1;
      tangents.push({ x: normal.x * length * sign, y: normal.y * length * sign });
    } else {
      const prev = pts[i - 1]!;
      const next = pts[i + 1]!;
      tangents.push({ x: (next.x - prev.x) / 2, y: (next.y - prev.y) / 2 });
    }
  }
  let d = `M${n(pts[0]!.x)} ${n(pts[0]!.y)}`;
  const samples: Point[] = [pts[0]!];
  for (let i = 0; i < count - 1; i++) {
    const p0 = pts[i]!;
    const p1 = pts[i + 1]!;
    const c1 = { x: p0.x + tangents[i]!.x / 3, y: p0.y + tangents[i]!.y / 3 };
    const c2 = { x: p1.x - tangents[i + 1]!.x / 3, y: p1.y - tangents[i + 1]!.y / 3 };
    d += `C${n(c1.x)} ${n(c1.y)} ${n(c2.x)} ${n(c2.y)} ${n(p1.x)} ${n(p1.y)}`;
    for (let s = 1; s <= 12; s++) {
      const t = s / 12;
      const u = 1 - t;
      samples.push({
        x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p1.x,
        y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p1.y,
      });
    }
  }
  return { d, samples };
}

/** Applies a route kind to anchors and waypoints. `auto` keeps the default points. */
export function shapeRoute(
  kind: Routing,
  points: readonly Point[],
  anchors: { first: Point; last: Point; via: readonly Point[] },
  fromSide: Side,
  toSide: Side,
): Point[] {
  switch (kind) {
    case "auto":
      return [...points];
    case "orthogonal":
      return orthogonalize([anchors.first, ...anchors.via, anchors.last], fromSide, toSide);
    case "polyline":
    case "bezier":
      return [anchors.first, ...anchors.via, anchors.last];
  }
}

/**
 * Moves the first or last point of an orthogonal route along its segment onto the border of
 * `box`, when the segment runs into the box from outside or stops short of it.
 */
export function snapEnd(points: readonly Point[], box: Box, end: "first" | "last"): Point[] {
  const out = [...points];
  if (out.length < 2) return out;
  const i = end === "first" ? 0 : out.length - 1;
  const tip = out[i]!;
  const next = out[end === "first" ? 1 : out.length - 2]!;
  const right = box.x + box.width;
  const bottom = box.y + box.height;
  if (Math.abs(tip.y - next.y) < 0.5 && tip.y >= box.y && tip.y <= bottom) {
    // A horizontal segment: the end goes to the side facing the rest of the route.
    const x = next.x >= right ? right : next.x <= box.x ? box.x : null;
    if (x !== null) out[i] = { x, y: tip.y };
  } else if (Math.abs(tip.x - next.x) < 0.5 && tip.x >= box.x && tip.x <= right) {
    const y = next.y >= bottom ? bottom : next.y <= box.y ? box.y : null;
    if (y !== null) out[i] = { x: tip.x, y };
  }
  return out;
}

/** Insets of a box, in pixels, inside which a crossing counts: touching a border does not. */
const CROSSING_INSET = 1;

/** Whether a segment passes through the inside of a box (Liang–Barsky clipping). */
export function segmentCrossesBox(a: Point, b: Point, box: Box): boolean {
  const x0 = box.x + CROSSING_INSET;
  const y0 = box.y + CROSSING_INSET;
  const x1 = box.x + box.width - CROSSING_INSET;
  const y1 = box.y + box.height - CROSSING_INSET;
  if (x1 <= x0 || y1 <= y0) return false;
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const clips: readonly (readonly [number, number])[] = [
    [-dx, a.x - x0],
    [dx, x1 - a.x],
    [-dy, a.y - y0],
    [dy, y1 - a.y],
  ];
  for (const [p, q] of clips) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 > t1) return false;
  }
  return t1 - t0 > 1e-6;
}

/** The boxes a route passes through. */
export function crossedBoxes<T extends Box>(points: readonly Point[], boxes: readonly T[]): T[] {
  return boxes.filter((box) => {
    for (let i = 1; i < points.length; i++) {
      if (segmentCrossesBox(points[i - 1]!, points[i]!, box)) return true;
    }
    return false;
  });
}

const SIDES: readonly Side[] = ["north", "east", "south", "west"];

/** Drops repeated points and the middle points of straight runs. */
function simplify(points: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) continue;
    out.push(p);
    while (out.length >= 3) {
      const [a, b, c] = out.slice(-3) as [Point, Point, Point];
      const straight =
        (Math.abs(a.x - b.x) < 0.01 && Math.abs(b.x - c.x) < 0.01) ||
        (Math.abs(a.y - b.y) < 0.01 && Math.abs(b.y - c.y) < 0.01);
      if (!straight) break;
      out.splice(out.length - 2, 1);
    }
  }
  return out;
}

const routeLength = (points: readonly Point[]) => {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.abs(points[i]!.x - points[i - 1]!.x) + Math.abs(points[i]!.y - points[i - 1]!.y);
  }
  return total;
};

/**
 * An orthogonal route between two boxes that passes through fewer of `obstacles` than `current`
 * does: L and Z routes between the middles of every pair of sides, leaving and entering each box
 * straight, ranked by the obstacles they cross, then by length and bends. Undefined when no such
 * route crosses fewer boxes. `extra` counts other things a route crosses (the labels of its ends).
 */
export function avoidingRoute(
  from: Box,
  to: Box,
  obstacles: readonly Box[],
  current: readonly Point[],
  extra: (route: readonly Point[]) => number = () => 0,
): { points: Point[]; fromSide: Side; toSide: Side } | undefined {
  const baseline = crossedBoxes(current, obstacles).length + extra(current);
  if (baseline === 0) return undefined;
  let best:
    { points: Point[]; fromSide: Side; toSide: Side; cost: number; crossed: number } | undefined;
  for (const fromSide of SIDES) {
    for (const toSide of SIDES) {
      const a = sideCenter(from, fromSide);
      const b = sideCenter(to, toSide);
      const na = sideNormal(fromSide);
      const nb = sideNormal(toSide);
      const a1 = { x: a.x + na.x * STUB, y: a.y + na.y * STUB };
      const b1 = { x: b.x + nb.x * STUB, y: b.y + nb.y * STUB };
      const middle = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
      const shapes: Point[][] = [
        [a, a1, { x: a1.x, y: b1.y }, b1, b],
        [a, a1, { x: b1.x, y: a1.y }, b1, b],
        [a, a1, { x: a1.x, y: middle.y }, { x: b1.x, y: middle.y }, b1, b],
        [a, a1, { x: middle.x, y: a1.y }, { x: middle.x, y: b1.y }, b1, b],
      ];
      for (const shape of shapes) {
        const points = simplify(shape);
        if (points.length < 2) continue;
        // Between the stubs, the route stays out of both of its boxes.
        let enters = false;
        for (let i = 2; i < points.length - 1 && !enters; i++) {
          enters =
            segmentCrossesBox(points[i - 1]!, points[i]!, from) ||
            segmentCrossesBox(points[i - 1]!, points[i]!, to);
        }
        if (enters) continue;
        if (
          segmentCrossesBox(points[0]!, points[1]!, to) ||
          segmentCrossesBox(points[points.length - 2]!, points[points.length - 1]!, from)
        ) {
          continue;
        }
        const crossed = crossedBoxes(points, obstacles).length + extra(points);
        const cost = crossed * 1e6 + routeLength(points) + (points.length - 2) * 24;
        if (!best || cost < best.cost) best = { points, fromSide, toSide, cost, crossed };
      }
    }
  }
  if (!best || best.crossed >= baseline) return undefined;
  return { points: best.points, fromSide: best.fromSide, toSide: best.toSide };
}

/** An end of a detour: its box, the point of its border and the side it leaves or enters by. */
export interface DetourEnd {
  readonly box: Box;
  readonly point: Point;
  readonly side: Side;
}

/** What a change of direction costs a detour, in pixels of length. */
const BEND_COST = 40;
/** How far around its ends a detour looks for the boxes in its way. */
const DETOUR_REACH = 240;

/** The direction of a step: east, south, west, north. */
const STEPS: readonly Point[] = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];
const stepOf = (normal: Point) =>
  STEPS.findIndex((s) => s.x === Math.sign(normal.x) && s.y === Math.sign(normal.y));

/** Sorted distinct coordinates. */
function lines(values: Iterable<number>): number[] {
  const out: number[] = [];
  for (const v of [...values].sort((a, b) => a - b)) {
    if (out.length === 0 || v - out[out.length - 1]! > 0.01) out.push(v);
  }
  return out;
}

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/**
 * The shortest orthogonal route from `from` to `to` that passes through none of `obstacles` and
 * neither end box. It leaves and enters square to the ends' sides with a 20 px stub and runs along
 * the lines through the stubs and 20 px outside every box near the ends; each change of direction
 * costs 40 px. Undefined when every way is blocked.
 */
export function detourRoute(
  from: DetourEnd,
  to: DetourEnd,
  obstacles: readonly Box[],
): Point[] | undefined {
  const na = sideNormal(from.side);
  const nb = sideNormal(to.side);
  const start = { x: from.point.x + na.x * STUB, y: from.point.y + na.y * STUB };
  const goal = { x: to.point.x + nb.x * STUB, y: to.point.y + nb.y * STUB };
  const left = Math.min(from.box.x, to.box.x) - DETOUR_REACH;
  const top = Math.min(from.box.y, to.box.y) - DETOUR_REACH;
  const region: Box = {
    x: left,
    y: top,
    width: Math.max(from.box.x + from.box.width, to.box.x + to.box.width) + DETOUR_REACH - left,
    height: Math.max(from.box.y + from.box.height, to.box.y + to.box.height) + DETOUR_REACH - top,
  };
  const blockers = [from.box, to.box, ...obstacles.filter((b) => overlaps(b, region))];
  const xs = lines([
    start.x,
    goal.x,
    ...blockers.flatMap((b) => [b.x - STUB, b.x + b.width + STUB]),
  ]);
  const ys = lines([
    start.y,
    goal.y,
    ...blockers.flatMap((b) => [b.y - STUB, b.y + b.height + STUB]),
  ]);
  const index = (values: readonly number[], v: number) =>
    values.findIndex((w) => Math.abs(w - v) <= 0.01);
  const nx = xs.length;
  const ny = ys.length;
  const startNode = index(ys, start.y) * nx + index(xs, start.x);
  const goalNode = index(ys, goal.y) * nx + index(xs, goal.x);
  const point = (node: number): Point => ({ x: xs[node % nx]!, y: ys[Math.floor(node / nx)]! });
  /** The node one step from `node` in direction `d`, when the step crosses no box. */
  const free = new Map<number, boolean>();
  const next = (node: number, d: number): number | undefined => {
    const i = (node % nx) + STEPS[d]!.x;
    const j = Math.floor(node / nx) + STEPS[d]!.y;
    if (i < 0 || j < 0 || i >= nx || j >= ny) return undefined;
    const target = j * nx + i;
    const key = Math.min(node, target) * 2 + (STEPS[d]!.x !== 0 ? 0 : 1);
    let ok = free.get(key);
    if (ok === undefined) {
      const a = point(node);
      const b = point(target);
      ok = !blockers.some((box) => segmentCrossesBox(a, b, box));
      free.set(key, ok);
    }
    return ok ? target : undefined;
  };
  // Dijkstra over (node, direction of the last step), with a binary heap.
  const cost = new Float64Array(nx * ny * 4).fill(Infinity);
  const previous = new Int32Array(nx * ny * 4).fill(-1);
  const heap: [number, number][] = [];
  const push = (c: number, state: number) => {
    heap.push([c, state]);
    for (let k = heap.length - 1; k > 0;) {
      const parent = (k - 1) >> 1;
      if (heap[parent]![0] <= heap[k]![0]) break;
      [heap[parent], heap[k]] = [heap[k]!, heap[parent]!];
      k = parent;
    }
  };
  const pop = (): [number, number] => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      for (let k = 0; ;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < heap.length && heap[l]![0] < heap[m]![0]) m = l;
        if (r < heap.length && heap[r]![0] < heap[m]![0]) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k]!, heap[m]!];
        k = m;
      }
    }
    return top;
  };
  const first = startNode * 4 + stepOf(na);
  cost[first] = 0;
  push(0, first);
  const arrival = stepOf({ x: -nb.x, y: -nb.y });
  let best = -1;
  let bestCost = Infinity;
  while (heap.length > 0) {
    const [c, state] = pop();
    if (c > cost[state]! || c >= bestCost) continue;
    const node = state >> 2;
    const d = state & 3;
    if (node === goalNode) {
      const total = c + (d === arrival ? 0 : BEND_COST);
      if (total < bestCost) {
        bestCost = total;
        best = state;
      }
    }
    for (let e = 0; e < 4; e++) {
      if (e === (d + 2) % 4) continue;
      const target = next(node, e);
      if (target === undefined) continue;
      const a = point(node);
      const b = point(target);
      const step = Math.abs(b.x - a.x) + Math.abs(b.y - a.y) + (e === d ? 0 : BEND_COST);
      const state2 = target * 4 + e;
      if (c + step < cost[state2]!) {
        cost[state2] = c + step;
        previous[state2] = state;
        push(c + step, state2);
      }
    }
  }
  if (best < 0) return undefined;
  const path: Point[] = [];
  for (let state = best; state >= 0; state = previous[state]!) path.unshift(point(state >> 2));
  return simplify([from.point, ...path, to.point]);
}
