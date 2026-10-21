import type { GradientStop, IconGeometry, IconGradient, IconPath, Paint, ViewBox } from "./icon.js";
import { messages } from "./messages/index.js";
import {
  IDENTITY,
  apply,
  boundsOf,
  flatten,
  formatPath,
  isIdentity,
  matrixScale,
  multiply,
  parsePath,
  parseTransform,
  readNumbers,
  shapePath,
  unionBounds,
  type Bounds,
  type Matrix,
} from "./path.js";
import { parseXml, type XmlElement } from "./xml.js";

/** Size and complexity limits for untrusted assets. */
export const ASSET_LIMITS = {
  /** Bytes of one SVG icon file. */
  svgFile: 256 * 1024,
  /** Bytes of one Iconify JSON file. */
  iconifyFile: 16 * 1024 * 1024,
  /** Bytes of one font file. */
  fontFile: 16 * 1024 * 1024,
  /** Elements of one icon. */
  elements: 2000,
  /** Nesting depth of one icon. */
  depth: 32,
  /** Characters of path data of one icon. */
  pathData: 256 * 1024,
} as const;

export type IconProblemReason = "unsafe" | "invalid" | "too-large";

export interface IconProblem {
  readonly reason: IconProblemReason;
  readonly message: string;
}

export type IconResult =
  | { readonly ok: true; readonly icon: IconGeometry }
  | { readonly ok: false; readonly problem: IconProblem };

class IconError extends Error {
  constructor(
    readonly reason: IconProblemReason,
    message: string,
  ) {
    super(message);
  }
}

const SHAPES = new Set(["path", "circle", "ellipse", "rect", "line", "polyline", "polygon"]);
const SKIPPED = new Set(["title", "desc", "metadata"]);
const GRADIENTS = new Set(["linearGradient", "radialGradient"]);
const COLOR = /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,30}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%a-z]+\))$/;
const COORDINATE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?%?$/;
const ID = /^[A-Za-z_][\w.-]*$/;
const BLACK = new Set(["#000", "#000000", "black", "#000f", "#000000ff", "rgb(0,0,0)"]);

interface State {
  readonly fill: Paint | "unset";
  readonly stroke: Paint;
  readonly strokeWidth: number;
  readonly lineCap: IconPath["lineCap"];
  readonly lineJoin: IconPath["lineJoin"];
  readonly fillRule: IconPath["fillRule"];
  readonly opacity: number;
  readonly fillOpacity: number;
  readonly strokeOpacity: number;
  readonly matrix: Matrix;
}

const INITIAL: State = {
  fill: "unset",
  stroke: { kind: "none" },
  strokeWidth: 1,
  lineCap: "butt",
  lineJoin: "miter",
  fillRule: "nonzero",
  opacity: 1,
  fillOpacity: 1,
  strokeOpacity: 1,
  matrix: IDENTITY,
};

interface RawGradient {
  id: string;
  kind: "linear" | "radial";
  units?: IconGradient["units"];
  transform?: string | null;
  spread?: IconGradient["spread"];
  coordinates: Record<string, string>;
  stops: GradientStop[];
  href?: string;
}

/** Converts sanitised elements into icon geometry; every check throws an `IconError`. */
class Converter {
  readonly paths: { path: IconPath; bounds: Bounds | undefined; rawFill: Paint | "unset" }[] = [];
  readonly gradients = new Map<string, RawGradient>();
  private pathData = 0;
  /** Problems are written in the interface language of the moment the icon is read. */
  private readonly t = messages().icons;

  walk(element: XmlElement, parent: State, draw: boolean): void {
    const name = element.name;
    if (name.includes(":")) return; // editor metadata in another namespace
    if (SKIPPED.has(name)) return;
    const known =
      name === "g" || name === "defs" || name === "stop" || SHAPES.has(name) || GRADIENTS.has(name);
    if (!known) throw new IconError("unsafe", this.t.element(name));
    const attributes = this.attributes(element);
    if (attributes.get("display") === "none") return;
    if (GRADIENTS.has(name)) {
      this.gradient(element, attributes);
      return;
    }
    if (name === "stop") throw new IconError("invalid", this.t.stopOutsideGradient);
    if (name === "defs") {
      for (const child of element.children) this.walk(child, parent, false);
      return;
    }
    const state = this.state(parent, attributes);
    if (name === "g") {
      for (const child of element.children) this.walk(child, state, draw);
      return;
    }
    if (element.children.some((c) => !c.name.includes(":") && !SKIPPED.has(c.name))) {
      throw new IconError("invalid", this.t.children(name));
    }
    if (!draw || attributes.get("visibility") === "hidden") return;
    this.shape(name, attributes, state);
  }

  /** Attributes with `style` declarations merged in, after the safety checks. */
  private attributes(element: XmlElement): Map<string, string> {
    const result = new Map<string, string>();
    const add = (rawName: string, value: string) => {
      const name = rawName.trim();
      const lower = name.toLowerCase();
      if (lower.startsWith("on")) throw new IconError("unsafe", this.t.eventAttribute(name));
      if (lower === "href" || lower === "xlink:href") {
        if (!GRADIENTS.has(element.name) || !/^#[A-Za-z_][\w.-]*$/.test(value.trim())) {
          throw new IconError("unsafe", this.t.link(name, value));
        }
        result.set("href", value.trim().slice(1));
        return;
      }
      if (/url\s*\(/i.test(value)) {
        const local = /^\s*url\(\s*#([A-Za-z_][\w.-]*)\s*\)\s*(.*)$/i.exec(value);
        if (!local || (lower !== "fill" && lower !== "stroke")) {
          throw new IconError("unsafe", this.t.reference(name, value.trim()));
        }
      }
      if (lower.includes(":") && !lower.startsWith("xml")) return;
      result.set(name, value);
    };
    for (const [name, value] of element.attributes) {
      if (name === "style") {
        for (const declaration of value.split(";")) {
          const colon = declaration.indexOf(":");
          if (colon < 0) continue;
          add(declaration.slice(0, colon), declaration.slice(colon + 1).trim());
        }
      } else add(name, value);
    }
    return result;
  }

  private paint(value: string | undefined, inherited: Paint | "unset"): Paint | "unset" {
    if (value === undefined || value === "inherit") return inherited;
    const trimmed = value.trim();
    if (trimmed === "none") return { kind: "none" };
    if (trimmed.toLowerCase() === "currentcolor") return { kind: "current" };
    const reference = /^url\(\s*#([A-Za-z_][\w.-]*)\s*\)\s*(.*)$/i.exec(trimmed);
    if (reference) return { kind: "gradient", id: `${reference[1]}|${reference[2] ?? ""}` };
    if (!COLOR.test(trimmed)) throw new IconError("invalid", this.t.colour(trimmed));
    return { kind: "color", value: trimmed };
  }

  private number(value: string | undefined, fallback: number): number {
    if (value === undefined || value === "inherit") return fallback;
    const parsed = Number(value.trim().replace(/px$/, ""));
    if (!Number.isFinite(parsed)) throw new IconError("invalid", this.t.number(value));
    return parsed;
  }

  private fraction(value: string | undefined): number {
    if (value === undefined) return 1;
    const trimmed = value.trim();
    const parsed = trimmed.endsWith("%") ? Number(trimmed.slice(0, -1)) / 100 : Number(trimmed);
    if (!Number.isFinite(parsed)) throw new IconError("invalid", this.t.opacity(value));
    return Math.min(1, Math.max(0, parsed));
  }

  private state(parent: State, attributes: Map<string, string>): State {
    const transform = attributes.get("transform");
    let matrix = parent.matrix;
    if (transform !== undefined) {
      const parsed = parseTransform(transform);
      if (!parsed) throw new IconError("invalid", this.t.transform(transform));
      matrix = multiply(parent.matrix, parsed);
    }
    const enumOf = <T extends string>(
      value: string | undefined,
      allowed: readonly T[],
      fallback: T,
    ): T =>
      value !== undefined && (allowed as readonly string[]).includes(value.trim())
        ? (value.trim() as T)
        : fallback;
    const stroke = this.paint(attributes.get("stroke"), parent.stroke);
    return {
      fill: this.paint(attributes.get("fill"), parent.fill),
      stroke: stroke === "unset" ? { kind: "none" } : stroke,
      strokeWidth: this.number(attributes.get("stroke-width"), parent.strokeWidth),
      lineCap: enumOf(
        attributes.get("stroke-linecap"),
        ["butt", "round", "square"],
        parent.lineCap,
      ),
      lineJoin: enumOf(
        attributes.get("stroke-linejoin"),
        ["miter", "round", "bevel"],
        parent.lineJoin,
      ),
      fillRule: enumOf(attributes.get("fill-rule"), ["nonzero", "evenodd"], parent.fillRule),
      opacity: parent.opacity * this.fraction(attributes.get("opacity")),
      fillOpacity: attributes.has("fill-opacity")
        ? this.fraction(attributes.get("fill-opacity"))
        : parent.fillOpacity,
      strokeOpacity: attributes.has("stroke-opacity")
        ? this.fraction(attributes.get("stroke-opacity"))
        : parent.strokeOpacity,
      matrix,
    };
  }

  private shape(name: string, attributes: Map<string, string>, state: State): void {
    let d: string | undefined;
    if (name === "path") {
      d = attributes.get("d");
      if (d === undefined || d.trim() === "") return;
    } else {
      const attr = (key: string) => {
        const value = attributes.get(key);
        return value === undefined ? undefined : this.number(value, 0);
      };
      let points: number[] | undefined;
      if (name === "polyline" || name === "polygon") {
        points = readNumbers(attributes.get("points") ?? "");
        if (!points) throw new IconError("invalid", this.t.points(name));
      }
      d = shapePath(name as Parameters<typeof shapePath>[0], attr, points);
      if (d === undefined) return;
    }
    this.pathData += d.length;
    if (this.pathData > ASSET_LIMITS.pathData) {
      throw new IconError("too-large", this.t.pathDataSize(ASSET_LIMITS.pathData / 1024));
    }
    const segments = parsePath(d);
    if (!segments) throw new IconError("invalid", this.t.pathData);
    if (segments.length === 0) return;
    const points = flatten(segments).map((p) => apply(state.matrix, p));
    let bounds = boundsOf(points);
    if (bounds && state.stroke.kind !== "none") {
      const half = (state.strokeWidth * matrixScale(state.matrix)) / 2;
      bounds = {
        minX: bounds.minX - half,
        minY: bounds.minY - half,
        maxX: bounds.maxX + half,
        maxY: bounds.maxY + half,
      };
    }
    const m = state.matrix;
    this.paths.push({
      rawFill: state.fill,
      bounds,
      path: {
        d: formatPath(segments),
        transform: isIdentity(m)
          ? null
          : `matrix(${m.map((v) => Math.round(v * 10000) / 10000).join(" ")})`,
        fill: state.fill === "unset" ? { kind: "color", value: "#000000" } : state.fill,
        stroke: state.stroke,
        strokeWidth: state.strokeWidth,
        lineCap: state.lineCap,
        lineJoin: state.lineJoin,
        fillRule: state.fillRule,
        opacity: state.opacity,
        fillOpacity: state.fillOpacity,
        strokeOpacity: state.strokeOpacity,
      },
    });
  }

  private gradient(element: XmlElement, attributes: Map<string, string>): void {
    const id = attributes.get("id");
    if (!id || !ID.test(id)) throw new IconError("invalid", this.t.gradientId);
    const kind = element.name === "linearGradient" ? "linear" : "radial";
    const keys = kind === "linear" ? ["x1", "y1", "x2", "y2"] : ["cx", "cy", "r", "fx", "fy"];
    const coordinates: Record<string, string> = {};
    for (const key of keys) {
      const value = attributes.get(key);
      if (value === undefined) continue;
      if (!COORDINATE.test(value.trim())) {
        throw new IconError("invalid", this.t.gradientCoordinate(key, value));
      }
      coordinates[key] = value.trim();
    }
    const raw: RawGradient = { id, kind, coordinates, stops: [] };
    const units = attributes.get("gradientUnits");
    if (units === "objectBoundingBox" || units === "userSpaceOnUse") raw.units = units;
    const spread = attributes.get("spreadMethod");
    if (spread === "pad" || spread === "reflect" || spread === "repeat") raw.spread = spread;
    const transform = attributes.get("gradientTransform");
    if (transform !== undefined) {
      const matrix = parseTransform(transform);
      if (!matrix) throw new IconError("invalid", this.t.transform(transform));
      raw.transform = `matrix(${matrix.map((v) => Math.round(v * 10000) / 10000).join(" ")})`;
    }
    if (attributes.has("href")) raw.href = attributes.get("href");
    for (const child of element.children) {
      if (child.name.includes(":") || SKIPPED.has(child.name)) continue;
      if (child.name !== "stop") throw new IconError("unsafe", this.t.gradientElement(child.name));
      const stop = this.attributes(child);
      const offsetText = stop.get("offset") ?? "0";
      const offset = this.fraction(offsetText);
      const color = (stop.get("stop-color") ?? "#000000").trim();
      if (color.toLowerCase() !== "currentcolor" && !COLOR.test(color)) {
        throw new IconError("invalid", this.t.stopColour(color));
      }
      raw.stops.push({
        offset,
        color: color.toLowerCase() === "currentcolor" ? "#000000" : color,
        opacity: this.fraction(stop.get("stop-opacity")),
      });
    }
    if (this.gradients.has(id)) throw new IconError("invalid", this.t.gradientTwice(id));
    this.gradients.set(id, raw);
  }

  /** Resolves gradient inheritance, references and monochrome paints into the icon. */
  finish(viewBox: ViewBox): IconGeometry {
    const resolved = new Map<string, IconGradient>();
    const resolve = (id: string, seen: Set<string>): IconGradient | undefined => {
      const done = resolved.get(id);
      if (done) return done;
      const raw = this.gradients.get(id);
      if (!raw || seen.has(id)) return undefined;
      seen.add(id);
      const base = raw.href !== undefined ? resolve(raw.href, seen) : undefined;
      const gradient: IconGradient = {
        id,
        kind: raw.kind,
        units: raw.units ?? base?.units ?? "objectBoundingBox",
        transform: raw.transform ?? base?.transform ?? null,
        spread: raw.spread ?? base?.spread ?? "pad",
        coordinates: {
          ...(base && base.kind === raw.kind ? base.coordinates : {}),
          ...raw.coordinates,
        },
        stops: raw.stops.length > 0 ? raw.stops : (base?.stops ?? []),
      };
      resolved.set(id, gradient);
      return gradient;
    };
    const used = new Set<string>();
    const settle = (paint: Paint): Paint => {
      if (paint.kind !== "gradient") return paint;
      const [id, fallback] = paint.id.split("|") as [string, string];
      const gradient = resolve(id, new Set());
      if (gradient && gradient.stops.length > 0) {
        used.add(id);
        return { kind: "gradient", id };
      }
      if (fallback.trim() === "" || fallback.trim() === "none") return { kind: "none" };
      if (fallback.trim().toLowerCase() === "currentcolor") return { kind: "current" };
      if (!COLOR.test(fallback.trim())) return { kind: "none" };
      return { kind: "color", value: fallback.trim() };
    };
    let paths = this.paths.map((entry) => ({
      ...entry,
      path: { ...entry.path, fill: settle(entry.path.fill), stroke: settle(entry.path.stroke) },
    }));
    const isBlack = (paint: Paint) =>
      paint.kind === "color" && BLACK.has(paint.value.replace(/\s/g, "").toLowerCase());
    const monochrome = paths.every(({ path }) =>
      [path.fill, path.stroke].every(
        (p) => p.kind === "none" || p.kind === "current" || isBlack(p),
      ),
    );
    if (monochrome) {
      paths = paths.map((entry) => ({
        ...entry,
        path: {
          ...entry.path,
          fill: isBlack(entry.path.fill) ? { kind: "current" } : entry.path.fill,
          stroke: isBlack(entry.path.stroke) ? { kind: "current" } : entry.path.stroke,
        },
      }));
    }
    const drawn = paths.filter(
      ({ path }) => path.fill.kind !== "none" || path.stroke.kind !== "none",
    );
    let bounds: Bounds | undefined;
    for (const entry of drawn) bounds = unionBounds(bounds, entry.bounds);
    return {
      viewBox,
      paths: drawn.map((entry) => entry.path),
      gradients: [...used].sort().map((id) => resolved.get(id)!),
      monochrome,
      bounds,
    };
  }
}

function viewBoxOf(attributes: ReadonlyMap<string, string>): ViewBox | undefined {
  const viewBox = attributes.get("viewBox");
  if (viewBox !== undefined) {
    const numbers = readNumbers(viewBox);
    if (numbers && numbers.length === 4 && numbers[2]! > 0 && numbers[3]! > 0) {
      return { x: numbers[0]!, y: numbers[1]!, width: numbers[2]!, height: numbers[3]! };
    }
    return undefined;
  }
  const width = Number((attributes.get("width") ?? "").replace(/px$/, ""));
  const height = Number((attributes.get("height") ?? "").replace(/px$/, ""));
  if (width > 0 && height > 0) return { x: 0, y: 0, width, height };
  return undefined;
}

function convert(root: XmlElement, viewBox: ViewBox): IconResult {
  const converter = new Converter();
  try {
    converter.walk({ ...root, name: "g" }, INITIAL, true);
    return { ok: true, icon: converter.finish(viewBox) };
  } catch (error) {
    if (error instanceof IconError)
      return { ok: false, problem: { reason: error.reason, message: error.message } };
    throw error;
  }
}

/** UTF-8 size of a text. */
export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** Sanitises an SVG icon file into icon geometry. */
export function sanitizeSvg(text: string, maxBytes: number = ASSET_LIMITS.svgFile): IconResult {
  // Problems are written in the interface language of the moment the file is read.
  const t = messages().icons;
  if (byteLength(text) > maxBytes) {
    return {
      ok: false,
      problem: { reason: "too-large", message: t.fileSize(Math.round(maxBytes / 1024)) },
    };
  }
  const parsed = parseXml(text, {
    maxElements: ASSET_LIMITS.elements,
    maxDepth: ASSET_LIMITS.depth,
  });
  if (!parsed.ok) return { ok: false, problem: { reason: parsed.reason, message: parsed.message } };
  if (parsed.root.name !== "svg") {
    return { ok: false, problem: { reason: "invalid", message: t.root } };
  }
  const viewBox = viewBoxOf(parsed.root.attributes);
  if (!viewBox) return { ok: false, problem: { reason: "invalid", message: t.viewBox } };
  return convert(parsed.root, viewBox);
}

/** An SVG fragment (an Iconify `body`) inside a view box. */
export function sanitizeBody(body: string, viewBox: ViewBox): IconResult {
  const wrapped = `<svg>${body}</svg>`;
  const parsed = parseXml(wrapped, {
    maxElements: ASSET_LIMITS.elements + 1,
    maxDepth: ASSET_LIMITS.depth + 1,
  });
  if (!parsed.ok) return { ok: false, problem: { reason: parsed.reason, message: parsed.message } };
  return convert(parsed.root, viewBox);
}

/** Element nodes as `[tag, attributes]`, the form of the Tabler node files. */
export type IconNode = readonly [string, Readonly<Record<string, string | number>>];

/** Builds an icon from element nodes with root attributes such as Tabler's defaults. */
export function iconFromNodes(
  nodes: readonly IconNode[],
  viewBox: ViewBox,
  rootAttributes: Readonly<Record<string, string>>,
): IconResult {
  const toElement = ([name, attributes]: IconNode): XmlElement => ({
    name,
    attributes: new Map(Object.entries(attributes).map(([k, v]) => [k, String(v)])),
    children: [],
  });
  const root: XmlElement = {
    name: "svg",
    attributes: new Map(Object.entries(rootAttributes)),
    children: nodes.map(toElement),
  };
  return convert(root, viewBox);
}
