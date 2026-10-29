/**
 * Profile vocabularies. The parser only knows statement shapes (decision 0003); these tables give
 * words their meaning: diagram profiles, animation, stories and export profiles.
 */

export type ValueSpec =
  | { readonly kind: "enum"; readonly values: readonly string[]; readonly default?: string }
  | { readonly kind: "string" }
  | { readonly kind: "icon" }
  /** A quoted colour; with `tokens`, also the bare name of a colour token, stored as `@<name>`. */
  | { readonly kind: "color"; readonly tokens?: boolean }
  /** A time with `ms` or `s`, in milliseconds within `min`..`max`; without `min`, above 0. */
  | { readonly kind: "time"; readonly min?: number; readonly max?: number }
  /** `forever` or a whole number from 1 to `max`. */
  | { readonly kind: "repeat"; readonly max?: number }
  /**
   * One of `keywords`, or a number without a unit or with `px` within `min`..`max`, as
   * `iconSize auto` or `iconSize 32`.
   */
  | {
      readonly kind: "keywordOrNumber";
      readonly keywords: readonly string[];
      readonly min: number;
      readonly max: number;
    }
  /** A number without a unit or with `px`, within `min`..`max`, and one of `values` when given. */
  | {
      readonly kind: "number";
      readonly min: number;
      readonly max: number;
      readonly values?: readonly number[];
    }
  /** A `(width, height)` pair of numbers within `min`..`max`. */
  | { readonly kind: "size"; readonly min: number; readonly max: number }
  /** One or more class ids separated by commas. */
  | { readonly kind: "classes" }
  /** One identifier, such as a layer name. */
  | { readonly kind: "name" }
  /** One or more identifiers separated by commas. */
  | { readonly kind: "names" }
  /** A dotted reference to an element of another diagram: `<diagram>.<element>`. */
  | { readonly kind: "link" }
  /** A quoted `http:`, `https:` or `mailto:` URL, or a relative one. */
  | { readonly kind: "url" }
  /**
   * `tag "Text"`: one line of quoted text, not empty, written any number of times in a block (a
   * sequence message's or participant's), each a pill of its owner.
   */
  | { readonly kind: "tag" };

export type PropertyTable = Readonly<Record<string, ValueSpec>>;

export const DIRECTIONS = ["LR", "RL", "TB", "BT"] as const;
export const LAYOUT_MODES = ["auto", "assisted", "manual"] as const;
export const PORTS = ["north", "south", "east", "west", "auto"] as const;
export const ANIMATION_EFFECTS = ["flow", "pulse", "dash", "trace"] as const;
export const ANIMATION_DIRECTIONS = ["forward", "reverse"] as const;
/** The properties of `animate` that apply to each effect, beyond `effect`, `duration`, `repeat` and `delay`. */
export const ANIMATION_EFFECT_PROPERTIES: Readonly<
  Record<(typeof ANIMATION_EFFECTS)[number], readonly string[]>
> = {
  flow: ["direction", "particles", "color"],
  dash: ["direction"],
  pulse: ["color"],
  trace: ["direction", "color"],
};
/** Limits of `animate` values, in milliseconds and counts. */
export const ANIMATION_LIMITS = {
  minDuration: 100,
  maxDuration: 60_000,
  maxDelay: 60_000,
  maxRepeat: 1000,
  maxParticles: 8,
} as const;
/** The cycle of an effect that writes no `duration`, in milliseconds. */
export const ANIMATION_DEFAULT_DURATIONS = {
  flow: 1200,
  dash: 1000,
  pulse: 1000,
  trace: 1500,
} as const;
/** Element kinds of flow diagrams. */
export const ELEMENT_KINDS = ["node", "decision", "data", "group", "note", "tag"] as const;
/** Object kinds of free diagrams. */
export const FREE_ELEMENT_KINDS = [
  "box",
  "text",
  "icon",
  "image",
  "note",
  "sticky",
  "line",
  "pen",
  "group",
] as const;
/** Participant kinds of sequence diagrams. */
export const PARTICIPANT_KINDS = [
  "participant",
  "actor",
  "boundary",
  "control",
  "entity",
  "database",
  "collections",
  "queue",
] as const;
/** Element kinds of sequence diagrams: the participants and their groups. */
export const SEQUENCE_ELEMENT_KINDS = [...PARTICIPANT_KINDS, "group"] as const;
/** Entities of an architecture model, which C4 views draw. */
export const ENTITY_KINDS = ["person", "system", "container", "datastore", "component"] as const;
/** Element kinds of C4 views: the entities and the scope boundary. */
export const C4_ELEMENT_KINDS = [...ENTITY_KINDS, "group"] as const;
/** The kinds an entity of each kind may hold; `model` is the model's root. */
export const ENTITY_CHILDREN: Readonly<Record<string, readonly string[]>> = {
  model: ["person", "system"],
  person: [],
  system: ["container", "datastore"],
  container: ["component"],
  datastore: [],
  component: [],
};
/** Statements of an entity block besides child entities. */
export const ENTITY_PROPERTIES = ["description", "technology", "external", "url"] as const;
/** Statements of a model relation block. */
export const MODEL_RELATION_PROPERTIES = ["description", "technology"] as const;
/** Levels of a C4 view. */
export const C4_LEVELS = ["context", "container", "component"] as const;
/** The type line C4 shapes draw under the label. */
export const ENTITY_TYPE_NAMES: Readonly<Record<string, string>> = {
  person: "Person",
  system: "Software System",
  container: "Container",
  datastore: "Container",
  component: "Component",
};
/** Every element kind of every compiled profile. */
export const ALL_ELEMENT_KINDS = [
  ...ELEMENT_KINDS,
  "box",
  "text",
  "icon",
  "image",
  "sticky",
  "line",
  "pen",
  ...PARTICIPANT_KINDS,
  ...ENTITY_KINDS,
] as const;
/** Fragment operators of sequence diagrams. */
export const FRAGMENT_OPERATORS = [
  "alt",
  "opt",
  "loop",
  "par",
  "break",
  "critical",
  "region",
] as const;
/** The keyword of further branches of the operators that have them. */
export const FRAGMENT_BRANCH_KEYWORDS: Readonly<Record<string, string>> = {
  alt: "else",
  par: "and",
  critical: "option",
};
/** Event statements of sequence diagrams, besides messages. */
export const SEQUENCE_EVENTS = [
  "activate",
  "deactivate",
  "create",
  "destroy",
  "note",
  ...FRAGMENT_OPERATORS,
  "divider",
  "delay",
  "return",
] as const;
/** Statements of a `scenario` block. */
export const SCENARIO_STATEMENTS = ["choose", "repeat", "skip", "take"] as const;
export const LINE_STYLES = ["solid", "dashed", "dotted"] as const;

/** Where a relation's token puts its heads: at the end, at both ends, or at neither. */
export type RelationHeads = "end" | "both" | "none";

/**
 * What each relation token draws: its line and its heads. One dash more is dashed; `<` adds the
 * head at the start; the lines `--` and `---` drop the head glyph. A profile's `arrows` table says
 * which of them it takes.
 */
export const RELATION_ARROWS: Readonly<
  Record<string, { readonly line: "solid" | "dashed"; readonly heads: RelationHeads }>
> = {
  "->": { line: "solid", heads: "end" },
  "-->": { line: "dashed", heads: "end" },
  "--": { line: "solid", heads: "none" },
  "---": { line: "dashed", heads: "none" },
  "<->": { line: "solid", heads: "both" },
  "<-->": { line: "dashed", heads: "both" },
};

/** The token that writes a relation of this line and these heads: `arrowToken("dashed", "none")` is `---`. */
export function arrowToken(line: "solid" | "dashed", heads: RelationHeads): string {
  const dashed = line === "dashed";
  if (heads === "none") return dashed ? "---" : "--";
  if (heads === "both") return dashed ? "<-->" : "<->";
  return dashed ? "-->" : "->";
}

export const DIAGRAM_TYPES = ["flow", "sequence", "c4", "free"] as const;
export const MESSAGE_KINDS = ["sync", "async"] as const;
export const PATTERNS = ["none", "hatch", "dots", "cross"] as const;
/**
 * Heads of a relation's ends: the filled and outlined shapes of draw.io and UML, and the crow's-foot
 * ends of entity-relationship diagrams.
 */
export const ARROWHEADS = [
  "triangle",
  "open",
  "none",
  "triangleOutline",
  "diamond",
  "diamondOutline",
  "circle",
  "circleOutline",
  "bar",
  "cross",
  "many",
  "oneOrMany",
  "onlyOne",
  "zeroOrOne",
  "zeroOrMany",
] as const;
/** Corners of straight and elbow connectors. */
export const CORNERS = ["sharp", "rounded"] as const;
/** How a theme paints strokes: clean, or in two jittered passes of a hand-drawn look. */
export const SKETCH_LEVELS = ["none", "light", "rough"] as const;
/** Targets of `rule <kind> { }`: the element kinds of every profile, `relation` and `fragment`. */
export const RULE_KINDS = [...ALL_ELEMENT_KINDS, "relation", "fragment"] as const;
/**
 * Canvas presets: a document warns past 1,200 px, a slide keeps 16:9, and a board grows with what
 * is drawn on it, unreported.
 */
export const PRESETS = ["document", "slide", "board"] as const;
/** How a list group (`layout column|row` in a free group block) arranges its children. */
export const LIST_LAYOUTS = ["column", "row"] as const;
/** Where the children of a list sit across its axis (`align` in a free group block). */
export const LIST_ALIGNS = ["start", "center", "end", "stretch"] as const;
/** The distance a list's `spacing` may write between its children, in pixels. */
export const LIST_SPACING_RANGE = { min: 0, max: 400 } as const;
/** The properties of a free group block that make it a list. */
export const LIST_PROPERTIES = ["layout", "spacing", "align"] as const;
/**
 * Where the icon of a node, decision, data store or box goes: beside, above or below its text, or
 * at the centre as the picture of the box, the label at the edge `labelPosition` names.
 */
export const ICON_POSITIONS = ["left", "right", "top", "bottom", "center"] as const;
/** Where the label sits when the icon is the centre piece (`iconPosition center`, `shape icon`). */
export const LABEL_POSITIONS = ["top", "bottom", "left", "right"] as const;
/** The side of an element's icon that `iconSize` may write, in pixels. */
export const ICON_SIZE_RANGE = { min: 8, max: 128 } as const;
export const ROUTINGS = ["auto", "orthogonal", "polyline", "bezier"] as const;
export const PORT_SIDES = ["north", "south", "east", "west"] as const;
export const ALIGN_EDGES = ["top", "middle", "bottom", "left", "center", "right"] as const;
export const AXES = ["horizontal", "vertical"] as const;
/** Relative constraints of placement blocks. */
export const CONSTRAINTS = ["align", "row", "column", "order", "distance"] as const;

/** Shapes of free boxes and flow nodes, in the order the palette offers them. */
export const BOX_SHAPES = [
  "rounded",
  "rectangle",
  "square",
  "ellipse",
  "circle",
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
  "framed",
  "flag",
  "person",
  "agent",
  "icon",
] as const;
/** The element kinds whose `shape` style chooses their outline: free boxes and flow nodes. */
export const SHAPE_KINDS = ["node", "box"] as const;

/** Whether elements of a kind take the `shape` style; other kinds draw their own shape. */
export function takesShape(kind: string): boolean {
  return (SHAPE_KINDS as readonly string[]).includes(kind);
}

/** Degrees an element may be turned by `rotation`, clockwise about the centre of its box. */
export const ROTATION_RANGE = { min: 0, max: 360 } as const;

/**
 * The element kinds `rotation` turns: every element of flow diagrams and free compositions but
 * groups, which hold other elements, and lines and pens, whose points are written as they are
 * drawn.
 */
export function takesRotation(kind: string): boolean {
  return kind !== "group" && kind !== "line" && kind !== "pen";
}

/** Whether a profile's elements take `rotation`: sequence diagrams and C4 views do not. */
export function profileTakesRotation(profile: { readonly name: string }): boolean {
  return profile.name !== "sequence" && profile.name !== "c4";
}
export const TEXT_ALIGNS = ["left", "center", "right"] as const;
/** Where a free box's text block sits within the shape's text band, top to bottom. */
export const VERTICAL_ALIGNS = ["top", "middle", "bottom"] as const;
export const FONT_WEIGHTS = [400, 500, 600, 700] as const;
/** The layer every free diagram has; listed last when `layers` does not name it. */
export const MAIN_LAYER = "main";

export const FRAME_MODES = ["none", "footer", "header"] as const;
export const MARK_MODES = ["meltemi", "none"] as const;

/** Themes whose tokens are built into the layout package; file themes may extend them. */
export const BUILT_IN_THEMES = [
  "technical.light",
  "technical.dark",
  "editorial.light",
  "editorial.dark",
  "stage.light",
  "stage.dark",
  "sketch.light",
  "sketch.dark",
] as const;
export const DEFAULT_THEME = "technical.light";

/**
 * The colour tokens of whiteboards: highlighter strokes, the default fill of stickies and their
 * text. Colour tokens like the others; the theme panel groups them apart.
 */
export const THEME_WHITEBOARD_TOKENS = ["highlight", "sticky", "stickyText"] as const;

/** Colour tokens of a theme, in the order they are documented. */
export const THEME_COLOR_TOKENS = [
  "background",
  "surface",
  "ink",
  "muted",
  "line",
  "connector",
  "band",
  "bandLine",
  "tag",
  "tagText",
  "accent",
  "accentEnd",
  "success",
  "warning",
  "danger",
  "info",
  ...THEME_WHITEBOARD_TOKENS,
] as const;

/**
 * Colour tokens the canvas draws its selection and guides with; they mean nothing in an export,
 * so they are not colour names in styles. Built-in themes write none: the canvas uses `accent`.
 */
export const THEME_CANVAS_TOKENS = ["selection", "guide"] as const;

const TYPE_SIZE: ValueSpec = { kind: "number", min: 6, max: 48 };
const SPACING: ValueSpec = { kind: "number", min: 0, max: 200 };
const RADIUS: ValueSpec = { kind: "number", min: 0, max: 64 };
const STROKE: ValueSpec = { kind: "number", min: 0, max: 8 };

/** Number tokens of a theme, in the order they are documented. */
export const THEME_NUMBER_TOKENS: PropertyTable = {
  labelSize: TYPE_SIZE,
  descriptionSize: TYPE_SIZE,
  groupTitleSize: TYPE_SIZE,
  noteSize: TYPE_SIZE,
  tagSize: TYPE_SIZE,
  relationLabelSize: TYPE_SIZE,
  frameSize: TYPE_SIZE,
  labelWeight: { kind: "number", min: 400, max: 700, values: [400, 500, 600, 700] },
  padding: SPACING,
  groupPadding: SPACING,
  groupHeader: SPACING,
  margin: SPACING,
  radius: RADIUS,
  groupRadius: RADIUS,
  strokeWidth: STROKE,
  connectorWidth: STROKE,
  arrowSize: { kind: "number", min: 0, max: 32 },
  iconSize: { kind: "number", min: 8, max: 64 },
};

/**
 * The theme token that gives each effect its default duration, used when an `animate` statement
 * writes no `duration`; built-in themes write none, so the engine's constant applies.
 */
export const THEME_DURATION_TOKENS = {
  flow: "flowDuration",
  dash: "dashDuration",
  pulse: "pulseDuration",
  trace: "traceDuration",
} as const satisfies Record<(typeof ANIMATION_EFFECTS)[number], string>;

/** Tokens accepted inside `theme <id> { }` blocks. */
export const THEME_TOKENS: PropertyTable = {
  extends: { kind: "string" },
  ...Object.fromEntries(THEME_COLOR_TOKENS.map((token) => [token, { kind: "color" } as ValueSpec])),
  ...Object.fromEntries(
    THEME_CANVAS_TOKENS.map((token) => [token, { kind: "color" } as ValueSpec]),
  ),
  font: { kind: "string" },
  mono: { kind: "string" },
  ...THEME_NUMBER_TOKENS,
  arrowhead: { kind: "enum", values: ARROWHEADS },
  corners: { kind: "enum", values: CORNERS },
  sketch: { kind: "enum", values: SKETCH_LEVELS },
  iconPosition: { kind: "enum", values: ICON_POSITIONS },
  frame: { kind: "enum", values: FRAME_MODES },
  brand: { kind: "string" },
  mark: { kind: "enum", values: MARK_MODES },
  ...Object.fromEntries(
    Object.values(THEME_DURATION_TOKENS).map((token) => [
      token,
      {
        kind: "time",
        min: ANIMATION_LIMITS.minDuration,
        max: ANIMATION_LIMITS.maxDuration,
      } as ValueSpec,
    ]),
  ),
};

/**
 * Style properties that only free diagrams accept: the size and weight of text, where it sits
 * across (`textAlign`) and down (`verticalAlign`) its box, and the `opacity` of elements, groups,
 * lines and pens (0 is invisible, 1 opaque).
 */
export const FREE_STYLE_PROPERTIES: PropertyTable = {
  fontSize: { kind: "number", min: 6, max: 160 },
  fontWeight: { kind: "number", min: 400, max: 700, values: FONT_WEIGHTS },
  textAlign: { kind: "enum", values: TEXT_ALIGNS },
  verticalAlign: { kind: "enum", values: VERTICAL_ALIGNS },
  opacity: { kind: "number", min: 0, max: 1 },
};

/**
 * Properties of classes and rules: the `style` properties without `class`. Theme classes and rules
 * accept the free properties too; flow diagrams refuse them.
 */
export const STYLE_PROPERTIES: PropertyTable = {
  icon: { kind: "icon" },
  fill: { kind: "color", tokens: true },
  stroke: { kind: "color", tokens: true },
  color: { kind: "color", tokens: true },
  line: { kind: "enum", values: LINE_STYLES },
  /** An outline, a connector or a pen stroke; a pen refuses 0 (`PEN_WIDTH_RANGE`). */
  width: { kind: "number", min: 0, max: 64 },
  pattern: { kind: "enum", values: PATTERNS },
  arrowhead: { kind: "enum", values: ARROWHEADS },
  arrowtail: { kind: "enum", values: ARROWHEADS },
  iconColor: { kind: "color", tokens: true },
  iconPosition: { kind: "enum", values: ICON_POSITIONS },
  /** Where the label sits when the icon is the centre piece. */
  labelPosition: { kind: "enum", values: LABEL_POSITIONS },
  /** The side of the element's icon: `auto` fits the box; the theme's `iconSize` by default. */
  iconSize: { kind: "keywordOrNumber", keywords: ["auto"], ...ICON_SIZE_RANGE },
  routing: { kind: "enum", values: ROUTINGS },
  corners: { kind: "enum", values: CORNERS },
  /** Free boxes and flow nodes only; see `takesShape`. */
  shape: { kind: "enum", values: BOX_SHAPES },
  /** The corner radius of an element or group, over the theme's `radius` or `groupRadius`. */
  radius: RADIUS,
  /** Degrees an element is turned, clockwise about the centre of its box. */
  rotation: { kind: "number", ...ROTATION_RANGE },
  ...FREE_STYLE_PROPERTIES,
};

/** Style properties that apply only to elements, and only to relations. */
export const ELEMENT_ONLY_PROPERTIES: readonly string[] = [
  "pattern",
  "iconPosition",
  "labelPosition",
  "iconSize",
  "shape",
  "radius",
  "rotation",
  ...Object.keys(FREE_STYLE_PROPERTIES),
];
export const RELATION_ONLY_PROPERTIES: readonly string[] = [
  "arrowhead",
  "arrowtail",
  "routing",
  "corners",
];

/**
 * Style properties a free line refuses: the element properties but `opacity`, which fades a line as
 * it fades a box. A line takes the relation properties.
 */
export const LINE_REFUSED_PROPERTIES: readonly string[] = ELEMENT_ONLY_PROPERTIES.filter(
  (name) => name !== "opacity",
);

/** The style properties a pen stroke takes. */
export const PEN_PROPERTIES: readonly string[] = [
  "stroke",
  "width",
  "line",
  "opacity",
  "arrowhead",
  "arrowtail",
];

/**
 * Style properties a pen refuses: a box's fill, shape, radius and pattern, a connector's routing
 * and corners, the icon properties and the text properties. `rotation` is refused apart, as a
 * line's is: a pen's points are written in its statement.
 */
export const PEN_REFUSED_PROPERTIES: readonly string[] = Object.keys(STYLE_PROPERTIES).filter(
  (name) => !PEN_PROPERTIES.includes(name) && name !== "rotation",
);

/** The `width` of a pen stroke: one pixel at least, unlike outlines and connectors. */
export const PEN_WIDTH_RANGE = { min: 1, max: 64 } as const;

/**
 * The style properties a sticky takes: its card's fill and outline, its text, an icon at the top
 * left, rotation and opacity.
 */
export const STICKY_PROPERTIES: readonly string[] = [
  "fill",
  "stroke",
  "color",
  "line",
  "width",
  "fontSize",
  "fontWeight",
  "textAlign",
  "verticalAlign",
  "radius",
  "rotation",
  "opacity",
  "icon",
  "iconColor",
  "iconSize",
];

/**
 * Style properties a sticky refuses: a box's `pattern`, the icon placements of a box (its icon
 * sits at the top left) and the relation properties. `shape` is refused apart, naming the kinds
 * that take it.
 */
export const STICKY_REFUSED_PROPERTIES: readonly string[] = Object.keys(STYLE_PROPERTIES).filter(
  (name) => !STICKY_PROPERTIES.includes(name) && name !== "shape",
);

/**
 * Classes every built-in theme provides. Colours are token names, so the classes follow the
 * theme. A class of the same name in a file theme or a diagram shadows them.
 */
export const BUILT_IN_CLASSES: Readonly<Record<string, Readonly<Record<string, string | number>>>> =
  {
    highlight: { stroke: "@accent", width: 2 },
    critical: { stroke: "@danger", width: 2 },
    proposed: { line: "dashed", stroke: "@warning" },
    deprecated: { pattern: "hatch", stroke: "@muted", color: "@muted" },
    external: { line: "dashed", stroke: "@muted" },
    // C4 kinds, applied first to the elements of C4 views (decision 0020).
    c4_person: { fill: "@accentEnd", stroke: "@accentEnd", color: "@tagText" },
    c4_system: { fill: "@accent", stroke: "@accent", color: "@tagText" },
    c4_container: { fill: "@info", stroke: "@info", color: "@tagText" },
    c4_component: { fill: "@band", stroke: "@info", color: "@ink" },
    c4_external: { fill: "@muted", stroke: "@muted", color: "@tagText", line: "dashed" },
    c4_boundary: { line: "dashed", stroke: "@muted" },
  };

export type DiagramProfile = "flow" | "free" | "sequence" | "c4";

/** The vocabulary of a compiled diagram profile. */
export interface ProfileSchema {
  readonly name: DiagramProfile;
  readonly status: "compiled";
  readonly diagramProperties: PropertyTable;
  readonly elementKinds: readonly string[];
  /** Kinds declared by the shorthand `id["Label"]` and `id[("Label")]`. */
  readonly shorthand: { readonly box: string; readonly data: string };
  /** The kind of an element that only a relation mentions. */
  readonly implicitKind: string;
  readonly elementProperties: PropertyTable;
  readonly groupProperties: PropertyTable;
  readonly relationProperties: PropertyTable;
  readonly arrows: Readonly<Record<string, "solid" | "dashed">>;
  readonly diagramBlocks: readonly string[];
  readonly placementStatements: readonly string[];
  readonly ports: readonly string[];
  readonly styleProperties: PropertyTable;
  readonly animateProperties: PropertyTable;
  /** Kinds `rule <kind> { }` accepts. */
  readonly ruleKinds: readonly string[];
  /** Event statements in the order of a sequence; empty for other profiles. */
  readonly events: readonly string[];
}

const DIAGRAM_PROPERTIES: PropertyTable = {
  direction: { kind: "enum", values: DIRECTIONS, default: "LR" },
  layout: { kind: "enum", values: LAYOUT_MODES, default: "auto" },
  theme: { kind: "string" },
  title: { kind: "string" },
  description: { kind: "string" },
  preset: { kind: "enum", values: PRESETS },
  canvas: { kind: "size", min: 100, max: 10000 },
  routing: { kind: "enum", values: ROUTINGS, default: "auto" },
};

export const ANIMATE_PROPERTIES: PropertyTable = {
  effect: { kind: "enum", values: ANIMATION_EFFECTS },
  duration: {
    kind: "time",
    min: ANIMATION_LIMITS.minDuration,
    max: ANIMATION_LIMITS.maxDuration,
  },
  repeat: { kind: "repeat", max: ANIMATION_LIMITS.maxRepeat },
  delay: { kind: "time", min: 0, max: ANIMATION_LIMITS.maxDelay },
  direction: { kind: "enum", values: ANIMATION_DIRECTIONS },
  particles: {
    kind: "number",
    min: 1,
    max: ANIMATION_LIMITS.maxParticles,
    values: [1, 2, 3, 4, 5, 6, 7, 8],
  },
  color: { kind: "color", tokens: true },
};

export const FLOW_PROFILE: ProfileSchema = {
  name: "flow",
  status: "compiled",
  diagramProperties: { ...DIAGRAM_PROPERTIES, layers: { kind: "names" } },
  elementKinds: ELEMENT_KINDS,
  shorthand: { box: "node", data: "data" },
  implicitKind: "node",
  elementProperties: {
    description: { kind: "string" },
    class: { kind: "classes" },
    layer: { kind: "name" },
    link: { kind: "link" },
    url: { kind: "url" },
  },
  groupProperties: {
    description: { kind: "string" },
    class: { kind: "classes" },
    layer: { kind: "name" },
    link: { kind: "link" },
    url: { kind: "url" },
  },
  relationProperties: {
    description: { kind: "string" },
    layer: { kind: "name" },
    assumption: { kind: "string" },
    class: { kind: "classes" },
  },
  arrows: {
    "->": "solid",
    "-->": "dashed",
    "--": "solid",
    "---": "dashed",
    "<->": "solid",
    "<-->": "dashed",
  },
  diagramBlocks: ["placement", "style", "animate", "class", "rule"],
  placementStatements: ["place", "size", "route", "label", ...CONSTRAINTS],
  ports: PORTS,
  // The free properties are read so that flow diagrams can refuse them by name.
  styleProperties: { ...STYLE_PROPERTIES, class: { kind: "classes" } },
  animateProperties: ANIMATE_PROPERTIES,
  ruleKinds: [...ELEMENT_KINDS, "relation"],
  events: [],
};

export const FREE_PROFILE: ProfileSchema = {
  name: "free",
  status: "compiled",
  diagramProperties: {
    ...DIAGRAM_PROPERTIES,
    layout: { kind: "enum", values: LAYOUT_MODES, default: "manual" },
    layers: { kind: "names" },
  },
  elementKinds: FREE_ELEMENT_KINDS,
  shorthand: { box: "box", data: "box" },
  implicitKind: "box",
  elementProperties: {
    description: { kind: "string" },
    class: { kind: "classes" },
    layer: { kind: "name" },
    link: { kind: "link" },
    url: { kind: "url" },
  },
  groupProperties: {
    description: { kind: "string" },
    class: { kind: "classes" },
    layer: { kind: "name" },
    link: { kind: "link" },
    url: { kind: "url" },
    // A list: the children in source order along a column or a row.
    layout: { kind: "enum", values: LIST_LAYOUTS },
    spacing: { kind: "number", ...LIST_SPACING_RANGE },
    align: { kind: "enum", values: LIST_ALIGNS },
  },
  relationProperties: {
    description: { kind: "string" },
    assumption: { kind: "string" },
    class: { kind: "classes" },
    layer: { kind: "name" },
  },
  arrows: {
    "->": "solid",
    "-->": "dashed",
    "--": "solid",
    "---": "dashed",
    "<->": "solid",
    "<-->": "dashed",
  },
  diagramBlocks: ["placement", "style", "animate", "class", "rule"],
  placementStatements: ["place", "size", "route", "label", ...CONSTRAINTS],
  ports: PORTS,
  styleProperties: { ...STYLE_PROPERTIES, class: { kind: "classes" } },
  animateProperties: ANIMATE_PROPERTIES,
  ruleKinds: [...FREE_ELEMENT_KINDS, "relation"],
  events: [],
};

export const SEQUENCE_PROFILE: ProfileSchema = {
  name: "sequence",
  status: "compiled",
  diagramProperties: {
    theme: { kind: "string" },
    title: { kind: "string" },
    description: { kind: "string" },
    preset: { kind: "enum", values: PRESETS },
    canvas: { kind: "size", min: 100, max: 10000 },
    autonumber: { kind: "number", min: 0, max: 100000 },
    spacing: { kind: "number", min: 0, max: 400 },
  },
  elementKinds: SEQUENCE_ELEMENT_KINDS,
  shorthand: { box: "participant", data: "database" },
  implicitKind: "participant",
  elementProperties: {
    description: { kind: "string" },
    class: { kind: "classes" },
    link: { kind: "link" },
    url: { kind: "url" },
    tag: { kind: "tag" },
  },
  groupProperties: {
    description: { kind: "string" },
    class: { kind: "classes" },
    link: { kind: "link" },
    url: { kind: "url" },
  },
  relationProperties: {
    description: { kind: "string" },
    assumption: { kind: "string" },
    class: { kind: "classes" },
    kind: { kind: "enum", values: MESSAGE_KINDS },
    tag: { kind: "tag" },
  },
  arrows: { "->": "solid", "-->": "dashed", "<->": "solid", "<-->": "dashed" },
  diagramBlocks: ["placement", "style", "animate", "class", "rule", "scenario"],
  placementStatements: ["space", "gap", "label"],
  ports: [],
  styleProperties: { ...STYLE_PROPERTIES, class: { kind: "classes" } },
  animateProperties: ANIMATE_PROPERTIES,
  ruleKinds: [...SEQUENCE_ELEMENT_KINDS, "relation", "note", "fragment"],
  events: SEQUENCE_EVENTS,
};

export const C4_PROFILE: ProfileSchema = {
  name: "c4",
  status: "compiled",
  diagramProperties: {
    ...DIAGRAM_PROPERTIES,
    level: { kind: "enum", values: C4_LEVELS },
    scope: { kind: "name" },
  },
  // Elements come from the model; views declare notes, never entities.
  elementKinds: ["note"],
  shorthand: { box: "container", data: "datastore" },
  implicitKind: "container",
  // A view's note takes `class` and `url`; `description`, `layer` and `link` stay refused.
  elementProperties: { class: { kind: "classes" }, url: { kind: "url" } },
  groupProperties: {},
  relationProperties: {
    description: { kind: "string" },
    technology: { kind: "string" },
    assumption: { kind: "string" },
  },
  arrows: { "->": "solid", "-->": "dashed" },
  diagramBlocks: ["placement", "style", "animate", "class", "rule"],
  placementStatements: ["place", "size", "route", "label", ...CONSTRAINTS],
  ports: PORTS,
  styleProperties: { ...STYLE_PROPERTIES, class: { kind: "classes" } },
  animateProperties: ANIMATE_PROPERTIES,
  ruleKinds: [...C4_ELEMENT_KINDS, "note", "relation"],
  events: [],
};

/** Statements of a C4 view besides diagram properties and blocks. */
export const VIEW_STATEMENTS = ["include", "exclude", "label"] as const;

/** The compiled profiles by name. */
export const PROFILES: Readonly<Record<DiagramProfile, ProfileSchema>> = {
  flow: FLOW_PROFILE,
  free: FREE_PROFILE,
  sequence: SEQUENCE_PROFILE,
  c4: C4_PROFILE,
};

/** The profile of a diagram type, or undefined when the type does not compile. */
export function profileOf(type: string): ProfileSchema | undefined {
  return type === "flow" || type === "free" || type === "sequence" || type === "c4"
    ? PROFILES[type]
    : undefined;
}

/** Whether a style property belongs to free diagrams only. */
export function isFreeStyleProperty(name: string): boolean {
  return name in FREE_STYLE_PROPERTIES;
}

/**
 * Whether a profile has kinds that take `shape`: flow and free diagrams and the declared types
 * built on the free profile do; sequence diagrams and C4 views do not.
 */
export function profileTakesShape(profile: ProfileSchema): boolean {
  return profile.elementKinds.some(takesShape);
}

/** The formats of `export` profiles. */
export const EXPORT_FORMATS = ["svg", "png", "pdf", "html", "mp4", "webm", "gif"] as const;
export const VIDEO_FORMATS = ["mp4", "webm", "gif"] as const;

type Format = (typeof EXPORT_FORMATS)[number];
const ALL: readonly Format[] = EXPORT_FORMATS;
const SIZED: readonly Format[] = ["png", "pdf", "mp4", "webm", "gif"];

/**
 * The options of an `export` profile: the formats each applies to, and its value (null for a
 * statement without a value, such as `autoplay`).
 */
export const EXPORT_OPTIONS: Readonly<
  Record<string, { readonly formats: readonly Format[]; readonly spec: ValueSpec | null }>
> = {
  format: { formats: ALL, spec: { kind: "enum", values: EXPORT_FORMATS } },
  size: { formats: SIZED, spec: { kind: "size", min: 16, max: 16384 } },
  scale: { formats: ["png"], spec: { kind: "number", min: 1, max: 8 } },
  background: { formats: ["svg", "png", "pdf", "mp4", "webm", "gif"], spec: null },
  at: { formats: ["svg", "png", "pdf"], spec: { kind: "time", min: 0, max: 600_000 } },
  motion: { formats: ["svg"], spec: { kind: "enum", values: ["static", "animated"] } },
  theme: { formats: ALL, spec: { kind: "string" } },
  fonts: {
    formats: ["svg", "html"],
    spec: { kind: "enum", values: ["embedded", "outlined", "system"] },
  },
  scenario: { formats: ALL, spec: { kind: "name" } },
  link: { formats: ["svg", "pdf"], spec: { kind: "url" } },
  fps: { formats: VIDEO_FORMATS, spec: { kind: "number", min: 1, max: 60 } },
  duration: { formats: VIDEO_FORMATS, spec: { kind: "time", min: 1, max: 600_000 } },
  file: { formats: ALL, spec: { kind: "string" } },
  autoplay: { formats: ["html"], spec: null },
  loop: { formats: ["html"], spec: null },
  embed: { formats: ["html"], spec: null },
};

/** The file extension of each format. */
export const EXPORT_EXTENSIONS: Readonly<Record<Format, string>> = {
  svg: "svg",
  png: "png",
  pdf: "pdf",
  html: "html",
  mp4: "mp4",
  webm: "webm",
  gif: "gif",
};

/** Statements of a `story` block, of a scene, and the actions a scene runs. */
export const STORY_STATEMENTS = ["title", "description", "scene"] as const;
export const SCENE_STATEMENTS = ["view", "transition"] as const;
export const STORY_ACTIONS = [
  "reveal",
  "hide",
  "highlight",
  "focus",
  "camera",
  "trace",
  "draw",
  "hold",
  "parallel",
] as const;
export const STORY_TRANSITIONS = ["cut", "fade", "morph"] as const;
/** Times an action or transition takes when it writes no `over`, in milliseconds. */
export const STORY_DEFAULT_TIMES = {
  reveal: 600,
  hide: 600,
  focus: 600,
  camera: 800,
  highlight: 1000,
  trace: 1200,
  draw: 800,
  hold: 0,
  parallel: 0,
  cut: 0,
  fade: 800,
  morph: 800,
} as const;
/** The longest time a story statement may write, in milliseconds. */
export const STORY_MAX_TIME = 600_000;

/** Words that may start a statement at the top level of a diagram of a profile. */
export function diagramStatements(profile: ProfileSchema = FLOW_PROFILE): string[] {
  return [
    ...profile.elementKinds,
    ...Object.keys(profile.diagramProperties),
    ...profile.diagramBlocks,
    ...profile.events,
  ];
}

/** Words that may start a statement at the top level of a flow diagram. */
export function flowDiagramStatements(): string[] {
  return diagramStatements(FLOW_PROFILE);
}
