import type { IconRegistry } from "@meltemi/diagrams-assets";
import type { EditOperation } from "@meltemi/diagrams-edit";
import {
  ARROWHEADS,
  BOX_SHAPES,
  CORNERS,
  BUILT_IN_THEMES,
  DEFAULT_THEME,
  FONT_WEIGHTS,
  TEXT_ALIGNS,
  VERTICAL_ALIGNS,
  DIRECTIONS,
  ELEMENT_ONLY_PROPERTIES,
  ICON_POSITIONS,
  LABEL_POSITIONS,
  LAYOUT_MODES,
  LINE_REFUSED_PROPERTIES,
  LINE_STYLES,
  LIST_ALIGNS,
  LIST_LAYOUTS,
  LIST_SPACING_RANGE,
  PATTERNS,
  PEN_PROPERTIES,
  PEN_WIDTH_RANGE,
  PORTS,
  PRESETS,
  PROFILES,
  RELATION_ONLY_PROPERTIES,
  ROUTINGS,
  STICKY_PROPERTIES,
  STYLE_PROPERTIES,
  TEXTLESS_KINDS,
  TEXT_PROPERTIES,
  THEME_COLOR_TOKENS,
  takesRotation,
  takesShape,
  type AnimationEffect,
  type Element,
  type FlowDiagram,
  type LabelEntry,
  type PlaceEntry,
  type Relation,
  type RouteEntry,
  type SizeEntry,
  type StyleEntry,
} from "@meltemi/diagrams-model";
import {
  CORNERED_SHAPES,
  DEFAULT_PEN_WIDTH,
  StyleResolver,
  type Theme,
} from "@meltemi/diagrams-layout";
import { DEFAULT_DURATIONS, themeDurations } from "@meltemi/diagrams-motion";
import { diagramView, type DiagramView, type DocumentAnalysis } from "./analysis.js";
import { interiorOf, placingList, steadyGroups, unlistedOperations } from "./arrange.js";
import { STICKY_COLOURS } from "./canvas/palette.js";
import { FONT_SIZE_STEPS, drawnText } from "./fonts.js";
import type {
  ColorSwatch,
  FieldGlyphs,
  InspectorField,
  InspectorModel,
} from "./canvas/protocol.js";
import { c4DiagramFields, c4ElementFields, c4FieldOperations, c4RelationFields } from "./c4.js";
import {
  effectFields,
  effectLabel,
  effectOperations,
  effectsFor,
  selectionAfter,
} from "./effects.js";
import { drawnIconSize, iconChoice, iconKind } from "./icons.js";
import { messages } from "./messages/index.js";
import { freshRelationId, namedNotice, namedRelation, styleTargets } from "./targets.js";
import { effectiveTheme, embeddableFamilies, themeLocation } from "./themes.js";

export { freshRelationId, namedRelation };
import {
  eventFields,
  messageFields,
  participantFields,
  sequenceDiagramFields,
  sequenceFieldOperations,
} from "./sequence.js";

/** A style property of the inspector; its label is looked up when the model is built. */
type StyleField = {
  name: keyof ReturnType<typeof messages>["style"];
  type: InspectorField["type"];
  /** The choices, or the choices of a diagram when they depend on its profile. */
  options?: readonly string[] | ((diagram: FlowDiagram) => readonly string[]);
  glyphs?: FieldGlyphs;
  range?: InspectorField["range"];
  /** The elements the field is for, when not every target that takes a style. */
  elements?: (kind: string, diagram: FlowDiagram) => boolean;
};

/** The bounds of a number style property, or of the number of `iconSize`, from the language. */
function rangeOf(property: string): InspectorField["range"] {
  const spec = STYLE_PROPERTIES[property]!;
  return spec.kind === "number" || spec.kind === "keywordOrNumber"
    ? { min: spec.min, max: spec.max, step: 1 }
    : undefined;
}

/** C4 entities draw their icon beside, above or below their text as boxes do. */
const C4_ICON_KINDS: ReadonlySet<string> = new Set([
  "person",
  "system",
  "container",
  "datastore",
  "component",
]);

/**
 * The kinds whose corners `radius` sets: nodes and boxes when their shape has corners (see
 * `withElementDefaults`), decisions (their diamond's vertices), notes and groups; sequence
 * participants, tags, data stores and C4 entities draw their own.
 */
const RADIUS_KINDS: ReadonlySet<string> = new Set(["node", "box", "decision", "note", "group"]);

/**
 * The shapes of nodes and boxes whose drawing uses `radius`: the cornered shapes, and the icon
 * shape, whose frame takes it.
 */
const RADIUS_SHAPES: ReadonlySet<string> = new Set([...CORNERED_SHAPES, "icon"]);

/**
 * The objects of free diagrams whose frame (a fill, a stroke or a pattern) takes `radius`, and
 * stickies, whose card does.
 */
const FRAME_KINDS: ReadonlySet<string> = new Set(["text", "icon", "image", "sticky"]);

/** The corner radius of a sticky's card when nothing writes one, as the layout draws it. */
const STICKY_RADIUS = 2;

/** The bounds of `opacity` and the slider's step: from invisible to opaque, by twentieths. */
const OPACITY_RANGE: NonNullable<InspectorField["range"]> = { ...rangeOf("opacity")!, step: 0.05 };

/** The bounds of a pen's `width` as its slider shows them: one pixel at least. */
const PEN_WIDTH_FIELD_RANGE: NonNullable<InspectorField["range"]> = { ...PEN_WIDTH_RANGE, step: 1 };

/**
 * The style properties of the kinds that take a set of their own rather than an element's or a
 * relation's: a pen's stroke and heads, a sticky's card, text and icon.
 */
const OWN_PROPERTIES: Readonly<Record<string, readonly string[]>> = {
  pen: PEN_PROPERTIES,
  sticky: STICKY_PROPERTIES,
};

/**
 * Style fields sequence diagrams leave out: messages go straight between lifelines, and neither
 * participants nor messages draw an icon.
 */
const NOT_IN_SEQUENCES: ReadonlySet<string> = new Set(["routing", "icon", "iconColor"]);

const STYLE_FIELDS: readonly StyleField[] = [
  { name: "fill", type: "color" },
  { name: "stroke", type: "color" },
  { name: "color", type: "color" },
  { name: "line", type: "enum", options: LINE_STYLES, glyphs: "line" },
  { name: "width", type: "number" },
  { name: "pattern", type: "enum", options: PATTERNS },
  { name: "icon", type: "icon" },
  { name: "iconColor", type: "color" },
  // Nodes, decisions, data stores and boxes, which put the icon in their box, and C4 entities,
  // which draw their own shape: their icon goes beside, above or below the text, never centred.
  {
    name: "iconPosition",
    type: "enum",
    options: (diagram) =>
      diagram.type === "c4" ? ICON_POSITIONS.filter((p) => p !== "center") : ICON_POSITIONS,
    glyphs: "iconPosition",
    elements: (kind, diagram) =>
      iconKind(kind, diagram) || (diagram.type === "c4" && C4_ICON_KINDS.has(kind)),
  },
  // Shown only when the icon is the centre piece: see `withElementDefaults`.
  {
    name: "labelPosition",
    type: "enum",
    options: LABEL_POSITIONS,
    glyphs: "labelPosition",
    elements: iconKind,
  },
  // A sticky's icon sits at its top left, at the size this field writes.
  {
    name: "iconSize",
    type: "number",
    range: rangeOf("iconSize"),
    elements: (kind, diagram) =>
      iconKind(kind, diagram) || (diagram.type === "free" && kind === "sticky"),
  },
  { name: "arrowtail", type: "enum", options: ARROWHEADS, glyphs: "arrowStart" },
  { name: "arrowhead", type: "enum", options: ARROWHEADS, glyphs: "arrowEnd" },
  { name: "routing", type: "enum", options: ROUTINGS, glyphs: "route" },
  { name: "corners", type: "enum", options: CORNERS, glyphs: "corners" },
  // The elements of flow and free diagrams but groups turn; the slider stops before a full turn.
  {
    name: "rotation",
    type: "number",
    range: { min: 0, max: 359, step: 1 },
    elements: (kind, diagram) =>
      diagram.type !== "sequence" && diagram.type !== "c4" && takesRotation(kind),
  },
  {
    name: "radius",
    type: "number",
    range: rangeOf("radius"),
    elements: (kind, diagram) =>
      diagram.type !== "sequence" &&
      (RADIUS_KINDS.has(kind) || (diagram.type === "free" && FRAME_KINDS.has(kind))),
  },
  // Free boxes, flow nodes and the kinds of declared types, which are boxes.
  {
    name: "shape",
    type: "enum",
    options: BOX_SHAPES,
    glyphs: "shape",
    elements: (kind) => takesShape(kind),
  },
  // Free boxes, stickies and texts: where the text sits across; boxes and stickies also where it
  // sits down the card. The canvas draws the two as one grid of cells.
  {
    name: "textAlign",
    type: "enum",
    options: TEXT_ALIGNS,
    glyphs: "textAlign",
    elements: (kind, diagram) =>
      diagram.type === "free" && (kind === "box" || kind === "text" || kind === "sticky"),
  },
  {
    name: "verticalAlign",
    type: "enum",
    options: VERTICAL_ALIGNS,
    glyphs: "verticalAlign",
    elements: (kind, diagram) => diagram.type === "free" && (kind === "box" || kind === "sticky"),
  },
];

/**
 * The text fields of every profile (decision 0067): the font, picked in the canvas's font picker,
 * the size with the common sizes listed, and the weight as four chips. Everything that draws text
 * takes them; icons, images and pens do not (`takesField`).
 */
const TEXT_STYLE_FIELDS: readonly StyleField[] = [
  { name: "font", type: "font" },
  { name: "fontSize", type: "number" },
  { name: "fontWeight", type: "enum", options: FONT_WEIGHTS.map(String), glyphs: "fontWeight" },
];

/** Style fields of free diagrams: the opacity of elements, groups, lines and pens, from 0 to 1. */
const FREE_STYLE_FIELDS: readonly StyleField[] = [
  { name: "opacity", type: "number", range: OPACITY_RANGE },
];

/** The word for a kind in titles: the interface's, or the kind itself for declared types. */
function kindName(kind: string): string {
  const kinds: Readonly<Record<string, string>> = messages().kinds;
  return Object.hasOwn(kinds, kind) ? kinds[kind]! : kind;
}

const round = (n: number) => Math.round(n * 100) / 100;

type StyleTarget = { id: string; kind: "element" | "relation" | "event" };

/** The written style properties of a target, merged over its style statements. */
function writtenStyle(diagram: FlowDiagram, target: string, kind: StyleTarget["kind"]) {
  const merged: Record<string, string | number> = {};
  for (const entry of diagram.styles as readonly StyleEntry[]) {
    if (entry.target !== target || entry.targetKind !== kind) continue;
    Object.assign(merged, entry.properties);
  }
  return merged;
}

/** Colour tokens are stored as `@token`; the inspector shows the token name. */
const shown = (value: string | number | undefined): string | number | null =>
  value === undefined
    ? null
    : typeof value === "string" && value.startsWith("@")
      ? value.slice(1)
      : value;

/**
 * Whether a target takes a style field: a relation the relation properties and none of a box's;
 * a free line the same, and its `opacity`; a pen and a sticky their own sets (`OWN_PROPERTIES`);
 * the other elements and events the element properties, those meant for some kinds only where
 * the kind is one of them.
 */
function takesField(diagram: FlowDiagram, target: StyleTarget, field: StyleField): boolean {
  if (diagram.type === "sequence" && NOT_IN_SEQUENCES.has(field.name)) return false;
  // The text fields go wherever text is drawn: every element but icons, images and pens, the
  // relations and free lines, and the notes and fragments of sequence diagrams.
  if (TEXT_PROPERTIES.includes(field.name)) {
    if (target.kind === "relation") return true;
    if (target.kind === "event") {
      const kind = diagram.eventsByKey.get(target.id)?.kind;
      return kind === "note" || kind === "fragment";
    }
    const element = diagram.elementsById.get(target.id);
    return element !== undefined && !TEXTLESS_KINDS.includes(element.kind);
  }
  if (target.kind === "relation") {
    return !ELEMENT_ONLY_PROPERTIES.includes(field.name) && field.elements === undefined;
  }
  if (target.kind === "event") {
    return !RELATION_ONLY_PROPERTIES.includes(field.name) && field.elements === undefined;
  }
  const element = diagram.elementsById.get(target.id);
  if (!element) return false;
  if (element.kind === "line") {
    return !LINE_REFUSED_PROPERTIES.includes(field.name) && field.elements === undefined;
  }
  const own = OWN_PROPERTIES[element.kind];
  if (own ? !own.includes(field.name) : RELATION_ONLY_PROPERTIES.includes(field.name)) {
    return false;
  }
  return field.elements === undefined || field.elements(element.kind, diagram);
}

function styleFields(diagram: FlowDiagram, targets: readonly StyleTarget[]): InspectorField[] {
  const styles = targets.map((t) => writtenStyle(diagram, t.id, t.kind));
  const fields =
    diagram.type === "free"
      ? [...STYLE_FIELDS, ...TEXT_STYLE_FIELDS, ...FREE_STYLE_FIELDS]
      : [...STYLE_FIELDS, ...TEXT_STYLE_FIELDS];
  const labels = messages().style;
  // A pen's stroke is one pixel wide at least, which its slider shows.
  const pens =
    targets.length > 0 &&
    targets.every((t) => t.kind === "element" && diagram.elementsById.get(t.id)?.kind === "pen");
  return fields
    .filter((f) => targets.every((t) => takesField(diagram, t, f)))
    .map((f) => {
      const values = styles.map((s) => shown(s[f.name]));
      const same = values.every((v) => v === values[0]);
      const options = typeof f.options === "function" ? f.options(diagram) : f.options;
      const range = f.name === "width" && pens ? PEN_WIDTH_FIELD_RANGE : f.range;
      return {
        name: `style.${f.name}`,
        label: labels[f.name],
        type: f.type,
        value: same ? (values[0] ?? null) : null,
        ...(same ? { fromTheme: true } : { mixed: true }),
        ...(options ? { options } : {}),
        ...(f.glyphs ? { glyphs: f.glyphs } : {}),
        ...(range ? { range } : {}),
        ...(f.name === "fontSize" ? { list: FONT_SIZE_STEPS } : {}),
      };
    });
}

/**
 * The text fields with what applies when the selection writes none, greyed as their placeholder:
 * the family, size and weight its rules and classes give, else the theme's for its kind, when the
 * selected items share it.
 */
function withTextDefaults(
  model: InspectorModel,
  view: DiagramView,
  theme: Theme,
  families: readonly string[],
): InspectorModel {
  const diagram = view.diagram;
  const ids = model.target.ids;
  if (ids.length === 0 || !model.fields.some((f) => f.name === "style.font")) return model;
  // The styles the targets would take without their own `style` statements.
  const inherited = new StyleResolver(theme, {
    ...diagram,
    styles: diagram.styles.filter((entry) => !ids.includes(entry.target)),
  });
  const faces = ids.map((id) => {
    const kind = diagram.elementsById.has(id)
      ? "element"
      : diagram.relationsByKey.has(id)
        ? "relation"
        : "event";
    return drawnText(theme, diagram, { id, kind }, inherited);
  });
  const shared = <T>(values: readonly (T | undefined)[]): T | undefined =>
    values.length > 0 && values.every((v) => v !== undefined && v === values[0])
      ? values[0]
      : undefined;
  const placeholders: Readonly<Record<string, string | undefined>> = {
    "style.font": shared(faces.map((f) => f?.family)),
    "style.fontSize": shared(faces.map((f) => f?.size))?.toString(),
    "style.fontWeight": shared(faces.map((f) => f?.weight))?.toString(),
  };
  return {
    ...model,
    fields: model.fields.map((field) => {
      const placeholder = placeholders[field.name];
      // The font picker's families, which tell a family it lists from a stack written by hand.
      const listed = field.name === "style.font" ? { options: families } : {};
      return placeholder === undefined
        ? { ...field, ...listed }
        : { ...field, ...listed, placeholder };
    }),
  };
}

/**
 * The element style fields with what applies without a written value, when the targets share it:
 * the shape they are drawn with, the radius of their rules and classes, else the radius drawn (the
 * theme's `radius`, `groupRadius` for groups, a body radius, or none), the icon of their classes and
 * rules, and the icon's position, size and label position. The radius is shown only where it is
 * drawn: not for a box or a node drawn as a shape without corners (an ellipse, a circle, a pill). Label position is shown only
 * where the icon is the centre piece (`iconPosition center`, `shape icon`), and Icon position not
 * where the icon is the shape. Pens show the theme's `ink`, a width of 3 and no heads; stickies
 * the theme's `sticky` and `stickyText` and a radius of 2; every element an opacity of 1, unless
 * their rules and classes give others.
 */
function withElementDefaults(
  fields: readonly InspectorField[],
  view: DiagramView,
  theme: Theme,
  ids: readonly string[],
): InspectorField[] {
  const elements = ids.flatMap((id) => view.diagram.elementsById.get(id) ?? []);
  const shared = (values: readonly string[]) =>
    values.length > 0 && values.every((v) => v === values[0]) ? values[0] : undefined;
  const styles = new StyleResolver(theme, view.diagram);
  // The styles the targets would take without their own `style` statements.
  const inherited = new StyleResolver(theme, {
    ...view.diagram,
    styles: view.diagram.styles.filter((entry) => !ids.includes(entry.target)),
  });
  const shapeOf = (e: Element) =>
    view.layout?.shapes?.get(e.id) ?? styles.element(e).shape ?? e.shape ?? "rounded";
  // The radius drawn without one written: the theme's on rounded boxes, notes and frames, the
  // group radius on groups, a person's or an agent's body radius, and none on the other corners.
  const drawnRadius = (e: Element) => {
    if (e.kind === "group") return theme.groupRadius;
    if (e.kind === "decision") return 0;
    if (e.kind === "sticky") return STICKY_RADIUS;
    if (e.kind !== "box" && e.kind !== "node") return theme.radius;
    switch (shapeOf(e)) {
      case "rounded":
      case "icon":
        return theme.radius;
      case "person":
        return theme.radius * 3;
      case "agent":
        return theme.radius * 1.5;
      default:
        return 0;
    }
  };
  const radius = (e: Element) => styles.element(e).radius ?? drawnRadius(e);
  const drawsRadius = elements.every(
    (e) => (e.kind !== "box" && e.kind !== "node") || RADIUS_SHAPES.has(shapeOf(e)),
  );
  const position = (e: Element) => styles.element(e).iconPosition ?? theme.iconPosition;
  // Only nodes and boxes take `shape icon`; the others keep their own shape.
  const iconShaped = (e: Element) => shapeOf(e) === "icon";
  const centrePiece = (e: Element) =>
    iconKind(e.kind, view.diagram) && (iconShaped(e) || position(e) === "center");
  const some = elements.length > 0;
  const icon = shared(elements.map((e) => styles.element(e).icon ?? ""));
  // Free lines: no head unless written, straight segments, the theme's corners.
  const lines = some && elements.every((e) => e.kind === "line");
  const all = (kind: string) => some && elements.every((e) => e.kind === kind);
  const defaults: Readonly<Record<string, string | undefined>> = {
    ...(lines
      ? {
          "style.arrowhead": "none",
          "style.arrowtail": "none",
          "style.routing": "polyline",
          "style.corners": theme.corners,
        }
      : {}),
    // Pens: the theme's ink, 3 pixels wide and no heads, unless a rule or a class says otherwise.
    ...(all("pen")
      ? {
          "style.stroke": shared(elements.map((e) => inherited.element(e).stroke ?? "ink")),
          "style.width": shared(
            elements.map((e) => String(inherited.element(e).width ?? DEFAULT_PEN_WIDTH)),
          ),
          "style.arrowhead": shared(elements.map((e) => inherited.element(e).arrowhead ?? "none")),
          "style.arrowtail": shared(elements.map((e) => inherited.element(e).arrowtail ?? "none")),
        }
      : {}),
    // Stickies: the theme's sticky card and its text colour, unless a rule or a class gives others.
    ...(all("sticky")
      ? {
          "style.fill": shared(elements.map((e) => inherited.element(e).fill ?? "sticky")),
          "style.color": shared(elements.map((e) => inherited.element(e).color ?? "stickyText")),
        }
      : {}),
    // Opaque unless a rule or a class fades them.
    "style.opacity": shared(elements.map((e) => String(inherited.element(e).opacity ?? 1))),
    "style.shape": shared(elements.map((e) => view.layout?.shapes?.get(e.id) ?? "rounded")),
    // What applies without the targets' own statements (classes, rules), else a box's text
    // centred in the middle of its shape and a free text's starting on the left: the alignment
    // picker writes a cell's value only where it differs from this.
    "style.textAlign": shared(
      elements.map(
        (e) => inherited.element(e).textAlign ?? (e.kind === "text" ? "left" : "center"),
      ),
    ),
    "style.verticalAlign": shared(
      elements.map((e) => inherited.element(e).verticalAlign ?? "middle"),
    ),
    "style.radius": shared(elements.map((e) => String(radius(e)))),
    // A rule's or a class's angle, else upright.
    "style.rotation": shared(elements.map((e) => String(styles.element(e).rotation ?? 0))),
    "style.icon": icon === "" ? undefined : icon,
    "style.iconPosition": shared(elements.map(position)),
    "style.labelPosition": shared(elements.map((e) => styles.element(e).labelPosition ?? "bottom")),
    // Beside the text, the theme's size; as the centre piece, as large as the box allows. The
    // inspector puts the size the icon is drawn with in its place when it has one.
    "style.iconSize": shared(
      elements.map((e) => {
        const written = styles.element(e).iconSize;
        if (written !== undefined) return String(written);
        return centrePiece(e) ? "auto" : String(theme.iconSize);
      }),
    ),
  };
  return fields
    .filter((f) => f.name !== "style.radius" || drawsRadius)
    .filter((f) => f.name !== "style.labelPosition" || (some && elements.every(centrePiece)))
    .filter((f) => f.name !== "style.iconPosition" || !(some && elements.every(iconShaped)))
    .map((f) =>
      defaults[f.name] !== undefined && f.fromTheme ? { ...f, placeholder: defaults[f.name] } : f,
    );
}

/**
 * The icon fields with what they show: the thumbnail and the name of the icon written, or else of
 * the one that applies; and Icon size with the size the icon is drawn with greyed, when the
 * targets share it, and **auto** one click away.
 */
function withIcons(
  model: InspectorModel,
  view: DiagramView,
  icons: IconRegistry | undefined,
): InspectorModel {
  const sizes = model.target.ids
    .filter((id) => view.diagram.elementsById.has(id))
    .map((id) => drawnIconSize(view, icons, id));
  const drawn =
    sizes.length > 0 && sizes.every((s) => s !== undefined && s === sizes[0])
      ? sizes[0]
      : undefined;
  const quick = messages().quick;
  return {
    ...model,
    fields: model.fields.map((field): InspectorField => {
      if (field.type === "icon") {
        const reference = field.value !== null ? String(field.value) : field.placeholder;
        return reference ? { ...field, thumbnail: iconChoice(icons, reference) } : field;
      }
      if (field.name !== "style.iconSize") return field;
      return {
        ...field,
        quick: [{ label: quick.auto, value: "auto" }],
        ...(drawn !== undefined && !field.mixed ? { placeholder: String(drawn) } : {}),
      };
    }),
  };
}

/**
 * The relation's style fields with what applies without a written value: the theme's head at the
 * end (calls and replies in sequence diagrams; none for a line), the end's head at the start of a
 * two-way arrow, the diagram's route kind and the theme's corners.
 */
function withRelationDefaults(
  fields: readonly InspectorField[],
  diagram: FlowDiagram,
  relation: Relation,
  theme: Theme,
): InspectorField[] {
  const written = writtenStyle(diagram, relation.id ?? relation.key, "relation");
  // A line (`--`, `---`) has no head at either end unless one is written.
  const endDefault =
    relation.heads === "none"
      ? "none"
      : diagram.type === "sequence"
        ? relation.line === "dashed" || relation.async
          ? "open"
          : "triangle"
        : theme.arrowhead;
  const end = typeof written.arrowhead === "string" ? written.arrowhead : endDefault;
  const defaults: Readonly<Record<string, string>> = {
    "style.arrowhead": endDefault,
    "style.arrowtail": relation.heads === "both" ? end : "none",
    "style.routing": diagram.properties.routing,
    "style.corners": theme.corners,
  };
  return fields.map((f) =>
    defaults[f.name] !== undefined && f.fromTheme ? { ...f, placeholder: defaults[f.name] } : f,
  );
}

/**
 * Kinds an element of a profile can become; icons, images, groups, lines, pens and stickies keep
 * theirs.
 */
function kindOptions(diagram: FlowDiagram, element: Element): readonly string[] {
  if (
    element.kind === "group" ||
    element.kind === "icon" ||
    element.kind === "image" ||
    element.kind === "line" ||
    element.kind === "pen" ||
    element.kind === "sticky"
  ) {
    return [element.kind];
  }
  if (element.kind === "note" && diagram.type !== "flow") return [element.kind];
  return diagram.type === "free" ? ["box", "text"] : ["node", "decision", "data", "note", "tag"];
}

/**
 * The element a note is attached to, as a picker of the diagram's other elements (the drawn
 * entity paths in a C4 view), empty for none.
 */
function attachmentField(diagram: FlowDiagram, note: Element): InspectorField {
  const targets = diagram.elements.filter(
    (e) =>
      e.id !== note.id &&
      e.kind !== "line" &&
      // A view attaches to the entities it draws.
      (diagram.type !== "c4" || e.entity !== null),
  );
  return {
    name: "attachedTo",
    label: messages().fields.attachedTo,
    type: "enum",
    value: note.attachedTo,
    placeholder: messages().placeholders.none,
    options: targets.map((e) => e.id),
  };
}

/**
 * The `layer` and `link` fields of free objects and of every element, and the group an element of
 * a flow or free diagram is declared in (not for a line or a pen, whose points are written in its
 * group's interior).
 */
function identityFields(diagram: FlowDiagram, element: Element | undefined): InspectorField[] {
  const words = messages().fields;
  const fields: InspectorField[] = [];
  if (diagram.type === "free" || diagram.type === "flow") {
    const layer = element ? element.layer : null;
    fields.push({
      name: "layer",
      label: words.layer,
      type: "enum",
      value: layer,
      placeholder: "main",
      options: diagram.properties.layers,
    });
    if (element && element.kind !== "line" && element.kind !== "pen") {
      // A group cannot go into itself or into a group it holds.
      const groups = diagram.elements.filter(
        (e) => e.kind === "group" && e.id !== element.id && !e.groupPath.includes(element.id),
      );
      // A flow node or a free box can become the container of what is drawn on it.
      const convertible = element.kind === (diagram.type === "free" ? "box" : "node");
      fields.push({
        name: "inside",
        label: words.inside,
        type: "enum",
        value: element.groupPath[element.groupPath.length - 1] ?? null,
        placeholder: messages().placeholders.none,
        options: groups.map((g) => g.id),
        ...(convertible
          ? {
              button: {
                label: words.convertToContainer,
                action: { kind: "convertToContainer", id: element.id } as const,
              },
            }
          : {}),
      });
    }
  }
  if (element) {
    fields.push(
      {
        name: "link",
        label: words.linkedTo,
        type: "text",
        value: element.link?.text ?? null,
        placeholder: "diagram.element",
      },
      {
        name: "url",
        label: words.url,
        type: "text",
        value: element.url,
        placeholder: "https://…",
      },
    );
  }
  return fields;
}

/**
 * The place and the size of an element, written as `place` and `size` statements. A child of a
 * list shows where its list puts it, read-only: the list places it and takes no `place`.
 */
function geometryFields(view: DiagramView, element: Element): InspectorField[] {
  const diagram = view.diagram;
  const placed = placingList(diagram, element) !== undefined;
  const place = diagram.placement.find(
    (p): p is PlaceEntry => p.statement === "place" && p.target === element.id,
  );
  const size = diagram.placement.find(
    (p): p is SizeEntry => p.statement === "size" && p.target === element.id,
  );
  const box = view.layout?.boxes?.get(element.id);
  // Free diagrams write children relative to their group's interior; so does the inspector.
  const origin = diagram.type === "free" ? view.layout?.origins?.get(element.id) : undefined;
  const center = box
    ? {
        x: round(box.x + box.width / 2 - (origin?.x ?? 0)),
        y: round(box.y + box.height / 2 - (origin?.y ?? 0)),
      }
    : null;
  const words = messages().fields;
  return [
    {
      name: "x",
      label: words.x,
      type: "number",
      value: place && !placed ? place.x : null,
      ...(center ? { placeholder: String(center.x) } : {}),
      ...(placed ? { readonly: true } : {}),
    },
    {
      name: "y",
      label: words.y,
      type: "number",
      value: place && !placed ? place.y : null,
      ...(center ? { placeholder: String(center.y) } : {}),
      ...(placed ? { readonly: true } : {}),
    },
    {
      name: "w",
      label: words.width,
      type: "number",
      value: size ? size.width : null,
      ...(box ? { placeholder: String(round(box.width)) } : {}),
    },
    {
      name: "h",
      label: words.height,
      type: "number",
      value: size ? size.height : null,
      ...(box ? { placeholder: String(round(box.height)) } : {}),
    },
  ];
}

/** The fields of a note of a C4 view: its own, and none of an entity's. */
function viewNoteFields(view: DiagramView, element: Element): InspectorField[] {
  const words = messages().fields;
  return [
    { name: "id", label: words.id, type: "id", value: element.id },
    {
      name: "kind",
      label: words.kind,
      type: "enum",
      value: element.kind,
      options: [element.kind],
      readonly: true,
    },
    { name: "label", label: words.label, type: "text", value: element.label },
    attachmentField(view.diagram, element),
    {
      name: "classes",
      label: words.classes,
      type: "classes",
      value: element.classes.map((c) => c.name).join(", ") || null,
    },
    {
      name: "url",
      label: words.url,
      type: "text",
      value: element.url,
      placeholder: "https://…",
    },
    ...geometryFields(view, element),
  ];
}

/**
 * The list fields of a group of a free diagram: Layout (none, a column or a row) and, once it is
 * a list, Spacing and Align with what applies when they are not written (half the theme's group
 * padding, `start`), all written in the group's block.
 */
function listFields(view: DiagramView, group: Element): InspectorField[] {
  const words = messages().fields;
  const list = group.list;
  const fields: InspectorField[] = [
    {
      name: "layout",
      label: words.layout,
      type: "enum",
      value: list?.layout ?? null,
      placeholder: messages().placeholders.none,
      options: LIST_LAYOUTS,
    },
  ];
  if (!list) return fields;
  const drawn = view.layout?.lists?.get(group.id);
  fields.push(
    {
      name: "spacing",
      label: words.spacing,
      type: "number",
      value: list.spacing,
      ...(drawn ? { placeholder: String(round(drawn.spacing)) } : {}),
      range: { ...LIST_SPACING_RANGE, step: 1 },
    },
    {
      name: "align",
      label: words.align,
      type: "enum",
      value: list.align,
      placeholder: drawn?.align ?? "start",
      options: LIST_ALIGNS,
    },
  );
  return fields;
}

function elementFields(view: DiagramView, element: Element): InspectorField[] {
  const diagram = view.diagram;
  const ports = element.ports
    .map(
      (p) =>
        `${p.name} ${p.side}${Math.round(p.position * 100) === 50 ? "" : ` ${Math.round(p.position * 100)}%`}`,
    )
    .join(", ");
  const words = messages().fields;
  const description: InspectorField = {
    name: "description",
    label: words.description,
    type: "multiline",
    value: element.description,
  };
  const classes: InspectorField = {
    name: "classes",
    label: words.classes,
    type: "classes",
    value: element.classes.map((c) => c.name).join(", ") || null,
  };
  // A pen is its stroke: no kind to change, no text, no group to pick, no ports, place or size.
  if (element.kind === "pen") {
    return [
      { name: "id", label: words.id, type: "id", value: element.id },
      description,
      classes,
      ...identityFields(diagram, element),
      ...styleFields(diagram, [{ id: element.id, kind: "element" }]),
    ];
  }
  const fields: InspectorField[] = [
    { name: "id", label: words.id, type: "id", value: element.id },
    {
      name: "kind",
      label: words.kind,
      type: "enum",
      value: element.kind,
      options: kindOptions(diagram, element),
      ...(kindOptions(diagram, element).length === 1 ? { readonly: true } : {}),
    },
    element.kind === "icon"
      ? { name: "source", label: words.icon, type: "icon", value: element.source }
      : element.kind === "image"
        ? { name: "source", label: words.imageFile, type: "text", value: element.source }
        : {
            name: "label",
            label: words.label,
            // A sticky's text wraps on its card and breaks where it is written to.
            type: element.kind === "sticky" ? "multiline" : "text",
            value: element.label,
          },
    ...(element.kind === "note" ? [attachmentField(diagram, element)] : []),
    description,
    classes,
  ];
  fields.push(...identityFields(diagram, element));
  // A free line is its points: no ports, no place, no size.
  if (element.kind === "line") {
    return [...fields, ...styleFields(diagram, [{ id: element.id, kind: "element" }])];
  }
  if (element.kind === "group" && diagram.type === "free")
    fields.push(...listFields(view, element));
  if (element.kind !== "group")
    fields.push({
      name: "ports",
      label: words.ports,
      type: "ports",
      value: ports || null,
      placeholder: "in west 30%, out east",
    });
  fields.push(...geometryFields(view, element));
  return [...fields, ...styleFields(diagram, [{ id: element.id, kind: "element" }])];
}

function relationFields(view: DiagramView, relation: Relation): InspectorField[] {
  const diagram = view.diagram;
  const route = relation.id
    ? diagram.placement.find(
        (p): p is RouteEntry => p.statement === "route" && p.target === relation.id,
      )
    : undefined;
  const label = relation.id
    ? diagram.placement.find(
        (p): p is LabelEntry => p.statement === "label" && p.target === relation.id,
      )
    : undefined;
  const elements = diagram.elements.map((e) => e.id);
  const portsOf = (id: string) => [
    ...PORTS,
    ...(diagram.elementsById.get(id)?.ports.map((p) => p.name) ?? []),
  ];
  const words = messages().fields;
  return [
    { name: "id", label: words.id, type: "id", value: relation.id, placeholder: relation.key },
    { name: "label", label: words.label, type: "text", value: relation.label },
    {
      name: "description",
      label: words.description,
      type: "multiline",
      value: relation.description,
    },
    { name: "from", label: words.from, type: "enum", value: relation.from, options: elements },
    {
      name: "fromPort",
      label: words.fromPort,
      type: "enum",
      value: route?.from.port ?? null,
      placeholder: "auto",
      options: portsOf(relation.from),
    },
    { name: "to", label: words.to, type: "enum", value: relation.to, options: elements },
    {
      name: "toPort",
      label: words.toPort,
      type: "enum",
      value: route?.to.port ?? null,
      placeholder: "auto",
      options: portsOf(relation.to),
    },
    // The arrow gives solid or dashed; a `line` style can make it dotted.
    {
      name: "line",
      label: words.line,
      type: "enum",
      value:
        shown(writtenStyle(diagram, relation.id ?? relation.key, "relation").line) ?? relation.line,
      options: LINE_STYLES,
      glyphs: "line",
    },
    {
      name: "classes",
      label: words.classes,
      type: "classes",
      value: relation.classes.map((c) => c.name).join(", ") || null,
    },
    ...(diagram.type === "free" || diagram.type === "flow"
      ? [
          {
            name: "layer",
            label: words.layer,
            type: "enum" as const,
            value: relation.layer,
            placeholder: "main",
            options: diagram.properties.layers,
          },
        ]
      : []),
    {
      name: "labelAt",
      label: words.labelAt,
      type: "number",
      value: label ? label.at : null,
      placeholder: "50",
    },
    ...styleFields(diagram, [{ id: relation.id ?? relation.key, kind: "relation" }]).filter(
      (f) => f.name !== "style.line",
    ),
  ];
}

/** A theme's name as the inspector shows it: a project theme by its id, not its key. */
function shownTheme(name: string): string {
  return name.slice(name.lastIndexOf("#") + 1);
}

function diagramFields(analysis: DocumentAnalysis, view: DiagramView): InspectorField[] {
  const p = view.diagram.properties;
  const defaultTheme = shownTheme(analysis.layoutOptions.defaultTheme ?? DEFAULT_THEME);
  const themes = [
    ...new Set([
      ...BUILT_IN_THEMES,
      ...analysis.themes.map((t) => t.id).filter((id) => !id.includes("#")),
    ]),
  ];
  if (view.diagram.type === "sequence") {
    return [...sequenceDiagramFields(view.diagram, themes, defaultTheme), ...canvasFields(view)];
  }
  const written = (name: string) =>
    view.diagram.block?.statements.some(
      (s) => s.kind === "KeywordStatement" && s.keyword.text === name,
    ) ?? false;
  const free = view.diagram.type === "free";
  const words = messages();
  const layers: InspectorField[] =
    free || view.diagram.type === "flow"
      ? [
          {
            name: "layers",
            label: words.fields.layers,
            type: "text",
            value: written("layers") ? p.layers.join(", ") : null,
            placeholder: "main",
          },
        ]
      : [];
  return [
    // C4 views: level, scope and model first.
    ...(view.diagram.type === "c4" ? c4DiagramFields(view.diagram) : []),
    { name: "title", label: words.fields.title, type: "text", value: p.title },
    {
      name: "description",
      label: words.fields.description,
      type: "multiline",
      value: p.description,
    },
    {
      name: "direction",
      label: words.fields.direction,
      type: "enum",
      value: written("direction") ? p.direction : null,
      placeholder: "LR",
      options: DIRECTIONS,
    },
    {
      name: "layout",
      label: words.fields.layout,
      type: "enum",
      value: written("layout") ? p.layout : null,
      placeholder: free ? "manual" : "auto",
      options: LAYOUT_MODES,
    },
    ...layers,
    {
      name: "routing",
      label: words.fields.routing,
      type: "enum",
      value: written("routing") ? p.routing : null,
      placeholder: "auto",
      options: ROUTINGS,
    },
    {
      name: "theme",
      label: words.fields.theme,
      type: "enum",
      value: p.theme,
      placeholder: defaultTheme,
      options: themes,
    },
    ...canvasFields(view),
  ];
}

/** The bounds of a `canvas (w, h)` side, from the language's table. */
const CANVAS_SIDE = (() => {
  const spec = PROFILES.flow.diagramProperties["canvas"]!;
  return spec.kind === "size" ? { min: spec.min, max: spec.max } : { min: 100, max: 10000 };
})();

/**
 * The choices of the Canvas field after fitting the content, which nothing written means: the
 * presets (`document`, `slide` and `board`, a whiteboard that grows) and a custom size.
 */
const CANVAS_CHOICES = [...PRESETS, "custom"] as const;

/**
 * The diagram's Canvas field: fit to the content (nothing written), a `preset` or a `custom`
 * size, and for a custom size its width and height with the language's bounds.
 */
function canvasFields(view: DiagramView): InspectorField[] {
  const p = view.diagram.properties;
  const words = messages().fields;
  const fields: InspectorField[] = [
    {
      name: "canvas",
      label: words.canvas,
      type: "enum",
      value: p.preset ?? (p.canvas ? "custom" : null),
      placeholder: "fit",
      options: CANVAS_CHOICES,
    },
  ];
  if (p.canvas) {
    const range = { ...CANVAS_SIDE, step: 1 };
    fields.push(
      { name: "canvas.width", label: words.width, type: "number", value: p.canvas.width, range },
      { name: "canvas.height", label: words.height, type: "number", value: p.canvas.height, range },
    );
  }
  return fields;
}

/**
 * The size a custom canvas starts from: the drawing's, which is the content's with its margins
 * when the canvas fits it, within the language's bounds.
 */
function drawnSize(view: DiagramView): { width: number; height: number } {
  const scene = view.layout?.scene;
  const side = (n: number) => Math.min(CANVAS_SIDE.max, Math.max(CANVAS_SIDE.min, Math.round(n)));
  return scene
    ? { width: side(scene.width), height: side(scene.height) }
    : { width: 800, height: 600 };
}

/**
 * The operations of the Canvas field, in one plan: a preset removes `canvas`, a custom size
 * removes `preset`, and fitting the content removes both. The statement that goes is removed
 * first, since the language refuses the two together.
 */
function canvasOperations(
  view: DiagramView,
  field: string,
  value: string | number | null,
): FieldResult {
  const p = view.diagram.properties;
  const reasons = messages().reasons;
  const set = (property: "preset" | "canvas", written: string | null): EditOperation => ({
    kind: "setDiagramProperty",
    diagram: view.id,
    property,
    value: written,
  });
  const custom = (size: { width: number; height: number }): FieldResult => ({
    ok: true,
    operations: [set("preset", null), set("canvas", `(${size.width}, ${size.height})`)],
  });
  if (field === "canvas") {
    const choice = value === null || value === "" ? "fit" : String(value);
    if (choice === "fit") {
      return { ok: true, operations: [set("preset", null), set("canvas", null)] };
    }
    if (choice === "custom") {
      return p.canvas ? { ok: true, operations: [] } : custom(drawnSize(view));
    }
    if (!(PRESETS as readonly string[]).includes(choice)) {
      return { ok: false, reason: reasons.canvasChoice(["fit", ...CANVAS_CHOICES]) };
    }
    return { ok: true, operations: [set("canvas", null), set("preset", choice)] };
  }
  const number = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (value === null || value === "" || !Number.isFinite(number)) {
    return { ok: false, reason: reasons.number };
  }
  if (number < CANVAS_SIDE.min || number > CANVAS_SIDE.max) {
    return { ok: false, reason: reasons.between(CANVAS_SIDE.min, CANVAS_SIDE.max) };
  }
  const size = p.canvas ?? drawnSize(view);
  return custom({
    width: field === "canvas.width" ? Math.round(number) : size.width,
    height: field === "canvas.height" ? Math.round(number) : size.height,
  });
}

/** The inspector for the diagram, one element, one relation, or the shared style of several. */
export function inspect(
  analysis: DocumentAnalysis,
  diagramId: string,
  selection: readonly string[],
  context: InspectContext = {},
): InspectorModel | undefined {
  const view = diagramView(analysis, diagramId);
  if (!view) return undefined;
  const model = inspectFields(analysis, view, selection);
  if (!model) return undefined;
  const themes = {
    editable: themeLocation(analysis, view, context.path) !== undefined,
    project: context.project ?? false,
  };
  const theme = effectiveTheme(analysis, view);
  // Icon position joins the strip for elements drawn with an icon.
  const styles = new StyleResolver(theme, view.diagram);
  const elements = model.target.ids.flatMap((id) => view.diagram.elementsById.get(id) ?? []);
  const some = elements.length > 0;
  const families = embeddableFamilies(analysis);
  const texts = withTextDefaults(withIcons(model, view, analysis.icons), view, theme, families);
  return withStrip(texts, theme, themes, {
    iconed: some && elements.every((e) => styles.element(e).icon !== undefined),
    stickies: some && elements.every((e) => e.kind === "sticky"),
  });
}

/** What the inspector knows of the document's place: its path and whether it is in a project. */
export interface InspectContext {
  readonly path?: string;
  readonly project?: boolean;
}

/** The colour tokens of a theme with the colours they resolve to, for swatches. */
export function themeSwatches(theme: Theme): ColorSwatch[] {
  return THEME_COLOR_TOKENS.map((token) => ({ token, color: theme[token] }));
}

/**
 * The six fixed colours of stickies as swatches, which the fill row of a sticky shows before the
 * theme's tokens: the colour itself is what a chip writes (`fill "#fff59d"`), as the sticky
 * button's menu writes it.
 */
const STICKY_SWATCHES: readonly ColorSwatch[] = STICKY_COLOURS.map(({ hex }) => ({
  token: hex,
  color: hex,
}));

/** The built-in theme of the same family in the other scheme: `technical.dark` for `technical.light`. */
export function counterpartTheme(name: string): string | undefined {
  const match = /^(technical|editorial|stage|sketch)\.(light|dark)$/.exec(name);
  if (!match) return undefined;
  return `${match[1]}.${match[2] === "light" ? "dark" : "light"}`;
}

/** The effects in the order of the strip's toggles. */
const EFFECT_ORDER: readonly AnimationEffect[] = ["flow", "dash", "pulse", "trace"];

/** The fields of an effect that is on, in the order of its card. */
const EFFECT_PROPERTIES = [
  "duration",
  "repeat",
  "delay",
  "direction",
  "particles",
  "color",
] as const;

/**
 * The strip's fields, in the order it shows them; the first `line` is the relation's arrow. The
 * style fields come first, then each effect's toggle with the fields of its card.
 */
const STRIP = [
  "theme",
  "style.fill",
  "style.stroke",
  "style.color",
  "line",
  "style.line",
  "style.width",
  // Free elements, groups, lines and pens: a slider from 0 to 1.
  "style.opacity",
  "style.arrowtail",
  "style.arrowhead",
  "style.routing",
  "style.corners",
  "style.radius",
  "style.rotation",
  "style.shape",
  // Free boxes, stickies and texts: one grid of cells for the two.
  "style.textAlign",
  "style.verticalAlign",
  // For elements with an icon only.
  "style.iconPosition",
  // Everything that draws text: the Text group, its font, size and weight (decision 0067).
  "style.font",
  "style.fontSize",
  "style.fontWeight",
  ...EFFECT_ORDER.flatMap((effect) => [
    `effect.${effect}`,
    ...EFFECT_PROPERTIES.map((property) => `effect.${effect}.${property}`),
  ]),
];

/**
 * Marks the fields of the style strip and puts them first: colours with the theme's swatches, the
 * line, width, opacity and arrowhead, the shape and, for elements with an icon (`iconed`), the
 * icon's position, the effects as toggles with every field of an effect that is on grouped under
 * its toggle (`group`; the speed with the theme's default as placeholder, the colour with the
 * swatches), and, for the diagram, the theme with its light or dark counterpart. Stickies
 * (`stickies`) also have their text's size and weight there, and their fill row starts with the
 * six fixed colours of stickies.
 */
function withStrip(
  model: InspectorModel,
  theme: Theme,
  themes: { readonly editable: boolean; readonly project: boolean },
  targets: { readonly iconed: boolean; readonly stickies: boolean },
): InspectorModel {
  const swatches = themeSwatches(theme);
  const durations = themeDurations(theme);
  const quick = messages().quick;
  // A relation's arrow already says solid or dashed; its style `line` stays below.
  const arrow = model.fields.some((f) => f.name === "line");
  const inStrip = (name: string) =>
    STRIP.includes(name) &&
    !(arrow && name === "style.line") &&
    !(name === "style.iconPosition" && !targets.iconed);
  const fields = model.fields.map((field): InspectorField => {
    if (!inStrip(field.name)) return field;
    // A field of an effect that is on belongs to the card of its toggle.
    const grouped = /^(effect\.(flow|dash|pulse|trace))\.(\w+)$/.exec(field.name);
    if (grouped) {
      const effect = grouped[2] as AnimationEffect;
      const placed = { ...field, section: "strip" as const, group: grouped[1]! };
      if (grouped[3] === "duration") {
        return { ...placed, placeholder: String(durations[effect] ?? DEFAULT_DURATIONS[effect]) };
      }
      return field.type === "color" ? { ...placed, swatches } : placed;
    }
    if (field.name === "style.fill" && targets.stickies) {
      return { ...field, section: "strip", swatches: [...STICKY_SWATCHES, ...swatches] };
    }
    if (field.type === "color") return { ...field, section: "strip", swatches };
    if (field.name === "theme") {
      const counterpart = counterpartTheme(String(field.value ?? field.placeholder ?? ""));
      return {
        ...field,
        section: "strip",
        themes,
        ...(counterpart
          ? {
              quick: [
                {
                  label: counterpart.endsWith(".dark") ? quick.dark : quick.light,
                  value: counterpart,
                },
              ],
            }
          : {}),
      };
    }
    return { ...field, section: "strip" };
  });
  const rank = (f: InspectorField) =>
    f.section === "strip" ? STRIP.indexOf(f.name) : STRIP.length;
  return {
    ...model,
    fields: fields
      .map((field, index) => ({ field, index }))
      .sort((a, b) => rank(a.field) - rank(b.field) || a.index - b.index)
      .map((x) => x.field),
  };
}

/** The effect toggles shared by several targets: on when all have the effect, mixed otherwise. */
function sharedEffectFields(
  diagram: FlowDiagram,
  targets: readonly StyleTarget[],
): InspectorField[] {
  if (targets.length === 0) return [];
  const applies = targets
    .map((t) => effectsFor(diagram, t.id, t.kind))
    .reduce((a, b) => a.filter((e) => b.includes(e)));
  return applies.map((effect) => {
    const on = targets.filter((t) =>
      diagram.animations.some(
        (a) => a.target === t.id && a.targetKind === t.kind && a.effect === effect,
      ),
    ).length;
    return {
      name: `effect.${effect}`,
      label: effectLabel(effect),
      type: "enum",
      value: on === targets.length ? "on" : null,
      placeholder: "off",
      ...(on > 0 && on < targets.length ? { mixed: true } : {}),
      options: ["off", "on"],
    };
  });
}

function inspectFields(
  analysis: DocumentAnalysis,
  view: DiagramView,
  selection: readonly string[],
): InspectorModel | undefined {
  const diagram = view.diagram;
  const targets = selection
    .map((id): StyleTarget | undefined => {
      if (diagram.elementsById.has(id)) return { id, kind: "element" };
      if (diagram.relationsByKey.has(id)) return { id, kind: "relation" };
      if (diagram.eventsByKey.has(id)) return { id, kind: "event" };
      return undefined;
    })
    .filter((t): t is StyleTarget => t !== undefined);
  const titles = messages().titles;
  if (targets.length === 0) {
    return {
      title: titles.diagram(diagram.id),
      target: { kind: "diagram", ids: [] },
      fields: diagramFields(analysis, view),
    };
  }
  const sequence = diagram.type === "sequence";
  if (targets.length === 1 && diagram.type === "c4") {
    const [{ id, kind }] = targets as [StyleTarget];
    if (kind === "element") {
      const element = diagram.elementsById.get(id)!;
      return {
        title: titles.target(kindName(element.kind === "group" ? "boundary" : element.kind), id),
        target: { kind: "element", ids: [id] },
        fields: [
          ...(element.kind === "note" && element.entity === null
            ? viewNoteFields(view, element)
            : c4ElementFields(diagram, element)),
          ...withElementDefaults(
            styleFields(diagram, [{ id, kind: "element" }]),
            view,
            effectiveTheme(analysis, view),
            [id],
          ),
          ...effectFields(diagram, id, "element"),
        ],
      };
    }
    const relation = diagram.relationsByKey.get(id)!;
    return {
      title: titles.relation(relation.id ?? `${relation.from} → ${relation.to}`),
      target: { kind: "relation", ids: [id] },
      // Anonymous relations take styles and effects too: setting one names them in the model.
      fields: [
        ...c4RelationFields(diagram, relation),
        ...withRelationDefaults(
          styleFields(diagram, [{ id: relation.id ?? relation.key, kind: "relation" }]),
          diagram,
          relation,
          effectiveTheme(analysis, view),
        ),
        ...effectFields(diagram, relation.id ?? relation.key, "relation"),
      ],
    };
  }
  if (targets.length === 1) {
    const [{ id, kind }] = targets as [StyleTarget];
    if (kind === "element") {
      const element = diagram.elementsById.get(id)!;
      return {
        title: titles.target(kindName(element.kind), id),
        target: { kind: "element", ids: [id] },
        fields: [
          ...(sequence
            ? [
                ...participantFields(diagram, element),
                ...styleFields(diagram, [{ id, kind: "element" }]),
              ]
            : withElementDefaults(
                elementFields(view, element),
                view,
                effectiveTheme(analysis, view),
                [id],
              )),
          ...(element.implicit ? [] : effectFields(diagram, id, "element")),
        ],
      };
    }
    if (kind === "event") {
      const event = diagram.eventsByKey.get(id)!;
      // Notes and fragments take styles and effects; setting one names an anonymous one.
      const styled = event.kind === "note" || event.kind === "fragment";
      return {
        // Fragment operators are notation and stay as written.
        title: titles.target(
          event.kind === "fragment" ? event.operator : kindName(event.kind),
          event.id ?? "",
        ),
        target: { kind: "event", ids: [id] },
        fields: [
          ...eventFields(diagram, event),
          ...(styled ? styleFields(diagram, [{ id: event.id ?? id, kind: "event" }]) : []),
          ...(styled ? effectFields(diagram, event.id ?? id, "event") : []),
        ],
      };
    }
    const relation = diagram.relationsByKey.get(id)!;
    const name = relation.id ?? `${relation.from} → ${relation.to}`;
    return {
      title: sequence ? titles.message(name) : titles.relation(name),
      target: { kind: "relation", ids: [id] },
      fields: [
        ...withRelationDefaults(
          sequence
            ? [
                ...messageFields(diagram, relation),
                ...styleFields(diagram, [{ id: relation.id ?? relation.key, kind: "relation" }]),
              ]
            : relationFields(view, relation),
          diagram,
          relation,
          effectiveTheme(analysis, view),
        ),
        // Anonymous relations and messages take effects too: setting one names them.
        ...effectFields(diagram, relation.id ?? relation.key, "relation"),
      ],
    };
  }
  // Several: the style of those that take one.
  const styled = targets.flatMap((t): StyleTarget[] => {
    if (t.kind !== "event")
      return [{ id: diagram.relationsByKey.get(t.id)?.id ?? t.id, kind: t.kind }];
    const event = diagram.eventsByKey.get(t.id)!;
    if (event.kind === "message")
      return [{ id: diagram.relationsByKey.get(t.id)?.id ?? t.id, kind: "relation" }];
    return event.kind === "note" || event.kind === "fragment"
      ? [{ id: event.id ?? t.id, kind: "event" }]
      : [];
  });
  return {
    title: titles.selected(targets.length),
    target: { kind: "several", ids: targets.map((t) => t.id) },
    fields:
      styled.length > 0
        ? [
            ...withElementDefaults(
              styleFields(diagram, styled),
              view,
              effectiveTheme(analysis, view),
              styled.filter((t) => t.kind === "element").map((t) => t.id),
            ),
            ...sharedEffectFields(diagram, styled),
          ]
        : [],
  };
}

/** Parses `in west 30%, out east` into ports. */
function parsePorts(
  text: string,
): { name: string; side: "north" | "south" | "east" | "west"; position: number }[] | undefined {
  const ports = [];
  for (const part of text
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p !== "")) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\s+(north|south|east|west)(?:\s+(\d+(?:\.\d+)?)%)?$/.exec(
      part,
    );
    if (!m) return undefined;
    ports.push({ name: m[1]!, side: m[2] as "north", position: m[3] ? Number(m[3]) / 100 : 0.5 });
  }
  return ports;
}

export type FieldResult =
  | {
      readonly ok: true;
      readonly operations: readonly EditOperation[];
      /** The selection after the edit, when an id changes. */
      readonly select?: readonly string[];
      /** What the edit did besides the field, for the status line, such as naming a relation. */
      readonly notice?: string;
    }
  | { readonly ok: false; readonly reason: string };

/** The edit operations that write one inspector field for the given targets. */
export function fieldOperations(
  analysis: DocumentAnalysis,
  diagramId: string,
  ids: readonly string[],
  field: string,
  value: string | number | null,
): FieldResult {
  const reasons = messages().reasons;
  const view = diagramView(analysis, diagramId);
  if (!view) return { ok: false, reason: reasons.noDiagram(diagramId) };
  const diagram = view.diagram;
  const d = diagramId;
  const text = value === null ? null : String(value);
  const number = value === null || value === "" ? null : Number(value);
  const ops: EditOperation[] = [];

  if (ids.length === 0) {
    if (field === "canvas" || field === "canvas.width" || field === "canvas.height") {
      return canvasOperations(view, field, value);
    }
    ops.push({
      kind: "setDiagramProperty",
      diagram: d,
      property: field,
      value: text === "" ? null : text,
    });
    return { ok: true, operations: ops };
  }
  if (field.startsWith("effect.")) return effectOperations(diagram, ids, field, value);
  if (field.startsWith("style.")) {
    const property = field.slice("style.".length);
    let written: string | number | null = text === "" ? null : text;
    // Numbers within the property's bounds, such as a corner radius from 0 to 64; a pen's stroke
    // is one pixel wide at least.
    const spec = STYLE_PROPERTIES[property];
    if (text !== null && text !== "" && spec?.kind === "number") {
      const pen = ids.some((id) => diagram.elementsById.get(id)?.kind === "pen");
      const { min, max } = property === "width" && pen ? PEN_WIDTH_RANGE : spec;
      const parsed = typeof value === "number" ? value : Number(text.trim().replace(/px$/, ""));
      if (!Number.isFinite(parsed)) return { ok: false, reason: reasons.number };
      if (parsed < min || parsed > max) {
        return { ok: false, reason: reasons.between(min, max) };
      }
      written = parsed;
    }
    // A full turn, or none, is upright: the rotation goes.
    if (property === "rotation" && typeof written === "number" && written % 360 === 0) {
      written = null;
    }
    // A word of the property, such as `auto` for the icon size, or a number within its bounds.
    if (text !== null && text !== "" && spec?.kind === "keywordOrNumber") {
      const word = text.trim();
      const parsed = typeof value === "number" ? value : Number(word.replace(/px$/, ""));
      if (spec.keywords.includes(word)) written = word;
      else if (Number.isFinite(parsed) && parsed >= spec.min && parsed <= spec.max) {
        written = parsed;
      } else {
        return { ok: false, reason: reasons.wordOrBetween(spec.keywords, spec.min, spec.max) };
      }
    }
    const resolved = styleTargets(diagram, ids);
    if (!resolved.ok) return resolved;
    ops.push(...resolved.operations);
    for (const { target, targetKind } of resolved.targets) {
      ops.push({
        kind: "setStyleProperty",
        diagram: d,
        target,
        targetKind,
        property,
        value: written,
      });
    }
    const notice = namedNotice(resolved.named);
    return {
      ok: true,
      operations: ops,
      ...(notice ? { notice, select: selectionAfter(ids, resolved.targets) } : {}),
    };
  }
  const id = ids[0]!;
  if (diagram.type === "sequence") {
    const result = sequenceFieldOperations(diagram, id, field, value);
    if (result) return result;
  }
  if (diagram.type === "c4") {
    const result = c4FieldOperations(diagram, id, field, value);
    if (result) return result;
  }
  const element = diagram.elementsById.get(id);
  const relation = element ? undefined : diagram.relationsByKey.get(id);
  if (element) {
    const box = view.layout?.boxes?.get(id);
    const origin = diagram.type === "free" ? view.layout?.origins?.get(id) : undefined;
    const centre = box
      ? {
          x: Math.round(box.x + box.width / 2 - (origin?.x ?? 0)),
          y: Math.round(box.y + box.height / 2 - (origin?.y ?? 0)),
        }
      : { x: 0, y: 0 };
    switch (field) {
      case "id":
        if (text) ops.push({ kind: "renameElement", diagram: d, element: id, newId: text });
        break;
      case "inside": {
        // Declared in another group, or at the top level, where it is drawn now.
        const parent = text || null;
        if (parent === (element.groupPath[element.groupPath.length - 1] ?? null)) break;
        const origin = interiorOf(view, parent);
        // Flow diagrams place in diagram coordinates: the place stays as it is. A list places
        // what goes into it, last, and takes no place for it.
        const list = parent !== null && diagram.elementsById.get(parent)?.list;
        const drawn = diagram.type === "free" && !list ? box : undefined;
        ops.push({
          kind: "moveElement",
          diagram: d,
          element: id,
          parent,
          ...(drawn
            ? {
                at: {
                  x: Math.round(drawn.x + drawn.width / 2 - origin.x),
                  y: Math.round(drawn.y + drawn.height / 2 - origin.y),
                },
              }
            : {}),
        });
        // The groups it leaves and enters stay drawn where they are.
        ops.push(...steadyGroups(view, [id], parent));
        break;
      }
      case "attachedTo":
        ops.push({ kind: "attachNote", diagram: d, note: id, element: text || null });
        break;
      case "kind":
        if (text && text !== "group")
          ops.push({
            kind: "setElementKind",
            diagram: d,
            element: id,
            elementKind: text as "node",
          });
        break;
      case "label":
        ops.push({ kind: "setElementLabel", diagram: d, element: id, label: text ?? "" });
        break;
      case "source":
        if (!text) return { ok: false, reason: reasons.source };
        ops.push({ kind: "setElementSource", diagram: d, element: id, source: text });
        break;
      case "layer":
      case "link":
      case "url":
        ops.push({
          kind: "setElementProperty",
          diagram: d,
          target: id,
          targetKind: "element",
          property: field,
          value: text || null,
        });
        break;
      case "description":
        ops.push({
          kind: "setDescription",
          diagram: d,
          target: id,
          targetKind: "element",
          description: text || null,
        });
        break;
      case "classes":
        ops.push({
          kind: "setClasses",
          diagram: d,
          target: id,
          targetKind: "element",
          classes: (text ?? "")
            .split(",")
            .map((c) => c.trim())
            .filter((c) => c !== ""),
        });
        break;
      case "ports": {
        const ports = parsePorts(text ?? "");
        if (!ports) return { ok: false, reason: reasons.ports };
        const current = element.ports;
        for (const port of current) {
          const next = ports.find((p) => p.name === port.name);
          if (!next || next.side !== port.side || Math.abs(next.position - port.position) > 1e-9) {
            ops.push({ kind: "removePort", diagram: d, element: id, name: port.name });
          }
        }
        for (const port of ports) {
          const old = current.find((p) => p.name === port.name);
          if (!old || old.side !== port.side || Math.abs(old.position - port.position) > 1e-9) {
            ops.push({
              kind: "addPort",
              diagram: d,
              element: id,
              name: port.name,
              side: port.side,
              position: port.position,
            });
          }
        }
        break;
      }
      case "layout":
      case "spacing":
      case "align": {
        // A list's properties, in the group's block; no layout removes the three.
        let written: string | number | null = text === null || text.trim() === "" ? null : text;
        if (field === "layout" && written === "none") written = null;
        if (field === "spacing" && written !== null) {
          const { min, max } = LIST_SPACING_RANGE;
          if (number === null || !Number.isFinite(number)) {
            return { ok: false, reason: reasons.number };
          }
          if (number < min || number > max) return { ok: false, reason: reasons.between(min, max) };
          written = number;
        }
        ops.push({
          kind: "setElementProperty",
          diagram: d,
          target: id,
          targetKind: "element",
          property: field,
          value: written,
        });
        // A list that stops placing its children leaves each with a place where it is drawn, in
        // the same edit: the picture stays as it is.
        if (field === "layout" && written === null && element.list) {
          ops.push(...unlistedOperations(view, id, id));
        }
        break;
      }
      case "x":
      case "y": {
        const list = placingList(diagram, element);
        if (list !== undefined) {
          return { ok: false, reason: messages().session.listPlaces(id, list) };
        }
        if (number === null || !Number.isFinite(number))
          return { ok: false, reason: reasons.number };
        ops.push({
          kind: "setPosition",
          diagram: d,
          element: id,
          x: field === "x" ? number : centre.x,
          y: field === "y" ? number : centre.y,
        });
        break;
      }
      case "w":
      case "h": {
        if (number === null || !Number.isFinite(number) || number <= 0)
          return { ok: false, reason: reasons.positive };
        ops.push({
          kind: "setSize",
          diagram: d,
          element: id,
          width: field === "w" ? number : (box?.width ?? 160),
          height: field === "h" ? number : (box?.height ?? 56),
        });
        break;
      }
      default:
        // A field the inspector never offers: a mistake of the host, not of the person.
        return { ok: false, reason: `Unknown field \`${field}\`.` };
    }
    return { ok: true, operations: ops };
  }
  if (relation) {
    const named = relation.id;
    // What an edit that named the relation first says, and the selection that follows the id.
    const naming = (target: string, operations: readonly EditOperation[]) => {
      const notice = namedNotice(operations.length > 0 ? [target] : []);
      return notice ? { notice, select: [target] } : {};
    };
    switch (field) {
      case "id":
        if (!text) break;
        ops.push(
          named
            ? { kind: "renameRelation", diagram: d, relation: named, newId: text }
            : { kind: "materializeRelationId", diagram: d, relationKey: relation.key, id: text },
        );
        break;
      case "label": {
        const { id: target, operations } = namedRelation(diagram, relation);
        ops.push(...operations, {
          kind: "setRelationLabel",
          diagram: d,
          relation: target,
          label: text || null,
        });
        return { ok: true, operations: ops, ...naming(target, operations) };
      }
      case "description":
        ops.push({
          kind: "setDescription",
          diagram: d,
          target: relation.key,
          targetKind: "relation",
          description: text || null,
        });
        break;
      case "layer": {
        const { id: target, operations } = namedRelation(diagram, relation);
        ops.push(...operations, {
          kind: "setElementProperty",
          diagram: d,
          target,
          targetKind: "relation",
          property: "layer",
          value: text || null,
        });
        return { ok: true, operations: ops, ...naming(target, operations) };
      }
      case "classes":
        ops.push({
          kind: "setClasses",
          diagram: d,
          target: relation.key,
          targetKind: "relation",
          classes: (text ?? "")
            .split(",")
            .map((c) => c.trim())
            .filter((c) => c !== ""),
        });
        break;
      case "line": {
        // Dotted is a style; solid and dashed are the arrow, which then needs no `line` style.
        if (text === "dotted") {
          const { id: target, operations } = namedRelation(diagram, relation);
          ops.push(...operations, {
            kind: "setStyleProperty",
            diagram: d,
            target,
            targetKind: "relation",
            property: "line",
            value: "dotted",
          });
          return { ok: true, operations: ops, ...naming(target, operations) };
        }
        ops.push({
          kind: "setRelationLine",
          diagram: d,
          relation: relation.key,
          line: text === "dashed" ? "dashed" : "solid",
        });
        if (relation.id && writtenStyle(diagram, relation.id, "relation").line !== undefined) {
          ops.push({
            kind: "setStyleProperty",
            diagram: d,
            target: relation.id,
            targetKind: "relation",
            property: "line",
            value: null,
          });
        }
        break;
      }
      case "from":
      case "to":
        if (text)
          ops.push({
            kind: "reconnectRelation",
            diagram: d,
            relation: relation.key,
            end: field,
            element: text,
          });
        break;
      case "fromPort":
      case "toPort": {
        const end = field === "fromPort" ? "from" : "to";
        ops.push({
          kind: "reconnectRelation",
          diagram: d,
          relation: relation.key,
          end,
          element: end === "from" ? relation.from : relation.to,
          port: text || "auto",
        });
        break;
      }
      case "labelAt": {
        if (number === null || !Number.isFinite(number))
          return { ok: false, reason: reasons.percentage };
        // An anonymous relation is named first: its label is placed by the relation's id.
        const { id: target, operations } = namedRelation(diagram, relation);
        const entry = named
          ? diagram.placement.find(
              (p): p is LabelEntry => p.statement === "label" && p.target === named,
            )
          : undefined;
        ops.push(...operations, {
          kind: "setLabelAnchor",
          diagram: d,
          relation: target,
          at: number,
          offset: entry?.offset ?? { x: 0, y: 0 },
        });
        return { ok: true, operations: ops, ...naming(target, operations) };
      }
      default:
        return { ok: false, reason: `Unknown field \`${field}\`.` };
    }
    return { ok: true, operations: ops };
  }
  return { ok: false, reason: reasons.notInDiagram(id, diagramId) };
}
