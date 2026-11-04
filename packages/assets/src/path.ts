/**
 * Path geometry for icons: path data parsing and serialisation, affine transforms, shape-to-path
 * conversion and bounding boxes. Curves and arcs are flattened to points for bounds only; the path
 * data drawn is the parsed path written back with absolute commands.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** An affine matrix `[a b c d e f]`, as in SVG `matrix(a b c d e f)`. */
export type Matrix = readonly [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function apply(m: Matrix, p: Point): Point {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

export function isIdentity(m: Matrix): boolean {
  return m.every((v, i) => v === IDENTITY[i]);
}

/** The average scale of a matrix, used to scale stroke widths. */
export function matrixScale(m: Matrix): number {
  return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
}

const NUMBER = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;

/** Reads the numbers of an attribute such as `points` or `viewBox`. */
export function readNumbers(text: string): number[] | undefined {
  const numbers: number[] = [];
  let pos = 0;
  for (;;) {
    while (pos < text.length && /[\s,]/.test(text[pos]!)) pos++;
    if (pos >= text.length) return numbers;
    NUMBER.lastIndex = pos;
    const match = NUMBER.exec(text);
    if (!match) return undefined;
    numbers.push(Number(match[0]));
    pos = NUMBER.lastIndex;
  }
}

/** Parses an SVG `transform` list into one matrix, or undefined when it cannot be read. */
export function parseTransform(text: string): Matrix | undefined {
  let matrix: Matrix = IDENTITY;
  const pattern = /\s*,?\s*(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/y;
  let pos = 0;
  const trimmed = text.trim();
  while (pos < trimmed.length) {
    pattern.lastIndex = pos;
    const match = pattern.exec(trimmed);
    if (!match) return undefined;
    pos = pattern.lastIndex;
    const args = readNumbers(match[2]!);
    if (!args) return undefined;
    let next: Matrix;
    switch (match[1]) {
      case "matrix":
        if (args.length !== 6) return undefined;
        next = args as unknown as Matrix;
        break;
      case "translate":
        if (args.length < 1 || args.length > 2) return undefined;
        next = [1, 0, 0, 1, args[0]!, args[1] ?? 0];
        break;
      case "scale":
        if (args.length < 1 || args.length > 2) return undefined;
        next = [args[0]!, 0, 0, args[1] ?? args[0]!, 0, 0];
        break;
      case "rotate": {
        if (args.length !== 1 && args.length !== 3) return undefined;
        const a = (args[0]! * Math.PI) / 180;
        const rotation: Matrix = [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0];
        if (args.length === 3) {
          const [, cx, cy] = args as [number, number, number];
          next = multiply(multiply([1, 0, 0, 1, cx, cy], rotation), [1, 0, 0, 1, -cx, -cy]);
        } else next = rotation;
        break;
      }
      case "skewX":
        if (args.length !== 1) return undefined;
        next = [1, 0, Math.tan((args[0]! * Math.PI) / 180), 1, 0, 0];
        break;
      default:
        if (args.length !== 1) return undefined;
        next = [1, Math.tan((args[0]! * Math.PI) / 180), 0, 1, 0, 0];
    }
    matrix = multiply(matrix, next);
  }
  return matrix;
}

/** One absolute path command. Arcs keep their SVG parameters. */
export type Segment =
  | { readonly kind: "M"; readonly to: Point }
  | { readonly kind: "L"; readonly to: Point }
  | { readonly kind: "C"; readonly c1: Point; readonly c2: Point; readonly to: Point }
  | { readonly kind: "Q"; readonly c: Point; readonly to: Point }
  | {
      readonly kind: "A";
      readonly rx: number;
      readonly ry: number;
      readonly rotation: number;
      readonly large: boolean;
      readonly sweep: boolean;
      readonly to: Point;
    }
  | { readonly kind: "Z" };

const ARGUMENTS: Readonly<Record<string, number>> = {
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
  A: 7,
  Z: 0,
};

/** Parses path data into absolute segments, or undefined when it is malformed. */
export function parsePath(d: string): Segment[] | undefined {
  const segments: Segment[] = [];
  let pos = 0;
  let current: Point = { x: 0, y: 0 };
  let start: Point = { x: 0, y: 0 };
  let lastControl: Point | undefined;
  let lastQuadratic: Point | undefined;
  let command = "";
  const skip = () => {
    while (pos < d.length && /[\s,]/.test(d[pos]!)) pos++;
  };
  const number = (): number | undefined => {
    skip();
    NUMBER.lastIndex = pos;
    const match = NUMBER.exec(d);
    if (!match) return undefined;
    pos = NUMBER.lastIndex;
    return Number(match[0]);
  };
  const flag = (): boolean | undefined => {
    skip();
    const char = d[pos];
    if (char !== "0" && char !== "1") return undefined;
    pos++;
    return char === "1";
  };
  for (;;) {
    skip();
    if (pos >= d.length) break;
    const char = d[pos]!;
    if (/[MmLlHhVvCcSsQqTtAaZz]/.test(char)) {
      command = char;
      pos++;
    } else if (command === "" || command === "Z" || command === "z") {
      return undefined;
    } else if (command === "M") {
      command = "L";
    } else if (command === "m") {
      command = "l";
    }
    const upper = command.toUpperCase();
    const relative = command !== upper;
    const at = (x: number, y: number): Point =>
      relative ? { x: current.x + x, y: current.y + y } : { x, y };
    if (upper === "Z") {
      segments.push({ kind: "Z" });
      current = start;
      lastControl = undefined;
      lastQuadratic = undefined;
      continue;
    }
    const values: number[] = [];
    for (let i = 0; i < ARGUMENTS[upper]!; i++) {
      const value = upper === "A" && (i === 3 || i === 4) ? flag() : number();
      if (value === undefined) return undefined;
      values.push(typeof value === "boolean" ? (value ? 1 : 0) : value);
    }
    switch (upper) {
      case "M":
        current = at(values[0]!, values[1]!);
        start = current;
        segments.push({ kind: "M", to: current });
        lastControl = lastQuadratic = undefined;
        break;
      case "L":
        current = at(values[0]!, values[1]!);
        segments.push({ kind: "L", to: current });
        lastControl = lastQuadratic = undefined;
        break;
      case "H":
        current = { x: relative ? current.x + values[0]! : values[0]!, y: current.y };
        segments.push({ kind: "L", to: current });
        lastControl = lastQuadratic = undefined;
        break;
      case "V":
        current = { x: current.x, y: relative ? current.y + values[0]! : values[0]! };
        segments.push({ kind: "L", to: current });
        lastControl = lastQuadratic = undefined;
        break;
      case "C": {
        const c1 = at(values[0]!, values[1]!);
        const c2 = at(values[2]!, values[3]!);
        const to = at(values[4]!, values[5]!);
        segments.push({ kind: "C", c1, c2, to });
        lastControl = c2;
        lastQuadratic = undefined;
        current = to;
        break;
      }
      case "S": {
        const c1 = lastControl
          ? { x: 2 * current.x - lastControl.x, y: 2 * current.y - lastControl.y }
          : current;
        const c2 = at(values[0]!, values[1]!);
        const to = at(values[2]!, values[3]!);
        segments.push({ kind: "C", c1, c2, to });
        lastControl = c2;
        lastQuadratic = undefined;
        current = to;
        break;
      }
      case "Q": {
        const c = at(values[0]!, values[1]!);
        const to = at(values[2]!, values[3]!);
        segments.push({ kind: "Q", c, to });
        lastQuadratic = c;
        lastControl = undefined;
        current = to;
        break;
      }
      case "T": {
        const c = lastQuadratic
          ? { x: 2 * current.x - lastQuadratic.x, y: 2 * current.y - lastQuadratic.y }
          : current;
        const to = at(values[0]!, values[1]!);
        segments.push({ kind: "Q", c, to });
        lastQuadratic = c;
        lastControl = undefined;
        current = to;
        break;
      }
      case "A": {
        const to = at(values[5]!, values[6]!);
        segments.push({
          kind: "A",
          rx: Math.abs(values[0]!),
          ry: Math.abs(values[1]!),
          rotation: values[2]!,
          large: values[3] === 1,
          sweep: values[4] === 1,
          to,
        });
        lastControl = lastQuadratic = undefined;
        current = to;
        break;
      }
    }
  }
  if (segments.length > 0 && segments[0]!.kind !== "M") return undefined;
  return segments;
}

const n = (value: number) => {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? "0" : String(rounded);
};
const p = (point: Point) => `${n(point.x)} ${n(point.y)}`;

/** Writes segments back as path data with absolute commands and at most three decimals. */
export function formatPath(segments: readonly Segment[]): string {
  return segments
    .map((s) => {
      switch (s.kind) {
        case "M":
        case "L":
          return `${s.kind}${p(s.to)}`;
        case "C":
          return `C${p(s.c1)} ${p(s.c2)} ${p(s.to)}`;
        case "Q":
          return `Q${p(s.c)} ${p(s.to)}`;
        case "A":
          return `A${n(s.rx)} ${n(s.ry)} ${n(s.rotation)} ${s.large ? 1 : 0} ${s.sweep ? 1 : 0} ${p(s.to)}`;
        case "Z":
          return "Z";
      }
    })
    .join("");
}

/** Points along the segments, with curves and arcs sampled; enough for bounding boxes. */
export function flatten(segments: readonly Segment[]): Point[] {
  const points: Point[] = [];
  let current: Point = { x: 0, y: 0 };
  let start: Point = { x: 0, y: 0 };
  for (const s of segments) {
    switch (s.kind) {
      case "M":
        current = start = s.to;
        points.push(s.to);
        break;
      case "L":
        current = s.to;
        points.push(s.to);
        break;
      case "C": {
        for (let i = 1; i <= 8; i++) {
          const t = i / 8;
          const u = 1 - t;
          points.push({
            x:
              u * u * u * current.x +
              3 * u * u * t * s.c1.x +
              3 * u * t * t * s.c2.x +
              t * t * t * s.to.x,
            y:
              u * u * u * current.y +
              3 * u * u * t * s.c1.y +
              3 * u * t * t * s.c2.y +
              t * t * t * s.to.y,
          });
        }
        current = s.to;
        break;
      }
      case "Q": {
        for (let i = 1; i <= 6; i++) {
          const t = i / 6;
          const u = 1 - t;
          points.push({
            x: u * u * current.x + 2 * u * t * s.c.x + t * t * s.to.x,
            y: u * u * current.y + 2 * u * t * s.c.y + t * t * s.to.y,
          });
        }
        current = s.to;
        break;
      }
      case "A":
        points.push(...arcPoints(current, s));
        current = s.to;
        break;
      case "Z":
        current = start;
        break;
    }
  }
  return points;
}

/** Samples an elliptical arc with the endpoint-to-centre conversion of the SVG specification. */
function arcPoints(from: Point, arc: Extract<Segment, { kind: "A" }>): Point[] {
  const to = arc.to;
  let { rx, ry } = arc;
  if (rx === 0 || ry === 0 || (from.x === to.x && from.y === to.y)) return [to];
  const phi = (arc.rotation * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (from.x - to.x) / 2;
  const dy = (from.y - to.y) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const numerator = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const denominator = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  let factor = Math.sqrt(Math.max(0, numerator / denominator));
  if (arc.large === arc.sweep) factor = -factor;
  const cx1 = (factor * rx * y1) / ry;
  const cy1 = (-factor * ry * x1) / rx;
  const cx = cos * cx1 - sin * cy1 + (from.x + to.x) / 2;
  const cy = sin * cx1 + cos * cy1 + (from.y + to.y) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const theta = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let delta = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!arc.sweep && delta > 0) delta -= 2 * Math.PI;
  if (arc.sweep && delta < 0) delta += 2 * Math.PI;
  const points: Point[] = [];
  const steps = 16;
  for (let i = 1; i <= steps; i++) {
    const t = theta + (delta * i) / steps;
    points.push({
      x: cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin,
      y: cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos,
    });
  }
  return points;
}

export function boundsOf(points: readonly Point[]): Bounds | undefined {
  if (points.length === 0) return undefined;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }
  return { minX, minY, maxX, maxY };
}

export function unionBounds(a: Bounds | undefined, b: Bounds | undefined): Bounds | undefined {
  if (!a) return b;
  if (!b) return a;
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

/** Path data for a basic shape element, from its numeric attributes. */
export function shapePath(
  kind: "circle" | "ellipse" | "rect" | "line" | "polyline" | "polygon",
  attr: (name: string) => number | undefined,
  points?: readonly number[],
): string | undefined {
  switch (kind) {
    case "circle": {
      const r = attr("r") ?? 0;
      if (r <= 0) return undefined;
      const cx = attr("cx") ?? 0;
      const cy = attr("cy") ?? 0;
      return `M${n(cx - r)} ${n(cy)}A${n(r)} ${n(r)} 0 1 0 ${n(cx + r)} ${n(cy)}A${n(r)} ${n(r)} 0 1 0 ${n(cx - r)} ${n(cy)}Z`;
    }
    case "ellipse": {
      const rx = attr("rx") ?? 0;
      const ry = attr("ry") ?? 0;
      if (rx <= 0 || ry <= 0) return undefined;
      const cx = attr("cx") ?? 0;
      const cy = attr("cy") ?? 0;
      return `M${n(cx - rx)} ${n(cy)}A${n(rx)} ${n(ry)} 0 1 0 ${n(cx + rx)} ${n(cy)}A${n(rx)} ${n(ry)} 0 1 0 ${n(cx - rx)} ${n(cy)}Z`;
    }
    case "rect": {
      const w = attr("width") ?? 0;
      const h = attr("height") ?? 0;
      if (w <= 0 || h <= 0) return undefined;
      const x = attr("x") ?? 0;
      const y = attr("y") ?? 0;
      let rx = attr("rx");
      let ry = attr("ry");
      rx = Math.min(rx ?? ry ?? 0, w / 2);
      ry = Math.min(ry ?? rx, h / 2);
      if (rx <= 0 || ry <= 0) return `M${n(x)} ${n(y)}H${n(x + w)}V${n(y + h)}H${n(x)}Z`;
      return (
        `M${n(x + rx)} ${n(y)}H${n(x + w - rx)}A${n(rx)} ${n(ry)} 0 0 1 ${n(x + w)} ${n(y + ry)}` +
        `V${n(y + h - ry)}A${n(rx)} ${n(ry)} 0 0 1 ${n(x + w - rx)} ${n(y + h)}` +
        `H${n(x + rx)}A${n(rx)} ${n(ry)} 0 0 1 ${n(x)} ${n(y + h - ry)}` +
        `V${n(y + ry)}A${n(rx)} ${n(ry)} 0 0 1 ${n(x + rx)} ${n(y)}Z`
      );
    }
    case "line":
      return `M${n(attr("x1") ?? 0)} ${n(attr("y1") ?? 0)}L${n(attr("x2") ?? 0)} ${n(attr("y2") ?? 0)}`;
    case "polyline":
    case "polygon": {
      if (!points || points.length < 4 || points.length % 2 !== 0) return undefined;
      let d = `M${n(points[0]!)} ${n(points[1]!)}`;
      for (let i = 2; i < points.length; i += 2) d += `L${n(points[i]!)} ${n(points[i + 1]!)}`;
      return kind === "polygon" ? `${d}Z` : d;
    }
  }
}
