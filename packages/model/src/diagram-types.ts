// Diagram types beyond the four built in: declared as data by plugins (decision 0030). A type
// registers its schema (kinds and properties), validation (required properties and allowed
// relations), layout (mode, algorithm, direction), editing tools (the canvas palette) and its
// conversion to primitives (the shape and style of every kind). Nothing in it is code.
import { messages } from "./messages/index.js";
import {
  ARROWHEADS,
  BOX_SHAPES,
  CORNERS,
  DIAGRAM_TYPES,
  DIRECTIONS,
  FONT_WEIGHTS,
  ICON_POSITIONS,
  ICON_SIZE_RANGE,
  LABEL_POSITIONS,
  LAYOUT_MODES,
  LINE_STYLES,
  PATTERNS,
  ROUTINGS,
  STYLE_PROPERTIES,
  THEME_COLOR_TOKENS,
  TEXT_ALIGNS,
  VERTICAL_ALIGNS,
} from "./schema.js";
import type { Direction, LayoutMode, StyleProperties } from "./types.js";

/**
 * The version of the intermediate model that plugins declare compatibility with: the compiled
 * document, its JSON and the definitions of diagram types.
 */
export const MODEL_API_VERSION = "1.0.0";

/** A property of a kind or of relations: what values it takes. */
export interface PropertyDefinition {
  readonly kind: "string" | "number" | "boolean" | "enum";
  /** `enum`: the words it accepts. */
  readonly values: readonly string[];
  readonly description: string | null;
}

/** An element kind of a declared type, drawn as a box with its own shape and style. */
export interface KindDefinition {
  readonly label: string;
  readonly description: string | null;
  /** Shape, colours (tokens such as `@accent` or CSS colours), line, icon, text. */
  readonly style: StyleProperties;
  readonly properties: Readonly<Record<string, PropertyDefinition>>;
  /** Properties every element of the kind must set. */
  readonly required: readonly string[];
}

export type LayoutAlgorithm = "layered" | "tree";
export const LAYOUT_ALGORITHMS: readonly LayoutAlgorithm[] = ["layered", "tree"];

/** A declared diagram type, as a plugin defines it. */
export interface DiagramTypeDefinition {
  /** The word after `diagram <id>:`, such as `erd`. */
  readonly type: string;
  readonly title: string;
  readonly description: string | null;
  /** Where it comes from; null for types an embedding application registers itself. */
  readonly plugin: { readonly name: string; readonly version: string } | null;
  readonly layout: {
    readonly mode: LayoutMode;
    readonly algorithm: LayoutAlgorithm;
    readonly direction: Direction;
  };
  readonly elements: Readonly<Record<string, KindDefinition>>;
  readonly relations: {
    /** Pairs of kinds a relation may join, `*` for any; null for any pair. */
    readonly allowed: readonly (readonly [string, string])[] | null;
    readonly properties: Readonly<Record<string, PropertyDefinition>>;
    readonly style: StyleProperties;
  };
  /** The canvas palette: kinds in the order offered. */
  readonly tools: readonly { readonly kind: string; readonly label: string }[];
}

/** Words a declared type or kind may not take: the language's own. */
export const RESERVED_WORDS: ReadonlySet<string> = new Set([
  ...DIAGRAM_TYPES,
  "model",
  "story",
  "theme",
  "export",
  "import",
  "language",
  "diagram",
  "using",
  "placement",
  "style",
  "animate",
  "class",
  "rule",
  "layers",
  "scenario",
  "relation",
  "text",
  "icon",
  "image",
  "group",
  "box",
  "note",
  "tag",
]);

const IDENT = /^[a-z][a-z0-9_]*$/;
const COLOR_TOKENS: ReadonlySet<string> = new Set(THEME_COLOR_TOKENS);

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Checks a style object of a definition; colours are tokens (`@accent`) or CSS colours. Problems
 * are in the interface language.
 */
function readStyle(value: unknown, where: string, problems: string[]): StyleProperties {
  if (value === undefined) return {};
  const m = messages().problems;
  if (!isObject(value)) {
    problems.push(m.styleObject(where));
    return {};
  }
  const style: Record<string, string | number> = {};
  const word = (name: string, v: unknown, words: readonly (string | number)[]) => {
    if (words.includes(v as string | number)) style[name] = v as string | number;
    else problems.push(m.styleWords(where, name, words));
  };
  for (const [name, v] of Object.entries(value)) {
    switch (name) {
      case "fill":
      case "stroke":
      case "color":
      case "iconColor":
        if (typeof v === "string" && v.startsWith("@") && COLOR_TOKENS.has(v.slice(1)))
          style[name] = v;
        else if (
          typeof v === "string" &&
          /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\([\d\s.,%/-]+\)|[a-z]+)$/i.test(v)
        ) {
          style[name] = v;
        } else problems.push(m.styleColor(where, name));
        break;
      case "shape":
        word(name, v, BOX_SHAPES);
        break;
      case "line":
        word(name, v, LINE_STYLES);
        break;
      case "pattern":
        word(name, v, PATTERNS);
        break;
      case "arrowhead":
      case "arrowtail":
        word(name, v, ARROWHEADS);
        break;
      case "corners":
        word(name, v, CORNERS);
        break;
      case "routing":
        word(name, v, ROUTINGS);
        break;
      case "iconPosition":
        word(name, v, ICON_POSITIONS);
        break;
      case "labelPosition":
        word(name, v, LABEL_POSITIONS);
        break;
      case "iconSize":
        if (
          v === "auto" ||
          (typeof v === "number" && v >= ICON_SIZE_RANGE.min && v <= ICON_SIZE_RANGE.max)
        ) {
          style[name] = v;
        } else problems.push(m.styleNumber(where, name));
        break;
      case "textAlign":
        word(name, v, TEXT_ALIGNS);
        break;
      case "verticalAlign":
        word(name, v, VERTICAL_ALIGNS);
        break;
      case "fontWeight":
        word(name, v, FONT_WEIGHTS);
        break;
      case "width":
      case "radius":
      case "fontSize": {
        // The ranges of `style` statements.
        const spec = STYLE_PROPERTIES[name];
        if (spec?.kind === "number" && typeof v === "number" && v >= spec.min && v <= spec.max) {
          style[name] = v;
        } else problems.push(m.styleNumber(where, name));
        break;
      }
      case "icon":
        if (typeof v === "string" && /^[A-Za-z0-9_-]+:[A-Za-z0-9_.-]+$/.test(v)) style[name] = v;
        else problems.push(m.styleIcon(where));
        break;
      default:
        problems.push(m.styleUnknown(where, name));
    }
  }
  return style;
}

/** Checks the properties of a kind or of relations; problems are in the interface language. */
function readProperties(
  value: unknown,
  where: string,
  problems: string[],
): Record<string, PropertyDefinition> {
  if (value === undefined) return {};
  const m = messages().problems;
  if (!isObject(value)) {
    problems.push(m.propertiesObject(where));
    return {};
  }
  const properties: Record<string, PropertyDefinition> = {};
  for (const [name, raw] of Object.entries(value)) {
    if (
      !IDENT.test(name) ||
      RESERVED_WORDS.has(name) ||
      ["description", "url", "class", "layer", "link", "port", "assumption"].includes(name)
    ) {
      problems.push(m.propertyName(where, name));
      continue;
    }
    const spec = typeof raw === "string" ? { kind: raw } : raw;
    if (!isObject(spec) || !["string", "number", "boolean", "enum"].includes(String(spec.kind))) {
      problems.push(m.propertyKind(where, name));
      continue;
    }
    const values = Array.isArray(spec.values)
      ? spec.values.filter(
          (v): v is string => typeof v === "string" && /^[A-Za-z_][A-Za-z0-9_-]*$/.test(v),
        )
      : [];
    if (spec.kind === "enum" && values.length === 0) {
      problems.push(m.enumValues(where, name));
      continue;
    }
    properties[name] = {
      kind: spec.kind as PropertyDefinition["kind"],
      values: spec.kind === "enum" ? values : [],
      description: typeof spec.description === "string" ? spec.description : null,
    };
  }
  return properties;
}

/**
 * Reads and checks a diagram type as a plugin writes it in JSON. Problems say what is wrong, in
 * the interface language; with any, the type is not registered.
 */
export function readDiagramType(
  value: unknown,
  plugin: DiagramTypeDefinition["plugin"],
): { definition: DiagramTypeDefinition | null; problems: string[] } {
  const m = messages().problems;
  const problems: string[] = [];
  if (!isObject(value)) return { definition: null, problems: [m.notObject] };
  const type = typeof value.type === "string" ? value.type : "";
  const where = m.where(type || "?");
  if (!IDENT.test(type) || RESERVED_WORDS.has(type)) {
    problems.push(m.typeWord(where));
  }
  const layoutRaw = isObject(value.layout) ? value.layout : {};
  const mode = (layoutRaw.mode ?? "auto") as LayoutMode;
  const algorithm = (layoutRaw.algorithm ?? "layered") as LayoutAlgorithm;
  const direction = (layoutRaw.direction ?? "LR") as Direction;
  if (!(LAYOUT_MODES as readonly string[]).includes(mode))
    problems.push(m.layoutValue(where, "mode", LAYOUT_MODES));
  if (!LAYOUT_ALGORITHMS.includes(algorithm))
    problems.push(m.layoutValue(where, "algorithm", LAYOUT_ALGORITHMS));
  if (!(DIRECTIONS as readonly string[]).includes(direction))
    problems.push(m.layoutValue(where, "direction", DIRECTIONS));

  const elements: Record<string, KindDefinition> = {};
  if (!isObject(value.elements) || Object.keys(value.elements).length === 0) {
    problems.push(m.noKinds(where));
  } else {
    for (const [kind, raw] of Object.entries(value.elements)) {
      const at = m.kindWhere(where, kind);
      if (!IDENT.test(kind) || RESERVED_WORDS.has(kind)) {
        problems.push(m.kindWord(at));
        continue;
      }
      const spec = isObject(raw) ? raw : {};
      const properties = readProperties(spec.properties, at, problems);
      const required = Array.isArray(spec.required)
        ? spec.required.filter((r): r is string => typeof r === "string")
        : [];
      for (const name of required) {
        if (!(name in properties)) problems.push(m.requiredUndeclared(at, name));
      }
      elements[kind] = {
        label: typeof spec.label === "string" && spec.label.trim() !== "" ? spec.label : kind,
        description: typeof spec.description === "string" ? spec.description : null,
        style: readStyle(spec.style, at, problems),
        properties,
        required,
      };
    }
  }
  const kinds = new Set(Object.keys(elements));

  const relationsRaw = isObject(value.relations) ? value.relations : {};
  let allowed: [string, string][] | null = null;
  if (relationsRaw.allowed !== undefined) {
    allowed = [];
    if (!Array.isArray(relationsRaw.allowed)) problems.push(m.allowedPairs(where));
    else {
      for (const pair of relationsRaw.allowed) {
        const [from, to] = Array.isArray(pair) ? pair : [];
        const known = (k: unknown) => k === "*" || (typeof k === "string" && kinds.has(k));
        if (!known(from) || !known(to)) {
          problems.push(m.unknownPair(where, JSON.stringify(pair)));
          continue;
        }
        allowed.push([from as string, to as string]);
      }
    }
  }
  const tools = (
    Array.isArray(value.tools) ? value.tools : [...kinds].map((kind) => ({ kind }))
  ).flatMap((raw) => {
    const spec = isObject(raw) ? raw : {};
    const kind = typeof spec.kind === "string" ? spec.kind : "";
    if (!kinds.has(kind)) {
      problems.push(m.unknownTool(where, kind));
      return [];
    }
    return [{ kind, label: typeof spec.label === "string" ? spec.label : elements[kind]!.label }];
  });

  const relationsWhere = m.relationsWhere(where);
  const definition: DiagramTypeDefinition = {
    type,
    title: typeof value.title === "string" && value.title.trim() !== "" ? value.title : type,
    description: typeof value.description === "string" ? value.description : null,
    plugin,
    layout: { mode, algorithm, direction },
    elements,
    relations: {
      allowed,
      properties: readProperties(relationsRaw.properties, relationsWhere, problems),
      style: readStyle(relationsRaw.style, relationsWhere, problems),
    },
    tools,
  };
  return { definition: problems.length === 0 ? definition : null, problems };
}

/** Whether a relation between two kinds is allowed by a type (`null` kinds are built-in ones). */
export function relationAllowed(
  definition: DiagramTypeDefinition,
  from: string | null,
  to: string | null,
): boolean {
  const allowed = definition.relations.allowed;
  if (allowed === null) return true;
  return allowed.some(([a, b]) => (a === "*" || a === from) && (b === "*" || b === to));
}
