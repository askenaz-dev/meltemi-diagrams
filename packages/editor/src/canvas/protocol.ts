import type { StoryTimeline, StoryViewData } from "@meltemi/diagrams-motion";
import type { AlignEdge } from "./arrange.js";
import type { Box, Point } from "./geometry.js";
import type { Side } from "./routes.js";

export type ElementKind =
  | "node"
  | "decision"
  | "data"
  | "group"
  | "note"
  | "tag"
  | "box"
  | "text"
  | "icon"
  | "image"
  | "line"
  | "pen"
  | "sticky"
  | "participant"
  | "actor"
  | "boundary"
  | "control"
  | "entity"
  | "database"
  | "collections"
  | "queue"
  | "person"
  | "system"
  | "container"
  | "datastore"
  | "component";
/** The profile of a diagram, which sets the palette, the keys and the drags. */
export type CanvasProfile = "flow" | "free" | "sequence" | "c4";
export type FragmentOperator = "alt" | "opt" | "loop" | "par" | "break" | "critical" | "region";
export type EventKind =
  | "message"
  | "activate"
  | "deactivate"
  | "create"
  | "destroy"
  | "note"
  | "fragment"
  | "divider"
  | "delay";
export type ZOrder = "front" | "back" | "forward" | "backward";
export type LayoutMode = "auto" | "assisted" | "manual";

/**
 * The shapes of free boxes and flow nodes in the order the canvas offers them: the language's
 * `BOX_SHAPES`, mirrored here so that the canvas page does not load the model (a test pins it).
 * `icon` draws the element as its icon alone, its label outside.
 */
export const SHAPES = [
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
export type ShapeName = (typeof SHAPES)[number];

/**
 * Where an element's icon goes, the values of `iconPosition`: beside, above or below its text, or
 * at the centre as the picture of the box. The language's `ICON_POSITIONS`, mirrored (a test pins
 * it).
 */
export const ICON_POSITIONS = ["left", "right", "top", "bottom", "center"] as const;
/**
 * Where the label goes when the icon is the centre piece, the values of `labelPosition`: the
 * language's `LABEL_POSITIONS`, mirrored.
 */
export const LABEL_POSITIONS = ["top", "bottom", "left", "right"] as const;
/** The sides `iconSize` writes, in pixels; `auto` fits the icon to the box. */
export const ICON_SIZES = { min: 8, max: 128 } as const;

/**
 * Where and how a label is drawn, in diagram coordinates, read from the layout's scene: the inline
 * editor types over it in the same font, size, weight, colour and alignment.
 */
export interface TextPlace {
  /**
   * The point the lines are aligned on (`x`: their left end, middle or right end, by `align`) and
   * centred on (`y`: the middle of the label's lines).
   */
  readonly anchor: Point;
  /**
   * The room the text has, which the editor covers at least: a shape's inscribed text area inside
   * the padding (the body of a person or an agent), the box of a group, note, tag or free text, a
   * relation's label pill, or nothing around the middle of a relation without a label.
   */
  readonly area: Box;
  readonly align: "left" | "center" | "right";
  /** The CSS font stack. */
  readonly font: string;
  readonly size: number;
  /**
   * A sticky note's: the size its words are drawn at before they shrink to fit the card (its
   * `fontSize`, or 1.2 times the theme's label size), which `size` is when they fit. The editor
   * types from it, so a long text shortened is typed at the size the card will draw it.
   */
  readonly fullSize?: number;
  readonly weight: number;
  readonly color: string;
  /** The distance between two lines. */
  readonly line: number;
  /** Whether the drawing breaks the text at `\n`: labels of shapes, texts and notes. */
  readonly lines: boolean;
  /**
   * The fill of a relation's label pill, which the editor takes so the line does not cross what
   * is typed, as it does not cross the drawn label. Absent for the others: they have none.
   */
  readonly background?: string;
  /**
   * How the drawing wraps the text in `area`, for an editor that wraps as it does; absent when the
   * drawing does not wrap it. `shrink`: a sticky's text, wrapped at the area's width and shrunk to
   * fit the card (from `fullSize`). `grow`: the label of a sequence message whose participants are
   * pulled closer than their natural distance (`MessageText.wraps`), wrapped at the area's width
   * (the room between its lifelines) at `size`, never shrunk; the block keeps its top (`area.y`,
   * the top of the first line) and grows down by `line` with each line, as the row grows. A
   * message at its natural distance (its label pushes the pair apart) and a self-call have none.
   */
  readonly wrap?: "shrink" | "grow";
}

/**
 * A tag of a sequence participant or message (`tag "Text"` in its block), as drawn: a pill of the
 * owner, which a press selects and a drag drags with it.
 */
export interface TagInfo {
  /** The text written in the tag. */
  readonly text: string;
  /** The pill, in diagram coordinates. */
  readonly box: Box;
  /**
   * Where the pill's text is drawn, for the inline editor of the tag: its mono font, size, weight
   * and colour, centred on the pill, the pill's fill as its background. Absent when the drawing
   * holds no such pill.
   */
  readonly place?: TextPlace;
}

/** What the canvas knows about an element. */
export interface ElementInfo {
  readonly id: string;
  readonly kind: ElementKind;
  readonly label: string;
  /** The innermost group, or null. */
  readonly parent: string | null;
  /** Diagram coordinates. */
  readonly box: Box;
  readonly placed: boolean;
  /** A group with `place` and `size`, which has resize handles. */
  readonly sized: boolean;
  /** The layer of an object of a free diagram, or null for the default layer. */
  readonly layer: string | null;
  /**
   * The shape the element is drawn with, from its style or its kind (a decision is a `diamond`, a
   * data store a `cylinder`); `rounded` for groups. Selection handles stay on `box`.
   */
  readonly shape: ShapeName;
  /**
   * Degrees the element is drawn turned, clockwise about the centre of `box`, which stays the
   * unturned box; absent when it is upright. Its outline, handles, magnets and pinned points are
   * in its own frame and turned for drawing (decision 0045).
   */
  readonly rotation?: number;
  /**
   * The corner radius its outline is drawn with (`ShapeOptions.radius`) where its shape has
   * corners and one is drawn, for outlines, magnets and hit tests that match the drawing.
   */
  readonly radius?: number;
  readonly ports: readonly {
    readonly name: string;
    readonly side: Side;
    readonly position: number;
  }[];
  /** Where its label is drawn; absent for icons, images and untitled groups. */
  readonly text?: TextPlace;
  /**
   * Whether the icon picker and icon drops write `style <id> { icon "…" }` on it (`setIcon`):
   * nodes, decisions, data stores and boxes of flow and free diagrams.
   */
  readonly takesIcon: boolean;
  /**
   * The icon written in its own style, which **Remove icon** (`removeIcon`) takes away; null
   * without one. An icon from a class or a rule is not its own.
   */
  readonly icon: string | null;
  /**
   * An element drawn as its icon (`shape icon`) with a label or a description: the label, drawn
   * outside `box`, from the top of its first line to the descenders of its last, in diagram
   * coordinates. `box` stays the icon's square, which handles, magnets, anchors and resizing use;
   * the label is part of the element for hit tests, marquees and drops (dropping a connection on
   * it connects to the element, whose connector ends on the square).
   */
  readonly labelBox?: Box;
  /**
   * A free `line`: its points in diagram coordinates (`from`, its bends, `to`), the polyline it
   * is drawn with (rounded corners, a curve's samples, heads cut out), and its bends alone. Its
   * `box` is the bounding box of its points; it has no frame, resize, rotation or connection
   * handles, but a handle at each point and at the middle of each stretch.
   */
  readonly line?: {
    readonly points: readonly Point[];
    readonly drawn: readonly Point[];
    readonly via: readonly Point[];
  };
  /**
   * A `pen` stroke: its points where they are drawn, in diagram coordinates (its written points
   * moved by its group's interior origin), the box of the points grown by half its width (its
   * `box` too, which its frame and its resize handles use), and its drawn width. It has no
   * rotation, connection, point or label handles; moving or scaling it writes every point
   * (`setPenPoints`).
   */
  readonly pen?: {
    readonly points: readonly Point[];
    readonly bounds: Box;
    readonly width: number;
  };
  /**
   * A group of a free diagram that arranges its children (`layout column` or `layout row`): its
   * layout, its spacing and its alignment as the layout applies them (defaults filled in), and the
   * children it places in source order, its lines and pens left out. A `move` or a `create` with
   * an `index` counts among these children.
   */
  readonly list?: {
    readonly layout: "column" | "row";
    readonly spacing: number;
    readonly align: "start" | "center" | "end" | "stretch";
    readonly children: readonly string[];
  };
  /**
   * Sequence diagrams: the tags of a participant, in source order, each with its badge as drawn
   * over the head; absent when it has none.
   */
  readonly tags?: readonly TagInfo[];
}

/** What the canvas knows about a relation. */
export interface RelationInfo {
  /** The id, or the key of an anonymous relation. */
  readonly key: string;
  readonly named: boolean;
  readonly from: string;
  readonly to: string;
  readonly label: string | null;
  readonly line: "solid" | "dashed";
  /** The route's anchors and waypoints, before the arrowheads are cut out. */
  readonly points: readonly Point[];
  /** The connector as drawn, the heads cut out: a curve's samples, rounded corners, detours. */
  readonly drawn: readonly Point[];
  readonly via: readonly Point[];
  readonly fromSide: Side;
  readonly toSide: Side;
  readonly labelBox: Box | null;
  /** The relation's layer, or null for the default layer. */
  readonly layer: string | null;
  /** Where its label is drawn, or goes: the middle of its line when it has none. */
  readonly text?: TextPlace;
  /** Sequence diagrams: the key of the call a `return` answers; absent on other messages. */
  readonly returns?: string;
  /**
   * Sequence diagrams: the tags of a message, in source order, each with its pill as drawn on the
   * arrow next to the source end; absent when it has none.
   */
  readonly tags?: readonly TagInfo[];
  /**
   * Sequence diagrams: whether the message's receiver is activated after it: `written` when the
   * next event of its block is `activate <receiver>` (Alt+A and **Activate** remove that pair),
   * `block` when the message is a call whose block activates the receiver (they refuse); absent
   * otherwise.
   */
  readonly activation?: "written" | "block";
}

/** What the canvas knows about an event of a sequence diagram. */
export interface EventInfo {
  /** The relation key of a message, the id of a note or fragment, or `<kind>#<n>`. */
  readonly key: string;
  readonly kind: EventKind;
  /** The row of the event, in diagram coordinates. */
  readonly y: number;
  readonly height: number;
  /**
   * The frame of a note or a fragment, or the bar an `activate` opens (`activate#1`), which a
   * press on it selects and its outline is; in diagram coordinates. Null for the others.
   */
  readonly box: Box | null;
  /**
   * The other end of an activation: an `activate`'s `deactivate`, a `deactivate`'s `activate`.
   * Null for an `activate` open to the end, a `deactivate` that closes nothing and every other
   * event.
   */
  readonly pair: string | null;
  /** The fragment or the call around the event, or null. */
  readonly parent: string | null;
  /** The participant of an activation or a lifecycle event. */
  readonly participant: string | null;
  /** The text the inline editor changes: a note's text, a fragment's first condition, a label. */
  readonly label: string | null;
  /** The written `space` above the event. */
  readonly space: number;
  /** Whether a vertical drag writes `space`: messages, notes and fragments. */
  readonly spaced: boolean;
  /** Where the text of a note, a fragment's first condition or a divider's label is drawn. */
  readonly text?: TextPlace;
}

/** A diagram as the canvas draws it. */
export interface CanvasRender {
  readonly revision: number;
  readonly diagrams: readonly { readonly id: string; readonly title: string | null }[];
  readonly diagram: string;
  /** The profile of the diagram, which sets the palette. */
  readonly profile: CanvasProfile;
  /** A declared type's palette: its kinds, in the order offered (decision 0030). */
  readonly tools?: readonly { readonly kind: string; readonly label: string }[];
  /** Layers of a free diagram, back to front; `["main"]` for flow. */
  readonly layers: readonly string[];
  readonly mode: LayoutMode;
  readonly svg: string;
  readonly width: number;
  readonly height: number;
  /** Scene coordinates minus diagram coordinates. */
  readonly offset: Point;
  /** Elements in source order. */
  readonly elements: readonly ElementInfo[];
  readonly relations: readonly RelationInfo[];
  /** Sequence diagrams: the events in order; empty for the other profiles and in previews. */
  readonly events: readonly EventInfo[];
  /** Sequence diagrams: the scenarios the toolbar offers. */
  readonly scenarios: readonly { readonly id: string; readonly label: string }[];
  /** The scenario previewed read-only, or null for every event. */
  readonly scenario: string | null;
  /** How many effects the diagram's `animate` statements run; the toolbar plays them. */
  readonly effects: number;
  /** True while the canvas shows the effects running. */
  readonly playing: boolean;
  /**
   * The document belongs to a project, whose assets the canvas may add to (the Add icon dialog);
   * absent outside one.
   */
  readonly project?: boolean;
  /** C4 views: the entities of the model the view may draw and does not. */
  readonly entities: readonly {
    readonly path: string;
    readonly label: string;
    readonly kind: string;
  }[];
  readonly selection: readonly string[];
  /**
   * The colours of the canvas's selection and of its guides, from the diagram's theme: its
   * `selection` and `guide`, else its `accent`; and the `accent` itself, the colour of the Pointer
   * tool's trail when the host names no colour of the person's own.
   */
  readonly colors?: {
    readonly selection: string;
    readonly guide: string;
    readonly accent: string;
  };
  /**
   * The colour tokens of the diagram's theme with the colours they resolve to, in the theme's
   * order (the strip's swatches): the pen menu's colour row, and the colour a stroke in progress
   * is drawn in when its colour is a token (`@ink`, `@highlight`).
   */
  readonly swatches?: readonly ColorSwatch[];
}

export interface CanvasSettings {
  readonly grid: number;
  readonly showGrid: boolean;
  readonly snap: boolean;
  readonly guides: boolean;
  readonly minimap: boolean;
  readonly inspector: boolean;
  /**
   * A canvas that only shows: false when absent. While true the canvas sends no action and no
   * other message that changes the document; selection, zoom, pan, stories, effects and exports
   * work. A later `settings` message switches it back and forth without a reload.
   */
  readonly readOnly?: boolean;
}

/**
 * The control of a field. `boolean` is a checkbox whose value is `on` when checked and `off` when
 * not; checking or clearing it sends `setField` with `on` or `off`.
 */
export type FieldType =
  | "id"
  | "text"
  | "multiline"
  | "number"
  | "enum"
  | "color"
  | "icon"
  | "classes"
  | "ports"
  | "boolean";

/** One editable property in the inspector. */
export interface InspectorField {
  readonly name: string;
  readonly label: string;
  readonly type: FieldType;
  /** The written value, or null when it is not written. */
  readonly value: string | number | null;
  /** What applies when nothing is written: a default or an inherited value, shown as it is. */
  readonly placeholder?: string;
  /**
   * Without a written value the theme decides; the canvas says so in its own words. Fields whose
   * theme value is known name it in `placeholder` as well.
   */
  readonly fromTheme?: boolean;
  /** The selected targets have different values: `value` is null and the canvas shows "mixed". */
  readonly mixed?: boolean;
  readonly options?: readonly string[];
  readonly readonly?: boolean;
  /** Fields of the style strip, which the inspector shows first and draws compactly. */
  readonly section?: "strip";
  /**
   * Strip fields that belong to a card: the name of the toggle field whose card holds this one
   * (`effect.trace` for `effect.trace.color`), so a canvas groups them without knowing the effects.
   */
  readonly group?: string;
  /** Colour fields: the effective theme's colour tokens with the colours they resolve to. */
  readonly swatches?: readonly ColorSwatch[];
  /** Values offered in one click beside the control, such as a theme's dark counterpart. */
  readonly quick?: readonly { readonly label: string; readonly value: string }[];
  /** The diagram's Theme field: whether its theme can be edited, and created for the project. */
  readonly themes?: { readonly editable: boolean; readonly project: boolean };
  /**
   * Fields the canvas draws as pictures rather than words: line styles, route kinds, corners, the
   * heads at the start and at the end of a relation, and the shapes of boxes and nodes. A canvas
   * without them shows a select.
   */
  readonly glyphs?: FieldGlyphs;
  /**
   * Number fields with bounds, which the canvas draws as a slider beside the number: the corner
   * radius, the icon size. A value outside them is refused by the session as well. The icon size
   * may also hold the word `auto`, which its `quick` choice writes.
   */
  readonly range?: { readonly min: number; readonly max: number; readonly step: number };
  /**
   * Icon fields (`style.icon`, the `source` of an icon object): the icon they show, the written
   * one or else the one that applies (`placeholder`), with its readable name and a 24 px SVG
   * thumbnail, null while its pack loads, or `missing` when the reference names no icon the packs
   * can draw. Absent when there is none.
   */
  readonly thumbnail?: IconChoiceInfo;
  /**
   * A button the canvas draws beside the field, which sends `action`: Convert to container
   * beside Inside, **Remove** beside a tag (`removeTag`). Canvases that only show leave it out.
   */
  readonly button?: { readonly label: string; readonly action: CanvasAction };
  /**
   * A sentence the canvas shows under the field, such as why it is read-only: "The block of `pay`
   * activates `api`." under a call's **Activates the receiver**.
   */
  readonly note?: string;
}

/**
 * The picture family of a field: see `InspectorField.glyphs`. `iconPosition` pictures the five
 * places of an icon in its box (`ICON_POSITIONS`), `labelPosition` the four edges a label takes
 * around a centred icon (`LABEL_POSITIONS`).
 */
export type FieldGlyphs =
  | "line"
  | "route"
  | "corners"
  | "arrowStart"
  | "arrowEnd"
  | "shape"
  | "iconPosition"
  | "labelPosition"
  | "sketch"
  | "textAlign"
  | "verticalAlign";

/** The panel that edits a theme block: its tokens by group, written or inherited. */
export interface ThemePanelModel {
  /** The theme's id in its file. */
  readonly id: string;
  /** Another file of the project that holds the block, or null for the document's own. */
  readonly file: string | null;
  readonly groups: readonly {
    readonly title: string;
    readonly fields: readonly InspectorField[];
  }[];
}

/** A colour token of the theme and the colour it resolves to, such as `accent` and `#3A5BD9`. */
export interface ColorSwatch {
  readonly token: string;
  readonly color: string;
}

export interface InspectorModel {
  readonly title: string;
  readonly target: {
    readonly kind: "diagram" | "element" | "relation" | "event" | "several";
    readonly ids: readonly string[];
  };
  readonly fields: readonly InspectorField[];
}

/** What the canvas needs to draw any instant of a story by itself. */
export interface StoryPlaybackInfo {
  readonly id: string;
  readonly title: string | null;
  readonly timeline: StoryTimeline;
  /** The scene, effects and relation ends of every view the story shows, by view key. */
  readonly views: Readonly<Record<string, StoryViewData>>;
  /** What an action can name in every view. */
  readonly targets: Readonly<
    Record<
      string,
      readonly { readonly id: string; readonly kind: "element" | "relation" | "event" }[]
    >
  >;
  readonly accent: string;
  /** `@font-face` rules for the text of the views. */
  readonly fontFaces: readonly string[];
}

/**
 * Actions a scene can run, which **Add to scene** inserts. `draw` replays pens, free lines and
 * named relations (`story-language`); the edit refuses it on anything else.
 */
export type SceneActionKind =
  "reveal" | "hide" | "highlight" | "focus" | "camera" | "trace" | "draw" | "hold";

/** Statements that would be removed with an element, listed for confirmation. */
export interface DependentInfo {
  readonly kind: string;
  readonly description: string;
}

/** A library as the panel lists it: its categories with how many elements each holds. */
export interface LibraryInfo {
  readonly id: string;
  readonly title: string;
  readonly categories: readonly {
    readonly id: string;
    readonly title: string;
    readonly count: number;
  }[];
}

/**
 * Another person's selection, drawn over the scene with an outline in `colour` and a tag holding
 * `name` (as text), and their pointer, drawn as a cursor in `colour` with the name at its tail. It is
 * never selectable, saved, copied or exported, and nothing of it is sent back to the host; ids the
 * diagram does not have are ignored.
 */
export interface PresencePerson {
  /** Shown verbatim in the tag as a text node, so markup in it shows as its characters. */
  readonly name: string;
  /**
   * A CSS colour from the presence palette (`presenceColour`): `#rgb`, `#rrggbb`, `rgb()` or
   * `hsl()`. The tag's text is black or white, whichever contrasts more; a colour the canvas cannot
   * read is drawn grey.
   */
  readonly colour: string;
  /**
   * What the person has selected on their canvas: the ids of elements, relations (their key) and
   * events, as `select` carries them. Each one in the scene is outlined, with the tag above it;
   * several people on one id are stacked in the order of the list.
   */
  readonly selection: readonly string[];
  /**
   * Where the person's pointer is over their canvas, in diagram units of the diagram shown: a
   * cursor in `colour` whose tip is at that point at every zoom, keeping its size on screen, and
   * gliding to the next point in 200 ms. Ignored unless it is two finite numbers.
   */
  readonly pointer?: { readonly x: number; readonly y: number };
  /**
   * The points of the person's Pointer trail since their last batch (`live-collaboration`): `batch`
   * grows by one with each batch of that person, so the canvas draws a batch once, and `points` are
   * at most 64 entries, `x` and `y` in diagram units and `t` the milliseconds since the batch's
   * first point, 0 to 1000. The trail is drawn in `colour`, point by point at its own pace, and
   * fades as the person's own does. A batch that does not fit those bounds is not drawn.
   *
   * A batch with `pen` holds the points of a stroke the person is drawing with the pen or the
   * highlighter (`diagram-canvas` "Strokes of others"): drawn in the pen's width, colour and
   * opacity, the batches of one `stroke` number growing one stroke that does not fade, until the
   * next `render` after its last batch or ten seconds, or at once on its `cancel` batch. A batch
   * whose `pen` does not fit `isPresencePen` is not drawn.
   */
  readonly laser?: {
    readonly batch: number;
    readonly points: readonly { readonly x: number; readonly y: number; readonly t: number }[];
    readonly pen?: PresencePen;
  };
}

/**
 * How a stroke being drawn looks, as a laser batch carries it to the others, and which of the
 * person's strokes it is: `width` a whole number of pixels from 1 to 64, `colour` a CSS colour of
 * at most 32 characters (the resolved colour, not a token), `opacity` from 0 to 1, `stroke` an
 * integer from 0 to 2,147,483,647 that the person's canvas increases with each stroke (the batches
 * of one stroke carry the same number, and a stroke is never joined to another), and `cancel`,
 * only ever `true`, on the batch that ends a stroke cancelled with Escape (its points may be none):
 * the others drop that stroke at once.
 */
export interface PresencePen {
  readonly width: number;
  readonly colour: string;
  readonly opacity: number;
  readonly stroke: number;
  readonly cancel?: true;
}

/** The bounds of `PresencePen`, which the canvas, the page and the room apply alike. */
export const PRESENCE_PEN_LIMITS = {
  width: { min: 1, max: 64 },
  colour: 32,
  opacity: { min: 0, max: 1 },
  stroke: { min: 0, max: 2_147_483_647 },
} as const;

/** Whether a value is a `PresencePen` within its bounds (`PRESENCE_PEN_LIMITS`). */
export function isPresencePen(v: unknown): v is PresencePen {
  if (typeof v !== "object" || v === null) return false;
  const pen = v as Record<string, unknown>;
  const { width, colour, opacity, stroke } = PRESENCE_PEN_LIMITS;
  return (
    typeof pen.width === "number" &&
    Number.isInteger(pen.width) &&
    pen.width >= width.min &&
    pen.width <= width.max &&
    typeof pen.colour === "string" &&
    pen.colour.length <= colour &&
    typeof pen.opacity === "number" &&
    Number.isFinite(pen.opacity) &&
    pen.opacity >= opacity.min &&
    pen.opacity <= opacity.max &&
    typeof pen.stroke === "number" &&
    Number.isInteger(pen.stroke) &&
    pen.stroke >= stroke.min &&
    pen.stroke <= stroke.max &&
    (pen.cancel === undefined || pen.cancel === true)
  );
}

/** An element of a library with its thumbnail, null while its pack is still loading. */
export interface LibraryItemInfo {
  readonly library: string;
  readonly category: string;
  readonly label: string;
  readonly icon: string;
  readonly kind?: string;
  readonly svg: string | null;
}

/** An icon the icon picker offers. */
export interface IconChoiceInfo {
  /** `pack:name`, as `style <id> { icon "…" }` writes it. */
  readonly reference: string;
  /**
   * A readable name: a library item's label (`PostgreSQL`), a pack's own name for the icon (`AWS
   * Lambda`), else the icon's name as written (`database`).
   */
  readonly label: string;
  /**
   * A 24 px SVG thumbnail, or null: while the icon's pack is still loading, or for good when
   * `missing` says so.
   */
  readonly svg: string | null;
  /**
   * True when the reference names no icon the packs can draw (an unknown pack or icon, or one the
   * sanitiser refuses), so no thumbnail will come; absent otherwise. The icon picker never offers
   * such an icon; an Icon field shows it as missing rather than loading.
   */
  readonly missing?: boolean;
}

/** A group of the icon picker's results: icons of one pack, or items of one library. */
export interface IconGroupInfo {
  /** The pack's prefix (`tabler`) or the library's id (`tech`). */
  readonly id: string;
  readonly kind: "pack" | "library";
  /** The pack's or the library's own title, such as `Tabler Icons` or `Technology`. */
  readonly title: string;
  readonly items: readonly IconChoiceInfo[];
}

/** A file the Add icon dialog sends: its own name, the icon name it is to get, and its text. */
export interface IconFileInput {
  /** The file's name as the person picked it, such as `My Logo.svg`. */
  readonly file: string;
  /** The icon's name in the pack; without one, the session offers one made of the file's name. */
  readonly name?: string;
  readonly svg: string;
}

/** What the session says of a file of the Add icon dialog. */
export interface IconFileCheck {
  readonly file: string;
  /** The name the icon gets: the one asked for, or the one offered. */
  readonly name: string;
  /** Why it cannot be added as it is (an unsafe SVG, a name taken or invalid); absent when it can. */
  readonly problem?: string;
  /** A 48 px preview of the icon as the sanitiser keeps it, or null when it refuses the file. */
  readonly svg: string | null;
}

/** What the session says of the prefix of the Add icon dialog. */
export interface IconPrefixCheck {
  readonly prefix: string;
  /** Why the icons cannot go into a pack of that prefix; absent when they can. */
  readonly problem?: string;
  /** A pack of the project has the prefix already: the icons join it. */
  readonly existing: boolean;
  /** The pack has a licence, so the dialog asks for none. */
  readonly licensed: boolean;
}

/** An icon the Add icon dialog wrote, with the file it came from. */
export interface AddedIconInfo extends IconChoiceInfo {
  readonly file: string;
}

export type HostMessage =
  | ({ readonly type: "render" } & CanvasRender)
  | {
      readonly type: "stale";
      readonly revision: number;
      readonly count: number;
      readonly first: { readonly code: string; readonly message: string; readonly line: number };
    }
  | {
      readonly type: "empty";
      readonly revision: number;
      readonly message: string;
      /**
       * The kinds of diagram the canvas offers to create with the `createDiagram` action, one
       * button each; empty while a story plays, and absent where nothing can be created.
       */
      readonly creatable?: readonly CreatableDiagram[];
    }
  /**
   * The answer to a `preview` action: the SVG the stage would draw after the move or resize, or
   * null when the session would refuse it, the result has errors or the text has changed since.
   * `token` is the action's, so the canvas drops answers to older gestures.
   */
  | {
      readonly type: "preview";
      readonly token: number;
      readonly svg: string | null;
      /**
       * With a drawing, its size and its offset as a render gives them: the drawing grows and
       * shifts when boxes go past its edges, so the canvas places it by these, not the render's.
       */
      readonly width?: number;
      readonly height?: number;
      readonly offset?: Point;
      /** For a rotation, the turned element's box in the drawing, in diagram coordinates. */
      readonly box?: Box;
      /**
       * Without a drawing, why the drop would be refused, when the session knows it: the order
       * rule a `moveActivation` breaks ("`b` is not active here."). The canvas says it while the
       * gesture goes on, and its drop writes nothing.
       */
      readonly reason?: string;
    }
  | {
      readonly type: "rejected";
      readonly code: string;
      readonly reason: string;
      readonly dependents?: readonly DependentInfo[];
      /** The action to send again with `cascade: true` after confirmation. */
      readonly retry?: CanvasAction;
    }
  | { readonly type: "highlight"; readonly ids: readonly string[] }
  /**
   * The selection after an edit. One id alone opens the inline editor of what was just created;
   * with `tag`, the editor opens on the pill at that index of the selected participant or
   * message (`TagInfo.place`), the tag that `addTag` just wrote, instead of its label.
   */
  | { readonly type: "select"; readonly ids: readonly string[]; readonly tag?: number }
  /**
   * The other people of a shared project and what each has selected (`live-collaboration`). Each
   * message is the whole picture and replaces the last one. The canvas clears it when `people` is
   * empty, on an `empty` message and on a `render` of another diagram than the last one; a host
   * that switches file sends the new file's presence after its render (or `people: []` when the
   * diagram id may be the same). While a story plays the canvas keeps the people and draws none.
   */
  | {
      readonly type: "presence";
      readonly people: readonly PresencePerson[];
      /**
       * The colour of the person at this canvas, as the others see them: the Pointer tool's trail
       * and cursor are drawn in it while it is set, and in the theme's accent when it is not.
       */
      readonly me?: { readonly colour: string };
    }
  | { readonly type: "settings"; readonly settings: CanvasSettings }
  | { readonly type: "inspector"; readonly model: InspectorModel }
  | { readonly type: "status"; readonly message: string }
  /** The theme panel while it is open, or null to close it. */
  | { readonly type: "themePanel"; readonly panel: ThemePanelModel | null }
  /** The element libraries of the document, for the libraries panel. */
  | { readonly type: "libraries"; readonly libraries: readonly LibraryInfo[] }
  | {
      readonly type: "libraryItems";
      readonly library: string;
      readonly category: string;
      readonly items: readonly LibraryItemInfo[];
    }
  | {
      readonly type: "librarySearch";
      readonly query: string;
      readonly items: readonly LibraryItemInfo[];
    }
  /**
   * The answer to `searchIcons`, with its `token`: up to 60 icons in groups, the typed `pack:name`
   * first when it names an icon, the packs' groups before the libraries'. Only icons the packs can
   * draw are offered, so no item is `missing`. C4 views get the packs' icons without the
   * libraries; sequence diagrams, whose participants draw no icon, get none. A thumbnail is null
   * while its pack loads: the canvas asks again when a later render arrives.
   */
  | {
      readonly type: "icons";
      readonly token: number;
      readonly groups: readonly IconGroupInfo[];
    }
  /**
   * The answer to `checkIcons`, with its `token`: the prefix and each file as the Add icon dialog
   * shows them, with a preview, the name offered and what is wrong, if anything.
   */
  | {
      readonly type: "iconsChecked";
      readonly token: number;
      readonly prefix: IconPrefixCheck;
      readonly files: readonly IconFileCheck[];
    }
  /**
   * The answer to `addIcons`, with its `token`: the icons whose files the host is to write (the
   * steps over files of the same result), and the files refused with the reason.
   */
  | {
      readonly type: "iconsAdded";
      readonly token: number;
      readonly added: readonly AddedIconInfo[];
      readonly refused: readonly { readonly file: string; readonly reason: string }[];
    }
  /**
   * The stories of the file for the picker, and the playback of the story the canvas plays, or
   * null outside story mode.
   */
  | {
      readonly type: "story";
      readonly revision: number;
      readonly stories: readonly { readonly id: string; readonly title: string | null }[];
      readonly playback: StoryPlaybackInfo | null;
    };

/** The kinds of diagram the canvas creates: C4 views need a model, written in text. */
export type CreatableDiagram = "flow" | "free" | "sequence";

/**
 * Moves elements by a delta in diagram coordinates, or into a list group at a position. A child
 * of a list stays where its list puts it: a move by a delta that leaves it in its list (a nudge,
 * an Alt-drag) is refused with a status that says how to move it.
 */
export interface MoveAction {
  readonly kind: "move";
  readonly ids: readonly string[];
  /**
   * How far the elements move, in diagram coordinates. Absent only with `index`, whose drop
   * writes no position; a pen or a line moved with it keeps its points.
   */
  readonly delta?: Point;
  /**
   * The group the moved elements land in, or null for the diagram's top level: each one whose
   * parent differs is declared in it, placed where it is dropped (flow and free diagrams).
   * Absent, every element keeps its parent, as nudges and Alt-drags do. A list group places them
   * itself: they are declared at the end of it, or at `index`, and lose their `place`.
   */
  readonly parent?: string | null;
  /**
   * With `parent` a list group: where the elements go among its children (`ElementInfo.list`)
   * once the moved ones are taken out, before the child at that index, after the last when it is
   * the count. Several elements go there one after another in the order of `ids`; moving a child
   * within its own list reorders it. A whole number from 0.
   */
  readonly index?: number;
}

/**
 * Gives an element a new box in diagram coordinates. A child of a list writes its size alone; a
 * pen stroke's points are scaled from its bounds to the box (`scalePenPoints`), its width kept,
 * so its resize handles preview and drop as a box's do.
 */
export interface ResizeAction {
  readonly kind: "resize";
  readonly id: string;
  readonly box: Box;
}

/**
 * Sequence diagrams: an end of a written activation bar dragged to the boundary below an event
 * row (a bar handle's drop). `id` is the bar's `activate` (its `deactivate` is taken as its
 * `activate`); `row` is the key of the event whose row the handle snapped below. The session writes
 * it as `moveEvent` with a destination: `start` puts the `activate` right after `row`, or first in
 * the block of `row` when it is a call with a block, so the bar starts at that call's arrow; `end`
 * puts the `deactivate` right after `row`, and on a bar open to the end writes `deactivate
 * <participant>` there. A move the order rules forbid is refused with the rule's reason.
 */
export interface MoveActivationAction {
  readonly kind: "moveActivation";
  readonly id: string;
  readonly end: "start" | "end";
  readonly row: string;
}

/**
 * The styles a new pen stroke writes in its `style` statement; what is absent keeps the default
 * (the theme's `ink`, 3 wide, opaque, no heads).
 */
export interface PenStyle {
  /** A colour token such as `@highlight`, or a colour such as `#e03131`. */
  readonly stroke?: string;
  /** 1 to 64. */
  readonly width?: number;
  /** 0 to 1. */
  readonly opacity?: number;
  /** A head at the last point, by its name in the language (`triangle`). */
  readonly arrowhead?: string;
  /** A head at the first point. */
  readonly arrowtail?: string;
}

/**
 * A change requested by the canvas; each becomes one edit plan, but `preview`, which asks for the
 * drawing of a move or a resize without writing it.
 */
export type CanvasAction =
  | MoveAction
  | ResizeAction
  | { readonly kind: "moveLabel"; readonly relation: string; readonly delta: Point }
  | { readonly kind: "setVia"; readonly relation: string; readonly via: readonly Point[] }
  | {
      /**
       * Draws a free line from `from` to `to`, in diagram coordinates, inside `parent` when given;
       * `line` and `heads` are the armed kind's, which the session writes as styles with the
       * effective theme's head.
       */
      readonly kind: "createLine";
      readonly from: Point;
      readonly to: Point;
      readonly parent?: string;
      readonly line: "solid" | "dashed";
      readonly heads: "end" | "both" | "none";
    }
  | {
      /** Moves the points of a free line, in diagram coordinates. */
      readonly kind: "setLinePoints";
      readonly element: string;
      readonly from: Point;
      readonly to: Point;
      readonly via: readonly Point[];
    }
  | {
      /**
       * Draws a pen stroke through `points`, in diagram coordinates as the pointer gave them
       * (simplified, not snapped). `parent` is the innermost group under the first point, where
       * the session starts looking for the stroke's group: from it outwards, the first group that
       * is not a list and whose drawn box holds the whole stroke (its points grown by half its
       * width), else the top level, so that a stroke never grows a list nor moves its cards. The
       * points are written in that group's interior, and a group without `size` gets the size it
       * is drawn with, so that it stays as drawn. `style` holds only what differs from a stroke's
       * defaults (`penStyleFor`). The new pen is not selected and no editor opens, so the next
       * stroke starts at once.
       */
      readonly kind: "createPen";
      readonly points: readonly Point[];
      readonly parent?: string;
      readonly style?: PenStyle;
    }
  | {
      /**
       * Moves the points of a pen stroke, in diagram coordinates: a drag of its stroke or a scale.
       * A pen in a list goes out to the nearest group around it that is not a list and holds it,
       * else to the top level, as `createPen` chooses.
       */
      readonly kind: "setPenPoints";
      readonly element: string;
      readonly points: readonly Point[];
    }
  | {
      readonly kind: "setEnd";
      readonly relation: string;
      readonly end: "from" | "to";
      readonly element: string;
      /** A compass side or a named port; null lets the layout choose the end's point. */
      readonly port: string | null;
      /** The point of a compass side the end is pinned to, a percentage. */
      readonly position?: number;
    }
  | {
      readonly kind: "create";
      readonly elementKind: ElementKind;
      readonly at: Point;
      readonly parent?: string;
      /**
       * The reference of a new `icon` object, which it needs (the icon picker's **Only the
       * icon**), or the path of a new `image`, which the host asks for when absent.
       */
      readonly source?: string;
      /**
       * A library element's label. With it, a new element is named after its icon (`lambda1`);
       * without it, a node, decision, data store or box is created empty (`node1[""]`).
       */
      readonly label?: string;
      /** The icon written as `style <id> { icon "…" }` in the same edit. */
      readonly icon?: string;
      /**
       * The shape of a new free `box` or flow `node`, written as `style <id> { shape … }` in the
       * same edit; `rounded`, the shape without a style, writes none. With `icon`, `icon` makes the
       * icon the shape (the picker's **Icon**) and any other shape puts it in a box.
       */
      readonly shape?: ShapeName;
      /**
       * A new note attached to an element, written as `on <element>` after its text: the id of an
       * element of the diagram, or the entity path a C4 view draws. With it `at` is the point the
       * note's centre is put at when the tool was dropped on the element; the session places the
       * note beside the element instead, at its east edge plus the theme's `groupPadding`, aligned
       * to its top.
       */
      readonly attachedTo?: string;
      /**
       * The fill of a new sticky, written as `style <id> { fill … }` in the same edit: a colour
       * such as `#f8bbd0`, or a colour token as `@sticky`.
       */
      readonly fill?: string;
      /** A new group that is a list (the group menu's Column and Row): `{ layout column }`. */
      readonly layout?: "column" | "row";
      /**
       * With `parent` a list group: where the new element goes among its children
       * (`ElementInfo.list`), before the child at that index, at the end when it is the count;
       * the list places it, so it gets no `place`.
       */
      readonly index?: number;
    }
  | {
      /**
       * Writes, changes or removes the `on <element>` clause of a note (the inspector's **Attached
       * to** field): `element` is an element id (the entity path in a view), null for none.
       */
      readonly kind: "attachNote";
      readonly note: string;
      readonly element: string | null;
    }
  | {
      readonly kind: "connect";
      readonly from: string;
      readonly to: string;
      readonly line: "solid" | "dashed";
      /**
       * `both` for a head at both ends (`<->`, `<-->`), `none` for a line without heads (`--`,
       * `---`); a head at the end otherwise. Neither in C4 views.
       */
      readonly heads?: "none" | "both";
      /**
       * The ends pinned to a port or a point of a side, each on its own: the start when the line
       * was dragged from a border or a handle, the end when it was dropped on the target's border.
       * A floating relation without it.
       */
      readonly pinned?: {
        readonly fromPort?: string;
        readonly fromPosition?: number;
        readonly toPort?: string;
        readonly toPosition?: number;
      };
    }
  | { readonly kind: "remove"; readonly ids: readonly string[]; readonly cascade: boolean }
  | { readonly kind: "setLabel"; readonly id: string; readonly label: string }
  | { readonly kind: "renameId"; readonly id: string; readonly newId: string }
  | { readonly kind: "group"; readonly ids: readonly string[] }
  | { readonly kind: "ungroup"; readonly id: string }
  /** Turns a flow node or a free box into a container holding the boxes stacked on it. */
  | { readonly kind: "convertToContainer"; readonly id: string }
  | { readonly kind: "align"; readonly ids: readonly string[]; readonly edge: AlignEdge }
  | {
      readonly kind: "distribute";
      readonly ids: readonly string[];
      readonly axis: "horizontal" | "vertical";
    }
  | {
      readonly kind: "setField";
      readonly ids: readonly string[];
      readonly field: string;
      readonly value: string | number | null;
    }
  /**
   * Several fields of the same targets written in one edit, one undo step: the alignment
   * picker's `style.textAlign` and `style.verticalAlign` when both change.
   */
  | {
      readonly kind: "setFields";
      readonly ids: readonly string[];
      readonly fields: readonly {
        readonly field: string;
        readonly value: string | number | null;
      }[];
    }
  /**
   * Writes `style <id> { icon "<icon>" }` on each of `ids` that takes an icon
   * (`ElementInfo.takesIcon`), in one edit; the others are left as they are, and the session
   * refuses when none does. The icon picker's choice for the selection, and an icon dropped on an
   * element.
   */
  | { readonly kind: "setIcon"; readonly ids: readonly string[]; readonly icon: string }
  /** Removes the icon written in the own style of each of `ids` (`ElementInfo.icon`), in one edit. */
  | { readonly kind: "removeIcon"; readonly ids: readonly string[] }
  | { readonly kind: "paste"; readonly at?: Point }
  | { readonly kind: "duplicate"; readonly ids: readonly string[] }
  | { readonly kind: "cut"; readonly ids: readonly string[] }
  | { readonly kind: "arrange"; readonly scope: "unplaced" | "all" }
  | { readonly kind: "reorder"; readonly ids: readonly string[]; readonly to: ZOrder }
  /** Layers: a new one named `layer<n>` before `main`; rename; remove (its things go to `main`). */
  | { readonly kind: "addLayer" }
  | { readonly kind: "renameLayer"; readonly layer: string; readonly name: string }
  | { readonly kind: "removeLayer"; readonly layer: string }
  | { readonly kind: "moveLayer"; readonly layer: string; readonly direction: "up" | "down" }
  /** Puts elements and relations on a layer; null for `main`. */
  | { readonly kind: "setLayer"; readonly ids: readonly string[]; readonly layer: string | null }
  | { readonly kind: "convert" }
  /** Sequence diagrams: moves an event before its previous or after its next neighbour. */
  | { readonly kind: "moveEvent"; readonly id: string; readonly direction: "up" | "down" }
  /** Sequence diagrams: the activation of a participant after the selected message. */
  | { readonly kind: "toggleActivation"; readonly ids: readonly string[] }
  /** Sequence diagrams: an end of an activation bar to another event row. */
  | MoveActivationAction
  /**
   * Sequence diagrams: `tag "Tag"` (the word in the interface language, "Tag 2" when the owner has
   * "Tag" already) added last to the selected message, else to the selected participant; the
   * session selects the owner and opens the editor on the new pill (`select` with `tag`). Refused
   * with a reason when neither is selected.
   */
  | { readonly kind: "addTag"; readonly ids: readonly string[] }
  /**
   * Sequence diagrams: the text of the tag at `index` (from 0) of the selected message, else the
   * selected participant; an empty text removes the tag (`removeTag`).
   */
  | {
      readonly kind: "setTag";
      readonly ids: readonly string[];
      readonly index: number;
      readonly text: string;
    }
  /** Sequence diagrams: removes the tag at `index` of the selected message, else participant. */
  | { readonly kind: "removeTag"; readonly ids: readonly string[]; readonly index: number }
  /** Sequence diagrams: the selected events into the block of the call right before them. */
  | { readonly kind: "nestInCall"; readonly ids: readonly string[] }
  /** Sequence diagrams: the events of the selected call, or of the call around the selection, out. */
  | { readonly kind: "unnestCall"; readonly ids: readonly string[] }
  /** Sequence diagrams: a `return` at the end of the selected call, or of the call around it. */
  | { readonly kind: "addReturn"; readonly ids: readonly string[] }
  /** Sequence diagrams: a note, divider or delay after the selection, or at the end. */
  | {
      readonly kind: "insertEvent";
      readonly eventKind: "note" | "divider" | "delay";
      readonly ids: readonly string[];
    }
  /** C4 views: draws an entity of the model, at a point of the canvas when given. */
  | { readonly kind: "includeEntity"; readonly entity: string; readonly at?: Point }
  /** Sequence diagrams: a fragment around the selected events, or an empty one at the end. */
  | { readonly kind: "wrap"; readonly ids: readonly string[]; readonly operator: FragmentOperator }
  /** Stories: the time of the action at `path` (scene, then actions), or of a transition. */
  | {
      readonly kind: "setStoryTiming";
      readonly story: string;
      readonly path: readonly number[];
      readonly durationMs: number;
    }
  /** Stories: an action on the selected ids at the end of a scene. */
  | {
      readonly kind: "addToScene";
      readonly story: string;
      readonly scene: string;
      readonly action: SceneActionKind;
      readonly ids: readonly string[];
      readonly durationMs?: number;
    }
  | { readonly kind: "removeStoryAction"; readonly story: string; readonly path: readonly number[] }
  /** Stories: a new scene after `after`, or at the end. */
  | { readonly kind: "insertScene"; readonly story: string; readonly after?: string }
  /**
   * A new empty diagram of the file, `diagram<n>`, after its last block; the canvas then shows it.
   * The `empty` message lists the kinds to offer.
   */
  | { readonly kind: "createDiagram"; readonly type: CreatableDiagram }
  /**
   * The drawing the move, resize or rotation `action` would give on the drop, while the gesture
   * goes on. Nothing is written: no plan, no history, no new revision. The session answers with a
   * `preview` host message carrying the same `token` (flow and free diagrams and C4 views; on
   * sequence diagrams, a bar handle's `moveActivation`, with the reason when it is refused).
   */
  | {
      readonly kind: "preview";
      readonly token: number;
      readonly action: PreviewedAction;
    };

/** The angle a rotation handle gives an element: `setField` of `style.rotation`, null upright. */
export interface RotationAction {
  readonly kind: "setField";
  readonly ids: readonly string[];
  readonly field: "style.rotation";
  readonly value: number | null;
}

/**
 * The gestures a canvas previews: moves, resizes and rotations, and the end of an activation bar
 * dragged on a sequence diagram.
 */
export type PreviewedAction = MoveAction | ResizeAction | RotationAction | MoveActivationAction;

export type CanvasMessage =
  | { readonly type: "ready" }
  | { readonly type: "pickDiagram"; readonly diagram: string }
  /** Previews a scenario of a sequence diagram read-only, or every event with null. */
  | { readonly type: "pickScenario"; readonly scenario: string | null }
  | { readonly type: "select"; readonly ids: readonly string[] }
  | { readonly type: "action"; readonly revision: number; readonly action: CanvasAction }
  | { readonly type: "copy"; readonly ids: readonly string[] }
  | { readonly type: "focusText"; readonly id: string }
  | { readonly type: "export" }
  /** C4 views: shows the model of the view in the text. */
  | { readonly type: "openModel" }
  /** Shows the effects of the diagram running, or the static drawing again. */
  | { readonly type: "playEffects"; readonly on: boolean }
  /** Plays a story of the file on the canvas, read-only, or leaves story mode with null. */
  | { readonly type: "pickStory"; readonly story: string | null }
  /** Writes the HTML player of a story, or asks which story or diagram with null. */
  | { readonly type: "exportPlayer"; readonly story: string | null }
  /** The libraries panel: the list, the elements of one category, a search. */
  | { readonly type: "libraries" }
  | { readonly type: "libraryItems"; readonly library: string; readonly category: string }
  | { readonly type: "librarySearch"; readonly query: string }
  /**
   * The icon picker's search, answered by an `icons` message with the same `token`; an empty
   * query asks for the first category of the Technology library (on C4 views, which have no
   * libraries, the first icons of Tabler).
   */
  | { readonly type: "searchIcons"; readonly query: string; readonly token: number }
  /**
   * The Add icon dialog's files and prefix, checked as they are typed: answered by `iconsChecked`
   * with the same `token`.
   */
  | {
      readonly type: "checkIcons";
      readonly token: number;
      readonly prefix: string;
      readonly files: readonly IconFileInput[];
    }
  /**
   * Adds icons to the project: each file as `assets/icons/<prefix>/<name>.svg`, the pack's licence
   * when it has none, the icons in the project's library, and the first icon on `targets`, in one
   * step; answered by `iconsAdded`.
   */
  | {
      readonly type: "addIcons";
      readonly token: number;
      readonly prefix: string;
      readonly licence?: string;
      readonly files: readonly IconFileInput[];
      readonly targets: readonly string[];
    }
  /**
   * Creates a theme that extends the diagram's: in the file, used by the diagram, or for the
   * project, as its default theme in `themes/<id>.meltemi`.
   */
  | { readonly type: "newTheme"; readonly id: string; readonly scope: "file" | "project" }
  /** Opens or closes the panel of the diagram's theme. */
  | { readonly type: "editTheme"; readonly open: boolean }
  /** Writes a token of the theme in the panel; null removes it so the base's value applies. */
  | {
      readonly type: "themeToken";
      readonly token: string;
      readonly value: string | number | null;
    }
  /**
   * Where the person's pointer is over the canvas, in diagram units of the diagram shown
   * (`diagram`), or `null` once it left the canvas or a story plays: for the host to share as
   * presence (`live-collaboration`). The canvas sends it only to a host that has sent `presence`,
   * at most every 50 ms while the pointer moves. It changes nothing of the document.
   */
  | {
      readonly type: "presencePointer";
      readonly point: Point | null;
      readonly diagram?: string;
    }
  /**
   * The points a Pointer stroke added since the last batch, for the host to share in the same
   * presence message as the pointer (`live-collaboration`): `t` is the milliseconds since the
   * batch's first point, so a batch starts at 0. Sent only to a host that has sent `presence`, at
   * most every 50 ms while a stroke is drawn. It changes nothing of the document.
   */
  | {
      readonly type: "presenceLaser";
      readonly points: readonly { readonly x: number; readonly y: number; readonly t: number }[];
      readonly diagram?: string;
      /**
       * Set while the points are a stroke of the pen or the highlighter, for the others to draw it
       * as it grows: its width, its resolved colour, its opacity and its number, within
       * `PRESENCE_PEN_LIMITS`, with `cancel` on the batch (maybe of no points) that ends a stroke
       * cancelled with Escape. The Pointer's batches carry none.
       */
      readonly pen?: PresencePen;
    };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const isString = (v: unknown): v is string => typeof v === "string" && v.length <= 10_000;
const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isPoint = (v: unknown): v is Point => isObject(v) && isNumber(v.x) && isNumber(v.y);
const isBox = (v: unknown): v is Box =>
  isObject(v) && isNumber(v.x) && isNumber(v.y) && isNumber(v.width) && isNumber(v.height);
const isStrings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.length <= 10_000 && v.every(isString);
const oneOf = <T extends string>(v: unknown, values: readonly T[]): v is T =>
  typeof v === "string" && (values as readonly string[]).includes(v);
const isPercent = (v: unknown): v is number => isNumber(v) && v >= 0 && v <= 100;
/** An icon reference, `pack:name`, as the packs and their aliases name icons. */
const isReference = (v: unknown): v is string =>
  typeof v === "string" && v.length <= 200 && /^[a-z0-9][a-z0-9-]*:[A-Za-z0-9_.-]+$/.test(v);
/** The pinned ends of a connection: a port for at least one, a point only with a port. */
const isPinned = (v: unknown): boolean =>
  isObject(v) &&
  (v.fromPort !== undefined || v.toPort !== undefined) &&
  (v.fromPort === undefined || isString(v.fromPort)) &&
  (v.toPort === undefined || isString(v.toPort)) &&
  (v.fromPosition === undefined || (v.fromPort !== undefined && isPercent(v.fromPosition))) &&
  (v.toPosition === undefined || (v.toPort !== undefined && isPercent(v.toPosition)));

const KINDS = [
  "node",
  "decision",
  "data",
  "group",
  "note",
  "tag",
  "box",
  "text",
  "icon",
  "image",
  "sticky",
  "participant",
  "actor",
  "boundary",
  "control",
  "entity",
  "database",
  "collections",
  "queue",
  "person",
  "system",
  "container",
  "datastore",
  "component",
] as const;
/** The most points a pen stroke or one of its edits carries. */
const PEN_POINTS = 10_000;
/** A position among a list's children. */
const isIndex = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 100_000;
/** The points of a pen: one at least. */
const isPenPoints = (v: unknown): v is Point[] =>
  Array.isArray(v) && v.length >= 1 && v.length <= PEN_POINTS && v.every(isPoint);
/** A colour as the canvas writes one: `#` and 3, 4, 6 or 8 hex digits, or `@` and a token. */
const isColourChoice = (v: unknown): v is string =>
  typeof v === "string" &&
  (/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v) ||
    /^@[A-Za-z][A-Za-z0-9]{0,63}$/.test(v));
/** The styles of a new pen: each one optional and of its kind; the edit checks the values. */
const isPenStyle = (v: unknown): v is PenStyle =>
  isObject(v) &&
  (v.stroke === undefined || isColourChoice(v.stroke)) &&
  (v.width === undefined || (isNumber(v.width) && v.width >= 1 && v.width <= 64)) &&
  (v.opacity === undefined || (isNumber(v.opacity) && v.opacity >= 0 && v.opacity <= 1)) &&
  (v.arrowhead === undefined || (typeof v.arrowhead === "string" && v.arrowhead.length <= 64)) &&
  (v.arrowtail === undefined || (typeof v.arrowtail === "string" && v.arrowtail.length <= 64));
const OPERATORS = ["alt", "opt", "loop", "par", "break", "critical", "region"] as const;
const CREATABLE: readonly CreatableDiagram[] = ["flow", "free", "sequence"];
const EDGES = ["left", "center", "right", "top", "middle", "bottom"] as const;
const STORY_ACTION_KINDS = [
  "reveal",
  "hide",
  "highlight",
  "focus",
  "camera",
  "trace",
  "draw",
  "hold",
] as const satisfies readonly SceneActionKind[];
const isPath = (v: unknown): v is number[] =>
  Array.isArray(v) &&
  v.length >= 1 &&
  v.length <= 64 &&
  v.every((n) => Number.isInteger(n) && (n as number) >= 0);

/** A move: by a delta, or into a list group at an index (the delta then optional). */
const isMove = (a: Record<string, unknown>): boolean =>
  isStrings(a.ids) &&
  (a.index === undefined ? isPoint(a.delta) : a.delta === undefined || isPoint(a.delta)) &&
  (a.parent === undefined || a.parent === null || isString(a.parent)) &&
  (a.index === undefined || (isIndex(a.index) && isString(a.parent)));
const isResize = (a: Record<string, unknown>): boolean =>
  isString(a.id) && isBox(a.box) && a.box.width > 0 && a.box.height > 0;
/** An end of an activation bar to an event row. */
const isMoveActivation = (a: Record<string, unknown>): boolean =>
  isString(a.id) && oneOf(a.end, ["start", "end"]) && isString(a.row);

function isAction(a: unknown): a is CanvasAction {
  if (!isObject(a)) return false;
  switch (a.kind) {
    case "move":
      return isMove(a);
    case "resize":
      return isResize(a);
    case "createDiagram":
      return oneOf(a.type, CREATABLE);
    case "preview":
      return (
        isNumber(a.token) &&
        isObject(a.action) &&
        ((a.action.kind === "move" && isMove(a.action)) ||
          (a.action.kind === "resize" && isResize(a.action)) ||
          (a.action.kind === "moveActivation" && isMoveActivation(a.action)) ||
          (a.action.kind === "setField" &&
            a.action.field === "style.rotation" &&
            isStrings(a.action.ids) &&
            (a.action.value === null || isNumber(a.action.value))))
      );
    case "moveLabel":
      return isString(a.relation) && isPoint(a.delta);
    case "setVia":
      return (
        isString(a.relation) && Array.isArray(a.via) && a.via.length <= 1000 && a.via.every(isPoint)
      );
    case "createLine":
      return (
        isPoint(a.from) &&
        isPoint(a.to) &&
        (a.parent === undefined || isString(a.parent)) &&
        oneOf(a.line, ["solid", "dashed"]) &&
        oneOf(a.heads, ["end", "both", "none"])
      );
    case "setLinePoints":
      return (
        isString(a.element) &&
        isPoint(a.from) &&
        isPoint(a.to) &&
        Array.isArray(a.via) &&
        a.via.length <= 1000 &&
        a.via.every(isPoint)
      );
    case "createPen":
      return (
        isPenPoints(a.points) &&
        (a.parent === undefined || isString(a.parent)) &&
        (a.style === undefined || isPenStyle(a.style))
      );
    case "setPenPoints":
      return isString(a.element) && isPenPoints(a.points);
    case "setEnd":
      return (
        isString(a.relation) &&
        oneOf(a.end, ["from", "to"]) &&
        isString(a.element) &&
        (a.port === null || isString(a.port)) &&
        (a.position === undefined || isPercent(a.position))
      );
    case "create":
      return (
        // Kinds of declared types are words; the edit checks them against the diagram's type.
        (oneOf(a.elementKind, KINDS) ||
          (isString(a.elementKind) && /^[a-z][a-z0-9_]*$/.test(a.elementKind))) &&
        isPoint(a.at) &&
        (a.parent === undefined || isString(a.parent)) &&
        (a.label === undefined || isString(a.label)) &&
        (a.icon === undefined || isString(a.icon)) &&
        (a.source === undefined || isString(a.source)) &&
        (a.shape === undefined || oneOf(a.shape, SHAPES)) &&
        (a.attachedTo === undefined || isString(a.attachedTo)) &&
        (a.fill === undefined || isColourChoice(a.fill)) &&
        // Column and Row are groups; an index counts among the children of a list.
        (a.layout === undefined ||
          (oneOf(a.layout, ["column", "row"]) && a.elementKind === "group")) &&
        (a.index === undefined || (isIndex(a.index) && isString(a.parent))) &&
        // An icon object is its icon: it comes with one, and takes no icon style or shape.
        (a.elementKind !== "icon" ||
          (isReference(a.source) && a.icon === undefined && a.shape === undefined))
      );
    case "attachNote":
      return isString(a.note) && (a.element === null || isString(a.element));
    case "setIcon":
      return isStrings(a.ids) && isReference(a.icon);
    case "removeIcon":
      return isStrings(a.ids);
    case "connect":
      return (
        isString(a.from) &&
        isString(a.to) &&
        oneOf(a.line, ["solid", "dashed"]) &&
        (a.heads === undefined || oneOf(a.heads, ["none", "both"])) &&
        (a.pinned === undefined || isPinned(a.pinned))
      );
    case "remove":
      return isStrings(a.ids) && typeof a.cascade === "boolean";
    case "setLabel":
      return isString(a.id) && isString(a.label);
    case "renameId":
      return isString(a.id) && isString(a.newId);
    case "group":
    case "duplicate":
    case "cut":
      return isStrings(a.ids);
    case "ungroup":
    case "convertToContainer":
      return isString(a.id);
    case "align":
      return isStrings(a.ids) && oneOf(a.edge, EDGES);
    case "distribute":
      return isStrings(a.ids) && oneOf(a.axis, ["horizontal", "vertical"]);
    case "setField":
      return (
        isStrings(a.ids) &&
        isString(a.field) &&
        (a.value === null || isString(a.value) || isNumber(a.value))
      );
    case "setFields":
      return (
        isStrings(a.ids) &&
        Array.isArray(a.fields) &&
        a.fields.length > 0 &&
        (a.fields as unknown[]).every((f) => {
          const one = f as { field?: unknown; value?: unknown };
          return (
            typeof one === "object" &&
            one !== null &&
            isString(one.field) &&
            (one.value === null || isString(one.value) || isNumber(one.value))
          );
        })
      );
    case "paste":
      return a.at === undefined || isPoint(a.at);
    case "arrange":
      return oneOf(a.scope, ["unplaced", "all"]);
    case "reorder":
      return isStrings(a.ids) && oneOf(a.to, ["front", "back", "forward", "backward"]);
    case "addLayer":
      return true;
    case "renameLayer":
      return isString(a.layer) && isString(a.name);
    case "removeLayer":
      return isString(a.layer);
    case "moveLayer":
      return isString(a.layer) && oneOf(a.direction, ["up", "down"]);
    case "setLayer":
      return isStrings(a.ids) && (a.layer === null || isString(a.layer));
    case "convert":
      return true;
    case "moveEvent":
      return isString(a.id) && oneOf(a.direction, ["up", "down"]);
    case "toggleActivation":
    case "nestInCall":
    case "unnestCall":
    case "addReturn":
    case "addTag":
      return isStrings(a.ids);
    case "moveActivation":
      return isMoveActivation(a);
    case "setTag":
      return isStrings(a.ids) && isIndex(a.index) && isString(a.text);
    case "removeTag":
      return isStrings(a.ids) && isIndex(a.index);
    case "insertEvent":
      return isStrings(a.ids) && oneOf(a.eventKind, ["note", "divider", "delay"]);
    case "wrap":
      return isStrings(a.ids) && oneOf(a.operator, OPERATORS);
    case "includeEntity":
      return isString(a.entity) && (a.at === undefined || isPoint(a.at));
    case "setStoryTiming":
      return isString(a.story) && isPath(a.path) && isNumber(a.durationMs) && a.durationMs >= 0;
    case "addToScene":
      return (
        isString(a.story) &&
        isString(a.scene) &&
        oneOf(a.action, STORY_ACTION_KINDS) &&
        isStrings(a.ids) &&
        (a.durationMs === undefined || (isNumber(a.durationMs) && a.durationMs >= 0))
      );
    case "removeStoryAction":
      return isString(a.story) && isPath(a.path);
    case "insertScene":
      return isString(a.story) && (a.after === undefined || isString(a.after));
    default:
      return false;
  }
}

/** How many files the Add icon dialog sends at once, and the longest SVG text it sends. */
export const ADD_ICON_LIMITS = { files: 50, svg: 300_000 } as const;

const isPrefix = (v: unknown): v is string => typeof v === "string" && v.length <= 64;

/** The files of `checkIcons` and `addIcons`: a few, each with a name and an SVG text of bounded size. */
function isIconFiles(v: unknown): v is readonly IconFileInput[] {
  return (
    Array.isArray(v) &&
    v.length >= 1 &&
    v.length <= ADD_ICON_LIMITS.files &&
    v.every(
      (f) =>
        isObject(f) &&
        typeof f.file === "string" &&
        f.file.length <= 300 &&
        (f.name === undefined || (typeof f.name === "string" && f.name.length <= 200)) &&
        typeof f.svg === "string" &&
        f.svg.length <= ADD_ICON_LIMITS.svg,
    )
  );
}

/** Whether a value from the webview is a well-formed canvas message. */
export function isCanvasMessage(m: unknown): m is CanvasMessage {
  if (!isObject(m)) return false;
  switch (m.type) {
    case "ready":
    case "export":
    case "openModel":
      return true;
    case "pickDiagram":
      return isString(m.diagram);
    case "pickScenario":
      return m.scenario === null || isString(m.scenario);
    case "playEffects":
      return typeof m.on === "boolean";
    case "pickStory":
    case "exportPlayer":
      return m.story === null || isString(m.story);
    case "select":
    case "copy":
      return isStrings(m.ids);
    case "libraries":
      return true;
    case "libraryItems":
      return isString(m.library) && isString(m.category);
    case "librarySearch":
      return isString(m.query);
    case "searchIcons":
      return typeof m.query === "string" && m.query.length <= 200 && isNumber(m.token);
    case "checkIcons":
      return isNumber(m.token) && isPrefix(m.prefix) && isIconFiles(m.files);
    case "addIcons":
      return (
        isNumber(m.token) &&
        isPrefix(m.prefix) &&
        (m.licence === undefined || (typeof m.licence === "string" && m.licence.length <= 100)) &&
        isIconFiles(m.files) &&
        isStrings(m.targets)
      );
    case "newTheme":
      return isString(m.id) && oneOf(m.scope, ["file", "project"]);
    case "editTheme":
      return typeof m.open === "boolean";
    case "themeToken":
      return isString(m.token) && (m.value === null || isString(m.value) || isNumber(m.value));
    case "focusText":
      return isString(m.id);
    case "presencePointer":
      return (
        (m.point === null || isPoint(m.point)) && (m.diagram === undefined || isString(m.diagram))
      );
    case "presenceLaser":
      return (
        Array.isArray(m.points) &&
        m.points.length <= 64 &&
        m.points.every((p) => isPoint(p) && isNumber((p as { t?: unknown }).t)) &&
        (m.diagram === undefined || isString(m.diagram)) &&
        // A stroke's look out of bounds makes the whole batch unfit, as a point out of bounds does.
        (m.pen === undefined || isPresencePen(m.pen))
      );
    case "action":
      return isNumber(m.revision) && isAction(m.action);
    default:
      return false;
  }
}
