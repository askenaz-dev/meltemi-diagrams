import type {
  GroupItem,
  PathItem,
  PolylineItem,
  RectItem,
  SceneItem,
  SceneRole,
} from "@meltemi/diagrams-layout";

/** A sketch level that paints: `light` or `rough`. */
export type SketchLevel = "light" | "rough";

interface Point {
  readonly x: number;
  readonly y: number;
}

/** A piece of an outline, flattened: its points and whether it closes on its start. */
interface Subpath {
  readonly points: Point[];
  readonly closed: boolean;
}

/** How far apart the samples of a stroke are, and how far each moves off the outline. */
const LEVELS: Readonly<Record<SketchLevel, { readonly step: number; readonly jitter: number }>> = {
  light: { step: 16, jitter: 0.6 },
  rough: { step: 12, jitter: 1.4 },
};

/** The roles whose strokes are painted by hand; icons, the mark and motion overlays are not. */
const SKETCHED: ReadonlySet<SceneRole> = new Set<SceneRole>([
  "element",
  "relation",
  "label",
  "frame",
  "lifeline",
  "event",
]);

/** A turn sharper than this, in radians, is a corner the samples keep. */
const CORNER = Math.PI / 6;

/** How finely curves are flattened before they are sampled again, in pixels. */
const FLATTEN = 2;

/**
 * The items of a scene with every stroke painted by hand: each stroked `rect`, `path` and
 * `polyline` of a group whose role is `element`, `relation`, `label`, `frame`, `lifeline` or
 * `event` becomes its fill alone (when it has one) followed by two stroke-only paths, its outline
 * sampled every 16 px (`light`) or 12 px (`rough`) and each sample moved along the outline's
 * normal by at most 0.6 px or 1.4 px. The jitter comes from a pseudo-random sequence seeded by the
 * group's id and the pass, so the same text paints the same bytes and an edit elsewhere leaves a
 * shape's wobble alone. Text, images, icons, gradient strokes and invisible overlays are kept.
 */
export function sketchItems(items: readonly SceneItem[], level: SketchLevel): SceneItem[] {
  return items.map((item) => (item.kind === "group" ? sketchGroup(item, level) : item));
}

function sketchGroup(group: GroupItem, level: SketchLevel): GroupItem {
  if (!SKETCHED.has(group.role)) return group;
  const passes = [random(hash(`${group.id}\u0000${0}`)), random(hash(`${group.id}\u0000${1}`))];
  const items: SceneItem[] = [];
  for (const item of group.items) {
    if (item.kind === "group") {
      items.push(sketchGroup(item, level));
      continue;
    }
    if (!sketchable(item)) {
      items.push(item);
      continue;
    }
    const outline = subpathsOf(item);
    if (outline.length === 0) {
      items.push(item);
      continue;
    }
    const fill = fillOf(item);
    if (fill) items.push(fill);
    for (const next of passes) {
      items.push(strokePass(item, sketchPath(outline, LEVELS[level], next)));
    }
  }
  return { ...group, items };
}

/** Whether an item has a stroke the hand paints: seen, solid in colour, without a transform. */
function sketchable(item: SceneItem): item is RectItem | PathItem | PolylineItem {
  if (item.kind !== "rect" && item.kind !== "path" && item.kind !== "polyline") return false;
  if (item.stroke === "none" || item.stroke.startsWith("url(") || !(item.strokeWidth > 0)) {
    return false;
  }
  if (item.opacity === 0) return false;
  return !(item.kind === "path" && item.transform);
}

/** The item's fill alone, without its stroke; none for a polyline or an unfilled shape. */
function fillOf(item: RectItem | PathItem | PolylineItem): SceneItem | undefined {
  if (item.kind === "polyline" || item.fill === "none") return undefined;
  const { className: _class, dash: _dash, ...rest } = item;
  return { ...rest, stroke: "none", strokeWidth: 0, dashed: false };
}

/** One stroke-only pass of an item, with its width, dash, class and opacity. */
function strokePass(item: RectItem | PathItem | PolylineItem, d: string): PathItem {
  return {
    kind: "path",
    d,
    fill: "none",
    stroke: item.stroke,
    strokeWidth: item.strokeWidth,
    dashed: item.dashed,
    rounded: true,
    ...(item.dash ? { dash: item.dash } : {}),
    ...(item.opacity !== undefined ? { opacity: item.opacity } : {}),
    ...(item.kind === "path" && item.strokeOpacity !== undefined
      ? { strokeOpacity: item.strokeOpacity }
      : {}),
    ...(item.className ? { className: item.className } : {}),
  };
}

// ------------------------------------------------------------------ outlines

function subpathsOf(item: RectItem | PathItem | PolylineItem): Subpath[] {
  if (item.kind === "polyline")
    return item.points.length >= 2 ? [{ points: [...item.points], closed: false }] : [];
  if (item.kind === "rect") return [rectOutline(item)];
  return parsePath(item.d);
}

/** A rectangle's outline: four sides with a quarter arc at each corner for its radius. */
function rectOutline(rect: RectItem): Subpath {
  const { x, y, width, height } = rect;
  const r = Math.max(0, Math.min(rect.radius, width / 2, height / 2));
  const points: Point[] = [];
  const arc = (cx: number, cy: number, from: number) => {
    const steps = Math.max(2, Math.ceil((r * Math.PI) / 2 / FLATTEN));
    for (let i = 0; i <= steps; i++) {
      const a = from + (i / steps) * (Math.PI / 2);
      points.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
  };
  if (r === 0) {
    points.push(
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
    );
  } else {
    arc(x + width - r, y + r, -Math.PI / 2);
    arc(x + width - r, y + height - r, 0);
    arc(x + r, y + height - r, Math.PI / 2);
    arc(x + r, y + r, Math.PI);
  }
  return { points, closed: true };
}

const COMMAND = /[MmLlHhVvCcSsQqTtAaZz]/;
const NUMBER = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;

/** The tokens of path data: command letters and numbers. */
function tokens(d: string): (string | number)[] {
  const out: (string | number)[] = [];
  let i = 0;
  while (i < d.length) {
    const c = d[i]!;
    if (COMMAND.test(c)) {
      out.push(c);
      i++;
      continue;
    }
    if (c === " " || c === "," || c === "\n" || c === "\t" || c === "\r") {
      i++;
      continue;
    }
    NUMBER.lastIndex = i;
    const match = NUMBER.exec(d);
    if (!match) return out;
    out.push(Number(match[0]));
    i = NUMBER.lastIndex;
  }
  return out;
}

/** Path data flattened into subpaths: lines kept, curves and arcs sampled every few pixels. */
function parsePath(d: string): Subpath[] {
  const list = tokens(d);
  const subpaths: Subpath[] = [];
  let current: Point[] | undefined;
  let start: Point = { x: 0, y: 0 };
  let at: Point = { x: 0, y: 0 };
  let control: Point | undefined;
  let command = "";
  let i = 0;
  const number = () => {
    const value = list[i];
    i++;
    return typeof value === "number" ? value : NaN;
  };
  const finish = (closed: boolean) => {
    if (current && current.length >= 2) subpaths.push({ points: current, closed });
    current = undefined;
  };
  const lineTo = (p: Point) => {
    if (!current) current = [at];
    current.push(p);
    at = p;
  };
  while (i < list.length) {
    const token = list[i];
    if (typeof token === "string") {
      command = token;
      i++;
      if (command === "Z" || command === "z") {
        if (current) {
          finish(true);
        }
        at = start;
        control = undefined;
        continue;
      }
    } else if (command === "") {
      return subpaths;
    }
    const relative = command === command.toLowerCase();
    const base = relative ? at : { x: 0, y: 0 };
    switch (command.toUpperCase()) {
      case "M": {
        finish(false);
        const p = { x: base.x + number(), y: base.y + number() };
        at = p;
        start = p;
        current = [p];
        // Pairs after a move are lines.
        command = relative ? "l" : "L";
        control = undefined;
        break;
      }
      case "L":
        lineTo({ x: base.x + number(), y: base.y + number() });
        control = undefined;
        break;
      case "H":
        lineTo({ x: (relative ? at.x : 0) + number(), y: at.y });
        control = undefined;
        break;
      case "V":
        lineTo({ x: at.x, y: (relative ? at.y : 0) + number() });
        control = undefined;
        break;
      case "C":
      case "S": {
        const c1 =
          command.toUpperCase() === "C"
            ? { x: base.x + number(), y: base.y + number() }
            : control
              ? { x: 2 * at.x - control.x, y: 2 * at.y - control.y }
              : at;
        const c2 = { x: base.x + number(), y: base.y + number() };
        const end = { x: base.x + number(), y: base.y + number() };
        const from = at;
        const steps = curveSteps([from, c1, c2, end]);
        for (let k = 1; k <= steps; k++) lineTo(cubic(from, c1, c2, end, k / steps));
        control = c2;
        break;
      }
      case "Q":
      case "T": {
        const c =
          command.toUpperCase() === "Q"
            ? { x: base.x + number(), y: base.y + number() }
            : control
              ? { x: 2 * at.x - control.x, y: 2 * at.y - control.y }
              : at;
        const end = { x: base.x + number(), y: base.y + number() };
        const from = at;
        const steps = curveSteps([from, c, end]);
        for (let k = 1; k <= steps; k++) lineTo(quadratic(from, c, end, k / steps));
        control = c;
        break;
      }
      case "A": {
        const rx = number();
        const ry = number();
        const rotation = number();
        const large = number() !== 0;
        const sweep = number() !== 0;
        const end = { x: base.x + number(), y: base.y + number() };
        for (const p of arcPoints(at, end, rx, ry, rotation, large, sweep)) lineTo(p);
        control = undefined;
        break;
      }
      default:
        return subpaths;
    }
    if ([at.x, at.y].some((v) => !Number.isFinite(v))) return subpaths;
  }
  finish(false);
  return subpaths;
}

function curveSteps(points: readonly Point[]): number {
  let length = 0;
  for (let k = 1; k < points.length; k++) length += distance(points[k - 1]!, points[k]!);
  return Math.max(4, Math.min(64, Math.ceil(length / FLATTEN)));
}

function cubic(a: Point, b: Point, c: Point, d: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
    y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y,
  };
}

function quadratic(a: Point, b: Point, c: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * a.x + 2 * u * t * b.x + t * t * c.x,
    y: u * u * a.y + 2 * u * t * b.y + t * t * c.y,
  };
}

/** The points of an elliptical arc after its start, by the SVG endpoint parameterization. */
function arcPoints(
  from: Point,
  to: Point,
  rxIn: number,
  ryIn: number,
  degrees: number,
  large: boolean,
  sweep: boolean,
): Point[] {
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0 || (from.x === to.x && from.y === to.y)) return [to];
  const phi = (degrees * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (from.x - to.x) / 2;
  const dy = (from.y - to.y) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  const scale = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (scale > 1) {
    rx *= Math.sqrt(scale);
    ry *= Math.sqrt(scale);
  }
  const numerator = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const denominator = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const factor = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, numerator / denominator));
  const cx1 = (factor * rx * y1) / ry;
  const cy1 = (-factor * ry * x1) / rx;
  const cx = cos * cx1 - sin * cy1 + (from.x + to.x) / 2;
  const cy = sin * cx1 + cos * cy1 + (from.y + to.y) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const start = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let delta = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  const steps = Math.max(
    4,
    Math.min(96, Math.ceil((Math.abs(delta) * Math.max(rx, ry)) / FLATTEN)),
  );
  const points: Point[] = [];
  for (let k = 1; k <= steps; k++) {
    const t = start + (delta * k) / steps;
    const ex = rx * Math.cos(t);
    const ey = ry * Math.sin(t);
    points.push(k === steps ? to : { x: cos * ex - sin * ey + cx, y: sin * ex + cos * ey + cy });
  }
  return points;
}

// ------------------------------------------------------------------ the hand

/**
 * One pass of the hand over an outline: each subpath sampled every `step` pixels between the
 * corners it keeps, each sample moved along the normal by at most `jitter`, drawn through the
 * middles of its samples so the line bends smoothly, and a closed outline carried a little past
 * its start.
 */
function sketchPath(
  outline: readonly Subpath[],
  level: { readonly step: number; readonly jitter: number },
  next: () => number,
): string {
  const parts: string[] = [];
  for (const subpath of outline) {
    const points = dedupe(subpath.points, subpath.closed);
    if (points.length < 2) continue;
    const runs = runsOf(points, subpath.closed, level.step);
    if (subpath.closed && runs.length === 1 && !hasCorner(points)) {
      // A loop without a corner (an ellipse, a circle): drawn smoothly all the way round.
      const samples = runs[0]!.slice(0, -1).map((sample) => ({
        x: sample.point.x + sample.normal.x * level.jitter * (2 * next() - 1),
        y: sample.point.y + sample.normal.y * level.jitter * (2 * next() - 1),
      }));
      parts.push(...smoothLoop(samples, level.jitter * (1 + next())));
      continue;
    }
    const moved = runs.map((run) =>
      run.map((sample) => ({
        x: sample.point.x + sample.normal.x * level.jitter * (2 * next() - 1),
        y: sample.point.y + sample.normal.y * level.jitter * (2 * next() - 1),
      })),
    );
    // Runs share their corners: each run's first point is the last of the one before.
    for (let r = 1; r < moved.length; r++) moved[r]![0] = moved[r - 1]![moved[r - 1]!.length - 1]!;
    if (subpath.closed && moved.length > 0) {
      const first = moved[0]![0]!;
      const last = moved[moved.length - 1]!;
      // The hand goes a little past where it started.
      const second = moved[0]![1] ?? first;
      const length = distance(first, second) || 1;
      const over = level.jitter * (1 + next());
      last[last.length - 1] = {
        x: first.x + ((second.x - first.x) / length) * over,
        y: first.y + ((second.y - first.y) / length) * over,
      };
    }
    const start = moved[0]![0]!;
    parts.push(`M${f(start.x)} ${f(start.y)}`);
    for (const run of moved) parts.push(...smooth(run));
  }
  return parts.join(" ");
}

/** A run of samples drawn through the middles of its inner samples: corners stay corners. */
function smooth(run: readonly Point[]): string[] {
  if (run.length === 2) return [`L${f(run[1]!.x)} ${f(run[1]!.y)}`];
  const out: string[] = [];
  const mid = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const first = mid(run[0]!, run[1]!);
  out.push(`L${f(first.x)} ${f(first.y)}`);
  for (let k = 1; k < run.length - 1; k++) {
    const end = k === run.length - 2 ? run[k + 1]! : mid(run[k]!, run[k + 1]!);
    out.push(`Q${f(run[k]!.x)} ${f(run[k]!.y)} ${f(end.x)} ${f(end.y)}`);
  }
  return out;
}

/**
 * A closed loop of samples drawn through their middles, each sample a control: no corner where it
 * starts, and the hand carried `over` pixels past the start along the loop.
 */
function smoothLoop(samples: readonly Point[], over: number): string[] {
  const count = samples.length;
  if (count < 3) {
    return samples.map((p, k) => `${k === 0 ? "M" : "L"}${f(p.x)} ${f(p.y)}`).concat("Z");
  }
  const at = (k: number) => samples[k % count]!;
  const mid = (k: number) => ({ x: (at(k).x + at(k + 1).x) / 2, y: (at(k).y + at(k + 1).y) / 2 });
  const start = mid(0);
  const out = [`M${f(start.x)} ${f(start.y)}`];
  for (let k = 1; k <= count; k++) {
    const end = mid(k);
    out.push(`Q${f(at(k).x)} ${f(at(k).y)} ${f(end.x)} ${f(end.y)}`);
  }
  // Past the start, along the way the loop set off.
  const next = at(1);
  const length = distance(start, next) || 1;
  out.push(
    `L${f(start.x + ((next.x - start.x) / length) * over)} ${f(start.y + ((next.y - start.y) / length) * over)}`,
  );
  return out;
}

/** Whether a closed outline turns sharply anywhere. */
function hasCorner(points: readonly Point[]): boolean {
  const count = points.length;
  for (let k = 0; k < count; k++) {
    const a = points[(k + count - 1) % count]!;
    const b = points[k]!;
    const c = points[(k + 1) % count]!;
    const turn = Math.abs(
      Math.atan2(
        (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x),
        (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y),
      ),
    );
    if (turn > CORNER) return true;
  }
  return false;
}

interface Sample {
  readonly point: Point;
  readonly normal: Point;
}

/**
 * The outline cut at its corners into runs, each sampled evenly every `step` pixels at most: a
 * run's first and last samples are its corners (or the ends of an open outline). A closed
 * outline without a corner, a circle, starts at its first point.
 */
function runsOf(points: readonly Point[], closed: boolean, step: number): Sample[][] {
  const count = points.length;
  const at = (k: number) => points[((k % count) + count) % count]!;
  const isCorner = (k: number) => {
    if (!closed && (k === 0 || k === count - 1)) return true;
    const a = at(k - 1);
    const b = at(k);
    const c = at(k + 1);
    const turn = Math.abs(
      Math.atan2(
        (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x),
        (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y),
      ),
    );
    return turn > CORNER;
  };
  const corners: number[] = [];
  for (let k = 0; k < count; k++) if (isCorner(k)) corners.push(k);
  if (closed && corners.length === 0) corners.push(0);
  // The corner indices in order, a closed outline coming back to its first corner.
  const stops = closed ? [...corners, corners[0]! + count] : corners;
  const runs: Sample[][] = [];
  for (let r = 0; r < stops.length - 1; r++) {
    const from = stops[r]!;
    const to = stops[r + 1]!;
    const path: Point[] = [];
    for (let k = from; k <= to; k++) path.push(at(k));
    runs.push(
      sampleRun(
        path,
        step,
        closed || r > 0 ? at(from - 1) : undefined,
        closed || r < stops.length - 2 ? at(to + 1) : undefined,
      ),
    );
  }
  return runs;
}

/** A run's samples, evenly spaced along it, each with the unit normal of the outline there. */
function sampleRun(
  path: readonly Point[],
  step: number,
  before: Point | undefined,
  after: Point | undefined,
): Sample[] {
  const starts: number[] = [0];
  for (let k = 1; k < path.length; k++)
    starts.push(starts[k - 1]! + distance(path[k - 1]!, path[k]!));
  const total = starts[starts.length - 1]!;
  const pieces = Math.max(1, Math.ceil(total / step));
  const samples: Sample[] = [];
  const first = path[0]!;
  const last = path[path.length - 1]!;
  samples.push({ point: first, normal: cornerNormal(before, first, path[1]!) });
  let segment = 1;
  for (let k = 1; k < pieces; k++) {
    const along = (total * k) / pieces;
    while (segment < path.length - 1 && starts[segment]! < along) segment++;
    const a = path[segment - 1]!;
    const b = path[segment]!;
    const length = starts[segment]! - starts[segment - 1]!;
    const t = length === 0 ? 0 : (along - starts[segment - 1]!) / length;
    samples.push({
      point: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
      normal: normalOf(a, b),
    });
  }
  samples.push({ point: last, normal: cornerNormal(path[path.length - 2]!, last, after) });
  return samples;
}

/** The unit normal of a segment. */
function normalOf(a: Point, b: Point): Point {
  const length = distance(a, b);
  return length === 0 ? { x: 0, y: 0 } : { x: -(b.y - a.y) / length, y: (b.x - a.x) / length };
}

/** The normal at a corner: halfway between the normals of the segments that meet there. */
function cornerNormal(before: Point | undefined, at: Point, after: Point | undefined): Point {
  const a = before ? normalOf(before, at) : undefined;
  const b = after ? normalOf(at, after) : undefined;
  if (!a) return b ?? { x: 0, y: 0 };
  if (!b) return a;
  const sum = { x: a.x + b.x, y: a.y + b.y };
  const length = Math.hypot(sum.x, sum.y);
  return length < 1e-6 ? a : { x: sum.x / length, y: sum.y / length };
}

/** The points without repeats, a closed outline without its start repeated at the end. */
function dedupe(points: readonly Point[], closed: boolean): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || distance(last, p) > 1e-6) out.push(p);
  }
  if (closed && out.length > 1 && distance(out[0]!, out[out.length - 1]!) <= 1e-6) out.pop();
  return out;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** A coordinate to two decimals, without a trailing zero. */
function f(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

/** FNV-1a, 32 bits: the seed of a group's passes. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let k = 0; k < text.length; k++) {
    h ^= text.charCodeAt(k);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: a small seeded generator of numbers in [0, 1). */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
