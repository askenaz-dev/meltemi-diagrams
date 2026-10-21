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
  DIRECTIONS,
  ELEMENT_ONLY_PROPERTIES,
  ICON_POSITIONS,
  LABEL_POSITIONS,
  LAYOUT_MODES,
  LINE_STYLES,
  PATTERNS,
  PORTS,
  PRESETS,
  PROFILES,
  RELATION_ONLY_PROPERTIES,
  ROUTINGS,
  STYLE_PROPERTIES,
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
import { CORNERED_SHAPES, StyleResolver, type Theme } from "@meltemi/diagrams-layout";
import { DEFAULT_DURATIONS, themeDurations } from "@meltemi/diagrams-motion";
import { diagramView, type DiagramView, type DocumentAnalysis } from "./analysis.js";
import { interiorOf, steadyGroups } from "./arrange.js";
import type {
  ColorSwatch,
  FieldGlyphs,
  InspectorField,
  InspectorModel,
} from "./canvas/protocol.js";
import { c4DiagramFields, c4ElementFields, c4FieldOperations, c4RelationFields } from "./c4.js";
import { effectFields, effectLabel, effectOperations, effectsFor } from "./effects.js";
import { drawnIconSize, iconChoice, iconKind } from "./icons.js";
import { messages } from "./messages/index.js";
import { freshRelationId, namedNotice, namedRelation, styleTargets } from "./targets.js";
import { effectiveTheme, themeLocation } from "./themes.js";

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

/** The objects of free diagrams whose frame (a fill, a stroke or a pattern) takes `radius`. */
const FRAME_KINDS: ReadonlySet<string> = new Set(["text", "icon", "image"]);

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
  { name: "iconSize", type: "number", range: rangeOf("iconSize"), elements: iconKind },
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
];

/** Style fields of free diagrams: text. */
const FREE_STYLE_FIELDS: readonly StyleField[] = [
  { name: "fontSize", type: "number" },
  { name: "fontWeight", type: "enum", options: FONT_WEIGHTS.map(String) },
  { name: "textAlign", type: "enum", options: TEXT_ALIGNS },
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

function styleFields(diagram: FlowDiagram, targets: readonly StyleTarget[]): InspectorField[] {
  const kinds = new Set(targets.map((t) => t.kind));
  const styles = targets.map((t) => writtenStyle(diagram, t.id, t.kind));
  const fields = diagram.type === "free" ? [...STYLE_FIELDS, ...FREE_STYLE_FIELDS] : STYLE_FIELDS;
  const labels = messages().style;
  return fields
    .filter(
      (f) =>
        !(
          (kinds.has("element") || kinds.has("event")) &&
          RELATION_ONLY_PROPERTIES.includes(f.name)
        ) &&
        !(kinds.has("relation") && ELEMENT_ONLY_PROPERTIES.includes(f.name)) &&
        !(diagram.type === "sequence" && NOT_IN_SEQUENCES.has(f.name)) &&
        (f.elements === undefined ||
          targets.every((t) => {
            const element = t.kind === "element" ? diagram.elementsById.get(t.id) : undefined;
            return element !== undefined && f.elements!(element.kind, diagram);
          })),
    )
    .map((f) => {
      const values = styles.map((s) => shown(s[f.name]));
      const same = values.every((v) => v === values[0]);
      const options = typeof f.options === "function" ? f.options(diagram) : f.options;
      return {
        name: `style.${f.name}`,
        label: labels[f.name],
        type: f.type,
        value: same ? (values[0] ?? null) : null,
        ...(same ? { fromTheme: true } : { mixed: true }),
        ...(options ? { options } : {}),
        ...(f.glyphs ? { glyphs: f.glyphs } : {}),
        ...(f.range ? { range: f.range } : {}),
      };
    });
}

/**
 * The element style fields with what applies without a written value, when the targets share it:
 * the shape they are drawn with, the radius of their rules and classes, else the radius drawn (the
 * theme's `radius`, `groupRadius` for groups, a body radius, or none), the icon of their classes and
 * rules, and the icon's position, size and label position. The radius is shown only where it is
 * drawn: not for a box or a node drawn as a shape without corners (an ellipse, a circle, a pill). Label position is shown only
 * where the icon is the centre piece (`iconPosition center`, `shape icon`), and Icon position not
 * where the icon is the shape.
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
  const shapeOf = (e: Element) =>
    view.layout?.shapes?.get(e.id) ?? styles.element(e).shape ?? e.shape ?? "rounded";
  // The radius drawn without one written: the theme's on rounded boxes, notes and frames, the
  // group radius on groups, a person's or an agent's body radius, and none on the other corners.
  const drawnRadius = (e: Element) => {
    if (e.kind === "group") return theme.groupRadius;
    if (e.kind === "decision") return 0;
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
  const defaults: Readonly<Record<string, string | undefined>> = {
    "style.shape": shared(elements.map((e) => view.layout?.shapes?.get(e.id) ?? "rounded")),
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
 * end (calls and replies in sequence diagrams), the end's head at the start of a two-way arrow,
 * the diagram's route kind and the theme's corners.
 */
function withRelationDefaults(
  fields: readonly InspectorField[],
  diagram: FlowDiagram,
  relation: Relation,
  theme: Theme,
): InspectorField[] {
  const written = writtenStyle(diagram, relation.id ?? relation.key, "relation");
  const endDefault =
    diagram.type === "sequence"
      ? relation.line === "dashed" || relation.async
        ? "open"
        : "triangle"
      : theme.arrowhead;
  const end = typeof written.arrowhead === "string" ? written.arrowhead : endDefault;
  const defaults: Readonly<Record<string, string>> = {
    "style.arrowhead": endDefault,
    "style.arrowtail": relation.twoWay ? end : "none",
    "style.routing": diagram.properties.routing,
    "style.corners": theme.corners,
  };
  return fields.map((f) =>
    defaults[f.name] !== undefined && f.fromTheme ? { ...f, placeholder: defaults[f.name] } : f,
  );
}

/** Kinds an element of a profile can become; icons, images and groups keep theirs. */
function kindOptions(diagram: FlowDiagram, element: Element): readonly string[] {
  if (element.kind === "group" || element.kind === "icon" || element.kind === "image") {
    return [element.kind];
  }
  return diagram.type === "free" ? ["box", "text"] : ["node", "decision", "data", "note", "tag"];
}

/**
 * The `layer` and `link` fields of free objects and of every element, and the group an element of
 * a flow or free diagram is declared in.
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
    if (element) {
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

function elementFields(view: DiagramView, element: Element): InspectorField[] {
  const diagram = view.diagram;
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
  const ports = element.ports
    .map(
      (p) =>
        `${p.name} ${p.side}${Math.round(p.position * 100) === 50 ? "" : ` ${Math.round(p.position * 100)}%`}`,
    )
    .join(", ");
  const words = messages().fields;
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
        : { name: "label", label: words.label, type: "text", value: element.label },
    {
      name: "description",
      label: words.description,
      type: "multiline",
      value: element.description,
    },
    {
      name: "classes",
      label: words.classes,
      type: "classes",
      value: element.classes.map((c) => c.name).join(", ") || null,
    },
  ];
  fields.push(...identityFields(diagram, element));
  if (element.kind !== "group")
    fields.push({
      name: "ports",
      label: words.ports,
      type: "ports",
      value: ports || null,
      placeholder: "in west 30%, out east",
    });
  fields.push(
    {
      name: "x",
      label: words.x,
      type: "number",
      value: place ? place.x : null,
      ...(center ? { placeholder: String(center.x) } : {}),
    },
    {
      name: "y",
      label: words.y,
      type: "number",
      value: place ? place.y : null,
      ...(center ? { placeholder: String(center.y) } : {}),
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
  );
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

/** The choices of the Canvas field after fitting the content, which nothing written means. */
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
  const iconed = elements.length > 0 && elements.every((e) => styles.element(e).icon !== undefined);
  return withStrip(withIcons(model, view, analysis.icons), theme, themes, iconed);
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

/** The built-in theme of the same family in the other scheme: `technical.dark` for `technical.light`. */
export function counterpartTheme(name: string): string | undefined {
  const match = /^(technical|editorial|stage)\.(light|dark)$/.exec(name);
  if (!match) return undefined;
  return `${match[1]}.${match[2] === "light" ? "dark" : "light"}`;
}

/** The strip's fields, in the order it shows them; the first `line` is the relation's arrow. */
const STRIP = [
  "theme",
  "style.fill",
  "style.stroke",
  "style.color",
  "line",
  "style.line",
  "style.width",
  "style.arrowtail",
  "style.arrowhead",
  "style.routing",
  "style.corners",
  "style.radius",
  "style.rotation",
  "style.shape",
  // For elements with an icon only.
  "style.iconPosition",
  "effect.flow",
  "effect.flow.duration",
  "effect.dash",
  "effect.dash.duration",
  "effect.pulse",
  "effect.pulse.duration",
  "effect.trace",
  "effect.trace.duration",
];

/**
 * Marks the fields of the style strip and puts them first: colours with the theme's swatches, the
 * line, width and arrowhead, the shape and, for elements with an icon (`iconed`), the icon's
 * position, the effects with their speed (the theme's default as placeholder), and, for the
 * diagram, the theme with its light or dark counterpart.
 */
function withStrip(
  model: InspectorModel,
  theme: Theme,
  themes: { readonly editable: boolean; readonly project: boolean },
  iconed: boolean,
): InspectorModel {
  const swatches = themeSwatches(theme);
  const durations = themeDurations(theme);
  const quick = messages().quick;
  // A relation's arrow already says solid or dashed; its style `line` stays below.
  const arrow = model.fields.some((f) => f.name === "line");
  const inStrip = (name: string) =>
    STRIP.includes(name) &&
    !(arrow && name === "style.line") &&
    !(name === "style.iconPosition" && !iconed);
  const fields = model.fields.map((field): InspectorField => {
    if (!inStrip(field.name)) return field;
    const duration = /^effect\.(flow|dash|pulse|trace)\.duration$/.exec(field.name);
    if (duration) {
      const effect = duration[1] as AnimationEffect;
      return {
        ...field,
        section: "strip",
        placeholder: String(durations[effect] ?? DEFAULT_DURATIONS[effect]),
      };
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
          ...c4ElementFields(diagram, element),
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
      fields: [
        ...c4RelationFields(diagram, relation),
        ...(relation.id
          ? withRelationDefaults(
              styleFields(diagram, [{ id: relation.id, kind: "relation" }]),
              diagram,
              relation,
              effectiveTheme(analysis, view),
            )
          : []),
        ...(relation.id ? effectFields(diagram, relation.id, "relation") : []),
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
      // Notes and fragments with an id take styles.
      const styled = event.id !== null && (event.kind === "note" || event.kind === "fragment");
      return {
        // Fragment operators are notation and stay as written.
        title: titles.target(
          event.kind === "fragment" ? event.operator : kindName(event.kind),
          event.id ?? "",
        ),
        target: { kind: "event", ids: [id] },
        fields: [
          ...eventFields(diagram, event),
          ...(styled ? styleFields(diagram, [{ id: event.id!, kind: "event" }]) : []),
          ...(styled ? effectFields(diagram, event.id!, "event") : []),
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
        // Anonymous relations take effects too: setting one names the relation.
        ...(relation.id || !sequence
          ? effectFields(diagram, relation.id ?? relation.key, "relation")
          : []),
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
    return event.id !== null && (event.kind === "note" || event.kind === "fragment")
      ? [{ id: event.id, kind: "event" }]
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
    for (const id of ids) {
      const event = diagram.relationsByKey.has(id) ? undefined : diagram.eventsByKey.get(id);
      if (event && event.id === null) {
        return { ok: false, reason: reasons.nameToStyle(event.kind) };
      }
    }
    let written: string | number | null = text === "" ? null : text;
    // Numbers within the property's bounds, such as a corner radius from 0 to 64.
    const spec = STYLE_PROPERTIES[property];
    if (text !== null && text !== "" && spec?.kind === "number") {
      const parsed = typeof value === "number" ? value : Number(text.trim().replace(/px$/, ""));
      if (!Number.isFinite(parsed)) return { ok: false, reason: reasons.number };
      if (parsed < spec.min || parsed > spec.max) {
        return { ok: false, reason: reasons.between(spec.min, spec.max) };
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
    return { ok: true, operations: ops, ...(notice ? { notice } : {}) };
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
        // Flow diagrams place in diagram coordinates: the place stays as it is.
        const drawn = diagram.type === "free" ? box : undefined;
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
      case "x":
      case "y":
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
        break;
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
        const notice = namedNotice(operations.length > 0 ? [target] : []);
        return { ok: true, operations: ops, ...(notice ? { notice } : {}) };
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
          const notice = namedNotice(operations.length > 0 ? [target] : []);
          return { ok: true, operations: ops, ...(notice ? { notice } : {}) };
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
        if (!named) return { ok: false, reason: reasons.nameToMoveLabel };
        const entry = diagram.placement.find(
          (p): p is LabelEntry => p.statement === "label" && p.target === named,
        );
        ops.push({
          kind: "setLabelAnchor",
          diagram: d,
          relation: named,
          at: number,
          offset: entry?.offset ?? { x: 0, y: 0 },
        });
        break;
      }
      default:
        return { ok: false, reason: `Unknown field \`${field}\`.` };
    }
    return { ok: true, operations: ops };
  }
  return { ok: false, reason: reasons.notInDiagram(id, diagramId) };
}
