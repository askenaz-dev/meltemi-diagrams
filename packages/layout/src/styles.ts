import {
  ELEMENT_ONLY_PROPERTIES,
  TEXTLESS_KINDS,
  TEXT_PROPERTIES,
  LINE_REFUSED_PROPERTIES,
  PEN_REFUSED_PROPERTIES,
  RELATION_ONLY_PROPERTIES,
  STICKY_REFUSED_PROPERTIES,
  THEME_COLOR_TOKENS,
  type ClassUse,
  type Element,
  type FlowDiagram,
  type Relation,
  type RuleKind,
  type Routing,
  type StyleProperties,
} from "@meltemi/diagrams-model";
import type { BoxShape } from "./shapes.js";
import type { ArrowheadKind, CornerKind, IconPosition, LabelPosition, Theme } from "./theme.js";

export type PatternKind = "hatch" | "dots" | "cross";

/** Style properties of one element or relation after precedence and token colours. */
export interface ResolvedStyle {
  readonly fill?: string;
  readonly stroke?: string;
  readonly color?: string;
  readonly line?: "solid" | "dashed" | "dotted";
  readonly icon?: string;
  readonly width?: number;
  readonly pattern?: PatternKind;
  readonly arrowhead?: ArrowheadKind;
  readonly arrowtail?: ArrowheadKind;
  readonly iconColor?: string;
  readonly iconPosition?: IconPosition;
  /** Where the label sits when the icon is the centre piece. */
  readonly labelPosition?: LabelPosition;
  /** The side of the icon in pixels, or `auto` to fit the box. */
  readonly iconSize?: number | "auto";
  readonly routing?: Routing;
  readonly corners?: CornerKind;
  /** The shape of a free box or a flow node. */
  readonly shape?: BoxShape;
  /** The corner radius of a rounded element or a group, over the theme's `radius` or `groupRadius`. */
  readonly radius?: number;
  /** Degrees the element is turned, clockwise about the centre of its box. */
  readonly rotation?: number;
  /** The font stack, size and weight of the target's text, over the theme's (decision 0067). */
  readonly font?: string;
  readonly fontSize?: number;
  readonly fontWeight?: number;
  /** Free diagrams only: where the text sits across its box. */
  readonly textAlign?: "left" | "center" | "right";
  /** Free boxes: where the text block sits within the shape's text band; `middle` by default. */
  readonly verticalAlign?: "top" | "middle" | "bottom";
  /** Free elements, groups, lines and pens: how opaque their drawing is, from 0 to 1. */
  readonly opacity?: number;
}

const COLOR_PROPERTIES = new Set(["fill", "stroke", "color", "iconColor"]);
/** What a pen's style leaves out: the properties it refuses, and `rotation`. */
const PEN_EXCLUDED: readonly string[] = [...PEN_REFUSED_PROPERTIES, "rotation"];
/** What an icon's or an image's style leaves out: the relation and the text properties. */
const TEXTLESS_EXCLUDED: readonly string[] = [...RELATION_ONLY_PROPERTIES, ...TEXT_PROPERTIES];
/** What a sticky's style leaves out: the properties it refuses, and `shape`. */
const STICKY_EXCLUDED: readonly string[] = [...STICKY_REFUSED_PROPERTIES, "shape"];
const COLOR_TOKENS: ReadonlySet<string> = new Set(THEME_COLOR_TOKENS);

/** Replaces a colour token name (`@danger`) with the theme's value. */
export function themeColor(theme: Theme, value: string): string {
  if (!value.startsWith("@")) return value;
  const token = value.slice(1);
  return COLOR_TOKENS.has(token) ? String(theme[token as keyof Theme]) : value;
}

/** The built-in class of an element of a C4 view: by kind, external, or the boundary. */
function c4Class(element: Element): string | undefined {
  if (!element.entity) return undefined;
  if (element.kind === "group") return "c4_boundary";
  if (element.external) return "c4_external";
  return element.kind === "datastore" ? "c4_container" : `c4_${element.kind}`;
}

/**
 * Resolves the style of every element and relation of a diagram: theme rules, diagram rules,
 * applied classes (declaration block first, then `style` statements), then explicit properties.
 */
export class StyleResolver {
  private readonly classes = new Map<string, StyleProperties>();
  private readonly rules: { kind: RuleKind; properties: StyleProperties }[];
  private readonly styleClasses = new Map<string, ClassUse[]>();
  private readonly explicit = new Map<string, Record<string, string | number>>();
  private readonly cache = new Map<string, ResolvedStyle>();
  private readonly declared: FlowDiagram["definition"];

  constructor(
    private readonly theme: Theme,
    diagram: FlowDiagram,
  ) {
    this.declared = diagram.definition;
    for (const definition of diagram.classes)
      this.classes.set(definition.id, definition.properties);
    this.rules = [
      ...theme.rules,
      ...diagram.rules.map((rule) => ({ kind: rule.kind, properties: rule.properties })),
    ];
    for (const entry of diagram.styles) {
      const uses = this.styleClasses.get(entry.target) ?? [];
      uses.push(...entry.classes);
      this.styleClasses.set(entry.target, uses);
      const properties = this.explicit.get(entry.target) ?? {};
      Object.assign(properties, entry.properties);
      this.explicit.set(entry.target, properties);
    }
  }

  /** A class of the diagram, or of the theme chain including the built-in classes. */
  classProperties(name: string): StyleProperties | undefined {
    return this.classes.get(name) ?? this.theme.classes[name];
  }

  element(element: Element): ResolvedStyle {
    // A free line takes a relation's properties (heads, route kind, corners) and none of a box's
    // but `opacity`.
    if (element.kind === "line") {
      return this.resolve(element.id, "line", element.classes, LINE_REFUSED_PROPERTIES);
    }
    // A pen takes its stroke's colour, width, line, opacity and heads, and nothing else.
    if (element.kind === "pen") {
      return this.resolve(element.id, "pen", element.classes, PEN_EXCLUDED);
    }
    // A sticky takes its card's, its text's and its icon's properties: a class it shares with
    // boxes gives it no shape, pattern or icon placement.
    if (element.kind === "sticky") {
      return this.resolve(element.id, "sticky", element.classes, STICKY_EXCLUDED);
    }
    // A kind of a declared type: the type's style first, and rules of the kind (decision 0030).
    const declared = element.typeKind ? this.declared?.elements[element.typeKind] : undefined;
    return this.resolve(
      element.id,
      (declared ? element.typeKind : element.kind) as RuleKind,
      element.classes,
      TEXTLESS_KINDS.includes(element.kind) ? TEXTLESS_EXCLUDED : RELATION_ONLY_PROPERTIES,
      c4Class(element),
      declared?.style,
    );
  }

  relation(relation: Relation): ResolvedStyle {
    return this.resolve(
      relation.key,
      "relation",
      relation.classes,
      ELEMENT_ONLY_PROPERTIES,
      undefined,
      this.declared?.relations.style,
    );
  }

  /** The style of a named note or fragment of a sequence diagram, by its key and rule kind. */
  event(key: string, kind: "note" | "fragment"): ResolvedStyle {
    return this.resolve(key, kind, [], RELATION_ONLY_PROPERTIES);
  }

  private resolve(
    target: string,
    kind: RuleKind,
    declared: readonly ClassUse[],
    excluded: readonly string[],
    base?: string,
    typeStyle?: StyleProperties,
  ): ResolvedStyle {
    const cached = this.cache.get(target);
    if (cached) return cached;
    const merged: Record<string, string | number> = {};
    const apply = (properties: StyleProperties | undefined) => {
      if (!properties) return;
      for (const [name, value] of Object.entries(properties)) {
        if (!excluded.includes(name)) merged[name] = value;
      }
    };
    // The built-in C4 class of a view's element comes first, so rules and styles override it.
    if (base) apply(this.classProperties(base));
    // Then the style of a kind of a declared type.
    apply(typeStyle);
    for (const rule of this.rules) if (rule.kind === kind) apply(rule.properties);
    for (const use of [...declared, ...(this.styleClasses.get(target) ?? [])]) {
      apply(this.classProperties(use.name));
    }
    apply(this.explicit.get(target));
    const style: Record<string, string | number> = {};
    for (const [name, value] of Object.entries(merged)) {
      style[name] =
        COLOR_PROPERTIES.has(name) && typeof value === "string"
          ? themeColor(this.theme, value)
          : value;
    }
    if (style.pattern === "none") delete style.pattern;
    const resolved = style as ResolvedStyle;
    this.cache.set(target, resolved);
    return resolved;
  }
}
