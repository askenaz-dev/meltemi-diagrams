import { DEFAULT_LOCALE, type Locale } from "@meltemi/diagrams-i18n";
import {
  defaultImageSize,
  type IconResolver,
  type ImageResolver,
  type ResolvedIcon,
  type ResolvedImage,
} from "@meltemi/diagrams-assets";
import type { Diagnostic, KeywordStatement, LineIndex, Range } from "@meltemi/diagrams-language";
import {
  ENTITY_TYPE_NAMES,
  ICON_SIZE_RANGE,
  MAIN_LAYER,
  PEN_WIDTH_RANGE,
  takesRotation,
} from "@meltemi/diagrams-model";
import type {
  Compilation,
  Element,
  ElementKind,
  FlowDiagram,
  LabelEntry,
  LayoutMode,
  LinePoints,
  PenPoints,
  Point,
  PortSide,
  Relation,
  RouteEndpoint,
  RouteEntry,
  Routing,
  SizeEntry,
  ThemeDefinition,
} from "@meltemi/diagrams-model";
import { auditLabels } from "./audit.js";
import { drawingWords, messages, type LabelObstacle, type LayoutWords } from "./messages/index.js";
import { checkComposition } from "./checks.js";
import { solveConstraints, type SolverBox } from "./constraints.js";
import {
  ENGINE_SPACING,
  type ArrangePort,
  type ArrangeRequest,
  type Arrangement,
  type LayoutEngine,
} from "./engine.js";
import {
  LANE_SPACING,
  anchorPoints,
  avoidingRoute,
  crossedBoxes,
  bezierThrough,
  detourRoute,
  portPoint,
  shapeRoute,
  sideNormal,
  sideOfPoint,
  snapEnd,
  type ConnectorEnd,
} from "./routing.js";
import {
  boxCenter,
  boxFromCenter,
  cylinderPaths,
  ellipsePath,
  expandBox,
  pointAlong,
  unionBoxes,
  type Box,
  type Side,
} from "./geometry.js";
import {
  CORNER_RADIUS,
  endMarker,
  markerItems,
  markerPoints,
  markerReach,
  relationEnds,
  roundCorners,
  shiftMarker,
  type MarkerPart,
} from "./markers.js";
import {
  freeFrames,
  groupHeaderOf,
  isList,
  isUntitledGroup,
  listHolders,
  listPlaces,
  paintOrder,
  parentOf,
  type FreeFrames,
  type ListArrangement,
} from "./free.js";
import { layoutSequence } from "./sequence.js";
import { IconPainter } from "./icons.js";
import { brandFrame, textItem } from "./frame.js";
import { markGradient } from "./mark.js";
import {
  strokeDash,
  type GroupItem,
  type PolylineItem,
  type RectItem,
  type Scene,
  type SceneClip,
  type SceneGradient,
  type SceneItem,
  type ScenePattern,
  type StrokeDash,
  type TextItem,
} from "./scene.js";
import {
  MIN_TEXT_MARGIN,
  TextMetrics,
  estimateMeasurer,
  fontRole,
  textFont,
  writtenStack,
  type TextFont,
  type TextMeasurer,
} from "./measure.js";
import {
  CORNERED_SHAPES,
  FIXED_TEXT_SHAPES,
  boundaryToward,
  SHAPE_SIZES,
  agentHeight,
  framedLines,
  isOutlined,
  onOutline,
  onPolygon,
  shapeOutline,
  shapeTextCenter,
  shapeTextBand,
  shapeTextSpan,
  shapeTextSpanner,
  turnPoint,
  turnedOutline,
  type BoxShape,
  type ShapeOptions,
  type ShapeSize,
} from "./shapes.js";
import { StyleResolver, type PatternKind, type ResolvedStyle } from "./styles.js";
import { splitLines, wrapLines } from "./text.js";
import {
  DEFAULT_THEME_NAME,
  THEMES,
  resolveTheme,
  type IconPosition,
  type LabelPosition,
  type Theme,
} from "./theme.js";

export interface LayoutOptions {
  /** Theme name that overrides the diagram's `theme` property. */
  readonly theme?: string | null;
  /**
   * Draws the scene with `frame none` whatever the theme says, keeping every other token: no strip
   * at the foot of the sheet (the mark, the wordmark and the title) and no mark gradient. An export
   * without the Meltemi branding asks for it.
   */
  readonly frame?: "none";
  /** Theme used when the diagram has no `theme` property, such as the project's default theme. */
  readonly defaultTheme?: string | null;
  /**
   * Theme definitions to resolve names against instead of the file's own themes; projects pass the
   * scope from `themeDefinitionsFor(file)` so imported themes resolve.
   */
  readonly themes?: readonly ThemeDefinition[];
  /** Measures text; defaults to estimates. Hosts with fonts pass `@meltemi/diagrams-fonts`. */
  readonly measurer?: TextMeasurer;
  /** Resolves `icon` references; without it icons are not drawn. Projects pass their registry. */
  readonly icons?: IconResolver;
  /** Arranges `auto` and `assisted` diagrams; without it they render only when fully placed. */
  readonly engine?: LayoutEngine;
  /**
   * Lays out as if the diagram's `layout` were this mode. The `layout` command arranges the
   * unplaced elements with `assisted` and every element with `auto`.
   */
  readonly layout?: LayoutMode;
  /**
   * Resolves the paths of `image` objects, relative to the diagram's file. Without it, or for a
   * file that cannot be read, a placeholder is drawn and `layout.image-unavailable` is reported.
   */
  readonly images?: ImageResolver;
  /** Sequence diagrams: lays out one scenario instead of every event. */
  readonly scenario?: string;
  /**
   * The language of the words the layout adds to the drawing (the type lines of C4 entities):
   * the project's `locale` or an export's. English by default; never the machine's language.
   */
  readonly locale?: Locale;
}

export interface LayoutResult {
  readonly scene: Scene | null;
  readonly diagnostics: readonly Diagnostic[];
  /**
   * Boxes of the elements and groups in diagram coordinates, where `place` statements live, when
   * there is a scene. The scene itself is moved to make room for margins and the frame. Sequence
   * diagrams add their notes, fragments and written activation bars by event key.
   */
  readonly boxes?: ReadonlyMap<string, Box>;
  /** Scene coordinates minus diagram coordinates, when there is a scene. */
  readonly offset?: Point;
  /** Label pills of the relations that have one, by relation key, in diagram coordinates. */
  readonly labels?: ReadonlyMap<string, Box>;
  /**
   * Sequence diagrams: how the label of every message is drawn, by message key, in diagram
   * coordinates: the room it wraps in and the lines it wrapped to, which editors that type over it
   * take so that their text wraps as the drawing's does. A message's block is in `labels`.
   */
  readonly messageTexts?: ReadonlyMap<string, MessageText>;
  /**
   * Sequence diagrams: every activation bar, by the key of the `activate` that opens it or of the
   * call whose block draws it, in diagram coordinates. A written bar's box is also in `boxes`.
   */
  readonly bars?: ReadonlyMap<string, BarGeometry>;
  /**
   * Sequence diagrams: the pills of the tags of every message and participant that has some, by
   * message key or participant id, in source order, in diagram coordinates.
   */
  readonly tags?: ReadonlyMap<string, readonly Box[]>;
  /** The route of every relation, by relation key, in diagram coordinates. */
  readonly connectors?: ReadonlyMap<string, ConnectorGeometry>;
  /**
   * Free diagrams: every pen stroke by its id, in diagram coordinates. Its box in `boxes` is its
   * `bounds`, which marquee selection and derived groups use.
   */
  readonly pens?: ReadonlyMap<string, PenGeometry>;
  /**
   * Free diagrams: how the text of every sticky is drawn, by its id, in diagram coordinates: the
   * room it is wrapped in and the font size it shrank to, which editors that type over the card
   * take so that their text wraps as the card's does.
   */
  readonly stickies?: ReadonlyMap<string, StickyText>;
  /**
   * Free diagrams: every list group (`layout column|row`) by its id: its layout, spacing and
   * alignment with their defaults, the children it places in their order, and its interior origin,
   * in diagram coordinates. The children's drawn boxes are in `boxes`, as any group child's.
   */
  readonly lists?: ReadonlyMap<string, ListGeometry>;
  /**
   * Free diagrams: the interior origin of the parent group of every group child, in diagram
   * coordinates. A child's written `place` is its centre minus this origin. Empty for flow.
   */
  readonly origins?: ReadonlyMap<string, Point>;
  /** The resolved theme the diagram was laid out with, when there is a scene. */
  readonly theme?: Theme;
  /** Sequence diagrams: the row band of every event by key, in diagram coordinates. */
  readonly events?: ReadonlyMap<string, { readonly y: number; readonly height: number }>;
  /**
   * The drawn shape of every element box but groups', when there is a scene: the `shape` of a free
   * box or a flow node, a decision's diamond, a data store's cylinder, a C4 person's person, a
   * tag's pill, a sticky's `rectangle` (its card, with its radius in `radii`), and `rounded` for
   * the others. Hosts pass it with the box to `shapeOutline`, `onOutline`, `shapeMagnets` and
   * `pointInShape`. Sequence diagrams give their box-kind heads: `cylinder` for databases,
   * `rounded` for the others; figures have none.
   */
  readonly shapes?: ReadonlyMap<string, BoxShape>;
  /**
   * The label of every element that draws it outside its box (`shape icon`), by element id, in
   * diagram coordinates: from the top of its first line to the descenders of its last. The box in
   * `boxes` stays the icon's square, which connectors, magnets, handles and selection use; the
   * element's extent, which the engine and derived groups use, is the union of both, and the
   * composition checks take the square and the label as two rectangles. Absent for sequence
   * diagrams.
   */
  readonly elementLabels?: ReadonlyMap<string, Box>;
  /**
   * The angle of every turned element, clockwise in degrees about the centre of its box in
   * `boxes`, which stays its unturned box (decision 0045).
   */
  readonly rotations?: ReadonlyMap<string, number>;
  /**
   * The corner radius every element with corners is drawn with, its `ShapeOptions.radius`, for
   * hosts that draw its outline, magnets and hit tests with `shapeOutline` and its relatives.
   */
  readonly radii?: ReadonlyMap<string, number>;
}

/** Where a relation is drawn, for editors. */
export interface ConnectorGeometry {
  /** The route from the source anchor to the target anchor, before the arrowhead is cut out. */
  readonly points: readonly Point[];
  /**
   * The polyline the connector is drawn with, the heads cut out: a Bézier route's samples, the
   * rounded corners, the elbows of a detour.
   */
  readonly line: readonly Point[];
  readonly fromSide: "north" | "south" | "east" | "west";
  readonly toSide: "north" | "south" | "east" | "west";
  /** The waypoints written in the relation's `route` and used for drawing. */
  readonly via: readonly Point[];
}

/** Where a pen stroke is drawn, for editors. */
export interface PenGeometry {
  /** Its written points moved by the interior origin of its group: where it is drawn. */
  readonly points: readonly Point[];
  /** The box of the points grown by half the stroke's width on every side. */
  readonly bounds: Box;
  /** The stroke's resolved width. */
  readonly width: number;
}

/** The width of a pen stroke whose style writes none. */
export const DEFAULT_PEN_WIDTH = 3;

/**
 * How a list group arranges its children, for editors: its `layout`, its `spacing` (half the
 * theme's `groupPadding` when not written) and its `align` (`start` when not written), the
 * children it places in source order (its elements and groups; its lines and pens keep their
 * points), and where its first child starts.
 */
export interface ListGeometry extends ListArrangement {
  /** The list's interior origin, in diagram coordinates: inside its padding, below its header. */
  readonly origin: Point;
}

/** How the text of a sticky is drawn, for editors. */
export interface StickyText {
  /**
   * The room the text is wrapped in and aligned within: the card inside the theme's `padding`,
   * right of its icon when it has one. Unturned, as the card's box is.
   */
  readonly area: Box;
  /** The font size the lines are drawn at: `fontSize` or 1.2 times the label size, shrunk to fit. */
  readonly size: number;
  readonly weight: number;
  /** The font the lines are measured and drawn in: the body font, or the style's stack. */
  readonly font: TextFont;
  /** The distance between two lines: 1.25 times the size. */
  readonly line: number;
  /** The lines as drawn: the text wrapped at the area's width. */
  readonly lines: readonly string[];
  readonly align: "left" | "center" | "right";
  readonly verticalAlign: "top" | "middle" | "bottom";
  /**
   * Whether the lines fit the area. When they do not even at `STICKY_MIN_FONT_SIZE`, they are
   * drawn from the area's top at that size, clipped to the card, and `layout.text-overflow` says so.
   */
  readonly fits: boolean;
}

/** How the label of a sequence message is drawn, for editors. */
export interface MessageText {
  /**
   * The room the label wraps in: the top and height of its block of lines, and the distance
   * between the two lifelines less 24 (and the number disc's 22 under `autonumber`) wide, centred
   * on the block. A self-call's label does not wrap: its room is its block, beside the loop.
   */
  readonly area: Box;
  /**
   * The lines as drawn: the label broken at `\n`, and wrapped at spaces where the area is
   * narrower than a line; a self-call's broken at `\n` only. Empty when the message has no label.
   */
  readonly lines: readonly string[];
  /** The font size of the lines: the theme's relation label size, or the message's `fontSize`. */
  readonly size: number;
  /** The distance between two lines: 1.25 times the size. */
  readonly line: number;
  /** The weight of the lines: 400, or the message's `fontWeight`. */
  readonly weight?: number;
  /** The stack the message's style writes (`font`), when it writes one. */
  readonly font?: string;
  /**
   * Whether the label wraps at the area's width: true when a pull (a negative `gap`, a `spacing`
   * below the default) brings a pair of columns between its two lifelines closer than the label
   * held them, so the room caps it; false for a self-call and for a message whose columns are at
   * their natural distance, whose label pushes them apart on one line instead.
   */
  readonly wraps: boolean;
}

/** Where an activation bar of a sequence diagram is drawn, for editors. */
export interface BarGeometry {
  /** The participant whose lifeline the bar stands on. */
  readonly participant: string;
  /** The bar's rectangle. */
  readonly box: Box;
  /** How many bars of the participant are open under it: 0 for the outermost. */
  readonly depth: number;
  /** The key of the `activate` that opens the bar, or of the call whose block draws it. */
  readonly from: string;
  /**
   * The key of the `deactivate` that closes the bar; null for a bar open to the end of the
   * lifeline (or to its `destroy`) and for the bar of a call's block.
   */
  readonly to: string | null;
  /** Whether a call's block draws the bar, rather than an `activate` statement. */
  readonly block: boolean;
}

/** The smallest size a sticky's text shrinks to before it is clipped to its card. */
export const STICKY_MIN_FONT_SIZE = 8;
/** A sticky's default font size, as a factor of the theme's label size. */
const STICKY_FONT_SCALE = 1.2;
/** The weight of a sticky's text when its style writes no `fontWeight`. */
const STICKY_FONT_WEIGHT = 400;
/** The corner radius of a sticky's card when its style writes no `radius`. */
const STICKY_RADIUS = 2;
/** The shadow under a sticky's card: how far down it lies, its colour and its opacity. */
const STICKY_SHADOW = { offset: 3, color: "#000000", opacity: 0.15 } as const;

/** Widest content canvas of `preset document` before `layout.too-large`. */
export const DOCUMENT_MAX_WIDTH = 1200;
/** The 16:9 canvas of `preset slide`. */
export const SLIDE_SIZE = { width: 1920, height: 1080 } as const;
/** Size of one pattern tile in pixels. */
export const PATTERN_SIZE = 8;

/** Default box sizes of the `technical.*` type scale (13 px labels); others scale with `labelSize`. */
export const DEFAULT_SIZES: Readonly<
  Record<ElementKind, { width: number; height: number } | null>
> = {
  node: { width: 160, height: 56 },
  decision: { width: 160, height: 80 },
  data: { width: 160, height: 64 },
  group: null,
  note: null,
  tag: null,
  box: { width: 160, height: 56 },
  text: null,
  icon: { width: 48, height: 48 },
  image: null,
  // A sticky is a square card that never grows for its text.
  sticky: { width: 160, height: 160 },
  // A free line is the bounding box of its points; a pen, of its points and its width.
  line: null,
  pen: null,
  // Sequence heads are measured by the sequence layout.
  participant: null,
  actor: null,
  boundary: null,
  control: null,
  entity: null,
  database: null,
  collections: null,
  queue: null,
  // C4 entities: boxes with a type line, a person with a head, a datastore cylinder.
  person: { width: 160, height: 104 },
  system: { width: 180, height: 80 },
  container: { width: 170, height: 76 },
  datastore: { width: 170, height: 84 },
  component: { width: 160, height: 72 },
};

/** The radius of a person's head, from the label size. */
function personHead(label: number): number {
  return Math.round(label * 1.2);
}

/** The size of the technology line of a relation label. */
function technologySize(relationLabel: number): number {
  return Math.max(8, Math.round(relationLabel * 0.85));
}

/** The words of each C4 entity kind, plain and external. */
const C4_WORDS: Readonly<Record<string, readonly [keyof C4Words, keyof C4Words]>> = {
  person: ["person", "externalPerson"],
  system: ["system", "externalSystem"],
  container: ["container", "externalContainer"],
  datastore: ["container", "externalContainer"],
  component: ["component", "externalComponent"],
};
type C4Words = LayoutWords["drawing"]["c4"];

/**
 * The type line of a C4 entity in the content language: `[Container: React]`, `[Contenedor: React]`.
 * The content language is explicit (English by default), never the interface's.
 */
export function c4TypeLine(element: Element, locale: Locale = DEFAULT_LOCALE): string | null {
  const name = c4TypeName(element, locale);
  if (name === null) return null;
  return element.technology ? `[${name}: ${element.technology}]` : `[${name}]`;
}

/**
 * The type word of a C4 entity in the content language, as its type line draws it without the
 * brackets and the technology: `Container`, `External Software System`, `Contenedor`. Null for
 * the boundary group and for elements that draw no entity.
 */
export function c4TypeName(
  element: Pick<Element, "entity" | "kind" | "external">,
  locale: Locale = DEFAULT_LOCALE,
): string | null {
  if (!element.entity || element.kind === "group") return null;
  const keys = C4_WORDS[element.kind];
  return keys
    ? drawingWords(locale).c4[keys[element.external ? 1 : 0]]
    : (ENTITY_TYPE_NAMES[element.kind] ?? element.kind);
}

/**
 * A C4 view as the flow pipeline draws it: each entity's description starts with its type line,
 * and the boundary's title names the scope's type.
 */
function c4Drawing(diagram: FlowDiagram, locale: Locale): FlowDiagram {
  const words = drawingWords(locale).c4;
  const elements = diagram.elements.map((element): Element => {
    if (element.kind === "group") {
      // The boundary of a container view is a system; of a component view, a container.
      const type = diagram.c4?.level === "component" ? words.container : words.system;
      return { ...element, label: `${element.label} [${type}]`, description: null };
    }
    const type = c4TypeLine(element, locale);
    return {
      ...element,
      description: [type, element.description].filter((l) => l).join("\n") || null,
    };
  });
  return { ...diagram, elements, elementsById: new Map(elements.map((e) => [e.id, e])) };
}

/**
 * Shapes whose text keeps the whole width of the box, as before shapes had text areas: their
 * default sizes and overflow checks are the boxes'.
 */
const FULL_WIDTH_TEXT: ReadonlySet<BoxShape> = new Set<BoxShape>([
  "rounded",
  "rectangle",
  "square",
  "cylinder",
  "person",
]);

/**
 * How far a shape may reach into the glyph rows of a text before they count as clipped: the label
 * audit's tolerance, so that a wave crest grazing the descenders is not a cut.
 */
const ROW_TOLERANCE = 0.75;

/** Widths that shapes grow to are whole pixels, rounded down when they are within this of one. */
const ROUNDING = 0.01;

/** The heights a shaped box tries, as factors of its own, when its text does not fit. */
const TALLER: readonly number[] = [1.25, 1.5, 2, 2.5, 3, 4];

/** A corner radius drawn on a box: never negative, at most half its shorter side. */
function cornerRadius(radius: number, box: Box): number {
  return Math.max(0, Math.min(radius, box.width / 2, box.height / 2));
}

/** Type sizes, line heights and frame measures derived from a theme's type tokens. */
export interface TypeScale {
  readonly label: number;
  readonly labelWeight: number;
  readonly description: number;
  readonly descriptionLine: number;
  readonly groupTitle: number;
  readonly note: number;
  readonly noteLine: number;
  readonly tag: number;
  readonly tagHeight: number;
  readonly tagPadding: number;
  readonly relationLabel: number;
  readonly relationLabelHeight: number;
  readonly relationLabelPadding: number;
  readonly frameBrand: number;
  readonly frameTitle: number;
  readonly frameHeight: number;
  readonly frameMark: number;
}

/**
 * Derives line heights and pill sizes from the type tokens. The ratios are those of the
 * `technical.*` themes: 11 px descriptions on 16 px lines, 18 px tags at 10.5 px, a 44 px frame
 * at 12 px.
 */
export function typeScale(theme: Theme): TypeScale {
  const tagHeight = Math.round((theme.tagSize * 18) / 10.5);
  return {
    label: theme.labelSize,
    labelWeight: theme.labelWeight,
    description: theme.descriptionSize,
    descriptionLine: Math.round((theme.descriptionSize * 16) / 11),
    groupTitle: theme.groupTitleSize,
    note: theme.noteSize,
    noteLine: Math.round((theme.noteSize * 18) / 11),
    tag: theme.tagSize,
    tagHeight,
    tagPadding: tagHeight,
    relationLabel: theme.relationLabelSize,
    relationLabelHeight: Math.round((theme.relationLabelSize * 18) / 11),
    relationLabelPadding: Math.round((theme.relationLabelSize * 12) / 11),
    frameBrand: theme.frameSize,
    frameTitle: Math.round(((theme.frameSize * 11) / 12) * 2) / 2,
    frameHeight: Math.round((theme.frameSize * 44) / 12),
    frameMark: Math.round(theme.frameSize * 2),
  };
}

/** The text kinds whose size a style may write, each with the token it overrides. */
export type TextScaleKind = "label" | "groupTitle" | "note" | "tag" | "relationLabel";

/**
 * The type scale of a target whose style writes `fontSize`: the theme's scale with the size of
 * its kind and every measure derived from it, as the theme's token would give them: a label's
 * description at the theme's ratio of description to label, a pill's height and padding, a tag's
 * pill, a note's line (decision 0067). Without a written size, `scale` itself.
 */
export function writtenScale(
  theme: Theme,
  scale: TypeScale,
  kind: TextScaleKind,
  size: number | undefined,
): TypeScale {
  if (size === undefined) return scale;
  switch (kind) {
    case "label":
      return {
        ...scale,
        ...pick(
          typeScale({
            ...theme,
            labelSize: size,
            descriptionSize: Math.round((size * theme.descriptionSize) / theme.labelSize),
          }),
          ["label", "description", "descriptionLine"],
        ),
      };
    case "groupTitle":
      return { ...scale, groupTitle: size };
    case "note":
      return { ...scale, ...pick(typeScale({ ...theme, noteSize: size }), ["note", "noteLine"]) };
    case "tag":
      return {
        ...scale,
        ...pick(typeScale({ ...theme, tagSize: size }), ["tag", "tagHeight", "tagPadding"]),
      };
    case "relationLabel":
      return {
        ...scale,
        ...pick(typeScale({ ...theme, relationLabelSize: size }), [
          "relationLabel",
          "relationLabelHeight",
          "relationLabelPadding",
        ]),
      };
  }
}

function pick<T, K extends keyof T>(value: T, keys: readonly K[]): Pick<T, K> {
  return Object.fromEntries(keys.map((key) => [key, value[key]])) as Pick<T, K>;
}

/** The text of a connector's label pill: its scale, weight and font. */
export interface PillText {
  readonly scale: TypeScale;
  readonly weight: number;
  readonly font: TextFont;
}

/**
 * The text of a relation's or a free line's label pill from its resolved style: the theme's
 * relation label size at weight 500 in the body font, or what the style writes.
 */
export function pillText(theme: Theme, scale: TypeScale, style: ResolvedStyle): PillText {
  return {
    scale: writtenScale(theme, scale, "relationLabel", style.fontSize),
    weight: style.fontWeight ?? 500,
    font: textFont(style.font),
  };
}

/**
 * The width of a tag's pill: its text in the mono font at `tagSize`, weight 500, with `beside`
 * more for an icon, plus `tagPadding`. A pill is `tagHeight` high. Flow tags and the tags of
 * sequence messages and participants are measured alike.
 */
export function tagPillWidth(
  metrics: TextMetrics,
  scale: TypeScale,
  text: string,
  beside = 0,
  face: TagFace = DEFAULT_TAG_FACE,
): number {
  return Math.ceil(
    metrics.width(text, face.font, face.weight, scale.tag) + beside + scale.tagPadding,
  );
}

/** The font and weight of a tag's text: the mono font at 500 unless a style writes them. */
export interface TagFace {
  readonly font: TextFont;
  readonly weight: number;
}
const DEFAULT_TAG_FACE: TagFace = { font: "mono", weight: 500 };

/** How a tag's pill is painted: the theme's `tag` and `tagText` unless a flow style says otherwise. */
export interface TagPaint {
  readonly fill: string;
  readonly stroke: string;
  readonly strokeWidth: number;
  readonly dashed: StrokeDash;
  /** The text's colour. */
  readonly color: string;
}

/**
 * A tag's pill in `box`, in scene coordinates: its outline, as round as its shorter side allows
 * (upright when the tag is taller than wide), and its text centred on it in the mono font at
 * `tagSize`, weight 500. Flow tags and the tags of sequence messages and participants are drawn
 * alike.
 */
export function tagPill(
  metrics: TextMetrics,
  scale: TypeScale,
  box: Box,
  text: string,
  paint: TagPaint,
  face: TagFace = DEFAULT_TAG_FACE,
): { readonly outline: RectItem; readonly label: TextItem } {
  const center = boxCenter(box);
  return {
    outline: {
      kind: "rect",
      x: round(box.x),
      y: round(box.y),
      width: round(box.width),
      height: round(box.height),
      radius: cornerRadius(Infinity, box),
      fill: paint.fill,
      stroke: paint.stroke,
      strokeWidth: paint.strokeWidth,
      dashed: paint.dashed,
    },
    label: textItem(
      metrics,
      center.x,
      center.y,
      text,
      scale.tag,
      face.weight,
      paint.color,
      "middle",
      face.font,
    ),
  };
}

interface RelationGeometry {
  readonly relation: Relation;
  /** The drawn polyline, or a sampling of the curve for Bézier routes. */
  readonly line: readonly Point[];
  /** The heads at the source and at the target. */
  readonly start: readonly MarkerPart[];
  readonly end: readonly MarkerPart[];
  readonly label: { box: Box; text: string; technology: string | null } | undefined;
  /** Path data of a Bézier connector. */
  readonly curve: string | undefined;
  readonly connector: ConnectorGeometry;
}

/** A free line drawn as a connector: its drawn line, heads, pill and curve, and its route. */
interface LineGeometry {
  readonly element: Element;
  readonly line: readonly Point[];
  readonly start: readonly MarkerPart[];
  readonly end: readonly MarkerPart[];
  readonly label: { box: Box; text: string } | undefined;
  readonly curve: string | undefined;
  readonly connector: ConnectorGeometry;
}

/** A pen stroke as drawn: its points cut where its heads begin, and its heads. */
interface PenDrawing {
  readonly line: readonly Point[];
  readonly start: readonly MarkerPart[];
  readonly end: readonly MarkerPart[];
}

/** Room kept between a group's title and the connectors that pass under it. */
const TITLE_GAP = 3;

/**
 * The visible pieces of a polyline that passes under `holes`: the parts inside a hole are left
 * out. A line no hole touches is one piece.
 */
export function splitAround(line: readonly Point[], holes: readonly Box[]): Point[][] {
  if (holes.length === 0 || line.length < 2) return [[...line]];
  const pieces: Point[][] = [];
  let piece: Point[] = [line[0]!];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const hidden: [number, number][] = [];
    for (const hole of holes) {
      const span = clipSegment(a, b, hole);
      if (span) hidden.push(span);
    }
    hidden.sort((x, y) => x[0] - y[0]);
    const at = (t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    let t = 0;
    for (const [from, to] of hidden) {
      if (to <= t) continue;
      if (from > t) {
        if (piece.length === 0) piece.push(at(t));
        piece.push(at(from));
      }
      if (piece.length >= 2) pieces.push(piece);
      piece = [];
      t = Math.max(t, to);
    }
    if (t < 1) {
      if (piece.length === 0) piece.push(at(t));
      piece.push(b);
    }
  }
  if (piece.length >= 2) pieces.push(piece);
  return pieces.length > 0 ? pieces : [[...line]];
}

/** The part of a segment inside a box, as fractions of the segment, or undefined. */
function clipSegment(a: Point, b: Point, box: Box): [number, number] | undefined {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const clips: readonly (readonly [number, number])[] = [
    [-dx, a.x - box.x],
    [dx, box.x + box.width - a.x],
    [-dy, a.y - box.y],
    [dy, box.y + box.height - a.y],
  ];
  for (const [p, q] of clips) {
    if (p === 0) {
      if (q < 0) return undefined;
      continue;
    }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 >= t1) return undefined;
  }
  return t1 - t0 > 1e-6 ? [t0, t1] : undefined;
}

/** Where along its connector a label placed by the layout may sit, in the order tried. */
const LABEL_STOPS = [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74, 0.18, 0.82];

/** The shapes and group title bands a relation's label should not cover. */
function labelObstacles(
  diagram: FlowDiagram,
  boxes: ReadonlyMap<string, Box>,
  sizing: Sizing,
): Box[] {
  const out: Box[] = [];
  for (const element of diagram.elements) {
    const box = boxes.get(element.id);
    if (!box) continue;
    if (element.kind !== "group") out.push(box);
    // An untitled group has no band to keep clear.
    else if (!sizing.untitled(element)) {
      const title = sizing.textNeeds(element).width;
      out.push({
        x: box.x,
        y: box.y,
        width: Math.min(box.width, title),
        height: sizing.headerOf(element),
      });
    }
  }
  return out;
}

/** The box around an outline's points, without margin. */
function outlineBounds(points: readonly Point[]): Box {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  // Turning by a right angle leaves rounding dust on the coordinates.
  const clean = (v: number) => Math.round(v * 1e6) / 1e6;
  return {
    x: clean(x),
    y: clean(y),
    width: clean(Math.max(...xs) - x),
    height: clean(Math.max(...ys) - y),
  };
}

/** The box around a line's points. */
function boundsOf(points: readonly Point[]): Box {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of points) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  // A straight horizontal or vertical line still has an area to meet.
  return { x: x0 - 1, y: y0 - 1, width: x1 - x0 + 2, height: y1 - y0 + 2 };
}

/** A free line's points in order: `from`, its bends, `to`. */
function linePointsOf(line: LinePoints): Point[] {
  return [line.from, ...line.via, line.to];
}

/** The box of a free line: the bounding box of its points, at least 1 wide and 1 tall. */
function lineBox(points: readonly Point[]): Box {
  const { x, y, width, height } = penBox(points, 0);
  return { x, y, width: Math.max(1, width), height: Math.max(1, height) };
}

/**
 * The box of a pen stroke: the bounding box of its points grown by half its width on every side.
 * The extremes are found in one loop: a stroke may hold more points than a call takes arguments.
 */
function penBox(points: readonly Point[], width: number): Box {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of points) {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  return {
    x: x0 - width / 2,
    y: y0 - width / 2,
    width: x1 - x0 + width,
    height: y1 - y0 + width,
  };
}

/** Whether every point of a stroke is its first: a dot. */
function isDot(points: readonly Point[]): boolean {
  const first = points[0];
  return first !== undefined && points.every((p) => p.x === first.x && p.y === first.y);
}

/**
 * A name as part of an XML id: letters, digits, `_`, `-` and `.` kept, anything else `_`. Ids of
 * the language are already such names; the rule keeps a scene's ids valid whatever it is given.
 */
function xmlName(name: string): string {
  return name.replace(/[^A-Za-z0-9_.-]/g, "_");
}

/** A stroke's points without a point equal to the one before it, which make no segment. */
function withoutRepeats(points: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last === undefined || last.x !== p.x || last.y !== p.y) out.push(p);
  }
  return out;
}

/**
 * The path of a pen stroke through its points, as the layout draws it: `M p0`, then for every
 * inner point a quadratic curve to the midpoint between it and the next one, with the point as its
 * control (`Q p_i mid(p_i, p_i+1)`), then `L p_last`; two points are one segment, and one point
 * is `M p0 L p0`, which round caps draw as a dot. Numbers are rounded to hundredths, as the scene
 * writes them. Hosts draw a stroke in progress with it, so it looks as it will be written.
 */
export function penPath(points: readonly Point[]): string {
  const at = (p: Point) => `${round(p.x)} ${round(p.y)}`;
  const first = points[0];
  if (first === undefined) return "";
  let d = `M ${at(first)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i]!;
    const next = points[i + 1]!;
    d += ` Q ${at(p)} ${at({ x: (p.x + next.x) / 2, y: (p.y + next.y) / 2 })}`;
  }
  return `${d} L ${at(points[points.length - 1]!)}`;
}

/** A pen's stroke width: its style's, else `DEFAULT_PEN_WIDTH`, and never below one pixel. */
function penWidth(style: ResolvedStyle): number {
  return Math.max(PEN_WIDTH_RANGE.min, style.width ?? DEFAULT_PEN_WIDTH);
}

/**
 * The length of a pen's heads: the theme's arrow size, or three times the stroke's width for a
 * thicker stroke, so the head stays wider than the stroke it ends.
 */
function penHeadLength(arrowSize: number, width: number): number {
  return Math.max(arrowSize, 3 * width);
}

/** The side whose normal points most nearly from `from` towards `to`. */
function sideToward(from: Point, to: Point): Side {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "east" : "west";
  return dy >= 0 ? "south" : "north";
}

/**
 * A free line's points with an elbow between consecutive points that differ on both axes, each
 * leg leaving along the axis of the longer displacement: every segment horizontal or vertical.
 */
function orthogonalThrough(points: readonly Point[]): Point[] {
  const out: Point[] = [points[0]!];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (a.x !== b.x && a.y !== b.y) {
      out.push(
        Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? { x: b.x, y: a.y } : { x: a.x, y: b.y },
      );
    }
    out.push(b);
  }
  return out;
}

const SIDES: readonly Side[] = ["north", "east", "south", "west"];

const overlaps = (a: Box, b: Box) =>
  Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0.5 &&
  Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 0.5;

/**
 * Whether a point lies on a side of a box, within `tolerance` of it (the engine's ends lie a
 * pixel outside, on its ports).
 */
function onSide(box: Box, point: Point, side: Side, tolerance = 1.5): boolean {
  const right = box.x + box.width;
  const bottom = box.y + box.height;
  if (side === "north" || side === "south") {
    const y = side === "north" ? box.y : bottom;
    return (
      Math.abs(point.y - y) <= tolerance &&
      point.x >= box.x - tolerance &&
      point.x <= right + tolerance
    );
  }
  const x = side === "west" ? box.x : right;
  return (
    Math.abs(point.x - x) <= tolerance &&
    point.y >= box.y - tolerance &&
    point.y <= bottom + tolerance
  );
}

/** Whether `inner` lies inside `outer`, borders included, to half a pixel. */
const containsBox = (outer: Box, inner: Box) =>
  inner.x >= outer.x - 0.5 &&
  inner.y >= outer.y - 0.5 &&
  inner.x + inner.width <= outer.x + outer.width + 0.5 &&
  inner.y + inner.height <= outer.y + outer.height + 0.5;

/**
 * Slides each label the layout placed along its connector, from the middle outwards, to the first
 * stop where it covers no shape, no group title, no other label and no other connector; a label
 * with no clear stop keeps the stop that covers the least. Labels placed with `label` stay.
 */
function placeLabels(
  geometry: RelationGeometry[],
  movable: readonly { index: number; along: readonly Point[]; width: number; height: number }[],
  obstacles: readonly Box[],
): void {
  const moving = new Set(movable.map((m) => m.index));
  const placed: Box[] = geometry.flatMap((g, i) =>
    g.label && !moving.has(i) ? [g.label.box] : [],
  );
  // The extent of each connector, to look at the few that come near a label.
  const extents = geometry.map((g) => boundsOf(g.line));
  for (const item of movable) {
    const current = geometry[item.index]!;
    if (!current.label) continue;
    let best: { box: Box; cost: number } | undefined;
    for (const stop of LABEL_STOPS) {
      const box = boxFromCenter(pointAlong(item.along, stop), item.width, item.height);
      let cost = 0;
      for (const o of obstacles) if (overlaps(o, box)) cost++;
      for (const p of placed) if (overlaps(p, box)) cost++;
      for (let i = 0; i < geometry.length; i++) {
        if (i === item.index || !overlaps(extents[i]!, box)) continue;
        if (crossedBoxes(geometry[i]!.line, [box]).length > 0) cost++;
      }
      if (!best || cost < best.cost) best = { box, cost };
      if (cost === 0) break;
    }
    const box = best!.box;
    geometry[item.index] = { ...current, label: { ...current.label, box } };
    placed.push(box);
  }
}

/** Kinds drawn by hand on the sheet as annotations: their labels may lie on boxes. */
const ANNOTATION_KINDS: ReadonlySet<string> = new Set(["tag", "note", "text", "icon", "image"]);

/** Problems that already name a label, so that the label audit does not report them twice. */
const LABEL_CODES: ReadonlySet<string> = new Set([
  "layout.text-overflow",
  "layout.label-under-connector",
  "layout.overlap",
  "layout.connector-crossing",
]);

/**
 * Lays out one compiled diagram into a scene, then checks that no label is cut or overlaps
 * another label, a box or a connector (`layout.label-cut`, `layout.label-overlap`).
 */
export function layoutDiagram(
  compilation: Compilation,
  diagram: FlowDiagram,
  options: LayoutOptions = {},
): LayoutResult {
  const result = layoutDrawing(compilation, diagram, options);
  if (!result.scene) return result;
  return {
    ...result,
    diagnostics: [
      ...result.diagnostics,
      ...labelDiagnostics(
        diagram,
        result.scene,
        options.measurer ?? estimateMeasurer,
        result.diagnostics,
      ),
    ],
  };
}

/** The label audit of a scene as warnings on the declarations that draw the labels. */
function labelDiagnostics(
  diagram: FlowDiagram,
  scene: Scene,
  measurer: TextMeasurer,
  reported: readonly Diagnostic[],
): Diagnostic[] {
  const annotations = new Set(
    diagram.elements.filter((e) => ANNOTATION_KINDS.has(e.kind)).map((e) => e.id),
  );
  const layers = new Map(diagram.elements.map((e) => [e.id, e.layer ?? "main"]));
  const rangeOf = (owner: string): Range =>
    diagram.elementsById.get(owner)?.range ??
    diagram.relationsByKey.get(owner)?.range ??
    diagram.eventsByKey.get(owner)?.range ??
    diagram.idRange;
  // Elements and relations other checks already name (an overflowing size, a label on a
  // connector, overlapping boxes): their labels are part of that problem.
  const named = new Set(
    reported.filter((d) => LABEL_CODES.has(d.code)).flatMap((d) => d.data?.ids ?? []),
  );
  const out: Diagnostic[] = [];
  const seen = new Set<string>();
  const words = messages();
  const english = messages("en");
  // The frame's texts belong to no element.
  const subject = (owner: string) => (owner === "frame" || owner === "scene" ? null : owner);
  for (const problem of auditLabels(scene, measurer, { annotations, layers })) {
    const owner = problem.text.owner;
    const range = rangeOf(owner);
    if (named.has(owner)) continue;
    if (
      problem.kind === "overlap" &&
      problem.other.kind !== "connector" &&
      named.has(problem.other.owner)
    ) {
      continue;
    }
    const text =
      problem.text.text.length > 40 ? `${problem.text.text.slice(0, 39)}…` : problem.text.text;
    let describe: (t: LayoutWords) => string;
    let hint: string;
    if (problem.kind === "cut") {
      const { by } = problem;
      const overflow = Math.ceil(problem.overflow);
      describe = (t) => t.diagnostics.labelCut(text, subject(owner), overflow, by);
      hint = by === "picture" ? words.hints.labelCutByPicture : words.hints.labelCut;
    } else {
      const other: LabelObstacle =
        problem.other.kind === "text"
          ? {
              kind: "text",
              owner: subject(problem.other.owner),
              text: problem.other.text ?? "",
            }
          : { kind: problem.other.kind, owner: problem.other.owner };
      describe = (t) => t.diagnostics.labelOverlap(text, subject(owner), other);
      hint =
        problem.other.kind === "connector"
          ? words.hints.labelOnConnector
          : words.hints.labelOverlap;
    }
    // Problems are told apart by their English words, so every language keeps the same ones.
    const key = `${range.start.offset}|${describe(english)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      code: problem.kind === "cut" ? "layout.label-cut" : "layout.label-overlap",
      severity: "warning",
      message: describe(words),
      range,
      hints: [hint],
    });
  }
  return out;
}

/**
 * Where an element's style takes a property from, as the style resolver applies them: the last
 * `style` statement of the element that writes it, else the last class it applies that does, else
 * the last diagram rule of its kind, else the theme chain (its classes and rules) or the element's
 * declared type. `key` names that source, the same for every element it styles; `range` is the
 * property statement in the diagram's block, or the element's declaration when the theme chain or
 * the type gives it (`inherited`).
 */
function styleSource(
  diagram: FlowDiagram,
  element: Element,
  property: string,
  lines: LineIndex,
  styles: StyleResolver,
): { readonly key: string; readonly range: Range; readonly inherited: boolean } {
  const inBlock = (node: KeywordStatement, range: Range) => {
    const statement = node.block?.statements.find(
      (s) => s.kind === "KeywordStatement" && s.keyword.text === property,
    );
    const at = statement ? lines.range({ start: statement.start, end: statement.end }) : range;
    return { key: `${at.start.offset}`, range: at, inherited: false };
  };
  const kind = element.typeKind ?? element.kind;
  const own = diagram.styles.filter((entry) => entry.target === element.id);
  const written = own.filter((entry) => property in entry.properties).pop();
  if (written) return inBlock(written.node, written.range);
  const used = [...element.classes, ...own.flatMap((entry) => entry.classes)]
    .filter((use) => property in (styles.classProperties(use.name) ?? {}))
    .pop();
  const declared = used && diagram.classes.find((c) => c.id === used.name);
  if (declared) return inBlock(declared.node, declared.range);
  if (used) return { key: `class ${used.name}`, range: element.range, inherited: true };
  const rule = diagram.rules.filter((r) => r.kind === kind && property in r.properties).pop();
  if (rule) return inBlock(rule.node, rule.range);
  return { key: `kind ${kind}`, range: element.range, inherited: true };
}

/** Kinds whose icon can be the centre piece, which `labelPosition` places the label of. */
const LABEL_PLACED: ReadonlySet<string> = new Set(["node", "decision", "data", "box"]);

/**
 * `layout.icon-missing` for elements drawn as their icon without one, and
 * `layout.label-position-ignored` for a `labelPosition` that no element it styles uses (its icon
 * is not the centre piece), once per statement that writes the property, or once for a theme rule
 * or class, on the diagram's `theme` (`themeRange`).
 */
function iconDiagnostics(
  diagram: FlowDiagram,
  styles: StyleResolver,
  sizing: Sizing,
  lines: LineIndex,
  words: LayoutWords,
  themeRange: Range,
): Diagnostic[] {
  const out: Diagnostic[] = [];
  const missing = new Set<number>();
  const labels = new Map<
    string,
    { range: Range; element: string; used: boolean; placed: boolean; inherited: boolean }
  >();
  for (const element of diagram.elements) {
    const style = styles.element(element);
    if (sizing.iconShaped(element) && style.icon === undefined) {
      const { range } = styleSource(diagram, element, "shape", lines, styles);
      if (!missing.has(range.start.offset)) {
        missing.add(range.start.offset);
        out.push({
          code: "layout.icon-missing",
          severity: "warning",
          message: words.diagnostics.iconMissing(element.id),
          range,
          hints: [words.hints.iconMissing(element.id)],
          data: { ids: [element.id] },
        });
      }
    }
    if (style.labelPosition !== undefined) {
      const source = styleSource(diagram, element, "labelPosition", lines, styles);
      const known = labels.get(source.key);
      const used = sizing.iconCentrePiece(element);
      const placed = LABEL_PLACED.has(element.kind);
      if (known) {
        known.used ||= used;
        known.placed ||= placed;
      } else {
        labels.set(source.key, {
          range: source.inherited ? themeRange : source.range,
          element: element.id,
          used,
          placed,
          inherited: source.inherited,
        });
      }
    }
  }
  out.push(...verticalAlignDiagnostics(diagram, styles, sizing, lines, words, themeRange));
  for (const { range, element, used, placed, inherited } of labels.values()) {
    if (used) continue;
    out.push({
      code: "layout.label-position-ignored",
      severity: "warning",
      message: inherited
        ? words.diagnostics.labelPositionIgnoredByTheme(element)
        : words.diagnostics.labelPositionIgnored(element),
      range,
      hints: [
        !placed
          ? words.hints.labelPositionNeverUsed
          : inherited
            ? words.hints.labelPositionIgnoredByTheme
            : words.hints.labelPositionIgnored,
      ],
      data: { ids: [element] },
    });
  }
  return out;
}

/**
 * `layout.vertical-align-ignored` for a `verticalAlign` that no element it styles uses: a box whose
 * shape draws its text at a fixed spot, a box whose icon is the centre piece (its label band is at
 * `labelPosition`), or an element that is neither a box nor a sticky. Once per statement that
 * writes the property, or once for a theme rule or class, on the diagram's `theme` (`themeRange`).
 */
function verticalAlignDiagnostics(
  diagram: FlowDiagram,
  styles: StyleResolver,
  sizing: Sizing,
  lines: LineIndex,
  words: LayoutWords,
  themeRange: Range,
): Diagnostic[] {
  type Why = "fixed" | "centred" | "notBox";
  const sources = new Map<
    string,
    { range: Range; element: string; used: boolean; why: Set<Why>; inherited: boolean }
  >();
  for (const element of diagram.elements) {
    if (styles.element(element).verticalAlign === undefined) continue;
    const source = styleSource(diagram, element, "verticalAlign", lines, styles);
    const box = element.kind === "box";
    const fixed = box && FIXED_TEXT_SHAPES.has(sizing.shapeOf(element));
    const centred = box && !fixed && sizing.centred(element);
    // A sticky's text block always moves within its card.
    const used = (box && !fixed && !centred) || element.kind === "sticky";
    const why: Why | undefined = used
      ? undefined
      : fixed
        ? "fixed"
        : centred
          ? "centred"
          : "notBox";
    const known = sources.get(source.key);
    if (known) {
      known.used ||= used;
      if (why) known.why.add(why);
    } else {
      sources.set(source.key, {
        range: source.inherited ? themeRange : source.range,
        element: element.id,
        used,
        why: new Set(why ? [why] : []),
        inherited: source.inherited,
      });
    }
  }
  const out: Diagnostic[] = [];
  for (const { range, element, used, why, inherited } of sources.values()) {
    if (used) continue;
    out.push({
      code: "layout.vertical-align-ignored",
      severity: "warning",
      message: inherited
        ? words.diagnostics.verticalAlignIgnoredByTheme(element)
        : words.diagnostics.verticalAlignIgnored(element),
      range,
      hints: [
        why.has("fixed")
          ? words.hints.verticalAlignFixedShape
          : why.has("centred")
            ? words.hints.verticalAlignCentredIcon
            : words.hints.verticalAlignNeverUsed,
      ],
      data: { ids: [element] },
    });
  }
  return out;
}

/** Lays out one compiled diagram into a scene. */
function layoutDrawing(
  compilation: Compilation,
  diagram: FlowDiagram,
  options: LayoutOptions = {},
): LayoutResult {
  const diagnostics: Diagnostic[] = [];
  const lines = compilation.parse.lines;
  // Diagnostics are written in the interface language of the moment they are made.
  const words = messages();

  const written = options.theme ?? diagram.properties.theme;
  const definitions = options.themes ?? compilation.document.themes;
  const resolved = resolveTheme(written ?? options.defaultTheme ?? null, definitions);
  // A default theme that does not resolve is reported where it is configured.
  const known = resolved.known || written !== null ? resolved : resolveTheme(null, definitions);
  // An export without the branding keeps the theme and leaves its frame out.
  const theme = options.frame === "none" ? { ...known.theme, frame: "none" as const } : known.theme;
  if (!resolved.known && written !== null) {
    const fileThemes = definitions.map((t) => t.id).filter((id) => !id.includes("#"));
    diagnostics.push({
      code: "layout.unknown-theme",
      severity: "warning",
      message: words.diagnostics.unknownTheme(written, DEFAULT_THEME_NAME),
      range:
        options.theme !== undefined && options.theme !== null
          ? diagram.idRange
          : (propertyRange(diagram, "theme", lines) ?? diagram.idRange),
      hints: [words.hints.themes(Object.keys(THEMES), fileThemes)],
      data: { candidates: [...Object.keys(THEMES), ...fileThemes] },
    });
  }

  const scale = typeScale(theme);
  const metrics = new TextMetrics(options.measurer ?? estimateMeasurer, theme);
  if (diagram.type === "sequence") {
    return layoutSequence({ compilation, diagram, options, theme, scale, metrics, diagnostics });
  }
  // C4 views draw the model's entities upright; flow and free diagrams turn theirs (decision 0045).
  const turnable = diagram.type !== "c4";
  if (diagram.type === "c4") diagram = c4Drawing(diagram, options.locale ?? DEFAULT_LOCALE);
  const places = new Map<string, Point>();
  const sizes = new Map<string, { width: number; height: number }>();
  const sizeEntries = new Map<string, SizeEntry>();
  const routes = new Map<string, RouteEntry>();
  const labels = new Map<string, LabelEntry>();
  for (const entry of diagram.placement) {
    switch (entry.statement) {
      case "place":
        places.set(entry.target, { x: entry.x, y: entry.y });
        break;
      case "size":
        sizes.set(entry.target, { width: entry.width, height: entry.height });
        sizeEntries.set(entry.target, entry);
        break;
      case "route":
        routes.set(entry.target, entry);
        break;
      case "label":
        labels.set(entry.target, entry);
        break;
    }
  }

  // Free lines: the bounding box of the points written in their statement is their place and
  // size, in their parent's interior coordinates, so a group derives its size from them as from
  // its boxes; the drawn points are found once the groups are placed.
  const freeLines = diagram.elements.filter(
    (e): e is Element & { readonly line: LinePoints } => e.kind === "line" && e.line !== null,
  );
  for (const line of freeLines) {
    const box = lineBox(linePointsOf(line.line));
    places.set(line.id, boxCenter(box));
    sizes.set(line.id, { width: box.width, height: box.height });
  }
  const styles = new StyleResolver(theme, diagram);
  // Pen strokes likewise, their box grown by half their width: a group holds the whole stroke.
  const freePens = diagram.elements.filter(
    (e): e is Element & { readonly pen: PenPoints } => e.kind === "pen" && e.pen !== null,
  );
  for (const pen of freePens) {
    const box = penBox(pen.pen.points, penWidth(styles.element(pen)));
    places.set(pen.id, boxCenter(box));
    sizes.set(pen.id, { width: box.width, height: box.height });
  }

  const mode = options.layout ?? diagram.properties.layout;
  const free = diagram.type === "free";
  // Lists (`layout column|row` on a free group) place their children, elements and groups, in
  // order: a `place` on one is ignored and said so. What a list holds, at any depth, is held by
  // the outermost list around it, which an engine arranges as one box.
  const holders = free ? listHolders(diagram) : new Map<string, string>();
  const listed = new Set(
    diagram.elements
      .filter((e) => {
        const parent = parentOf(e);
        const group = parent === null ? undefined : diagram.elementsById.get(parent);
        return group !== undefined && isList(group) && listPlaces(e);
      })
      .map((e) => e.id),
  );
  for (const entry of diagram.placement) {
    if (entry.statement !== "place" || !listed.has(entry.target)) continue;
    places.delete(entry.target);
    const list = parentOf(diagram.elementsById.get(entry.target)!)!;
    diagnostics.push({
      code: "layout.place-ignored",
      severity: "warning",
      message: words.diagnostics.placeIgnored(entry.target, list),
      range: entry.range,
      hints: [words.hints.placeIgnored(entry.target, list)],
      data: { ids: [entry.target, list] },
    });
  }
  // A list is one box of the arrangement; what it holds is placed by it, or by its own `place`.
  const unplaced = diagram.elements.filter(
    (e) => (e.kind !== "group" || isList(e)) && !holders.has(e.id) && !places.has(e.id),
  );
  // Places are ignored in `auto` only when an engine arranges the diagram.
  const arranging =
    options.engine !== undefined &&
    (mode === "auto" ? true : mode === "assisted" && unplaced.length > 0);
  // What a group that is not a list holds inside a list keeps its written place in every mode:
  // no engine arranges inside a list.
  const unplacedInLists = diagram.elements.filter(
    (e) => holders.has(e.id) && !listed.has(e.id) && listPlaces(e) && !places.has(e.id),
  );
  for (const element of unplacedInLists) {
    const list = [...element.groupPath]
      .reverse()
      .find((id) => isList(diagram.elementsById.get(id)!))!;
    diagnostics.push({
      code: "layout.missing-placement",
      severity: "error",
      message: words.diagnostics.unplacedInList(element.id, parentOf(element)!, list),
      range: element.range,
      hints: [words.hints.addPlace(element.id)],
    });
  }
  // Free diagrams place children inside their group, so a group must be placed when its
  // children are, and always when nothing is arranged.
  if (free && !(arranging && mode === "auto")) {
    const placedChild = new Set(
      diagram.elements.flatMap((e) => (places.has(e.id) ? [parentOf(e) ?? ""] : [])),
    );
    const missing = diagram.elements.filter(
      (e) =>
        e.kind === "group" &&
        !places.has(e.id) &&
        !holders.has(e.id) &&
        (!arranging || placedChild.has(e.id) || unplaced.length === 0),
    );
    for (const group of missing) {
      diagnostics.push({
        code: "layout.missing-placement",
        severity: "error",
        message: words.diagnostics.groupWithoutPlace(group.id),
        range: group.range,
        hints: [words.hints.addPlace(group.id)],
      });
    }
    if (missing.length > 0 && (unplaced.length === 0 || arranging)) {
      return { scene: null, diagnostics };
    }
  }
  if (unplaced.length > 0 && !arranging) {
    if (mode === "manual") {
      // An unplaced list is a group without a place, reported above.
      for (const element of unplaced) {
        if (element.kind === "group") continue;
        diagnostics.push({
          code: "layout.missing-placement",
          severity: "error",
          message: words.diagnostics.elementWithoutPlace(element.id),
          range: element.range,
          hints: [words.hints.addPlace(element.id)],
        });
      }
    } else {
      diagnostics.push({
        code: "layout.mode-unsupported",
        severity: "error",
        message: words.diagnostics.modeUnsupported(
          mode,
          unplaced.map((e) => e.id),
        ),
        range: propertyRange(diagram, "layout", lines) ?? diagram.idRange,
        hints: [words.hints.engine],
      });
    }
    return { scene: null, diagnostics };
  }
  if (unplacedInLists.length > 0) return { scene: null, diagnostics };
  // A placed and sized group that holds nothing is a band: it stays where it is written, out of
  // the engine's request. In `auto` only bands at the top level, whose places are in diagram
  // coordinates, are kept.
  const childless = (group: Element) =>
    !diagram.elements.some((child) => child.groupPath.includes(group.id));
  const autoBands = new Set(
    diagram.elements
      .filter(
        (e) =>
          e.kind === "group" &&
          e.groupPath.length === 0 &&
          places.has(e.id) &&
          sizes.has(e.id) &&
          childless(e),
      )
      .map((e) => e.id),
  );
  if (arranging && mode === "auto") {
    // What a list holds keeps its places: the engine arranges the list as one box.
    const ignored = diagram.placement
      .filter(
        (e) =>
          (e.statement === "place" && !autoBands.has(e.target) && !holders.has(e.target)) ||
          (e.statement === "route" && e.via.length > 0),
      )
      .sort((a, b) => a.range.start.offset - b.range.start.offset)[0];
    if (ignored) {
      diagnostics.push({
        code: "layout.placement-ignored",
        severity: "warning",
        message: words.diagnostics.placementIgnored,
        range: ignored.range,
        hints: [words.hints.assisted],
      });
    }
  }

  const images = new Map<string, ResolvedImage | undefined>();
  for (const element of diagram.elements) {
    if (element.kind !== "image" || element.source === null) continue;
    const image = options.images?.resolve(element.source);
    images.set(element.id, image);
    if (!image) {
      diagnostics.push({
        code: "layout.image-unavailable",
        severity: "warning",
        message: words.diagnostics.imageUnavailable(element.source, element.id),
        range: element.sourceRange ?? element.range,
        hints: [options.images ? words.hints.imageFile : words.hints.imageHost],
      });
    }
  }
  const sizing = new Sizing(theme, scale, metrics, styles, options.icons, images, new Map(sizes));
  diagnostics.push(
    ...iconDiagnostics(
      diagram,
      styles,
      sizing,
      lines,
      words,
      propertyRange(diagram, "theme", lines) ?? diagram.idRange,
    ),
  );
  const boxes = new Map<string, Box>();
  const elementSizes = new Map<string, { width: number; height: number }>();
  for (const element of diagram.elements) {
    if (element.kind === "group") continue;
    const explicit = sizes.get(element.id);
    const size = explicit ?? sizing.defaultSize(element);
    const entry = sizeEntries.get(element.id);
    // Stickies are checked at the size they are drawn, which a list may stretch.
    if (element.kind !== "sticky" && explicit && entry) {
      sizing.checkOverflow(element, explicit, entry, diagnostics);
    }
    elementSizes.set(element.id, size);
  }
  // Turned elements: their angle, clockwise; 0 and 360 draw upright.
  const rotations = new Map<string, number>();
  if (turnable) {
    for (const element of diagram.elements) {
      if (!takesRotation(element.kind)) continue;
      const written = styles.element(element).rotation;
      const degrees = written === undefined ? 0 : ((written % 360) + 360) % 360;
      if (degrees !== 0) rotations.set(element.id, degrees);
    }
  }
  /** The outline of a turned element drawn at `box`, turned about the box's centre. */
  const turnedAt = (id: string, box: Box): Point[] => {
    const element = diagram.elementsById.get(id)!;
    const shape = element.kind === "tag" ? "pill" : sizing.shapeOf(element);
    return turnedOutline(shape, box, rotations.get(id)!, sizing.shapeOptions(element));
  };
  // Icon shapes draw their label outside their box: the engine, derived groups, the obstacles of
  // connectors and the canvas take the box with its label, its extent; the composition checks
  // take the box and the label apart.
  const outside = new Map<string, Box>();
  for (const element of diagram.elements) {
    const size = elementSizes.get(element.id);
    const label = size && sizing.outsideLabel(element, { x: 0, y: 0, ...size });
    if (label) outside.set(element.id, label.box);
  }
  /** The label outside an element's box drawn at `box`, if it has one. */
  const labelAt = (id: string, box: Box): Box | undefined => {
    const label = outside.get(id);
    return label && { ...label, x: box.x + label.x, y: box.y + label.y };
  };
  /**
   * An element's box with the label it draws outside it; for a turned element, the bounding box
   * of its turned outline and label, its drawn box.
   */
  const extentAt = (id: string, box: Box): Box => {
    const label = labelAt(id, box);
    const degrees = rotations.get(id);
    if (degrees === undefined) return label ? unionBoxes([box, label])! : box;
    const center = boxCenter(box);
    const corners = label
      ? [
          { x: label.x, y: label.y },
          { x: label.x + label.width, y: label.y },
          { x: label.x + label.width, y: label.y + label.height },
          { x: label.x, y: label.y + label.height },
        ].map((p) => turnPoint(p, center, degrees))
      : [];
    return outlineBounds([...turnedAt(id, box), ...corners]);
  };

  // Free diagrams: turn places relative to group interiors into diagram coordinates, give every
  // placed group its written or derived size, and arrange the lists. In `auto` only what the lists
  // hold keeps its places: the engine arranges each outermost list as one box.
  const autoArranged = arranging && mode === "auto";
  let frames: FreeFrames | undefined;
  if (free) {
    frames = freeFrames(
      diagram,
      autoArranged ? new Map([...places].filter(([id]) => holders.has(id))) : places,
      sizes,
      elementSizes,
      theme,
      (group) => sizing.textNeeds(group).width,
      (group) => sizing.headerOf(group),
      (id, size) =>
        outside.has(id) || rotations.has(id)
          ? extentAt(id, boxFromCenter({ x: 0, y: 0 }, size.width, size.height))
          : undefined,
    );
    // A stretched element is drawn at the size its list gives it, its outside label with it.
    for (const [id, size] of frames.stretched) {
      elementSizes.set(id, size);
      const label = sizing.outsideLabel(diagram.elementsById.get(id)!, { x: 0, y: 0, ...size });
      if (label) outside.set(id, label.box);
    }
    if (!autoArranged) {
      places.clear();
      for (const [id, center] of frames.centers) places.set(id, center);
      for (const [id, size] of frames.groupSizes) sizes.set(id, size);
    }
  }
  // A sticky never grows: its text shrinks to fit its card, written, default or stretched, or is
  // reported.
  for (const element of diagram.elements) {
    if (element.kind !== "sticky") continue;
    const range = sizeEntries.get(element.id)?.range ?? element.range;
    sizing.checkSticky(element, elementSizes.get(element.id)!, range, diagnostics);
  }
  // The outermost lists an engine arranges, as boxes of their arranged size.
  const topLists = new Map<string, { width: number; height: number }>();
  for (const element of diagram.elements) {
    const size = frames?.sizes.get(element.id);
    if (arranging && isList(element) && !holders.has(element.id) && size) {
      topLists.set(element.id, size);
    }
  }
  // The groups whose boxes follow the place an engine gave the list that holds them.
  const framedGroups = new Set<string>();

  // Positions: placed, or arranged by the engine; fixed ones never move afterwards.
  const centers = new Map<string, Point>();
  const fixed = new Set<string>();
  let engineRoutes: ReadonlyMap<string, readonly Point[]> = new Map();
  let engineGroups: ReadonlyMap<string, Box> = new Map();
  // `auto`: the written size of a group with children is the least size the engine gives it. A
  // list's written size is already in its arranged one.
  const minimums = new Map<string, { width: number; height: number }>();
  if (autoArranged) {
    for (const element of diagram.elements) {
      const size = sizes.get(element.id);
      if (
        element.kind === "group" &&
        size &&
        !childless(element) &&
        !isList(element) &&
        !holders.has(element.id)
      ) {
        minimums.set(element.id, size);
      }
    }
  }
  if (arranging) {
    // A band stays out of the request: the engine would give the empty container a slot of its
    // own and move the boxes it arranges.
    const bands = new Set(
      mode === "assisted"
        ? diagram.elements
            .filter(
              (e) => e.kind === "group" && places.has(e.id) && sizes.has(e.id) && childless(e),
            )
            .map((e) => e.id)
        : autoBands,
    );
    // Icon shapes are arranged with their label: the engine places their extent, whose centre lies
    // off their box's, and their relations end on ports along the icon's sides.
    // A turned element is arranged as its drawn box.
    const extents = new Map<string, { size: ShapeSize; extent: Box }>();
    const arranged = new Map(elementSizes);
    // A list is a box of its arranged size; a band stays out, as any band does.
    for (const [id, size] of topLists) {
      if (bands.has(id)) topLists.delete(id);
      else arranged.set(id, size);
    }
    const shifts = new Map<string, Point>();
    for (const id of new Set([...outside.keys(), ...rotations.keys()])) {
      const size = elementSizes.get(id);
      if (!size) continue;
      const extent = extentAt(id, { x: 0, y: 0, ...size });
      // Ports along an icon's sides only hold while the icon is upright.
      if (!rotations.has(id)) extents.set(id, { size, extent });
      arranged.set(id, { width: extent.width, height: extent.height });
      shifts.set(id, {
        x: extent.x + extent.width / 2 - size.width / 2,
        y: extent.y + extent.height / 2 - size.height / 2,
      });
    }
    const shifted = (id: string, point: Point, sign: 1 | -1): Point => {
      const shift = shifts.get(id);
      return shift ? { x: point.x + sign * shift.x, y: point.y + sign * shift.y } : point;
    };
    let arrangement: Arrangement;
    const request = (mirrored: ReadonlySet<string>) =>
      arrangeRequest(
        diagram,
        arranged,
        mode === "assisted"
          ? new Map([...places].map(([id, place]) => [id, shifted(id, place, 1)]))
          : new Map(),
        routes,
        theme,
        (group) => sizing.headerOf(group),
        (relation) => labelSize(relation, metrics, sizing.relationPill(relation)),
        bands,
        minimums,
        extents,
        mirrored,
        holders,
      );
    try {
      arrangement = options.engine!.arrange(request(new Set()));
      // The ports of icon shapes face the flow; a relation the engine turns back would wrap
      // around the diagram to reach them, so it is arranged again with its ports facing back,
      // and the shorter routes are kept.
      const backward = backwardAtIcons(diagram, arrangement, arranged, extents, bands, routes);
      if (backward.size > 0) {
        const again = options.engine!.arrange(request(backward));
        if (routesLength(again) < routesLength(arrangement)) arrangement = again;
      }
    } catch (error) {
      diagnostics.push({
        code: "layout.engine-failed",
        severity: "error",
        message: words.diagnostics.engineFailed(options.engine!.name, (error as Error).message),
        range: propertyRange(diagram, "layout", lines) ?? diagram.idRange,
      });
      return { scene: null, diagnostics };
    }
    if (shifts.size > 0) {
      arrangement = {
        ...arrangement,
        centers: new Map(
          [...arrangement.centers].map(([id, center]) => [id, shifted(id, center, -1)]),
        ),
      };
    }
    if (mode === "auto") {
      for (const [id, center] of arrangement.centers) centers.set(id, center);
      // A relation to what a list holds was arranged to the list: its own route is drawn.
      const held = (key: string) => {
        const relation = diagram.relationsByKey.get(key);
        return relation !== undefined && (holders.has(relation.from) || holders.has(relation.to));
      };
      engineRoutes = new Map([...arrangement.routes].filter(([key]) => !held(key)));
      engineGroups = arrangement.groups ?? new Map();
    } else {
      // Boxes to position: the leaves and the lists; what an unplaced list holds follows it.
      const positioned = new Map(
        [...elementSizes].filter(([id]) => !holders.has(id) || places.has(id)),
      );
      for (const [id, size] of topLists) positioned.set(id, size);
      placeAround(diagram, arrangement, places, positioned, centers, fixed, (id, box) =>
        extentAt(id, box),
      );
    }
    // The lists the engine arranged: what they hold is where they put it, and fixed there.
    for (const id of topLists.keys()) {
      const center = centers.get(id);
      if (!center || (mode === "assisted" && places.has(id))) continue;
      for (const [inner, at] of frames!.within(id, center)) {
        if (diagram.elementsById.get(inner)!.kind === "group") {
          places.set(inner, at);
          sizes.set(inner, frames!.sizes.get(inner)!);
          framedGroups.add(inner);
        } else {
          centers.set(inner, at);
          fixed.add(inner);
        }
      }
    }
  } else {
    for (const [id, place] of places) centers.set(id, place);
    for (const element of diagram.elements) fixed.add(element.id);
  }

  // Strong constraints: free boxes move until they hold; what cannot hold is a conflict.
  const solverBoxes = new Map<string, SolverBox>();
  for (const [id, size] of elementSizes) {
    const center = centers.get(id);
    if (center) solverBoxes.set(id, { center, ...size, fixed: fixed.has(id) });
  }
  const before = new Map([...solverBoxes].map(([id, b]) => [id, b.center]));
  const defaultAxis =
    diagram.properties.direction === "TB" || diagram.properties.direction === "BT"
      ? "vertical"
      : "horizontal";
  for (const conflict of solveConstraints(
    diagram.constraints,
    solverBoxes,
    defaultAxis,
    ENGINE_SPACING.node,
  )) {
    diagnostics.push({
      code: "layout.constraint-conflict",
      severity: "error",
      message: conflict.message,
      range: conflict.entry.range,
      hints: [words.hints.constraint],
    });
  }
  const movedByConstraints = new Set<string>();
  for (const [id, box] of solverBoxes) {
    if (box.center !== before.get(id)) movedByConstraints.add(id);
    const size = elementSizes.get(id)!;
    boxes.set(id, boxFromCenter(box.center, size.width, size.height));
  }

  const groups = diagram.elements
    .filter((e) => e.kind === "group")
    .sort((a, b) => b.groupPath.length - a.groupPath.length);
  const explicitGroups = new Set<string>();
  for (const group of groups) {
    const arranged =
      mode === "auto" && arranging && !autoBands.has(group.id) && !framedGroups.has(group.id);
    const place = arranged ? undefined : places.get(group.id);
    const size = arranged ? undefined : sizes.get(group.id);
    if (place && size) {
      const entry = sizeEntries.get(group.id);
      if (entry) sizing.checkOverflow(group, size, entry, diagnostics);
      boxes.set(group.id, boxFromCenter(place, size.width, size.height));
      explicitGroups.add(group.id);
      continue;
    }
    if (place || size) {
      diagnostics.push({
        code: "layout.missing-placement",
        severity: "error",
        message: words.diagnostics.groupHalfPlaced(group.id, place ? "place" : "size"),
        range: group.range,
      });
      continue;
    }
    const children = diagram.elements
      .filter((e) => e.groupPath.includes(group.id))
      .map((e) => {
        const box = boxes.get(e.id);
        return box && extentAt(e.id, box);
      })
      .filter((b): b is Box => b !== undefined);
    const union = unionBoxes(children);
    if (!union) {
      diagnostics.push({
        code: "layout.missing-placement",
        severity: "error",
        message: words.diagnostics.groupUnplaced(group.id),
        range: group.range,
        hints: [words.hints.addPlaceAndSize(group.id)],
      });
      continue;
    }
    const derived = expandBox(
      union,
      theme.groupPadding,
      sizing.headerOf(group),
      theme.groupPadding,
      theme.groupPadding,
    );
    // The title is left-aligned; a wider title widens the band to the right.
    const titleWidth = sizing.textNeeds(group).width;
    const fitted = { ...derived, width: Math.max(derived.width, titleWidth) };
    const minimum = minimums.get(group.id);
    if (!minimum) {
      boxes.set(group.id, fitted);
      continue;
    }
    // A sized group is drawn at the engine's box, which holds its children and is at least its
    // written size; an engine that gives no box, or a smaller one, leaves it grown about its centre.
    const engineBox = engineGroups.get(group.id);
    const box = engineBox ? unionBoxes([engineBox, fitted])! : fitted;
    const width = Math.max(box.width, minimum.width);
    const height = Math.max(box.height, minimum.height);
    boxes.set(
      group.id,
      width === box.width && height === box.height
        ? box
        : boxFromCenter(boxCenter(box), width, height),
    );
  }
  if (diagnostics.some((d) => d.severity === "error" && d.code !== "layout.constraint-conflict")) {
    return { scene: null, diagnostics };
  }
  const origins = new Map<string, Point>();
  if (free) {
    for (const element of diagram.elements) {
      const parent = parentOf(element);
      const group = parent === null ? undefined : diagram.elementsById.get(parent);
      const area = group && boxes.get(group.id);
      if (group && area) {
        const header = sizing.headerOf(group);
        origins.set(element.id, { x: area.x + theme.groupPadding, y: area.y + header });
      }
    }
  }
  // Free lines: their written points moved by their parent's interior origin, in diagram
  // coordinates; their box is the bounding box of those points.
  const lineAnchors = new Map<string, Point[]>();
  for (const line of freeLines) {
    const origin = origins.get(line.id) ?? { x: 0, y: 0 };
    const points = linePointsOf(line.line).map((p) => ({ x: p.x + origin.x, y: p.y + origin.y }));
    lineAnchors.set(line.id, points);
    boxes.set(line.id, lineBox(points));
    if (points.every((p) => p.x === points[0]!.x && p.y === points[0]!.y)) {
      diagnostics.push({
        code: "layout.degenerate-line",
        severity: "warning",
        message: words.diagnostics.degenerateLine(line.id),
        range: line.range,
        hints: [words.hints.lineEnds],
      });
    }
  }
  // Pen strokes: their written points moved by their parent's interior origin; their box is the
  // bounding box of those points grown by half their width, which they draw within.
  const penGeometry = new Map<string, PenGeometry>();
  for (const pen of freePens) {
    const origin = origins.get(pen.id) ?? { x: 0, y: 0 };
    const points = pen.pen.points.map((p) => ({ x: p.x + origin.x, y: p.y + origin.y }));
    const width = penWidth(styles.element(pen));
    const bounds = penBox(points, width);
    boxes.set(pen.id, bounds);
    penGeometry.set(pen.id, { points, bounds, width });
  }
  // The drawn shape of every element box, and the outline of those that are not their box; a
  // turned element's outline is turned, and its drawn box is the bounding box of that outline.
  const shapes = new Map<string, BoxShape>();
  const outlines = new Map<string, readonly Point[]>();
  const turnedBoxes = new Map<string, Box>();
  for (const element of diagram.elements) {
    const box = boxes.get(element.id);
    if (element.kind === "group" || element.kind === "line" || element.kind === "pen" || !box) {
      continue;
    }
    const shape = element.kind === "tag" ? "pill" : sizing.shapeOf(element);
    shapes.set(element.id, shape);
    if (rotations.has(element.id)) {
      const turned = turnedAt(element.id, box);
      outlines.set(element.id, turned);
      turnedBoxes.set(element.id, outlineBounds(turned));
    } else if (isOutlined(shape)) {
      outlines.set(element.id, shapeOutline(shape, box, sizing.shapeOptions(element)).points);
    }
  }
  /** An end found on a side of an element's box, moved onto the outline of its shape. */
  const outlineEnd = (id: string, point: Point, known: Side): Point => {
    const turned = turnedBoxes.get(id);
    if (turned) {
      // On a turned element: from the side of its drawn box onto its turned outline. A named port
      // or a pinned point already lies on that outline and stays.
      const side = onSide(turned, point, known) ? known : sideOfPoint(turned, point);
      return onSide(turned, point, side) ? onPolygon(outlines.get(id)!, point, side) : point;
    }
    const shape = shapes.get(id);
    const box = boxes.get(id);
    if (!shape || !box || !isOutlined(shape)) return point;
    const side = onSide(box, point, known) ? known : sideOfPoint(box, point);
    if (!onSide(box, point, side)) return point;
    return onOutline(shape, box, point, side, sizing.shapeOptions(diagram.elementsById.get(id)!));
  };

  /**
   * The boxes a connector should not cross: the other shapes of its layer, but not its ends, the
   * groups that hold them, nor a shape that contains an end box (a box it is stacked inside).
   */
  const shapeIds = diagram.elements.filter(
    (e) => e.kind !== "group" && e.kind !== "tag" && e.kind !== "line" && e.kind !== "pen",
  );
  const obstaclesFor = (relation: Relation): Box[] => {
    const ends = [relation.from, relation.to];
    const holders = new Set(
      ends.flatMap((id) => [id, ...(diagram.elementsById.get(id)?.groupPath ?? [])]),
    );
    const endBoxes = ends.flatMap((id) => boxes.get(id) ?? []);
    const layer = relation.layer ?? MAIN_LAYER;
    return shapeIds
      .filter((e) => !holders.has(e.id) && boxes.has(e.id) && (e.layer ?? MAIN_LAYER) === layer)
      .map((e) => extentAt(e.id, boxes.get(e.id)!))
      .filter((box) => !endBoxes.some((end) => containsBox(box, end)));
  };
  /** The label each icon shape draws outside its box, as its own connectors meet it. */
  const ownLabels = new Map<string, OwnLabel>();
  for (const [id, box] of boxes) {
    const label = labelAt(id, box);
    if (!label || rotations.has(id)) continue;
    ownLabels.set(id, {
      box: expandBox(label, TITLE_GAP, TITLE_GAP, TITLE_GAP, TITLE_GAP),
      side: LABEL_SIDES[sizing.labelSide(diagram.elementsById.get(id)!)],
    });
  }

  // Relations with labels sit a label apart, so their pills do not overlap.
  const laneSpacing = (relation: Relation) => {
    if (relation.label === null && !relation.technology) return LANE_SPACING;
    const pill = sizing.relationPill(relation).scale;
    return (
      pill.relationLabelHeight +
      (relation.technology ? Math.round(technologySize(pill.relationLabel) * 1.25) : 0) +
      4
    );
  };
  /** Labels placed by the layout, which may slide along their connectors to stay clear. */
  const movable: { index: number; along: readonly Point[]; width: number; height: number }[] = [];
  // Named ports and compass sides with a position are points of the box.
  const end = (element: string, endpoint: RouteEndpoint | undefined): ConnectorEnd => {
    const port = endpoint?.port ?? "auto";
    const definition = endpoint?.named
      ? diagram.elementsById.get(element)?.ports.find((p) => p.name === port)
      : undefined;
    const point = definition
      ? { side: definition.side, position: definition.position }
      : endpoint?.position !== undefined && port !== "auto"
        ? { side: port as PortSide, position: endpoint.position }
        : null;
    const box = boxes.get(element)!;
    const degrees = rotations.get(element);
    if (degrees === undefined) return { box, port, named: point };
    // A turned element: free ends route to its drawn box; a named port, a pinned point or a
    // compass side is found on its own frame and turned with it.
    const drawn = turnedBoxes.get(element)!;
    const local =
      point ?? (SIDES.includes(port as Side) ? { side: port as Side, position: 0.5 } : null);
    if (!local) return { box: drawn, port: "auto", named: null };
    const own = diagram.elementsById.get(element)!;
    const shape = shapes.get(element)!;
    const atSide = portPoint(box, local.side, local.position);
    const onShape = isOutlined(shape)
      ? onOutline(shape, box, atSide, local.side, sizing.shapeOptions(own))
      : atSide;
    const at = turnPoint(onShape, boxCenter(box), degrees);
    const normal = turnPoint(sideNormal(local.side), { x: 0, y: 0 }, degrees);
    const side = [...SIDES].sort((a, b) => {
      const na = sideNormal(a);
      const nb = sideNormal(b);
      return nb.x * normal.x + nb.y * normal.y - (na.x * normal.x + na.y * normal.y);
    })[0]!;
    const along =
      side === "north" || side === "south"
        ? (at.x - drawn.x) / Math.max(1, drawn.width)
        : (at.y - drawn.y) / Math.max(1, drawn.height);
    return {
      box: drawn,
      port: side,
      named: { side, position: Math.min(1, Math.max(0, along)), point: at },
    };
  };
  const ignoreVia = arranging && mode === "auto";
  /**
   * An engine's route whose ends at icon shapes, on the sides of their extent, move along their
   * last segments onto the icon's square; undefined when an end cannot.
   */
  const ontoIcons = (relation: Relation, route: readonly Point[]): Point[] | undefined => {
    let points = [...route];
    for (const [id, end] of [
      [relation.from, "first"],
      [relation.to, "last"],
    ] as const) {
      if (!outside.has(id) || rotations.has(id)) continue;
      const box = boxes.get(id)!;
      points = snapEnd(points, box, end);
      const tip = points[end === "first" ? 0 : points.length - 1]!;
      if (!SIDES.some((side) => onSide(box, tip, side, 0.5))) return undefined;
    }
    return points;
  };
  // Each relation's ends, waypoints and kind, and whether it follows the engine's route.
  const plans: RelationPlan[] = diagram.relations.map((relation) => {
    const route = routes.get(relation.key);
    const style = styles.relation(relation);
    const kind = style.routing ?? diagram.properties.routing;
    const written = engineRoutes.get(relation.key);
    const engineRoute =
      written && (outside.has(relation.from) || outside.has(relation.to))
        ? ontoIcons(relation, written)
        : written;
    const useEngine =
      engineRoute !== undefined &&
      engineRoute.length >= 2 &&
      !movedByConstraints.has(relation.from) &&
      !movedByConstraints.has(relation.to);
    return {
      relation,
      route,
      style,
      kind,
      fromEnd: end(relation.from, route?.from),
      toEnd: end(relation.to, route?.to),
      via: ignoreVia ? [] : (route?.via ?? []),
      engineRoute,
      // The engine's routes are orthogonal; straight and curved connectors join the anchors.
      followEngine: useEngine && (kind === "auto" || kind === "orthogonal"),
    };
  });
  // Free ends that share a side take lanes along it; parallel relations between the same two
  // boxes keep theirs straight and are not rerouted around obstacles.
  const lanes = endLanes(plans, laneSpacing);
  const parallel = parallelLanes(diagram, routes, laneSpacing);
  const relationGeometry: RelationGeometry[] = plans.map((plan, index) => {
    const { relation, style, kind, fromEnd, toEnd, via, engineRoute, followEngine } = plan;
    let anchors = anchorPoints(fromEnd, toEnd, via, lanes.get(relation.key) ?? 0);
    let points = followEngine ? [...engineRoute!] : anchors.points;
    if (followEngine) {
      // Groups are drawn around their children, which can leave them smaller than the engine's
      // container: the route's ends move along their first and last segments onto the border.
      if (diagram.elementsById.get(relation.from)?.kind === "group") {
        points = snapEnd(points, boxes.get(relation.from)!, "first");
      }
      if (diagram.elementsById.get(relation.to)?.kind === "group") {
        points = snapEnd(points, boxes.get(relation.to)!, "last");
      }
    } else {
      points = shapeRoute(
        kind,
        anchors.points,
        { first: anchors.points[0]!, last: anchors.points[anchors.points.length - 1]!, via },
        anchors.fromSide,
        anchors.toSide,
      );
    }
    // The target's head is the style's, else none for a line (`--`, `---`), else the theme's; the
    // source's is the style's, else the target's for a two-way arrow, else none.
    const endKind = style.arrowhead ?? (relation.heads === "none" ? "none" : theme.arrowhead);
    const startKind = style.arrowtail ?? (relation.heads === "both" ? endKind : "none");
    const headWidth = (theme.arrowSize * 7) / 8;
    // The labels icon shapes draw beside their ends: a connector passes under its own end's label
    // only straight from the icon and on beyond it, far enough for its head; elsewhere the label
    // is in its way as another shape is.
    const ownEnds = [
      relation.from === relation.to ? undefined : ownLabels.get(relation.from),
      relation.from === relation.to ? undefined : ownLabels.get(relation.to),
    ] as const;
    const rooms = [startKind, endKind].map((head) => markerReach(head, theme.arrowSize) + 2) as [
      number,
      number,
    ];
    const orthogonal = kind === "auto" || kind === "orthogonal" || followEngine;
    const own = (route: readonly Point[]) => ownLabelCrossings(route, ownEnds, rooms, orthogonal);
    // A route without waypoints that runs through another shape, or through its own end's label,
    // goes around it when it can: between side middles when both ends are free, else from its own
    // ends.
    const reroutable =
      (kind === "auto" || kind === "orthogonal") &&
      via.length === 0 &&
      (parallel.get(relation.key) ?? 0) === 0 &&
      points.length >= 2;
    if (reroutable) {
      const obstacles = obstaclesFor(relation);
      const crossings = (route: readonly Point[]) =>
        crossedBoxes(route, obstacles).length + own(route);
      let crossed = crossings(points);
      // The engine's points carry no sides: they are read from the borders the ends lie on.
      let engineSides = followEngine;
      if (crossed > 0 && fromEnd.port === "auto" && toEnd.port === "auto") {
        const around = avoidingRoute(fromEnd.box, toEnd.box, obstacles, points, own);
        if (around) {
          points = around.points;
          anchors = { points: around.points, fromSide: around.fromSide, toSide: around.toSide };
          crossed = crossings(points);
          engineSides = false;
        }
      }
      if (crossed > 0) {
        const first = points[0]!;
        const last = points[points.length - 1]!;
        const fromSide = engineSides ? sideOfPoint(fromEnd.box, first) : anchors.fromSide;
        const toSide = engineSides ? sideOfPoint(toEnd.box, last) : anchors.toSide;
        // An end on its label's side leaves from beyond the label, the icon and the label one box.
        const detourEnd = (box: Box, point: Point, side: Side, label: OwnLabel | undefined) => {
          const normal = sideNormal(side);
          const away = { x: point.x + normal.x * 1e6, y: point.y + normal.y * 1e6 };
          const beyond =
            label?.side === side ? underLabel([point, away], "first", label, 0, true) : undefined;
          return beyond
            ? { box: unionBoxes([box, label!.box])!, point: beyond, side }
            : { box, point, side };
        };
        const detour = detourRoute(
          detourEnd(fromEnd.box, first, fromSide, ownEnds[0]),
          detourEnd(toEnd.box, last, toSide, ownEnds[1]),
          [...obstacles, ...ownEnds.flatMap((label) => (label ? [label.box] : []))],
        );
        if (detour) {
          // The run from the icon to beyond its label is straight: the route starts at the icon.
          detour[0] = first;
          detour[detour.length - 1] = last;
          if (crossings(detour) < crossed) {
            points = detour;
            anchors = { points: detour, fromSide, toSide };
          }
        }
      }
    }
    // Every end was found on a side of its box; on a shaped box it moves onto the outline.
    points = [...points];
    points[0] = outlineEnd(relation.from, points[0]!, anchors.fromSide);
    points[points.length - 1] = outlineEnd(relation.to, points[points.length - 1]!, anchors.toSide);
    // A run under its own end's label is drawn from beyond the label, its head there, clear of the
    // text; `points` keeps the end on the icon for editors.
    const drawn = beyondOwnLabels(points, ownEnds, rooms, orthogonal);
    let line: Point[];
    let startHead: MarkerPart[];
    let endHead: MarkerPart[];
    let curve: string | undefined;
    if (kind === "bezier") {
      // Each head sits on the curve's tangent, which leaves and enters along the side normals.
      const approach = (tip: Point, side: Side): Point[] => {
        const normal = sideNormal(side);
        return [{ x: tip.x + normal.x * 10, y: tip.y + normal.y * 10 }, tip];
      };
      const atEnd = endMarker(
        approach(drawn[drawn.length - 1]!, anchors.toSide),
        endKind,
        theme.arrowSize,
        headWidth,
      );
      const atStart = endMarker(
        approach(drawn[0]!, anchors.fromSide),
        startKind,
        theme.arrowSize,
        headWidth,
      );
      const bezier = bezierThrough(
        drawn,
        anchors.fromSide,
        anchors.toSide,
        atEnd.line[atEnd.line.length - 1]!,
        atStart.line[atStart.line.length - 1]!,
      );
      line = bezier.samples;
      startHead = atStart.parts;
      endHead = atEnd.parts;
      curve = bezier.d;
    } else {
      const ends = relationEnds(drawn, startKind, endKind, theme.arrowSize, headWidth);
      line =
        (style.corners ?? theme.corners) === "rounded"
          ? roundCorners(ends.line, CORNER_RADIUS)
          : ends.line;
      startHead = ends.start;
      endHead = ends.end;
    }
    let label: RelationGeometry["label"];
    const icon = sizing.relationIcon(relation);
    const technology = relation.technology ? `[${relation.technology}]` : null;
    if (relation.label !== null || icon || technology) {
      const entry = labels.get(relation.key);
      const at = entry ? entry.at / 100 : 0.5;
      const offset = entry ? entry.offset : { x: 0, y: 0 };
      const center = pointAlong(curve ? line : drawn, at);
      const text = relation.label ?? "";
      const pill = sizing.relationPill(relation);
      const pillScale = pill.scale;
      const textWidth =
        text === "" ? 0 : metrics.width(text, pill.font, pill.weight, pillScale.relationLabel);
      const iconWidth = icon ? icon.size + (text === "" ? 0 : icon.gap) : 0;
      // C4 relations show their technology on a second, smaller line.
      const techSize = technologySize(pillScale.relationLabel);
      const techWidth = technology ? metrics.width(technology, pill.font, 400, techSize) : 0;
      const width = Math.max(textWidth + iconWidth, techWidth) + pillScale.relationLabelPadding;
      const height = pillScale.relationLabelHeight + (technology ? Math.round(techSize * 1.25) : 0);
      if (!entry) {
        movable.push({
          index,
          along: curve ? line : drawn,
          width: Math.max(width, pillScale.relationLabelHeight),
          height,
        });
      }
      label = {
        box: boxFromCenter(
          { x: center.x + offset.x, y: center.y + offset.y },
          Math.max(width, pillScale.relationLabelHeight),
          height,
        ),
        text,
        technology,
      };
    }
    const connector: ConnectorGeometry = {
      points,
      line,
      fromSide: anchors.fromSide,
      toSide: anchors.toSide,
      via,
    };
    return { relation, line, start: startHead, end: endHead, label, curve, connector };
  });

  // Free lines: connectors without ends, routed through their own points (`polyline` unless a
  // route kind is written; `auto` is `polyline`, there being no box to anchor to), with no lanes,
  // detours or gaps, their heads `none` unless written, and a pill as a relation's.
  const lineGeometry = new Map<string, LineGeometry>();
  for (const element of freeLines) {
    const anchors = lineAnchors.get(element.id)!;
    const style = styles.element(element);
    const written = style.routing ?? "polyline";
    const kind = written === "auto" ? "polyline" : written;
    const points = kind === "orthogonal" ? orthogonalThrough(anchors) : [...anchors];
    const last = points.length - 1;
    const fromSide = sideToward(points[0]!, points[Math.min(1, last)]!);
    const toSide = sideToward(points[last]!, points[Math.max(0, last - 1)]!);
    const endKind = style.arrowhead ?? "none";
    const startKind = style.arrowtail ?? "none";
    const headWidth = (theme.arrowSize * 7) / 8;
    let line: Point[];
    let start: MarkerPart[];
    let end: MarkerPart[];
    let curve: string | undefined;
    if (kind === "bezier" && points.length > 1) {
      const approach = (tip: Point, side: Side): Point[] => {
        const normal = sideNormal(side);
        return [{ x: tip.x + normal.x * 10, y: tip.y + normal.y * 10 }, tip];
      };
      const atEnd = endMarker(approach(points[last]!, toSide), endKind, theme.arrowSize, headWidth);
      const atStart = endMarker(
        approach(points[0]!, fromSide),
        startKind,
        theme.arrowSize,
        headWidth,
      );
      const bezier = bezierThrough(
        points,
        fromSide,
        toSide,
        atEnd.line[atEnd.line.length - 1]!,
        atStart.line[atStart.line.length - 1]!,
      );
      line = bezier.samples;
      start = atStart.parts;
      end = atEnd.parts;
      curve = bezier.d;
    } else {
      const ends = relationEnds(points, startKind, endKind, theme.arrowSize, headWidth);
      line =
        (style.corners ?? theme.corners) === "rounded"
          ? roundCorners(ends.line, CORNER_RADIUS)
          : ends.line;
      start = ends.start;
      end = ends.end;
    }
    let label: LineGeometry["label"];
    const icon = sizing.lineIcon(element);
    if (element.label !== "" || icon) {
      const entry = labels.get(element.id);
      const at = entry ? entry.at / 100 : 0.5;
      const offset = entry ? entry.offset : { x: 0, y: 0 };
      const center = pointAlong(curve ? line : points, at);
      const text = element.label;
      const pill = sizing.linePill(element);
      const textWidth =
        text === "" ? 0 : metrics.width(text, pill.font, pill.weight, pill.scale.relationLabel);
      const iconWidth = icon ? icon.size + (text === "" ? 0 : icon.gap) : 0;
      const width = textWidth + iconWidth + pill.scale.relationLabelPadding;
      label = {
        box: boxFromCenter(
          { x: center.x + offset.x, y: center.y + offset.y },
          Math.max(width, pill.scale.relationLabelHeight),
          pill.scale.relationLabelHeight,
        ),
        text,
      };
    }
    lineGeometry.set(element.id, {
      element,
      line,
      start,
      end,
      label,
      curve,
      connector: { points, line, fromSide, toSide, via: anchors.slice(1, -1) },
    });
  }

  // Pen strokes: their heads along their end segments, none unless written, which the stroke
  // stops at as a line does; a dot has none. A point written twice in a row makes no segment, so
  // the heads and the cut are taken from the stroke without repeats.
  const penDrawing = new Map<string, PenDrawing>();
  for (const pen of freePens) {
    const { points, width } = penGeometry.get(pen.id)!;
    const style = styles.element(pen);
    const endKind = style.arrowhead ?? "none";
    const startKind = style.arrowtail ?? "none";
    if (isDot(points) || (endKind === "none" && startKind === "none")) {
      penDrawing.set(pen.id, { line: points, start: [], end: [] });
      continue;
    }
    const length = penHeadLength(theme.arrowSize, width);
    const ends = relationEnds(withoutRepeats(points), startKind, endKind, length, (length * 7) / 8);
    penDrawing.set(pen.id, { line: ends.line, start: ends.start, end: ends.end });
  }

  // Every element's box with the label it draws outside it, in diagram coordinates.
  const extents = new Map([...boxes].map(([id, box]) => [id, extentAt(id, box)]));
  // A line's box is no obstacle: labels may sit beside it as beside any connector; nor is a pen's.
  const shapeExtents = new Map(
    [...extents].filter(([id]) => !lineGeometry.has(id) && !penGeometry.has(id)),
  );
  placeLabels(relationGeometry, movable, labelObstacles(diagram, shapeExtents, sizing));
  const elementLabels = new Map<string, Box>();
  for (const [id, box] of boxes) {
    const label = labelAt(id, box);
    // A turned label lies in its element's drawn box, which the checks compare.
    if (label && !rotations.has(id)) elementLabels.set(id, label);
  }

  // Turned elements are checked by their drawn box.
  const checked = new Map([...boxes].map(([id, box]) => [id, extentAt(id, box)]));
  for (const [id, box] of boxes) if (!rotations.has(id)) checked.set(id, box);
  // Lines and pen strokes cross boxes by design: they take no part in the composition checks.
  for (const id of lineGeometry.keys()) checked.delete(id);
  for (const id of penGeometry.keys()) checked.delete(id);
  diagnostics.push(
    ...checkComposition(
      diagram,
      checked,
      relationGeometry.map((g) => ({
        relation: g.relation,
        points: g.line,
        curved: g.curve !== undefined,
        label: g.label?.box,
      })),
      explicitGroups,
      theme,
      (group) => sizing.untitled(group),
      outlines,
      elementLabels,
      (group) => sizing.headerOf(group),
    ),
  );

  const everything: Box[] = [...extents.values()];
  for (const geometry of relationGeometry) {
    for (const p of [
      ...geometry.line,
      ...markerPoints(geometry.start),
      ...markerPoints(geometry.end),
    ])
      everything.push({ x: p.x, y: p.y, width: 0, height: 0 });
    if (geometry.label) everything.push(geometry.label.box);
  }
  for (const geometry of lineGeometry.values()) {
    for (const p of [...markerPoints(geometry.start), ...markerPoints(geometry.end)])
      everything.push({ x: p.x, y: p.y, width: 0, height: 0 });
    if (geometry.label) everything.push(geometry.label.box);
  }
  // A pen's box holds its stroke; its heads may reach beyond it.
  for (const drawing of penDrawing.values()) {
    for (const p of [...markerPoints(drawing.start), ...markerPoints(drawing.end)])
      everything.push({ x: p.x, y: p.y, width: 0, height: 0 });
  }
  const bounds = unionBoxes(everything) ?? { x: 0, y: 0, width: 0, height: 0 };
  const margin = theme.margin;
  const contentWidth = Math.ceil(bounds.width + 2 * margin);
  const contentHeight = Math.ceil(bounds.height + 2 * margin);
  const framed = theme.frame !== "none";
  const frameHeight = framed ? scale.frameHeight : 0;
  // The content canvas: the content and its margins, plus the frame strip.
  const naturalWidth = framed
    ? Math.max(contentWidth, frameMinWidth(theme, scale, diagram.properties.title, metrics))
    : contentWidth;
  const naturalHeight = contentHeight + frameHeight;
  const canvas = canvasSize(diagram, naturalWidth, naturalHeight, lines, diagnostics);
  const width = canvas.width;
  const height = canvas.height;
  const frameTop = theme.frame === "header" ? frameHeight : 0;
  const dx = margin - bounds.x + Math.floor((width - contentWidth) / 2);
  const dy = margin - bounds.y + frameTop + Math.floor((height - frameHeight - contentHeight) / 2);
  const shift = (box: Box): Box => ({
    x: box.x + dx,
    y: box.y + dy,
    width: box.width,
    height: box.height,
  });
  const shiftPoint = (p: Point): Point => ({ x: p.x + dx, y: p.y + dy });

  const items: SceneItem[] = [];
  const gradients: SceneGradient[] = [];
  const emitter = new Emitter(
    theme,
    scale,
    styles,
    metrics,
    sizing,
    free,
    diagram.elementsById,
    diagram.id,
  );
  const drawRelation = (geometry: RelationGeometry) =>
    emitter.relation(
      geometry.relation,
      geometry.line.map(shiftPoint),
      shiftMarker(geometry.start, shiftPoint),
      shiftMarker(geometry.end, shiftPoint),
      geometry.label
        ? {
            box: shift(geometry.label.box),
            text: geometry.label.text,
            technology: geometry.label.technology,
          }
        : undefined,
      geometry.curve ? translatePath(geometry.curve, dx, dy) : undefined,
    );
  // Groups of elements and relations carry their layer, so hosts can address it.
  const onLayer = (group: GroupItem, layer: string | null): GroupItem =>
    layer !== null && layer !== MAIN_LAYER ? { ...group, layer } : group;
  /** A turned element's group, turned about the centre of its box in scene coordinates. */
  const turn = (group: GroupItem, box: Box): GroupItem => {
    const degrees = rotations.get(group.id);
    if (degrees === undefined) return group;
    const c = boxCenter(box);
    return { ...group, transform: `rotate(${round(degrees)} ${round(c.x)} ${round(c.y)})` };
  };
  /**
   * An attached note's leader: a dotted polyline from where the segment between the two boxes'
   * centres leaves the note to where it enters its element's outline (turned with the element),
   * the last item of the note's group. None when the target is not drawn or the boxes overlap. A
   * turned note's group turns its items, so the leader is written in the note's own frame.
   */
  const withLeader = (group: GroupItem, element: Element, box: Box): GroupItem => {
    const targetId = element.attachedTo;
    const target = targetId === null ? undefined : diagram.elementsById.get(targetId);
    const placed = target && target.id !== element.id ? boxes.get(target.id) : undefined;
    if (!target || !placed) return group;
    const targetBox = shift(placed);
    const overlaps =
      box.x < targetBox.x + targetBox.width &&
      targetBox.x < box.x + box.width &&
      box.y < targetBox.y + targetBox.height &&
      targetBox.y < box.y + box.height;
    if (overlaps) return group;
    const own = rotations.get(element.id) ?? 0;
    const turnedTarget = rotations.get(target.id) ?? 0;
    const shapeOf = (e: Element): BoxShape =>
      e.kind === "tag" ? "pill" : e.kind === "group" ? "rectangle" : sizing.shapeOf(e);
    const centres = { note: boxCenter(box), target: boxCenter(targetBox) };
    const from = boundaryToward("rectangle", box, own, centres.target);
    const to = boundaryToward(
      shapeOf(target),
      targetBox,
      turnedTarget,
      centres.note,
      sizing.shapeOptions(target),
    );
    const local = (p: Point): Point => (own === 0 ? p : turnPoint(p, centres.note, -own));
    const leader: PolylineItem = {
      kind: "polyline",
      points: [from, to].map(local).map((p) => ({ x: round(p.x), y: round(p.y) })),
      stroke: theme.muted,
      strokeWidth: theme.strokeWidth,
      dashed: "dotted",
      className: "leader",
    };
    return { ...group, items: [...group.items, leader] };
  };
  /** An element's drawing, turned when it is, with the leader of a note attached to something. */
  const elementGroup = (element: Element, box: Box): GroupItem => {
    const drawn = turn(emitter.element(element, box), box);
    return element.kind === "note" && element.attachedTo !== null
      ? withLeader(drawn, element, box)
      : drawn;
  };
  if (free) {
    const byKey = new Map(relationGeometry.map((g) => [g.relation.key, g]));
    for (const paintable of paintOrder(diagram)) {
      if (paintable.kind === "relation") {
        const geometry = byKey.get(paintable.relation.key);
        if (geometry) items.push(onLayer(drawRelation(geometry), paintable.relation.layer));
        continue;
      }
      const box = shift(boxes.get(paintable.element.id)!);
      const line = lineGeometry.get(paintable.element.id);
      if (line) {
        items.push(
          onLayer(
            emitter.line(
              line.element,
              box,
              line.line.map(shiftPoint),
              shiftMarker(line.start, shiftPoint),
              shiftMarker(line.end, shiftPoint),
              line.label ? { box: shift(line.label.box), text: line.label.text } : undefined,
              line.curve ? translatePath(line.curve, dx, dy) : undefined,
            ),
            paintable.element.layer,
          ),
        );
        continue;
      }
      const pen = penDrawing.get(paintable.element.id);
      if (pen) {
        items.push(
          onLayer(
            emitter.pen(
              paintable.element,
              box,
              penGeometry.get(paintable.element.id)!.points.map(shiftPoint),
              pen.line.map(shiftPoint),
              shiftMarker(pen.start, shiftPoint),
              shiftMarker(pen.end, shiftPoint),
            ),
            paintable.element.layer,
          ),
        );
        continue;
      }
      items.push(
        onLayer(
          paintable.kind === "group"
            ? emitter.group(paintable.element, box)
            : elementGroup(paintable.element, box),
          paintable.element.layer,
        ),
      );
    }
  } else {
    // Layer by layer, back to front; within a layer: groups (outer before inner), the other
    // elements in source order, relations, and tags on top.
    const layers = diagram.properties.layers;
    const main = layers.indexOf(MAIN_LAYER);
    const indexOf = (layer: string | null) => {
      const i = layer === null ? main : layers.indexOf(layer);
      return i < 0 ? main : i;
    };
    const sortedGroups = [...groups].sort((a, b) => a.groupPath.length - b.groupPath.length);
    for (let layer = 0; layer < layers.length; layer++) {
      for (const group of sortedGroups) {
        if (indexOf(group.layer) !== layer) continue;
        items.push(onLayer(emitter.group(group, shift(boxes.get(group.id)!)), group.layer));
      }
      for (const element of diagram.elements) {
        if (element.kind === "group" || element.kind === "tag" || indexOf(element.layer) !== layer)
          continue;
        const box = shift(boxes.get(element.id)!);
        items.push(onLayer(elementGroup(element, box), element.layer));
      }
      for (const geometry of relationGeometry) {
        if (indexOf(geometry.relation.layer) !== layer) continue;
        items.push(onLayer(drawRelation(geometry), geometry.relation.layer));
      }
      for (const element of diagram.elements) {
        if (element.kind !== "tag" || indexOf(element.layer) !== layer) continue;
        const box = shift(boxes.get(element.id)!);
        items.push(onLayer(turn(emitter.element(element, box), box), element.layer));
      }
    }
  }
  if (framed) {
    const stripTop = theme.frame === "header" ? 0 : height - frameHeight;
    items.push(emitter.frame(width, stripTop, diagram.properties.title));
    if (theme.mark === "meltemi") gradients.push(markGradient(theme.accent, theme.accentEnd));
  }

  if (metrics.unknownFonts.size > 0 || metrics.uncovered.size > 0) {
    diagnostics.push({
      code: "layout.unmeasured-font",
      severity: "info",
      message: words.diagnostics.unmeasuredFont([...metrics.unknownFonts], [...metrics.uncovered]),
      range: diagram.idRange,
      hints: [words.hints.bundledFonts],
    });
  }

  const scene: Scene = {
    width,
    height,
    background: theme.background,
    title: diagram.properties.title,
    description: diagram.properties.description,
    fonts: { body: theme.font, mono: theme.mono },
    gradients: [...gradients, ...emitter.painter.gradients],
    patterns: emitter.patterns,
    items,
    ...(theme.sketch !== "none" ? { sketch: theme.sketch } : {}),
  };
  const labelBoxes = new Map<string, Box>();
  const connectors = new Map<string, ConnectorGeometry>();
  for (const geometry of relationGeometry) {
    if (geometry.label) labelBoxes.set(geometry.relation.key, geometry.label.box);
    connectors.set(geometry.relation.key, geometry.connector);
  }
  // Free lines by their id, beside the relations: their pill and their route.
  for (const [id, geometry] of lineGeometry) {
    if (geometry.label) labelBoxes.set(id, geometry.label.box);
    connectors.set(id, geometry.connector);
  }
  // Stickies: the room their text is wrapped in and the size it is drawn at, for editors.
  const stickies = new Map<string, StickyText>();
  for (const element of diagram.elements) {
    const box = element.kind === "sticky" ? boxes.get(element.id) : undefined;
    if (box) stickies.set(element.id, sizing.stickyPlace(element, box));
  }
  // Lists: how they arrange their children and where the first one starts, for editors.
  const lists = new Map<string, ListGeometry>();
  for (const [id, list] of frames?.lists ?? []) {
    const box = boxes.get(id);
    if (!box) continue;
    const header = sizing.headerOf(diagram.elementsById.get(id)!);
    lists.set(id, { ...list, origin: { x: box.x + theme.groupPadding, y: box.y + header } });
  }
  return {
    scene,
    diagnostics,
    boxes,
    offset: { x: dx, y: dy },
    labels: labelBoxes,
    connectors,
    pens: penGeometry,
    stickies,
    lists,
    origins,
    theme,
    shapes,
    elementLabels,
    rotations,
    radii: new Map(
      [...shapes]
        .map(([id, shape]) => {
          const element = diagram.elementsById.get(id)!;
          const radius = CORNERED_SHAPES.has(shape)
            ? sizing.shapeOptions(element).radius
            : undefined;
          return [id, radius] as const;
        })
        .filter((entry): entry is readonly [string, number] => entry[1] !== undefined),
    ),
  };
}

/** The label an icon shape draws outside its box, as its own connectors meet it. */
interface OwnLabel {
  /** The label's text with a small margin around it. */
  readonly box: Box;
  /** The side of the icon the label lies on. */
  readonly side: Side;
}

/** The side of an icon shape each label position lies on. */
const LABEL_SIDES: Readonly<Record<LabelPosition, Side>> = {
  top: "north",
  bottom: "south",
  left: "west",
  right: "east",
};

/**
 * Where a connector's end at an icon shape comes out from under the shape's own label: when its
 * last run leaves the icon on the label's side, its line meets the label's text, and it reaches on
 * beyond the label by at least `room` (the end's head) before it turns, the point of that run just
 * beyond the label; else undefined. `straight` asks the run to follow the side's normal, as the
 * runs of orthogonal routes do; other routes only have to head away from the icon.
 */
function underLabel(
  points: readonly Point[],
  end: "first" | "last",
  label: OwnLabel,
  room: number,
  straight: boolean,
): Point | undefined {
  if (points.length < 2) return undefined;
  const tip = points[end === "first" ? 0 : points.length - 1]!;
  const next = points[end === "first" ? 1 : points.length - 2]!;
  const normal = sideNormal(label.side);
  const across = normal.x !== 0;
  const { box } = label;
  if (straight && Math.abs(across ? next.y - tip.y : next.x - tip.x) > 0.5) return undefined;
  const at = across ? tip.y : tip.x;
  const [low, high] = across ? [box.y, box.y + box.height] : [box.x, box.x + box.width];
  if (at <= low || at >= high) return undefined;
  // Distances along the side's normal, outwards from the icon.
  const along = (p: Point) => (across ? p.x * normal.x : p.y * normal.y);
  const far =
    label.side === "east"
      ? box.x + box.width
      : label.side === "west"
        ? box.x
        : label.side === "south"
          ? box.y + box.height
          : box.y;
  const beyond = across ? { x: far, y: tip.y } : { x: tip.x, y: far };
  if (along(tip) >= along(beyond) || along(next) < along(beyond) + room) return undefined;
  return beyond;
}

/**
 * A connector's route as it is drawn: each end whose last run passes under its own label
 * (`underLabel`) starts beyond the label instead of on the icon.
 */
function beyondOwnLabels(
  points: readonly Point[],
  labels: readonly [OwnLabel | undefined, OwnLabel | undefined],
  rooms: readonly [number, number],
  straight: boolean,
): Point[] {
  const route = [...points];
  for (const [index, end] of [
    [0, "first"],
    [1, "last"],
  ] as const) {
    const label = labels[index];
    // The other end, already drawn from beyond its own label, is where this run goes on to.
    const beyond = label && underLabel(route, end, label, rooms[index], straight);
    if (beyond) route[end === "first" ? 0 : route.length - 1] = beyond;
  }
  return route;
}

/**
 * How many of the labels of a connector's own ends its route crosses, other than by a run that
 * passes under the label from the icon and beyond it (`underLabel`).
 */
function ownLabelCrossings(
  points: readonly Point[],
  labels: readonly [OwnLabel | undefined, OwnLabel | undefined],
  rooms: readonly [number, number],
  straight: boolean,
): number {
  const route = beyondOwnLabels(points, labels, rooms, straight);
  return labels.filter((label) => label && crossedBoxes(route, [label.box]).length > 0).length;
}

/** Points rounded as the scene writes them. */
function roundedPoints(list: readonly Point[]): Point[] {
  return list.map((p) => ({ x: round(p.x), y: round(p.y) }));
}

/** A circle of radius `r` about (`cx`, `cy`), as path data. */
function circlePath(cx: number, cy: number, r: number): string {
  return `M${round(cx - r)} ${cy}a${r} ${r} 0 1 0 ${round(2 * r)} 0a${r} ${r} 0 1 0 ${round(-2 * r)} 0Z`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Moves path data made of absolute coordinate pairs (`M` and `C` commands) by (dx, dy). */
/** The group of an element with the element's `url`, when it has one. */
export function withUrl(group: GroupItem, element: Pick<Element, "url">): GroupItem {
  return element.url ? { ...group, href: element.url } : group;
}

/**
 * The group with the box it was drawn in, for motion effects. The corner radius is the one of the
 * outline drawn on that box, when there is one. `inner` is the inscribed rectangle the text of a
 * shape other than a box lies in, and `label` the box of a label drawn outside it, for the label
 * audit.
 */
export function withBounds(group: GroupItem, box: Box, inner?: Box, label?: Box): GroupItem {
  const outline = group.items.find(
    (item): item is RectItem =>
      item.kind === "rect" &&
      Math.abs(item.x - box.x) < 0.5 &&
      Math.abs(item.y - box.y) < 0.5 &&
      Math.abs(item.width - box.width) < 0.5 &&
      Math.abs(item.height - box.height) < 0.5,
  );
  return {
    ...group,
    // Shapes drawn as paths (cylinders, diamonds, persons) get a softly rounded halo.
    bounds: {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      radius: outline?.radius ?? 8,
      ...(inner
        ? {
            inner: {
              x: round(inner.x),
              y: round(inner.y),
              width: round(inner.width),
              height: round(inner.height),
            },
          }
        : {}),
      ...(label
        ? {
            label: {
              x: round(label.x),
              y: round(label.y),
              width: round(label.width),
              height: round(label.height),
            },
          }
        : {}),
    },
  };
}

function translatePath(d: string, dx: number, dy: number): string {
  let index = 0;
  return d.replace(/-?\d+(?:\.\d+)?/g, (number) => {
    const value = Number(number) + (index++ % 2 === 0 ? dx : dy);
    const rounded = Math.round(value * 100) / 100;
    return String(Object.is(rounded, -0) ? 0 : rounded);
  });
}

/** The size of a relation's label pill without its icon, or null when it has no label. */
function labelSize(
  relation: Relation,
  metrics: TextMetrics,
  pill: PillText,
): { width: number; height: number } | null {
  const technology = relation.technology ? `[${relation.technology}]` : null;
  if (relation.label === null && !technology) return null;
  const scale = pill.scale;
  const techSize = technologySize(scale.relationLabel);
  const text = relation.label
    ? metrics.width(relation.label, pill.font, pill.weight, scale.relationLabel)
    : 0;
  const tech = technology ? metrics.width(technology, pill.font, 400, techSize) : 0;
  return {
    width: Math.ceil(Math.max(text, tech) + scale.relationLabelPadding),
    height: scale.relationLabelHeight + (technology ? Math.round(techSize * 1.25) : 0),
  };
}

/** The engine's port of a compass end: its side, or its side and position (`east@25`). */
function enginePort(end: RouteEndpoint): string {
  return end.position === undefined
    ? end.port
    : `${end.port}@${Math.round(end.position * 1000) / 10}`;
}

/** The sides where relations enter and leave a box, by direction, as engines arrange them. */
const FLOW_SIDES: Readonly<Record<string, { readonly in: Side; readonly out: Side }>> = {
  LR: { in: "west", out: "east" },
  RL: { in: "east", out: "west" },
  TB: { in: "north", out: "south" },
  BT: { in: "south", out: "north" },
};

/**
 * The request an engine arranges. `iconExtents` holds, for each element drawn beyond its box (an
 * icon shape and its label), the box's size and the extent the engine places, relative to the
 * box's top-left corner: ports written on the box are moved onto the extent's sides, and the
 * relation ends that name no port get one each on the icon's sides, spread over the icon, so that
 * the routes meet the icon and not its label: on the side the flow leaves by for a source and
 * enters by for a target, or the other way round for the relations in `mirrored`, which run
 * against the flow.
 *
 * A list group is a node of its arranged size in `sizes`, and the engine never sees what it
 * holds: `holders` gives everything inside a list the outermost list around it, which the
 * relations and notes attached to what the list holds end on instead, with no port.
 */
function arrangeRequest(
  diagram: FlowDiagram,
  sizes: ReadonlyMap<string, { width: number; height: number }>,
  fixedPlaces: ReadonlyMap<string, Point>,
  routes: ReadonlyMap<string, RouteEntry>,
  theme: Theme,
  headerOf: (group: Element) => number,
  labelOf: (relation: Relation) => { width: number; height: number } | null = () => null,
  leftOut: ReadonlySet<string> = new Set(),
  minimums: ReadonlyMap<string, { width: number; height: number }> = new Map(),
  iconExtents: ReadonlyMap<string, { size: ShapeSize; extent: Box }> = new Map(),
  mirrored: ReadonlySet<string> = new Set(),
  holders: ReadonlyMap<string, string> = new Map(),
): ArrangeRequest {
  /** The box the engine arranges for an element: the outermost list holding it, or its own. */
  const boxOf = (id: string) => holders.get(id) ?? id;
  /** A position along a side of an element's box, as a position along its extent's side. */
  const along = (id: string, side: Side, position: number): number => {
    const known = iconExtents.get(id);
    if (!known) return position;
    const { size, extent } = known;
    return side === "north" || side === "south"
      ? (size.width * position - extent.x) / extent.width
      : (size.height * position - extent.y) / extent.height;
  };
  const compassPorts = new Map<string, Set<string>>();
  for (const route of routes.values()) {
    for (const end of [route.from, route.to]) {
      if (end.named || end.port === "auto") continue;
      const set = compassPorts.get(end.element) ?? new Set<string>();
      set.add(enginePort(end));
      compassPorts.set(end.element, set);
    }
  }
  // The relation ends at an icon shape that name no port, by element and side.
  const flow = FLOW_SIDES[diagram.properties.direction] ?? FLOW_SIDES.LR!;
  const iconEnds = new Map<string, string[]>();
  const iconPort = (relation: Relation, end: "from" | "to"): string | null => {
    const element = relation[end];
    if (!iconExtents.has(element)) return null;
    const side = end === "from" || mirrored.has(relation.key) ? flow.out : flow.in;
    const id = `\u0002${relation.key}\u0002${end}\u0002${side}`;
    const key = `${element}\u0000${side}`;
    iconEnds.set(key, [...(iconEnds.get(key) ?? []), id]);
    return id;
  };
  const edges = diagram.relations.flatMap((relation) => {
    const source = boxOf(relation.from);
    const target = boxOf(relation.to);
    if (leftOut.has(source) || leftOut.has(target)) return [];
    // A relation within one list is drawn between the places the list gives.
    if (source === target && (holders.has(relation.from) || holders.has(relation.to))) return [];
    const route = routes.get(relation.key);
    const port = (end: RouteEntry["from"] | undefined, which: "from" | "to") =>
      holders.has(relation[which])
        ? null
        : end && end.port !== "auto"
          ? end.named
            ? end.port
            : enginePort(end)
          : iconPort(relation, which);
    return [
      {
        id: relation.key,
        source,
        target,
        sourcePort: port(route?.from, "from"),
        targetPort: port(route?.to, "to"),
        primary: relation.line === "solid",
        label: labelOf(relation),
      },
    ];
  });
  // An attached note is arranged beside its element as a dashed relation from the element would
  // be (the element first, so the note follows it in the flow's direction): in `auto`, and for a
  // note that has no place in `assisted`. The leader is no relation, so the route the engine
  // answers for this edge is never read.
  const attached = diagram.elements.flatMap((note) => {
    const target = note.attachedTo;
    if (note.kind !== "note" || target === null || target === note.id) return [];
    // A note in a list is placed by it; a note on what a list holds is arranged beside the list.
    const source = boxOf(target);
    if (holders.has(note.id) || fixedPlaces.has(note.id)) return [];
    if (leftOut.has(note.id) || leftOut.has(source)) return [];
    const element = diagram.elementsById.get(target);
    if (
      !element ||
      element.kind === "line" ||
      element.kind === "pen" ||
      !sizes.has(source) ||
      !sizes.has(note.id)
    ) {
      return [];
    }
    return [
      {
        id: `attach${note.id}`,
        source,
        target: note.id,
        sourcePort: null,
        targetPort: null,
        primary: false,
        label: null,
      },
    ];
  });
  edges.push(...attached);
  // Free lines and pens are drawn where their points are written: the engine never moves them.
  // A list is a node; what it holds is not.
  const nodes = diagram.elements
    .filter(
      (e) =>
        (e.kind === "group" ? isList(e) && !leftOut.has(e.id) : true) &&
        e.kind !== "line" &&
        e.kind !== "pen" &&
        !holders.has(e.id),
    )
    .map((element) => {
      const ports: ArrangePort[] = element.ports.map((p) => ({
        id: p.name,
        side: p.side,
        position: along(element.id, p.side, p.position),
      }));
      for (const id of compassPorts.get(element.id) ?? []) {
        const [side, percent] = id.split("@") as [Side, string | undefined];
        ports.push({
          id,
          side,
          position: along(element.id, side, percent === undefined ? 0.5 : Number(percent) / 100),
        });
      }
      for (const side of iconExtents.has(element.id) ? [flow.in, flow.out] : []) {
        const ids = iconEnds.get(`${element.id}\u0000${side}`) ?? [];
        ids.forEach((id, i) => {
          ports.push({ id, side, position: along(element.id, side, (i + 1) / (ids.length + 1)) });
        });
      }
      const size = sizes.get(element.id)!;
      return {
        id: element.id,
        width: size.width,
        height: size.height,
        kind: element.kind,
        parent: parentOf(element),
        fixed: fixedPlaces.get(element.id) ?? null,
        ports,
      };
    });
  const groups = diagram.elements
    .filter((e) => e.kind === "group" && !leftOut.has(e.id) && !isList(e) && !holders.has(e.id))
    .map((group) => {
      const minimum = minimums.get(group.id);
      return {
        id: group.id,
        parent: parentOf(group),
        padding: {
          top: headerOf(group),
          right: theme.groupPadding,
          bottom: theme.groupPadding,
          left: theme.groupPadding,
        },
        ...(minimum ? { minimum } : {}),
      };
    });
  return {
    direction: diagram.properties.direction,
    ...(diagram.definition?.layout.algorithm === "tree" ? { algorithm: "tree" as const } : {}),
    nodes,
    groups,
    edges,
    spacing: ENGINE_SPACING,
  };
}

/**
 * The relations with an end at an icon shape that an arrangement turns back against the flow:
 * their target lies wholly behind their source along the direction.
 */
function backwardAtIcons(
  diagram: FlowDiagram,
  arrangement: Arrangement,
  sizes: ReadonlyMap<string, { width: number; height: number }>,
  iconExtents: ReadonlyMap<string, unknown>,
  leftOut: ReadonlySet<string>,
  routes: ReadonlyMap<string, RouteEntry>,
): Set<string> {
  const direction = diagram.properties.direction;
  const horizontal = direction !== "TB" && direction !== "BT";
  const sign = direction === "RL" || direction === "BT" ? -1 : 1;
  // Only the ends that name no port get the ports of icon shapes.
  const free = (id: string, end: RouteEndpoint | undefined) =>
    iconExtents.has(id) && (end === undefined || end.port === "auto");
  const out = new Set<string>();
  for (const relation of diagram.relations) {
    const route = routes.get(relation.key);
    if (!free(relation.from, route?.from) && !free(relation.to, route?.to)) continue;
    if (leftOut.has(relation.from) || leftOut.has(relation.to)) continue;
    const from = arrangement.centers.get(relation.from);
    const to = arrangement.centers.get(relation.to);
    const fromSize = sizes.get(relation.from);
    const toSize = sizes.get(relation.to);
    if (!from || !to || !fromSize || !toSize) continue;
    const along = (p: Point) => sign * (horizontal ? p.x : p.y);
    const half = (size: { width: number; height: number }) =>
      (horizontal ? size.width : size.height) / 2;
    if (along(to) + half(toSize) < along(from) - half(fromSize)) out.add(relation.key);
  }
  return out;
}

/** The length of every route of an arrangement, together. */
function routesLength(arrangement: Arrangement): number {
  let total = 0;
  for (const route of arrangement.routes.values()) {
    for (let i = 1; i < route.length; i++) {
      total += Math.hypot(route[i]!.x - route[i - 1]!.x, route[i]!.y - route[i - 1]!.y);
    }
  }
  return total;
}

/**
 * `assisted` positions: placed elements keep their place. Each other element keeps its offset in
 * the arrangement from the placed element nearest to it there, and is then pushed away from that
 * element, along the layout direction, until it no longer overlaps a box already positioned. Boxes
 * are compared with what they draw beyond them, `extentOf` (the label of an icon shape). `sizes`
 * holds the boxes to position: the leaves, and the lists, which are arranged as boxes.
 */
function placeAround(
  diagram: FlowDiagram,
  arrangement: Arrangement,
  places: ReadonlyMap<string, Point>,
  sizes: ReadonlyMap<string, { width: number; height: number }>,
  centers: Map<string, Point>,
  fixed: Set<string>,
  extentOf: (id: string, box: Box) => Box = (_id, box) => box,
): void {
  const direction = diagram.properties.direction;
  const horizontal = direction === "LR" || direction === "RL";
  const anchors = [...places.keys()].filter((id) => sizes.has(id) && arrangement.centers.has(id));
  const positioned: Box[] = [];
  for (const element of diagram.elements) {
    if (!sizes.has(element.id) || !places.has(element.id)) continue;
    const size = sizes.get(element.id)!;
    centers.set(element.id, places.get(element.id)!);
    fixed.add(element.id);
    positioned.push(
      extentOf(element.id, boxFromCenter(places.get(element.id)!, size.width, size.height)),
    );
  }
  for (const element of diagram.elements) {
    if (!sizes.has(element.id) || places.has(element.id)) continue;
    const size = sizes.get(element.id)!;
    const arranged = arrangement.centers.get(element.id) ?? { x: 0, y: 0 };
    let nearest: string | undefined;
    let best = Infinity;
    for (const id of anchors) {
      const at = arrangement.centers.get(id)!;
      const distance = Math.hypot(at.x - arranged.x, at.y - arranged.y);
      if (distance < best) {
        best = distance;
        nearest = id;
      }
    }
    let center = arranged;
    let sign = direction === "RL" || direction === "BT" ? -1 : 1;
    if (nearest) {
      const from = arrangement.centers.get(nearest)!;
      const to = places.get(nearest)!;
      center = { x: to.x + arranged.x - from.x, y: to.y + arranged.y - from.y };
      const delta = horizontal ? arranged.x - from.x : arranged.y - from.y;
      if (delta !== 0) sign = delta > 0 ? 1 : -1;
    }
    for (let attempt = 0; attempt < 100; attempt++) {
      const box = extentOf(element.id, boxFromCenter(center, size.width, size.height));
      const blocker = positioned.find(
        (other) =>
          box.x < other.x + other.width &&
          other.x < box.x + box.width &&
          box.y < other.y + other.height &&
          other.y < box.y + box.height,
      );
      if (!blocker) break;
      const step = horizontal
        ? sign > 0
          ? blocker.x + blocker.width - box.x + ENGINE_SPACING.node
          : box.x + box.width - blocker.x + ENGINE_SPACING.node
        : sign > 0
          ? blocker.y + blocker.height - box.y + ENGINE_SPACING.node
          : box.y + box.height - blocker.y + ENGINE_SPACING.node;
      center = horizontal
        ? { x: center.x + sign * step, y: center.y }
        : { x: center.x, y: center.y + sign * step };
    }
    centers.set(element.id, center);
    positioned.push(extentOf(element.id, boxFromCenter(center, size.width, size.height)));
  }
}

/** What a relation's connector is drawn from, before lanes are given. */
interface RelationPlan {
  readonly relation: Relation;
  readonly route: RouteEntry | undefined;
  readonly style: ReturnType<StyleResolver["relation"]>;
  readonly kind: Routing;
  readonly fromEnd: ConnectorEnd;
  readonly toEnd: ConnectorEnd;
  readonly via: readonly Point[];
  readonly engineRoute: readonly Point[] | undefined;
  readonly followEngine: boolean;
}

/**
 * Lane offsets of the free ends (no named port, no point of a side) of relations drawn by the
 * anchor rules, without waypoints. Ends that meet the same side of the same box less than a lane
 * apart are spread a lane apart about the middle of their anchors, in the order, along the side,
 * of each relation's other anchor (then source order), so their connectors do not cross; a lane is
 * the widest spacing of their relations. A straight connector whose other end has no lane moves
 * that end too, so it stays straight. Ends already a lane apart keep their anchors.
 */
function endLanes(
  plans: readonly RelationPlan[],
  spacingOf: (relation: Relation) => number,
): Map<string, { from: number; to: number }> {
  interface SideEnd {
    readonly relation: Relation;
    readonly end: "from" | "to";
    /** The end's anchor along the side. */
    readonly at: number;
    /** The relation's other anchor along the side. */
    readonly along: number;
    readonly order: number;
  }
  const sides = new Map<string, SideEnd[]>();
  const straight = new Set<string>();
  const coordinate = (side: Side, point: Point) =>
    side === "north" || side === "south" ? point.x : point.y;
  plans.forEach((plan, order) => {
    const { relation, fromEnd, toEnd, via, followEngine } = plan;
    if (relation.from === relation.to || via.length > 0 || followEngine) return;
    if (fromEnd.named && toEnd.named) return;
    const { points, fromSide, toSide } = anchorPoints(fromEnd, toEnd, via, 0);
    const first = points[0]!;
    const last = points[points.length - 1]!;
    const add = (element: string, side: Side, end: "from" | "to", own: Point, other: Point) => {
      const key = `${element}\u0000${side}`;
      const list = sides.get(key) ?? [];
      list.push({
        relation,
        end,
        at: coordinate(side, own),
        along: coordinate(side, other),
        order,
      });
      sides.set(key, list);
    };
    if (!fromEnd.named) add(relation.from, fromSide, "from", first, last);
    if (!toEnd.named) add(relation.to, toSide, "to", last, first);
    if (
      points.length === 2 &&
      !fromEnd.named &&
      !toEnd.named &&
      (Math.abs(first.x - last.x) < 0.01 || Math.abs(first.y - last.y) < 0.01)
    ) {
      straight.add(relation.key);
    }
  });
  const lanes = new Map<string, { from: number; to: number }>();
  const moved = new Set<string>();
  for (const list of sides.values()) {
    if (list.length < 2) continue;
    const spacing = Math.max(LANE_SPACING, ...list.map((e) => spacingOf(e.relation)));
    // Runs of ends less than a lane apart along the side.
    const byPlace = [...list].sort((a, b) => a.at - b.at || a.along - b.along || a.order - b.order);
    const runs: SideEnd[][] = [];
    for (const entry of byPlace) {
      const run = runs[runs.length - 1];
      if (run && entry.at - run[run.length - 1]!.at < spacing - 0.5) run.push(entry);
      else runs.push([entry]);
    }
    for (const run of runs) {
      if (run.length < 2) continue;
      const middle = run.reduce((sum, e) => sum + e.at, 0) / run.length;
      run.sort((a, b) => a.along - b.along || a.order - b.order);
      run.forEach((entry, i) => {
        const offset = middle + (i - (run.length - 1) / 2) * spacing - entry.at;
        const current = lanes.get(entry.relation.key) ?? { from: 0, to: 0 };
        lanes.set(entry.relation.key, { ...current, [entry.end]: offset });
        moved.add(`${entry.relation.key}\u0000${entry.end}`);
      });
    }
  }
  // A straight connector moved at one end only moves at the other too.
  for (const key of straight) {
    const lane = lanes.get(key);
    if (!lane) continue;
    const fromMoved = moved.has(`${key}\u0000from`);
    const toMoved = moved.has(`${key}\u0000to`);
    if (fromMoved && !toMoved) lanes.set(key, { from: lane.from, to: lane.from });
    else if (toMoved && !fromMoved) lanes.set(key, { from: lane.to, to: lane.to });
  }
  return lanes;
}

/**
 * Lane offsets of relations between the same two elements, in either direction, that have no
 * waypoints and no named ports: the i-th of n moves by (i - (n - 1) / 2) lanes.
 */
function parallelLanes(
  diagram: FlowDiagram,
  routes: ReadonlyMap<string, RouteEntry>,
  spacingOf: (relation: Relation) => number = () => LANE_SPACING,
): Map<string, number> {
  const pairs = new Map<string, Relation[]>();
  for (const relation of diagram.relations) {
    if (relation.from === relation.to) continue;
    const route = routes.get(relation.key);
    if (
      route &&
      (route.via.length > 0 ||
        route.from.named ||
        route.to.named ||
        route.from.position !== undefined ||
        route.to.position !== undefined)
    )
      continue;
    const key = [relation.from, relation.to].sort().join("\u0000");
    const list = pairs.get(key) ?? [];
    list.push(relation);
    pairs.set(key, list);
  }
  const lanes = new Map<string, number>();
  for (const list of pairs.values()) {
    if (list.length < 2) continue;
    // Unlabelled lanes keep the narrow spacing; labelled ones make room for their pills.
    const spacing = Math.max(LANE_SPACING, ...list.map(spacingOf));
    list.forEach((relation, i) => lanes.set(relation.key, (i - (list.length - 1) / 2) * spacing));
  }
  return lanes;
}

/**
 * The canvas for the diagram's `preset` or `canvas`, reporting `layout.too-large` when the content
 * canvas exceeds what the preset holds. Nothing is clipped: a fixed canvas grows to fit. A board
 * (`preset board`) is the content canvas whatever its size: a whiteboard grows as it is drawn on.
 */
export function canvasSize(
  diagram: FlowDiagram,
  width: number,
  height: number,
  lines: LineIndex,
  diagnostics: Diagnostic[],
): { width: number; height: number } {
  const { preset, canvas } = diagram.properties;
  const words = messages();
  const tooLarge = (keyword: string, message: string) =>
    diagnostics.push({
      code: "layout.too-large",
      severity: "warning",
      message,
      range: propertyRange(diagram, keyword, lines) ?? diagram.idRange,
      // A whiteboard's preset is the board's, which grows with what it holds: a preset or a
      // written canvas can give way to it.
      hints: [
        words.hints.tooLarge,
        keyword === "preset" ? words.hints.boardPreset : words.hints.boardCanvas,
      ],
    });
  if (preset === "board") return { width, height };
  if (preset === "document") {
    if (width > DOCUMENT_MAX_WIDTH) {
      tooLarge("preset", words.diagnostics.tooWideForDocument(width, DOCUMENT_MAX_WIDTH));
    }
    return { width, height };
  }
  if (preset === "slide") {
    if (width > SLIDE_SIZE.width || height > SLIDE_SIZE.height) {
      tooLarge(
        "preset",
        words.diagnostics.tooLargeForSlide(width, height, SLIDE_SIZE.width, SLIDE_SIZE.height),
      );
    }
    return width * 9 >= height * 16
      ? { width, height: Math.round((width * 9) / 16) }
      : { width: Math.round((height * 16) / 9), height };
  }
  if (canvas) {
    if (width > canvas.width || height > canvas.height) {
      tooLarge(
        "canvas",
        words.diagnostics.tooLargeForCanvas(width, height, canvas.width, canvas.height),
      );
    }
    return { width: Math.max(width, canvas.width), height: Math.max(height, canvas.height) };
  }
  return { width, height };
}

/** Width the frame needs for the mark, the brand text and the title without overlap. */
export function frameMinWidth(
  theme: Theme,
  scale: TypeScale,
  title: string | null,
  metrics: TextMetrics,
): number {
  const brand = metrics.width(theme.brand, "body", 600, scale.frameBrand);
  const mark = theme.mark === "meltemi" ? scale.frameMark + 8 : 0;
  const titleWidth = title ? metrics.width(title, "body", 400, scale.frameTitle) + 32 : 0;
  return Math.ceil(2 * theme.margin + mark + brand + titleWidth);
}

function propertyRange(diagram: FlowDiagram, keyword: string, lines: LineIndex): Range | undefined {
  for (const stmt of diagram.block?.statements ?? []) {
    if (stmt.kind === "KeywordStatement" && stmt.keyword.text === keyword) {
      return lines.range({ start: stmt.start, end: stmt.end });
    }
  }
  return undefined;
}

/** Vertical positions of a box's label and description lines, relative to the content centre. */
interface TextBlock {
  /** One offset per line of the label, which is broken at `\n`. */
  readonly labelOffsets: readonly number[];
  readonly descriptionOffsets: readonly number[];
  /** From the top of the content (the icon when it sits on top) to the bottom of the last line. */
  readonly height: number;
  /** Vertical offset of the icon square's centre when the icon sits on top. */
  readonly iconOffset: number;
}

/** The rows a box's text column covers, relative to its text centre, and its width. */
interface TextColumn {
  readonly width: number;
  /** From the top of the first line's slot (or the icon) to the bottom of the last line's. */
  readonly slots: { readonly top: number; readonly bottom: number };
  /** The same rows, down to the descenders of the last line. */
  readonly glyphs: { readonly top: number; readonly bottom: number };
}

/** An icon placed on an element or relation, with its square side and the gap to the text. */
interface PlacedIcon {
  readonly icon: ResolvedIcon;
  readonly size: number;
  readonly gap: number;
  readonly position: IconPosition;
}

const BOX_KINDS: ReadonlySet<string> = new Set([
  "node",
  "decision",
  "data",
  "box",
  "person",
  "system",
  "container",
  "datastore",
  "component",
]);

/** The kinds whose icon takes the five positions, and whose label may sit at an edge. */
const ICON_KINDS: ReadonlySet<string> = new Set(["node", "decision", "data", "box"]);

/** Shapes whose whole box holds a centred icon and its label; others use an inscribed rectangle. */
const RECTANGULAR: ReadonlySet<BoxShape> = new Set<BoxShape>(["rounded", "rectangle", "square"]);

/** How many heights the inscribed rectangle of a shape tries for a centred icon. */
const INSCRIBED_STEPS = 24;

/** The scales a shaped box with a centred icon tries, past 1, until its content fits. */
const GROWTH_STEPS = 40;

/** How a centred icon and its label share an element's box (`iconPosition center`). */
export interface CentredLayout {
  /** The rectangle they share: the box, or the largest rectangle inscribed in the shape. */
  readonly content: Box;
  /** The room kept around the icon and between the label and the content's edge. */
  readonly margin: number;
  /** The band of the label at the `labelPosition` edge; empty when there is no text. */
  readonly band: Box;
  /** The icon's square, centred in the rest of the content. */
  readonly icon: Box;
  /** Whether the label's lines fit the band. */
  readonly fits: boolean;
}

/** A label drawn outside its element's box, as icon shapes draw theirs. */
interface OutsideLabel {
  /** The box its lines cover, from the top of the first line's slot to the last one's descenders. */
  readonly box: Box;
  /** The x its lines are anchored at, and the centre of its text block. */
  readonly x: number;
  readonly y: number;
  readonly anchor: TextItem["anchor"];
}

/** The size, weight and line height of an element's label. */
interface LabelFont {
  readonly size: number;
  readonly weight: number;
  readonly line: number;
  /** The font: the theme's body font, or a stack the style writes. */
  readonly font: TextFont;
}

/** The size and line of an element's description lines, and the font it shares with the label. */
interface DescriptionFont {
  readonly size: number;
  readonly line: number;
  readonly font: TextFont;
}

/** Box sizes from measured text, icons and the theme's type scale. */
class Sizing {
  /** The icon of each element, placed once: its side may depend on the element's box. */
  private readonly placed = new Map<string, PlacedIcon | undefined>();
  private readonly resolved = new Map<string, ResolvedIcon | undefined>();
  /** Centred icons: the default size of each element, and the layouts of the boxes asked for. */
  private readonly centredSizes = new Map<string, ShapeSize>();
  private readonly centredLayouts = new Map<string, CentredLayout>();
  private readonly centredLays = new Map<string, (content: Box) => CentredLayout>();
  /** The centre of each aligned text block, by element and box. */
  private readonly textCenters = new Map<string, Point>();
  /** How the text of each sticky is drawn, by element and card size. */
  private readonly stickyTexts = new Map<string, StickyText>();

  constructor(
    private readonly theme: Theme,
    private readonly scale: TypeScale,
    private readonly metrics: TextMetrics,
    private readonly styles: StyleResolver,
    private readonly icons: IconResolver | undefined,
    private readonly images: ReadonlyMap<string, ResolvedImage | undefined>,
    /** The written `size` of each element that has one. */
    private readonly written: ReadonlyMap<string, ShapeSize> = new Map(),
  ) {}

  /**
   * The label font: the theme's label size and weight, or for free boxes and text objects their
   * `fontSize` and `fontWeight`. Text objects default to 1.6 times the label size. Lines are 1.25
   * times the size apart.
   */
  labelFont(element: Element): LabelFont {
    const style = this.styles.element(element);
    const size =
      style.fontSize ??
      (element.kind === "text" ? Math.round(this.scale.label * 1.6) : this.scale.label);
    const weight = style.fontWeight ?? this.scale.labelWeight;
    return { size, weight, line: Math.round(size * 1.25), font: textFont(style.font) };
  }

  /**
   * The description lines of an element: the theme's description size and line, or, when its
   * style writes `fontSize`, the description of that label size at the theme's ratio, in the
   * label's font at weight 400.
   */
  descriptionFont(element: Element): DescriptionFont {
    const style = this.styles.element(element);
    const scale = writtenScale(this.theme, this.scale, "label", style.fontSize);
    return { size: scale.description, line: scale.descriptionLine, font: textFont(style.font) };
  }

  /** The title of a group: the theme's group title size at the label weight, or the style's. */
  groupFont(group: Element): LabelFont {
    const style = this.styles.element(group);
    const size = style.fontSize ?? this.scale.groupTitle;
    return {
      size,
      weight: style.fontWeight ?? this.scale.labelWeight,
      line: Math.round(size * 1.25),
      font: textFont(style.font),
    };
  }

  /** A tag's scale and face: its pill at the written size, in the mono font unless styled. */
  tagText(element: Element): { scale: TypeScale; face: TagFace } {
    const style = this.styles.element(element);
    return {
      scale: writtenScale(this.theme, this.scale, "tag", style.fontSize),
      face: { font: textFont(style.font, "mono"), weight: style.fontWeight ?? 500 },
    };
  }

  /** The text of a relation's label pill. */
  relationPill(relation: Relation): PillText {
    return pillText(this.theme, this.scale, this.styles.relation(relation));
  }

  /** The text of a free line's label pill. */
  linePill(element: Element): PillText {
    return pillText(this.theme, this.scale, this.styles.element(element));
  }

  /**
   * The drawn shape of a box-like element: its kind's (data stores are cylinders, decisions
   * diamonds, C4 persons persons), else the `shape` of a flow node or a free box, else `rounded`.
   */
  shapeOf(element: Element): BoxShape {
    const known = (shape: string | null | undefined): BoxShape | undefined =>
      shape && Object.hasOwn(SHAPE_SIZES, shape) ? (shape as BoxShape) : undefined;
    switch (element.kind) {
      case "data":
      case "datastore":
        return "cylinder";
      case "decision":
        return "diamond";
      case "person":
        return "person";
      case "node":
        return known(this.styles.element(element).shape) ?? "rounded";
      case "box":
        return known(this.styles.element(element).shape) ?? known(element.shape) ?? "rounded";
      case "sticky":
        // A card: a rectangle with the corners of its `radius` (see `shapeOptions`).
        return "rectangle";
      default:
        return "rounded";
    }
  }

  /**
   * The measures a shape is drawn with: a person's head from the label size, and the corners of a
   * person's or an agent's body from the theme.
   */
  shapeOptions(element: Element): ShapeOptions {
    const shape = this.shapeOf(element);
    // A written radius (the element's style, a class or a rule) rounds every cornered shape.
    const written = CORNERED_SHAPES.has(shape) ? this.styles.element(element).radius : undefined;
    if (element.kind === "sticky") return { radius: written ?? STICKY_RADIUS };
    if (shape === "agent") return { radius: written ?? this.theme.radius * 1.5 };
    if (shape === "person") {
      return { head: personHead(this.scale.label), radius: written ?? this.theme.radius * 3 };
    }
    return written === undefined ? {} : { radius: written };
  }

  /**
   * Where `verticalAlign` moves the text block of an element: `top` or `bottom` on a free box whose
   * shape has a text band and whose icon is not centred (its band sits at `labelPosition`), else
   * undefined, and the block stays at the shape's text centre.
   */
  verticalAlignOf(element: Element): "top" | "bottom" | undefined {
    if (element.kind !== "box") return undefined;
    const written = this.styles.element(element).verticalAlign;
    if (written !== "top" && written !== "bottom") return undefined;
    if (FIXED_TEXT_SHAPES.has(this.shapeOf(element)) || this.centred(element)) return undefined;
    return written;
  }

  /**
   * The centre of an element's text block drawn in `box`: the shape's text centre, or with
   * `verticalAlign top` the first row band of the shape's text band, `padding` below its top edge,
   * whose span about the centre holds the block with the padding on each side (or as much as the
   * middle does), searched pixel by pixel towards the middle; `bottom` the same from the bottom
   * edge. A block that no band holds before the middle stays at the middle.
   */
  textCenter(element: Element, box: Box): Point {
    const shape = this.shapeOf(element);
    const options = this.shapeOptions(element);
    const center = shapeTextCenter(shape, box, options);
    const align = this.verticalAlignOf(element);
    if (!align) return center;
    const key = `${element.id}\u0000${box.x}\u0000${box.y}\u0000${box.width}\u0000${box.height}`;
    const known = this.textCenters.get(key);
    if (known) return known;
    const column = this.textColumn(element);
    const spanOf = shapeTextSpanner(shape, box, options);
    const band = shapeTextBand(shape, box, options);
    const padding = this.theme.padding;
    const widthAt = (y: number) => {
      const span = spanOf(y + column.slots.top, y + column.slots.bottom, center.x);
      return span ? 2 * Math.max(0, Math.min(center.x - span[0], span[1] - center.x)) : -1;
    };
    const need = Math.min(column.width + 2 * padding, Math.max(0, widthAt(center.y)));
    const direction = align === "top" ? 1 : -1;
    const start =
      align === "top"
        ? band.top + padding - column.slots.top
        : band.bottom - padding - column.slots.bottom;
    let found = center;
    for (let y = start; (center.y - y) * direction > 1e-9; y += direction) {
      if (widthAt(y) >= need - 1e-9) {
        found = { x: center.x, y };
        break;
      }
    }
    this.textCenters.set(key, found);
    return found;
  }

  /**
   * The rows the text column of a box-like element covers, from its text centre: the slots of its
   * lines and icon, and the same rows with room for the glyphs' descenders. `width` is the widest
   * line, or the icon row.
   */
  textColumn(element: Element): TextColumn {
    return this.columnWith(element, this.columnIcon(element));
  }

  /** The text column of an element with an icon in it, or with none. */
  private columnWith(element: Element, icon: PlacedIcon | undefined): TextColumn {
    const block = this.blockWith(element, icon);
    const font = this.labelFont(element);
    const description = this.descriptionFont(element);
    const lines = [
      ...block.labelOffsets.map((y) => ({ y, size: font.size })),
      ...block.descriptionOffsets.map((y) => ({ y, size: description.size })),
    ];
    let top = Math.min(...lines.map((l) => l.y - l.size / 2));
    let bottom = Math.max(...lines.map((l) => l.y + l.size / 2));
    let glyphs = Math.max(...lines.map((l) => l.y + l.size * 0.6));
    if (icon?.position === "top") {
      top = Math.min(top, block.iconOffset - icon.size / 2);
    } else if (icon?.position === "bottom") {
      bottom = Math.max(bottom, block.iconOffset + icon.size / 2);
      glyphs = Math.max(glyphs, block.iconOffset + icon.size / 2);
    } else if (icon) {
      // The icon row is centred on the text centre.
      top = Math.min(top, -icon.size / 2);
      bottom = Math.max(bottom, icon.size / 2);
      glyphs = Math.max(glyphs, icon.size / 2);
    }
    return {
      width: this.contentWidthWith(element, icon),
      slots: { top, bottom },
      glyphs: { top, bottom: glyphs },
    };
  }

  /** The text column of an element's label and description alone, without its icon. */
  plainColumn(element: Element): TextColumn {
    return this.columnWith(element, undefined);
  }

  /**
   * The text area of a box-like element drawn in `box`: the box for shapes whose text keeps the
   * whole width, else the shape's inscribed rectangle across the rows of the text column, centred
   * on the text centre, or (`centred` false) reaching as far as every row does on each side, where
   * aligned text may lie. The glyph rows count as clipped only where the shape reaches more than
   * `ROW_TOLERANCE` into them.
   */
  textArea(
    element: Element,
    box: Box,
    rows: "slots" | "glyphs",
    column: TextColumn = this.textColumn(element),
    centred = true,
    aligned = true,
  ): Box {
    const shape = this.shapeOf(element);
    if (FULL_WIDTH_TEXT.has(shape)) return box;
    const options = this.shapeOptions(element);
    // Where the block is drawn; the sizes of boxes are found about the middle.
    const center = aligned ? this.textCenter(element, box) : shapeTextCenter(shape, box, options);
    const top = center.y + column[rows].top;
    const bottom = center.y + column[rows].bottom;
    const inset = rows === "glyphs" ? Math.min(ROW_TOLERANCE, (bottom - top) / 2) : 0;
    const span = shapeTextSpan(shape, box, top + inset, bottom - inset, center.x, options);
    if (centred) {
      const half = span ? Math.max(0, Math.min(center.x - span[0], span[1] - center.x)) : 0;
      return { x: center.x - half, y: top, width: 2 * half, height: bottom - top };
    }
    const [left, right] = span ?? [center.x, center.x];
    return { x: left, y: top, width: Math.max(0, right - left), height: bottom - top };
  }

  /**
   * The rectangle the label audit holds the text of a shaped element to, if any: the glyph rows of
   * its text column as far as the shape reaches on each side, so that aligned text inside the
   * outline is not cut by the narrow side of an uneven shape.
   */
  innerArea(element: Element, box: Box): Box | undefined {
    // An icon shape's text lies outside its box (see `outsideLabel`).
    if (!BOX_KINDS.has(element.kind) || this.iconShaped(element)) return undefined;
    const shape = this.shapeOf(element);
    // A centred icon and its label share the rectangle inscribed in the shape.
    if (this.centred(element)) {
      return RECTANGULAR.has(shape) ? undefined : this.centredLayout(element, box).content;
    }
    if (FULL_WIDTH_TEXT.has(shape)) return undefined;
    return this.textArea(element, box, "glyphs", this.textColumn(element), false);
  }

  /**
   * The narrowest whole width at `height` at which the shape's text area holds the text column of
   * an element with `margin` on both sides, or Infinity when no width does (the text is too tall).
   * The width is rounded up, or down when it is within `ROUNDING` of a whole pixel.
   */
  private widthAt(
    element: Element,
    height: number,
    margin: number,
    rows: "slots" | "glyphs",
  ): number {
    const column = this.textColumn(element);
    const need = column.width + 2 * margin;
    const fits = (width: number) =>
      this.textArea(element, { x: 0, y: 0, width, height }, rows, column, true, false).width >=
      need - 1e-9;
    let low = Math.max(1, need);
    if (fits(low)) return Math.ceil(low - ROUNDING);
    let high = low * 2;
    while (!fits(high)) {
      if (high > 64 * low + 4096) return Infinity;
      high *= 2;
    }
    for (let i = 0; i < 60 && high - low > 0.005; i++) {
      const middle = (low + high) / 2;
      if (fits(middle)) high = middle;
      else low = middle;
    }
    return Math.ceil(high - ROUNDING);
  }

  /** Whether a group is untitled (`""`, no description, no styled icon): it draws no title band. */
  untitled(group: Element): boolean {
    return group.kind === "group" && isUntitledGroup(group, this.styles.element(group));
  }

  /** The room above a group's interior: its title band, or its padding when it is untitled. */
  headerOf(group: Element): number {
    return groupHeaderOf(group, this.styles.element(group), this.theme);
  }

  /** The vertical centre of a group's title, from the group's top edge, inside its header. */
  titleOffset(group: Element): number {
    const header = this.headerOf(group);
    // A larger title keeps the theme's band below it and its 45 % above.
    return header === this.theme.groupHeader
      ? this.theme.groupHeader * 0.45
      : header - this.theme.groupHeader * 0.55;
  }

  /** Horizontal alignment of a box or text label. */
  /**
   * A note's font: the theme's note size at weight 400, or a free note's `fontSize` and
   * `fontWeight`; its lines are as far apart as the note scale's ratio of line to size.
   */
  noteFont(element: Element): LabelFont {
    const style = this.styles.element(element);
    const size = style.fontSize ?? this.scale.note;
    return {
      size,
      weight: style.fontWeight ?? 400,
      line: Math.round((size * this.scale.noteLine) / this.scale.note),
      font: textFont(style.font),
    };
  }

  alignOf(element: Element): "left" | "center" | "right" {
    if (element.kind === "text" || element.kind === "note") {
      return this.styles.element(element).textAlign ?? "left";
    }
    if (element.kind === "box" || element.kind === "sticky") {
      return this.styles.element(element).textAlign ?? "center";
    }
    return "center";
  }

  /**
   * How a sticky's text is drawn on a card of `size`, its area relative to the card's top left
   * corner: wrapped at the width of the card inside the `padding` (right of its icon), at
   * `fontSize` or 1.2 times the label size, stepped down by 1 until the lines fit the area or the
   * size reaches `STICKY_MIN_FONT_SIZE`; lines 1.25 times the size apart, aligned by `textAlign`
   * (`center`) and `verticalAlign` (`middle`). A blank text always fits.
   */
  stickyText(element: Element, size: ShapeSize): StickyText {
    const key = `${element.id}\u0000${size.width}\u0000${size.height}`;
    const known = this.stickyTexts.get(key);
    if (known) return known;
    const style = this.styles.element(element);
    const weight = style.fontWeight ?? STICKY_FONT_WEIGHT;
    const face = textFont(style.font);
    const area = this.stickyArea(element, size);
    let font = style.fontSize ?? round(this.scale.label * STICKY_FONT_SCALE);
    let laid = this.stickyLines(element.label, area, font, weight, face);
    while (!laid.fits && font > STICKY_MIN_FONT_SIZE) {
      font = Math.max(STICKY_MIN_FONT_SIZE, round(font - 1));
      laid = this.stickyLines(element.label, area, font, weight, face);
    }
    const text: StickyText = {
      area,
      size: font,
      weight,
      font: face,
      line: laid.line,
      lines: laid.lines,
      align: this.alignOf(element),
      verticalAlign: style.verticalAlign ?? "middle",
      fits: laid.fits,
    };
    this.stickyTexts.set(key, text);
    return text;
  }

  /**
   * The room of a sticky's text on a card of `size`: inside the padding, below the row of its icon,
   * so that the text keeps the card's whole width and stays centred on it.
   */
  private stickyArea(element: Element, size: ShapeSize): Box {
    const padding = this.theme.padding;
    const icon = this.iconOf(element);
    const row = icon ? icon.size + icon.gap : 0;
    return {
      x: padding,
      y: padding + row,
      width: Math.max(0, size.width - 2 * padding),
      height: Math.max(0, size.height - 2 * padding - row),
    };
  }

  /** A text wrapped at the width of `area` at a font size, and whether its lines fit `area`. */
  private stickyLines(
    text: string,
    area: Box,
    size: number,
    weight: number,
    font: TextFont,
  ): { lines: string[]; line: number; fits: boolean } {
    const measure = (line: string) => this.metrics.width(line, font, weight, size);
    const lines = wrapLines(text, area.width, measure);
    const line = round(size * 1.25);
    const fits =
      text.trim() === "" ||
      (lines.length * line <= area.height + 1e-9 &&
        lines.every((l) => measure(l) <= area.width + 1e-9));
    return { lines, line, fits };
  }

  /**
   * How a sticky's text is drawn on its card at `box`, the area in the box's coordinates: what
   * editors that type over the card take.
   */
  stickyPlace(element: Element, box: Box): StickyText {
    const text = this.stickyText(element, { width: box.width, height: box.height });
    return {
      ...text,
      area: { ...text.area, x: box.x + text.area.x, y: box.y + text.area.y },
    };
  }

  /**
   * Reports `layout.text-overflow` on a sticky whose text does not fit a card of `size` even at
   * its smallest font size, with the smallest card of the same proportions on which it fits at
   * that size, in whole pixels.
   */
  checkSticky(element: Element, size: ShapeSize, range: Range, diagnostics: Diagnostic[]): void {
    const text = this.stickyText(element, size);
    if (text.fits) return;
    const scaled = (width: number): ShapeSize => ({
      width,
      height: Math.max(1, Math.round((width * size.height) / Math.max(1, size.width))),
    });
    const fitsAt = (width: number) => {
      const card = scaled(width);
      return this.stickyLines(
        element.label,
        this.stickyArea(element, card),
        text.size,
        text.weight,
        text.font,
      ).fits;
    };
    let low = Math.max(1, Math.ceil(size.width));
    let high = low * 2;
    for (let i = 0; i < 32 && !fitsAt(high); i++) {
      low = high;
      high *= 2;
    }
    while (high - low > 1) {
      const middle = Math.floor((low + high) / 2);
      if (fitsAt(middle)) high = middle;
      else low = middle;
    }
    const fit = scaled(high);
    const words = messages();
    diagnostics.push({
      code: "layout.text-overflow",
      severity: "warning",
      message: words.diagnostics.stickyOverflow(
        element.id,
        size.width,
        size.height,
        text.size,
        fit.width,
        fit.height,
      ),
      range,
      hints: [words.hints.textOverflow(element.id, fit.width, fit.height)],
      data: { ids: [element.id], size: { element: element.id, ...fit } },
    });
  }

  /** The inset of a free text or icon drawn with a frame (`fill`, `stroke` or `pattern`). */
  frameInset(element: Element): number {
    const style = this.styles.element(element);
    return style.fill || style.stroke || style.pattern ? Math.round(this.theme.padding / 2) : 0;
  }

  /** The resolved icon of an `icon` object. */
  sourceIcon(element: Element): ResolvedIcon | undefined {
    if (element.source === null || !this.icons) return undefined;
    return this.icons.resolve(element.source);
  }

  /** The resolved image of an `image` object. */
  imageOf(element: Element): ResolvedImage | undefined {
    return this.images.get(element.id);
  }

  private place(
    reference: string | undefined,
    size: number,
    position: IconPosition,
  ): PlacedIcon | undefined {
    if (reference === undefined || !this.icons) return undefined;
    const icon = this.icons.resolve(reference);
    if (!icon) return undefined;
    return { icon, size, gap: Math.round(size * 0.4), position };
  }

  /**
   * The icon of an element: on boxes, the theme's `iconSize` or the element's beside the text,
   * fitted to the box when the icon is the centre piece or the box itself; 1.3 times the text size
   * elsewhere.
   */
  iconOf(element: Element): PlacedIcon | undefined {
    if (this.placed.has(element.id)) return this.placed.get(element.id);
    const placed = this.placeIcon(element);
    this.placed.set(element.id, placed);
    return placed;
  }

  private placeIcon(element: Element): PlacedIcon | undefined {
    const style = this.styles.element(element);
    const { scale, theme } = this;
    switch (element.kind) {
      case "text":
      case "icon":
      case "image":
        return undefined;
      case "group":
        return this.place(style.icon, Math.round(scale.groupTitle * 1.3), "left");
      case "tag":
        return this.place(style.icon, Math.round(scale.tag * 1.3), "left");
      case "note":
        return this.place(style.icon, Math.round(this.noteFont(element).size * 1.3), "left");
      case "sticky":
        // At the top left of the card, its `iconSize` or the theme's, the text right of it.
        return this.place(
          style.icon,
          typeof style.iconSize === "number" ? style.iconSize : theme.iconSize,
          "left",
        );
    }
    const icon = this.elementIcon(element);
    if (!icon) return undefined;
    const written = this.written.get(element.id);
    if (this.iconShaped(element)) {
      const size = this.iconShapeSide(element, written ?? this.iconShapeSize(element));
      return { icon, size, gap: 0, position: "center" };
    }
    let position = style.iconPosition ?? theme.iconPosition;
    if (position === "center") {
      if (ICON_KINDS.has(element.kind)) {
        const box = { x: 0, y: 0, ...(written ?? this.centredSize(element)) };
        return { icon, size: this.centredLayout(element, box).icon.width, gap: 0, position };
      }
      // Kinds that draw their own shape keep the icon above the text.
      position = "top";
    }
    const at = (size: number): PlacedIcon => ({
      icon,
      size,
      // A large icon keeps the gap of a 24 px one.
      gap: Math.round((style.iconSize === undefined ? size : Math.min(size, 24)) * 0.4),
      position,
    });
    const requested = style.iconSize;
    if (requested === undefined) return at(theme.iconSize);
    if (!written) return at(requested === "auto" ? theme.iconSize : requested);
    // A written size holds the icon: `auto` fills the room, a number is clamped to it.
    return at(
      this.largestFitting(
        element,
        written,
        requested === "auto" ? ICON_SIZE_RANGE.max : requested,
        at,
      ),
    );
  }

  /** The resolved `icon` of an element's style. */
  private elementIcon(element: Element): ResolvedIcon | undefined {
    if (this.resolved.has(element.id)) return this.resolved.get(element.id);
    const reference = this.styles.element(element).icon;
    const icon = reference === undefined || !this.icons ? undefined : this.icons.resolve(reference);
    this.resolved.set(element.id, icon);
    return icon;
  }

  /**
   * The largest icon side up to `requested`, and at least 8 px, at which the text column with the
   * icon fits a box of a written size, half the padding around it.
   */
  private largestFitting(
    element: Element,
    size: ShapeSize,
    requested: number,
    at: (side: number) => PlacedIcon,
  ): number {
    const fits = (side: number) => this.contentFits(element, size, at(side));
    const low: number = ICON_SIZE_RANGE.min;
    if (requested <= low || fits(requested)) return requested;
    if (!fits(low)) return low;
    let lo = low;
    let hi = requested;
    while (hi - lo > 1) {
      const middle = Math.floor((lo + hi) / 2);
      if (fits(middle)) lo = middle;
      else hi = middle;
    }
    return lo;
  }

  /**
   * Whether an element's text column, with an icon in it, fits a box of a size: across and down
   * the shape's text area (a person's body, a cylinder below its top), half the padding around it.
   */
  private contentFits(element: Element, size: ShapeSize, icon: PlacedIcon): boolean {
    const margin = Math.round(this.theme.padding / 2);
    const column = this.columnWith(element, icon);
    const slots = { top: column.slots.top - margin, bottom: column.slots.bottom + margin };
    if (slots.bottom - slots.top > size.height + 1e-9) return false;
    const box = { x: 0, y: 0, ...size };
    if (!this.rowsFit(element, box, slots)) return false;
    const area = this.textArea(element, box, "slots", { ...column, slots }, true, false);
    return area.width >= column.width + 2 * margin - 1e-9;
  }

  /** Whether rows about an element's text centre lie inside the text area of its shape in `box`. */
  private rowsFit(
    element: Element,
    box: Box,
    rows: { readonly top: number; readonly bottom: number },
  ): boolean {
    const shape = this.shapeOf(element);
    const options = this.shapeOptions(element);
    const center = shapeTextCenter(shape, box, options);
    const span = shapeTextSpan(
      shape,
      box,
      center.y + rows.top,
      center.y + rows.bottom,
      center.x,
      options,
    );
    return span !== undefined;
  }

  /**
   * The least whole height, from a box's own, at which the text column of an element with the icon
   * it draws there lies inside its shape's text area with half the padding above and below.
   */
  private heightHolding(element: Element, size: ShapeSize): number {
    const margin = Math.round(this.theme.padding / 2);
    const column = this.textColumn(element);
    const rows = { top: column.slots.top - margin, bottom: column.slots.bottom + margin };
    const holds = (height: number) =>
      this.rowsFit(element, { x: 0, y: 0, width: size.width, height }, rows);
    let low = size.height;
    if (holds(low)) return low;
    let high = Math.ceil(Math.max(low * 2, rows.bottom - rows.top));
    while (!holds(high)) {
      if (high > 64 * low + 4096) return high;
      high *= 2;
    }
    while (high - low > 1) {
      const middle = Math.floor((low + high) / 2);
      if (holds(middle)) high = middle;
      else low = middle;
    }
    return high;
  }

  /** The icon of an element when it sits in its text column: beside, above or below the text. */
  private columnIcon(element: Element): PlacedIcon | undefined {
    if (!BOX_KINDS.has(element.kind)) return undefined;
    const icon = this.iconOf(element);
    return icon && icon.position !== "center" ? icon : undefined;
  }

  /** Whether an element is drawn as its icon alone, its label outside (`shape icon`). */
  iconShaped(element: Element): boolean {
    return (element.kind === "node" || element.kind === "box") && this.shapeOf(element) === "icon";
  }

  /** Whether the style makes the icon the centre piece: `iconPosition center` or `shape icon`. */
  iconCentrePiece(element: Element): boolean {
    if (this.iconShaped(element)) return true;
    const position = this.styles.element(element).iconPosition ?? this.theme.iconPosition;
    return ICON_KINDS.has(element.kind) && position === "center";
  }

  /** Whether an element is drawn with its icon centred and its label at an edge of its box. */
  centred(element: Element): boolean {
    return this.iconOf(element)?.position === "center" && !this.iconShaped(element);
  }

  /** The edge a centre piece's label sits at: `labelPosition`, else the bottom. */
  labelSide(element: Element): LabelPosition {
    return this.styles.element(element).labelPosition ?? "bottom";
  }

  /** Whether an element has a label or a description to draw. */
  private hasText(element: Element): boolean {
    return element.label.trim() !== "" || (element.description ?? "").trim() !== "";
  }

  /**
   * The default box of an icon shape: the square of a written `iconSize`, else 64 px at the 13 px
   * label size, scaled with it; a frame grows around the icon, as a free text's does.
   */
  iconShapeSize(element: Element): ShapeSize {
    const written = this.styles.element(element).iconSize;
    const side =
      typeof written === "number"
        ? written
        : Math.round(SHAPE_SIZES.icon.width * (this.theme.labelSize / 13));
    const framed = side + 2 * this.frameInset(element);
    return { width: framed, height: framed };
  }

  /** The side of an icon shape's icon in its box: the box's shorter side, inside its frame. */
  private iconShapeSide(element: Element, size: ShapeSize): number {
    return Math.max(0, Math.min(size.width, size.height) - 2 * this.frameInset(element));
  }

  /**
   * The label of an icon shape, outside its box at `labelPosition`, half the padding away, aligned
   * by `textAlign`; undefined when it has no label and no description.
   */
  outsideLabel(element: Element, box: Box): OutsideLabel | undefined {
    if (!this.iconShaped(element) || !this.hasText(element)) return undefined;
    const column = this.plainColumn(element);
    const width = column.width;
    const gap = Math.round(this.theme.padding / 2);
    const align = this.alignOf(element);
    const side = this.labelSide(element);
    const right = box.x + box.width;
    const bottom = box.y + box.height;
    let left: number;
    let y: number;
    switch (side) {
      case "bottom":
      case "top":
        left =
          align === "left"
            ? box.x
            : align === "right"
              ? right - width
              : box.x + box.width / 2 - width / 2;
        // Below the box from the top of its first line; above it down to its descenders.
        y =
          side === "bottom" ? bottom + gap - column.slots.top : box.y - gap - column.glyphs.bottom;
        break;
      case "left":
        left = box.x - gap - width;
        y = box.y + box.height / 2;
        break;
      case "right":
        left = right + gap;
        y = box.y + box.height / 2;
        break;
    }
    const anchor: TextItem["anchor"] =
      align === "left" ? "start" : align === "right" ? "end" : "middle";
    const x = align === "left" ? left : align === "right" ? left + width : left + width / 2;
    return {
      box: {
        x: left,
        y: y + column.slots.top,
        width,
        height: column.glyphs.bottom - column.slots.top,
      },
      x,
      y,
      anchor,
    };
  }

  /**
   * How a centred icon and its label share a box: the label's band at the `labelPosition` edge of
   * the content, the padding from it, and the icon centred in the rest, as large as fits with the
   * padding around it, or a written `iconSize` when it is smaller. The content is the box of a
   * rectangular shape (with half the padding when the whole one leaves the icon under its least
   * size), else the rectangle inscribed in the shape about its text centre that holds the label and
   * the largest icon, with half the padding.
   */
  centredLayout(element: Element, box: Box): CentredLayout {
    // Sizes, icons, checks and the drawing ask for the same boxes again: each is laid out once.
    const key = `${element.id}\u0000${box.x}\u0000${box.y}\u0000${box.width}\u0000${box.height}`;
    let layout = this.centredLayouts.get(key);
    if (!layout) {
      layout = this.layCentred(element, box);
      this.centredLayouts.set(key, layout);
    }
    return layout;
  }

  private layCentred(element: Element, box: Box): CentredLayout {
    const shape = this.shapeOf(element);
    const rectangular = RECTANGULAR.has(shape);
    const tight = Math.round(this.theme.padding / 2);
    if (rectangular) {
      const layout = this.centredIn(element, this.theme.padding)(box);
      // A small written size keeps half the padding, as icons beside the text do, before the icon
      // goes under its least size.
      return layout.icon.width >= ICON_SIZE_RANGE.min
        ? layout
        : this.centredIn(element, tight)(box);
    }
    const lay = this.centredIn(element, tight);
    const options = this.shapeOptions(element);
    const center = shapeTextCenter(shape, box, options);
    const spanOf = shapeTextSpanner(shape, box, options);
    const reach = Math.min(center.y - box.y, box.y + box.height - center.y);
    let best: CentredLayout | undefined;
    for (let i = 1; i <= INSCRIBED_STEPS; i++) {
      const half = (reach * i) / INSCRIBED_STEPS;
      const span = spanOf(center.y - half, center.y + half, center.x);
      if (!span) continue;
      const width = 2 * Math.max(0, Math.min(center.x - span[0], span[1] - center.x));
      const layout = lay({ x: center.x - width / 2, y: center.y - half, width, height: 2 * half });
      if (
        !best ||
        (layout.fits && !best.fits) ||
        (layout.fits === best.fits && layout.icon.width > best.icon.width)
      ) {
        best = layout;
      }
    }
    return best ?? lay(box);
  }

  /** Lays a centred icon and its label out in a content rectangle with a margin. */
  private centredIn(element: Element, margin: number): (content: Box) => CentredLayout {
    const key = `${element.id}\u0000${margin}`;
    let lay = this.centredLays.get(key);
    if (!lay) {
      lay = this.layCentredIn(element, margin);
      this.centredLays.set(key, lay);
    }
    return lay;
  }

  private layCentredIn(element: Element, margin: number): (content: Box) => CentredLayout {
    const column = this.plainColumn(element);
    const text = this.hasText(element);
    const bandWidth = text ? column.width : 0;
    const bandHeight = text ? column.slots.bottom - column.slots.top : 0;
    const side = this.labelSide(element);
    const across = side === "top" || side === "bottom";
    const written = this.styles.element(element).iconSize;
    return (content) => {
      const room = text ? margin + (across ? bandHeight : bandWidth) : 0;
      const rest: Box = across
        ? {
            x: content.x,
            y: side === "top" ? content.y + room : content.y,
            width: content.width,
            height: content.height - room,
          }
        : {
            x: side === "left" ? content.x + room : content.x,
            y: content.y,
            width: content.width - room,
            height: content.height,
          };
      const fit = Math.max(0, Math.min(rest.width, rest.height) - 2 * margin);
      const iconSide = Math.floor(typeof written === "number" ? Math.min(written, fit) : fit);
      const band: Box = across
        ? {
            x: content.x + margin,
            y:
              side === "top"
                ? content.y + margin
                : content.y + content.height - margin - bandHeight,
            width: Math.max(0, content.width - 2 * margin),
            height: bandHeight,
          }
        : {
            x:
              side === "left" ? content.x + margin : content.x + content.width - margin - bandWidth,
            y: content.y + content.height / 2 - bandHeight / 2,
            width: bandWidth,
            height: bandHeight,
          };
      const fits = across
        ? content.width - 2 * margin >= bandWidth - 1e-9 &&
          content.height >= 2 * margin + bandHeight - 1e-9
        : content.height - 2 * margin >= bandHeight - 1e-9 && rest.width > 0;
      return {
        content,
        margin,
        band,
        icon: boxFromCenter(boxCenter(rest), iconSide, iconSide),
        fits,
      };
    };
  }

  /**
   * The default box of an element with a centred icon: 120 × 120 at the 13 px label size, scaled
   * with it; wider for a long label below or above the icon, wider by the label's width less its
   * height for a label beside it (so the icon keeps the room a label below leaves it); grown to
   * hold a written `iconSize` with the padding around it. Shapes other than rectangles grow until
   * their inscribed rectangle holds the label and the icon a rectangle would.
   */
  private centredSize(element: Element): ShapeSize {
    let size = this.centredSizes.get(element.id);
    if (!size) {
      size = this.sizeCentred(element);
      this.centredSizes.set(element.id, size);
    }
    return size;
  }

  private sizeCentred(element: Element): ShapeSize {
    const { theme } = this;
    const p = theme.padding;
    const base = Math.round(120 * (theme.labelSize / 13));
    const column = this.plainColumn(element);
    const text = this.hasText(element);
    const bandWidth = text ? column.width : 0;
    const bandHeight = text ? column.slots.bottom - column.slots.top : 0;
    const side = this.labelSide(element);
    const written = this.styles.element(element).iconSize;
    const icon = typeof written === "number" ? written + 2 * p : 0;
    let width: number;
    let height: number;
    if (side === "top" || side === "bottom") {
      width = Math.max(base, text ? bandWidth + 2 * p : 0, icon);
      height = Math.max(base, icon > 0 ? icon + (text ? p + bandHeight : 0) : 0);
    } else {
      width = Math.max(
        base + (text ? Math.max(0, bandWidth - bandHeight) : 0),
        icon > 0 ? icon + (text ? p + bandWidth : 0) : 0,
      );
      height = Math.max(base, text ? bandHeight + 2 * p : 0, icon);
    }
    const size = { width: Math.ceil(width), height: Math.ceil(height) };
    if (RECTANGULAR.has(this.shapeOf(element))) return size;
    const target = this.centredIn(element, p)({ x: 0, y: 0, ...size }).icon.width;
    const grown = (step: number): ShapeSize => ({
      width: Math.ceil(size.width * (1 + step * 0.05)),
      height: Math.ceil(size.height * (1 + step * 0.05)),
    });
    const holds = (step: number) => {
      const layout = this.centredLayout(element, { x: 0, y: 0, ...grown(step) });
      return layout.fits && layout.icon.width >= target;
    };
    // A larger box holds more: the least step that holds is found by halving.
    if (holds(0) || !holds(GROWTH_STEPS)) return grown(holds(0) ? 0 : GROWTH_STEPS);
    let low = 0;
    let high = GROWTH_STEPS;
    while (high - low > 1) {
      const middle = (low + high) >> 1;
      if (holds(middle)) high = middle;
      else low = middle;
    }
    return grown(high);
  }

  /** The icon of a relation's label pill. */
  relationIcon(relation: Relation): PlacedIcon | undefined {
    return this.place(
      this.styles.relation(relation).icon,
      Math.round(this.scale.relationLabel * 1.3),
      "left",
    );
  }

  /** The icon of a free line's pill, as a relation's pill takes it. */
  lineIcon(line: Element): PlacedIcon | undefined {
    return this.place(
      this.styles.element(line).icon,
      Math.round(this.scale.relationLabel * 1.3),
      "left",
    );
  }

  /**
   * Label and description positions of a box, with the icon above or below them when it sits
   * there. The label is broken at `\n` into lines `line` apart; a one-line label sits where it
   * always did.
   */
  textBlock(element: Element): TextBlock {
    return this.blockWith(element, this.columnIcon(element));
  }

  /** The label and description of an element without its icon, as `textBlock` places them. */
  plainBlock(element: Element): TextBlock {
    return this.blockWith(element, undefined);
  }

  private blockWith(element: Element, icon: PlacedIcon | undefined): TextBlock {
    const font = this.labelFont(element);
    const description = this.descriptionFont(element);
    const scale = { description: description.size, descriptionLine: description.line };
    const label = font.size;
    const lines = splitLines(element.label).length;
    // How far the first line of the label lies above its last.
    const rows = (lines - 1) * font.line;
    const count = element.description ? splitLines(element.description).length : 0;
    const top = icon?.position === "top" || icon?.position === "bottom" ? icon.size + icon.gap : 0;
    let last = rows / 2;
    let descriptionOffsets: number[] = [];
    let height = label + rows;
    if (count > 0) {
      const gap = (label + scale.description) / 2 + 6;
      const extra = ((count - 1) * scale.descriptionLine) / 2;
      descriptionOffsets = Array.from(
        { length: count },
        (_, i) => gap / 2 + 1 + i * scale.descriptionLine - extra + rows / 2,
      );
      last = -(gap / 2 - 1) - extra + rows / 2;
      height = label / 2 + gap + (count - 1) * scale.descriptionLine + scale.description / 2 + rows;
    }
    const labelOffsets = Array.from({ length: lines }, (_, i) => last - rows + i * font.line);
    if (top === 0) return { labelOffsets, descriptionOffsets, height, iconOffset: 0 };
    // The icon sits above or below the text; the whole column is centred.
    const shift = icon!.position === "top" ? top / 2 : -top / 2;
    return {
      labelOffsets: labelOffsets.map((offset) => offset + shift),
      descriptionOffsets: descriptionOffsets.map((offset) => offset + shift),
      height: height + top,
      iconOffset:
        icon!.position === "top"
          ? -(height + top) / 2 + icon!.size / 2
          : (height + top) / 2 - icon!.size / 2,
    };
  }

  /** The widest of a box's label and description lines. */
  textWidth(element: Element): number {
    const { metrics } = this;
    const font = this.labelFont(element);
    const description = this.descriptionFont(element);
    let width = 0;
    for (const line of splitLines(element.label)) {
      width = Math.max(width, metrics.width(line, font.font, font.weight, font.size));
    }
    for (const line of element.description ? splitLines(element.description) : []) {
      width = Math.max(width, metrics.width(line, description.font, 400, description.size));
    }
    return width;
  }

  /**
   * The widest text of an element, the comfortable box width that fits it and its icon (used for
   * default sizes and hints), and the minimum width below which the content touches the edges.
   */
  textNeeds(element: Element): { text: string; width: number; minimum: number } {
    const { metrics, theme } = this;
    const widest = (entries: { text: string; width: number }[]) =>
      entries.reduce((a, b) => (b.width > a.width ? b : a), { text: "", width: 0 });
    const description = this.descriptionFont(element);
    const descriptions = (element.description ? splitLines(element.description) : []).map(
      (line) => ({
        text: line,
        width: metrics.width(line, description.font, 400, description.size),
      }),
    );
    const icon = this.iconOf(element);
    const beside = icon && icon.position === "left" ? icon.size + icon.gap : 0;
    switch (element.kind) {
      case "icon":
      case "image":
        return { text: "", width: 0, minimum: 0 };
      case "text": {
        const font = this.labelFont(element);
        const best = widest(
          splitLines(element.label).map((line) => ({
            text: line,
            width: metrics.width(line, font.font, font.weight, font.size),
          })),
        );
        const width = Math.ceil(Math.max(best.width, 1) + 2 * this.frameInset(element));
        return { text: best.text, width, minimum: width };
      }
      case "tag": {
        const tag = this.tagText(element);
        const width =
          metrics.width(element.label, tag.face.font, tag.face.weight, tag.scale.tag) + beside;
        return {
          text: element.label,
          width: tagPillWidth(metrics, tag.scale, element.label, beside, tag.face),
          minimum: Math.ceil(width + 2 * MIN_TEXT_MARGIN),
        };
      }
      case "note": {
        const font = this.noteFont(element);
        const best = widest(
          splitLines(element.label).map((line) => ({
            text: line,
            width: metrics.width(line, font.font, font.weight, font.size),
          })),
        );
        const width = Math.ceil(Math.max(best.width + beside, 1));
        return { text: best.text, width, minimum: width };
      }
      case "group": {
        // An untitled group has no text, so no minimum width.
        if (this.untitled(element)) return { text: "", width: 0, minimum: 0 };
        const font = this.groupFont(element);
        const title = {
          text: element.label,
          width: metrics.width(element.label, font.font, font.weight, font.size) + beside,
        };
        const best = widest([title, ...descriptions]);
        const inset = theme.groupPadding + 4;
        return {
          text: best.text,
          width: Math.ceil(best.width + 2 * inset),
          minimum: Math.ceil(best.width + inset + MIN_TEXT_MARGIN),
        };
      }
      default: {
        const content = this.contentWidth(element);
        return {
          text: this.widestLine(element),
          width: Math.ceil(content + 2 * theme.padding),
          minimum: Math.ceil(content + 2 * MIN_TEXT_MARGIN),
        };
      }
    }
  }

  /** The widest of a box's label and description lines. */
  private widestLine(element: Element): string {
    const { metrics } = this;
    const font = this.labelFont(element);
    const description = this.descriptionFont(element);
    const [first = "", ...rest] = splitLines(element.label);
    let best = { text: first, width: metrics.width(first, font.font, font.weight, font.size) };
    for (const line of rest) {
      const width = metrics.width(line, font.font, font.weight, font.size);
      if (width > best.width) best = { text: line, width };
    }
    for (const line of element.description ? splitLines(element.description) : []) {
      const width = metrics.width(line, description.font, 400, description.size);
      if (width > best.width) best = { text: line, width };
    }
    return best.text;
  }

  /** The width of a box's text column: its widest line, with its icon beside, above or below. */
  private contentWidth(element: Element): number {
    return this.contentWidthWith(element, this.columnIcon(element));
  }

  private contentWidthWith(element: Element, icon: PlacedIcon | undefined): number {
    const widest = this.textWidth(element);
    if (!icon) return widest;
    if (icon.position === "top" || icon.position === "bottom") return Math.max(widest, icon.size);
    return widest + icon.size + icon.gap;
  }

  defaultSize(element: Element): { width: number; height: number } {
    const { scale, theme } = this;
    if (element.kind === "sticky") {
      // A square that never grows for its text, scaled with the label size.
      const base = DEFAULT_SIZES.sticky!;
      const factor = theme.labelSize / 13;
      return { width: Math.round(base.width * factor), height: Math.round(base.height * factor) };
    }
    const needs = this.textNeeds(element);
    switch (element.kind) {
      case "tag":
        return { width: needs.width, height: this.tagText(element).scale.tagHeight };
      case "note":
        return {
          width: needs.width,
          height: splitLines(element.label).length * this.noteFont(element).line + 4,
        };
      case "text":
        return {
          width: needs.width,
          height:
            splitLines(element.label).length * this.labelFont(element).line +
            2 * this.frameInset(element),
        };
      case "icon":
        return { width: 48, height: 48 };
      case "image":
        return defaultImageSize(this.imageOf(element));
      default: {
        if (this.iconShaped(element)) return this.iconShapeSize(element);
        if (this.centred(element)) return this.centredSize(element);
        const shape = this.shapeOf(element);
        const base =
          element.kind === "box" || element.kind === "node"
            ? SHAPE_SIZES[shape]
            : (DEFAULT_SIZES[element.kind] ?? { width: 160, height: 56 });
        const factor = theme.labelSize / 13;
        const head = shape === "person" ? personHead(scale.label) * 2 : 0;
        // An icon beside the text is as tall as the text at least.
        const icon = this.columnIcon(element);
        const beside = icon && (icon.position === "left" || icon.position === "right");
        const text =
          Math.max(this.textBlock(element).height, beside ? icon.size : 0) +
          2 * Math.round(theme.padding * 0.8);
        // An agent's text sits in its body, below the head and the antenna.
        const fitted = Math.ceil(shape === "agent" ? agentHeight(text) : text + head);
        const width = Math.round(base.width * factor);
        const height = Math.max(Math.round(base.height * factor), fitted);
        if (FULL_WIDTH_TEXT.has(shape)) return { width: Math.max(width, needs.width), height };
        return this.shapedSize(element, width, height);
      }
    }
  }

  /**
   * The default size of a shaped box: its base size, widened until the text area holds the text
   * column with the padding on both sides; when the base is too small, the smallest box of the
   * base height or a taller one, so a diamond with several lines grows on both axes.
   */
  private shapedSize(
    element: Element,
    width: number,
    height: number,
  ): { width: number; height: number } {
    const at = (h: number) =>
      Math.max(width, this.widthAt(element, h, this.theme.padding, "slots"));
    let best = { width: at(height), height };
    if (best.width > width) {
      for (const factor of TALLER) {
        const h = Math.round(height * factor);
        const w = at(h);
        if (w * h < best.width * best.height) best = { width: w, height: h };
      }
    }
    if (!Number.isFinite(best.width)) {
      return { width: Math.max(width, this.textNeeds(element).width), height };
    }
    return best;
  }

  /** Whether a box-like element draws any text or icon. */
  private hasContent(element: Element): boolean {
    return (
      element.label.trim() !== "" ||
      (element.description ?? "").trim() !== "" ||
      this.iconOf(element) !== undefined
    );
  }

  /**
   * The size a `layout.text-overflow` of a shaped element suggests, found with the check's own
   * rows and margin so that it passes there: the narrowest width of the written height, else the
   * smallest box at least as wide and up to four times as tall, else the default size.
   */
  private fittingSize(element: Element, size: ShapeSize): ShapeSize {
    const at = (height: number) => this.widthAt(element, height, MIN_TEXT_MARGIN, "glyphs");
    const width = at(size.height);
    if (Number.isFinite(width)) return { width, height: size.height };
    let best: ShapeSize | undefined;
    for (const factor of TALLER) {
      const height = Math.round(size.height * factor);
      const w = Math.max(size.width, at(height));
      if (Number.isFinite(w) && (!best || w * height < best.width * best.height)) {
        best = { width: w, height };
      }
    }
    return best ?? this.defaultSize(element);
  }

  /**
   * Reports `layout.text-overflow` when an explicit size is too small for its content: narrower
   * than a box's text needs, or for a shape, a text area (the glyph rows) that does not hold the
   * text column with `MIN_TEXT_MARGIN` on both sides; an icon beside, above or below the text that
   * reaches out of the text area even at its least size; a centred icon or an icon shape's icon
   * left under `ICON_SIZE_RANGE.min`. A shape that draws no text is not checked.
   */
  checkOverflow(
    element: Element,
    size: { width: number; height: number },
    entry: SizeEntry,
    diagnostics: Diagnostic[],
  ): void {
    const words = messages();
    if (this.iconShaped(element)) {
      // An icon shape's text lies outside its box; its icon must keep its least size in it.
      const icon = this.iconOf(element);
      if (!icon || icon.size >= ICON_SIZE_RANGE.min) return;
      const holds = this.iconShapeSize(element);
      const fit = {
        width: Math.max(holds.width, size.width),
        height: Math.max(holds.height, size.height),
      };
      diagnostics.push({
        code: "layout.text-overflow",
        severity: "warning",
        message: words.diagnostics.iconTooSmall(
          element.id,
          size.width,
          size.height,
          fit.width,
          fit.height,
        ),
        range: entry.range,
        hints: [words.hints.iconTooSmall(element.id, fit.width, fit.height)],
        data: { ids: [element.id], size: { element: element.id, ...fit } },
      });
      return;
    }
    const needs = this.textNeeds(element);
    // The size at which the text fits: a wider box of the same height, or for a shape the size
    // its check passes at, taller when no width holds the text at the written height.
    let fit: ShapeSize;
    if (this.centred(element)) {
      // A centred icon gives way to its label, which must fit across the content, but keeps its
      // least size.
      const { content } = this.centredLayout(element, { x: 0, y: 0, ...size });
      const column = this.plainColumn(element);
      if (
        content.width >= column.width + 2 * MIN_TEXT_MARGIN - ROUNDING &&
        content.height >= column.slots.bottom - column.slots.top + 2 * MIN_TEXT_MARGIN - ROUNDING &&
        this.iconOf(element)!.size >= ICON_SIZE_RANGE.min
      ) {
        return;
      }
      const grown = this.centredSize(element);
      fit = {
        width: Math.max(grown.width, size.width),
        height: Math.max(grown.height, size.height),
      };
    } else if (BOX_KINDS.has(element.kind) && !FULL_WIDTH_TEXT.has(this.shapeOf(element))) {
      if (!this.hasContent(element)) return;
      const room = this.textArea(element, { x: 0, y: 0, ...size }, "glyphs").width;
      // Suggested widths are rounded to whole pixels, which may take `ROUNDING` off the room.
      if (room >= this.textColumn(element).width + 2 * MIN_TEXT_MARGIN - ROUNDING) return;
      fit = this.fittingSize(element, size);
    } else {
      // An icon in the text column must not reach out of the shape's text area: above or below a
      // box, into a person's head, below a cylinder.
      const box = { x: 0, y: 0, ...size };
      const spills =
        BOX_KINDS.has(element.kind) &&
        this.columnIcon(element) !== undefined &&
        !this.rowsFit(element, box, this.textColumn(element).slots);
      if (size.width >= needs.minimum && !spills) return;
      fit = {
        width: size.width >= needs.minimum ? size.width : needs.width,
        height: spills ? this.heightHolding(element, size) : size.height,
      };
    }
    const withIcon = this.iconOf(element) !== undefined;
    diagnostics.push({
      code: "layout.text-overflow",
      severity: "warning",
      message:
        fit.height === size.height
          ? words.diagnostics.textOverflow(element.id, size.width, withIcon, needs.text, fit.width)
          : words.diagnostics.textOverflowTall(
              element.id,
              size.width,
              size.height,
              withIcon,
              needs.text,
              fit.width,
              fit.height,
            ),
      range: entry.range,
      hints: [words.hints.textOverflow(element.id, fit.width, fit.height)],
      data: {
        ids: [element.id],
        size: { element: element.id, ...fit },
      },
    });
  }
}

class Emitter {
  readonly patterns: ScenePattern[] = [];
  readonly painter = new IconPainter();
  private readonly patternIds = new Map<string, string>();
  /** The title areas of drawn groups, which connectors pass under. */
  private readonly titles: { readonly id: string; readonly box: Box }[] = [];

  constructor(
    private readonly theme: Theme,
    private readonly scale: TypeScale,
    private readonly styles: StyleResolver,
    private readonly metrics: TextMetrics,
    private readonly sizing: Sizing,
    /** Whether the diagram is free, the only kind whose styles give `opacity`. */
    private readonly free: boolean = false,
    /** The diagram's elements by id, where the groups around an element are found. */
    private readonly elementsById: ReadonlyMap<string, Element> = new Map(),
    /**
     * The diagram's id, which the ids the scene declares (a sticky's clip) carry: a story frame
     * that cross-fades two views draws both scenes in one document.
     */
    private readonly diagramId: string = "",
  ) {}

  /**
   * The group of an element, group, line or pen of a free diagram with its style's `opacity`
   * times that of every group it is in as `styleOpacity`, which renderers multiply with a story's;
   * unchanged when it is opaque. A free scene is flat, so a group's children are its siblings and
   * a faded group fades them through their own groups.
   */
  private faded(group: GroupItem, element: Element): GroupItem {
    if (!this.free) return group;
    const own = (e: Element) => Math.max(0, Math.min(1, this.styles.element(e).opacity ?? 1));
    let opacity = own(element);
    for (const id of element.groupPath) {
      const holder = this.elementsById.get(id);
      if (holder) opacity *= own(holder);
    }
    return opacity >= 1 ? group : { ...group, styleOpacity: opacity };
  }

  private text(
    x: number,
    y: number,
    text: string,
    size: number,
    weight: number,
    fill: string,
    anchor: TextItem["anchor"] = "middle",
    font: TextFont = "body",
  ): TextItem {
    const baseline = round(this.metrics.baseline(y, font, weight, size));
    const stack = writtenStack(font);
    return {
      kind: "text",
      x: round(x),
      y: round(y),
      baseline,
      text,
      size,
      weight,
      font: fontRole(font),
      ...(stack !== undefined ? { stack } : {}),
      anchor,
      fill,
    };
  }

  /** The icon in a square of its size centred on (cx, cy). */
  private icon(placed: PlacedIcon, cx: number, cy: number, color: string): GroupItem {
    return this.painter.draw(
      placed.icon,
      cx - placed.size / 2,
      cy - placed.size / 2,
      placed.size,
      color,
    );
  }

  /** The id of the scene pattern of a kind and colour, declared on first use. */
  private pattern(kind: PatternKind, color: string): string {
    const key = `${kind}|${color}`;
    let id = this.patternIds.get(key);
    if (!id) {
      id = `pattern-${this.patterns.length + 1}`;
      this.patternIds.set(key, id);
      this.patterns.push({ id, kind, color, size: PATTERN_SIZE });
    }
    return `url(#${id})`;
  }

  /** The overlay of a patterned shape: the same outline, filled with the pattern. */
  private overlay(style: ResolvedStyle, shape: SceneItem): SceneItem[] {
    if (!style.pattern) return [];
    const fill = this.pattern(style.pattern, style.stroke ?? this.theme.muted);
    if (shape.kind === "rect") return [{ ...shape, fill, stroke: "none", strokeWidth: 0 }];
    if (shape.kind === "path") return [{ ...shape, fill, stroke: "none", strokeWidth: 0 }];
    return [];
  }

  private rect(
    box: Box,
    radius: number,
    fill: string,
    stroke: string,
    strokeWidth: number,
    dashed: StrokeDash,
  ): SceneItem {
    return {
      kind: "rect",
      x: round(box.x),
      y: round(box.y),
      width: round(box.width),
      height: round(box.height),
      radius,
      fill,
      stroke,
      strokeWidth,
      dashed,
    };
  }

  group(element: Element, box: Box): GroupItem {
    return this.faded(withUrl(withBounds(this.groupItems(element, box), box), element), element);
  }

  private groupItems(element: Element, box: Box): GroupItem {
    const { theme, scale } = this;
    const style = this.styles.element(element);
    const outline = this.rect(
      box,
      cornerRadius(style.radius ?? theme.groupRadius, box),
      style.fill ?? theme.band,
      style.stroke ?? theme.bandLine,
      style.width ?? theme.strokeWidth,
      strokeDash(style.line),
    );
    const items: SceneItem[] = [outline, ...this.overlay(style, outline)];
    // An untitled group is a plain container: no title, icon or description, and no title area
    // for connectors to pass under.
    if (this.sizing.untitled(element)) {
      return { kind: "group", id: element.id, role: "element", items };
    }
    const inset = theme.groupPadding + 4;
    const font = this.sizing.groupFont(element);
    const title = this.sizing.titleOffset(element);
    // The title band grows with a larger title; the description keeps its place under the title.
    const below = title - theme.groupHeader * 0.45;
    const titleY = box.y + title;
    const color = style.color ?? theme.ink;
    let titleX = box.x + inset;
    const icon = this.sizing.iconOf(element);
    if (icon) {
      items.push(this.icon(icon, titleX + icon.size / 2, titleY, style.iconColor ?? color));
      titleX += icon.size + icon.gap;
    }
    items.push(
      this.text(titleX, titleY, element.label, font.size, font.weight, color, "start", font.font),
    );
    // The title, and the description under it, are kept clear of connectors.
    const titleWidth = this.metrics.width(element.label, font.font, font.weight, font.size);
    const descriptionWidth = element.description
      ? this.metrics.width(element.description, font.font, 400, scale.description)
      : 0;
    const right = Math.max(titleX + titleWidth, box.x + inset + descriptionWidth);
    this.titles.push({
      id: element.id,
      box: {
        x: box.x + inset - TITLE_GAP,
        y: titleY - font.size * 0.75 - TITLE_GAP,
        width: right - (box.x + inset) + 2 * TITLE_GAP,
        height:
          (element.description
            ? box.y + below + theme.groupHeader * 0.85 + scale.description * 0.6
            : titleY + font.size * 0.6) -
          (titleY - font.size * 0.75) +
          2 * TITLE_GAP,
      },
    });
    if (element.description) {
      items.push(
        this.text(
          box.x + inset,
          box.y + below + theme.groupHeader * 0.85,
          element.description,
          scale.description,
          400,
          style.color ?? theme.muted,
          "start",
          font.font,
        ),
      );
    }
    return { kind: "group", id: element.id, role: "element", items };
  }

  element(element: Element, box: Box): GroupItem {
    return this.faded(
      withUrl(
        withBounds(
          this.elementItems(element, box),
          box,
          this.sizing.innerArea(element, box),
          this.sizing.outsideLabel(element, box)?.box,
        ),
        element,
      ),
      element,
    );
  }

  private elementItems(element: Element, box: Box): GroupItem {
    switch (element.kind) {
      case "note":
        return this.note(element, box);
      case "sticky":
        return this.sticky(element, box);
      case "tag":
        return this.tag(element, box);
      case "text":
        return this.freeText(element, box);
      case "icon":
        return this.iconObject(element, box);
      case "image":
        return this.imageObject(element, box);
      default:
        return this.shape(element, box);
    }
  }

  /** The frame of a free text, icon or image when the style sets `fill`, `stroke` or `pattern`. */
  private freeFrame(element: Element, box: Box, fill = true): SceneItem[] {
    const style = this.styles.element(element);
    if (!(style.fill || style.stroke || style.pattern)) return [];
    const outline = this.rect(
      box,
      cornerRadius(style.radius ?? this.theme.radius, box),
      fill ? (style.fill ?? "none") : "none",
      style.stroke ?? "none",
      style.width ?? this.theme.strokeWidth,
      strokeDash(style.line),
    );
    return [outline, ...this.overlay(style, outline)];
  }

  /**
   * A placeholder for an icon or image that cannot be drawn: a dashed frame with its name when the
   * name fits, or a cross when it does not.
   */
  private placeholder(box: Box, name: string): SceneItem[] {
    const { theme, scale } = this;
    const center = boxCenter(box);
    const items: SceneItem[] = [
      this.rect(box, theme.radius, "none", theme.muted, theme.strokeWidth, true),
    ];
    if (this.metrics.width(name, "body", 400, scale.note) <= box.width - 8) {
      items.push(this.text(center.x, center.y, name, scale.note, 400, theme.muted));
    } else {
      const inset = Math.min(box.width, box.height) / 4;
      items.push({
        kind: "path",
        d: `M${round(box.x + inset)} ${round(box.y + inset)}L${round(box.x + box.width - inset)} ${round(box.y + box.height - inset)}M${round(box.x + box.width - inset)} ${round(box.y + inset)}L${round(box.x + inset)} ${round(box.y + box.height - inset)}`,
        fill: "none",
        stroke: theme.muted,
        strokeWidth: theme.strokeWidth,
        dashed: false,
      });
    }
    return items;
  }

  private freeText(element: Element, box: Box): GroupItem {
    const style = this.styles.element(element);
    const items: SceneItem[] = [...this.freeFrame(element, box)];
    const font = this.sizing.labelFont(element);
    const inset = this.sizing.frameInset(element);
    const align = this.sizing.alignOf(element);
    const lines = splitLines(element.label);
    const x =
      align === "left"
        ? box.x + inset
        : align === "right"
          ? box.x + box.width - inset
          : box.x + box.width / 2;
    const anchor: TextItem["anchor"] =
      align === "left" ? "start" : align === "right" ? "end" : "middle";
    const top = box.y + box.height / 2 - (lines.length * font.line) / 2;
    lines.forEach((line, i) => {
      items.push(
        this.text(
          x,
          top + font.line / 2 + i * font.line,
          line,
          font.size,
          font.weight,
          style.color ?? this.theme.ink,
          anchor,
          font.font,
        ),
      );
    });
    return { kind: "group", id: element.id, role: "element", items };
  }

  private iconObject(element: Element, box: Box): GroupItem {
    const style = this.styles.element(element);
    const items: SceneItem[] = [...this.freeFrame(element, box)];
    const icon = this.sizing.sourceIcon(element);
    if (!icon) {
      items.push(...this.placeholder(box, element.source ?? element.id));
      return { kind: "group", id: element.id, role: "element", items };
    }
    const inset = this.sizing.frameInset(element);
    const size = Math.max(0, Math.min(box.width, box.height) - 2 * inset);
    const center = boxCenter(box);
    const color = style.iconColor ?? style.color ?? this.theme.ink;
    items.push(this.icon({ icon, size, gap: 0, position: "left" }, center.x, center.y, color));
    return { kind: "group", id: element.id, role: "element", items };
  }

  private imageObject(element: Element, box: Box): GroupItem {
    const image = this.sizing.imageOf(element);
    const items: SceneItem[] = [];
    if (!image) {
      const name = (element.source ?? element.id).split("/").pop() ?? element.id;
      items.push(...this.placeholder(box, name));
      return { kind: "group", id: element.id, role: "element", items };
    }
    items.push({
      kind: "image",
      x: round(box.x),
      y: round(box.y),
      width: round(box.width),
      height: round(box.height),
      href: image.href,
      title: element.description,
    });
    items.push(...this.freeFrame(element, box, false));
    return { kind: "group", id: element.id, role: "element", items };
  }

  private shape(element: Element, box: Box): GroupItem {
    if (this.sizing.iconShaped(element)) return this.iconShape(element, box);
    const { theme } = this;
    const style = this.styles.element(element);
    const fill = style.fill ?? theme.surface;
    const stroke = style.stroke ?? theme.line;
    const strokeWidth = style.width ?? theme.strokeWidth;
    const dashed = strokeDash(style.line);
    const items: SceneItem[] = [];
    const shape = this.sizing.shapeOf(element);
    const path = (d: string): SceneItem => ({ kind: "path", d, fill, stroke, strokeWidth, dashed });
    // The outline, with the pattern overlay on it.
    const outline = (item: SceneItem) => items.push(item, ...this.overlay(style, item));
    switch (shape) {
      case "cylinder": {
        const { body, top } = cylinderPaths(box);
        outline(path(body));
        items.push(path(top));
        break;
      }
      case "diamond":
        // Sharp vertices, or rounded by the element's `radius`.
        outline(path(shapeOutline("diamond", box, this.sizing.shapeOptions(element)).d));
        break;
      case "ellipse":
      case "circle":
        outline(path(ellipsePath(box)));
        break;
      case "person": {
        // A head above a rounded body; the text sits in the body.
        const r = Math.min(this.sizing.shapeOptions(element).head!, box.width / 2, box.height / 3);
        const body = {
          x: box.x,
          y: box.y + r * 1.6,
          width: box.width,
          height: box.height - r * 1.6,
        };
        outline(
          this.rect(
            body,
            Math.min(this.sizing.shapeOptions(element).radius!, body.height / 2, body.width / 2),
            fill,
            stroke,
            strokeWidth,
            dashed,
          ),
        );
        items.push(
          path(
            ellipsePath({ x: box.x + box.width / 2 - r, y: box.y, width: 2 * r, height: 2 * r }),
          ),
        );
        break;
      }
      case "rounded":
        outline(
          this.rect(
            box,
            cornerRadius(style.radius ?? theme.radius, box),
            fill,
            stroke,
            strokeWidth,
            dashed,
          ),
        );
        break;
      case "rectangle":
      case "square":
        outline(
          this.rect(box, cornerRadius(style.radius ?? 0, box), fill, stroke, strokeWidth, dashed),
        );
        break;
      case "pill":
        // Half the shorter side: a pill taller than wide is the upright stadium of its outline.
        outline(this.rect(box, cornerRadius(Infinity, box), fill, stroke, strokeWidth, dashed));
        break;
      case "framed":
        outline(
          this.rect(box, cornerRadius(style.radius ?? 0, box), fill, stroke, strokeWidth, dashed),
        );
        items.push({
          kind: "path",
          d: framedLines(box),
          fill: "none",
          stroke,
          strokeWidth,
          dashed,
        });
        break;
      default:
        outline(path(shapeOutline(shape, box, this.sizing.shapeOptions(element)).d));
    }
    const labelColor = style.color ?? theme.ink;
    const icon = this.sizing.iconOf(element);
    const align = this.sizing.alignOf(element);
    if (icon && this.sizing.centred(element)) {
      // The icon is the picture of the box; the label takes a band at an edge.
      const layout = this.sizing.centredLayout(element, box);
      const center = boxCenter(layout.icon);
      // An icon under its least size is a smudge: it is left out, and `layout.text-overflow` says so.
      if (layout.icon.width >= ICON_SIZE_RANGE.min) {
        items.push(
          this.icon(
            { ...icon, size: layout.icon.width },
            center.x,
            center.y,
            style.iconColor ?? labelColor,
          ),
        );
      }
      const { band } = layout;
      const column = this.sizing.plainColumn(element);
      const x =
        align === "left" ? band.x : align === "right" ? band.x + band.width : boxCenter(band).x;
      this.lines(
        items,
        element,
        x,
        band.y - column.slots.top,
        this.sizing.plainBlock(element),
        align,
      );
      return { kind: "group", id: element.id, role: "element", items };
    }
    // At the shape's text centre, or where `verticalAlign` moves the block.
    const textCenter = this.sizing.textCenter(element, box);
    const block = this.sizing.textBlock(element);
    // Aligned text keeps the padding inside the shape's text area.
    const area = this.sizing.textArea(element, box, "slots");
    const inner = { left: area.x + theme.padding, right: area.x + area.width - theme.padding };
    let textX = align === "left" ? inner.left : align === "right" ? inner.right : textCenter.x;
    let anchor: TextItem["anchor"] =
      align === "left" ? "start" : align === "right" ? "end" : "middle";
    if (icon?.position === "top" || icon?.position === "bottom") {
      const iconX =
        align === "left"
          ? inner.left + icon.size / 2
          : align === "right"
            ? inner.right - icon.size / 2
            : textCenter.x;
      items.push(
        this.icon(icon, iconX, textCenter.y + block.iconOffset, style.iconColor ?? labelColor),
      );
    } else if (icon) {
      // Icon, gap and left-aligned text form one row, centred in the box unless aligned; an icon
      // on the right follows the text.
      const textWidth = this.sizing.textWidth(element);
      const row = icon.size + icon.gap + textWidth;
      const left =
        align === "left"
          ? inner.left
          : align === "right"
            ? inner.right - row
            : textCenter.x - row / 2;
      const right = icon.position === "right";
      const iconX = right ? left + textWidth + icon.gap + icon.size / 2 : left + icon.size / 2;
      items.push(this.icon(icon, iconX, textCenter.y, style.iconColor ?? labelColor));
      textX = right ? left : left + icon.size + icon.gap;
      anchor = "start";
    }
    this.lines(items, element, textX, textCenter.y, block, anchor);
    return { kind: "group", id: element.id, role: "element", items };
  }

  /**
   * The label and description lines of a box-like element, anchored at `x` (`align` names the
   * anchor's side) about a text centre `y`, with the offsets of `block`.
   */
  private lines(
    items: SceneItem[],
    element: Element,
    x: number,
    y: number,
    block: TextBlock,
    align: "left" | "center" | "right" | TextItem["anchor"],
  ): void {
    const { theme } = this;
    const style = this.styles.element(element);
    const font = this.sizing.labelFont(element);
    const description = this.sizing.descriptionFont(element);
    const anchor: TextItem["anchor"] =
      align === "left"
        ? "start"
        : align === "right"
          ? "end"
          : align === "center"
            ? "middle"
            : align;
    splitLines(element.label).forEach((line, i) => {
      items.push(
        this.text(
          x,
          y + block.labelOffsets[i]!,
          line,
          font.size,
          font.weight,
          style.color ?? theme.ink,
          anchor,
          font.font,
        ),
      );
    });
    const descriptionLines = element.description ? splitLines(element.description) : [];
    descriptionLines.forEach((line, i) => {
      items.push(
        this.text(
          x,
          y + block.descriptionOffsets[i]!,
          line,
          description.size,
          400,
          style.color ?? theme.muted,
          anchor,
          description.font,
        ),
      );
    });
  }

  /**
   * An icon shape: the icon alone in its box, framed only by a `fill`, `stroke` or `pattern`, or a
   * dashed placeholder when it has none to draw; its label outside the box.
   */
  private iconShape(element: Element, box: Box): GroupItem {
    const style = this.styles.element(element);
    const items: SceneItem[] = [...this.freeFrame(element, box)];
    const icon = this.sizing.iconOf(element);
    if (!icon) {
      items.push(...this.placeholder(box, style.icon ?? element.id));
    } else if (icon.size >= ICON_SIZE_RANGE.min) {
      // A smaller icon, which a written size leaves in its frame, is reported, not drawn.
      // The icon is the shape: it fills its square, without the pack's optical scale.
      const center = boxCenter(box);
      const color = style.iconColor ?? style.color ?? this.theme.ink;
      items.push(
        this.icon({ ...icon, icon: { ...icon.icon, scale: 1 } }, center.x, center.y, color),
      );
    }
    const label = this.sizing.outsideLabel(element, box);
    if (label) {
      this.lines(items, element, label.x, label.y, this.sizing.plainBlock(element), label.anchor);
    }
    return { kind: "group", id: element.id, role: "element", items };
  }

  private note(element: Element, box: Box): GroupItem {
    const { theme } = this;
    const style = this.styles.element(element);
    const items: SceneItem[] = [];
    if (style.fill || style.stroke || style.pattern) {
      const outline = this.rect(
        box,
        cornerRadius(style.radius ?? theme.radius, box),
        style.fill ?? "none",
        style.stroke ?? "none",
        style.width ?? theme.strokeWidth,
        strokeDash(style.line),
      );
      items.push(outline, ...this.overlay(style, outline));
    }
    const color = style.color ?? theme.muted;
    const font = this.sizing.noteFont(element);
    const icon = this.sizing.iconOf(element);
    const indent = icon ? icon.size + icon.gap : 0;
    if (icon) {
      items.push(
        this.icon(icon, box.x + icon.size / 2, box.y + font.line / 2, style.iconColor ?? color),
      );
    }
    // The lines are aligned in the room right of the icon: at its edge, its middle or the box's.
    const align = this.sizing.alignOf(element);
    const x =
      align === "left"
        ? box.x + indent
        : align === "right"
          ? box.x + box.width
          : box.x + indent + (box.width - indent) / 2;
    const anchor: TextItem["anchor"] =
      align === "left" ? "start" : align === "right" ? "end" : "middle";
    splitLines(element.label).forEach((line, i) => {
      items.push(
        this.text(
          x,
          box.y + font.line / 2 + i * font.line,
          line,
          font.size,
          font.weight,
          color,
          anchor,
          font.font,
        ),
      );
    });
    return { kind: "group", id: element.id, role: "element", items };
  }

  /**
   * A sticky: a soft shadow 3 px under its card, the card in the theme's `sticky` colour (or its
   * `fill`) with `radius` 2 and an outline only when its style writes `stroke`, its icon at the
   * top left inside the padding, and its text (`Sizing.stickyText`) in `stickyText` (or its
   * `color`), wrapped and shrunk to the card, aligned by `textAlign` and `verticalAlign`. Text that
   * does not fit even at the smallest size starts at the top and is clipped to the card.
   */
  private sticky(element: Element, box: Box): GroupItem {
    const { theme } = this;
    const style = this.styles.element(element);
    const radius = cornerRadius(style.radius ?? STICKY_RADIUS, box);
    const shadow: RectItem = {
      kind: "rect",
      x: round(box.x),
      y: round(box.y + STICKY_SHADOW.offset),
      width: round(box.width),
      height: round(box.height),
      radius,
      fill: STICKY_SHADOW.color,
      stroke: "none",
      strokeWidth: 0,
      dashed: false,
      opacity: STICKY_SHADOW.opacity,
    };
    const card = this.rect(
      box,
      radius,
      style.fill ?? theme.sticky,
      style.stroke ?? "none",
      style.stroke ? (style.width ?? theme.strokeWidth) : 0,
      strokeDash(style.line),
    );
    const items: SceneItem[] = [shadow, card];
    const text = this.sizing.stickyPlace(element, box);
    const { area, line } = text;
    const color = style.color ?? theme.stickyText;
    const icon = this.sizing.iconOf(element);
    if (icon) {
      // In the top left corner inside the padding, on a row of its own above the text.
      const x = box.x + theme.padding + icon.size / 2;
      const y = box.y + theme.padding + icon.size / 2;
      items.push(this.icon(icon, x, y, style.iconColor ?? color));
    }
    const block = text.lines.length * line;
    const top = !text.fits
      ? area.y
      : text.verticalAlign === "top"
        ? area.y
        : text.verticalAlign === "bottom"
          ? area.y + area.height - block
          : area.y + (area.height - block) / 2;
    const x =
      text.align === "left"
        ? area.x
        : text.align === "right"
          ? area.x + area.width
          : area.x + area.width / 2;
    const anchor: TextItem["anchor"] =
      text.align === "left" ? "start" : text.align === "right" ? "end" : "middle";
    text.lines.forEach((content, i) => {
      items.push(
        this.text(
          x,
          top + line / 2 + i * line,
          content,
          text.size,
          text.weight,
          color,
          anchor,
          text.font,
        ),
      );
    });
    const group: GroupItem = { kind: "group", id: element.id, role: "element", items };
    if (text.fits) return group;
    const clip: SceneClip = {
      id: `clip-${xmlName(this.diagramId)}-${xmlName(element.id)}`,
      x: round(box.x),
      y: round(box.y),
      width: round(box.width),
      height: round(box.height),
      radius,
    };
    return { ...group, textClip: clip };
  }

  private tag(element: Element, box: Box): GroupItem {
    const { theme } = this;
    const style = this.styles.element(element);
    const fill = style.fill ?? theme.tag;
    const center = boxCenter(box);
    const color = style.color ?? theme.tagText;
    const { scale, face } = this.sizing.tagText(element);
    // The pill sequence tags share, upright when the tag is taller than wide.
    const { outline, label } = tagPill(
      this.metrics,
      scale,
      box,
      element.label,
      {
        fill,
        stroke: style.stroke ?? fill,
        strokeWidth: style.width ?? theme.strokeWidth,
        dashed: strokeDash(style.line),
        color,
      },
      face,
    );
    const items: SceneItem[] = [outline, ...this.overlay(style, outline)];
    const icon = this.sizing.iconOf(element);
    if (icon) {
      const textWidth = this.metrics.width(element.label, face.font, face.weight, scale.tag);
      const left = center.x - (icon.size + icon.gap + textWidth) / 2;
      items.push(this.icon(icon, left + icon.size / 2, center.y, style.iconColor ?? color));
      items.push(
        this.text(
          left + icon.size + icon.gap,
          center.y,
          element.label,
          scale.tag,
          face.weight,
          color,
          "start",
          face.font,
        ),
      );
    } else {
      items.push(label);
    }
    return { kind: "group", id: element.id, role: "element", items };
  }

  relation(
    relation: Relation,
    line: readonly Point[],
    start: readonly MarkerPart[],
    end: readonly MarkerPart[],
    label: { box: Box; text: string; technology: string | null } | undefined,
    curve?: string,
  ): GroupItem {
    const style = this.styles.relation(relation);
    // An assumption is drawn dashed in the muted colour until a style says otherwise.
    const assumed = relation.assumption !== null;
    // A straight connector passes under the titles of groups it crosses (not its own ends'). It
    // is drawn from beyond the labels its own ends draw outside their boxes (see `underLabel`).
    const holes = this.titles
      .filter((t) => t.id !== relation.from && t.id !== relation.to)
      .map((t) => t.box);
    const items = this.connectorItems(
      relation.key,
      style,
      style.stroke ?? (assumed ? this.theme.muted : this.theme.connector),
      strokeDash(style.line ?? (assumed ? "dashed" : relation.line)),
      holes,
      line,
      start,
      end,
      label,
      this.sizing.relationIcon(relation),
      curve,
    );
    return { kind: "group", id: relation.key, role: "relation", items, track: roundedPoints(line) };
  }

  /**
   * A free line: a connector without ends, drawn as a relation is (its line, its heads, its pill),
   * as an element group whose `track` is its drawn line and whose `bounds` is its box. A line whose
   * points coincide is a dot of its width.
   */
  line(
    element: Element,
    box: Box,
    line: readonly Point[],
    start: readonly MarkerPart[],
    end: readonly MarkerPart[],
    label: { box: Box; text: string } | undefined,
    curve?: string,
  ): GroupItem {
    const style = this.styles.element(element);
    const stroke = style.stroke ?? this.theme.connector;
    const strokeWidth = style.width ?? this.theme.connectorWidth;
    const first = line[0];
    const dot = first !== undefined && line.every((p) => p.x === first.x && p.y === first.y);
    const items: SceneItem[] = dot
      ? [
          {
            kind: "path",
            d: circlePath(round(first.x), round(first.y), Math.max(1, strokeWidth)),
            fill: stroke,
            stroke: "none",
            strokeWidth: 0,
            dashed: false,
          },
        ]
      : this.connectorItems(
          element.id,
          style,
          stroke,
          strokeDash(style.line ?? "solid"),
          [],
          line,
          start,
          end,
          label && { ...label, technology: null },
          this.sizing.lineIcon(element),
          curve,
        );
    return this.faded(
      withBounds(
        { kind: "group", id: element.id, role: "element", items, track: roundedPoints(line) },
        box,
      ),
      element,
    );
  }

  /**
   * A pen stroke: one path through its points (`penPath`) with round caps and joins and no fill,
   * in its `stroke` (the theme's `ink`), `width`, `line` and `opacity`, then its heads; a stroke
   * whose points coincide is a disc of its width. An element group marked `freehand`, whose
   * `track` is its points and whose `bounds` is its box. `points` are all its points; `line` the
   * same cut where its heads begin.
   */
  pen(
    element: Element,
    box: Box,
    points: readonly Point[],
    line: readonly Point[],
    start: readonly MarkerPart[],
    end: readonly MarkerPart[],
  ): GroupItem {
    const style = this.styles.element(element);
    const stroke = style.stroke ?? this.theme.ink;
    const width = penWidth(style);
    const first = points[0]!;
    const items: SceneItem[] = isDot(points)
      ? [
          {
            kind: "path",
            d: circlePath(round(first.x), round(first.y), width / 2),
            fill: stroke,
            stroke: "none",
            strokeWidth: 0,
            dashed: false,
          },
        ]
      : [
          {
            kind: "path",
            d: penPath(line),
            fill: "none",
            stroke,
            strokeWidth: width,
            dashed: strokeDash(style.line),
            rounded: true,
          },
          ...markerItems(start, stroke, width),
          ...markerItems(end, stroke, width),
        ];
    return this.faded(
      withBounds(
        {
          kind: "group",
          id: element.id,
          role: "element",
          freehand: true,
          items,
          track: roundedPoints(points),
        },
        box,
      ),
      element,
    );
  }

  /**
   * The items of a connector, in the order motion and hit tests expect: its line (pieces around
   * `holes`, or one curve), its heads, then its label pill with its icon and text.
   */
  private connectorItems(
    id: string,
    style: ResolvedStyle,
    stroke: string,
    dashed: StrokeDash,
    holes: readonly Box[],
    line: readonly Point[],
    start: readonly MarkerPart[],
    end: readonly MarkerPart[],
    label: { box: Box; text: string; technology: string | null } | undefined,
    icon: PlacedIcon | undefined,
    curve: string | undefined,
  ): SceneItem[] {
    const { theme } = this;
    const face = pillText(theme, this.scale, style);
    const scale = face.scale;
    const strokeWidth = style.width ?? theme.connectorWidth;
    const pieces = curve ? [] : splitAround(line, holes);
    const items: SceneItem[] = curve
      ? [{ kind: "path", d: curve, fill: "none", stroke, strokeWidth, dashed }]
      : pieces.map((piece): SceneItem => ({
          kind: "polyline",
          points: roundedPoints(piece),
          stroke,
          strokeWidth,
          dashed,
        }));
    // The line first, so a moving dash finds it; the heads after it; the label last.
    items.push(
      ...markerItems(start, stroke, strokeWidth),
      ...markerItems(end, stroke, strokeWidth),
    );
    if (label) {
      const fill = style.fill ?? theme.surface;
      const techSize = technologySize(scale.relationLabel);
      const techLine = label.technology ? Math.round(techSize * 1.25) : 0;
      const box = label.box;
      // The first line keeps the single-line position; the technology goes below it.
      const center = { x: box.x + box.width / 2, y: box.y + (box.height - techLine) / 2 };
      const color = style.color ?? theme.ink;
      const pill: SceneItem[] = [
        this.rect(
          label.box,
          Math.min(label.box.height, scale.relationLabelHeight) / 2,
          fill,
          style.stroke ?? (style.fill ? style.fill : theme.line),
          theme.strokeWidth,
          false,
        ),
      ];
      if (icon && label.text === "") {
        pill.push(this.icon(icon, center.x, center.y, style.iconColor ?? color));
      } else if (icon) {
        const textWidth = this.metrics.width(
          label.text,
          face.font,
          face.weight,
          scale.relationLabel,
        );
        const left = center.x - (icon.size + icon.gap + textWidth) / 2;
        pill.push(this.icon(icon, left + icon.size / 2, center.y, style.iconColor ?? color));
        pill.push(
          this.text(
            left + icon.size + icon.gap,
            center.y,
            label.text,
            scale.relationLabel,
            face.weight,
            color,
            "start",
            face.font,
          ),
        );
      } else if (label.text !== "") {
        pill.push(
          this.text(
            center.x,
            center.y,
            label.text,
            scale.relationLabel,
            face.weight,
            color,
            "middle",
            face.font,
          ),
        );
      }
      if (label.technology) {
        const y = label.text === "" && !icon ? box.y + box.height / 2 : center.y + techLine;
        pill.push(
          this.text(
            center.x,
            y,
            label.technology,
            techSize,
            400,
            style.color ?? theme.muted,
            "middle",
            face.font,
          ),
        );
      }
      items.push({ kind: "group", id, role: "label", items: pill });
    }
    return items;
  }

  /** The brand strip: hairline, mark, wordmark and diagram title, spanning the canvas. */
  frame(width: number, stripTop: number, title: string | null): GroupItem {
    return brandFrame(this.theme, this.scale, this.metrics, width, stripTop, title);
  }
}
