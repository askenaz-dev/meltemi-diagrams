import {
  BUILT_IN_CLASSES,
  BUILT_IN_THEMES,
  DEFAULT_THEME,
  THEME_CANVAS_TOKENS,
  THEME_DURATION_TOKENS,
  type ARROWHEADS,
  type CORNERS,
  type ICON_POSITIONS,
  type SKETCH_LEVELS,
  type LABEL_POSITIONS,
  type RuleKind,
  type StyleProperties,
  type ThemeDefinition,
} from "@meltemi/diagrams-model";

export type FrameMode = "none" | "footer" | "header";
export type MarkMode = "meltemi" | "none";
export type ArrowheadKind = (typeof ARROWHEADS)[number];
export type CornerKind = (typeof CORNERS)[number];
/** How strokes are painted: clean, or in two jittered passes (`light`, `rough`). */
export type SketchLevel = (typeof SKETCH_LEVELS)[number];
export type IconPosition = (typeof ICON_POSITIONS)[number];
/** Where the label sits when the icon is the centre piece of an element. */
export type LabelPosition = (typeof LABEL_POSITIONS)[number];

/** A kind rule of a theme or a diagram. */
export interface ThemeRule {
  readonly kind: RuleKind;
  readonly properties: StyleProperties;
}

/**
 * Design tokens used by the layout, named like the tokens of `theme <id> { }` blocks. Built in
 * here and overridable by theme blocks; `classes` and `rules` are those of the whole chain.
 */
export interface Theme {
  readonly name: string;
  readonly background: string;
  readonly surface: string;
  readonly ink: string;
  readonly muted: string;
  readonly line: string;
  readonly connector: string;
  /** Fill and outline of groups. */
  readonly band: string;
  readonly bandLine: string;
  /** Fill and text of tags. */
  readonly tag: string;
  readonly tagText: string;
  /** Start and end colours of the brand gradient. */
  readonly accent: string;
  readonly accentEnd: string;
  readonly success: string;
  readonly warning: string;
  readonly danger: string;
  readonly info: string;
  /** CSS font stacks of body and monospace text. */
  readonly font: string;
  readonly mono: string;
  readonly labelSize: number;
  readonly descriptionSize: number;
  readonly groupTitleSize: number;
  readonly noteSize: number;
  readonly tagSize: number;
  readonly relationLabelSize: number;
  readonly frameSize: number;
  readonly labelWeight: number;
  /** Space between a box edge and its text when the layout sizes the box. */
  readonly padding: number;
  /** Side and bottom padding of groups derived from their children. */
  readonly groupPadding: number;
  /** Height of a group's title band. */
  readonly groupHeader: number;
  /** Space around the content of the canvas. */
  readonly margin: number;
  readonly radius: number;
  readonly groupRadius: number;
  readonly strokeWidth: number;
  readonly connectorWidth: number;
  readonly arrowhead: ArrowheadKind;
  /** Corners of straight and elbow connectors; built-in themes keep them sharp. */
  readonly corners: CornerKind;
  /**
   * How strokes are painted: `none` for clean lines, `light` or `rough` for two jittered passes
   * that the renderer paints over the clean scene; built-in themes `none`, `sketch.*` `light`.
   */
  readonly sketch: SketchLevel;
  readonly arrowSize: number;
  /** Side of the square icons are drawn in. */
  readonly iconSize: number;
  /** Where box icons go relative to the text. */
  readonly iconPosition: IconPosition;
  readonly frame: FrameMode;
  readonly brand: string;
  readonly mark: MarkMode;
  /**
   * Default durations of the effects, in milliseconds, when the theme writes them; effects that
   * write no `duration` take these before the engine's constants. Built-in themes write none.
   */
  readonly flowDuration?: number;
  readonly dashDuration?: number;
  readonly pulseDuration?: number;
  readonly traceDuration?: number;
  /** The canvas's selection and guide colours, when the theme writes them; else `accent`. */
  readonly selection?: string;
  readonly guide?: string;
  /** Classes by name: built-in classes shadowed by those of the chain, most specific last. */
  readonly classes: Readonly<Record<string, StyleProperties>>;
  /** Kind rules of the chain, from the base theme to the most specific. */
  readonly rules: readonly ThemeRule[];
}

const FONT_INTER = '"Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const FONT_PLEX = '"IBM Plex Sans", "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const FONT_MONO = 'ui-monospace, "Cascadia Mono", Consolas, "Liberation Mono", Menlo, monospace';

export const DEFAULT_THEME_NAME: string = DEFAULT_THEME;
export const BRAND_NAME = "Meltemi Diagrams";

type Palette = Pick<
  Theme,
  | "background"
  | "surface"
  | "ink"
  | "muted"
  | "line"
  | "connector"
  | "band"
  | "bandLine"
  | "tag"
  | "tagText"
  | "accent"
  | "accentEnd"
  | "success"
  | "warning"
  | "danger"
  | "info"
>;

/** Technical: architecture review, the Meltemi palette and a footer frame. */
const TECHNICAL = {
  font: FONT_INTER,
  mono: FONT_MONO,
  labelSize: 13,
  descriptionSize: 11,
  groupTitleSize: 13,
  noteSize: 11,
  tagSize: 10.5,
  relationLabelSize: 11,
  frameSize: 12,
  labelWeight: 600,
  padding: 16,
  groupPadding: 16,
  groupHeader: 40,
  margin: 20,
  radius: 8,
  groupRadius: 14,
  strokeWidth: 1,
  connectorWidth: 1.3,
  arrowhead: "triangle",
  corners: "sharp",
  sketch: "none",
  arrowSize: 8,
  iconSize: 18,
  iconPosition: "left",
  frame: "footer",
  brand: BRAND_NAME,
  mark: "meltemi",
} as const;

/** Editorial: documents and long reading, quiet greys, IBM Plex and no frame. */
const EDITORIAL = {
  ...TECHNICAL,
  font: FONT_PLEX,
  groupTitleSize: 12,
  radius: 6,
  groupRadius: 10,
  connectorWidth: 1,
  arrowhead: "open",
  arrowSize: 7,
  iconSize: 16,
  frame: "none",
} as const;

/** Stage: presentations and video, larger type, heavier strokes, wide margins, header frame. */
const STAGE = {
  ...TECHNICAL,
  labelSize: 16,
  descriptionSize: 13,
  groupTitleSize: 15,
  noteSize: 13,
  tagSize: 12,
  relationLabelSize: 13,
  frameSize: 14,
  padding: 20,
  groupPadding: 20,
  groupHeader: 46,
  margin: 48,
  radius: 10,
  groupRadius: 16,
  strokeWidth: 1.5,
  connectorWidth: 2,
  arrowSize: 10,
  iconSize: 24,
  iconPosition: "top",
  frame: "header",
} as const;

/**
 * Sketch: whiteboards and early thinking, the technical palettes and sizes with rounded corners
 * and strokes painted in two light passes. Inter until a hand font is bundled.
 */
const SKETCH = {
  ...TECHNICAL,
  corners: "rounded",
  sketch: "light",
} as const;

const LIGHT_SIGNALS = {
  success: "#15803D",
  warning: "#B45309",
  danger: "#B91C1C",
  info: "#0369A1",
} as const;
const DARK_SIGNALS = {
  success: "#4ADE80",
  warning: "#FBBF24",
  danger: "#F87171",
  info: "#38BDF8",
} as const;

/** The technical palettes, which the sketch themes share. */
const TECHNICAL_LIGHT: Palette = {
  background: "#F7FBFF",
  surface: "#FFFFFF",
  ink: "#0B1830",
  muted: "#526579",
  line: "#DCE5ED",
  connector: "#526579",
  band: "#EAF1F8",
  bandLine: "#C9D6E3",
  tag: "#2563EB",
  tagText: "#FFFFFF",
  accent: "#1D4ED8",
  accentEnd: "#0891B2",
  ...LIGHT_SIGNALS,
};
const TECHNICAL_DARK: Palette = {
  background: "#07111F",
  surface: "#0F1B2D",
  ink: "#F7FBFF",
  muted: "#88A0B9",
  line: "#183149",
  connector: "#88A0B9",
  band: "#0B1830",
  bandLine: "#183149",
  tag: "#22D3EE",
  tagText: "#07111F",
  accent: "#3B82F6",
  accentEnd: "#22D3EE",
  ...DARK_SIGNALS,
};

const PALETTES: Readonly<Record<(typeof BUILT_IN_THEMES)[number], Palette>> = {
  "technical.light": TECHNICAL_LIGHT,
  "technical.dark": TECHNICAL_DARK,
  "editorial.light": {
    background: "#ffffff",
    surface: "#ffffff",
    ink: "#1b1f23",
    muted: "#5b6570",
    line: "#c7cdd2",
    connector: "#5b6570",
    band: "#f5f6f4",
    bandLine: "#c7cdd2",
    tag: "#1b1f23",
    tagText: "#ffffff",
    accent: "#1D4ED8",
    accentEnd: "#0891B2",
    success: "#2F6B3F",
    warning: "#8A5A00",
    danger: "#A33A2B",
    info: "#2E5E8C",
  },
  "editorial.dark": {
    background: "#13161a",
    surface: "#1b1f24",
    ink: "#e5e8eb",
    muted: "#9aa4ad",
    line: "#3b434b",
    connector: "#9aa4ad",
    band: "#1f2429",
    bandLine: "#3b434b",
    tag: "#e5e8eb",
    tagText: "#13161a",
    accent: "#3B82F6",
    accentEnd: "#22D3EE",
    success: "#7FBF8E",
    warning: "#E0B05C",
    danger: "#E58A7C",
    info: "#8DB8E0",
  },
  "stage.light": {
    background: "#FFFFFF",
    surface: "#FFFFFF",
    ink: "#0A0F1A",
    muted: "#3D4A5C",
    line: "#9AA8B8",
    connector: "#3D4A5C",
    band: "#EEF2F7",
    bandLine: "#B8C4D2",
    tag: "#1D4ED8",
    tagText: "#FFFFFF",
    accent: "#1D4ED8",
    accentEnd: "#0891B2",
    ...LIGHT_SIGNALS,
  },
  "stage.dark": {
    background: "#05080F",
    surface: "#0E1626",
    ink: "#FFFFFF",
    muted: "#A9B8CC",
    line: "#2B3B52",
    connector: "#A9B8CC",
    band: "#0A1220",
    bandLine: "#2B3B52",
    tag: "#22D3EE",
    tagText: "#05080F",
    accent: "#3B82F6",
    accentEnd: "#22D3EE",
    ...DARK_SIGNALS,
  },
  "sketch.light": TECHNICAL_LIGHT,
  "sketch.dark": TECHNICAL_DARK,
};

const FAMILIES = {
  technical: TECHNICAL,
  editorial: EDITORIAL,
  stage: STAGE,
  sketch: SKETCH,
} as const;

export const THEMES: Readonly<Record<string, Theme>> = Object.fromEntries(
  BUILT_IN_THEMES.map((name) => {
    const family = FAMILIES[name.split(".")[0] as keyof typeof FAMILIES];
    const theme: Theme = {
      name,
      ...PALETTES[name],
      ...family,
      classes: BUILT_IN_CLASSES,
      rules: [],
    };
    return [name, theme];
  }),
);

/** Names of the tokens a theme block may set, which are also fields of `Theme`. */
const TOKEN_FIELDS: ReadonlySet<string> = new Set([
  ...Object.keys(THEMES[DEFAULT_THEME_NAME]!).filter(
    (key) => key !== "name" && key !== "classes" && key !== "rules",
  ),
  ...Object.values(THEME_DURATION_TOKENS),
  ...THEME_CANVAS_TOKENS,
]);

function applyDefinition(base: Theme, definition: ThemeDefinition, name: string): Theme {
  const theme: Record<string, unknown> = { ...base, name };
  for (const [token, value] of Object.entries(definition.tokens)) {
    if (TOKEN_FIELDS.has(token)) theme[token] = value;
  }
  const classes: Record<string, StyleProperties> = { ...base.classes };
  for (const definitionClass of definition.classes) {
    classes[definitionClass.id] = definitionClass.properties;
  }
  theme.classes = classes;
  theme.rules = [
    ...base.rules,
    ...definition.rules.map((rule) => ({ kind: rule.kind, properties: rule.properties })),
  ];
  return theme as unknown as Theme;
}

/**
 * Resolves a theme name: first among the given theme definitions (applying `extends` chains),
 * then among built-in themes. Unknown names give the default theme with `known: false`.
 */
export function resolveTheme(
  name: string | null,
  definitions: readonly ThemeDefinition[] = [],
): { theme: Theme; known: boolean } {
  const fallback = THEMES[DEFAULT_THEME_NAME]!;
  if (name === null) return { theme: fallback, known: true };
  const byId = new Map(definitions.map((d) => [d.id, d]));
  const visiting = new Set<string>();
  const build = (id: string): Theme | undefined => {
    const definition = byId.get(id);
    if (definition) {
      if (visiting.has(id)) return undefined;
      visiting.add(id);
      const base = definition.extends === null ? fallback : build(definition.extends);
      visiting.delete(id);
      return base ? applyDefinition(base, definition, id) : undefined;
    }
    return THEMES[id];
  };
  const theme = build(name);
  return theme ? { theme, known: true } : { theme: fallback, known: false };
}
