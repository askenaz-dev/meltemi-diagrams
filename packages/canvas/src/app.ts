import {
  DEFAULT_GRID,
  MINIMAP_SIZE,
  ZOOM_PRESETS,
  commandFor,
  fitSelection,
  fitViewport,
  freeCell,
  keepOrigin,
  minimapToViewport,
  minimapViewport,
  nearestInDirection,
  attachEnd,
  turnedAngle,
  belowInStack,
  borderDistance,
  carriedChildren,
  changesParent,
  dropTarget,
  highlightPath,
  intoFrame,
  magnets,
  nextInOrder,
  outOfFrame,
  stackAt,
  unionBox,
  outlineOf,
  resizeBox,
  resolveMove,
  revealBox,
  routeHandles,
  selectInRect,
  toDiagram,
  toScreen,
  toggleSelection,
  turnedBounds,
  withBendInserted,
  withBendMoved,
  withBendRemoved,
  withLinePoint,
  lineEnd,
  linePointsOf,
  zoomAt,
  zoomStep,
  arrowKindIn,
  arrowKindLine,
  arrowKinds,
  nextArrowKind,
  shapeOutline,
  shapeSize,
  penStyleFor,
  scalePenPoints,
  PRESENCE_PEN_LIMITS,
  STICKY_COLOURS,
  type PresencePen,
  type ArrowKind,
  type ShapeName,
  type AlignEdge,
  type Box,
  type EndAttachment,
  type CanvasAction,
  type CanvasCommand,
  type CanvasMessage,
  type CanvasProfile,
  type CanvasRender,
  type CanvasSettings,
  type CreatableDiagram,
  type ElementInfo,
  type ElementKind,
  type EventInfo,
  type FragmentOperator,
  type Guide,
  type Handle,
  type HostMessage,
  type Point,
  type PreviewedAction,
  type RelationInfo,
  type ShapeOptions,
  type TextPlace,
  type Viewport,
  type IconChoiceInfo,
  type LibraryItemInfo,
} from "@meltemi/diagrams-editor/canvas";
import { ICONS, ariaKeyshortcuts, clear, h, icon, s } from "./dom.js";
import { glyph, repaintSticky, shapeIcon, stickyGlyph, type IconPlacement } from "./glyphs.js";
import { IconPicker } from "./icon-picker.js";
import { AddIconsDialog, pickedRefusal, type PickedIcon } from "./add-icons.js";
import { InlineEditor, boxPlace, drawnLines, wrappedLines } from "./inline.js";
import { Inspector, ThemePanel } from "./inspector.js";
import { LayersPanel } from "./layers.js";
import { LibraryPanel } from "./library.js";
import { messages, type CanvasMessages } from "./messages/index.js";
import { Dialog, Menu, Picker, type MenuItem } from "./panels.js";
import {
  penPathOf,
  penResize,
  simplifyStroke,
  strokeSamples,
  sweepDistance,
  sweepTouches,
  tenthPoints,
} from "./pen.js";
import {
  PenMenu,
  readPenChoice,
  toolColour,
  toolOpacity,
  toolWidth,
  type PenChoice,
  type PenTool,
} from "./pen-menu.js";
import { PresenceLayer, type DrawnStroke, type DrawnTrail } from "./presence-layer.js";
import {
  FALLBACK_COLOUR,
  MAX_LASER_MS,
  MAX_LASER_POINTS,
  cursorMarks,
  parseColour,
  personKeys,
  presenceMarks,
  readMe,
  readPeople,
  toHex,
  type PersonView,
  type PresenceShape,
} from "./presence.js";
import { PeerStrokes } from "./strokes.js";
import { TRAIL_FADE_MS, Trail, thin } from "./trail.js";

/** The pointer goes to the host at most this often while it moves (it shares it as presence). */
const POINTER_EVERY_MS = 50;

/** Whether two pen parts are of one batch: both none, or one stroke in one look, cancelled alike. */
const samePresencePen = (a: PresencePen | undefined, b: PresencePen | undefined): boolean =>
  a?.width === b?.width &&
  a?.colour === b?.colour &&
  a?.opacity === b?.opacity &&
  a?.stroke === b?.stroke &&
  a?.cancel === b?.cancel;
import { placementIn } from "./placement.js";
import { ShapeGrid } from "./shape-grid.js";
import { THEME_STICKY, readStickyFill, stickyColourName, type StickyFill } from "./sticky.js";
import { StoryPanel } from "./story.js";
import { Tooltips } from "./tooltip.js";
import { undoRedoKey, viewCommand, writesDocument } from "./view-only.js";

/** What the canvas keeps between sessions of the same webview. */
export interface PersistedState {
  readonly viewports?: Record<string, Viewport>;
  readonly showGrid?: boolean;
  readonly snap?: boolean;
  readonly minimap?: boolean;
  readonly inspector?: boolean;
  readonly layers?: boolean;
  readonly libraries?: boolean;
  /** The layers hidden on the canvas, by diagram id. */
  readonly hiddenLayers?: Record<string, readonly string[]>;
  /**
   * Whether a diagram's effects play, by diagram id, as the person last chose with the toolbar's
   * Pause and Play; a diagram without a choice plays, unless the system asks for reduced motion.
   */
  readonly effectsPlaying?: Record<string, boolean>;
  /**
   * The pen menu's choices: the tool the pen button arms, the pen's width and colour, and the
   * highlighter's colour (a token as `@ink`, or `#rrggbb`). Read through `readPenChoice`, which
   * gives the defaults where they are absent or malformed.
   */
  readonly pen?: {
    readonly tool: "pen" | "highlighter";
    readonly width: number;
    readonly colour: string;
    readonly highlightColour: string;
  };
  /**
   * The colour of the sticky notes the sticky note button and S add: one of the six colours of
   * paper as `#rrggbb`, or null for the theme's `sticky`. Read through `readStickyFill`, which
   * gives the theme's where it is absent or not one of the six.
   */
  readonly sticky?: { readonly fill: string | null };
}

/**
 * What the canvas needs from the page that hosts it: a channel to the session (VS Code's webview
 * messages, or the playground's session in the same page) and a place to keep its own state.
 */
export interface CanvasHostApi {
  post(message: CanvasMessage): void;
  getState(): PersistedState | undefined;
  setState(state: PersistedState): void;
  /**
   * The host's own keys for what the canvas leaves to it, shown in the canvas's tooltips: the
   * playground folds the properties with Ctrl+Alt+B; VS Code, whose workbench owns that chord,
   * names none.
   */
  readonly keys?: { readonly inspector?: string };
}

/** What an inline editor edits: the label (or the id) of an element, a relation or an event. */
interface InlineTarget {
  readonly kind: "element" | "relation" | "event";
  readonly id: string;
  readonly rename: boolean;
}

/**
 * Kinds created without opening the label editor: shapes are placed empty, as in draw.io, and a
 * pen stroke has no text at all.
 */
const QUIET_KINDS: ReadonlySet<string> = new Set([
  "node",
  "decision",
  "data",
  "box",
  "icon",
  "image",
  "pen",
]);

/** The font of an id typed in place: ids are code. */
const ID_FONT = 'ui-monospace, "Cascadia Mono", Menlo, Consolas, monospace';

/** The whiteboard's drawing tools of free diagrams: they draw strokes, or erase them. */
type DrawingTool = PenTool | "eraser";

/** What the palette arms: a kind to place, the relation tool, or a drawing tool. */
type Tool = ElementKind | "relation" | DrawingTool;

/**
 * The tools that stay armed after their gesture, unlike the tools that place one element: a word
 * of handwriting is six strokes, not six presses of P. Escape, another tool, K or the same button
 * puts one away.
 */
const STAYS_ARMED: ReadonlySet<string> = new Set<DrawingTool>(["pen", "highlighter", "eraser"]);

/** Whether a tool draws or erases strokes rather than placing an element. */
const isDrawing = (tool: Tool | undefined): tool is DrawingTool =>
  tool !== undefined && STAYS_ARMED.has(tool);

/**
 * Whether a press erases as a stylus's buttons do: its barrel button (the second button,
 * `buttons` 2, on a pointer of type `pen`) or its eraser end (`buttons` 32).
 */
const stylusErases = (e: PointerEvent): boolean =>
  (e.pointerType === "pen" && (e.buttons & 2) !== 0) || (e.buttons & 32) !== 0;

/**
 * How long after a stylus erased with its barrel button the context menu its button raises stays
 * shut, in milliseconds: the menu comes at the press or at the release.
 */
const STYLUS_MENU_MS = 1000;

/** How far from the pointer, in screen pixels, the eraser takes a stroke: its cursor's radius. */
const ERASER_REACH = 8;
/** The tolerance of a stroke's simplification at the release, in screen pixels. */
const STROKE_TOLERANCE = 0.75;
/** Raw pointer positions closer than this to the last one kept, in screen pixels, add nothing. */
const STROKE_STEP = 0.5;
/**
 * How far beyond the edge of a stroke's drawing, in screen pixels at every zoom, a press still
 * takes it: its hit area is its path drawn this much wider on each side.
 */
const STROKE_REACH = 6;

/** The width of a pen's hit area in diagram units: its own, and `STROKE_REACH` pixels each side. */
const strokeReach = (width: number, zoom: number): number =>
  width + (2 * STROKE_REACH) / Math.max(zoom, 1e-3);
/**
 * A stroke or an erasure in flight is let go of after this many newer drawings that do not hold it
 * and no refusal: its refusal is the next message after the first, so this is only for a host that
 * never answers.
 */
const PEN_UNHELD_RENDERS = 3;
/** The colours a token falls back to when the host sends no swatches. */
const FALLBACK_TOKENS: Readonly<Record<string, string>> = {
  ink: "#1f2328",
  highlight: "#ffe600",
  sticky: THEME_STICKY,
};
/**
 * How long after a sticky note is sent for its drawing may arrive and still pop in: a sticky that
 * comes later is someone else's, or the text's, and is just drawn.
 */
const POP_WAIT_MS = 2000;

type Drag =
  | { kind: "pan"; start: Point; viewport: Viewport }
  /** A Pointer stroke: it draws a trail and nothing else. */
  | { kind: "laser" }
  | { kind: "band"; start: Point; current: Point; additive: boolean; base: readonly string[] }
  | {
      kind: "move";
      start: Point;
      primary: string;
      ids: string[];
      delta: Point;
      guides: Guide[];
      moving: boolean;
      /**
       * The group the dragged selection would land in, null outside every group (flow and free
       * diagrams); undefined while Alt keeps the parents, and before the drag moves.
       */
      target?: string | null;
      /** An Alt+press: released in place, it selects the shape below instead. */
      below?: boolean;
      /** The element an Alt+press dragged without selecting it first: selected once it moves. */
      pick?: string;
      /** Alt held at the last move: every parent stays, as on a drop with Alt. */
      free?: boolean;
      /**
       * Free diagrams: the list group the selection is dragged over and the position among its
       * children (the dragged ones taken out) that the pointer gives; the drop moves the
       * declarations there, with no point, and the preview makes room for them.
       */
      list?: ListDrop;
      /**
       * Where the drawing shown when the drag began drew each dragged element and what it holds:
       * the top left of its group, in diagram coordinates. A preview that puts them into a list
       * draws them in their new place, from which the canvas keeps them under the pointer.
       */
      drawn?: Map<string, Point>;
    }
  | { kind: "resize"; id: string; handle: Handle; start: Point; box: Box; result: Box }
  /** A rotation handle dragged about the centre of the element's box (diagram coordinates). */
  | {
      kind: "rotate";
      id: string;
      centre: Point;
      /** Where the handle was grabbed: the turn is the pointer's bearing change since. */
      grab: Point;
      from: number;
      angle: number;
      moving: boolean;
    }
  | { kind: "label"; relation: string; start: Point; delta: Point; moving: boolean }
  | {
      kind: "bend" | "segment";
      relation: string;
      index: number;
      start: Point;
      point: Point;
      moving: boolean;
      /** The second press of a double click on the relation: released in place, it edits the label. */
      edit?: boolean;
    }
  | {
      kind: "end";
      relation: string;
      end: "from" | "to";
      point: Point;
      target?: { element: string; attachment: EndAttachment };
    }
  | {
      kind: "connect";
      from: string;
      /** The side of the handle the line was dragged from, when it was. */
      side?: "north" | "south" | "east" | "west";
      /** The point of the border the line was dragged from, when it was. */
      start?: EndAttachment;
      point: Point;
      target?: { element: string; attachment: EndAttachment };
    }
  /**
   * A free line drawn by the relation tool from a press on empty canvas of a free diagram: its
   * start snapped where the press was, its end at the pointer. Released before the threshold, it
   * is the tool's click on what was pressed (`pressed`, at `press`).
   */
  | {
      kind: "lineDraw";
      press: Point;
      pressed: ReturnType<CanvasApp["hit"]>;
      start: Point;
      point: Point;
      moving: boolean;
      parent?: string;
    }
  /**
   * A point of a selected free line dragged: an end or a bend (`index` in its points, from first
   * to last), or the middle of a stretch (`segment`: the stretch after point `index`), which
   * inserts a bend there.
   */
  | {
      kind: "linePoint";
      id: string;
      part: "point" | "segment";
      index: number;
      start: Point;
      point: Point;
      moving: boolean;
    }
  /** Sequence diagrams: a message, note or fragment dragged up or down, never above its space. */
  | { kind: "event"; key: string; start: Point; delta: number; min: number; moving: boolean }
  /**
   * A stroke of the pen or the highlighter (`tool`) by the pointer `pointer`: the raw positions
   * from the press in diagram units (coalesced events included), drawn on the overlay as they
   * come; `straight` while Shift keeps it a segment from the press; `moving` once the pointer has
   * left the press, before which the release writes a dot. `parent` is the group under the press.
   * `look` is how the others see it drawn, and `shared` how many of `points` went to them.
   */
  | {
      kind: "penDraw";
      tool: PenTool;
      /** The stroke on the overlay, its `d` rewritten at every move. */
      path: SVGPathElement;
      pointer: number;
      press: Point;
      points: Point[];
      straight: boolean;
      moving: boolean;
      parent?: string;
      look: PresencePen;
      shared: number;
    }
  /**
   * The eraser by the pointer `pointer`, or a stylus's eraser button: the pens it crossed so far,
   * hidden as it crosses them, and where the pointer was, to sweep from at the next move.
   */
  | { kind: "erase"; pointer: number; last: Point; hits: Set<string> }
  | { kind: "minimap" };

/** How close to a box's border, in screen pixels, a dragged end takes a point of it. */
const BORDER_REACH = 12;
/** How close, in screen pixels, a dragged end is drawn to a magnet. */
const MAGNET_REACH = 6;
/** How far outside a box's border, in screen pixels, a press starts a connection from it. */
const START_RING = 8;

/** Two presses on a handle within this time and distance are a double click. */
const DOUBLE_CLICK_MS = 500;
/** What `lastHandlePress` holds for a press on a relation's line or label. */
const RELATION_PRESS = "relation";
const DOUBLE_CLICK_DISTANCE = 6;

/** A press on the main part of a split button held this long opens its menu, as a right-click. */
const LONG_PRESS_MS = 450;

/** The steps of the rotation handle, in degrees; Alt turns them off. */
const ROTATION_STEP = 15;

/** The pictures of a C4 view's entity tools, by kind; the others draw a box. */
const C4_TOOL_ICONS: Readonly<Record<string, string>> = {
  person: ICONS.actor,
  datastore: ICONS.database,
};

/**
 * What the group tool creates: a group with its title, an untitled container, or on free diagrams
 * a list group, a column or a row (`group <id> "Column" { layout column }`).
 */
type GroupKind = "group" | "container" | "column" | "row";

/** The pictures of the kinds of group the group tool creates. */
const GROUP_ICONS: Readonly<Record<GroupKind, string>> = {
  group: ICONS.group,
  container: ICONS.plainContainer,
  column: ICONS.column,
  row: ICONS.row,
};

/** Where a drag into a list drops: the list group, and the position among its children. */
interface ListDrop {
  readonly id: string;
  readonly index: number;
}

/**
 * How thick the insertion bar of a list is drawn and the radius of its end dots, in screen
 * pixels; how far inside the list's edges it ends, in diagram units.
 */
const INSERTION_BAR = 3;
const INSERTION_DOT = 3;
const INSERTION_INSET = 6;
/** The radius of the + at the end of a list, and its distance from the last child, in pixels. */
const LIST_ADD_RADIUS = 11;
const LIST_ADD_GAP = 6;
/** Half a resize handle: a + past a list's edge stays clear of the handle there. */
const LIST_ADD_HANDLE = 4;
/**
 * How long after a drop into a list its drawing may arrive and still glide the dropped elements
 * into their places (a later drawing is just drawn).
 */
const SETTLE_WAIT_MS = 2000;

/** The kinds of diagram the New diagram button adds, in the order of its menu. */
const CREATABLE: readonly CreatableDiagram[] = ["flow", "free", "sequence"];

/** The picture of each kind of diagram the canvas creates. */
const DIAGRAM_ICONS: Record<CreatableDiagram, string> = {
  flow: "M2.5 2.5h5v3h-5z|M8.5 10.5h5v3h-5z|M5 5.5V12h3.5|M7 10.5L8.5 12 7 13.5",
  free: "M2.5 2.5h6v4h-6z|M9.5 8.5h4v5h-4z|M2.5 9.5h4v3h-4z",
  sequence: ICONS.participants,
};

/** The kinds the palette places, which name its tools in the catalog. */
type PaletteKind = keyof CanvasMessages["palette"]["tools"];

/**
 * Palette entries; the profile of the diagram picks which appear (`profile`: the profiles it shows
 * on, separated by spaces; every profile when absent). The icon tool opens the icon picker.
 */
const PALETTE: readonly {
  kind: PaletteKind;
  key: string;
  profile?: string;
}[] = [
  { kind: "node", key: "N", profile: "flow" },
  { kind: "decision", key: "D", profile: "flow" },
  { kind: "data", key: "S", profile: "flow" },
  { kind: "note", key: "O", profile: "flow free c4" },
  { kind: "tag", key: "T", profile: "flow" },
  { kind: "box", key: "B", profile: "free" },
  { kind: "text", key: "T", profile: "free" },
  // A click or S adds a sticky note near the centre, a drag places one; its arrow picks the colour.
  { kind: "sticky", key: "S", profile: "free" },
  { kind: "icon", key: "I", profile: "flow free" },
  { kind: "image", key: "M", profile: "free" },
  { kind: "participant", key: "P", profile: "sequence" },
  { kind: "actor", key: "A", profile: "sequence" },
  { kind: "group", key: "G" },
  // The whiteboard: the pen (its menu holds the highlighter, H) and the eraser.
  { kind: "pen", key: "P", profile: "free" },
  { kind: "eraser", key: "E", profile: "free" },
];

/**
 * The tools whose button is split, the shapes grid behind its arrow: free boxes and flow nodes.
 * Each places the canvas's current shape.
 */
const SHAPED_TOOLS: ReadonlySet<string> = new Set<PaletteKind>(["box", "node"]);

/** The participant kinds the sequence palette offers in its menu. */
const MORE_PARTICIPANTS: readonly PaletteKind[] = [
  "boundary",
  "control",
  "entity",
  "database",
  "collections",
  "queue",
];

/** The operators of a new fragment, in the order its menu offers them. */
const OPERATORS: readonly FragmentOperator[] = [
  "alt",
  "opt",
  "loop",
  "par",
  "break",
  "critical",
  "region",
];

const DEFAULT_SIZES: Record<ElementKind, { width: number; height: number }> = {
  node: { width: 160, height: 56 },
  decision: { width: 160, height: 80 },
  data: { width: 160, height: 64 },
  note: { width: 120, height: 36 },
  tag: { width: 56, height: 18 },
  group: { width: 280, height: 168 },
  box: { width: 160, height: 56 },
  text: { width: 120, height: 28 },
  icon: { width: 48, height: 48 },
  image: { width: 160, height: 120 },
  // A line is drawn by dragging, from point to point; this is the ghost of a click.
  line: { width: 120, height: 1 },
  // A pen is drawn by dragging too; a press without moving is a dot of its width.
  pen: { width: 3, height: 3 },
  // A sticky never grows: its card is 160 × 160 and its words fit it.
  sticky: { width: 160, height: 160 },
  person: { width: 160, height: 104 },
  system: { width: 180, height: 80 },
  container: { width: 170, height: 76 },
  datastore: { width: 170, height: 84 },
  component: { width: 160, height: 72 },
  participant: { width: 120, height: 44 },
  actor: { width: 120, height: 64 },
  boundary: { width: 120, height: 64 },
  control: { width: 120, height: 64 },
  entity: { width: 120, height: 64 },
  database: { width: 120, height: 64 },
  collections: { width: 120, height: 48 },
  queue: { width: 120, height: 48 },
};

const Z_ORDER = {
  bringToFront: "front",
  sendToBack: "back",
  bringForward: "forward",
  sendBackward: "backward",
} as const;

const HANDLES: readonly Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const DRAG_THRESHOLD = 3;
/** How long the ghost of a line just drawn takes to fade out: `--mdg-motion` in `canvas.css`. */
const LINE_FADE_MS = 160;

/** Whether a toolbar element shows on a profile: its `data-profile` lists the profiles it is for. */
const forProfile = (profiles: string, profile: CanvasProfile): boolean =>
  profiles.split(" ").includes(profile);

/** An element of a library as the icon picker and the drags see it: its icon, label and picture. */
const choiceOf = (item: LibraryItemInfo): IconChoiceInfo => ({
  reference: item.icon,
  label: item.label,
  svg: item.svg,
});

/**
 * An icon dragged from the icon picker or the Libraries panel: what it is (a library element keeps
 * its label and kind), the picture under the pointer, where the pointer is on the stage, whether it
 * is over the stage, and the element under it that would take the icon.
 */
interface IconDrag {
  readonly choice: IconChoiceInfo;
  readonly item?: LibraryItemInfo;
  readonly image: HTMLElement;
  point: Point;
  inside: boolean;
  target?: string;
}

/** The canvas of one document: draws renders from the host and turns input into actions. */
export class CanvasApp {
  private render: CanvasRender | undefined;
  private elements = new Map<string, ElementInfo>();
  private relations = new Map<string, RelationInfo>();
  private events = new Map<string, EventInfo>();
  /** Where each element is painted in the drawing, back to front: the order of its SVG groups. */
  private paint = new Map<string, number>();
  private settings: CanvasSettings = {
    grid: DEFAULT_GRID,
    showGrid: true,
    snap: true,
    guides: true,
    minimap: true,
    inspector: true,
  };
  private local: PersistedState;
  private viewport: Viewport = { x: 0, y: 0, zoom: 1 };
  private selection: string[] = [];
  private highlight: string[] = [];
  /** Other people's selections and pointers, as the host's last `presence` message left them. */
  private presence: readonly PersonView[] = [];
  /**
   * The host shares presence (it has sent `presence` once): only then does the canvas tell it where
   * the pointer is. An editor that shows one person's diagram is never sent a pointer it would drop.
   */
  private sharesPointer = false;
  /** The pointer message waiting for its turn, the last one sent, and the turn's timer. */
  private pointerNext: CanvasMessage | undefined;
  private pointerSent: string | undefined;
  private pointerTimer: ReturnType<typeof setTimeout> | undefined;
  /**
   * The Pointer tool is on: a press draws a trail on the presence layer and selects, moves, creates,
   * connects, edits and opens nothing. It is nobody's setting: it is not kept and not sent.
   */
  private pointing = false;
  /** The person's own trail, and one per other person (by cursor key). */
  private readonly ownTrail = new Trail("#2563eb");
  private readonly peerTrails = new Map<string, Trail>();
  /** The last batch drawn for each person: a batch the host repeats is not drawn again. */
  private readonly peerBatches = new Map<string, number>();
  /** Under reduced motion a person's batch stays whole until this moment. */
  private readonly peerHolds = new Map<string, number>();
  /**
   * Other people's strokes of the pen and the highlighter as they draw them (by cursor key), and
   * the timer that lets them go ten seconds after their last batch.
   */
  private readonly peerStrokes = new PeerStrokes();
  private strokeTimer: ReturnType<typeof setTimeout> | undefined;
  private strokeExpiry: number | undefined;
  /** The colour the host names for the person at this canvas, from `presence.me`. */
  private personColour: string | undefined;
  private trailFrame: number | undefined;
  /** The points of the stroke the host has not been sent, with `t` as `performance.now()`. */
  private laserQueue: { x: number; y: number; t: number }[] = [];
  /** How the queued points look when they are a stroke of the pen or the highlighter. */
  private laserPen: PresencePen | undefined;
  private laserTimer: ReturnType<typeof setTimeout> | undefined;
  /**
   * The number of the last stroke drawn with the pen or the highlighter, which the others tell its
   * batches by (`PresencePen.stroke`): from a random start, so a canvas opened again does not take
   * up the numbers its strokes of a moment ago went by.
   */
  private strokeNumber = Math.floor(Math.random() * PRESENCE_PEN_LIMITS.stroke.max);
  /** The last batch each person sent of a stroke of theirs, by the person's key: drawn once. */
  private readonly strokeBatches = new Map<string, number>();
  private stale = false;
  private drag: Drag | undefined;
  private tool: Tool | undefined;
  /** The pen menu, behind the arrow of the pen button. */
  private readonly penMenu = new PenMenu();
  /** The main part of the pen button: it shows and arms the pen or the highlighter. */
  private penButton: HTMLButtonElement | undefined;
  /** The main part of the sticky note button: it shows the colour of the sticky notes it adds. */
  private stickyButton: HTMLButtonElement | undefined;
  /**
   * When a sticky note was last sent to be created: the drawing that brings it pops it in, as its
   * editor opens over it, if it comes within `POP_WAIT_MS`.
   */
  private popping: number | undefined;
  /**
   * The strokes written and the strokes erased, in order, until the render that holds each edit
   * arrives: a stroke's path stays on the overlay meanwhile (so it never blinks between the hand and
   * the drawing), and an edit made while another is pending waits for its render, one per render,
   * as nudges do, so a quick hand never writes against a stale revision. `sent` is the revision an
   * edit was sent against; `retried` once it was refused for a stale revision and sent again.
   */
  private penQueue: {
    readonly action: CanvasAction;
    readonly path?: SVGPathElement;
    sent?: number | undefined;
    retried?: boolean;
    /** How many newer drawings came that do not hold it while it was in flight. */
    unheld?: number;
  }[] = [];
  /** The pens the eraser has hidden and not yet written away, back on Escape or a refusal. */
  private erased = new Set<string>();
  /** The pointer of a stylus that is down: touches meanwhile are a hand resting on the screen. */
  private stylus: number | undefined;
  /** When a stylus's barrel button or eraser end last pressed to erase, for its context menu. */
  private stylusErasedAt: number | undefined;
  /** The zoom the pens' hit areas are sized for (`syncStrokeHits`). */
  private strokeHitZoom: number | undefined;
  /**
   * What the inline editor just wrote the text of: the drawing that holds the new text says the
   * selection again, so the status line does not keep the old text.
   */
  private relabelled: string | undefined;
  /** The midpoint chain of each pen of the drawing as a polyline, measured once per render. */
  private penSamples = new Map<string, Point[]>();
  /** The relation tool's source, once its first element is clicked. */
  private relationFrom: string | undefined;
  private pending = false;
  private queued: Point = { x: 0, y: 0 };
  /** The latest value of a slider stepped while an edit was pending, written after it. */
  private queuedSlide:
    { readonly ids: readonly string[]; readonly field: string; readonly value: number } | undefined;
  private spaceDown = false;
  private pointer: Point = { x: 0, y: 0 };

  /** `no-diagram` until a diagram is drawn: the tools that need one stay out of sight. */
  private readonly toolbar = h("div", {
    class: "toolbar no-diagram",
    role: "toolbar",
    "aria-label": messages().toolbar.label,
  });
  private readonly stage = h("div", {
    class: "stage",
    tabindex: 0,
    role: "application",
    "aria-roledescription": messages().stage.roleDescription,
    "aria-label": messages().stage.label,
  });
  private readonly content = h("div", { class: "content" });
  private readonly overlay = s("svg", { class: "overlay", "aria-hidden": "true" });
  /** Other people's outlines and tags: above the scene, below the overlay, never hit-tested. */
  private readonly presenceLayer = new PresenceLayer();
  private readonly banner = h("div", { class: "banner", hidden: true, role: "alert" });
  private readonly empty = h("div", { class: "empty", hidden: true });
  private readonly status = h("div", { class: "status", role: "status", "aria-live": "polite" });
  private readonly minimap = h("div", {
    class: "minimap",
    "aria-label": messages().stage.minimap,
    role: "img",
  });
  private readonly map = h("div", { class: "map" });
  private readonly frame = h("div", { class: "frame" });
  private readonly inspector: Inspector;
  private readonly themePanel: ThemePanel;
  private readonly layersPanel: LayersPanel;
  private readonly libraryPanel: LibraryPanel;
  private readonly menu = new Menu();
  private readonly picker = new Picker();
  private readonly dialog = new Dialog();
  /** The editor typing over a text of the drawing, and what it edits. */
  private inline: { readonly editor: InlineEditor; readonly target: InlineTarget } | undefined;
  private readonly diagramSelect = h("select", { "aria-label": messages().toolbar.diagram });
  private readonly scenarioSelect = h("select", {
    "aria-label": messages().toolbar.scenario,
    title: messages().toolbar.scenarioTitle,
  });
  private readonly zoomSelect = h("select", { "aria-label": messages().toolbar.zoom });
  private readonly storySelect = h("select", {
    "aria-label": messages().toolbar.story,
    title: messages().toolbar.storyTitle,
  });
  private readonly storyPanel: StoryPanel;
  /** The revision of the last render or story message, which actions are made against. */
  private revision: number | undefined;
  /** The size of the story frame shown in story mode. */
  private storySize: { width: number; height: number } | undefined;
  /** The ids selected on a story frame. */
  private storySelection: string[] = [];
  private emptyText = "";
  /** The kinds of diagram the last `empty` message offers to create, one button each. */
  private emptyCreatable: readonly CreatableDiagram[] = [];
  /** The document has no diagram (an `empty` message came after the last render). */
  private noDiagram = false;
  /**
   * The live preview of a move or a resize (`preview` actions): the last token given, the request
   * awaiting its answer (one at most) with the delta it asked for, whether the gesture changed
   * since, and the gesture (as JSON) of the last request sent.
   */
  private previewToken = 0;
  private previewWaiting:
    | {
        readonly token: number;
        readonly delta: Point;
        readonly gone?: boolean;
        /** A move into a list: where to. */
        readonly list?: ListDrop;
      }
    | undefined;
  private previewAgain = false;
  private previewSent: string | undefined;
  /**
   * The stage shows a preview's drawing instead of the last render's: that of a move by `delta`
   * (zero for a resize). Undefined while it shows the last render. A move into a list (`list`)
   * draws each moved element in its new place: `shifts` holds how far that is from where the
   * drag began, by id.
   */
  private previewShown:
    | {
        readonly delta: Point;
        readonly offset: Point;
        readonly box?: Box;
        readonly list?: ListDrop;
        shifts?: Map<string, Point>;
      }
    | undefined;
  /**
   * A rotation released and written, until the edit's render comes: the outline and the handles
   * keep its angle meanwhile, as the drawing does.
   */
  private turnPending: { readonly id: string; readonly angle: number } | undefined;
  /** The main part of a split button whose held press opened its menu: its click arms nothing. */
  private held: HTMLButtonElement | undefined;
  private readonly main: HTMLElement;
  /** The layout of the diagram shown, or story mode; hidden while no diagram is drawn. */
  private readonly modeBadge = h("span", { class: "badge", hidden: true });
  /** Says, quietly and to assistive technology too, that the canvas only shows. */
  private readonly readOnlyBadge = h("span", { class: "view-only-badge", hidden: true });
  private readonly toggles = new Map<string, HTMLButtonElement>();
  /** The palette's relation tool ("Message" on sequence diagrams). */
  private relationButton!: HTMLButtonElement;
  /**
   * The shape the box (free) and node (flow) tools place, B and N included: `rounded` until one is
   * chosen in the shapes grid, kept while the canvas is open and never written.
   */
  private shape: ShapeName = "rounded";
  /** The kind of arrow the relation tool creates: chosen in its menu or cycled with R. */
  private arrowKind: ArrowKind = "->";
  /**
   * What the group tool creates: a group with its title, an untitled container, a column or a row
   * (the last two on free diagrams), kept while the canvas is open and never written.
   */
  private groupKind: GroupKind = "group";
  private groupButton: HTMLButtonElement | undefined;
  /** The arrow part of the group button, whose title names the kinds the diagram offers. */
  private groupArrow: HTMLButtonElement | undefined;
  /**
   * The bar that shows where a drag into a list drops: across the list, in the gap the drop takes,
   * in the theme's guide colour, with a dot at each end. It is drawn in the drawing shown, under
   * what is dragged (which floats above it) and above the rest, and goes from drawing to drawing as
   * previews replace them, so that it fades in once and slides from gap to gap.
   */
  private readonly insertion = s(
    "g",
    { class: "mdg-insertion", "aria-hidden": "true", "pointer-events": "none" },
    s("line", { class: "mdg-insertion-halo" }),
    s("line", { class: "mdg-insertion-line" }),
    s("circle", { class: "mdg-insertion-dot" }),
    s("circle", { class: "mdg-insertion-dot" }),
  );
  /**
   * Where the insertion bar shows, in diagram coordinates: its list, whether it lies across a
   * column (else it stands across a row), and its ends. Undefined while it is hidden.
   */
  private insertionAt:
    | { readonly list: string; readonly column: boolean; readonly from: Point; readonly to: Point }
    | undefined;
  /** The + buttons at the end of the lists, by the list's id; hidden ones wait to show again. */
  private readonly listAdds = h("div", { class: "list-adds" });
  private readonly listAddButtons = new Map<string, HTMLButtonElement>();
  /** The lists under the pointer, innermost first, whose + shows. */
  private hoveredLists: readonly string[] = [];
  /** The list whose + the pointer is over: it stays while the pointer is on it. */
  private listAddHover: string | undefined;
  /**
   * Elements just dropped into a list, until the drawing of the drop arrives: they glide from
   * where the drag left them into their places, and the cards around them into theirs.
   */
  private settling: { readonly since: number } | undefined;
  /**
   * What waits for the render of a pending edit, one per render: a + pressed while the label of
   * the last card was being written, Alt+Up pressed again before the first moved.
   */
  private afterRender: (() => void)[] = [];
  /** The grid of shapes behind the arrow of the box and node buttons, and F. */
  private readonly shapeGrid = new ShapeGrid();
  /** The main parts of the box and node buttons, which show the current shape. */
  private readonly shapeButtons = new Map<string, HTMLButtonElement>();
  /** The icon picker of the I tool, the inspector's Icon field and the context menu's Icon…. */
  private readonly iconPicker: IconPicker;
  /** The Add icon dialog, and what it adds to: the targets of the icon, then what follows. */
  private readonly addIconsDialog: AddIconsDialog;
  private addTargets: readonly string[] = [];
  private addAfter: ((choice: IconChoiceInfo) => void) | undefined;
  /** An icon just added, chosen once the drawing that knows it arrives. */
  private afterIcons: { choice: IconChoiceInfo; run: (choice: IconChoiceInfo) => void } | undefined;
  /** The prefix the Add icon dialog offers, the one used last while the canvas is open. */
  private iconPrefix = "project";
  /**
   * How a new icon is put on the canvas, chosen in the placement control of the picker or of the
   * Libraries panel: the icon as the shape until another is chosen, kept while the canvas is open.
   */
  private placement: IconPlacement = "icon";
  /** The icon the armed icon tool places where the stage is clicked. */
  private armedIcon: IconChoiceInfo | undefined;
  /** An icon dragged from the picker or the Libraries panel. */
  private iconDrag: IconDrag | undefined;
  /** The element the note tool, dragged from the palette, is over: it would take the note. */
  private noteDrop: string | undefined;
  /** The thumbnails drawn in the overlay's ghosts, read once per icon. */
  private readonly ghostIcons = new Map<string, SVGSVGElement>();
  /** The target outlines of the last overlay: kept ones do not fade in again. */
  private outlined = new Set<string>();
  private readonly tooltips: Tooltips;

  constructor(
    private readonly root: HTMLElement,
    private readonly host: CanvasHostApi,
    private readonly mac: boolean,
  ) {
    this.local = host.getState() ?? {};
    this.inspector = new Inspector({
      commit: (ids, field, value) => this.act({ kind: "setField", ids, field, value }),
      slide: (ids, field, value) => this.slide(ids, field, value),
      pickIcon: (ids, field, anchor) => this.pickIconFor(ids, field, anchor),
      newTheme: (current, project) =>
        this.dialog.newTheme(current, project, (id, scope) =>
          this.post({ type: "newTheme", id, scope }),
        ),
      editTheme: () => this.post({ type: "editTheme", open: true }),
      act: (action) => this.act(action),
      fold: (collapsed) => this.setInspectorCollapsed(collapsed),
    });
    this.themePanel = new ThemePanel({
      token: (token, value) => this.post({ type: "themeToken", token, value }),
      close: () => this.post({ type: "editTheme", open: false }),
      fold: () => this.setInspectorCollapsed(true),
    });
    this.inspector.setKey(this.inspectorKey);
    this.themePanel.setKey(this.inspectorKey);
    this.layersPanel = new LayersPanel({
      act: (action) => this.act(action),
      setHidden: (layer, hidden) => this.setLayerHidden(layer, hidden),
      announce: (text) => this.announce(text),
    });
    this.libraryPanel = new LibraryPanel({
      items: (library, category) => this.post({ type: "libraryItems", library, category }),
      search: (query) => this.post({ type: "librarySearch", query }),
      // A click places the element in a free cell near the centre, as the palette's keys do.
      create: (item) => this.placeIcon(choiceOf(item), this.centreCell(item), item),
      drag: (item, event) => this.startIconDrag(choiceOf(item), event, item),
      placement: (placement) => this.setPlacement(placement),
      addIcons: () => this.startAddIcons([], (choice) => this.armIcon(choice)),
    });
    this.libraryPanel.setPlacement(this.placement, false);
    this.addIconsDialog = new AddIconsDialog({
      check: (prefix, files, token) => this.post({ type: "checkIcons", token, prefix, files }),
      add: (request, token) =>
        this.post({ type: "addIcons", token, ...request, targets: this.addTargets }),
      closed: (added) => this.iconsAdded(added),
    });
    this.iconPicker = new IconPicker({
      search: (query, token) => this.post({ type: "searchIcons", query, token }),
      placement: (placement) => this.setPlacement(placement),
      drag: (choice, event) => this.startIconDrag(choice, event),
    });
    this.tooltips = new Tooltips(root);
    this.buildToolbar();
    this.minimap.append(this.map, this.frame);
    // The minimap sits in the corner of the canvas, never over the inspector.
    // The + of the lists over the overlay and its handles, to be pressed.
    this.listAdds.setAttribute("data-write", "");
    this.stage.append(
      this.content,
      this.presenceLayer.element,
      this.overlay,
      this.listAdds,
      this.banner,
      this.empty,
      this.status,
      this.minimap,
    );
    const main = h(
      "div",
      { class: "main" },
      h("div", { class: "side" }, this.libraryPanel.element, this.layersPanel.element),
      this.stage,
      this.inspector.element,
      this.themePanel.element,
    );
    main.append(
      this.menu.element,
      this.picker.element,
      this.dialog.element,
      this.shapeGrid.element,
      this.penMenu.element,
      this.iconPicker.element,
      this.addIconsDialog.element,
    );
    this.main = main;
    this.storyPanel = new StoryPanel({
      draw: (svg, width, height) => this.drawStoryFrame(svg, width, height),
      act: (action) => this.act(action),
      selection: () => this.storySelection,
      announce: (text, error) => this.announce(text, error),
      exportPlayer: (story) => this.post({ type: "exportPlayer", story }),
    });
    root.append(this.toolbar, main, this.storyPanel.element, this.tooltips.element);
    this.listen();
    new ResizeObserver(() => this.layout()).observe(this.stage);
    host.post({ type: "ready" });
  }

  // ------------------------------------------------------------------ messages

  receive(message: HostMessage): void {
    switch (message.type) {
      case "libraries":
        this.libraryPanel.show(message.libraries);
        break;
      case "libraryItems":
        this.libraryPanel.received(message.library, message.category, message.items);
        break;
      case "librarySearch":
        this.libraryPanel.searched(message.query, message.items);
        break;
      case "icons":
        this.iconPicker.received(message.token, message.groups);
        break;
      case "iconsChecked":
        this.addIconsDialog.checked(message.token, message);
        break;
      case "iconsAdded":
        this.addIconsDialog.added(message.token, message.added, message.refused);
        break;
      case "render":
        this.applyRender(message);
        break;
      case "stale":
        this.stale = true;
        this.pending = false;
        this.queuedSlide = undefined;
        // A + or a move in a list cannot be written until the errors are fixed.
        this.afterRender = [];
        this.settling = undefined;
        // Strokes and erasures not written yet cannot be, until the errors are fixed.
        if (this.penQueue.length > 0) {
          this.penQueue = [];
          this.restoreErased();
          this.drawOverlay();
        }
        this.content.classList.add("stale");
        this.banner.hidden = false;
        this.banner.textContent = messages().stage.outOfDate(
          message.count,
          message.first.message,
          message.first.line,
        );
        if (!this.render) {
          this.showEmpty(messages().stage.fixIt(message.first.message, message.first.line));
        }
        // A diagram that cannot be drawn yet has properties all the same.
        if (this.noDiagram) {
          this.noDiagram = false;
          this.syncToggles();
        }
        break;
      case "empty":
        this.render = undefined;
        this.revision = message.revision;
        this.emptyText = message.message;
        this.emptyCreatable = message.creatable ?? [];
        // No render of a pending edit will come.
        this.pending = false;
        this.queued = { x: 0, y: 0 };
        this.queuedSlide = undefined;
        // Nothing is shown any more, so what others had selected in it is gone with it.
        this.presence = [];
        this.forgetDiagram();
        if (this.storyPanel.active) break;
        clear(this.content);
        this.showEmpty(message.message, this.emptyCreatable);
        this.layout();
        break;
      case "preview":
        this.applyPreview(message);
        break;
      case "story":
        this.applyStory(message);
        break;
      case "rejected":
        this.pending = false;
        // Icons that were not written are not chosen.
        this.afterIcons = undefined;
        // A label refused is drawn as it was, and the selection keeps its text.
        if (!this.inline) this.showDrawnText();
        this.relabelled = undefined;
        this.queued = { x: 0, y: 0 };
        this.queuedSlide = undefined;
        this.turnPending = undefined;
        {
          // A stroke refused is not drawn; strokes the eraser could not take come back. One
          // refused because the text changed under it goes again after the next drawing.
          const again = this.penRefused(message.code);
          // A sticky note refused never comes to pop in.
          this.popping = undefined;
          // What waited for the edit's render waits no more; a drop into a list refused glides
          // back where it came from. A stroke or an erasure in the hand is not what was refused:
          // it goes on.
          this.afterRender = [];
          const drawing = this.drag?.kind === "penDraw" || this.drag?.kind === "erase";
          if (this.settling) {
            this.settling = undefined;
            if (!drawing) {
              const back = this.drawnRects();
              this.resetPreview();
              this.glide(back, this.motion("--mdg-motion"));
            }
          } else if (!drawing) this.resetPreview();
          if (message.code === "edit.has-dependents" && message.dependents && message.retry) {
            const retry = message.retry;
            this.dialog.confirm(message.reason, message.dependents, () => this.act(retry));
          } else if (!again) {
            this.announce(message.reason, true);
          }
        }
        break;
      case "highlight":
        this.highlight = [...message.ids];
        this.drawOverlay();
        break;
      case "presence":
        // Each message is the whole picture: it replaces the last, never merges with it. It only
        // draws; nothing of it is sent back, saved or part of what is exported.
        this.presence = readPeople(message.people);
        this.sharesPointer = true;
        this.personColour = readMe(message.me);
        this.takeLasers();
        this.ownTrail.colour = this.trailColour();
        this.syncPointerCursor();
        this.drawPresence();
        break;
      case "select":
        this.select([...message.ids], false);
        if (message.ids.length === 1 && !this.readOnly) {
          // A new shape is empty until a double click, Enter or F2 adds its text; a new icon or
          // image has no label to type. Texts, notes, tags and groups open their editor.
          const created = this.elements.get(message.ids[0]!);
          const kind = created?.kind;
          // A container has no title to type either.
          const untitled = kind === "group" && created?.label === "";
          if (kind === undefined || (!QUIET_KINDS.has(kind) && !untitled)) {
            this.editLabel(message.ids[0]!);
          }
        }
        break;
      case "settings": {
        const wasReadOnly = this.readOnly;
        this.settings = message.settings;
        if (this.readOnly !== wasReadOnly) this.applyReadOnly();
        this.syncToggles();
        this.layout();
        break;
      }
      case "inspector":
        this.inspector.show(message.model);
        // The Choose… that opened the icon picker, drawn anew, is marked as its opener again.
        this.iconPicker.syncOpener();
        // The render of the pending edit came before its inspector: the slider's turn.
        this.flushSlide();
        break;
      case "themePanel":
        // The theme panel edits the theme: a canvas that only shows never opens it.
        if (message.panel && this.readOnly) this.post({ type: "editTheme", open: false });
        else if (message.panel) this.themePanel.show(message.panel);
        else {
          const had = this.themePanel.open;
          this.themePanel.hide();
          if (had)
            (this.showInspector ? this.inspector.element : this.inspector.railButton).focus();
        }
        this.syncToggles();
        break;
      case "status":
        this.announce(message.message);
        break;
    }
  }

  /** Whether the canvas only shows: `CanvasSettings.readOnly`, switched at run time. */
  private get readOnly(): boolean {
    return this.settings.readOnly === true;
  }

  private post(message: CanvasMessage): void {
    // A canvas that only shows sends nothing that would change the document.
    if (this.readOnly && writesDocument(message)) return;
    this.host.post(message);
  }

  /** The point of a box's border a press would start a connection from. */
  private borderStart: { readonly element: string; readonly attachment: EndAttachment } | undefined;

  /** The last press on a handle, to tell its double click. */
  private lastHandlePress:
    | { readonly id: string; readonly handle: string; readonly time: number; readonly point: Point }
    | undefined;

  /** The ghost of a line just drawn, fading out while its edit is drawn (`since`: the release). */
  private lineFading:
    { readonly from: Point; readonly to: Point; readonly since: number } | undefined;
  private lineFadeTimer: ReturnType<typeof setTimeout> | undefined;

  /** Sends an action for the current revision; returns whether it was sent. */
  private act(action: CanvasAction): boolean {
    // Read-only: every action is dropped, so no plan reaches the host (nothing is left pending).
    if (this.readOnly) return false;
    if (this.revision === undefined) return false;
    if (this.stale && action.kind !== "setField") {
      this.announce(messages().announcements.fixFirst, true);
      return false;
    }
    this.pending = true;
    this.post({ type: "action", revision: this.revision, action });
    return true;
  }

  /**
   * Writes a slider's value. While an edit is pending, the latest value waits for the next render,
   * as nudges do, so that keys held on a slider never send an edit of a stale revision; a value
   * already written is not written again.
   */
  private slide(ids: readonly string[], field: string, value: number): void {
    if (this.pending) {
      this.queuedSlide = { ids, field, value };
      return;
    }
    // A value written now is newer than one that waits (a step between a render and its
    // inspector): the one that waits is not written after it.
    this.queuedSlide = undefined;
    const written = this.inspector.writtenValue(ids, field);
    if (written !== null && written !== undefined && Number(written) === value) return;
    this.act({ kind: "setField", ids, field, value });
  }

  /** The slider value that waited for a pending edit, once that edit is drawn. */
  private flushSlide(): void {
    const queued = this.queuedSlide;
    if (!queued || this.pending) return;
    this.queuedSlide = undefined;
    this.slide(queued.ids, queued.field, queued.value);
  }

  private announce(text: string, error = false): void {
    this.status.textContent = text;
    this.status.classList.toggle("error", error);
  }

  private get showLayers(): boolean {
    return this.local.layers ?? false;
  }

  private get showLibraries(): boolean {
    return this.local.libraries ?? false;
  }

  private toggleLibraries(): void {
    this.persist({ libraries: !this.showLibraries });
    this.syncToggles();
    if (this.showLibraries && this.layersAllowed) {
      this.post({ type: "libraries" });
      this.libraryPanel.focus();
    }
  }

  // ------------------------------------------------------------------ icons

  /** Whether the diagram shown takes icons from the picker: flow diagrams and free compositions. */
  private get iconsAllowed(): boolean {
    const profile = this.render?.profile;
    return (profile === "flow" || profile === "free") && !this.storyPanel.active;
  }

  /** Whether the session answers icon searches on the diagram shown: also C4 views, for fields. */
  private get iconsSearchable(): boolean {
    return this.iconsAllowed || (this.render?.profile === "c4" && !this.storyPanel.active);
  }

  /** The placement in effect on the diagram shown: the icon alone only in free compositions. */
  private get placementNow(): IconPlacement {
    return placementIn(this.placement, this.render?.profile === "free");
  }

  /** A new placement, chosen in the picker or the Libraries panel: both show it. */
  private setPlacement(placement: IconPlacement): void {
    this.placement = placement;
    this.syncPlacement();
    this.drawOverlay();
  }

  /** The picker and the Libraries panel show the placement, among those the diagram offers. */
  private syncPlacement(): void {
    const free = this.render?.profile === "free";
    this.iconPicker.setPlacement(this.placement, free);
    this.libraryPanel.setPlacement(this.placement, free);
  }

  /** The selected elements that take an icon: nodes, decisions, data stores and boxes. */
  private iconTargets(): string[] {
    return this.selection.filter((id) => this.elements.get(id)?.takesIcon === true);
  }

  /** A point of the stage in the coordinates of the main area, where popovers are placed. */
  private mainPoint(point: Point): Point {
    const base = this.main.getBoundingClientRect();
    const stage = this.stage.getBoundingClientRect();
    return { x: point.x + stage.left - base.left, y: point.y + stage.top - base.top };
  }

  /**
   * Where a popover opens under a control, in the coordinates of the main area: the point under
   * its left edge, and its top, over which the popover opens when the room below is short.
   */
  private underControl(control: HTMLElement): { readonly at: Point; readonly above: number } {
    const base = this.main.getBoundingClientRect();
    const rect = control.getBoundingClientRect();
    return {
      at: { x: rect.left - base.left, y: Math.max(4, rect.bottom - base.top + 4) },
      above: rect.top - base.top,
    };
  }

  /**
   * The I tool: opens the icon picker, or closes it when it is open. On the selected elements that
   * take an icon, else to place one; under the I button when it shows, else at the stage's corner.
   * Nothing opens on a canvas that only shows, in story mode, or on sequence diagrams and C4 views.
   */
  private toggleIconPicker(opener?: HTMLElement): void {
    if (this.iconPicker.isOpen) {
      this.iconPicker.close();
      return;
    }
    if (this.readOnly || !this.iconsAllowed) return;
    const button =
      opener ?? this.toolbar.querySelector<HTMLButtonElement>('button[data-tool="icon"]');
    const shown = button !== null && button.offsetParent !== null;
    const under = shown ? this.underControl(button) : undefined;
    this.openIconPicker(
      under?.at ?? this.mainPoint({ x: 8, y: 8 }),
      this.iconTargets(),
      shown ? button : undefined,
      under?.above,
    );
  }

  /**
   * Opens the icon picker at `at` (main area; over `above` when the room below is short): on
   * `targets`, which take the icon chosen, or, with none, to place an icon: a click on a result
   * arms the icon tool, Enter places it at the centre.
   */
  private openIconPicker(
    at: Point,
    targets: readonly string[],
    opener?: HTMLElement,
    above?: number,
  ): void {
    if (this.readOnly || !this.iconsAllowed) return;
    this.shapeGrid.close(false);
    const bounds = this.main.getBoundingClientRect();
    if (targets.length > 0) {
      this.iconPicker.open({
        at,
        bounds,
        above,
        opener,
        targets,
        choose: (choice) => this.giveIcon(targets, choice),
        // The icons added go to the targets in the same step.
        ...(this.canAddIcons ? { add: () => this.startAddIcons(targets) } : {}),
      });
      return;
    }
    this.iconPicker.open({
      at,
      bounds,
      above,
      opener,
      placement: { current: this.placement, free: this.render?.profile === "free" },
      choose: (choice, via) => {
        if (via === "enter") {
          // The new element is selected: the canvas takes the keyboard back, as a click's does.
          this.stage.focus({ preventScroll: true });
          this.placeIcon(choice, this.centreCell());
        } else this.armIcon(choice);
      },
      // The first icon added is chosen, as a click on it would choose it: the tool places it.
      ...(this.canAddIcons
        ? { add: () => this.startAddIcons([], (choice) => this.armIcon(choice)) }
        : {}),
    });
  }

  /** Whether the canvas offers Add icon…: it edits a document of a project. */
  private get canAddIcons(): boolean {
    return !this.readOnly && this.render?.project === true;
  }

  /**
   * Add icon…: asks for SVG files, then opens the dialog over them. The icons added go to
   * `targets` in the same step, or, with `after`, the first is chosen once it is drawn.
   */
  private startAddIcons(
    targets: readonly string[],
    after?: (choice: IconChoiceInfo) => void,
  ): void {
    if (!this.canAddIcons) return;
    void pickIconFiles(this.main).then((picked) => {
      if (picked.length === 0 || !this.canAddIcons) return;
      this.addTargets = targets;
      this.addAfter = after;
      this.addIconsDialog.open(picked, this.iconPrefix);
    });
  }

  /** The dialog closed: the icons added join the recent ones, and the first is chosen. */
  private iconsAdded(added: readonly IconChoiceInfo[]): void {
    if (this.addIconsDialog.prefix !== "") this.iconPrefix = this.addIconsDialog.prefix;
    for (const icon of [...added].reverse()) {
      this.iconPicker.remember({
        reference: icon.reference,
        label: icon.label,
        svg: icon.svg,
      });
    }
    const after = this.addAfter;
    this.addAfter = undefined;
    this.addTargets = [];
    if (added.length > 0 && after) this.afterIcons = { choice: added[0]!, run: after };
  }

  /** The inspector's Choose…: the picker under the button, for an icon field of its targets. */
  private pickIconFor(ids: readonly string[], field: string, anchor: HTMLElement): void {
    if (this.readOnly) return;
    if (this.iconPicker.isOpen && this.iconPicker.opener === anchor) {
      this.iconPicker.close();
      return;
    }
    this.shapeGrid.close(false);
    // A render draws the inspector anew while the picker is open: its Choose… is found again.
    const key = anchor.dataset.key;
    const current = (): HTMLElement | null =>
      anchor.isConnected || !key
        ? anchor
        : this.inspector.element.querySelector<HTMLElement>(`[data-key="${cssEscape(key)}"]`);
    this.iconPicker.open({
      ...this.underControl(anchor),
      bounds: this.main.getBoundingClientRect(),
      opener: anchor,
      findOpener: current,
      targets: ids,
      choose: (choice) => {
        // The field keeps the keyboard: its button is drawn again with the new icon.
        current()?.focus({ preventScroll: true });
        if (!this.act({ kind: "setField", ids, field, value: choice.reference })) return;
        this.iconPicker.remember(choice);
        this.announce(messages().announcements.iconSet(choice.label, ids));
      },
      // An icon added is written in the field once it is drawn, as a choice would be.
      ...(this.canAddIcons
        ? {
            add: () =>
              this.startAddIcons([], (choice) => {
                if (this.act({ kind: "setField", ids, field, value: choice.reference })) {
                  this.announce(messages().announcements.iconSet(choice.label, ids));
                }
              }),
          }
        : {}),
    });
  }

  /** Gives `ids` an icon, in one edit; the stage takes the keyboard back. */
  private giveIcon(ids: readonly string[], choice: IconChoiceInfo): void {
    this.stage.focus({ preventScroll: true });
    if (!this.act({ kind: "setIcon", ids, icon: choice.reference })) return;
    this.iconPicker.remember(choice);
    this.announce(messages().announcements.iconSet(choice.label, ids));
  }

  /** Takes away the icons written on `ids`, in one edit. */
  private removeIcons(ids: readonly string[]): void {
    if (this.act({ kind: "removeIcon", ids })) {
      this.announce(messages().announcements.iconsRemoved(ids));
    }
  }

  /** Arms the icon tool with an icon: a click on the stage places it, its ghost under the pointer. */
  private armIcon(choice: IconChoiceInfo): void {
    if (this.tool !== "icon") this.arm("icon");
    if (this.tool !== "icon") return;
    this.armedIcon = choice;
    this.stage.focus({ preventScroll: true });
    this.announce(messages().announcements.placeIcon(choice.label));
    this.drawOverlay();
  }

  /**
   * Where an icon placed at the centre goes: a free cell near the centre of the view, as large as
   * the element the placement creates.
   */
  private centreCell(item?: LibraryItemInfo): Point {
    return freeCell(
      [...this.elements.values()].map((e) => e.box),
      this.diagramOf(this.centre()),
      this.iconSize(item),
      this.settings.grid,
    );
  }

  /** The default size of what an icon is placed as: an icon shape, a box, an icon object. */
  private iconSize(item?: LibraryItemInfo): { width: number; height: number } {
    if (item?.kind !== undefined) return DEFAULT_SIZES.node;
    const placement = this.placementNow;
    if (placement === "icon") return shapeSize("icon");
    if (placement === "only") return DEFAULT_SIZES.icon;
    return shapeSize(this.shape === "icon" ? "rounded" : this.shape);
  }

  /**
   * Puts an icon on the canvas at `at`, as the placement says: a node (a box in free compositions)
   * drawn as the icon, or holding it beside its label in the current shape, or an `icon` object
   * alone. A library element keeps its label, and a kind of its own, with which it holds the icon.
   */
  private placeIcon(choice: IconChoiceInfo, at: Point, item?: LibraryItemInfo): void {
    if (this.readOnly) return;
    const free = this.render?.profile === "free";
    const label = item ? { label: item.label } : {};
    let sent: boolean;
    if (item?.kind !== undefined) {
      sent = this.create(item.kind as ElementKind, at, { ...label, icon: choice.reference });
    } else if (this.placementNow === "only") {
      sent = this.create("icon", at, { source: choice.reference });
    } else {
      const shape =
        this.placementNow === "icon" ? "icon" : this.shape === "icon" ? "rounded" : this.shape;
      sent = this.create(free ? "box" : "node", at, { ...label, icon: choice.reference, shape });
    }
    if (!sent) return;
    this.iconPicker.remember(choice);
    this.announce(messages().announcements.iconAdded(choice.label));
  }

  /**
   * An icon dragged out of the picker or the Libraries panel: a picture follows the pointer; over a
   * node, decision, data store or box the element is outlined as a drop target and the drop gives
   * it the icon; over the empty stage the ghost of what would be placed shows, and the drop places
   * it. Escape, or a release outside the stage, does nothing.
   */
  private startIconDrag(choice: IconChoiceInfo, event: PointerEvent, item?: LibraryItemInfo): void {
    this.endIconDrag();
    if (this.readOnly || !this.iconsAllowed) return;
    const thumb = h("span", { class: "thumb" });
    if (choice.svg) thumb.innerHTML = choice.svg;
    const image = h(
      "div",
      { class: "icon-drag", "aria-hidden": "true" },
      thumb,
      h("span", { class: "name" }, choice.label),
    );
    this.main.append(image);
    this.iconDrag = { choice, item, image, point: { x: 0, y: 0 }, inside: false };
    if (!item) this.iconPicker.lend(true);
    const pointer = event.pointerId;
    const stop = () => {
      document.removeEventListener("pointermove", move, true);
      document.removeEventListener("pointerup", up, true);
      document.removeEventListener("pointercancel", cancel, true);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", cancel);
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId === pointer) this.moveIconDrag(e);
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== pointer) return;
      stop();
      this.dropIcon(e);
    };
    const cancel = () => {
      stop();
      this.endIconDrag();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      cancel();
    };
    document.addEventListener("pointermove", move, true);
    document.addEventListener("pointerup", up, true);
    document.addEventListener("pointercancel", cancel, true);
    window.addEventListener("keydown", key, true);
    window.addEventListener("blur", cancel);
    this.moveIconDrag(event);
  }

  private moveIconDrag(e: PointerEvent): void {
    const drag = this.iconDrag;
    if (!drag) return;
    const base = this.main.getBoundingClientRect();
    drag.image.style.transform = `translate(${e.clientX - base.left + 12}px, ${e.clientY - base.top + 12}px)`;
    const rect = this.stage.getBoundingClientRect();
    drag.inside =
      !!this.render &&
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom;
    drag.point = this.pointOf(e);
    this.pointer = drag.point;
    const at = this.diagramOf(drag.point);
    drag.target = drag.inside ? this.stackAt(at).find((el) => el.takesIcon)?.id : undefined;
    drag.image.classList.toggle("onto", drag.target !== undefined);
    drag.image.classList.toggle("outside", !drag.inside);
    this.drawOverlay();
  }

  /** The release of a dragged icon: onto an element, its icon; on the stage, a new element. */
  private dropIcon(e: PointerEvent): void {
    const drag = this.iconDrag;
    if (!drag) return;
    this.moveIconDrag(e);
    const { choice, item, target, inside } = drag;
    let done = false;
    if (target) {
      done = this.act({ kind: "setIcon", ids: [target], icon: choice.reference });
      if (done) {
        this.iconPicker.remember(choice);
        this.announce(messages().announcements.iconSet(choice.label, [target]));
      }
    } else if (inside) {
      this.placeIcon(choice, this.snapPoint(this.diagramOf(drag.point)), item);
      done = true;
    }
    this.endIconDrag(done);
  }

  /** Ends a drag of an icon; the picker it came from closes when the drop did something. */
  private endIconDrag(done = false): void {
    const drag = this.iconDrag;
    if (!drag) return;
    this.iconDrag = undefined;
    drag.image.remove();
    if (!drag.item) this.iconPicker.lend(false, done);
    if (done) this.stage.focus({ preventScroll: true });
    this.drawOverlay();
  }

  /** A thumbnail for the overlay, as an SVG element of its own (a copy each time). */
  private thumbnailNode(choice: IconChoiceInfo): SVGSVGElement | undefined {
    if (!choice.svg) return undefined;
    let node = this.ghostIcons.get(choice.reference);
    if (!node) {
      const parsed = new DOMParser().parseFromString(choice.svg, "image/svg+xml").documentElement;
      if (parsed.nodeName.toLowerCase() !== "svg") return undefined;
      node = document.importNode(parsed, true) as unknown as SVGSVGElement;
      this.ghostIcons.set(choice.reference, node);
    }
    return node.cloneNode(true) as SVGSVGElement;
  }

  /**
   * The ghost of an icon about to be placed at a point of the stage (screen pixels), as the
   * placement draws it: the icon in its square with a line for its label under it, a box of the
   * current shape with the icon beside its text, or the icon alone.
   */
  private drawIconGhost(choice: IconChoiceInfo, point: Point, item?: LibraryItemInfo): void {
    const zoom = this.viewport.zoom;
    const placement: IconPlacement = item?.kind !== undefined ? "box" : this.placementNow;
    const size = this.iconSize(item);
    const at = this.snapPoint(this.diagramOf(point));
    const box = this.screenBox({
      x: at.x - size.width / 2,
      y: at.y - size.height / 2,
      ...size,
    });
    const group = s("g", { class: "ghost-icon", "data-placement": placement });
    const picture = this.thumbnailNode(choice);
    const put = (x: number, y: number, side: number) => {
      if (!picture) return;
      for (const [name, value] of [
        ["x", x],
        ["y", y],
        ["width", side],
        ["height", side],
      ] as const) {
        picture.setAttribute(name, String(value));
      }
      group.append(picture);
    };
    if (placement === "box") {
      const shape = item?.kind !== undefined || this.shape === "icon" ? "rounded" : this.shape;
      const options = shape === "rounded" ? { radius: 8 * zoom } : {};
      group.append(s("path", { class: "ghost", d: shapeOutline(shape, box, options).d }));
      const side = Math.min(20 * zoom, box.height * 0.45);
      put(box.x + box.width / 2 - side * 2, box.y + box.height / 2 - side / 2, side);
      group.append(
        s("rect", {
          class: "ghost-label",
          x: box.x + box.width / 2 - side * 0.6,
          y: box.y + box.height / 2 - 2.5 * zoom,
          width: side * 2.2,
          height: 5 * zoom,
          rx: 2.5 * zoom,
        }),
      );
    } else {
      group.append(
        s("rect", {
          class: "ghost",
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
          rx: 6 * zoom,
        }),
      );
      const inset = box.width * 0.1;
      put(box.x + inset, box.y + inset, box.width - 2 * inset);
      if (placement === "icon") {
        group.append(
          s("rect", {
            class: "ghost-label",
            x: box.x + box.width * 0.2,
            y: box.y + box.height + 7 * zoom,
            width: box.width * 0.6,
            height: 5 * zoom,
            rx: 2.5 * zoom,
          }),
        );
      }
    }
    this.overlay.append(group);
  }

  /** Whether the diagram has layers to show: flow diagrams and free compositions. */
  private get layersAllowed(): boolean {
    const profile = this.render?.profile;
    return (profile === "flow" || profile === "free") && !this.storyPanel.active;
  }

  /** The layers hidden on the canvas for the current diagram. */
  private hiddenLayers(): Set<string> {
    const r = this.render;
    return new Set(r ? (this.local.hiddenLayers?.[r.diagram] ?? []) : []);
  }

  private isHidden(layer: string | null): boolean {
    return layer !== null && this.hiddenLayers().has(layer);
  }

  private setLayerHidden(layer: string, hidden: boolean): void {
    const r = this.render;
    if (!r) return;
    const set = this.hiddenLayers();
    if (hidden) set.add(layer);
    else set.delete(layer);
    this.persist({ hiddenLayers: { ...this.local.hiddenLayers, [r.diagram]: [...set] } });
    const visible = this.selection.filter((id) => {
      const layerOf = this.elements.get(id)?.layer ?? this.relations.get(id)?.layer ?? null;
      return !this.isHidden(layerOf);
    });
    if (visible.length !== this.selection.length) this.select(visible);
    this.refreshLayers();
    // What others selected on a layer that is hidden is not drawn, nor drawn again when it shows.
    this.drawPresence();
  }

  /** Shows the layers panel what the diagram holds, and hides the hidden layers' drawings. */
  private refreshLayers(): void {
    const r = this.render;
    if (!r) return;
    const hidden = this.hideLayers();
    this.layersPanel.show({
      profile: r.profile,
      layers: r.layers,
      things: [
        ...[...this.elements.values()].map((e) => ({ id: e.id, layer: e.layer })),
        ...[...this.relations.values()].map((x) => ({ id: x.key, layer: x.layer })),
      ],
      selection: this.selection,
      hidden,
    });
    this.syncToggles();
  }

  /** Hides the drawings of the layers hidden on the canvas; returns those layers. */
  private hideLayers(): Set<string> {
    const hidden = this.hiddenLayers();
    for (const group of this.content.querySelectorAll<SVGGElement>("[data-layer]")) {
      group.style.visibility = hidden.has(group.dataset.layer ?? "") ? "hidden" : "";
    }
    return hidden;
  }

  private persist(next: Partial<PersistedState>): void {
    this.local = { ...this.local, ...next };
    this.host.setState(this.local);
  }

  private get showGrid(): boolean {
    return this.local.showGrid ?? this.settings.showGrid;
  }
  private get snap(): boolean {
    return this.local.snap ?? this.settings.snap;
  }
  private get showMinimap(): boolean {
    return this.local.minimap ?? this.settings.minimap;
  }
  private get showInspector(): boolean {
    // A kept value that is not a boolean is the host's default.
    const kept = this.local.inspector;
    return typeof kept === "boolean" ? kept : this.settings.inspector;
  }

  /** The host's key for the fold of the properties, or "" when it has none. */
  private get inspectorKey(): string {
    const key = this.host.keys?.inspector;
    return typeof key === "string" ? key : "";
  }

  /** Whether the properties panel is folded to its rail. */
  get inspectorCollapsed(): boolean {
    return !this.showInspector;
  }

  /**
   * Folds the properties panel to its rail or unfolds it, keeping the choice as the toolbar's
   * toggle does; the fold buttons, the toggle and a host's key all come here. Folding from inside
   * the panel (or the theme panel) gives the focus to the rail's button; unfolding gives it to the
   * panel, unless the toolbar has it. Nothing is written to the document.
   */
  setInspectorCollapsed(collapsed: boolean): void {
    const focused = document.activeElement;
    const inside =
      !!focused &&
      (this.inspector.element.contains(focused) || this.themePanel.element.contains(focused));
    const fromToolbar = !!focused && this.toolbar.contains(focused);
    this.persist({ inspector: !collapsed });
    this.syncToggles();
    if (collapsed) {
      if (inside && !this.inspector.element.hidden) this.inspector.railButton.focus();
      return;
    }
    if (fromToolbar) return;
    const panel = this.themePanel.open ? this.themePanel.element : this.inspector.element;
    if (!panel.hidden) panel.focus();
  }

  // ------------------------------------------------------------------ render

  private applyRender(render: CanvasRender): void {
    // A drawing that plays (or not) against the choice kept for its diagram is not shown: the
    // canvas asks for the other one, which the session answers with at once.
    if (
      render.effects > 0 &&
      !this.storyPanel.active &&
      render.playing !== this.effectsWanted(render.diagram)
    ) {
      this.post({ type: "playEffects", on: !render.playing });
      return;
    }
    const previous = this.render;
    // An effect turned on while the diagram is paused does not move: say why.
    if (
      previous?.diagram === render.diagram &&
      render.effects > previous.effects &&
      !render.playing
    ) {
      this.announce(messages().announcements.effectsPaused);
    }
    // Another diagram is another picture: the host sends the others' selections again after it.
    if (previous && previous.diagram !== render.diagram) this.presence = [];
    this.render = render;
    this.revision = render.revision;
    // The strokes written are in this drawing: the overlay's go in the same frame. An edit in flight
    // that this drawing does not hold (somebody else's edit came first) stays in flight: the
    // refusal of its stale revision follows, and it goes again.
    this.penQueue = this.penQueue.filter((entry) => {
      if (entry.sent === undefined || render.revision <= entry.sent) return true;
      if (this.holdsPenEdit(entry.action, render)) return false;
      entry.unheld = (entry.unheld ?? 0) + 1;
      if (entry.unheld < PEN_UNHELD_RENDERS) return true;
      // No refusal came for it: it is let go of, as a refusal would.
      if (entry.action.kind === "remove") this.restoreErased(entry.action.ids);
      return false;
    });
    this.penSamples = new Map();
    // So are the strokes others drew, which the presence layer gives up to the drawing.
    this.strokesRendered(render, previous);
    this.libraryPanel.setAddable(this.canAddIcons);
    const after = this.afterIcons;
    this.afterIcons = undefined;
    if (after) {
      queueMicrotask(() => {
        // What was added stays said, before what to do with it.
        const added = this.status.textContent ?? "";
        after.run(after.choice);
        const next = this.status.textContent ?? "";
        if (added !== "" && next !== added) this.announce(`${added} ${next}`);
      });
    }
    this.turnPending = undefined;
    this.noDiagram = false;
    this.stale = false;
    this.content.classList.remove("stale");
    this.banner.hidden = true;
    this.empty.hidden = true;
    // The sticky note just sent, in this drawing for the first time: it pops in below.
    const popped = this.freshStickies(render, previous);
    this.elements = new Map(render.elements.map((e) => [e.id, e]));
    this.relations = new Map(render.relations.map((r) => [r.key, r]));
    this.events = new Map(render.events.map((e) => [e.key, e]));
    this.content.classList.toggle("preview", render.scenario !== null);
    // An editor stays over its text through a render, unless what it edits is gone.
    const edited = this.inline?.target;
    if (
      edited &&
      (previous?.diagram !== render.diagram ||
        !(
          edited.kind === "element"
            ? this.elements
            : edited.kind === "relation"
              ? this.relations
              : this.events
        ).has(edited.id))
    ) {
      this.closeInline();
    }
    // The selection and the guides take the diagram theme's colours; focus rings keep the editor's.
    for (const [name, color] of [
      ["--mdg-select", render.colors?.selection],
      ["--mdg-guide", render.colors?.guide],
    ] as const) {
      if (color) this.stage.style.setProperty(name, color);
      else this.stage.style.removeProperty(name);
    }
    if (this.storyPanel.active) {
      // The story's frames stay on the canvas; the diagram returns when story mode ends.
      this.pending = false;
      return;
    }
    // What was dropped into a list, or moved in it, glides from where it was into its place.
    const settling =
      this.settling !== undefined && performance.now() - this.settling.since < SETTLE_WAIT_MS;
    this.settling = undefined;
    const before = settling ? this.drawnRects() : undefined;
    // A preview on the stage gives way to the render, which is the drop's when one was pending.
    if (!previous || previous.svg !== render.svg || this.previewShown) this.setSvg(render);
    this.popIn(popped, render.offset);
    // Erased strokes the drawing still holds stay hidden: the eraser goes on, or its edit is on
    // its way; the ones it took are gone from it.
    this.erased = new Set([...this.erased].filter((id) => this.elements.get(id)?.pen));
    this.hideErased(this.erased);
    this.previewShown = undefined;
    this.endPreview();
    // A drag that goes on keeps its elements under the pointer over the new drawing.
    if (this.drag?.kind === "move" && this.drag.moving) this.followPointer();
    this.selection = [...render.selection];
    // The tools and the panels of this drawing take their room first (after an empty file they
    // were out of sight), so that the fit below measures the stage they leave.
    this.updateToolbar();
    this.refreshLayers();
    if (previous && previous.diagram === render.diagram) {
      this.viewport = keepOrigin(this.viewport, previous.offset, render.offset);
    } else {
      const saved = this.local.viewports?.[render.diagram];
      this.viewport = saved ?? this.fitted();
    }
    if (this.showLibraries && this.layersAllowed && !this.readOnly) {
      // The list again (a pack may have arrived with its categories), and the thumbnails missing.
      this.post({ type: "libraries" });
      this.libraryPanel.refreshMissing();
    }
    if (previous?.profile !== render.profile) this.syncPlacement();
    // The picker goes with a diagram that takes no icons; its thumbnails may have arrived. C4 views
    // take icons from the inspector's Icon field only, so the picker it opened stays open there.
    if (!this.iconsSearchable) this.iconPicker.close(false);
    else this.iconPicker.refresh();
    const wasPending = this.pending;
    this.pending = false;
    this.layout();
    if (before) this.glide(before, this.motion("--mdg-motion"));
    if (wasPending && (this.queued.x !== 0 || this.queued.y !== 0)) {
      const delta = this.queued;
      this.queued = { x: 0, y: 0 };
      this.nudge(delta);
    }
    // The text the inline editor wrote is in this drawing: the selection is said again with it.
    const relabelled = this.relabelled;
    this.relabelled = undefined;
    if (relabelled !== undefined && this.selection.includes(relabelled)) this.announceSelection();
    // A stroke or an erasure that waited for this render goes now.
    this.flushPen();
    // A + or a move in a list that waited for this render goes now, one per render.
    if (!this.pending && this.afterRender.length > 0) this.afterRender.shift()!();
  }

  private fitted(): Viewport {
    const size = this.storyPanel.active ? this.storySize : this.render;
    if (!size) return this.viewport;
    return fitViewport({ width: size.width, height: size.height }, this.screen());
  }

  // ------------------------------------------------------------------ stories

  /** The story picker, and story mode on or off with the playback the host sent. */
  private applyStory(message: HostMessage & { type: "story" }): void {
    this.revision = message.revision;
    this.pending = false;
    const words = messages();
    clear(this.storySelect);
    this.storySelect.append(
      h("option", { value: "", selected: message.playback === null }, words.toolbar.editDiagram),
    );
    for (const story of message.stories) {
      this.storySelect.append(
        h(
          "option",
          { value: story.id, selected: story.id === message.playback?.id },
          words.toolbar.storyOption(story.id, story.title),
        ),
      );
    }
    this.storySelect.hidden = message.stories.length === 0;
    const was = this.storyPanel.active;
    if (message.playback) {
      const entering = !was || this.storyPanel.story !== message.playback.id;
      this.setStoryMode(true);
      this.modeBadge.hidden = false;
      this.modeBadge.textContent = words.mode.story;
      this.modeBadge.title = words.mode.storyTitle;
      if (entering) this.storySelection = [];
      this.storyPanel.show(message.playback);
      if (entering) this.setViewport(this.fitted());
      return;
    }
    if (!was) return;
    this.storyPanel.hide();
    this.storySize = undefined;
    this.storySelection = [];
    this.setStoryMode(false);
    if (this.render) {
      this.updateToolbar();
      this.setSvg(this.render);
      this.viewport = this.local.viewports?.[this.render.diagram] ?? this.fitted();
      this.layout();
    } else {
      clear(this.content);
      this.modeBadge.hidden = true;
      this.showEmpty(this.emptyText, this.emptyCreatable);
    }
  }

  /**
   * Shows a message instead of a drawing and, under it, a button for each kind of diagram it
   * offers to create; a canvas that only shows hides the buttons (`data-write`).
   */
  private showEmpty(text: string, creatable: readonly CreatableDiagram[] = []): void {
    clear(this.empty);
    this.empty.hidden = false;
    this.empty.append(h("p", { class: "empty-message" }, text));
    if (creatable.length === 0) return;
    const words = messages();
    const actions = h("div", {
      class: "empty-actions",
      role: "group",
      "aria-label": words.stage.create,
      "data-write": "",
    });
    for (const type of creatable) {
      const button = h(
        "button",
        { type: "button", "data-create": type },
        diagramIcon(type),
        words.diagrams[type],
      );
      button.addEventListener("click", () => this.createDiagram(type));
      actions.append(button);
    }
    // The buttons lie on the stage: its presses and keys are not theirs.
    for (const type of ["pointerdown", "keydown", "dblclick", "contextmenu"] as const) {
      actions.addEventListener(type, (e) => e.stopPropagation());
    }
    this.empty.append(actions);
  }

  /** Adds an empty diagram of a kind to the file, which the canvas shows once it is written. */
  private createDiagram(type: CreatableDiagram): void {
    if (!this.act({ kind: "createDiagram", type })) return;
    this.announce(messages().announcements.createdDiagram(type));
    this.stage.focus({ preventScroll: true });
  }

  /**
   * Forgets what the last drawing left behind, for a file without diagrams: the diagram and
   * scenario pickers, the layout badge, the properties, the minimap, the selection, the problems
   * banner, the status line, and what was half done on the drawing (a drag, a tool, an editor in
   * place, a menu).
   * The content is the caller's: a story may still show its frame.
   */
  private forgetDiagram(): void {
    this.drag = undefined;
    this.previewShown = undefined;
    this.endPreview();
    if (this.inline) this.cancelInline();
    // Strokes in the air or on their way, and the strokes being erased, go with the drawing.
    this.penQueue = [];
    this.erased = new Set();
    // So do the lists' + and what waited to add to them.
    this.afterRender = [];
    this.settling = undefined;
    this.hoveredLists = [];
    this.listAddHover = undefined;
    this.penMenu.close(false);
    this.tool = undefined;
    this.stage.classList.remove("drawing");
    this.syncPointerCursor();
    this.relationFrom = undefined;
    this.borderStart = undefined;
    this.stage.classList.remove("placing", "connecting", "panning");
    this.menu.close();
    this.picker.close();
    this.shapeGrid.close(false);
    this.iconPicker.close(false);
    this.endIconDrag();
    this.armedIcon = undefined;
    this.selection = [];
    this.highlight = [];
    this.elements = new Map();
    this.relations = new Map();
    this.events = new Map();
    this.paint = new Map();
    this.stale = false;
    this.content.classList.remove("stale");
    this.banner.hidden = true;
    clear(this.diagramSelect);
    this.diagramSelect.hidden = true;
    clear(this.scenarioSelect);
    this.scenarioSelect.hidden = true;
    this.playButton.hidden = true;
    if (!this.storyPanel.active) {
      this.modeBadge.hidden = true;
      this.modeBadge.textContent = "";
      this.modeBadge.title = "";
    }
    this.toolbar.classList.add("no-diagram");
    this.noDiagram = true;
    this.inspector.clear();
    clear(this.map);
    // What the status line said was about the drawing.
    this.announce("");
    this.syncToggles();
    this.drawPresence();
    // The pens others' strokes were written as were of that drawing.
    this.peerStrokes.clear(true);
  }

  /**
   * Applies `CanvasSettings.readOnly`, which a `settings` message turns on or off at any time:
   * what writes the document goes (`data-write`, hidden as story mode hides `data-edit`), what only
   * looks stays, and the canvas says so in its badge, its labels and its status line.
   */
  private applyReadOnly(): void {
    const on = this.readOnly;
    const words = messages();
    this.root.classList.toggle("view-only", on);
    this.readOnlyBadge.hidden = !on;
    this.readOnlyBadge.textContent = on ? words.readOnly.badge : "";
    this.readOnlyBadge.title = on ? words.readOnly.badgeTitle : "";
    this.stage.setAttribute("aria-label", on ? words.readOnly.stage : words.stage.label);
    this.inspector.setReadOnly(on);
    this.layersPanel.setReadOnly(on);
    this.storyPanel.setReadOnly(on);
    if (on) {
      // Whatever was half done is let go: an editor in place, an armed tool, a menu, a dialog.
      if (this.inline) this.cancelInline();
      this.tool = undefined;
      this.relationFrom = undefined;
      this.borderStart = undefined;
      this.queued = { x: 0, y: 0 };
      this.queuedSlide = undefined;
      this.stage.classList.remove("placing", "connecting", "drawing");
      this.syncPointerCursor();
      this.menu.close();
      this.picker.close();
      this.shapeGrid.close(false);
      this.penMenu.close(false);
      this.iconPicker.close(false);
      this.endIconDrag();
      this.armedIcon = undefined;
      this.dialog.close();
      if (this.themePanel.open) {
        this.themePanel.hide();
        this.post({ type: "editTheme", open: false });
      }
      // And a drag in the air goes back to the drawing; the handles go with the redraw.
      if (this.drag) this.resetPreview();
      this.announce(words.readOnly.entered);
    } else if (this.showLibraries && this.layersAllowed) {
      this.post({ type: "libraries" });
    }
  }

  private setStoryMode(on: boolean): void {
    for (const element of [this.root, this.toolbar, this.main, this.stage]) {
      element.classList.toggle("story-mode", on);
    }
    if (on) {
      this.empty.hidden = true;
      this.banner.hidden = true;
      this.shapeGrid.close(false);
      this.penMenu.close(false);
      this.iconPicker.close(false);
      this.endIconDrag();
      this.setPointing(false);
      // A story only plays: the pen and the eraser are put away, as their buttons are.
      if (isDrawing(this.tool)) this.arm(undefined);
    }
  }

  /** Shows a frame of the story, with the selected boxes marked. */
  private drawStoryFrame(svg: string, width: number, height: number): void {
    this.storySize = { width, height };
    this.content.innerHTML = svg;
    const root = this.content.querySelector("svg");
    if (root) {
      root.setAttribute("aria-hidden", "true");
      for (const id of this.storySelection) {
        for (const g of root.querySelectorAll(`g[data-id="${cssEscape(id)}"]`)) {
          g.classList.add("story-selected");
        }
      }
    }
  }

  /** Selects what is under the pointer on a story frame, for **Add to scene**. */
  private storyClick(e: PointerEvent, additive: boolean): void {
    const target = (e.target as Element).closest?.(
      '[data-role="element"], [data-role="relation"], [data-role="label"], [data-role="event"]',
    );
    const id = target?.getAttribute("data-id") ?? undefined;
    if (!id) this.storySelection = [];
    else if (additive) {
      this.storySelection = this.storySelection.includes(id)
        ? this.storySelection.filter((s) => s !== id)
        : [...this.storySelection, id];
    } else this.storySelection = [id];
    this.storyPanel.redraw();
    this.announce(
      this.storySelection.length > 0
        ? messages().announcements.selectedOnFrame(this.storySelection)
        : "",
    );
  }

  private screen(): { width: number; height: number } {
    return { width: this.stage.clientWidth || 800, height: this.stage.clientHeight || 600 };
  }

  /**
   * Puts a drawing of the scene in the content layer, with the sheet's grid behind the shapes:
   * a render's, or a preview's.
   */
  private putScene(scene: {
    readonly svg: string;
    readonly width: number;
    readonly height: number;
    readonly offset: Point;
  }): void {
    const grid = this.settings.grid;
    const { x, y } = scene.offset;
    const lines = (size: number, id: string, opacity: number) =>
      `<pattern id="${id}" patternUnits="userSpaceOnUse" x="${x}" y="${y}" width="${size}" height="${size}"><path d="M0 0V${size}M0 0H${size}" fill="none" stroke="rgb(127,127,127)" stroke-opacity="${opacity}" stroke-width="1"/></pattern>`;
    const sheetGrid = `<g class="mdg-grid" pointer-events="none"><defs>${lines(grid, "mdg-grid-minor", 0.2)}${lines(grid * 4, "mdg-grid-major", 0.38)}</defs><rect class="mdg-grid-minor" x="0" y="0" width="${scene.width}" height="${scene.height}" fill="url(#mdg-grid-minor)"/><rect x="0" y="0" width="${scene.width}" height="${scene.height}" fill="url(#mdg-grid-major)"/></g>`;
    let svg = scene.svg;
    const background = `<rect x="0" y="0" width="${scene.width}" height="${scene.height}"`;
    const at = svg.indexOf(background);
    if (at >= 0) {
      const end = svg.indexOf(">", at) + 1;
      svg = svg.slice(0, end) + sheetGrid + svg.slice(end);
    }
    this.content.innerHTML = svg;
    this.content.querySelector("svg")?.setAttribute("aria-hidden", "true");
    this.markTurns();
  }

  /**
   * Keeps the rotation of every turned element's group in `data-turn`, so that a dragged element
   * is shifted with its rotation and a cancelled gesture brings it back.
   */
  private markTurns(): void {
    for (const g of this.content.querySelectorAll('g[data-role="element"][transform]')) {
      if (!g.hasAttribute("data-turn")) g.setAttribute("data-turn", g.getAttribute("transform")!);
    }
  }

  /** A turned element's drawing as the drawing shown has it, or nothing for an upright one. */
  private static turnOf(g: Element): string {
    return g.getAttribute("data-turn") ?? "";
  }

  /** Puts the exporter's SVG in the content layer, with the sheet's grid behind the shapes. */
  private setSvg(render: CanvasRender): void {
    this.putScene(render);
    const root = this.content.querySelector("svg");
    this.paint = new Map();
    if (root) {
      // The paint order (layers back to front, groups before what they hold, then source order):
      // what is under a point is found frontmost first, as a press reaches it.
      for (const g of root.querySelectorAll('g[data-role="element"][data-id]')) {
        const id = g.getAttribute("data-id")!;
        if (!this.paint.has(id)) this.paint.set(id, this.paint.size);
      }
      // Elements carry their kind and label for assistive technology; an empty shape its id.
      const words = messages().stage;
      for (const element of render.elements) {
        const g = root.querySelector(`g[data-id="${cssEscape(element.id)}"][data-role="element"]`);
        // A stroke has no label: it is said as a stroke with its point count.
        g?.setAttribute(
          "aria-label",
          element.pen
            ? words.stroke(element.id, element.pen.points.length)
            : words.element(element.kind, element.label || element.id),
        );
        if (g && element.pen) g.prepend(this.strokeHit(element.pen, render.offset));
        // An element drawn as its icon (an icon shape, an icon object) is pressed anywhere on its
        // square, between the strokes of an outline icon too: an area of the canvas's own, under
        // the icon, which exports never have.
        if (g && element.line) {
          // A free line is pressed within a few units of its stroke, not only on its pixels.
          g.prepend(
            s("polyline", {
              class: "mdg-hit",
              points: outlineOf(this.lineShape(element))
                .map((p) => `${p.x + render.offset.x},${p.y + render.offset.y}`)
                .join(" "),
              fill: "none",
              stroke: "transparent",
              "stroke-width": 10,
              "stroke-linecap": "round",
              "stroke-linejoin": "round",
              "pointer-events": "stroke",
            }),
          );
        }
        if (g && (element.shape === "icon" || element.kind === "icon")) {
          const { x, y, width, height } = element.box;
          g.prepend(
            s("rect", {
              class: "mdg-hit",
              x: x + render.offset.x,
              y: y + render.offset.y,
              width,
              height,
              fill: "none",
              "pointer-events": "visibleFill",
            }),
          );
        }
      }
      // The pens' hit areas were sized for the zoom shown.
      this.strokeHitZoom = this.viewport.zoom;
      // A render that comes while the editor is open draws the text it types over: hidden again.
      this.placeInline();
    }
    clear(this.map);
    this.map.innerHTML = render.svg;
  }

  /**
   * The hit area of a pen, which the canvas adds under its drawing and exports never have: its
   * path, as the layout draws it, `STROKE_REACH` screen pixels wider on each side at the zoom
   * (`syncStrokeHits` keeps it so as the zoom changes), so a press near a thin stroke takes it, and
   * only near it (inside its bounds but away from it, a press reaches what lies below). A dot,
   * whose path has no length, is a disc of the same reach.
   */
  private strokeHit(pen: NonNullable<ElementInfo["pen"]>, offset: Point): SVGElement {
    const points = pen.points.map((p) => ({ x: p.x + offset.x, y: p.y + offset.y }));
    const first = points[0] ?? { x: offset.x, y: offset.y };
    const reach = strokeReach(pen.width, this.viewport.zoom);
    if (points.every((p) => p.x === first.x && p.y === first.y)) {
      return s("circle", {
        class: "mdg-hit",
        "data-pen-width": pen.width,
        cx: first.x,
        cy: first.y,
        r: reach / 2,
        fill: "none",
        "pointer-events": "visibleFill",
      });
    }
    return s("path", {
      class: "mdg-hit",
      "data-pen-width": pen.width,
      d: penPathOf(points),
      fill: "none",
      stroke: "transparent",
      "stroke-width": reach,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "pointer-events": "stroke",
    });
  }

  /**
   * Keeps the hit area of every pen `STROKE_REACH` screen pixels beyond its drawn edge at the zoom
   * shown: the drawing scales with the zoom, the reach of a hand does not.
   */
  private syncStrokeHits(): void {
    const zoom = this.viewport.zoom;
    if (zoom === this.strokeHitZoom) return;
    this.strokeHitZoom = zoom;
    for (const hit of this.content.querySelectorAll<SVGElement>(".mdg-hit[data-pen-width]")) {
      const reach = strokeReach(Number(hit.getAttribute("data-pen-width")), zoom);
      if (hit.tagName.toLowerCase() === "circle") hit.setAttribute("r", String(reach / 2));
      else hit.setAttribute("stroke-width", String(reach));
    }
  }

  /**
   * The sticky notes of a render that the canvas just sent to be created (`popping`, in the last
   * `POP_WAIT_MS`) and the drawing shown did not hold: the ones to pop in. Once they come, or the
   * wait is over, a later sticky (someone else's, the text's) is just drawn.
   */
  private freshStickies(render: CanvasRender, previous: CanvasRender | undefined): string[] {
    const since = this.popping;
    if (since === undefined) return [];
    if (performance.now() - since > POP_WAIT_MS || previous?.diagram !== render.diagram) {
      this.popping = undefined;
      return [];
    }
    const fresh = render.elements
      .filter((e) => e.kind === "sticky" && !this.elements.has(e.id))
      .map((e) => e.id);
    if (fresh.length > 0) this.popping = undefined;
    return fresh;
  }

  /**
   * Pops new sticky notes in: each drawing is held, for its animation, in a group that grows it
   * from `--mdg-pop-scale` about the card's centre and fades it in over `--mdg-motion`; the group
   * goes when the animation ends. The element's own group keeps its rotation untouched.
   */
  private popIn(ids: readonly string[], offset: Point): void {
    const root = this.content.querySelector("svg");
    if (!root) return;
    for (const id of ids) {
      const g = root.querySelector(`g[data-id="${cssEscape(id)}"][data-role="element"]`);
      const element = this.elements.get(id);
      if (!g || !element) continue;
      const centre = centerOf(element.box);
      const wrapper = s("g", {
        class: "mdg-pop",
        style: `transform-origin: ${centre.x + offset.x}px ${centre.y + offset.y}px`,
      });
      g.replaceWith(wrapper);
      wrapper.append(g);
      // Its own animation's end only: the effects of the drawing inside it animate too.
      wrapper.addEventListener("animationend", (e) => {
        if (e.target === wrapper) wrapper.replaceWith(g);
      });
    }
  }

  /** Applies the viewport to every layer. */
  private layout(): void {
    const r = this.render;
    const v = this.viewport;
    this.content.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.zoom})`;
    // A press takes a pen within the same screen pixels of its stroke at every zoom.
    this.syncStrokeHits();
    // The workspace grid, aligned with diagram coordinates.
    const grid = this.settings.grid * v.zoom;
    const showGrid = this.showGrid && !!r && !this.storyPanel.active;
    this.stage.classList.toggle("grid", showGrid && grid >= 2);
    if (showGrid && r) {
      const ox = v.x + v.zoom * r.offset.x;
      const oy = v.y + v.zoom * r.offset.y;
      const minor = grid >= 6 ? `${grid}px ${grid}px` : "0 0";
      this.stage.style.backgroundSize = `${grid * 4}px ${grid * 4}px, ${grid * 4}px ${grid * 4}px, ${minor}, ${minor}`;
      this.stage.style.backgroundPosition = `${ox}px ${oy}px`;
    }
    this.styleSheetGrid();
    this.syncZoomSelect();
    this.drawOverlay();
    this.drawMinimap();
    this.placeInline();
    // The pen's tip is as wide as its stroke at the zoom.
    if (this.tool === "pen" || this.tool === "highlighter") this.syncPointerCursor();
    if (r && !this.storyPanel.active) {
      const viewports = { ...(this.local.viewports ?? {}), [r.diagram]: v };
      this.persist({ viewports });
    }
  }

  /** The sheet's grid at the zoom: hairlines, and the minor lines only where they stand apart. */
  private styleSheetGrid(): void {
    const sheetGrid = this.content.querySelector<SVGGElement>(".mdg-grid");
    if (!sheetGrid) return;
    const zoom = this.viewport.zoom;
    sheetGrid.style.display = this.showGrid ? "" : "none";
    for (const path of sheetGrid.querySelectorAll("path"))
      path.setAttribute("stroke-width", String(1 / zoom));
    const minorRect = sheetGrid.querySelector<SVGRectElement>(".mdg-grid-minor");
    if (minorRect) minorRect.style.display = this.settings.grid * zoom >= 6 ? "" : "none";
  }

  // ------------------------------------------------------------------ geometry

  private screenOf(point: Point): Point {
    return toScreen(this.viewport, this.render?.offset ?? { x: 0, y: 0 }, point);
  }

  private diagramOf(screen: Point): Point {
    return toDiagram(this.viewport, this.render?.offset ?? { x: 0, y: 0 }, screen);
  }

  private screenBox(box: Box): Box {
    const a = this.screenOf(box);
    return {
      x: a.x,
      y: a.y,
      width: box.width * this.viewport.zoom,
      height: box.height * this.viewport.zoom,
    };
  }

  private pointOf(e: { clientX: number; clientY: number }): Point {
    const rect = this.stage.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private boxes(filter: (e: ElementInfo) => boolean = () => true): Map<string, Box> {
    return new Map(
      [...this.elements.values()]
        .filter((e) => filter(e) && !this.isHidden(e.layer))
        .map((e) => [e.id, e.box]),
    );
  }

  /**
   * The shapes that can be seen (hidden layers left out), back to front as they are painted. Free
   * lines and pen strokes are no shapes: they are hit by their stroke (their `.mdg-hit` areas),
   * caught by a rubber band around their bounds (`extents`), and offer no border or inside, so no
   * connection starts at them and nothing is dropped into them.
   */
  private painted(): ElementInfo[] {
    const order = (e: ElementInfo) => this.paint.get(e.id) ?? -1;
    return [...this.elements.values()]
      .filter((e) => !this.isHidden(e.layer) && !e.line && !e.pen)
      .sort((a, b) => order(a) - order(b));
  }

  /**
   * The elements under a point, frontmost first, each hit inside its shape's outline only, or on
   * the label an icon shape draws outside its square.
   */
  private stackAt(point: Point): ElementInfo[] {
    const painted = this.painted();
    const under = new Set(stackAt(painted, point).map((e) => e.id));
    return painted
      .filter((e) => under.has(e.id) || (e.labelBox !== undefined && this.inBox(e.labelBox, point)))
      .reverse();
  }

  /**
   * What a rubber band must hold to select an element: its box, the label of an icon shape, and a
   * stroke's bounds (its points grown by half its width).
   */
  private extents(): Map<string, Box> {
    return new Map(
      [...this.elements.values()]
        .filter((e) => !this.isHidden(e.layer))
        .map((e) => [
          e.id,
          e.pen
            ? e.pen.bounds
            : e.rotation
              ? turnedBounds(e.box, e.rotation)
              : e.labelBox
                ? (unionBox([e.box, e.labelBox]) ?? e.box)
                : e.box,
        ]),
    );
  }

  /** The group of an element, for the searches that leave out what lies inside a dragged group. */
  private readonly parentOf = (id: string): string | null | undefined =>
    this.elements.get(id)?.parent;

  // ------------------------------------------------------------------ overlay

  /**
   * What an element, a relation or an event is drawn as right now, in diagram coordinates: where a
   * drag in progress has taken it, undefined when the scene has no such id. The selection's
   * outlines and other people's are drawn from the same shapes, so both follow a drag.
   */
  private shapeOf(id: string): PresenceShape | undefined {
    const drag = this.drag;
    const element = this.elements.get(id);
    if (element?.line) {
      // A free line is outlined along its stroke: the dragged points while a handle moves one,
      // shifted while the whole line moves.
      const points =
        drag?.kind === "linePoint" && drag.id === id && drag.moving
          ? this.draggedLine(drag, element)
          : outlineOf(this.lineShape(element));
      const shift = drag?.kind === "move" && this.isMoving(id) ? drag.delta : { x: 0, y: 0 };
      return {
        kind: "line",
        points: points.map((p) => ({ x: p.x + shift.x, y: p.y + shift.y })),
      };
    }
    if (element) {
      let box = element.box;
      if (drag?.kind === "move" && this.isMoving(id)) {
        box = { ...box, x: box.x + drag.delta.x, y: box.y + drag.delta.y };
      }
      if (drag?.kind === "resize" && drag.id === id) box = drag.result;
      if (drag?.kind === "rotate" && drag.id === id) box = this.turnBox(id) ?? box;
      return { kind: "box", box };
    }
    const shift = drag?.kind === "event" && drag.moving && drag.key === id ? drag.delta : 0;
    const relation = this.relations.get(id);
    if (relation) {
      return {
        kind: "line",
        points: outlineOf(relation).map((p) => ({ x: p.x, y: p.y + shift })),
      };
    }
    const event = this.events.get(id);
    const box = event ? this.eventBox(event) : undefined;
    return box ? { kind: "box", box: { ...box, y: box.y + shift } } : undefined;
  }

  /**
   * Draws other people's selections on their own layer: what each id resolves to in the scene
   * shown now (so it follows a render, a drag, the pan and the zoom), and nothing for an id the
   * scene does not hold or whose layer is hidden. A story's frames are not that scene, so story
   * mode shows none of it, and the message's people are kept for when it ends.
   */
  private drawPresence(): void {
    if (!this.render || this.storyPanel.active || this.presence.length === 0) {
      this.presenceLayer.clear();
      this.clearPeerTrails();
      return;
    }
    this.presenceLayer.draw(
      presenceMarks(this.presence, (id) => this.presenceShape(id)),
      cursorMarks(this.presence, (point) => this.screenOf(point)),
    );
    // Strokes that stay follow the pan and the zoom (a fading trail draws every frame anyway).
    if (this.peerStrokes.size > 0) this.runTrails();
  }

  /**
   * Tells the host where the pointer is over the diagram shown, in diagram units, or that it left
   * (no event, or a story playing): at most every `POINTER_EVERY_MS`, the last position always
   * arriving, and nothing that repeats what was sent. Only to a host that shares presence.
   */
  private sharePointer(event: { clientX: number; clientY: number } | undefined): void {
    if (!this.sharesPointer) return;
    const r = this.render;
    const at = event && r && !this.storyPanel.active ? this.diagramOf(this.pointOf(event)) : null;
    this.pointerNext = {
      type: "presencePointer",
      point: at && { x: Math.round(at.x) || 0, y: Math.round(at.y) || 0 },
      ...(at && r ? { diagram: r.diagram } : {}),
    };
    if (this.pointerTimer === undefined) this.sendPointer();
  }

  private sendPointer(): void {
    const next = this.pointerNext;
    this.pointerNext = undefined;
    if (!next) return;
    const key = JSON.stringify(next);
    if (key !== this.pointerSent) {
      this.pointerSent = key;
      this.post(next);
    }
    this.pointerTimer = setTimeout(() => {
      this.pointerTimer = undefined;
      this.sendPointer();
    }, POINTER_EVERY_MS);
  }

  // ------------------------------------------------------------------ the Pointer tool

  /** The colour the Pointer draws in: the person's own in a room, else the theme's accent. */
  private trailColour(): string {
    if (this.personColour) return this.personColour;
    return toHex(parseColour(this.render?.colors?.accent ?? "") ?? parseColour(FALLBACK_COLOUR)!);
  }

  private reducedMotion(): boolean {
    return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  }

  /**
   * Turns the Pointer on or off. On, it lets go of everything half done (an armed tool, the editor
   * in place, a menu, a picker) and of the selection, so nothing lingers while pointing; its cursor
   * is a dot in the trail's colour.
   */
  private setPointing(on: boolean): void {
    if (on === this.pointing) return;
    this.pointing = on;
    if (on) {
      this.arm(undefined);
      this.armedIcon = undefined;
      if (this.inline) this.commitInline();
      this.menu.close();
      this.picker.close();
      this.shapeGrid.close(false);
      this.penMenu.close(false);
      this.iconPicker.close(false);
      this.borderStart = undefined;
      this.stage.classList.remove("connecting");
      if (this.selection.length > 0) this.select([]);
    } else if (this.drag?.kind === "laser") {
      this.endLaser();
      this.drag = undefined;
    }
    this.stage.classList.toggle("pointing", on);
    this.syncPointerCursor();
    this.syncToggles();
    const words = messages().announcements;
    this.announce(on ? words.pointerOn : words.pointerOff);
    this.drawOverlay();
  }

  /**
   * The stage's cursor while pointing or drawing, a static 16 px picture set through
   * `--mdg-pointer-cursor`: the Pointer's dot in the trail's colour with a white ring; the tip of
   * the pen or the highlighter, a dot of its colour as wide as its stroke at the zoom (2 to 13 px),
   * ringed so it shows on any background; the eraser's circle, which is where it erases.
   */
  private syncPointerCursor(): void {
    const svg = (body: string) =>
      `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16">${body}</svg>`;
    let picture: string | undefined;
    if (this.pointing) {
      picture = svg(
        `<circle cx="8" cy="8" r="5.5" fill="${this.trailColour()}" stroke="#ffffff" stroke-width="1.5"/>`,
      );
    } else if (this.tool === "eraser") {
      picture = svg(
        `<circle cx="8" cy="8" r="${ERASER_REACH - 0.75}" fill="#ffffff" fill-opacity="0.55" stroke="#1f2328" stroke-opacity="0.8" stroke-width="1.25"/>` +
          '<circle cx="8" cy="8" r="0.9" fill="#1f2328" fill-opacity="0.8"/>',
      );
    } else if (this.tool === "pen" || this.tool === "highlighter") {
      const choice = this.penChoice;
      const r = Math.max(1, Math.min(6.5, (toolWidth(choice) * this.viewport.zoom) / 2));
      picture = svg(
        `<circle cx="8" cy="8" r="${r + 1.9}" fill="none" stroke="#000000" stroke-opacity="0.35" stroke-width="0.8"/>` +
          `<circle cx="8" cy="8" r="${r + 0.75}" fill="${this.colourOf(toolColour(choice))}" fill-opacity="${Math.max(0.6, toolOpacity(choice))}" stroke="#ffffff" stroke-width="1.5"/>`,
      );
    }
    if (picture === undefined) {
      this.stage.style.removeProperty("--mdg-pointer-cursor");
      return;
    }
    this.stage.style.setProperty(
      "--mdg-pointer-cursor",
      `url("data:image/svg+xml,${encodeURIComponent(picture)}") 8 8, crosshair`,
    );
  }

  /** A press while pointing: the stroke starts, and draws nothing but its trail. */
  private startLaser(at: Point): void {
    this.drag = { kind: "laser" };
    this.ownTrail.colour = this.trailColour();
    this.laserPoint(at);
  }

  private laserPoint(at: Point): void {
    const now = performance.now();
    if (!this.ownTrail.add(at, now)) return;
    this.queueLaser(at, now);
    this.runTrails();
  }

  /**
   * The stroke ends. Under reduced motion the points did not fade while it was drawn, and nothing
   * of it remains now; otherwise they fade out on their own. What the host was not yet sent goes
   * with the next turn.
   */
  private endLaser(): void {
    if (!this.reducedMotion()) return;
    this.ownTrail.clear();
    this.runTrails();
  }

  /**
   * Queues a point of the stroke for a host that shares presence: of the Pointer's trail, or with
   * `pen` of a stroke of the pen or the highlighter. A batch is of one stroke: points of another
   * still waiting (the stroke before, a tool changed within the beat) go first, on their own.
   */
  private queueLaser(at: Point, now: number, pen?: PresencePen): void {
    if (!this.sharesPointer) return;
    if (this.laserQueue.length > 0 && !samePresencePen(pen, this.laserPen)) this.postLaser();
    this.laserPen = pen;
    this.laserQueue.push({ x: Math.round(at.x * 10) / 10, y: Math.round(at.y * 10) / 10, t: now });
    if (this.laserTimer === undefined) this.sendLaser();
  }

  /**
   * Posts the queued points as one batch whose first point is at 0, at most every
   * `POINTER_EVERY_MS` (the same beat as the pointer's), and keeps the beat while points arrive.
   */
  private sendLaser(): void {
    this.postLaser();
    this.laserTimer = setTimeout(() => {
      this.laserTimer = undefined;
      if (this.laserQueue.length > 0) this.sendLaser();
    }, POINTER_EVERY_MS);
  }

  /**
   * Posts the queued points now, as one batch whose first point is at 0. A stroke of the pen or the
   * highlighter carries its look and its number; its cancel batch carries `cancel`, its points or
   * none.
   */
  private postLaser(): void {
    const queued = thin(this.laserQueue, MAX_LASER_POINTS);
    this.laserQueue = [];
    const diagram = this.render?.diagram;
    const pen = this.laserPen;
    if ((queued.length === 0 && pen?.cancel !== true) || diagram === undefined) return;
    const first = queued[0]?.t ?? 0;
    this.post({
      type: "presenceLaser",
      points: queued.map((p) => ({
        x: p.x,
        y: p.y,
        t: Math.min(MAX_LASER_MS, Math.max(0, Math.round(p.t - first))),
      })),
      diagram,
      // A stroke of the pen or the highlighter: the others draw it in its look, and keep it.
      ...(pen ? { pen } : {}),
    });
  }

  /**
   * Sends the points of a stroke that wait now, out of the beat: the stroke starts, is written or
   * is cancelled, which the others see without waiting for the next beat. The beat starts again.
   */
  private flushLaser(): void {
    if (!this.sharesPointer) return;
    if (this.laserTimer !== undefined) clearTimeout(this.laserTimer);
    this.laserTimer = undefined;
    this.sendLaser();
  }

  /**
   * The stroke of `look` was cancelled (Escape, or let go of): the others are sent its last batch
   * with `cancel`, the points it still had waiting or none, and drop the stroke at once.
   */
  private cancelLaser(look: PresencePen): void {
    if (!this.sharesPointer) return;
    if (this.laserQueue.length > 0 && !samePresencePen(look, this.laserPen)) this.postLaser();
    this.laserPen = { ...look, cancel: true };
    this.flushLaser();
    this.laserPen = undefined;
  }

  /** The number of the next stroke of the pen or the highlighter. */
  private nextStroke(): number {
    this.strokeNumber =
      this.strokeNumber >= PRESENCE_PEN_LIMITS.stroke.max ? 0 : this.strokeNumber + 1;
    return this.strokeNumber;
  }

  /**
   * Takes the batches of the host's last `presence` message that were not drawn yet, into the
   * trail of the person they are of: each point `t` ms from now, in the person's colour. A batch
   * with `pen` is a stroke of the pen or the highlighter instead: it grows the person's stroke of
   * its number, in its own width, colour and opacity, which does not fade, whether or not their
   * pointer is shown (a finger or a stylus lifted, a mouse that left the stage), or ends it on its
   * cancel. People who are no longer there lose their trail and their strokes; people without a
   * pointer lose their trail.
   */
  private takeLasers(): void {
    const now = performance.now();
    const reduced = this.reducedMotion();
    const people = new Set<string>();
    const keys = personKeys(this.presence);
    this.presence.forEach((person, i) => {
      const key = keys[i]!;
      people.add(key);
      const laser = person.laser;
      if (!laser?.pen || this.strokeBatches.get(key) === laser.batch) return;
      this.strokeBatches.set(key, laser.batch);
      if (this.peerStrokes.add(key, laser.pen, laser.points, now, reduced)) this.runTrails();
    });
    for (const key of [...this.strokeBatches.keys()]) {
      if (!people.has(key)) this.strokeBatches.delete(key);
    }
    if (this.peerStrokes.keep(people)) this.runTrails();
    const present = new Set<string>();
    for (const mark of cursorMarks(this.presence, (point) => point)) {
      present.add(mark.key);
      const laser = mark.person.laser;
      if (!laser || laser.pen || this.peerBatches.get(mark.key) === laser.batch) continue;
      this.peerBatches.set(mark.key, laser.batch);
      let trail = this.peerTrails.get(mark.key);
      if (!trail) {
        trail = new Trail(mark.person.colour);
        this.peerTrails.set(mark.key, trail);
      }
      trail.colour = mark.person.colour;
      // Under reduced motion a batch is drawn whole and stays until the next, or 250 ms.
      if (reduced) {
        trail.clear();
        this.peerHolds.set(mark.key, now + 250);
      }
      for (const point of laser.points) {
        trail.add({ x: point.x, y: point.y }, reduced ? now : now + point.t);
      }
      this.runTrails();
    }
    for (const map of [this.peerTrails, this.peerBatches, this.peerHolds]) {
      for (const key of [...map.keys()]) if (!present.has(key)) map.delete(key);
    }
  }

  /**
   * Other people's trails and strokes go with the presence layer: another file, nobody here, a
   * story.
   */
  private clearPeerTrails(): void {
    if (this.peerTrails.size === 0 && this.peerBatches.size === 0 && this.peerStrokes.size === 0) {
      return;
    }
    this.peerTrails.clear();
    this.peerBatches.clear();
    this.peerHolds.clear();
    this.peerStrokes.clear();
    this.runTrails();
  }

  /**
   * A drawing came: the strokes of others it holds go at once (their pens are drawn in the same
   * place), and so do the ones whose last batch came before it; another diagram takes them all,
   * and its pens are the drawing the next render's new pens are told from.
   */
  private strokesRendered(render: CanvasRender, previous: CanvasRender | undefined): void {
    const another = previous !== undefined && previous.diagram !== render.diagram;
    if (another) this.peerStrokes.clear(true);
    const pens = render.elements.flatMap((element) =>
      element.pen ? [{ id: element.id, points: element.pen.points, width: element.pen.width }] : [],
    );
    if (this.peerStrokes.rendered(pens, performance.now()) || another) this.runTrails();
  }

  /** Draws the trails at the next frame, and keeps drawing a frame at a time while a point lives. */
  private runTrails(): void {
    if (this.trailFrame !== undefined) return;
    this.trailFrame = requestAnimationFrame(() => {
      this.trailFrame = undefined;
      if (this.stepTrails()) this.runTrails();
    });
  }

  /** One frame of the trails: ages them, strokes them, and says whether any point is left. */
  private stepTrails(): boolean {
    const now = performance.now();
    const reduced = this.reducedMotion();
    // The stroke in the hand does not fade under reduced motion; it is cleared when it ends.
    const ownFade = reduced && this.drag?.kind === "laser" ? 0 : TRAIL_FADE_MS;
    this.ownTrail.prune(now, ownFade);
    const drawn: DrawnTrail[] = [
      { points: this.ownTrail.points, colour: this.ownTrail.colour, fade: ownFade },
    ];
    let alive = this.ownTrail.alive;
    for (const [key, trail] of this.peerTrails) {
      const hold = this.peerHolds.get(key);
      if (reduced && hold !== undefined) {
        if (now >= hold) {
          trail.clear();
          this.peerHolds.delete(key);
        }
      } else trail.prune(now);
      drawn.push({ points: trail.points, colour: trail.colour, fade: reduced ? 0 : TRAIL_FADE_MS });
      alive = alive || trail.alive;
    }
    // Other people's strokes: whole, in their look at the zoom, until they go.
    this.peerStrokes.expire(now);
    const zoom = this.viewport.zoom;
    const strokes: DrawnStroke[] = this.peerStrokes.drawn(now).map((stroke) => ({
      points: stroke.points,
      colour: stroke.look.colour,
      width: stroke.look.width * zoom,
      opacity: stroke.look.opacity,
    }));
    alive = alive || this.peerStrokes.pending(now);
    this.presenceLayer.drawTrails(drawn, (point) => this.screenOf(point), now, strokes);
    this.expireStrokes(now);
    return alive;
  }

  /** Draws the strokes again when the oldest has lived its ten seconds, which lets it go. */
  private expireStrokes(now: number): void {
    const next = this.peerStrokes.nextExpiry();
    if (next === this.strokeExpiry) return;
    if (this.strokeTimer !== undefined) clearTimeout(this.strokeTimer);
    this.strokeTimer = undefined;
    this.strokeExpiry = next;
    if (next === undefined) return;
    this.strokeTimer = setTimeout(
      () => {
        this.strokeTimer = undefined;
        this.strokeExpiry = undefined;
        this.runTrails();
      },
      Math.max(0, next - now) + 1,
    );
  }

  // ------------------------------------------------------------------ the pen and the eraser

  /**
   * A press with the pen or the highlighter: the stroke starts at the press, in the innermost
   * group under it, and shows on the overlay at once (a dot until the pointer leaves the press).
   * Nothing stays selected, so no outline flashes between the strokes of a word.
   */
  private startStroke(tool: PenTool, at: Point, e: PointerEvent): void {
    if (this.selection.length > 0) this.select([]);
    const group = this.stackAt(at).find((el) => el.kind === "group");
    const choice: PenChoice = { ...this.penChoice, tool };
    const path = s("path", {
      class: tool === "highlighter" ? "pen-stroke highlighter" : "pen-stroke",
      d: penPathOf([at]),
      fill: "none",
      stroke: this.colourOf(toolColour(choice)),
      "stroke-width": toolWidth(choice),
      "stroke-opacity": toolOpacity(choice),
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    });
    const look = this.presencePen(choice, this.nextStroke());
    this.drag = {
      kind: "penDraw",
      tool,
      path,
      pointer: e.pointerId,
      press: at,
      points: [at],
      straight: e.shiftKey,
      moving: false,
      ...(group ? { parent: group.id } : {}),
      look,
      shared: 1,
    };
    // The others see the stroke from its first point at once, a dot until it moves, never joined
    // to the stroke before (its number is new).
    this.queueLaser(at, performance.now(), look);
    this.flushLaser();
    this.drawOverlay();
  }

  /**
   * How the others see a stroke drawn with `choice` (`presenceLaser`'s `pen`): its width in
   * diagram units, its colour resolved to `#rrggbb` (a theme token is nothing to another canvas
   * with another theme, and one that cannot be read goes in the person's colour), its opacity and
   * its number `stroke`, all within `PRESENCE_PEN_LIMITS`.
   */
  private presencePen(choice: PenChoice, stroke: number): PresencePen {
    const { width, opacity } = PRESENCE_PEN_LIMITS;
    const colour = parseColour(this.colourOf(toolColour(choice)));
    return {
      width: Math.min(width.max, Math.max(width.min, Math.round(toolWidth(choice)))),
      colour: colour ? toHex(colour) : this.trailColour(),
      opacity: Math.min(opacity.max, Math.max(opacity.min, toolOpacity(choice))),
      stroke,
    };
  }

  /**
   * The pointer moved while drawing: every position it went through since the last move (the
   * browser's coalesced events) joins the stroke, and the path is drawn again as the layout will
   * draw it. Ink is where the hand is: no transition, no frame waited for.
   */
  private strokeTo(drag: Extract<Drag, { kind: "penDraw" }>, e: PointerEvent): void {
    const zoom = this.viewport.zoom;
    for (const event of coalesced(e)) {
      const at = this.diagramOf(this.pointOf(event));
      const last = drag.points[drag.points.length - 1]!;
      if (Math.hypot(at.x - last.x, at.y - last.y) * zoom < STROKE_STEP) continue;
      drag.points.push(at);
    }
    const at = this.diagramOf(this.pointOf(e));
    if (
      !drag.moving &&
      Math.hypot(at.x - drag.press.x, at.y - drag.press.y) * zoom >= DRAG_THRESHOLD
    ) {
      drag.moving = true;
    }
    drag.straight = e.shiftKey;
    drag.path.setAttribute("d", penPathOf(this.strokePoints(drag)));
    // The others see the stroke grow as it is drawn: the positions it went through since the last
    // batch, once it left the press. A straight stroke reaches them whole at the release.
    if (drag.moving && !drag.straight && drag.shared < drag.points.length) {
      const now = performance.now();
      for (const point of drag.points.slice(drag.shared)) this.queueLaser(point, now, drag.look);
      drag.shared = drag.points.length;
    }
  }

  /**
   * The points of a stroke as drawn now, before simplification: a dot until the pointer leaves
   * the press, the press and the pointer while Shift keeps it straight, else every position.
   */
  private strokePoints(drag: Extract<Drag, { kind: "penDraw" }>): Point[] {
    if (!drag.moving) return [drag.press];
    if (drag.straight) return [drag.press, drag.points[drag.points.length - 1]!];
    return drag.points;
  }

  /**
   * The release of a stroke: its points simplified (Ramer–Douglas–Peucker at 0.75 screen pixels,
   * in diagram units at the zoom) and rounded to a tenth, written as a pen in the group under the
   * press with a style for what differs from a stroke's defaults. The new pen is not selected and
   * the tool stays armed; the stroke stays on the overlay until its pen is drawn.
   */
  private writeStroke(drag: Extract<Drag, { kind: "penDraw" }>): void {
    // A straight stroke reaches the others as it is written: from the press to where it ends.
    if (drag.moving && drag.straight) {
      this.queueLaser(drag.points[drag.points.length - 1]!, performance.now(), drag.look);
    }
    // Its last points go now, before the drawing that holds its pen.
    this.flushLaser();
    const points = tenthPoints(
      simplifyStroke(this.strokePoints(drag), STROKE_TOLERANCE / this.viewport.zoom),
    );
    const choice: PenChoice = { ...this.penChoice, tool: drag.tool };
    const style = penStyleFor(drag.tool, choice.width, toolColour(choice));
    const entry = {
      action: {
        kind: "createPen",
        points,
        ...(drag.parent ? { parent: drag.parent } : {}),
        ...(Object.keys(style).length > 0 ? { style } : {}),
      } satisfies CanvasAction,
      path: drag.path,
    };
    this.penQueue.push(entry);
    this.flushPen();
    if (this.penQueue.includes(entry)) {
      this.announce(messages().announcements.penDrawn(points.length));
    }
    this.drawOverlay();
  }

  /**
   * Sends the first edit of the pen and the eraser that waits, unless an edit is pending: the next
   * render sends the one after. One that cannot be sent (errors in the text) goes, and what it
   * erased comes back.
   */
  private flushPen(): void {
    // One at a time, in order: an edit in flight is held by a drawing or refused first.
    if (this.pending || this.penQueue.some((entry) => entry.sent !== undefined)) return;
    const next = this.penQueue.find((entry) => entry.sent === undefined);
    if (!next) return;
    const revision = this.revision;
    if (revision !== undefined && this.act(next.action)) {
      next.sent = revision;
      return;
    }
    this.penQueue = this.penQueue.filter((entry) => entry !== next);
    if (next.action.kind === "remove") this.restoreErased(next.action.ids);
    this.drawOverlay();
  }

  /**
   * The session refused the edit in flight. Refused because the text changed under it (another
   * edit came first), it is kept, its stroke on the overlay or its strokes hidden, and goes once
   * more against the drawing that follows: returns true. Refused again, or for anything else, a
   * stroke is not drawn and strokes the eraser could not take come back; the next edit waits for
   * the render that follows, or, when none follows (a refusal that changes nothing), goes now.
   */
  private penRefused(code: string): boolean {
    const sent = this.penQueue.find((entry) => entry.sent !== undefined);
    if (!sent) return false;
    const stale = code === "edit.stale-revision";
    if (stale && !sent.retried) {
      sent.sent = undefined;
      sent.retried = true;
      return true;
    }
    this.penQueue = this.penQueue.filter((entry) => entry !== sent);
    if (sent.action.kind === "remove") this.restoreErased(sent.action.ids);
    this.drawOverlay();
    if (!stale) queueMicrotask(() => this.flushPen());
    return false;
  }

  /**
   * Whether a newer drawing holds an edit of the pen or the eraser in flight: a new pen (one the
   * drawing shown did not hold) for a stroke, none of the strokes erased for an erasure. A drawing
   * of somebody else's edit that came first holds neither.
   */
  private holdsPenEdit(action: CanvasAction, render: CanvasRender): boolean {
    if (action.kind === "createPen") {
      return render.elements.some((element) => element.pen && !this.elements.has(element.id));
    }
    if (action.kind === "remove") {
      const ids = new Set(action.ids);
      return !render.elements.some((element) => ids.has(element.id));
    }
    return true;
  }

  /** Puts a stroke drawn in diagram units at the current pan and zoom, as the drawing is. */
  private placeStroke(path: SVGPathElement): void {
    const v = this.viewport;
    const offset = this.render?.offset ?? { x: 0, y: 0 };
    path.setAttribute(
      "transform",
      `matrix(${v.zoom} 0 0 ${v.zoom} ${v.x + v.zoom * offset.x} ${v.y + v.zoom * offset.y})`,
    );
  }

  /** A press with the eraser, or with a stylus's eraser button: it erases where it is pressed. */
  private startErase(at: Point, pointer: number): void {
    this.drag = { kind: "erase", pointer, last: at, hits: new Set() };
    this.eraseAlong(this.drag, at, at);
  }

  /** The eraser moved: it erases along every position the pointer went through. */
  private eraseTo(drag: Extract<Drag, { kind: "erase" }>, e: PointerEvent): void {
    for (const event of coalesced(e)) {
      const at = this.diagramOf(this.pointOf(event));
      this.eraseAlong(drag, drag.last, at);
      drag.last = at;
    }
  }

  /**
   * Hides every pen the eraser's sweep from `from` to `to` passes within `ERASER_REACH` screen
   * pixels of (half its width added, so a thick stroke is taken by its edge): its bounds first,
   * then its drawn path, sampled along the midpoint chain. Only pens are erased, on layers shown.
   */
  private eraseAlong(drag: Extract<Drag, { kind: "erase" }>, from: Point, to: Point): void {
    const reach = ERASER_REACH / this.viewport.zoom;
    const hits: string[] = [];
    for (const element of this.elements.values()) {
      const pen = element.pen;
      if (!pen || this.erased.has(element.id) || this.isHidden(element.layer)) continue;
      if (!sweepTouches(from, to, reach, pen.bounds)) continue;
      let samples = this.penSamples.get(element.id);
      if (!samples) {
        samples = strokeSamples(pen.points);
        this.penSamples.set(element.id, samples);
      }
      if (sweepDistance(from, to, samples) <= reach + pen.width / 2) hits.push(element.id);
    }
    if (hits.length === 0) return;
    for (const id of hits) {
      drag.hits.add(id);
      this.erased.add(id);
    }
    this.hideErased(hits);
  }

  /** The scene groups of pens, which the eraser fades out and in. */
  private penGroups(ids: Iterable<string>): SVGGElement[] {
    return [...ids].flatMap((id) => [
      ...this.content.querySelectorAll<SVGGElement>(
        `g[data-id="${cssEscape(id)}"][data-role="element"]`,
      ),
    ]);
  }

  /** Fades the drawings of `ids` out over `--mdg-motion-fast`; they stay hidden. */
  private hideErased(ids: Iterable<string>): void {
    for (const g of this.penGroups(ids)) {
      g.classList.remove("mdg-unerased");
      g.classList.add("mdg-erased");
    }
  }

  /** Brings back strokes the eraser hid (all of them without `ids`), fading in: Escape, a refusal. */
  private restoreErased(ids?: readonly string[]): void {
    const back = ids ?? [...this.erased];
    for (const g of this.penGroups(back)) {
      g.classList.remove("mdg-erased");
      g.classList.add("mdg-unerased");
    }
    for (const id of back) this.erased.delete(id);
  }

  /**
   * The release of the eraser: the pens it crossed are removed in one `remove` (one undo step),
   * hidden until the drawing without them arrives.
   */
  private writeErased(drag: Extract<Drag, { kind: "erase" }>): void {
    const words = messages().announcements;
    const ids = [...drag.hits];
    if (ids.length === 0) {
      this.announce(words.nothingErased);
      return;
    }
    // A stroke's own `style` and effects go with it (a highlighter mark always has one): the
    // eraser asks nothing, and one undo brings it all back.
    const entry = { action: { kind: "remove", ids, cascade: true } satisfies CanvasAction };
    this.penQueue.push(entry);
    this.flushPen();
    if (this.penQueue.includes(entry)) this.announce(words.erased(ids.length));
  }

  /** The shape of an id in screen pixels, for the presence layer. */
  private presenceShape(id: string): PresenceShape | undefined {
    const layer = this.elements.get(id)?.layer ?? this.relations.get(id)?.layer ?? null;
    if (this.isHidden(layer)) return undefined;
    const shape = this.shapeOf(id);
    if (shape?.kind === "line") {
      return { kind: "line", points: shape.points.map((p) => this.screenOf(p)) };
    }
    return shape ? { kind: "box", box: this.screenBox(shape.box) } : undefined;
  }

  private drawOverlay(): void {
    this.drawPresence();
    clear(this.overlay);
    // The lists' insertion bar and their +, which stay from one overlay to the next to move.
    this.syncInsertion();
    this.syncListAdds();
    const r = this.render;
    if (!r) return;
    const add = (node: SVGElement) => this.overlay.append(node);
    const rect = (box: Box, cls: string) =>
      add(s("rect", { class: cls, x: box.x, y: box.y, width: box.width, height: box.height }));
    // A highlighted element is outlined by its shape: a diamond as a diamond. An outline fades in
    // when it appears, not again as the overlay is drawn over it.
    const outlined = new Set<string>();
    const outline = (element: ElementInfo, cls: string) => {
      const key = `${cls} ${element.id}`;
      outlined.add(key);
      add(
        s("path", {
          class: this.outlined.has(key) ? `${cls} held` : cls,
          d: highlightPath(element.shape, this.screenBox(element.box), this.screenOptions(element)),
          "data-target": element.id,
          ...this.turnAttributes(element.box, this.angleOf(element)),
        }),
      );
    };

    for (const id of this.highlight) {
      const element = this.elements.get(id);
      if (element) outline(element, "highlight");
    }
    const drag = this.drag;
    const primary = this.selection[this.selection.length - 1];
    for (const id of this.selection) {
      const shape = this.shapeOf(id);
      if (shape?.kind === "line") {
        const points = shape.points.map((p) => this.screenOf(p));
        add(
          s("polyline", { class: "outline", points: points.map((p) => `${p.x},${p.y}`).join(" ") }),
        );
      } else if (shape) {
        const turned = this.elements.get(id);
        const frame = this.screenBox(shape.box);
        add(
          s("rect", {
            class: id === primary ? "outline primary" : "outline",
            x: frame.x,
            y: frame.y,
            width: frame.width,
            height: frame.height,
            ...(turned ? this.turnAttributes(shape.box, this.angleOf(turned)) : {}),
          }),
        );
        // An icon shape's label, drawn outside its square, goes with it.
        const element = this.elements.get(id);
        if (element?.labelBox && drag?.kind !== "resize" && !this.angleOf(element)) {
          const dx = shape.box.x - element.box.x;
          const dy = shape.box.y - element.box.y;
          const label = element.labelBox;
          rect(
            this.screenBox({ ...label, x: label.x + dx, y: label.y + dy }),
            "outline label-outline",
          );
        }
      }
    }
    // The handles resize, bend and connect: a canvas that only shows draws the outline alone.
    if (!drag && this.selection.length === 1 && !this.readOnly) {
      const element = this.elements.get(this.selection[0]!);
      const relation = this.relations.get(this.selection[0]!);
      const sequence = r.profile === "sequence";
      // A free line has the handles of its points instead of a frame's.
      if (element?.line && !this.stale) this.drawLineHandles(element);
      else if (element && !this.stale) this.drawElementHandles(element);
      if (relation && !this.stale && !sequence) this.drawRouteHandles(relation);
    }
    if (drag?.kind === "linePoint" && drag.moving) {
      // The line as the drop will write it, its points as handles that follow the pointer.
      const element = this.elements.get(drag.id);
      if (element?.line) {
        const points = this.draggedLine(drag, element).map((p) => this.screenOf(p));
        add(
          s("polyline", {
            class: "wire",
            fill: "none",
            points: points.map((p) => `${p.x},${p.y}`).join(" "),
          }),
        );
        for (const p of points) {
          add(s("circle", { class: "handle line-point", cx: p.x, cy: p.y, r: 4 }));
        }
      }
    }
    if (drag?.kind === "resize") {
      // A stroke scaled by a handle: its path as the drop will write it, at every frame, over the
      // frame that follows the pointer, until the live preview draws the stroke itself there.
      const pen = this.elements.get(drag.id)?.pen;
      if (pen) {
        const path = s("path", {
          class: "pen-outline",
          d: penPathOf(scalePenPoints(pen.points, pen.bounds, drag.result, pen.width)),
        });
        this.placeStroke(path);
        add(path);
      }
    }
    if (drag?.kind === "lineDraw" && drag.moving) this.drawLineGhost(drag.start, drag.point);
    const fading = this.lineFading;
    if (fading && !drag) this.drawLineGhost(fading.from, fading.to, fading.since);
    if (drag?.kind === "move") {
      // The group the selection would land in, outlined as a connection's target is.
      const target = drag.moving && drag.target ? this.elements.get(drag.target) : undefined;
      if (target) outline(target, "highlight drop");
      for (const guide of drag.guides) {
        const a = this.screenOf(
          guide.axis === "x"
            ? { x: guide.value, y: guide.from }
            : { x: guide.from, y: guide.value },
        );
        const b = this.screenOf(
          guide.axis === "x" ? { x: guide.value, y: guide.to } : { x: guide.to, y: guide.value },
        );
        add(s("line", { class: "guide", x1: a.x, y1: a.y, x2: b.x, y2: b.y }));
      }
    }
    if (drag?.kind === "rotate") {
      // The angle beside the pointer while the handle turns the element.
      const text = messages().rotation.degrees(drag.angle);
      const x = this.pointer.x + 14;
      const y = this.pointer.y + 14;
      add(
        s(
          "g",
          { class: "cursor-badge rotation-badge" },
          s("rect", { x, y, width: 44, height: 20, rx: 4 }),
          s(
            "text",
            { x: x + 22, y: y + 14, "text-anchor": "middle" },
            document.createTextNode(text),
          ),
        ),
      );
    }
    if (drag?.kind === "band") {
      const x = Math.min(drag.start.x, drag.current.x);
      const y = Math.min(drag.start.y, drag.current.y);
      rect(
        {
          x,
          y,
          width: Math.abs(drag.current.x - drag.start.x),
          height: Math.abs(drag.current.y - drag.start.y),
        },
        "band",
      );
    }
    if (drag?.kind === "bend" || drag?.kind === "segment") {
      const relation = this.relations.get(drag.relation);
      if (relation && drag.moving) {
        const via = this.dragVia(drag, relation);
        const points = [
          relation.points[0]!,
          ...via,
          relation.points[relation.points.length - 1]!,
        ].map((p) => this.screenOf(p));
        add(
          s("polyline", {
            class: "wire",
            fill: "none",
            points: points.map((p) => `${p.x},${p.y}`).join(" "),
          }),
        );
      }
    }
    if (drag?.kind === "end" || drag?.kind === "connect") {
      const relation = drag.kind === "end" ? this.relations.get(drag.relation) : undefined;
      const from =
        drag.kind === "end"
          ? this.screenOf(
              drag.end === "from"
                ? relation!.points[relation!.points.length - 1]!
                : relation!.points[0]!,
            )
          : this.screenOf(drag.start?.point ?? centerOf(this.elements.get(drag.from)!.box));
      const to = this.screenOf(drag.point);
      add(s("line", { class: "wire", x1: from.x, y1: from.y, x2: to.x, y2: to.y }));
      const target = drag.target;
      const element = target ? this.elements.get(target.element) : undefined;
      if (element && target) {
        outline(element, "highlight");
        // Any point of the outline; the magnets draw the end within a few pixels.
        const options = this.optionsOf(element);
        for (const magnet of magnets(element.box, element.ports, element.shape, options)) {
          const p = this.screenOf(outOfFrame(magnet.point, element.box, element.rotation));
          add(s("circle", { class: "anchor", cx: p.x, cy: p.y, r: 3.5 }));
        }
        if (target.attachment.port !== null) {
          const p = this.screenOf(target.attachment.point);
          add(s("circle", { class: "anchor active", cx: p.x, cy: p.y, r: 5 }));
        }
      }
    }
    if (!drag && this.borderStart) {
      const element = this.elements.get(this.borderStart.element);
      if (element) {
        outline(element, "highlight");
        const p = this.screenOf(this.borderStart.attachment.point);
        add(s("circle", { class: "anchor active", cx: p.x, cy: p.y, r: 5 }));
      }
    }
    if (this.tool === "relation" && this.relationFrom) {
      const source = this.elements.get(this.relationFrom);
      if (source) {
        outline(source, "highlight source");
        if (this.stage.matches(":hover")) {
          const from = this.screenOf(centerOf(source.box));
          const to = this.pointer;
          add(s("line", { class: "wire", x1: from.x, y1: from.y, x2: to.x, y2: to.y }));
        }
      }
    }
    // The relation tool's cursor badge: the kind of arrow it creates (R cycles it).
    if (this.tool === "relation" && this.stage.matches(":hover")) {
      const kind = this.currentArrowKind();
      if (kind) {
        const x = this.pointer.x + 14;
        const y = this.pointer.y + 14;
        const picture = glyph("arrow", kind);
        picture.setAttribute("x", String(x + 3));
        picture.setAttribute("y", String(y + 2));
        add(
          s(
            "g",
            { class: "cursor-badge", "data-kind": kind },
            s("rect", { x, y, width: 38, height: 20, rx: 4 }),
            picture,
          ),
        );
      }
    }
    // An icon dragged from the picker or a library: the element it would go to, or its ghost.
    const iconDrag = this.iconDrag;
    if (iconDrag?.inside) {
      const target = iconDrag.target ? this.elements.get(iconDrag.target) : undefined;
      if (target) outline(target, "highlight drop");
      else this.drawIconGhost(iconDrag.choice, iconDrag.point, iconDrag.item);
    }
    const armed = this.tool === "icon" ? this.armedIcon : undefined;
    if (armed && !iconDrag && this.stage.matches(":hover")) {
      const onto = this.stackAt(this.diagramOf(this.pointer)).find((el) => el.takesIcon);
      if (onto) outline(onto, "highlight drop");
      else this.drawIconGhost(armed, this.pointer);
    } else if (this.noteDrop !== undefined && this.elements.has(this.noteDrop)) {
      // The note tool dragged from the palette is over an element that would take the note.
      outline(this.elements.get(this.noteDrop)!, "highlight drop");
    } else if (
      this.tool === "note" &&
      !iconDrag &&
      this.stage.matches(":hover") &&
      this.noteTargetAt(this.diagramOf(this.pointer))
    ) {
      outline(this.noteTargetAt(this.diagramOf(this.pointer))!, "highlight drop");
    } else if (
      this.tool &&
      this.tool !== "relation" &&
      !isDrawing(this.tool) &&
      !armed &&
      !iconDrag &&
      this.stage.matches(":hover")
    ) {
      // A box or node of a shape takes the shape's default size and outline.
      const shaped = SHAPED_TOOLS.has(this.tool);
      const size = shaped
        ? shapeSize(this.shape)
        : (DEFAULT_SIZES[this.tool] ?? DEFAULT_SIZES.node);
      const at = this.snapPoint(this.diagramOf(this.pointer));
      const box = this.screenBox({ x: at.x - size.width / 2, y: at.y - size.height / 2, ...size });
      if (shaped) {
        // The layout's own outline at the zoom; a rounded box keeps the theme's usual corner.
        const options = this.shape === "rounded" ? { radius: 8 * this.viewport.zoom } : {};
        add(
          s("path", {
            class: "ghost",
            d: shapeOutline(this.shape, box, options).d,
            "data-shape": this.shape,
          }),
        );
      } else rect(box, "ghost");
    }
    // The strokes written and on their way, then the one being drawn, over everything.
    for (const path of [
      ...this.penQueue.flatMap((entry) => (entry.path ? [entry.path] : [])),
      ...(drag?.kind === "penDraw" ? [drag.path] : []),
    ]) {
      this.placeStroke(path);
      add(path);
    }
    this.outlined = outlined;
  }

  private isMoving(id: string): boolean {
    const drag = this.drag;
    return drag?.kind === "move" && drag.moving && drag.ids.includes(id);
  }

  private drawElementHandles(element: ElementInfo): void {
    const box = this.screenBox(element.box);
    // A turned element's handles are drawn in its own frame, turned with it.
    const turn = this.turnAttributes(element.box, this.angleOf(element));
    const frame = turn.transform ? s("g", { class: "turned-handles", ...turn }) : undefined;
    if (frame) this.overlay.append(frame);
    const overlay = frame ?? this.overlay;
    // Sequence participants take the size of their label.
    const resizable =
      this.render?.profile !== "sequence" && (element.kind !== "group" || element.sized);
    if (this.turns(element)) {
      // Beyond the top-right corner, clear of the resize and connection handles.
      const corner = { x: box.x + box.width, y: box.y };
      const at = { x: corner.x + 14, y: corner.y - 14 };
      const words = messages().rotation;
      overlay.append(
        s("line", { class: "rotate-line", x1: corner.x, y1: corner.y, x2: at.x, y2: at.y }),
        s(
          "circle",
          {
            class: "handle rotate",
            cx: at.x,
            cy: at.y,
            r: 6,
            "data-handle": "rotate:",
            "data-id": element.id,
          },
          s("title", {}, document.createTextNode(words.handle)),
        ),
      );
    }
    if (resizable) {
      for (const handle of HANDLES) {
        const x =
          box.x + (handle.includes("w") ? 0 : handle.includes("e") ? box.width : box.width / 2);
        const y =
          box.y + (handle.includes("n") ? 0 : handle.includes("s") ? box.height : box.height / 2);
        overlay.append(
          s("rect", {
            class: "handle",
            x: x - 4,
            y: y - 4,
            width: 8,
            height: 8,
            "data-handle": `resize:${handle}`,
            "data-id": element.id,
            style: `cursor:${handle}-resize`,
          }),
        );
      }
    }
    // A stroke is no end of a relation: it has no connection handles.
    if (element.kind === "group" || element.pen) return;
    // Connection handles just outside each side; past an icon shape's label on its side.
    const label = element.labelBox ? this.screenBox(element.labelBox) : undefined;
    const north = label && label.y + label.height <= box.y + 1 ? label.y : box.y;
    const south =
      label && label.y >= box.y + box.height - 1 ? label.y + label.height : box.y + box.height;
    const west = label && label.x + label.width <= box.x + 1 ? label.x : box.x;
    const east =
      label && label.x >= box.x + box.width - 1 ? label.x + label.width : box.x + box.width;
    const sides: [string, number, number][] = [
      ["north", box.x + box.width / 2, north - 14],
      ["south", box.x + box.width / 2, south + 14],
      ["west", west - 14, box.y + box.height / 2],
      ["east", east + 14, box.y + box.height / 2],
    ];
    for (const [side, x, y] of sides) {
      overlay.append(
        s("circle", {
          class: "handle connect",
          cx: x,
          cy: y,
          r: 5,
          "data-handle": `connect:${side}`,
          "data-id": element.id,
        }),
      );
    }
  }

  private drawRouteHandles(relation: RelationInfo): void {
    for (const handle of routeHandles(relation)) {
      const p = this.screenOf(handle.point);
      const id = relation.key;
      if (handle.kind === "end") {
        this.overlay.append(
          s("circle", {
            class: "handle end",
            cx: p.x,
            cy: p.y,
            r: 5,
            "data-handle": `end:${handle.end}`,
            "data-id": id,
          }),
        );
      } else if (handle.kind === "bend") {
        this.overlay.append(
          s("rect", {
            class: "handle",
            x: p.x - 4,
            y: p.y - 4,
            width: 8,
            height: 8,
            "data-handle": `bend:${handle.index}`,
            "data-id": id,
          }),
        );
      } else {
        this.overlay.append(
          s("circle", {
            class: "handle segment",
            cx: p.x,
            cy: p.y,
            r: 4,
            "data-handle": `segment:${handle.index}`,
            "data-id": id,
          }),
        );
      }
    }
  }

  /** A free line as a connector: its points, the polyline it is drawn with and its bends. */
  private lineShape(element: ElementInfo): {
    points: readonly Point[];
    drawn: readonly Point[];
    via: readonly Point[];
    fromSide: "east";
    toSide: "west";
  } {
    const line = element.line!;
    return { ...line, fromSide: "east", toSide: "west" };
  }

  /** The points of a line whose handle is dragged, as the drop will write them. */
  private draggedLine(
    drag: { part: "point" | "segment"; index: number; point: Point },
    element: ElementInfo,
  ): Point[] {
    return withLinePoint(element.line!.points, drag.part, drag.index, drag.point);
  }

  /**
   * The handles of a selected free line: a circle at each end, a square at each bend and a small
   * circle at the middle of each stretch, which a drag turns into a bend. No frame, resize,
   * rotation or connection handle: a line's ends are points.
   */
  private drawLineHandles(element: ElementInfo): void {
    const last = element.line!.points.length - 1;
    for (const handle of routeHandles(this.lineShape(element))) {
      const p = this.screenOf(handle.point);
      if (handle.kind === "end") {
        this.overlay.append(
          s("circle", {
            class: "handle end line-end",
            cx: p.x,
            cy: p.y,
            r: 5,
            "data-handle": `linePoint:${handle.end === "from" ? 0 : last}`,
            "data-id": element.id,
          }),
        );
      } else if (handle.kind === "bend") {
        this.overlay.append(
          s("rect", {
            class: "handle line-bend",
            x: p.x - 4,
            y: p.y - 4,
            width: 8,
            height: 8,
            "data-handle": `linePoint:${handle.index + 1}`,
            "data-id": element.id,
          }),
        );
      } else {
        this.overlay.append(
          s("circle", {
            class: "handle segment",
            cx: p.x,
            cy: p.y,
            r: 4,
            "data-handle": `lineSegment:${handle.index}`,
            "data-id": element.id,
          }),
        );
      }
    }
  }

  /**
   * The ghost of a line being drawn, from `from` to `to` in diagram coordinates: the current
   * kind's dashes and heads, a dot at each end. With `since` it is the ghost of a line just
   * written, fading out from that time (the delay keeps the fade where it was when the overlay
   * is drawn again).
   */
  private drawLineGhost(from: Point, to: Point, since?: number): void {
    const a = this.screenOf(from);
    const b = this.screenOf(to);
    const kind = this.currentArrowKind();
    const { line, heads } = kind
      ? arrowKindLine(kind, false)
      : { line: "solid" as const, heads: "end" as const };
    const parts: SVGElement[] = [
      s("line", {
        class: line === "dashed" ? "line-ghost-stroke dashed" : "line-ghost-stroke",
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
      }),
    ];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const head = (tip: Point, tail: Point) => {
      const ux = (tip.x - tail.x) / length;
      const uy = (tip.y - tail.y) / length;
      const base = { x: tip.x - ux * 10, y: tip.y - uy * 10 };
      const points = [
        tip,
        { x: base.x - uy * 5, y: base.y + ux * 5 },
        { x: base.x + uy * 5, y: base.y - ux * 5 },
      ];
      parts.push(
        s("polygon", {
          class: "line-ghost-head",
          points: points.map((p) => `${p.x},${p.y}`).join(" "),
        }),
      );
    };
    if (length > 12 && heads !== "none") head(b, a);
    if (length > 12 && heads === "both") head(a, b);
    for (const p of [a, b])
      parts.push(s("circle", { class: "line-ghost-end", cx: p.x, cy: p.y, r: 3.5 }));
    const fading = since !== undefined;
    this.overlay.append(
      s(
        "g",
        {
          class: fading ? "line-ghost fading" : "line-ghost",
          ...(fading
            ? { style: `animation-delay: -${Math.round(performance.now() - since)}ms` }
            : {}),
        },
        ...parts,
      ),
    );
  }

  private drawMinimap(): void {
    const r = this.render;
    this.minimap.hidden = !this.showMinimap || !r || this.storyPanel.active;
    if (!r || this.minimap.hidden) return;
    const map = minimapViewport({ width: r.width, height: r.height }, this.viewport, this.screen());
    this.map.style.transform = `translate(${map.origin.x}px, ${map.origin.y}px) scale(${map.scale})`;
    Object.assign(this.frame.style, {
      left: `${map.frame.x}px`,
      top: `${map.frame.y}px`,
      width: `${map.frame.width}px`,
      height: `${map.frame.height}px`,
    });
  }

  /**
   * Keeps the dragged elements under the pointer without waiting for a drawing: their groups are
   * shifted by what the drawing shown leaves to go, the whole drag over the last render or what
   * the pointer moved since the preview shown was asked for. In flow and free diagrams and C4
   * views what a dragged group holds goes with it, as the drop moves it.
   */
  private followPointer(): void {
    const svg = this.content.querySelector("svg");
    const drag = this.drag;
    if (!svg || drag?.kind !== "move") return;
    const shown = this.previewShown;
    const ids = this.render?.profile === "sequence" ? drag.ids : this.withContents(drag.ids);
    // Over a list, what is dragged floats above the cards that make room for it, with a shadow.
    const lifted = drag.moving && drag.list !== undefined;
    const outer = new Set(lifted ? this.outermost(drag.ids).map((e) => e.id) : []);
    for (const id of ids) {
      // A preview into a list draws each element in its new place; any other, moved by its delta.
      const drawn = shown?.shifts?.get(id) ?? shown?.delta ?? { x: 0, y: 0 };
      const x = drag.delta.x - drawn.x;
      const y = drag.delta.y - drawn.y;
      // A participant's lifeline follows its head.
      for (const g of svg.querySelectorAll(
        `g[data-id="${cssEscape(id)}"][data-role="element"], g[data-id="${cssEscape(id)}"][data-role="lifeline"]`,
      )) {
        // A turned element moves with its rotation.
        const turn = CanvasApp.turnOf(g);
        const shifted = x === 0 && y === 0 ? turn : `translate(${x} ${y}) ${turn}`.trim();
        if (shifted === "") g.removeAttribute("transform");
        else g.setAttribute("transform", shifted);
        if (lifted && !g.hasAttribute("data-lifted") && g.parentNode === svg) {
          // Painted last, in their order: a group before what it holds.
          g.setAttribute("data-lifted", "");
          svg.append(g);
        }
        g.classList.toggle("mdg-lifted", outer.has(id));
      }
    }
  }

  /**
   * Where the drawing shown draws the groups of `ids`: the top left of each one's drawing, its own
   * transform left out, in diagram coordinates.
   */
  private drawnCorners(ids: readonly string[]): Map<string, Point> {
    const corners = new Map<string, Point>();
    const svg = this.content.querySelector("svg");
    const offset = this.previewShown?.offset ?? this.render?.offset;
    if (!svg || !offset) return corners;
    for (const id of ids) {
      const g = svg.querySelector<SVGGElement>(
        `g[data-id="${cssEscape(id)}"][data-role="element"]`,
      );
      if (!g) continue;
      const box = g.getBBox();
      corners.set(id, { x: box.x - offset.x, y: box.y - offset.y });
    }
    return corners;
  }

  /** Where each element group of the drawing is on the page now, moving ones as they are seen. */
  private drawnRects(skip: ReadonlySet<string> = new Set()): Map<string, DOMRect> {
    const rects = new Map<string, DOMRect>();
    for (const g of this.content.querySelectorAll<SVGGElement>(
      'svg g[data-role="element"][data-id]',
    )) {
      const id = g.getAttribute("data-id")!;
      if (!skip.has(id) && !rects.has(id)) rects.set(id, g.getBoundingClientRect());
    }
    return rects;
  }

  /** The canvas's easing, `--mdg-ease`, for the animations it runs itself. */
  private easing(): string {
    return getComputedStyle(this.stage).getPropertyValue("--mdg-ease").trim() || "ease-out";
  }

  /** The length of a motion token in milliseconds: none under reduced motion, as the tokens say. */
  private motion(token: "--mdg-motion-fast" | "--mdg-motion"): number {
    const value = getComputedStyle(this.stage).getPropertyValue(token).trim();
    const time = parseFloat(value);
    if (!Number.isFinite(time)) return 0;
    return value.endsWith("ms") ? time : value.endsWith("s") ? time * 1000 : time;
  }

  /**
   * Glides the element groups of the drawing now shown from where they were on the page
   * (`before`, from `drawnRects`) to where they are, over `duration`: the cards of a list making
   * room, going back, and a dropped card settling in its place. A turned group keeps its turn.
   */
  private glide(before: ReadonlyMap<string, DOMRect>, duration: number): void {
    if (duration <= 0 || before.size === 0) return;
    const zoom = this.viewport.zoom;
    const easing = this.easing();
    for (const g of this.content.querySelectorAll<SVGGElement>(
      'svg g[data-role="element"][data-id]',
    )) {
      const was = before.get(g.getAttribute("data-id")!);
      if (!was) continue;
      const now = g.getBoundingClientRect();
      // A frame that grew or shrank (the list itself) takes its new size at once: slid, one of
      // its edges would overshoot.
      if (Math.abs(was.width - now.width) > 1 || Math.abs(was.height - now.height) > 1) continue;
      const dx = (was.left - now.left) / zoom;
      const dy = (was.top - now.top) / zoom;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
      const turn = cssTurn(CanvasApp.turnOf(g));
      if (turn === undefined) continue;
      g.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) ${turn.rotate}`, transformOrigin: turn.origin },
          { transform: turn.rotate || "none", transformOrigin: turn.origin },
        ],
        { duration, easing },
      );
    }
  }

  /**
   * Replaces the drawing shown through `update` during a drag over a list, or out of one: what the
   * list holds glides to its new place (the dragged elements follow the pointer on their own).
   */
  private glidingInLists(update: () => void): void {
    const drag = this.drag;
    const lists =
      drag?.kind === "move" &&
      drag.moving &&
      (drag.list !== undefined || this.previewShown?.list !== undefined);
    const before = lists ? this.drawnRects(new Set(this.withContents(drag.ids))) : undefined;
    update();
    if (before) this.glide(before, this.motion("--mdg-motion-fast"));
  }

  /** Elements and everything they hold, at any depth. */
  private withContents(ids: readonly string[]): string[] {
    const moved = new Set(ids);
    for (const element of this.elements.values()) {
      for (let p: string | null | undefined = element.parent; p; p = this.parentOf(p)) {
        if (moved.has(p)) {
          moved.add(element.id);
          break;
        }
      }
    }
    return [...moved];
  }

  /** Whether a move or a resize is under way, which previews what its drop would draw. */
  private previewing(): boolean {
    const drag = this.drag;
    return (
      !!this.render &&
      ((drag?.kind === "move" && drag.moving) ||
        drag?.kind === "resize" ||
        (drag?.kind === "rotate" && drag.moving))
    );
  }

  /**
   * The action the drop of the gesture under way would send, which a preview asks the drawing
   * of: none when the drop would send nothing, on a sequence diagram (which moves its own events
   * live), on a canvas that only shows or while the text has errors.
   */
  private previewAction(): PreviewedAction | undefined {
    const drag = this.drag;
    const profile = this.render?.profile;
    if (!this.previewing() || profile === "sequence" || this.readOnly || this.stale) {
      return undefined;
    }
    if (drag?.kind === "move") {
      // Into a list: the move the drop sends, which makes room for the selection there; nothing
      // while the drop would leave the list as it is.
      if (drag.list) {
        if (this.keepsList(drag.ids, drag.list)) return undefined;
        return { kind: "move", ids: drag.ids, parent: drag.list.id, index: drag.list.index };
      }
      if (drag.delta.x === 0 && drag.delta.y === 0) return undefined;
      const parent = drag.free ? undefined : this.dropParent(drag.ids, drag.delta);
      return {
        kind: "move",
        ids: drag.ids,
        delta: drag.delta,
        ...(parent !== undefined ? { parent } : {}),
      };
    }
    if (drag?.kind === "rotate") {
      if (drag.angle === drag.from) return undefined;
      return {
        kind: "setField",
        ids: [drag.id],
        field: "style.rotation",
        value: drag.angle === 0 ? null : drag.angle,
      };
    }
    if (drag?.kind !== "resize") return undefined;
    const { box, result } = drag;
    const same =
      result.x === box.x &&
      result.y === box.y &&
      result.width === box.width &&
      result.height === box.height;
    return same ? undefined : { kind: "resize", id: drag.id, box: result };
  }

  /**
   * Asks the session for the drawing of the gesture under way: one request awaits its answer at
   * a time, and an answer asks for the gesture as it is then. A gesture whose drop would send
   * nothing shows the last render again.
   */
  private requestPreview(): void {
    const action = this.previewAction();
    const key = action ? JSON.stringify(action) : undefined;
    if (action === undefined || this.revision === undefined) {
      // An answer on its way is for a gesture that is gone: it is not shown when it comes.
      if (this.previewWaiting) this.previewWaiting = { ...this.previewWaiting, gone: true };
      this.previewAgain = false;
      this.previewSent = undefined;
      if (this.previewShown) {
        // Out of a list, or back where it was in it: its cards glide back.
        this.glidingInLists(() => {
          this.restoreDrawing();
          this.followPointer();
          this.followRotation();
        });
      }
      return;
    }
    if (this.previewWaiting) {
      this.previewAgain = key !== this.previewSent;
      return;
    }
    if (key === this.previewSent) return;
    const token = ++this.previewToken;
    this.previewWaiting = {
      token,
      delta: action.kind === "move" ? (action.delta ?? { x: 0, y: 0 }) : { x: 0, y: 0 },
      ...(action.kind === "move" && action.index !== undefined && typeof action.parent === "string"
        ? { list: { id: action.parent, index: action.index } }
        : {}),
    };
    this.previewAgain = false;
    this.previewSent = key;
    this.post({
      type: "action",
      revision: this.revision,
      action: { kind: "preview", token, action },
    });
  }

  /** Forgets the requests of a preview: an answer still on its way is dropped when it comes. */
  private endPreview(): void {
    this.previewWaiting = undefined;
    this.previewAgain = false;
    this.previewSent = undefined;
  }

  /**
   * The answer to the preview awaited: while its gesture goes on, its drawing replaces the
   * stage's, or, refused, the last render comes back and the dragged elements go on alone. Then
   * the gesture as it is now is asked for, when it changed.
   */
  private applyPreview(message: HostMessage & { type: "preview" }): void {
    const waiting = this.previewWaiting;
    if (waiting?.token !== message.token) return;
    this.previewWaiting = undefined;
    const r = this.render;
    if (!r || !this.previewing()) return;
    // The cards of a list glide to the room they make for what is dragged, and back.
    this.glidingInLists(() => {
      // Not shown when the gesture went back to sending nothing meanwhile (it may have moved on
      // again since: that is asked for below).
      if (!waiting.gone && message.svg === null) {
        if (this.previewShown) this.restoreDrawing();
      } else if (!waiting.gone && message.svg !== null) {
        this.drawPreview(
          {
            svg: message.svg,
            width: message.width ?? r.width,
            height: message.height ?? r.height,
            offset: message.offset ?? r.offset,
            ...(message.box ? { box: message.box } : {}),
          },
          waiting.delta,
          waiting.list,
        );
      }
      this.followPointer();
      this.followRotation();
    });
    // The bar goes to the middle of the room made.
    this.syncInsertion();
    if (this.previewAgain) {
      this.previewAgain = false;
      this.requestPreview();
    }
  }

  /**
   * Shows a preview's drawing instead of the last render's. Its scene grows and shifts when boxes
   * go past the drawing's edges, so it is placed by its own offset: diagram coordinates stay where
   * the render put them, under the overlay.
   */
  private drawPreview(
    scene: {
      readonly svg: string;
      readonly width: number;
      readonly height: number;
      readonly offset: Point;
      readonly box?: Box;
    },
    delta: Point,
    list?: ListDrop,
  ): void {
    const r = this.render!;
    this.putScene(scene);
    const dx = r.offset.x - scene.offset.x;
    const dy = r.offset.y - scene.offset.y;
    const root = this.content.querySelector("svg");
    if (root && (dx !== 0 || dy !== 0)) root.style.transform = `translate(${dx}px, ${dy}px)`;
    this.previewShown = {
      delta,
      offset: scene.offset,
      ...(scene.box ? { box: scene.box } : {}),
      ...(list ? { list } : {}),
    };
    this.markTurns();
    this.hideLayers();
    this.styleSheetGrid();
    // A move into a list draws what moved in its new place: how far that is from where the drag
    // took it, so that it stays under the pointer.
    const drag = this.drag;
    if (list && drag?.kind === "move" && drag.drawn) {
      const now = this.drawnCorners([...drag.drawn.keys()]);
      const shifts = new Map<string, Point>();
      for (const [id, was] of drag.drawn) {
        const at = now.get(id);
        if (at) shifts.set(id, { x: at.x - was.x, y: at.y - was.y });
      }
      this.previewShown.shifts = shifts;
    }
  }

  /** Brings the last render's drawing back after a preview. */
  private restoreDrawing(): void {
    this.previewShown = undefined;
    const r = this.render;
    if (!r) return;
    this.setSvg(r);
    this.hideLayers();
    this.styleSheetGrid();
  }

  /** Moves a dragged message, note or fragment of a sequence diagram up or down. */
  private previewEvent(key: string, dy: number): void {
    const svg = this.content.querySelector("svg");
    if (!svg) return;
    for (const g of svg.querySelectorAll(`g[data-id="${cssEscape(key)}"]`)) {
      const role = g.getAttribute("data-role");
      if (role === "relation" || role === "event" || role === "label")
        g.setAttribute("transform", `translate(0 ${dy})`);
    }
  }

  /** Ends a drag without its drop: the last render's drawing is shown as it was. */
  private resetPreview(): void {
    if (this.drag?.kind === "laser") this.endLaser();
    // A stroke let go of is not written (its path goes with the drag), and the others drop it;
    // erased strokes come back.
    if (this.drag?.kind === "penDraw") this.cancelLaser(this.drag.look);
    if (this.drag?.kind === "erase") this.restoreErased([...this.drag.hits]);
    // A drag over a list let go of: what it carried glides back to its place, and the cards that
    // made room for it to theirs.
    const drag = this.drag;
    const back =
      drag?.kind === "move" && drag.moving && (drag.list || this.previewShown?.list)
        ? this.drawnRects()
        : undefined;
    this.endPreview();
    // A drawing whose dragged groups were lifted above the others is drawn in its own order again.
    if (this.previewShown || this.content.querySelector("[data-lifted]")) this.restoreDrawing();
    for (const g of this.content.querySelectorAll("g[transform]")) {
      const role = g.getAttribute("data-role");
      if (
        role === "element" ||
        role === "lifeline" ||
        role === "event" ||
        (role === "relation" && this.render?.profile === "sequence") ||
        (role === "label" && this.events.has(g.getAttribute("data-id") ?? ""))
      ) {
        // A turned element keeps its rotation.
        const turn = CanvasApp.turnOf(g);
        if (turn) g.setAttribute("transform", turn);
        else g.removeAttribute("transform");
      }
    }
    // A rotation under way is dropped: its group took its own rotation back above.
    for (const g of this.content.querySelectorAll<SVGGElement>("g.turning")) {
      g.classList.remove("turning", "turned-release");
    }
    this.drag = undefined;
    if (back) this.glide(back, this.motion("--mdg-motion"));
    this.drawOverlay();
  }

  /** Where an event of a sequence diagram is drawn, in diagram coordinates. */
  private eventBox(event: EventInfo): Box | undefined {
    if (event.box) return event.box;
    if (event.kind === "message") {
      const relation = this.relations.get(event.key);
      return relation ? boxAround(relation.points) : undefined;
    }
    const height = Math.max(event.height, 8);
    if (event.participant) {
      const head = this.elements.get(event.participant);
      if (!head) return undefined;
      return { x: head.box.x + head.box.width / 2 - 10, y: event.y, width: 20, height };
    }
    // Dividers and delays cross every lifeline.
    const heads = [...this.elements.values()].map((e) => e.box);
    if (heads.length === 0) return undefined;
    const left = Math.min(...heads.map((b) => b.x));
    const right = Math.max(...heads.map((b) => b.x + b.width));
    return { x: left, y: event.y, width: right - left, height };
  }

  // ------------------------------------------------------------------ toolbar

  /**
   * A toolbar button: `label` is its name, without a key; its title is `shown` (the name, unless
   * given) followed by the key in parentheses, and `aria-keyshortcuts` says the key.
   */
  private button(
    label: string,
    iconPaths: string,
    run: () => void,
    shortcut?: string,
    shown = label,
  ): HTMLButtonElement {
    const button = h(
      "button",
      {
        type: "button",
        title: shortcut ? `${shown} (${shortcut})` : shown,
        "aria-label": label,
        "aria-keyshortcuts": shortcut ? ariaKeyshortcuts(shortcut) : undefined,
      },
      icon(iconPaths),
    );
    button.addEventListener("click", run);
    return button;
  }

  private toggle(
    name: string,
    label: string,
    iconPaths: string,
    run: () => void,
    shortcut?: string,
  ): HTMLButtonElement {
    const button = this.button(label, iconPaths, run, shortcut);
    button.setAttribute("aria-pressed", "false");
    this.toggles.set(name, button);
    return button;
  }

  /**
   * Pauses the diagram's `animate` effects, showing the static drawing, or plays them again; the
   * choice is kept for the diagram, so it holds after a reload.
   */
  private readonly playButton: HTMLButtonElement = (() => {
    const button = this.button(messages().toolbar.pauseEffects, ICONS.pause, () => {
      const r = this.render;
      if (!r || r.effects === 0) return;
      const on = !r.playing;
      this.persist({ effectsPlaying: { ...this.local.effectsPlaying, [r.diagram]: on } });
      this.post({ type: "playEffects", on });
    });
    button.setAttribute("aria-pressed", "true");
    button.hidden = true;
    return button;
  })();

  /** Whether the effects of `diagram` should play: the person's choice, else the system's. */
  private effectsWanted(diagram: string): boolean {
    const chosen = this.local.effectsPlaying?.[diagram];
    if (chosen !== undefined) return chosen;
    return !(globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  }

  /** The toolbar's toggle as the render says: Pause while playing, Play while paused. */
  private showPlayButton(r: CanvasRender): void {
    const words = messages().toolbar;
    const label = r.playing ? words.pauseEffects : words.playEffects;
    const button = this.playButton;
    button.hidden = false;
    button.disabled = r.effects === 0;
    button.setAttribute("aria-pressed", String(r.playing));
    button.setAttribute("aria-label", label);
    button.title = label;
    button.replaceChildren(icon(r.playing ? ICONS.pause : ICONS.play));
  }

  private buildToolbar(): void {
    this.diagramSelect.addEventListener("change", () =>
      this.post({ type: "pickDiagram", diagram: this.diagramSelect.value }),
    );
    this.scenarioSelect.addEventListener("change", () => {
      const value = this.scenarioSelect.value;
      this.post({ type: "pickScenario", scenario: value === "" ? null : value });
      this.stage.focus();
    });
    const words = messages();
    const tools = words.palette.tools;
    const separator = () => h("span", { class: "separator", role: "separator" });
    const beforePalette = separator();
    const palette: HTMLElement[] = PALETTE.map((p) => {
      if (p.kind === "icon") {
        // The icon tool opens the icon picker; the icon chosen arms the tool.
        const button: HTMLButtonElement = this.button(
          words.palette.icon,
          ICONS.icon,
          () => this.toggleIconPicker(button),
          p.key,
          tools.icon,
        );
        button.setAttribute("data-tool", p.kind);
        button.setAttribute("aria-haspopup", "dialog");
        button.setAttribute("aria-expanded", "false");
        button.setAttribute("aria-controls", "mdg-icons");
        if (p.profile) button.setAttribute("data-profile", p.profile);
        return button;
      }
      // The pen and the highlighter share a split button; the eraser has its own. They stay armed
      // after each stroke, and are not dropped from the palette as the kinds are.
      if (p.kind === "pen" || p.kind === "highlighter") return this.penSplit();
      // A sticky note is added at once, near the centre or where the button is dropped; the
      // arrow picks its colour.
      if (p.kind === "sticky") return this.stickySplit(p.key);
      if (p.kind === "eraser") {
        const button = this.button(tools.eraser, ICONS.eraser, () => this.arm("eraser"), p.key);
        button.setAttribute("data-tool", "eraser");
        button.setAttribute("aria-keyshortcuts", p.key);
        if (p.profile) button.setAttribute("data-profile", p.profile);
        return button;
      }
      const kind = p.kind;
      const button = this.button(
        words.palette.hint(tools[kind]),
        ICONS[kind],
        () => this.arm(kind),
        p.key,
        tools[kind],
      );
      button.setAttribute("data-tool", kind);
      // C4 views draw the model's entities and their scope's boundary only.
      if (kind === "group") button.setAttribute("data-not-profile", "c4");
      button.addEventListener("pointerdown", (e) => this.paletteDrag(e, kind));
      if (SHAPED_TOOLS.has(kind)) return this.shapesSplit(button, kind, p.profile);
      if (kind === "group") return this.groupSplit(button);
      if (p.profile) button.setAttribute("data-profile", p.profile);
      return button;
    });
    this.relationButton = this.button(
      words.toolbar.relation,
      ICONS.relation,
      // The button lets an armed tool go; R cycles its kind of arrow instead.
      () => (this.tool === "relation" ? this.arm(undefined) : this.command("relationTool")),
      "R",
    );
    this.relationButton.setAttribute("data-tool", "relation");
    this.relationButton.setAttribute("aria-keyshortcuts", "R");
    const relationSplit = this.arrowSplit(this.relationButton);
    // Beside the diagram picker: adds a diagram of a kind to any file.
    const newDiagram: HTMLButtonElement = this.button(words.toolbar.newDiagram, ICONS.plus, () =>
      this.openNewDiagram(newDiagram),
    );
    newDiagram.classList.add("new-diagram");
    newDiagram.setAttribute("aria-haspopup", "menu");
    newDiagram.setAttribute("aria-expanded", "false");
    const connect = this.button(
      words.toolbar.connect,
      ICONS.connect,
      () => this.command("connect"),
      "C",
    );
    // Sequence diagrams: more participants, notes, fragments, dividers and delays.
    const sequence = (button: HTMLButtonElement) => {
      button.setAttribute("data-profile", "sequence");
      return button;
    };
    const more: HTMLButtonElement = sequence(
      this.button(words.toolbar.moreParticipants, ICONS.participants, () => {
        this.menu.open(
          MORE_PARTICIPANTS.map((kind) => ({ label: tools[kind], run: () => this.arm(kind) })),
          this.below(more),
          this.stage.getBoundingClientRect(),
        );
      }),
    );
    const note = sequence(
      this.button(words.toolbar.note, ICONS.note, () => this.command("createSequenceNote"), "O"),
    );
    const fragment: HTMLButtonElement = sequence(
      this.button(
        words.toolbar.fragment,
        ICONS.fragment,
        () => this.fragmentMenu(this.below(fragment)),
        "F",
      ),
    );
    const divider = sequence(
      this.button(words.toolbar.divider, ICONS.divider, () => this.command("createDivider")),
    );
    const delay = sequence(
      this.button(words.toolbar.delay, ICONS.delay, () => this.command("createDelay")),
    );
    // C4 views: entities come from the model.
    const addEntity: HTMLButtonElement = this.button(
      words.commands.addFromModel,
      ICONS.model,
      () => this.addEntity(this.below(addEntity)),
      "A",
    );
    addEntity.setAttribute("data-profile", "c4");
    for (const z of ZOOM_PRESETS)
      this.zoomSelect.append(h("option", { value: String(z) }, words.toolbar.percent(z)));
    this.zoomSelect.append(
      h("option", { value: "fit" }, words.toolbar.fit),
      h("option", { value: "selection" }, words.toolbar.selection),
      h("option", { value: "custom", hidden: true }, ""),
    );
    this.zoomSelect.addEventListener("change", () => {
      const value = this.zoomSelect.value;
      if (value === "fit") this.command("zoomFit");
      else if (value === "selection") this.command("zoomSelection");
      else this.setViewport(zoomAt(this.viewport, Number(value), this.centre()));
      this.stage.focus();
    });
    const arrange: HTMLButtonElement = this.button(words.toolbar.arrange, ICONS.arrange, () => {
      const rect = arrange.getBoundingClientRect();
      const base = this.main.getBoundingClientRect();
      const commands = words.commands;
      this.menu.open(
        [
          {
            label: commands.arrangeUnplaced,
            run: () => this.act({ kind: "arrange", scope: "unplaced" }),
          },
          {
            label: commands.recomputeLayout,
            run: () => this.act({ kind: "arrange", scope: "all" }),
          },
          ...(this.render?.profile === "flow"
            ? [
                "-" as const,
                {
                  label: commands.convertToFree,
                  run: () => this.command("convertToFree"),
                },
              ]
            : []),
        ],
        { x: rect.left - base.left, y: 0 },
        base,
      );
    });
    arrange.setAttribute("data-not-profile", "sequence");
    const exportButton = this.button(words.commands.exportSvg, ICONS.export, () =>
      this.post({ type: "export" }),
    );
    this.storySelect.hidden = true;
    this.storySelect.addEventListener("change", () => {
      const value = this.storySelect.value;
      this.post({ type: "pickStory", story: value === "" ? null : value });
      this.storyPanel.element.focus();
    });
    this.toolbar.append(
      this.diagramSelect,
      newDiagram,
      this.storySelect,
      this.scenarioSelect,
      beforePalette,
      ...palette,
      more,
      relationSplit,
      connect,
      note,
      fragment,
      divider,
      delay,
      addEntity,
      separator(),
      this.button(words.toolbar.zoomOut, ICONS.zoomOut, () => this.command("zoomOut"), "-"),
      this.zoomSelect,
      this.button(words.toolbar.zoomIn, ICONS.zoomIn, () => this.command("zoomIn"), "+"),
      this.button(
        words.toolbar.fitDiagram,
        ICONS.fit,
        () => this.command("zoomFit"),
        `${words.keys.shift}+1`,
      ),
      separator(),
      this.toggle(
        "pointer",
        words.toolbar.pointer,
        ICONS.pointer,
        () => this.command("togglePointer"),
        "K",
      ),
      this.toggle("grid", words.toolbar.grid, ICONS.grid, () => {
        this.persist({ showGrid: !this.showGrid });
        this.syncToggles();
        this.layout();
      }),
      this.toggle("snap", words.toolbar.snap, ICONS.snap, () => {
        this.persist({ snap: !this.snap });
        this.syncToggles();
      }),
      this.toggle("minimap", words.toolbar.minimap, ICONS.minimap, () => {
        this.persist({ minimap: !this.showMinimap });
        this.syncToggles();
        this.drawMinimap();
      }),
      this.toggle(
        "inspector",
        words.toolbar.inspector,
        ICONS.inspector,
        () => this.setInspectorCollapsed(this.showInspector),
        this.inspectorKey || undefined,
      ),
      this.toggle(
        "layers",
        words.toolbar.layers,
        ICONS.layers,
        () => {
          this.persist({ layers: !this.showLayers });
          this.syncToggles();
        },
        "L",
      ),
      this.toggle(
        "libraries",
        words.toolbar.libraries,
        ICONS.library,
        () => this.toggleLibraries(),
        "U",
      ),
      separator(),
      arrange,
      this.playButton,
      exportButton,
      this.readOnlyBadge,
      this.modeBadge,
    );
    // Story mode is read-only: these go while a story plays.
    for (const element of [
      newDiagram,
      this.scenarioSelect,
      ...palette,
      more,
      relationSplit,
      connect,
      note,
      fragment,
      divider,
      delay,
      addEntity,
      arrange,
      this.playButton,
      exportButton,
      ...this.toggles.values(),
    ]) {
      element.setAttribute("data-edit", "");
    }
    // A canvas that only shows (`CanvasSettings.readOnly`) hides the same way, but only what writes
    // the document: the palette and its relatives, Arrange, the snap and the libraries. What looks
    // (zoom, fit, the minimap, the grid, effects, export, stories) stays, so it is not `data-write`.
    for (const element of [
      newDiagram,
      beforePalette,
      ...palette,
      more,
      relationSplit,
      connect,
      note,
      fragment,
      divider,
      delay,
      addEntity,
      arrange,
      this.toggles.get("snap")!,
      this.toggles.get("libraries")!,
    ]) {
      element.setAttribute("data-write", "");
    }
    // A file without diagrams has nothing to place, connect, arrange, play or export
    // (`no-diagram`): New diagram stays.
    for (const element of [
      beforePalette,
      ...palette,
      more,
      relationSplit,
      connect,
      note,
      fragment,
      divider,
      delay,
      addEntity,
      arrange,
      this.playButton,
      exportButton,
      this.toggles.get("pointer")!,
    ]) {
      element.setAttribute("data-drawing", "");
    }
    this.syncShapeButtons();
    this.syncToggles();
  }

  /**
   * The arrow part of a split button: a dropdown as tall as the button, with a chevron in the
   * text's colour, that opens a grid or a menu. It is named by its menu (`label`), titled with what
   * its key does (`shown`, "F" or "R cycles") and says the key (`key`) to assistive technology; a
   * menu without a key of its own (the pen's, the sticky notes' colours) is titled by its name.
   */
  private splitArrow(
    label: string,
    shown: string | undefined,
    key: string | undefined,
    open: (arrow: HTMLButtonElement) => void,
  ): HTMLButtonElement {
    const chevron = s(
      "svg",
      {
        class: "chevron",
        width: 10,
        height: 6,
        viewBox: "0 0 10 6",
        "aria-hidden": "true",
        focusable: "false",
      },
      s("path", {
        d: "M1 1l4 4 4-4",
        fill: "none",
        stroke: "currentColor",
        "stroke-width": 1.5,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      }),
    );
    const arrow = h(
      "button",
      {
        type: "button",
        class: "split-arrow",
        title: shown ? `${label} (${shown})` : label,
        "aria-label": label,
        "aria-keyshortcuts": key,
        "aria-expanded": "false",
        // What chooses a shape or a kind of arrow writes nothing yet, but it arms a tool that does.
        "data-write": "",
      },
      chevron,
    );
    arrow.addEventListener("click", () => open(arrow));
    return arrow;
  }

  /**
   * A right-click, or a press held for `LONG_PRESS_MS`, on the main part of a split button opens
   * its menu (`open` opens it, or keeps it open, and says whether it is open); the click that ends
   * a held press arms nothing. A short click still arms the tool.
   */
  private holdOpens(main: HTMLButtonElement, open: () => boolean): void {
    let timer: number | undefined;
    const stop = () => {
      window.clearTimeout(timer);
      timer = undefined;
    };
    main.addEventListener("pointerdown", (e) => {
      stop();
      this.held = undefined;
      if (e.button !== 0 || this.readOnly) return;
      timer = window.setTimeout(() => {
        timer = undefined;
        if (open()) this.held = main;
      }, LONG_PRESS_MS);
    });
    // Released, cancelled, or dragged away towards the canvas: a click or a drop, not a hold.
    for (const type of ["pointerup", "pointercancel", "pointerleave"] as const) {
      main.addEventListener(type, stop);
    }
    // Before the click that arms the tool.
    main.addEventListener(
      "click",
      (e) => {
        if (this.held !== main) return;
        this.held = undefined;
        e.stopImmediatePropagation();
      },
      { capture: true },
    );
    main.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      stop();
      if (!this.readOnly) open();
    });
  }

  /**
   * The box (free) or node (flow) button split in two: the main part arms the tool with the current
   * shape and shows its picture; the arrow opens the grid of shapes, where a choice becomes current
   * and arms the tool.
   */
  private shapesSplit(
    main: HTMLButtonElement,
    kind: PaletteKind,
    profile: string | undefined,
  ): HTMLElement {
    this.shapeButtons.set(kind, main);
    const arrow = this.splitArrow(messages().toolbar.shapeMenu, "F", "F", (button) =>
      this.openShapes("arm", button),
    );
    arrow.setAttribute("aria-haspopup", "dialog");
    arrow.setAttribute("aria-controls", "mdg-shapes");
    arrow.setAttribute("data-shapes", kind);
    this.holdOpens(main, () => {
      if (!this.shapeGrid.isOpen) this.openShapes("arm", arrow);
      return this.shapeGrid.isOpen;
    });
    return h("div", { class: "split", "data-split": kind, "data-profile": profile }, main, arrow);
  }

  /**
   * The relation tool split in two: the main part arms it with the current kind of arrow; the
   * arrow part opens the kinds (`->`, `-->`, `<->`, `<-->`; one-way in C4 views), where a choice
   * becomes current and arms the tool. Sequence diagrams have messages, and no arrow part.
   */
  private arrowSplit(main: HTMLButtonElement): HTMLElement {
    const words = messages().toolbar;
    const arrow = this.splitArrow(words.arrowMenu, words.arrowMenuKey, "R", (button) =>
      this.openArrowKinds(button),
    );
    arrow.setAttribute("aria-haspopup", "menu");
    arrow.setAttribute("data-arrow-kinds", "");
    arrow.setAttribute("data-not-profile", "sequence");
    const open = () => this.menu.isOpen && arrow.getAttribute("aria-expanded") === "true";
    this.holdOpens(main, () => {
      if (!open()) this.openArrowKinds(arrow);
      return open();
    });
    return h("div", { class: "split", "data-split": "relation" }, main, arrow);
  }

  /**
   * The group tool split in two: the main part arms it with the current kind of group; the arrow
   * part offers a group with a title and an untitled container, and on free diagrams a column and
   * a row, where a choice becomes current and arms the tool. Sequence diagrams have groups of
   * participants only, and no arrow part.
   */
  private groupSplit(main: HTMLButtonElement): HTMLElement {
    this.groupButton = main;
    const arrow = this.splitArrow(messages().toolbar.groupMenu, "G", "G", (button) =>
      this.openGroupKinds(button),
    );
    this.groupArrow = arrow;
    arrow.setAttribute("aria-haspopup", "menu");
    arrow.setAttribute("data-group-kinds", "");
    arrow.setAttribute("data-not-profile", "sequence");
    const open = () => this.menu.isOpen && arrow.getAttribute("aria-expanded") === "true";
    this.holdOpens(main, () => {
      if (!open()) this.openGroupKinds(arrow);
      return open();
    });
    return h(
      "div",
      { class: "split", "data-split": "group", "data-not-profile": "c4" },
      main,
      arrow,
    );
  }

  /** The menu of the kinds of group, each with its picture, the current one checked. */
  private openGroupKinds(button: HTMLButtonElement): void {
    if (this.readOnly || this.storyPanel.active || !this.render) return;
    if (this.render.profile === "sequence" || this.render.profile === "c4") return;
    // A second press closes the kinds.
    if (this.menu.isOpen && button.getAttribute("aria-expanded") === "true") {
      this.menu.close();
      return;
    }
    const names = messages().toolbar.groupKinds;
    const base = this.main.getBoundingClientRect();
    const rect = (button.closest(".split") ?? button).getBoundingClientRect();
    const current = this.groupKindNow;
    const item = (kind: GroupKind): MenuItem => {
      const picture = icon(GROUP_ICONS[kind]);
      picture.setAttribute("width", "16");
      picture.setAttribute("height", "16");
      return {
        label: names[kind],
        picture,
        checked: kind === current,
        data: { "data-group-kind": kind },
        run: () => {
          this.groupKind = kind;
          this.syncGroupButton();
          this.arm("group");
        },
      };
    };
    button.setAttribute("aria-expanded", "true");
    this.menu.open(
      [
        item("group"),
        item("container"),
        // The lists, which place what they hold, apart from the groups that hold it where it is.
        ...(this.render.profile === "free" ? ["-" as const, item("column"), item("row")] : []),
      ],
      { x: rect.left - base.left, y: 0 },
      base,
      () => button.setAttribute("aria-expanded", "false"),
    );
  }

  /** The kind of group G creates on the diagram shown: a column or a row on free diagrams only. */
  private get groupKindNow(): GroupKind {
    const lists = this.groupKind === "column" || this.groupKind === "row";
    return lists && this.render?.profile !== "free" ? "group" : this.groupKind;
  }

  /**
   * The group button shows the kind of group it creates on the diagram shown: its picture and its
   * name; its arrow names the kinds it offers there.
   */
  private syncGroupButton(): void {
    const button = this.groupButton;
    if (!button) return;
    const words = messages();
    const kind = this.groupKindNow;
    const name = kind === "group" ? words.palette.tools.group : words.toolbar.groupKinds[kind];
    const label = words.palette.hint(name);
    if (button.dataset.groupKind !== kind) button.replaceChildren(icon(GROUP_ICONS[kind]));
    button.title = `${name} (G)`;
    button.setAttribute("aria-label", label);
    button.dataset.groupKind = kind;
    const arrow = this.groupArrow;
    if (arrow) {
      const menu =
        this.render?.profile === "free" ? words.toolbar.groupMenuLists : words.toolbar.groupMenu;
      arrow.title = `${menu} (G)`;
      arrow.setAttribute("aria-label", menu);
    }
  }

  /**
   * The pen tool split in two (free diagrams): the main part arms the pen or the highlighter,
   * whichever was chosen last, and shows its picture over a bar of its colour; the arrow part opens
   * the pen menu (Pen, Highlighter, the widths and the colours). A long press or a right-click on
   * the main part opens the menu too.
   */
  private penSplit(): HTMLElement {
    const words = messages();
    const main = this.button(
      words.palette.tools.pen,
      ICONS.pen,
      () => this.arm(this.penChoice.tool),
      "P",
    );
    main.classList.add("pen-button");
    this.penButton = main;
    const arrow = this.splitArrow(words.toolbar.penMenu, undefined, undefined, (button) =>
      this.togglePenMenu(button),
    );
    arrow.setAttribute("aria-haspopup", "dialog");
    arrow.setAttribute("aria-controls", "mdg-pen");
    arrow.setAttribute("data-pen-menu", "");
    this.holdOpens(main, () => {
      if (!this.penMenu.isOpen) this.openPenMenu(arrow);
      return this.penMenu.isOpen;
    });
    this.syncPenButton();
    return h("div", { class: "split", "data-split": "pen", "data-profile": "free" }, main, arrow);
  }

  /** The choices of the pen menu, as kept with the canvas's state. */
  private get penChoice(): PenChoice {
    return readPenChoice(this.local.pen);
  }

  /**
   * The colour a pen colour stands for on this diagram: a token (`@ink`) through the theme's
   * swatches the render carries, a colour of one's own as it is.
   */
  private colourOf(colour: string): string {
    if (!colour.startsWith("@")) return colour;
    const token = colour.slice(1);
    return (
      this.render?.swatches?.find((s) => s.token === token)?.color ??
      FALLBACK_TOKENS[token] ??
      this.render?.colors?.accent ??
      FALLBACK_TOKENS.ink!
    );
  }

  /** The pen button shows the pen or the highlighter, whichever it arms, over its colour. */
  private syncPenButton(): void {
    const button = this.penButton;
    if (!button) return;
    const choice = this.penChoice;
    const name = messages().palette.tools[choice.tool];
    const key = choice.tool === "pen" ? "P" : "H";
    button.replaceChildren(
      icon(ICONS[choice.tool]),
      h("span", {
        class: "pen-swatch",
        "aria-hidden": "true",
        style: `background:${this.colourOf(toolColour(choice))}`,
      }),
    );
    button.title = `${name} (${key})`;
    button.setAttribute("aria-label", name);
    button.setAttribute("aria-keyshortcuts", key);
    button.dataset.tool = choice.tool;
    button.setAttribute("aria-pressed", String(this.tool === choice.tool));
  }

  /** The pen menu under the pen button, or closed when it is open. */
  private togglePenMenu(arrow: HTMLButtonElement): void {
    if (this.penMenu.isOpen) {
      this.penMenu.close();
      return;
    }
    this.openPenMenu(arrow);
  }

  /** Opens the pen menu under the pen button: free diagrams that edit, outside story mode. */
  private openPenMenu(arrow: HTMLButtonElement): void {
    if (this.readOnly || this.storyPanel.active || this.render?.profile !== "free") return;
    this.menu.close();
    this.shapeGrid.close(false);
    this.iconPicker.close(false);
    const base = this.main.getBoundingClientRect();
    const rect = (arrow.closest(".split") ?? arrow).getBoundingClientRect();
    this.penMenu.open({
      at: { x: rect.left - base.left, y: 0 },
      bounds: base,
      opener: arrow,
      choice: this.penChoice,
      swatches: this.render.swatches ?? [],
      change: (next) => this.choosePen(next),
    });
  }

  /**
   * A choice of the pen menu: kept with the canvas's state, shown on the pen button and the
   * cursor, and its tool armed at once (the menu keeps the keyboard), so the next press draws.
   */
  private choosePen(next: PenChoice): void {
    this.persist({ pen: next });
    this.syncPenButton();
    if (this.tool !== next.tool) this.arm(next.tool, false);
    else this.syncPointerCursor();
  }

  /**
   * The sticky note tool split in two (free diagrams): the main part adds a sticky note near the
   * centre with its editor open, or, dragged onto the canvas, where it is dropped; it shows a card
   * of the colour it adds. The arrow part picks that colour: the theme's, or one of six colours of
   * paper. A long press or a right-click on the main part opens the colours too.
   */
  private stickySplit(key: string): HTMLElement {
    const words = messages();
    const main = this.button(
      words.sticky.button,
      ICONS.sticky,
      () => this.createSticky(),
      key,
      words.palette.tools.sticky,
    );
    main.classList.add("sticky-button");
    main.setAttribute("data-sticky-tool", "");
    main.setAttribute("aria-keyshortcuts", key);
    main.addEventListener("pointerdown", (e) => this.paletteDrag(e, "sticky"));
    this.stickyButton = main;
    const arrow = this.splitArrow(words.toolbar.stickyMenu, undefined, undefined, (button) =>
      this.openStickyColours(button),
    );
    arrow.setAttribute("aria-haspopup", "menu");
    arrow.setAttribute("data-sticky-colours", "");
    const open = () => this.menu.isOpen && arrow.getAttribute("aria-expanded") === "true";
    this.holdOpens(main, () => {
      if (!open()) this.openStickyColours(arrow);
      return open();
    });
    this.syncStickyButton();
    return h(
      "div",
      { class: "split", "data-split": "sticky", "data-profile": "free" },
      main,
      arrow,
    );
  }

  /** The colour of the sticky notes the button adds, as kept with the canvas's state. */
  private get stickyFill(): StickyFill {
    return readStickyFill(this.local.sticky);
  }

  /** The colour a sticky note is drawn in when its fill is `fill`: the theme's for null. */
  private stickyColour(fill: StickyFill): string {
    return fill ?? this.colourOf("@sticky");
  }

  /** The sticky note button shows a card of the colour it adds, and names a colour of paper. */
  private syncStickyButton(): void {
    const button = this.stickyButton;
    if (!button) return;
    const fill = this.stickyFill;
    const words = messages().sticky;
    const name = fill === null ? undefined : stickyColourName(fill);
    const label = name === undefined ? words.button : words.coloured(name);
    // Short like the palette's titles ("Node (N)"); the name says what a click does.
    const shown = name === undefined ? messages().palette.tools.sticky : words.shortColoured(name);
    const colour = this.stickyColour(fill);
    // The card already shown moves to its new colour; the button's first sync draws it.
    const card = button.querySelector<SVGSVGElement>("svg[data-sticky]");
    if (card) repaintSticky(card, colour);
    else button.replaceChildren(stickyGlyph(colour));
    button.title = `${shown} (S)`;
    button.setAttribute("aria-label", label);
    button.dataset.fill = fill ?? "";
  }

  /**
   * The colours of new sticky notes under the sticky note button: the theme's, then the six
   * colours of paper, each with its card and name, the current one checked. A second press closes
   * them.
   */
  private openStickyColours(button: HTMLButtonElement): void {
    if (this.readOnly || this.storyPanel.active || this.render?.profile !== "free") return;
    if (this.menu.isOpen && button.getAttribute("aria-expanded") === "true") {
      this.menu.close();
      return;
    }
    this.penMenu.close(false);
    this.shapeGrid.close(false);
    this.iconPicker.close(false);
    const words = messages().sticky;
    const current = this.stickyFill;
    const base = this.main.getBoundingClientRect();
    const rect = (button.closest(".split") ?? button).getBoundingClientRect();
    const item = (fill: StickyFill, label: string): MenuItem => ({
      label,
      picture: stickyGlyph(this.stickyColour(fill)),
      checked: fill === current,
      data: { "data-sticky-fill": fill ?? "" },
      run: () => this.chooseStickyFill(fill),
    });
    button.setAttribute("aria-expanded", "true");
    this.menu.open(
      [
        item(null, words.themeColour),
        "-",
        ...STICKY_COLOURS.map((colour) => item(colour.hex, words.colours[colour.name])),
      ],
      { x: rect.left - base.left, y: 0 },
      base,
      () => button.setAttribute("aria-expanded", "false"),
    );
  }

  /** A colour of the sticky note menu: kept with the canvas's state and shown on the button. */
  private chooseStickyFill(fill: StickyFill): void {
    this.persist({ sticky: { fill } });
    this.syncStickyButton();
    this.announce(
      messages().announcements.stickyColour(
        fill === null ? null : (stickyColourName(fill) ?? fill),
      ),
    );
  }

  /**
   * Adds a sticky note of the button's colour (`fill` written only for a colour of paper) at `at`,
   * or in a free cell near the centre (S, a click on the button); its editor opens when it is
   * drawn, and its drawing pops in. A tool in the hand is put away: the next press types.
   */
  private createSticky(at?: Point): void {
    if (this.render?.profile !== "free") return;
    this.setPointing(false);
    if (this.tool !== undefined) this.arm(undefined);
    const point =
      at ??
      freeCell(
        [...this.elements.values()].map((e) => e.box),
        this.diagramOf(this.centre()),
        DEFAULT_SIZES.sticky,
        this.settings.grid,
      );
    const fill = this.stickyFill;
    if (this.create("sticky", point, fill === null ? {} : { fill })) {
      this.popping = performance.now();
    }
  }

  /** The kind of arrow the relation tool creates on this diagram, or none on a sequence. */
  private currentArrowKind(): ArrowKind | undefined {
    const profile = this.render?.profile ?? "flow";
    return arrowKinds(profile).length === 0 ? undefined : arrowKindIn(this.arrowKind, profile);
  }

  /** The menu of the kinds of arrow, each with its picture, the current one checked. */
  private openArrowKinds(button: HTMLButtonElement): void {
    if (this.readOnly || this.storyPanel.active || !this.render) return;
    const kinds = arrowKinds(this.render.profile);
    // Sequence diagrams send messages: no kinds of arrow.
    if (kinds.length === 0) return;
    const current = this.currentArrowKind();
    const names = messages().arrowKinds;
    // A second press closes the kinds.
    if (this.menu.isOpen && button.getAttribute("aria-expanded") === "true") {
      this.menu.close();
      return;
    }
    const base = this.main.getBoundingClientRect();
    const rect = (button.closest(".split") ?? button).getBoundingClientRect();
    button.setAttribute("aria-expanded", "true");
    this.menu.open(
      kinds.map((kind) => ({
        label: names[kind],
        key: kind,
        picture: glyph("arrow", kind),
        checked: kind === current,
        data: { "data-kind": kind },
        run: () => {
          this.arrowKind = kind;
          if (this.tool === "relation") this.announceArrowKind();
          else this.command("relationTool");
          this.drawOverlay();
        },
      })),
      { x: rect.left - base.left, y: 0 },
      base,
      () => button.setAttribute("aria-expanded", "false"),
    );
  }

  /** The menu of New diagram: the kinds of diagram it adds to the file. */
  private openNewDiagram(button: HTMLButtonElement): void {
    if (this.readOnly || this.storyPanel.active) return;
    // A second press closes the menu.
    if (this.menu.isOpen && button.getAttribute("aria-expanded") === "true") {
      this.menu.close();
      return;
    }
    const base = this.main.getBoundingClientRect();
    const rect = button.getBoundingClientRect();
    const words = messages().diagrams;
    button.setAttribute("aria-expanded", "true");
    this.menu.open(
      CREATABLE.map((type) => ({
        label: words[type],
        picture: diagramIcon(type),
        data: { "data-create": type },
        run: () => this.createDiagram(type),
      })),
      { x: rect.left - base.left, y: 0 },
      base,
      () => button.setAttribute("aria-expanded", "false"),
    );
  }

  /** Says which kind of arrow the armed relation tool creates, then what to click. */
  private announceArrowKind(): void {
    const kind = this.currentArrowKind();
    const words = messages().announcements;
    const next = this.relationFrom
      ? words.fromSource(
          this.relationFrom,
          kind !== undefined && arrowKindLine(kind).line === "dashed",
        )
      : words.pickSource;
    this.announce(kind ? `${words.arrowKind(kind)} ${next}` : next);
  }

  /**
   * Opens the grid of shapes on a flow or free diagram: from the arrow of the box or node button
   * (`arm`: the shape chosen becomes current and arms the tool), or from F (`create`: the shape
   * chosen becomes current and is created near the centre). Nothing opens on a canvas that only
   * shows, or in story mode.
   */
  private openShapes(choice: "arm" | "create", opener?: HTMLButtonElement): void {
    const profile = this.render?.profile;
    if (this.readOnly || this.storyPanel.active || (profile !== "free" && profile !== "flow")) {
      return;
    }
    if (this.shapeGrid.isOpen) {
      this.shapeGrid.close();
      return;
    }
    const kind: ElementKind = profile === "free" ? "box" : "node";
    // Below the box or node button, also for F; at the corner when the button is not shown.
    const anchor = opener ?? this.shapeButtons.get(kind);
    const base = this.main.getBoundingClientRect();
    const shown = anchor !== undefined && anchor.offsetParent !== null;
    const rect = shown ? (anchor.closest(".split") ?? anchor).getBoundingClientRect() : undefined;
    this.shapeGrid.open({
      at: rect ? { x: rect.left - base.left, y: 0 } : { x: 8, y: 0 },
      bounds: base,
      current: this.shape,
      opener,
      choose: (shape) => {
        // An icon shape needs its icon: the picker opens to place one as the shape.
        if (shape === "icon") {
          this.setPlacement("icon");
          this.openIconPicker(rect ? { x: rect.left - base.left, y: 4 } : { x: 8, y: 4 }, []);
          return;
        }
        this.shape = shape;
        this.syncShapeButtons();
        if (choice === "arm") this.armShape(kind);
        else this.createShape(kind);
      },
    });
  }

  /** Arms the box or node tool with the current shape; an armed tool stays armed. */
  private armShape(kind: ElementKind): void {
    if (this.tool !== kind) {
      this.arm(kind);
      return;
    }
    this.announce(this.placeWords(kind));
    this.stage.focus();
    this.drawOverlay();
  }

  /** Creates a box or node of the current shape in a free cell near the centre: B, N and F. */
  private createShape(kind: ElementKind): void {
    const at = freeCell(
      [...this.elements.values()].map((e) => e.box),
      this.diagramOf(this.centre()),
      shapeSize(this.shape),
      this.settings.grid,
    );
    this.create(kind, at, { shape: this.shape });
  }

  /** What the status line says while a tool waits for a click: its shape, for boxes and nodes. */
  private placeWords(kind: ElementKind): string {
    const words = messages().announcements;
    return SHAPED_TOOLS.has(kind) && this.shape !== "rounded"
      ? words.placeShape(kind, this.shape)
      : words.place(kind);
  }

  /** The box and node buttons show the current shape: its picture, and its name in the label. */
  private syncShapeButtons(): void {
    const words = messages().palette;
    for (const [kind, button] of this.shapeButtons) {
      const entry = PALETTE.find((p) => p.kind === kind)!;
      const name = words.tools[entry.kind];
      // The default shape keeps the plain label of the tool.
      const label = this.shape === "rounded" ? words.hint(name) : words.shaped(name, this.shape);
      const shown = this.shape === "rounded" ? name : words.shapedTool(name, this.shape);
      button.replaceChildren(shapeIcon(this.shape));
      button.title = `${shown} (${entry.key})`;
      button.setAttribute("aria-label", label);
      button.dataset.shape = this.shape;
    }
  }

  private syncToggles(): void {
    const states: Record<string, boolean> = {
      grid: this.showGrid,
      snap: this.snap,
      minimap: this.showMinimap,
      inspector: this.showInspector,
      layers: this.showLayers,
      libraries: this.showLibraries,
      pointer: this.pointing,
    };
    for (const [name, button] of this.toggles)
      button.setAttribute("aria-pressed", String(states[name]));
    // The theme panel takes the inspector's place while it is open, and folds with it to the
    // inspector's rail; without a drawing there are no properties and no rail.
    const collapsed = !this.showInspector;
    this.inspector.element.hidden = this.noDiagram || (this.themePanel.open && !collapsed);
    this.themePanel.element.hidden = !this.themePanel.open || collapsed;
    this.inspector.setCollapsed(collapsed);
    this.layersPanel.element.hidden = !this.showLayers || !this.layersAllowed;
    this.libraryPanel.element.hidden = !this.showLibraries || !this.layersAllowed;
    for (const button of this.toolbar.querySelectorAll<HTMLButtonElement>("[data-tool]")) {
      button.setAttribute("aria-pressed", String(button.dataset.tool === this.tool));
    }
  }

  private updateToolbar(): void {
    const r = this.render!;
    const words = messages();
    this.toolbar.classList.remove("no-diagram");
    this.modeBadge.hidden = false;
    clear(this.diagramSelect);
    for (const d of r.diagrams) {
      this.diagramSelect.append(
        h(
          "option",
          { value: d.id, selected: d.id === r.diagram },
          d.title ? `${d.id} — ${d.title}` : d.id,
        ),
      );
    }
    this.diagramSelect.hidden = r.diagrams.length < 2;
    clear(this.scenarioSelect);
    this.scenarioSelect.append(
      h("option", { value: "", selected: r.scenario === null }, words.toolbar.allEvents),
    );
    for (const scenario of r.scenarios) {
      this.scenarioSelect.append(
        h(
          "option",
          { value: scenario.id, selected: scenario.id === r.scenario },
          scenario.label === scenario.id ? scenario.id : `${scenario.id} — ${scenario.label}`,
        ),
      );
    }
    this.scenarioSelect.hidden = r.scenarios.length === 0;
    this.showPlayButton(r);
    for (const button of this.toolbar.querySelectorAll<HTMLButtonElement>("[data-profile]")) {
      button.hidden = !forProfile(button.dataset.profile ?? "", r.profile);
    }
    this.declaredTools(r.tools ?? [], r.profile);
    for (const button of this.toolbar.querySelectorAll<HTMLButtonElement>("[data-not-profile]")) {
      button.hidden = button.dataset.notProfile === r.profile;
    }
    const relationLabel = r.profile === "sequence" ? words.toolbar.message : words.toolbar.relation;
    this.relationButton.title =
      r.profile === "sequence"
        ? words.toolbar.relationTitle(relationLabel)
        : words.toolbar.relationKindsTitle(relationLabel);
    this.relationButton.setAttribute("aria-label", relationLabel);
    if (this.tool === "relation" && this.relationFrom && !this.elements.has(this.relationFrom)) {
      this.arm(undefined);
    }
    // The pen, the highlighter and the eraser draw on free diagrams only; their colours follow
    // the theme of the diagram shown.
    if (isDrawing(this.tool) && r.profile !== "free") this.arm(undefined);
    if (r.profile === "free") this.penMenu.sync(this.penChoice, r.swatches ?? []);
    else this.penMenu.close(false);
    this.syncPenButton();
    // The sticky note button shows the theme's colour of paper when it adds that one.
    this.syncStickyButton();
    // Columns and rows are free diagrams' only: elsewhere the group button creates a group.
    this.syncGroupButton();
    if (isDrawing(this.tool)) this.syncPointerCursor();
    if (this.tool && this.tool !== "relation" && !isDrawing(this.tool)) {
      const entry = PALETTE.find((p) => p.kind === this.tool);
      const sequenceKind = MORE_PARTICIPANTS.some((kind) => kind === this.tool);
      if (
        (entry?.profile && !forProfile(entry.profile, r.profile)) ||
        (sequenceKind && r.profile !== "sequence")
      ) {
        this.arm(undefined);
      }
    }
    if (r.profile === "sequence") {
      this.modeBadge.textContent = r.scenario === null ? words.mode.sequence : words.mode.preview;
      this.modeBadge.title =
        r.scenario === null ? words.mode.sequenceTitle : words.mode.previewTitle;
      return;
    }
    this.modeBadge.textContent = words.mode.layout(r.mode);
    this.modeBadge.title =
      r.mode === "auto"
        ? words.mode.auto
        : r.mode === "assisted"
          ? words.mode.assisted
          : words.mode.manual;
  }

  private syncZoomSelect(): void {
    const zoom = this.viewport.zoom;
    const preset = ZOOM_PRESETS.find((z) => Math.abs(z - zoom) < 1e-6);
    const custom = this.zoomSelect.querySelector<HTMLOptionElement>('option[value="custom"]')!;
    if (preset !== undefined) {
      this.zoomSelect.value = String(preset);
    } else {
      custom.textContent = messages().toolbar.percent(zoom);
      this.zoomSelect.value = "custom";
    }
  }

  // ------------------------------------------------------------------ input

  private listen(): void {
    const stage = this.stage;
    stage.addEventListener("pointerdown", (e) => this.pointerDown(e));
    stage.addEventListener("pointermove", (e) => this.pointerMove(e));
    // Where the pointer is goes to a host that shares presence, whatever the gesture.
    stage.addEventListener("pointermove", (e) => this.sharePointer(e));
    stage.addEventListener("pointerup", (e) => this.pointerUp(e));
    stage.addEventListener("pointercancel", (e) => {
      if (e.pointerId === this.stylus) this.stylus = undefined;
      // A touch let go of while a stylus draws (a palm) leaves the stroke alone.
      const drag = this.drag;
      if ((drag?.kind === "penDraw" || drag?.kind === "erase") && drag.pointer !== e.pointerId) {
        return;
      }
      this.resetPreview();
    });
    stage.addEventListener("dblclick", (e) => this.doubleClick(e));
    stage.addEventListener("wheel", (e) => this.wheel(e), { passive: false });
    stage.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (this.storyPanel.active || this.pointing) return;
      // A stylus's barrel button erases with the pen in the hand: it opens no menu.
      if (this.stylusMenuShut(e)) return;
      const hit = this.hit(e.target);
      if (hit?.id && !this.selection.includes(hit.id)) this.select([hit.id]);
      this.openMenu(this.pointOf(e));
    });
    stage.addEventListener("keydown", (e) => this.keyDown(e));
    stage.addEventListener("keyup", (e) => {
      if (e.key === " ") {
        this.spaceDown = false;
        stage.classList.remove("space");
      }
    });
    stage.addEventListener("pointerleave", () => {
      this.sharePointer(undefined);
      if (!this.drag && this.borderStart) {
        this.borderStart = undefined;
        stage.classList.remove("connecting");
      }
      // No list is under a pointer that left; a selected one keeps its +.
      this.hoveredLists = [];
      this.listAddHover = undefined;
      this.drawOverlay();
    });
    // The stage never scrolls; a browser revealing a focused child must not shift it.
    stage.addEventListener("scroll", () => {
      stage.scrollLeft = 0;
      stage.scrollTop = 0;
    });
    // Links of the drawing (`url`) are for exports; on the canvas a click selects.
    stage.addEventListener("click", (e) => {
      if ((e.target as Element).closest?.("a")) e.preventDefault();
    });
    this.menu.element.addEventListener("keydown", (e) => {
      e.stopPropagation();
      this.menu.key(e);
    });
    this.minimap.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      this.minimap.setPointerCapture(e.pointerId);
      this.drag = { kind: "minimap" };
      this.panToMinimap(e);
    });
    this.minimap.addEventListener("pointermove", (e) => {
      if (this.drag?.kind === "minimap") this.panToMinimap(e);
    });
    this.minimap.addEventListener("pointerup", () => {
      this.drag = undefined;
    });
  }

  private panToMinimap(e: PointerEvent): void {
    const r = this.render;
    if (!r) return;
    const rect = this.minimap.getBoundingClientRect();
    const map = minimapViewport(
      { width: r.width, height: r.height },
      this.viewport,
      this.screen(),
      MINIMAP_SIZE,
    );
    this.setViewport(
      minimapToViewport(
        map,
        { x: e.clientX - rect.left, y: e.clientY - rect.top },
        this.viewport,
        this.screen(),
      ),
    );
  }

  /** What is under the pointer: a handle of the overlay, an element, a relation or its label. */
  private hit(
    target: EventTarget | null,
  ):
    | { kind: "element" | "relation" | "label" | "event" | "handle"; id: string; handle?: string }
    | undefined {
    if (!(target instanceof Element)) return undefined;
    const handle = target.closest("[data-handle]");
    if (handle)
      return {
        kind: "handle",
        id: handle.getAttribute("data-id")!,
        handle: handle.getAttribute("data-handle")!,
      };
    const label = target.closest('[data-role="label"]');
    if (label) {
      const relation = label.closest('[data-role="relation"]');
      // In sequence diagrams a message is dragged by its label too.
      if (relation && this.render?.profile !== "sequence") {
        return { kind: "label", id: relation.getAttribute("data-id")! };
      }
      // A free line's pill moves as a relation's label does.
      const owner = label.closest('[data-role="element"]')?.getAttribute("data-id");
      if (owner && this.elements.get(owner)?.line) return { kind: "label", id: owner };
      // The header of a fragment.
      const key = label.getAttribute("data-id")!;
      if (!relation && this.events.has(key)) return { kind: "event", id: key };
    }
    const owner = target.closest(
      '[data-role="element"], [data-role="relation"], [data-role="event"]',
    );
    if (!owner || !this.content.contains(owner)) return undefined;
    const id = owner.getAttribute("data-id")!;
    const role = owner.getAttribute("data-role");
    if (role === "event") return this.events.has(id) ? { kind: "event", id } : undefined;
    return role === "element" ? { kind: "element", id } : { kind: "relation", id };
  }

  /**
   * Whether the context menu a press raised stays shut: with the pen, the highlighter or the
   * eraser in the hand, a stylus's barrel button erases (a menu of a pointer of type `pen`, or one
   * that comes while a stylus erases or just after).
   */
  private stylusMenuShut(e: MouseEvent): boolean {
    if (!isDrawing(this.tool)) return false;
    if ((e as Partial<PointerEvent>).pointerType === "pen") return true;
    const at = this.stylusErasedAt;
    return at !== undefined && performance.now() - at < STYLUS_MENU_MS;
  }

  private pointerDown(e: PointerEvent): void {
    // Palm rejection: while a stylus is down, a touch is the hand resting on the screen.
    if (e.pointerType === "touch" && this.stylus !== undefined) return;
    // A stylus's barrel button (the second button, `buttons` 2) or its eraser end (`buttons` 32)
    // erases while the pen or the highlighter is armed; its context menu stays shut (`listen`).
    const eraserButton = isDrawing(this.tool) && stylusErases(e);
    if (eraserButton) this.stylusErasedAt = performance.now();
    this.menu.close();
    this.picker.close();
    if (this.inline) this.commitInline();
    const point = this.pointOf(e);
    this.pointer = point;
    if (e.button === 2 && !eraserButton) return;
    this.stage.focus({ preventScroll: true });
    this.stage.setPointerCapture(e.pointerId);
    if (e.button === 1 || (e.button === 0 && this.spaceDown)) {
      this.drag = { kind: "pan", start: point, viewport: this.viewport };
      this.stage.classList.add("panning");
      e.preventDefault();
      return;
    }
    if (e.button === 0 && this.storyPanel.active) {
      this.storyClick(e, e.shiftKey || e.ctrlKey || e.metaKey);
      return;
    }
    if ((e.button !== 0 && !eraserButton) || !this.render) return;
    // Pointing: the stroke is a trail, and nothing is pressed.
    if (this.pointing) {
      this.startLaser(this.diagramOf(point));
      e.preventDefault();
      return;
    }
    const at = this.diagramOf(point);
    // The pen, the highlighter and the eraser: whatever lies under the press, a stroke starts.
    if (isDrawing(this.tool)) {
      e.preventDefault();
      if (this.stale) {
        this.announce(messages().announcements.fixFirst, true);
        return;
      }
      if (e.pointerType === "pen") this.stylus = e.pointerId;
      if (this.tool === "eraser" || eraserButton) this.startErase(at, e.pointerId);
      else this.startStroke(this.tool, at, e);
      return;
    }
    if (this.tool === "relation") {
      const pressed = this.hit(e.target);
      if (this.drawsLine(pressed)) {
        // Empty canvas of a free diagram: a drag draws a line, a click keeps the tool's prompt.
        const start = this.snapPoint(at);
        const group = this.stackAt(at).find((el) => el.kind === "group");
        this.drag = {
          kind: "lineDraw",
          press: at,
          pressed,
          start,
          point: start,
          moving: false,
          ...(group ? { parent: group.id } : {}),
        };
        return;
      }
      this.relationClick(pressed, at, e.shiftKey);
      return;
    }
    const armed = this.tool === "icon" ? this.armedIcon : undefined;
    if (armed) {
      // On a shape that takes an icon, the click gives it the icon, as a drop does.
      const onto = this.stackAt(at).find((el) => el.takesIcon);
      this.arm(undefined);
      if (onto) this.giveIcon([onto.id], armed);
      else this.placeIcon(armed, at);
      return;
    }
    if (this.tool) {
      const kind = this.tool;
      this.arm(undefined);
      this.create(
        kind,
        at,
        SHAPED_TOOLS.has(kind)
          ? { shape: this.shape }
          : kind === "note"
            ? this.attachment(this.noteTargetAt(at))
            : {},
      );
      return;
    }
    const hit = this.hit(e.target);
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    if (hit?.kind === "handle" && hit.handle) {
      // A second press on the same handle, soon and in place, is a double click. The handle in
      // the middle of a relation is drawn by the first press on its label or its line: a press on
      // it after one of those is a double click on the relation too, which edits its label when
      // it is released in place (dragged, it adds a bend).
      const now = performance.now();
      const last = this.lastHandlePress;
      this.lastHandlePress = { id: hit.id, handle: hit.handle, time: now, point };
      const segment = hit.handle.startsWith("segment:");
      const double =
        last?.id === hit.id &&
        (last.handle === hit.handle || (segment && last.handle === RELATION_PRESS)) &&
        now - last.time < DOUBLE_CLICK_MS &&
        Math.hypot(last.point.x - point.x, last.point.y - point.y) < DOUBLE_CLICK_DISTANCE;
      if (double && this.handleDoubleClick(hit.id, hit.handle)) {
        this.lastHandlePress = undefined;
        return;
      }
      const [kind, arg] = hit.handle.split(":") as [string, string];
      if (kind === "linePoint" || kind === "lineSegment") {
        if (!this.elements.get(hit.id)?.line) return;
        this.drag = {
          kind: "linePoint",
          id: hit.id,
          part: kind === "lineSegment" ? "segment" : "point",
          index: Number(arg),
          start: at,
          point: at,
          moving: false,
        };
        return;
      }
      if (kind === "rotate") {
        const element = this.elements.get(hit.id)!;
        const angle = element.rotation ?? 0;
        this.drag = {
          kind: "rotate",
          id: hit.id,
          centre: centerOf(element.box),
          grab: at,
          from: angle,
          angle,
          moving: false,
        };
        return;
      }
      if (kind === "resize") {
        const element = this.elements.get(hit.id)!;
        // A stroke's frame is its bounds: the box its points are scaled from.
        const box = element.pen?.bounds ?? element.box;
        this.drag = {
          kind: "resize",
          id: hit.id,
          handle: arg as Handle,
          start: at,
          box,
          result: box,
        };
      } else if (kind === "connect") {
        this.drag = {
          kind: "connect",
          from: hit.id,
          side: arg as "north" | "south" | "east" | "west",
          point: at,
        };
      } else if (kind === "end") {
        this.drag = { kind: "end", relation: hit.id, end: arg as "from" | "to", point: at };
      } else {
        this.drag = {
          kind: kind as "bend" | "segment",
          relation: hit.id,
          index: Number(arg),
          start: at,
          point: at,
          moving: false,
          ...(double && segment ? { edit: true } : {}),
        };
      }
      return;
    }
    const sequence = this.render.profile === "sequence";
    if (sequence && (hit?.kind === "event" || hit?.kind === "relation")) {
      if (additive) {
        this.select(toggleSelection(this.selection, hit.id, true));
        return;
      }
      if (!this.selection.includes(hit.id)) this.select([hit.id]);
      const event = this.events.get(hit.id);
      if (event?.spaced && this.render.scenario === null && !this.readOnly) {
        this.drag = {
          kind: "event",
          key: hit.id,
          start: at,
          delta: 0,
          min: -event.space,
          moving: false,
        };
      }
      return;
    }
    if (hit?.kind === "element") {
      if (additive) {
        this.select(toggleSelection(this.selection, hit.id, true));
        return;
      }
      if (e.altKey) {
        this.altPress(hit.id, at);
        return;
      }
      if (!this.selection.includes(hit.id)) this.select([hit.id]);
      // A press on an element selects it; only a canvas that edits goes on to drag it.
      if (this.readOnly) return;
      const ids = this.selection.filter((id) => this.elements.has(id));
      this.drag = {
        kind: "move",
        start: at,
        primary: hit.id,
        ids,
        delta: { x: 0, y: 0 },
        guides: [],
        moving: false,
      };
      return;
    }
    if (hit?.kind === "label" || hit?.kind === "relation") {
      this.lastHandlePress = { id: hit.id, handle: RELATION_PRESS, time: performance.now(), point };
    }
    if (hit?.kind === "label") {
      this.select([hit.id]);
      if (this.readOnly) return;
      this.drag = {
        kind: "label",
        relation: hit.id,
        start: at,
        delta: { x: 0, y: 0 },
        moving: false,
      };
      return;
    }
    if (hit?.kind === "relation") {
      this.select(additive ? toggleSelection(this.selection, hit.id, true) : [hit.id]);
      return;
    }
    this.hoverBorder(at, e.altKey, hit !== undefined);
    const start = this.borderStart;
    if (start && !additive) {
      this.borderStart = undefined;
      this.stage.classList.remove("connecting");
      this.drag = {
        kind: "connect",
        from: start.element,
        start: start.attachment,
        point: start.attachment.point,
      };
      this.drawOverlay();
      return;
    }
    this.drag = {
      kind: "band",
      start: point,
      current: point,
      additive,
      base: additive ? this.selection : [],
    };
  }

  private pointerMove(e: PointerEvent): void {
    // A dragged icon follows the pointer on its own.
    if (this.iconDrag) return;
    const point = this.pointOf(e);
    this.pointer = point;
    const drag = this.drag;
    if (!drag) {
      // Pointing shows no connection handle and no border outline: nothing is about to be pressed.
      // The pen and the eraser show their cursor alone.
      if (this.pointing || isDrawing(this.tool)) return;
      if (this.tool) this.drawOverlay();
      else {
        // A list under the pointer shows its +.
        this.hoverLists(e);
        // Over a +, the pointer is on no border.
        if ((e.target as Element | null)?.closest?.(".list-add")) return;
        this.hoverBorder(this.diagramOf(point), e.altKey, this.hit(e.target) !== undefined);
      }
      return;
    }
    const at = this.diagramOf(point);
    const free = e.altKey;
    switch (drag.kind) {
      case "laser":
        this.laserPoint(at);
        return;
      case "penDraw":
        // Another pointer (a palm, a second finger) adds nothing to the stroke.
        if (e.pointerId === drag.pointer) this.strokeTo(drag, e);
        return;
      case "erase":
        if (e.pointerId === drag.pointer) this.eraseTo(drag, e);
        return;
      case "pan":
        this.setViewport({
          ...drag.viewport,
          x: drag.viewport.x + point.x - drag.start.x,
          y: drag.viewport.y + point.y - drag.start.y,
        });
        return;
      case "band":
        drag.current = point;
        break;
      case "move": {
        const raw = { x: at.x - drag.start.x, y: at.y - drag.start.y };
        if (!drag.moving && Math.hypot(raw.x, raw.y) * this.viewport.zoom < DRAG_THRESHOLD) return;
        if (this.stale) return;
        // Where the drawing puts what is dragged, before anything moves it: a drop into a list is
        // previewed in its new place, from which it is kept under the pointer.
        if (!drag.moving && this.render?.profile === "free") {
          drag.drawn = this.drawnCorners(this.withContents(drag.ids));
        }
        drag.moving = true;
        if (drag.pick !== undefined) {
          // An Alt+press that drags takes what it pressed on, as a plain press does.
          this.select([drag.pick]);
          delete drag.pick;
        }
        if (this.render?.profile === "sequence") {
          // Participants move sideways only, to a new place in the order.
          drag.delta = { x: Math.round(raw.x), y: 0 };
          drag.guides = [];
          this.followPointer();
          break;
        }
        if (this.elements.get(drag.primary)?.line) {
          // A free line moves by whole steps of the grid, so points drawn on it stay on it.
          const grid = this.settings.grid;
          const step = (value: number) =>
            free || !this.snap ? Math.round(value) : Math.round(value / grid) * grid;
          drag.delta = { x: step(raw.x), y: step(raw.y) };
          drag.guides = [];
          drag.target = undefined;
          drag.free = free;
          this.followPointer();
          this.requestPreview();
          break;
        }
        if (this.elements.get(drag.primary)?.pen) {
          // A stroke goes where the hand puts it, to a tenth as its points are written: no grid,
          // no guides, and it keeps its group (its points are written there).
          const tenth = (value: number) => Math.round(value * 10) / 10 || 0;
          drag.delta = { x: tenth(raw.x), y: tenth(raw.y) };
          drag.guides = [];
          drag.target = undefined;
          drag.free = free;
          this.followPointer();
          this.requestPreview();
          break;
        }
        const primary = this.elements.get(drag.primary)!.box;
        const others = [...this.elements.values()]
          .filter((el) => !drag.ids.includes(el.id) && el.kind !== "group")
          .map((el) => el.box);
        const resolved = resolveMove(primary, others, raw, {
          grid: this.settings.grid,
          snap: this.snap,
          guides: this.settings.guides && this.snap,
          zoom: this.viewport.zoom,
          free,
        });
        // Over a list, the selection goes where the pointer is among its children, off the grid
        // and the guides: the list places it. Alt keeps every parent, so no list takes it.
        const list = free ? undefined : this.listDrop(drag.ids, resolved.delta, at);
        const rounded = { x: Math.round(raw.x) || 0, y: Math.round(raw.y) || 0 };
        drag.list = list;
        drag.delta = list ? rounded : resolved.delta;
        drag.guides = list ? [] : resolved.guides;
        // Into a list, the bar and the room it makes show where: no outline over its cards.
        drag.target = free || list ? undefined : this.landingGroup(drag.ids, drag.delta);
        drag.free = free;
        this.followPointer();
        // Connectors, labels and groups follow as the drop will draw them.
        this.requestPreview();
        break;
      }
      case "resize": {
        const pen = this.elements.get(drag.id)?.pen;
        if (pen) {
          // A stroke's points scale about the opposite side or corner, off the grid; Shift keeps
          // its proportions. Its path follows on the overlay at once, the drawing with the preview.
          drag.result = penResize(
            drag.box,
            pen.width,
            drag.handle,
            { x: at.x - drag.start.x, y: at.y - drag.start.y },
            e.shiftKey,
          );
          this.requestPreview();
          break;
        }
        const turned = this.elements.get(drag.id)?.rotation;
        if (turned) {
          // In the element's own frame, its opposite edge kept where it is in the diagram.
          const delta = intoFrame(at, drag.box, turned);
          const start = intoFrame(drag.start, drag.box, turned);
          const local = resizeBox(
            drag.box,
            drag.handle,
            { x: delta.x - start.x, y: delta.y - start.y },
            {
              grid: this.settings.grid,
              snap: false,
              guides: false,
              zoom: this.viewport.zoom,
              free,
            },
          );
          const centre = outOfFrame(centerOf(local), drag.box, turned);
          drag.result = {
            x: centre.x - local.width / 2,
            y: centre.y - local.height / 2,
            width: local.width,
            height: local.height,
          };
        } else {
          drag.result = resizeBox(
            drag.box,
            drag.handle,
            { x: at.x - drag.start.x, y: at.y - drag.start.y },
            {
              grid: this.settings.grid,
              snap: this.snap,
              guides: false,
              zoom: this.viewport.zoom,
              free,
            },
          );
        }
        this.requestPreview();
        break;
      }
      case "rotate": {
        // Nothing turns before the pointer leaves the press, as a move waits for it.
        const away = Math.hypot(at.x - drag.grab.x, at.y - drag.grab.y) * this.viewport.zoom;
        if (!drag.moving && away < DRAG_THRESHOLD) return;
        // The turn since the grab, in steps of 15 degrees; Alt turns them off.
        const step = free ? undefined : ROTATION_STEP;
        const angle = turnedAngle(drag.from, drag.centre, drag.grab, at, step);
        if (angle === drag.angle && drag.moving) break;
        drag.angle = angle;
        drag.moving = true;
        this.turnDrawing(drag.id, angle);
        this.announce(messages().rotation.status(angle), false);
        this.requestPreview();
        break;
      }
      case "label":
        drag.delta = { x: Math.round(at.x - drag.start.x), y: Math.round(at.y - drag.start.y) };
        drag.moving =
          drag.moving ||
          Math.hypot(drag.delta.x, drag.delta.y) * this.viewport.zoom >= DRAG_THRESHOLD;
        if (drag.moving) this.previewLabel(drag.relation, drag.delta);
        break;
      case "bend":
      case "segment":
      case "linePoint":
        drag.point = free ? { x: Math.round(at.x), y: Math.round(at.y) } : this.snapPoint(at);
        drag.moving =
          drag.moving ||
          Math.hypot(at.x - drag.start.x, at.y - drag.start.y) * this.viewport.zoom >=
            DRAG_THRESHOLD;
        break;
      case "lineDraw": {
        // On the grid unless Alt is held; Shift keeps the line at a multiple of 45°.
        const grid = this.settings.grid;
        const round = (value: number) =>
          free || !this.snap ? Math.round(value) : Math.round(value / grid) * grid;
        drag.point = lineEnd(drag.start, at, e.shiftKey, round);
        if (
          !drag.moving &&
          Math.hypot(at.x - drag.press.x, at.y - drag.press.y) * this.viewport.zoom >=
            DRAG_THRESHOLD
        ) {
          drag.moving = true;
          this.announce(messages().announcements.drawingLine, false);
        }
        break;
      }
      case "end":
      case "connect": {
        const element = this.attachTarget(at, drag.kind === "connect" ? drag.from : undefined);
        if (element) {
          const attachment = this.attachOn(element, at, this.reach(free));
          drag.target = { element: element.id, attachment };
          drag.point = attachment.port === null ? at : attachment.point;
        } else {
          delete drag.target;
          drag.point = at;
        }
        break;
      }
      case "event": {
        const raw = at.y - drag.start.y;
        if (!drag.moving && Math.abs(raw) * this.viewport.zoom < DRAG_THRESHOLD) return;
        if (this.stale) return;
        drag.moving = true;
        // Snapped to the grid unless Alt is held, and never above the event's neighbour.
        const step = free || !this.snap ? 1 : this.settings.grid;
        drag.delta = Math.max(drag.min, Math.round(raw / step) * step);
        this.previewEvent(drag.key, drag.delta);
        break;
      }
      case "minimap":
        return;
    }
    this.drawOverlay();
  }

  private pointerUp(e: PointerEvent): void {
    if (e.pointerId === this.stylus) this.stylus = undefined;
    const drag = this.drag;
    this.stage.classList.remove("panning");
    if (this.stage.hasPointerCapture(e.pointerId)) this.stage.releasePointerCapture(e.pointerId);
    if (!drag) return;
    switch (drag.kind) {
      case "laser":
        this.endLaser();
        break;
      case "penDraw":
        // Only the pointer that draws ends its stroke.
        if (e.pointerId !== drag.pointer) return;
        this.drag = undefined;
        this.writeStroke(drag);
        return;
      case "erase":
        if (e.pointerId !== drag.pointer) return;
        // A stylus's barrel button raises its menu at the release: it stays shut.
        if (e.pointerType === "pen") this.stylusErasedAt = performance.now();
        this.drag = undefined;
        this.writeErased(drag);
        return;
      case "band": {
        const a = this.diagramOf(drag.start);
        const b = this.diagramOf(drag.current);
        if (
          Math.hypot(drag.current.x - drag.start.x, drag.current.y - drag.start.y) < DRAG_THRESHOLD
        ) {
          this.drag = undefined;
          this.select(drag.additive ? [...drag.base] : []);
          return;
        }
        const inside = selectInRect(
          this.extents(),
          { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y },
          new Map(
            [...this.relations.values()]
              .filter((x) => !this.isHidden(x.layer))
              .map((x) => [x.key, outlineOf(x)]),
          ),
        );
        this.drag = undefined;
        this.select([...new Set([...drag.base, ...inside])]);
        return;
      }
      case "move":
        if (drag.moving && drag.list && !e.altKey) {
          // Into a list, or within it: the declarations move to the position of the bar, with no
          // point. A drop that leaves the list as it is goes back, writing nothing.
          const list = drag.list;
          if (this.keepsList(drag.ids, list)) {
            this.resetPreview();
            return;
          }
          const sent = this.act({
            kind: "move",
            ids: drag.ids,
            parent: list.id,
            index: list.index,
          });
          if (!sent) {
            this.resetPreview();
            return;
          }
          const moved = this.outermost(drag.ids).map((e) => e.id);
          const children = this.elements.get(list.id)?.list?.children ?? [];
          const count = children.filter((id) => !moved.includes(id)).length + moved.length;
          this.announce(
            messages().announcements.movedInList(moved, list.id, list.index + 1, count),
          );
          // The drawing stays as the drag left it; its render glides what moved into its place.
          this.settling = { since: performance.now() };
          this.drag = undefined;
          this.endPreview();
          this.drawOverlay();
          return;
        }
        if (drag.moving && (drag.delta.x !== 0 || drag.delta.y !== 0)) {
          // The parent goes along only when it changes; Alt keeps every element's parent.
          const parent = e.altKey ? undefined : this.dropParent(drag.ids, drag.delta);
          const sent = this.act({
            kind: "move",
            ids: drag.ids,
            delta: drag.delta,
            ...(parent !== undefined ? { parent } : {}),
          });
          if (!sent) {
            this.resetPreview();
            return;
          }
          const words = messages().announcements;
          this.announce(
            parent !== undefined ? words.movedInto(drag.ids, parent) : words.moved(drag.ids),
          );
          // The drawing stays as the drag left it until the edit's render replaces it.
          this.drag = undefined;
          this.endPreview();
          this.drawOverlay();
          return;
        }
        if (drag.moving) this.resetPreview();
        else if (drag.below) {
          // An Alt+click: the shape below the one pressed on.
          this.drag = undefined;
          this.selectBelow(drag.start);
          return;
        }
        break;
      case "resize": {
        const changed =
          drag.result.width !== drag.box.width ||
          drag.result.height !== drag.box.height ||
          drag.result.x !== drag.box.x ||
          drag.result.y !== drag.box.y;
        this.endPreview();
        // The preview stays until the edit's render replaces it; a resize not sent shows the last
        // drawing again.
        if (!(changed && this.act({ kind: "resize", id: drag.id, box: drag.result }))) {
          if (this.previewShown) this.restoreDrawing();
        }
        break;
      }
      case "rotate": {
        this.endPreview();
        // The preview stays until the edit's render replaces it.
        const written =
          drag.moving &&
          drag.angle !== drag.from &&
          this.act({
            kind: "setField",
            ids: [drag.id],
            field: "style.rotation",
            value: drag.angle === 0 ? null : drag.angle,
          });
        if (!written) {
          this.resetPreview();
          return;
        }
        this.turnPending = { id: drag.id, angle: drag.angle };
        this.turnDrawing(drag.id, drag.angle, true);
        this.announce(messages().rotation.done(drag.id, drag.angle), false);
        break;
      }
      case "label":
        if (drag.moving)
          this.act({ kind: "moveLabel", relation: drag.relation, delta: drag.delta });
        break;
      case "bend":
      case "segment": {
        const relation = this.relations.get(drag.relation);
        if (relation && drag.moving)
          this.act({ kind: "setVia", relation: drag.relation, via: this.dragVia(drag, relation) });
        else if (relation && drag.edit) this.editLabel(drag.relation);
        break;
      }
      case "linePoint": {
        const element = this.elements.get(drag.id);
        if (!element?.line || !drag.moving) break;
        const points = this.draggedLine(drag, element);
        if (this.act({ kind: "setLinePoints", element: drag.id, ...linePointsOf(points) })) {
          const words = messages().announcements;
          this.announce(
            drag.part === "segment" ? words.lineBendAdded(drag.id) : words.lineReshaped(drag.id),
          );
        }
        break;
      }
      case "lineDraw": {
        this.drag = undefined;
        if (!drag.moving) {
          // A click: the tool's prompt, as on any empty canvas.
          this.relationClick(drag.pressed, drag.press, e.shiftKey);
          this.drawOverlay();
          return;
        }
        const { start: from, point: to } = drag;
        const words = messages().announcements;
        if (from.x === to.x && from.y === to.y) {
          this.announce(words.lineTooShort);
          this.drawOverlay();
          return;
        }
        const kind = this.currentArrowKind();
        const { line, heads } = kind
          ? arrowKindLine(kind, false)
          : { line: "solid" as const, heads: "end" as const };
        const sent = this.act({
          kind: "createLine",
          from,
          to,
          ...(drag.parent ? { parent: drag.parent } : {}),
          line,
          heads,
        });
        if (sent) {
          // The tool is done, as after a relation; the ghost fades while the line is drawn.
          this.arm(undefined);
          this.announce(words.lineDrawn(from, to));
          this.fadeLineGhost(from, to);
        }
        this.drawOverlay();
        return;
      }
      case "end":
        if (drag.target) {
          const { attachment, element } = drag.target;
          this.act({
            kind: "setEnd",
            relation: drag.relation,
            end: drag.end,
            element,
            port: attachment.port,
            ...(attachment.position !== undefined ? { position: attachment.position } : {}),
          });
          this.announce(
            attachment.port === null
              ? messages().announcements.endFree(drag.relation)
              : messages().announcements.endPinned(
                  drag.relation,
                  element,
                  attachment.port,
                  attachment.position,
                ),
          );
        }
        break;
      case "connect":
        if (drag.target) {
          const { attachment, element } = drag.target;
          // Sequence messages and C4 relations have no routes to pin.
          const pinnable = this.render?.profile === "flow" || this.render?.profile === "free";
          const end = pinnable && attachment.port !== null ? attachment : undefined;
          const start =
            pinnable && drag.start?.port
              ? drag.start
              : end && drag.side
                ? { port: drag.side, position: 50 }
                : undefined;
          const pinned = {
            ...(start?.port ? { fromPort: start.port } : {}),
            ...(start?.position !== undefined ? { fromPosition: start.position } : {}),
            ...(end?.port ? { toPort: end.port } : {}),
            ...(end?.position !== undefined ? { toPosition: end.position } : {}),
          };
          // Shift dashes the line, except in a C4 view, whose model writes `->` alone.
          this.act({
            kind: "connect",
            from: drag.from,
            to: element,
            line: e.shiftKey && this.render?.profile !== "c4" ? "dashed" : "solid",
            ...(Object.keys(pinned).length > 0 ? { pinned } : {}),
          });
        }
        break;
      case "event":
        if (drag.moving && drag.delta !== 0) {
          this.act({ kind: "move", ids: [drag.key], delta: { x: 0, y: drag.delta } });
          this.announce(messages().announcements.eventMoved(drag.key, drag.delta));
          this.drag = undefined;
          this.drawOverlay();
          return;
        }
        if (drag.moving) this.resetPreview();
        break;
      default:
        break;
    }
    this.drag = undefined;
    this.drawOverlay();
  }

  private dragVia(
    drag: { kind: "bend" | "segment"; index: number; point: Point },
    relation: RelationInfo,
  ): Point[] {
    return drag.kind === "bend"
      ? withBendMoved(relation.via, drag.index, drag.point)
      : withBendInserted(relation.via, drag.index, drag.point);
  }

  private previewLabel(relation: string, delta: Point): void {
    const svg = this.content.querySelector("svg");
    const id = cssEscape(relation);
    const g = svg?.querySelector(
      `g[data-id="${id}"][data-role="relation"] [data-role="label"], g[data-id="${id}"][data-role="element"] [data-role="label"]`,
    );
    g?.setAttribute("transform", `translate(${delta.x} ${delta.y})`);
  }

  /** The reach of a dragged end, in diagram units at the current zoom. */
  private reach(free: boolean): { border: number; magnet: number; free: boolean } {
    const zoom = this.viewport.zoom;
    return { border: BORDER_REACH / zoom, magnet: MAGNET_REACH / zoom, free };
  }

  /**
   * The box a dragged end attaches to: the frontmost one whose shape is under the pointer, or the
   * one whose outline is near. Over the box the line starts from, only another box's outline.
   */
  private attachTarget(point: Point, except?: string): ElementInfo | undefined {
    const stack = this.stackAt(point).filter((e) => e.kind !== "group");
    const under = stack[0];
    if (under && under.id !== except) return under;
    return this.nearestOutline(
      point,
      BORDER_REACH / this.viewport.zoom,
      (e) => e.id !== except && !stack.includes(e),
    );
  }

  /**
   * The box, groups left out, whose shape's outline is nearest a point and within `reach` of it
   * (diagram units), among those that can be seen and that `accept` takes.
   */
  private nearestOutline(
    point: Point,
    reach: number,
    accept: (element: ElementInfo) => boolean,
  ): ElementInfo | undefined {
    let best: { element: ElementInfo; distance: number } | undefined;
    for (const element of this.painted()) {
      if (element.kind === "group" || !accept(element)) continue;
      // In the element's own frame: the outline lies in the box, and a box out of reach holds no
      // outline in reach.
      const local = intoFrame(point, element.box, element.rotation);
      if (borderDistance(element.box, local) > reach && !this.inBox(element.box, local)) continue;
      const distance = borderDistance(element.box, local, element.shape, this.optionsOf(element));
      if (distance <= reach && (!best || distance < best.distance)) best = { element, distance };
    }
    return best?.element;
  }

  /**
   * Whether the canvas offers to turn an element: the elements of flow and free diagrams, but not a
   * pen stroke, which takes no `rotation` (its points say where it goes).
   */
  private turns(element: ElementInfo): boolean {
    const profile = this.render?.profile;
    return (
      !this.readOnly &&
      element.kind !== "group" &&
      !element.pen &&
      (profile === "flow" || profile === "free")
    );
  }

  /** The angle an element is drawn at now: the rotation handle's while it turns it. */
  private angleOf(element: ElementInfo): number | undefined {
    const drag = this.drag;
    if (drag?.kind === "rotate" && drag.id === element.id) return drag.angle;
    if (this.turnPending?.id === element.id) return this.turnPending.angle;
    return element.rotation;
  }

  /** The shape options an element's outline is drawn with: its corner radius. */
  private optionsOf(element: ElementInfo): ShapeOptions {
    return element.radius === undefined ? {} : { radius: element.radius };
  }

  /** The same, at the zoom, for outlines drawn on the screen. */
  private screenOptions(element: ElementInfo): ShapeOptions {
    return element.radius === undefined ? {} : { radius: element.radius * this.viewport.zoom };
  }

  /** The `transform` that turns what the overlay draws for a box by `angle` about its centre. */
  private turnAttributes(box: Box, angle: number | undefined): { transform?: string } {
    if (!angle) return {};
    const c = this.screenOf(centerOf(box));
    return { transform: `rotate(${angle} ${c.x} ${c.y})` };
  }

  /**
   * Where an end attaches on an element at `at`: found in the element's own frame, where `route`
   * writes it, and turned back for drawing.
   */
  private attachOn(
    element: ElementInfo,
    at: Point,
    reach: { readonly border: number; readonly magnet: number; readonly free?: boolean },
  ): EndAttachment {
    const local = attachEnd(
      element.box,
      element.ports,
      intoFrame(at, element.box, element.rotation),
      reach,
      element.shape,
      this.optionsOf(element),
    );
    return element.rotation
      ? { ...local, point: outOfFrame(local.point, element.box, element.rotation) }
      : local;
  }

  /**
   * Turns an element's drawing to `angle` while its rotation handle is dragged: the SVG
   * `transform` of its group about the centre of its box in the drawing shown, in that drawing's
   * coordinates, as the layout turns it, so it follows the pointer without easing. `released`
   * eases into the angle once, on the drop.
   */
  private turnDrawing(id: string, angle: number, released = false): void {
    const r = this.render;
    const box = this.turnBox(id);
    const g = this.content.querySelector<SVGGElement>(
      `g[data-id="${cssEscape(id)}"][data-role="element"]`,
    );
    if (!box || !r || !g) return;
    const offset = this.previewShown?.offset ?? r.offset;
    const c = centerOf(box);
    g.classList.add("turning");
    g.classList.toggle("turned-release", released);
    if (angle === 0) g.removeAttribute("transform");
    else g.setAttribute("transform", `rotate(${angle} ${c.x + offset.x} ${c.y + offset.y})`);
  }

  /** The box an element turns about: the one the drawing shown has for it. */
  private turnBox(id: string): Box | undefined {
    const drag = this.drag;
    const shown = this.previewShown?.box;
    if (shown && drag?.kind === "rotate" && drag.id === id) return shown;
    return this.elements.get(id)?.box;
  }

  /** Keeps the element of a rotation under way at the handle's angle over the drawing shown. */
  private followRotation(): void {
    const drag = this.drag;
    if (drag?.kind === "rotate" && drag.moving) this.turnDrawing(drag.id, drag.angle);
  }

  private inBox(box: Box, point: Point): boolean {
    return (
      point.x >= box.x &&
      point.x <= box.x + box.width &&
      point.y >= box.y &&
      point.y <= box.y + box.height
    );
  }

  /**
   * Over the empty canvas just outside a box's border, the point a connection would start from:
   * shown, and taken by a press.
   */
  private hoverBorder(at: Point, free: boolean, over = false): void {
    const before = this.borderStart;
    this.borderStart = undefined;
    const profile = this.render?.profile;
    if (
      !this.stale &&
      !this.storyPanel.active &&
      !this.readOnly &&
      (profile === "flow" || profile === "free") &&
      !over &&
      this.stackAt(at).length === 0
    ) {
      const ring = START_RING / this.viewport.zoom;
      const element = this.nearestOutline(at, ring, () => true);
      if (element) {
        const attachment = this.attachOn(element, at, { ...this.reach(free), border: ring });
        if (attachment.port !== null) this.borderStart = { element: element.id, attachment };
      }
    }
    this.stage.classList.toggle("connecting", this.borderStart !== undefined);
    if (before !== this.borderStart) this.drawOverlay();
  }

  /**
   * The group a dragged selection, moved by `delta`, would land in: the innermost one under the
   * centre of the selection's box, the dragged elements and what they hold left out; null outside
   * every group. Undefined where moves never change parents: sequence diagrams and C4 views.
   */
  private dropTargetOf(ids: readonly string[], delta: Point): string | null | undefined {
    const profile = this.render?.profile;
    if (profile !== "flow" && profile !== "free") return undefined;
    // A free line and a pen keep their group when they move.
    const union = unionBox(
      ids
        .map((id) => this.elements.get(id))
        .filter((e): e is ElementInfo => e !== undefined && !e.line && !e.pen)
        .map((e) => e.box),
    );
    if (!union) return undefined;
    const centre = {
      x: union.x + union.width / 2 + delta.x,
      y: union.y + union.height / 2 + delta.y,
    };
    // A group on a hidden layer takes nothing new, but keeps what it holds.
    const order = (e: ElementInfo) => this.paint.get(e.id) ?? -1;
    const all = [...this.elements.values()].sort((a, b) => order(a) - order(b));
    return dropTarget(all, ids, centre, this.parentOf, (e) => this.isHidden(e.layer));
  }

  /**
   * The group a drag of `ids` by `delta` moves them into, when it gives one of them another
   * parent; undefined when every parent stays: in the same group, or all the children of a group
   * without place, which moves with them.
   */
  private dropParent(ids: readonly string[], delta: Point): string | null | undefined {
    const target = this.dropTargetOf(ids, delta);
    if (target === undefined) return undefined;
    const kept = carriedChildren([...this.elements.values()], ids);
    return changesParent(ids, target, this.parentOf, kept) ? target : undefined;
  }

  /**
   * The position a point gives among the children of a list (`children`, in their order): before
   * the first child whose middle along the list's axis lies past the point.
   */
  private listIndexAt(listId: string, children: readonly string[], at: Point): number {
    const column = this.elements.get(listId)?.list?.layout !== "row";
    let index = 0;
    for (const id of children) {
      const box = this.elements.get(id)?.box;
      if (!box) continue;
      const middle = column ? box.y + box.height / 2 : box.x + box.width / 2;
      if ((column ? at.y : at.x) > middle) index++;
    }
    return index;
  }

  /** The dragged elements that are not inside another dragged one. */
  private outermost(ids: readonly string[]): ElementInfo[] {
    const moved = new Set(ids);
    return ids
      .map((id) => this.elements.get(id))
      .filter((e): e is ElementInfo => {
        if (!e) return false;
        for (let p: string | null | undefined = e.parent; p; p = this.parentOf(p)) {
          if (moved.has(p)) return false;
        }
        return true;
      });
  }

  /**
   * Where a drag of `ids` by `delta` with the pointer at `at` drops into a list: the list group it
   * lands in and the position the pointer gives among its children (the dragged ones taken out);
   * undefined when it lands in no list, when it carries a line or a stroke (which keep their
   * points), on a hidden layer, or off free diagrams. A column dragged over the columns of a board
   * goes among them, never into one; a group dragged within its list goes among its siblings.
   */
  private listDrop(ids: readonly string[], delta: Point, at: Point): ListDrop | undefined {
    if (this.render?.profile !== "free") return undefined;
    const moved = this.outermost(ids);
    if (moved.length === 0 || moved.some((e) => e.line || e.pen)) return undefined;
    let target = this.dropTargetOf(ids, delta) ?? undefined;
    if (target === undefined) return undefined;
    const isList = (id: string | null | undefined) =>
      id !== null && id !== undefined && this.elements.get(id)?.list !== undefined;
    if (moved.every((e) => e.list)) {
      while (isList(target) && isList(this.parentOf(target!))) target = this.parentOf(target!)!;
    }
    const own = moved[0]!.parent;
    if (
      moved.every((e) => e.kind === "group" && e.parent === own) &&
      isList(own) &&
      this.parentOf(target) === own
    ) {
      target = own!;
    }
    const group = this.elements.get(target);
    if (!group?.list || this.isHidden(group.layer)) return undefined;
    const taken = new Set(this.withContents(ids));
    const remaining = group.list.children.filter((id) => !taken.has(id));
    return { id: target, index: this.listIndexAt(target, remaining, at) };
  }

  /**
   * Whether a drop into a list leaves everything as it is: the dragged elements are its children
   * already, in that order at that position, and none of them has a `place` of its own.
   */
  private keepsList(ids: readonly string[], drop: ListDrop): boolean {
    const list = this.elements.get(drop.id)?.list;
    if (!list) return false;
    const moved = this.outermost(ids).map((e) => e.id);
    const remaining = list.children.filter((id) => !moved.includes(id));
    const order = [...remaining.slice(0, drop.index), ...moved, ...remaining.slice(drop.index)];
    return (
      order.length === list.children.length &&
      order.every((id, i) => list.children[i] === id) &&
      moved.every((id) => !this.elements.get(id)?.placed)
    );
  }

  /**
   * The insertion bar of the drag over a list, in diagram coordinates: across the list from edge
   * to edge (its ends show beside a card dragged over it), in the middle of the room the preview
   * makes for the dragged elements when it shows it, else halfway between the children the drop
   * goes between (beyond the first or the last by half the list's spacing, in the middle of an
   * empty list).
   */
  private insertionBar():
    | { readonly list: string; readonly column: boolean; readonly from: Point; readonly to: Point }
    | undefined {
    const drag = this.drag;
    if (drag?.kind !== "move" || !drag.moving || !drag.list || !this.render) return undefined;
    const group = this.elements.get(drag.list.id);
    const list = group?.list;
    if (!group || !list) return undefined;
    const column = list.layout === "column";
    const start = (b: Box) => (column ? b.y : b.x);
    const end = (b: Box) => (column ? b.y + b.height : b.x + b.width);
    const taken = new Set(this.withContents(drag.ids));
    const children = list.children
      .filter((id) => !taken.has(id))
      .map((id) => this.elements.get(id)?.box)
      .filter((b): b is Box => b !== undefined);
    const index = drag.list.index;
    const shown = this.previewShown;
    const shifts =
      shown?.list?.id === drag.list.id && shown.list.index === index ? shown.shifts : undefined;
    const room = shifts
      ? unionBox(
          this.outermost(drag.ids).flatMap((e) => {
            const shift = shifts.get(e.id);
            return shift ? [{ ...e.box, x: e.box.x + shift.x, y: e.box.y + shift.y }] : [];
          }),
        )
      : undefined;
    const before = children[index - 1];
    const after = children[index];
    const along = room
      ? (start(room) + end(room)) / 2
      : before && after
        ? (end(before) + start(after)) / 2
        : before
          ? end(before) + list.spacing / 2
          : after
            ? start(after) - list.spacing / 2
            : (start(group.box) + end(group.box)) / 2;
    // Across the list, inside its edges by a little, so that its dots sit beside the cards.
    const box = group.box;
    const inset = Math.min(INSERTION_INSET, (column ? box.width : box.height) / 4);
    const from = (column ? box.x : box.y) + inset;
    const to = (column ? box.x + box.width : box.y + box.height) - inset;
    return {
      list: drag.list.id,
      column,
      from: column ? { x: from, y: along } : { x: along, y: from },
      to: column ? { x: to, y: along } : { x: along, y: to },
    };
  }

  /**
   * Shows the insertion bar where a drag over a list drops, or hides it. It is put in the drawing
   * shown (a preview's, the render's), under what is dragged; it fades in where it first shows (in
   * a list it was not in), then slides from gap to gap, each slide added to the one under way;
   * it fades out when the drag leaves the list or ends.
   */
  private syncInsertion(): void {
    const bar = this.insertionBar();
    const g = this.insertion;
    const svg = this.content.querySelector("svg");
    const r = this.render;
    if (!bar || !svg || !r) {
      if (!this.insertionAt) return;
      this.insertionAt = undefined;
      g.classList.remove("shown");
      const fast = this.motion("--mdg-motion-fast");
      if (fast > 0 && g.isConnected) {
        g.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: fast,
          easing: this.easing(),
          fill: "forwards",
        }).finished.then(
          () => {
            if (!this.insertionAt) g.remove();
          },
          () => undefined,
        );
      } else g.remove();
      return;
    }
    // In the units of the drawing shown, at a constant size on the screen.
    const offset = this.previewShown?.offset ?? r.offset;
    const zoom = this.viewport.zoom;
    const a = { x: bar.from.x + offset.x, y: bar.from.y + offset.y };
    const b = { x: bar.to.x + offset.x, y: bar.to.y + offset.y };
    const [halo, line, start, end] = [...g.children] as SVGElement[];
    for (const [segment, width] of [
      [halo!, (INSERTION_BAR + 2) / zoom],
      [line!, INSERTION_BAR / zoom],
    ] as const) {
      segment.setAttribute("x1", String(a.x));
      segment.setAttribute("y1", String(a.y));
      segment.setAttribute("x2", String(b.x));
      segment.setAttribute("y2", String(b.y));
      segment.setAttribute("stroke-width", String(width));
    }
    for (const [dot, at] of [
      [start!, a],
      [end!, b],
    ] as const) {
      dot.setAttribute("cx", String(at.x));
      dot.setAttribute("cy", String(at.y));
      dot.setAttribute("r", String(INSERTION_DOT / zoom));
      dot.setAttribute("stroke-width", String(1 / zoom));
    }
    g.classList.add("shown");
    g.classList.toggle("row", !bar.column);
    g.setAttribute("data-list", bar.list);
    // Under what is dragged, which floats over everything else.
    const lifted = svg.querySelector(":scope > [data-lifted]");
    const placed =
      g.parentNode === svg &&
      (!lifted || (g.compareDocumentPosition(lifted) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0);
    if (!placed) svg.insertBefore(g, lifted);
    const previous = this.insertionAt;
    this.insertionAt = bar;
    const moved =
      previous !== undefined &&
      (previous.from.x !== bar.from.x ||
        previous.from.y !== bar.from.y ||
        previous.to.x !== bar.to.x ||
        previous.to.y !== bar.to.y);
    if (previous && !moved && previous.list === bar.list) return;
    const fast = this.motion("--mdg-motion-fast");
    if (fast <= 0) return;
    const easing = this.easing();
    if (!previous || previous.list !== bar.list || previous.column !== bar.column) {
      // Where it first shows, it fades in.
      for (const animation of g.getAnimations()) animation.cancel();
      g.animate([{ opacity: 0 }, { opacity: 1 }], { duration: fast, easing });
      return;
    }
    const dx = (previous.from.x + previous.to.x - bar.from.x - bar.to.x) / 2;
    const dy = (previous.from.y + previous.to.y - bar.from.y - bar.to.y) / 2;
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return;
    g.animate(
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0px, 0px)" }],
      {
        duration: fast,
        easing,
        composite: "add",
      },
    );
  }

  /**
   * The lists whose + shows: the ones selected and the ones under the pointer (or under the + the
   * pointer is on), on a free diagram that edits, while nothing is dragged and no tool is armed.
   */
  private listAddTargets(): string[] {
    const r = this.render;
    if (
      r?.profile !== "free" ||
      this.readOnly ||
      this.storyPanel.active ||
      this.stale ||
      this.drag !== undefined ||
      this.tool !== undefined ||
      this.pointing ||
      this.iconDrag !== undefined
    ) {
      return [];
    }
    const ids = new Set<string>();
    for (const id of this.selection) ids.add(id);
    for (const id of this.hoveredLists) ids.add(id);
    if (this.listAddHover !== undefined) ids.add(this.listAddHover);
    return [...ids].filter((id) => {
      const element = this.elements.get(id);
      return element?.list !== undefined && !this.isHidden(element.layer);
    });
  }

  /**
   * Where the + of a list goes on the stage: below a column's last child, right of a row's, in
   * the middle of an empty list. Where the list has no room for it there, it goes past the list's
   * edge, clear of the resize handle that a selected list has on it.
   */
  private listAddPoint(group: ElementInfo): Point {
    const children = group.list?.children ?? [];
    const last = [...children]
      .reverse()
      .map((id) => this.elements.get(id))
      .find((e) => e !== undefined);
    const frame = this.screenBox(group.box);
    const away = LIST_ADD_GAP + LIST_ADD_RADIUS;
    // Past the edge: beyond half a resize handle, then the gap.
    const beyond = LIST_ADD_HANDLE + away;
    if (!last) {
      // An empty list: in its middle, below its title.
      const centre = centerOf(frame);
      const text = group.label !== "" ? group.text : undefined;
      const title = text ? this.screenOf({ x: 0, y: text.anchor.y + text.line / 2 }).y : undefined;
      const below = title === undefined ? centre.y : Math.max(centre.y, title + away);
      const fits = below + away + LIST_ADD_HANDLE <= frame.y + frame.height;
      return { x: centre.x, y: fits ? below : frame.y + frame.height + beyond };
    }
    const box = this.screenBox(last.box);
    if (group.list?.layout === "row") {
      const inside = box.x + box.width + away;
      const fits = inside + away + LIST_ADD_HANDLE <= frame.x + frame.width;
      return { x: fits ? inside : frame.x + frame.width + beyond, y: box.y + box.height / 2 };
    }
    const inside = box.y + box.height + away;
    const fits = inside + away + LIST_ADD_HANDLE <= frame.y + frame.height;
    return { x: box.x + box.width / 2, y: fits ? inside : frame.y + frame.height + beyond };
  }

  /**
   * The lists under a point of the diagram, innermost first, and the ones whose end the point is
   * just past, where their + may be: moving from a list to its + keeps the list hovered.
   */
  private listsAt(at: Point): string[] {
    const under = this.stackAt(at)
      .filter((e) => e.list !== undefined)
      .map((e) => e.id);
    const reach = (LIST_ADD_HANDLE + LIST_ADD_GAP + 2 * LIST_ADD_RADIUS) / this.viewport.zoom;
    for (const element of this.elements.values()) {
      if (!element.list || under.includes(element.id) || this.isHidden(element.layer)) continue;
      // Past the end of the list, and below an empty one, where its + goes when it has no room.
      const box = element.box;
      const empty = element.list.children.length === 0;
      const zone = {
        ...box,
        width: box.width + (element.list.layout === "row" ? reach : 0),
        height: box.height + (element.list.layout === "row" && !empty ? 0 : reach),
      };
      if (this.inBox(zone, at)) under.push(element.id);
    }
    return under;
  }

  /**
   * Shows the + of the lists that are hovered or selected, where their end is now, and hides the
   * others: each fades and grows in, and out, over the canvas's motion.
   */
  private syncListAdds(): void {
    const targets = new Set(this.listAddTargets());
    for (const [id, button] of this.listAddButtons) {
      if (this.elements.get(id)?.list === undefined) {
        button.remove();
        this.listAddButtons.delete(id);
        if (this.listAddHover === id) this.listAddHover = undefined;
      } else if (!targets.has(id)) button.classList.remove("shown");
    }
    const words = messages();
    for (const id of targets) {
      const group = this.elements.get(id)!;
      let button = this.listAddButtons.get(id);
      if (!button) {
        button = this.listAddButton(id);
        this.listAdds.append(button);
        this.listAddButtons.set(id, button);
        // Drawn hidden first, so that it grows in.
        void button.offsetWidth;
      }
      const at = this.listAddPoint(group);
      button.style.left = `${at.x}px`;
      button.style.top = `${at.y}px`;
      const layout = group.list!.layout;
      const label = layout === "row" ? words.lists.addColumn(id) : words.lists.addSticky(id);
      if (button.getAttribute("aria-label") !== label) {
        button.setAttribute("aria-label", label);
        button.title = `${label} (Ctrl+${words.keys.enter})`;
      }
      button.dataset.layout = layout;
      button.classList.add("shown");
    }
  }

  /** The + of a list: a round button over the stage, which the stage's gestures leave alone. */
  private listAddButton(id: string): HTMLButtonElement {
    const button = h(
      "button",
      {
        type: "button",
        class: "list-add",
        tabindex: -1,
        "data-list": id,
        "data-write": "",
        "data-edit": "",
        "aria-keyshortcuts": this.mac ? "Meta+Enter" : "Control+Enter",
      },
      icon(ICONS.listAdd),
    );
    // A press on it is no press on the stage: nothing is selected, dragged or focused away.
    button.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      e.preventDefault();
    });
    for (const type of ["dblclick", "contextmenu"] as const) {
      button.addEventListener(type, (e) => {
        e.stopPropagation();
        e.preventDefault();
      });
    }
    button.addEventListener("pointerenter", () => {
      this.listAddHover = id;
    });
    button.addEventListener("pointerleave", (e) => {
      if (this.listAddHover !== id) return;
      this.listAddHover = undefined;
      // The lists where the pointer is now: a render that grew the list may have moved the +
      // from under a pointer that stays over the list.
      this.hoveredLists =
        this.render?.profile === "free" ? this.listsAt(this.diagramOf(this.pointOf(e))) : [];
      this.syncListAdds();
    });
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      this.addToList(id);
    });
    return button;
  }

  /**
   * The lists under the pointer, innermost first, whose + shows; the + the pointer is on keeps
   * them as they are.
   */
  private hoverLists(event: PointerEvent | undefined): void {
    if (event && (event.target as Element | null)?.closest?.(".list-add")) return;
    const lists =
      event && this.render?.profile === "free"
        ? this.listsAt(this.diagramOf(this.pointOf(event)))
        : [];
    if (
      lists.length === this.hoveredLists.length &&
      lists.every((id, i) => this.hoveredLists[i] === id)
    ) {
      return;
    }
    this.hoveredLists = lists;
    this.syncListAdds();
  }

  /**
   * Adds to a list: a sticky note to a column, a column to a row, at `index` among its children
   * or at its end, with its editor open (the list's + and Ctrl+Enter). Words being typed are kept
   * first, and the new card waits for their drawing.
   */
  private addToList(listId: string, index?: number): void {
    if (this.readOnly) return;
    if (this.inline) this.commitInline();
    if (this.pending) {
      this.afterRender.push(() => this.addToList(listId, index));
      return;
    }
    const group = this.elements.get(listId);
    const list = group?.list;
    if (!group || !list) return;
    this.setPointing(false);
    if (this.tool !== undefined) this.arm(undefined);
    const at = this.diagramOf(this.listAddPoint(group));
    const position = Math.min(index ?? list.children.length, list.children.length);
    const words = messages().announcements;
    const fill = this.stickyFill;
    const column = list.layout !== "row";
    const sent = column
      ? this.create("sticky", at, {
          parent: listId,
          index: position,
          ...(fill === null ? {} : { fill }),
        })
      : this.create("group", at, { parent: listId, index: position, layout: "column" });
    if (!sent) return;
    // The cards after one added between two glide on to make room for it.
    if (position < list.children.length) this.settling = { since: performance.now() };
    // A new card pops in, as one from the sticky note button does.
    if (column) this.popping = performance.now();
    this.announce(column ? words.addedSticky(listId) : words.addedColumn(listId));
  }

  /**
   * Ctrl+Enter: the next card of a list after the selected one, in its list; at the end of the
   * list when the list itself is selected.
   */
  private addNext(id = this.selection[this.selection.length - 1]): void {
    const element = id === undefined ? undefined : this.elements.get(id);
    const parent = element?.parent ? this.elements.get(element.parent) : undefined;
    const position = element && parent?.list ? parent.list.children.indexOf(element.id) : -1;
    if (parent && position >= 0) this.addToList(parent.id, position + 1);
    else if (element?.list) this.addToList(element.id);
    else this.announce(messages().announcements.noListToAdd);
  }

  /**
   * Alt+Up and Alt+Down: the selected child of a list goes before or after its neighbour (before
   * is left in a row), staying selected; nothing moves at an end of the list.
   */
  private moveInList(before: boolean): void {
    const words = messages().announcements;
    const primary = this.selection[this.selection.length - 1];
    const element = primary === undefined ? undefined : this.elements.get(primary);
    const group = element?.parent ? this.elements.get(element.parent) : undefined;
    const children = group?.list?.children ?? [];
    const position = element ? children.indexOf(element.id) : -1;
    if (!element || !group || position < 0) {
      this.announce(words.noListToMove);
      return;
    }
    if (this.pending) {
      this.afterRender.push(() => this.moveInList(before));
      return;
    }
    const neighbour = children[before ? position - 1 : position + 1];
    if (neighbour === undefined) {
      this.announce(words.listEnd(element.id, group.id, before));
      return;
    }
    // Counted among the children once it is taken out: one back, or one past its neighbour.
    const index = before ? position - 1 : position + 1;
    if (!this.act({ kind: "move", ids: [element.id], parent: group.id, index })) return;
    // The two cards trade places, gliding.
    this.settling = { since: performance.now() };
    this.announce(words.movedPast(element.id, neighbour, group.id, before));
  }

  /** The group outlined while dragging: the visible one that holds the dragged elements after it. */
  private landingGroup(ids: readonly string[], delta: Point): string | undefined {
    const target = this.dropTargetOf(ids, delta);
    const group = target ? this.elements.get(target) : undefined;
    if (!target || !group || this.isHidden(group.layer)) return undefined;
    const holds =
      this.dropParent(ids, delta) === target ||
      ids.some((id) => this.elements.get(id)?.parent === target);
    return holds ? target : undefined;
  }

  /**
   * An Alt+press on an element. Released in place it selects the shape below (`selectBelow`);
   * dragged, it moves the selection when the selection is under the pointer, else what it pressed
   * on, and keeps every parent. A canvas that only shows selects below at once.
   */
  private altPress(id: string, at: Point): void {
    if (this.readOnly) {
      this.selectBelow(at);
      return;
    }
    const selected = this.stackAt(at).find((e) => this.selection.includes(e.id));
    this.drag = {
      kind: "move",
      start: at,
      primary: selected?.id ?? id,
      ids: selected ? this.selection.filter((s) => this.elements.has(s)) : [id],
      delta: { x: 0, y: 0 },
      guides: [],
      moving: false,
      below: true,
      ...(selected ? {} : { pick: id }),
    };
  }

  /**
   * Selects the shape below the selected one in the stack under a point (diagram coordinates),
   * front to back and round again; the one below the topmost when the selection is not in the
   * stack. Says which, and where it is in the stack.
   */
  private selectBelow(at: Point): void {
    const stack = this.stackAt(at);
    const next = belowInStack(
      stack.map((e) => e.id),
      this.selection[this.selection.length - 1],
    );
    const element = next ? this.elements.get(next) : undefined;
    if (!element) return;
    this.select([element.id]);
    this.announce(
      messages().announcements.selectedBelow(
        element.kind,
        element.id,
        element.label,
        stack.indexOf(element) + 1,
        stack.length,
      ),
    );
  }

  private doubleClick(e: MouseEvent): void {
    // Alt+clicks in a row go down a stack; they edit no label. Pointing opens nothing, nor do two
    // quick dots of the pen or presses of the eraser.
    if (this.storyPanel.active || e.altKey || this.pointing || isDrawing(this.tool)) return;
    // Pointer capture sends the double click to the stage; what is under the pointer counts.
    const hit = this.hit(document.elementFromPoint(e.clientX, e.clientY) ?? e.target);
    if (!hit) return;
    // A stroke has no text: a double click on it opens nothing and leaves it selected.
    if (hit.kind === "element" && this.elements.get(hit.id)?.pen) return;
    // Handles are redrawn between the two clicks, so their double clicks are told on the press;
    // but the handle that the first click puts in the middle of a relation lies on its label, and
    // a double click there edits the label, as on the rest of the line.
    if (hit.kind === "handle") {
      if (hit.handle?.startsWith("segment:") && this.relations.has(hit.id)) this.editLabel(hit.id);
      // The middle of a free line, where its pill goes, edits its label as well.
      if (hit.handle?.startsWith("lineSegment:") && this.elements.get(hit.id)?.line) {
        this.editLabel(hit.id);
      }
      return;
    }
    if (
      hit.kind === "element" ||
      hit.kind === "relation" ||
      hit.kind === "label" ||
      hit.kind === "event"
    )
      this.editLabel(hit.id);
  }

  /**
   * A double click on a handle: an end goes back to the layout, a bend is removed. Returns whether
   * the handle has one.
   */
  private handleDoubleClick(id: string, handle: string): boolean {
    const line = this.elements.get(id)?.line;
    if (line && handle.startsWith("linePoint:")) {
      // A bend of a free line goes; its ends stay.
      const index = Number(handle.slice("linePoint:".length));
      if (index <= 0 || index >= line.points.length - 1) return false;
      this.act({
        kind: "setLinePoints",
        element: id,
        ...linePointsOf(line.points.filter((_, i) => i !== index)),
      });
      this.announce(messages().announcements.lineBendRemoved(id));
      return true;
    }
    const relation = this.relations.get(id);
    if (!relation) return false;
    if (handle.startsWith("end:")) {
      const end = handle.slice(4) as "from" | "to";
      this.act({
        kind: "setEnd",
        relation: id,
        end,
        element: end === "from" ? relation.from : relation.to,
        port: null,
      });
      this.announce(messages().announcements.endFree(id));
      return true;
    }
    if (handle.startsWith("bend:")) {
      this.act({
        kind: "setVia",
        relation: id,
        via: withBendRemoved(relation.via, Number(handle.slice(5))),
      });
      return true;
    }
    return false;
  }

  private wheel(e: WheelEvent): void {
    e.preventDefault();
    if (!this.render) return;
    const point = this.pointOf(e);
    if (e.ctrlKey || e.metaKey) {
      this.setViewport(
        zoomAt(this.viewport, this.viewport.zoom * Math.exp(-e.deltaY * 0.002), point),
      );
      return;
    }
    const dx = e.shiftKey && e.deltaX === 0 ? e.deltaY : e.deltaX;
    const dy = e.shiftKey && e.deltaX === 0 ? 0 : e.deltaY;
    this.setViewport({ ...this.viewport, x: this.viewport.x - dx, y: this.viewport.y - dy });
  }

  private keyDown(e: KeyboardEvent): void {
    if (this.menu.key(e)) return;
    // Undo and redo belong to the host; a canvas that only shows does not let them through.
    if (this.readOnly && undoRedoKey(e)) {
      e.stopPropagation();
      this.announce(messages().readOnly.refused);
      return;
    }
    if (e.key === " " && !e.repeat) {
      this.spaceDown = true;
      this.stage.classList.add("space");
      e.preventDefault();
      return;
    }
    const command = commandFor(e, this.mac, this.render?.profile ?? "flow");
    if (!command) return;
    // Story mode is read-only: the view can be zoomed, nothing else.
    if (this.storyPanel.active && !command.startsWith("zoom")) return;
    // Tab past the last element leaves the canvas, so the keyboard is never trapped.
    if ((command === "selectNext" || command === "selectPrevious") && this.leavesCanvas(command)) {
      this.select([]);
      return;
    }
    e.preventDefault();
    this.command(command);
  }

  private leavesCanvas(command: "selectNext" | "selectPrevious"): boolean {
    const order = [...this.elements.values()]
      .filter((e) => !this.isHidden(e.layer))
      .map((e) => e.id);
    const current = this.selection[this.selection.length - 1];
    if (current === undefined) return false;
    return command === "selectNext" ? current === order[order.length - 1] : current === order[0];
  }

  // ------------------------------------------------------------------ commands

  private command(command: CanvasCommand): void {
    // F does nothing on a canvas that only shows: there is no grid of shapes to open.
    if (this.readOnly && command === "openShapes") return;
    // A canvas that only shows runs the commands that look, and says so for the others.
    if (this.readOnly && !viewCommand(command)) {
      this.announce(messages().readOnly.refused);
      return;
    }
    const primary = this.selection[this.selection.length - 1];
    const elementIds = this.selection.filter((id) => this.elements.has(id));
    const grid = this.settings.grid;
    const order = [...this.elements.values()]
      .filter((e) => !this.isHidden(e.layer))
      .map((e) => e.id);
    switch (command) {
      case "selectAll":
        this.select(order);
        return;
      case "clearSelection":
        if (this.drag?.kind === "lineDraw") {
          // The ghost goes and nothing is written; the tool stays armed.
          this.drag = undefined;
          this.announce(messages().announcements.lineCancelled);
          this.drawOverlay();
        } else if (this.drag?.kind === "penDraw") {
          // The stroke goes and nothing is written; the pen stays in the hand. The others drop it.
          this.cancelLaser(this.drag.look);
          this.drag = undefined;
          this.announce(messages().announcements.strokeCancelled);
          this.drawOverlay();
        } else if (this.drag?.kind === "erase") {
          // The strokes fade back in and nothing is erased; the eraser stays in the hand.
          this.restoreErased([...this.drag.hits]);
          this.drag = undefined;
          this.announce(messages().announcements.nothingErased);
        } else if (this.pointing) {
          // The stroke in the air goes with the tool.
          if (this.drag?.kind === "laser") this.endLaser();
          this.drag = undefined;
          this.setPointing(false);
        } else if (this.drag) this.resetPreview();
        else if (this.tool) this.arm(undefined);
        else this.select([]);
        return;
      case "togglePointer":
        this.setPointing(!this.pointing);
        return;
      case "selectNext":
      case "selectPrevious": {
        const next = nextInOrder(order, primary, command === "selectNext" ? 1 : -1);
        if (next) this.select([next], true);
        return;
      }
      case "selectBelow": {
        // Under the selected element's centre, or under the pointer when nothing is selected.
        const element = primary ? this.elements.get(primary) : undefined;
        this.selectBelow(element ? centerOf(element.box) : this.diagramOf(this.pointer));
        return;
      }
      case "selectLeft":
      case "selectRight":
      case "selectUp":
      case "selectDown": {
        if (!primary) return;
        const direction = command.slice(6).toLowerCase() as "left" | "right" | "up" | "down";
        const next = nearestInDirection(this.boxes(), primary, direction);
        if (next) this.select([next], true);
        return;
      }
      case "nudgeLeft":
      case "nudgeRight":
      case "nudgeUp":
      case "nudgeDown":
      case "nudgeLeftGrid":
      case "nudgeRightGrid":
      case "nudgeUpGrid":
      case "nudgeDownGrid": {
        const step = command.endsWith("Grid") ? grid : 1;
        const name = command.replace("nudge", "").replace("Grid", "");
        const delta = {
          x: name === "Left" ? -step : name === "Right" ? step : 0,
          y: name === "Up" ? -step : name === "Down" ? step : 0,
        };
        this.nudge(delta);
        return;
      }
      case "narrowerGrid":
      case "widerGrid":
      case "shorterGrid":
      case "tallerGrid": {
        const element = primary ? this.elements.get(primary) : undefined;
        if (!element || (element.kind === "group" && !element.sized)) return;
        const box = element.box;
        const dw = command === "widerGrid" ? grid : command === "narrowerGrid" ? -grid : 0;
        const dh = command === "tallerGrid" ? grid : command === "shorterGrid" ? -grid : 0;
        const handle: Handle = dw !== 0 ? "e" : "s";
        const result = resizeBox(
          box,
          handle,
          { x: dw, y: dh },
          { grid, snap: this.snap, guides: false, zoom: 1 },
        );
        this.act({ kind: "resize", id: element.id, box: result });
        this.announce(messages().announcements.resized(element.id, result.width, result.height));
        return;
      }
      case "editLabel":
        if (primary) this.editLabel(primary);
        return;
      case "renameId":
        if (primary) this.editLabel(primary, true);
        return;
      case "delete": {
        if (this.selection.length === 0) return;
        // Strokes alone go with their own styles and effects, as the eraser takes them: nothing
        // else depends on a stroke, and one undo brings it all back.
        const strokes = this.selection.every((id) => this.elements.get(id)?.pen !== undefined);
        this.act({ kind: "remove", ids: this.selection, cascade: strokes });
        return;
      }
      case "copy":
        if (elementIds.length > 0) this.post({ type: "copy", ids: elementIds });
        return;
      case "cut":
        if (elementIds.length > 0) this.act({ kind: "cut", ids: elementIds });
        return;
      case "paste":
        this.act({ kind: "paste" });
        return;
      case "duplicate":
        if (elementIds.length > 0) this.act({ kind: "duplicate", ids: elementIds });
        return;
      case "group":
        if (elementIds.length > 0) this.act({ kind: "group", ids: elementIds });
        return;
      case "ungroup":
        if (primary && this.elements.get(primary)?.kind === "group")
          this.act({ kind: "ungroup", id: primary });
        return;
      case "alignLeft":
      case "alignRight":
      case "alignTop":
      case "alignBottom":
        if (elementIds.length > 1)
          this.act({
            kind: "align",
            ids: elementIds,
            edge: command.slice(5).toLowerCase() as AlignEdge,
          });
        return;
      case "distributeHorizontal":
      case "distributeVertical":
        if (elementIds.length > 2) {
          this.act({
            kind: "distribute",
            ids: elementIds,
            axis: command === "distributeHorizontal" ? "horizontal" : "vertical",
          });
        }
        return;
      case "relationTool":
        if (this.render?.scenario !== null && this.render?.profile === "sequence") {
          this.announce(messages().announcements.previewReadOnly, true);
          return;
        }
        // While the tool is armed, R takes the next kind of arrow (sequences let it go, as before).
        if (this.tool === "relation" && this.currentArrowKind()) {
          this.arrowKind = nextArrowKind(this.arrowKind, this.render?.profile ?? "flow");
          this.announceArrowKind();
          this.drawOverlay();
          return;
        }
        this.arm("relation");
        return;
      case "openShapes":
        this.openShapes("create");
        return;
      case "penTool":
        this.arm("pen");
        return;
      case "highlighterTool":
        this.arm("highlighter");
        return;
      case "eraserTool":
        this.arm("eraser");
        return;
      case "createSticky":
        this.createSticky();
        return;
      case "addToList":
        this.addNext();
        return;
      case "moveInListBefore":
      case "moveInListAfter":
        this.moveInList(command === "moveInListBefore");
        return;
      case "connect": {
        // A stroke is no end of a relation.
        const from =
          primary && this.elements.has(primary) && !this.elements.get(primary)!.pen
            ? primary
            : undefined;
        if (!from) {
          this.announce(messages().announcements.connectFromFirst);
          return;
        }
        const anchor = this.mainPoint(this.screenOf(centerOf(this.elements.get(from)!.box)));
        this.picker.open(
          [...this.elements.values()]
            .filter((e) => e.id !== from && e.kind !== "group" && !e.pen)
            .map((e) => ({ id: e.id, label: e.label })),
          { x: anchor.x, y: anchor.y },
          (to) => this.act({ kind: "connect", from, to, line: "solid" }),
        );
        return;
      }
      case "bringToFront":
      case "sendToBack":
      case "bringForward":
      case "sendBackward":
        if (elementIds.length === 0) return;
        this.act({ kind: "reorder", ids: elementIds, to: Z_ORDER[command] });
        this.announce(messages().announcements.reordered(elementIds, Z_ORDER[command]));
        return;
      case "convertToFree":
        if (this.render?.profile !== "flow") return;
        this.act({ kind: "convert" });
        this.announce(messages().announcements.converted);
        return;
      case "createParticipant":
      case "createActor": {
        const kind = command === "createParticipant" ? "participant" : "actor";
        // At the right of the last participant.
        const heads = [...this.elements.values()].filter((e) => e.kind !== "group");
        const right = Math.max(0, ...heads.map((e) => e.box.x + e.box.width));
        this.create(kind, { x: right + 100, y: heads[0]?.box.y ?? 40 });
        return;
      }
      case "createSequenceNote":
        this.act({ kind: "insertEvent", eventKind: "note", ids: this.selection });
        return;
      case "createDivider":
        this.act({ kind: "insertEvent", eventKind: "divider", ids: this.selection });
        return;
      case "createDelay":
        this.act({ kind: "insertEvent", eventKind: "delay", ids: this.selection });
        return;
      case "createFragment":
        this.fragmentMenu(this.centre());
        return;
      case "moveEventUp":
      case "moveEventDown": {
        if (!primary || !this.events.has(primary)) {
          this.announce(messages().announcements.selectEventToMove);
          return;
        }
        const direction = command === "moveEventUp" ? "up" : "down";
        this.act({ kind: "moveEvent", id: primary, direction });
        this.announce(messages().announcements.movedVertically(primary, direction));
        return;
      }
      case "toggleLayers":
        this.persist({ layers: !this.showLayers });
        this.syncToggles();
        if (this.showLayers && this.layersAllowed) this.layersPanel.element.focus();
        return;
      case "toggleLibraries":
        this.toggleLibraries();
        return;
      case "toggleActivation":
      case "nestInCall":
      case "unnestCall":
      case "addReturn":
        this.act({ kind: command, ids: this.selection });
        return;
      case "addEntity":
        this.addEntity(this.centre());
        return;
      case "createIcon":
        // I opens the icon picker, and closes it again.
        this.setPointing(false);
        this.toggleIconPicker();
        return;
      case "createNode":
      case "createDecision":
      case "createData":
      case "createNote":
      case "createTag":
      case "createGroup":
      case "createBox":
      case "createText":
      case "createImage": {
        const kind = (
          {
            createNode: "node",
            createDecision: "decision",
            createData: "data",
            createNote: "note",
            createTag: "tag",
            createGroup: "group",
            createBox: "box",
            createText: "text",
            createImage: "image",
          } as const
        )[command];
        // Creating something is no pointing.
        this.setPointing(false);
        // B and N place the current shape.
        if (SHAPED_TOOLS.has(kind)) {
          this.createShape(kind);
          return;
        }
        const size = DEFAULT_SIZES[kind];
        const at = freeCell(
          [...this.elements.values()].map((e) => e.box),
          this.diagramOf(this.centre()),
          size,
          grid,
        );
        this.create(kind, at);
        return;
      }
      case "zoomIn":
      case "zoomOut":
        this.setViewport(zoomStep(this.viewport, command === "zoomIn" ? 1 : -1, this.centre()));
        return;
      case "zoomReset":
        this.setViewport(zoomAt(this.viewport, 1, this.centre()));
        return;
      case "zoomFit":
        this.setViewport(this.fitted());
        return;
      case "zoomSelection": {
        const boxes = this.selection
          .map((id) => this.elements.get(id)?.box)
          .filter((b): b is Box => !!b);
        const fitted = this.render
          ? fitSelection(boxes, this.render.offset, this.screen())
          : undefined;
        if (fitted) this.setViewport(fitted);
        return;
      }
      case "contextMenu": {
        if (this.pointing) return;
        const element = primary ? this.elements.get(primary) : undefined;
        this.openMenu(element ? this.screenOf(centerOf(element.box)) : this.centre());
        return;
      }
    }
  }

  private nudge(delta: Point): void {
    if (this.render?.profile === "sequence") {
      this.nudgeSequence(delta);
      return;
    }
    const ids = this.selection.filter((id) => this.elements.has(id));
    if (ids.length === 0) return;
    if (this.pending) {
      this.queued = { x: this.queued.x + delta.x, y: this.queued.y + delta.y };
      return;
    }
    this.act({ kind: "move", ids, delta });
    this.announce(messages().announcements.movedBy(ids, delta.x, delta.y));
  }

  /**
   * Arrow keys on a sequence diagram: Left and Right swap a participant with its neighbour; Up
   * and Down change the space above a message, note or fragment.
   */
  private nudgeSequence(delta: Point): void {
    const primary = this.selection[this.selection.length - 1];
    if (!primary || this.pending) return;
    const element = this.elements.get(primary);
    if (element && delta.x !== 0) {
      const centre = element.box.x + element.box.width / 2;
      const siblings = [...this.elements.values()]
        .filter((e) => e.id !== primary && e.parent === element.parent)
        .map((e) => e.box.x + e.box.width / 2)
        .filter((c) => (delta.x < 0 ? c < centre : c > centre))
        .sort((a, b) => (delta.x < 0 ? b - a : a - b));
      const neighbour = siblings[0];
      if (neighbour === undefined) return;
      this.act({
        kind: "move",
        ids: [primary],
        delta: { x: neighbour - centre + Math.sign(delta.x), y: 0 },
      });
      this.announce(
        messages().announcements.movedSideways(primary, delta.x < 0 ? "left" : "right"),
      );
      return;
    }
    const event = this.events.get(primary);
    if (event?.spaced && delta.y !== 0) {
      const dy = Math.max(-event.space, delta.y);
      if (dy === 0) return;
      this.act({ kind: "move", ids: [primary], delta: { x: 0, y: dy } });
      this.announce(messages().announcements.space(primary, event.space + dy));
    }
  }

  /** The entities of the model the view may draw and does not, in a filtered list. */
  private addEntity(at: Point): void {
    const choices = this.render?.entities ?? [];
    if (choices.length === 0) {
      this.announce(messages().announcements.noEntities);
      return;
    }
    const centre = this.diagramOf(this.centre());
    this.picker.open(
      choices.map((e) => ({ id: e.path, label: `${e.label} · ${e.kind}` })),
      at,
      (path) => {
        this.act({ kind: "includeEntity", entity: path, at: centre });
        this.announce(messages().announcements.added(path));
      },
    );
  }

  /** The operators of a new fragment around the selected events. */
  private fragmentMenu(at: Point): void {
    const ids = [...this.selection];
    const labels = messages().fragments;
    this.menu.open(
      OPERATORS.map((operator) => ({
        label: labels[operator],
        run: () => this.act({ kind: "wrap", ids, operator }),
      })),
      at,
      this.stage.getBoundingClientRect(),
    );
  }

  /** The point below a toolbar button, in stage coordinates, for its menu. */
  private below(button: HTMLElement): Point {
    const rect = button.getBoundingClientRect();
    const base = this.stage.getBoundingClientRect();
    return { x: rect.left - base.left, y: 0 };
  }

  /** Creates an element at `at`; returns whether the action was sent. */
  private create(
    kind: ElementKind,
    at: Point,
    extra: {
      readonly label?: string;
      readonly icon?: string;
      readonly shape?: ShapeName;
      /** The reference of an icon object. */
      readonly source?: string;
      /** A note attached to this element, which holds it beside it rather than inside. */
      readonly attachedTo?: string;
      /** A sticky note's colour of paper, written as its `fill`. */
      readonly fill?: string;
      /** A group that is a list: the + of a row adds a column. */
      readonly layout?: "column" | "row";
      /** The group that holds it, instead of the one under the point: the list a + adds to. */
      readonly parent?: string;
      /** Its position among the children of `parent`, a list. */
      readonly index?: number;
    } = {},
  ): boolean {
    if (this.readOnly) return false;
    // `rounded` is the shape without a style: the action carries no shape for it.
    const shape = extra.shape !== undefined && extra.shape !== "rounded" ? extra.shape : undefined;
    // The innermost group under the point holds the new element; groups nest too. A note put
    // beside an element goes in the group of that element, which may be the one under the point.
    const parent =
      extra.parent ??
      (extra.attachedTo !== undefined
        ? this.elements.get(extra.attachedTo)?.parent
        : this.stackAt(at).find((e) => e.kind === "group")?.id);
    // A container is a group without a title; a column or a row is a group that is a list, which
    // the session names in the interface language. Neither is offered outside free diagrams.
    const groupKind =
      kind === "group" && extra.label === undefined && extra.layout === undefined
        ? this.groupKindNow
        : "group";
    const container = groupKind === "container" && this.render?.profile !== "sequence";
    const layout =
      extra.layout ?? (groupKind === "column" || groupKind === "row" ? groupKind : undefined);
    const label = container ? "" : extra.label;
    // Dropped into a list, it takes the place the point gives among the list's children.
    const list = parent ? this.elements.get(parent)?.list : undefined;
    const index =
      extra.index ??
      (list && parent && extra.attachedTo === undefined
        ? this.listIndexAt(parent, list.children, at)
        : undefined);
    const sent = this.act({
      kind: "create",
      elementKind: kind,
      at,
      ...(parent ? { parent } : {}),
      ...(label !== undefined ? { label } : {}),
      ...(extra.icon !== undefined ? { icon: extra.icon } : {}),
      ...(shape !== undefined ? { shape } : {}),
      ...(extra.source !== undefined ? { source: extra.source } : {}),
      ...(extra.attachedTo !== undefined ? { attachedTo: extra.attachedTo } : {}),
      ...(extra.fill !== undefined ? { fill: extra.fill } : {}),
      ...(kind === "group" && layout !== undefined ? { layout } : {}),
      ...(index !== undefined && parent ? { index } : {}),
    });
    if (!sent) return false;
    const words = messages().announcements;
    this.announce(
      kind === "group" && layout !== undefined
        ? words.createdList(layout)
        : shape !== undefined
          ? words.createdShape(kind, shape)
          : words.created(kind),
    );
    return true;
  }

  /**
   * The element a note dropped at a point would be attached to: the topmost one under it, groups
   * included, never a free line. A sequence diagram's notes are events and attach to nothing.
   */
  private noteTargetAt(at: Point): ElementInfo | undefined {
    if (!this.render || this.render.profile === "sequence") return undefined;
    return this.stackAt(at).find((el) => !el.line);
  }

  /** The element under a pointer event, when the pointer is over the canvas. */
  private noteTargetAtEvent(event: PointerEvent): ElementInfo | undefined {
    const rect = this.stage.getBoundingClientRect();
    const inside =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;
    return inside ? this.noteTargetAt(this.diagramOf(this.pointOf(event))) : undefined;
  }

  /** What `create` is given to attach a note to an element, if there is one. */
  private attachment(target: ElementInfo | undefined): { readonly attachedTo?: string } {
    return target ? { attachedTo: target.id } : {};
  }

  /** The element the dragged note tool is over, outlined as a drop until it moves off. */
  private dropNoteOn(target: ElementInfo | undefined): void {
    if (this.noteDrop === target?.id) return;
    this.noteDrop = target?.id;
    this.drawOverlay();
  }

  private snapPoint(point: Point): Point {
    const grid = this.settings.grid;
    return this.snap
      ? { x: Math.round(point.x / grid) * grid, y: Math.round(point.y / grid) * grid }
      : { x: Math.round(point.x), y: Math.round(point.y) };
  }

  /**
   * Arms a tool, or puts it away when it is the one armed (or with none). `focus` gives the stage
   * the keyboard, which the pen menu keeps when its choices arm their tool.
   */
  private arm(tool: Tool | undefined, focus = true): void {
    // No tool places or connects anything on a canvas that only shows.
    if (this.readOnly && tool !== undefined) return;
    // The pen, the highlighter and the eraser draw on free diagrams only.
    if (isDrawing(tool) && this.render?.profile !== "free") return;
    // The pointer and a tool never hold together.
    if (tool !== undefined) this.setPointing(false);
    this.tool = this.tool === tool ? undefined : tool;
    this.relationFrom = undefined;
    if (this.tool !== "icon") this.armedIcon = undefined;
    const drawing = isDrawing(this.tool);
    // The pen button arms whichever of the pen and the highlighter was armed last.
    if ((this.tool === "pen" || this.tool === "highlighter") && this.penChoice.tool !== this.tool) {
      this.persist({ pen: { ...this.penChoice, tool: this.tool } });
      this.penMenu.sync(this.penChoice);
    }
    this.syncPenButton();
    this.stage.classList.toggle("placing", !!this.tool && !drawing);
    this.stage.classList.toggle("drawing", drawing);
    this.syncPointerCursor();
    this.syncToggles();
    const words = messages().announcements;
    if (this.tool === "relation") {
      if (this.render?.profile === "sequence") this.announce(words.pickSender);
      else this.announceArrowKind();
      this.stage.focus();
    } else if (isDrawing(this.tool)) {
      this.announce(
        this.tool === "pen"
          ? words.penArmed
          : this.tool === "highlighter"
            ? words.highlighterArmed
            : words.eraserArmed,
      );
      if (focus) this.stage.focus();
    } else if (this.tool) {
      this.announce(this.placeWords(this.tool));
      this.stage.focus();
    }
    this.drawOverlay();
  }

  /**
   * A click with the relation tool: the first element is the source, the second the target, which
   * creates a relation of the current kind of arrow (Shift swaps its solid and dashed lines; a
   * message of a sequence is dashed, a reply, with Shift).
   */
  private relationClick(hit: ReturnType<CanvasApp["hit"]>, at: Point, dashed: boolean): void {
    const sequence = this.render?.profile === "sequence";
    // A free line or a stroke is no end of a relation: a press on it is a press on empty canvas.
    const pressed = hit ? this.elements.get(hit.id) : undefined;
    if (pressed?.line || pressed?.pen) hit = undefined;
    // On a sequence diagram, a click anywhere on a lifeline, fragments included, is its participant.
    const lifeline = sequence
      ? [...this.elements.values()].find(
          (e) => e.kind !== "group" && at.x >= e.box.x && at.x <= e.box.x + e.box.width,
        )?.id
      : undefined;
    const id =
      hit && (hit.kind === "element" || hit.kind === "handle") && this.elements.has(hit.id)
        ? hit.id
        : lifeline;
    const element = id ? this.elements.get(id) : undefined;
    const words = messages().announcements;
    if (!id || !element || element.kind === "group") {
      this.announce(this.relationFrom ? words.pickTargetOf(this.relationFrom) : words.pickStart);
      return;
    }
    if (!this.relationFrom) {
      this.relationFrom = id;
      if (sequence) this.announce(words.fromSender(id));
      else this.announceArrowKind();
      this.drawOverlay();
      return;
    }
    if (id === this.relationFrom && !sequence) {
      this.announce(words.anotherElement);
      return;
    }
    const from = this.relationFrom;
    this.arm(undefined);
    // The current kind of arrow; Shift on this click swaps its solid and dashed lines, except in
    // a C4 view, whose model writes `->` alone.
    const kind = this.currentArrowKind();
    const flip = dashed && this.render?.profile !== "c4";
    const { line, heads } = kind
      ? arrowKindLine(kind, flip)
      : { line: flip ? ("dashed" as const) : ("solid" as const), heads: "end" as const };
    this.announce(words.connected(from, id, line === "dashed", heads));
    this.act({ kind: "connect", from, to: id, line, ...(heads !== "end" ? { heads } : {}) });
  }

  /**
   * Whether a press of the relation tool on `pressed` starts drawing a free line: on a free
   * diagram that edits, before a source is chosen, on empty canvas, a group's background, another
   * line or a stroke.
   */
  private drawsLine(pressed: ReturnType<CanvasApp["hit"]>): boolean {
    if (this.render?.profile !== "free" || this.readOnly || this.stale) return false;
    if (this.relationFrom) return false;
    if (!pressed) return true;
    const element = pressed.kind === "element" ? this.elements.get(pressed.id) : undefined;
    return (
      element !== undefined &&
      (element.kind === "group" || element.line !== undefined || element.pen !== undefined)
    );
  }

  /** Keeps the ghost of a line just drawn on the overlay while it fades out. */
  private fadeLineGhost(from: Point, to: Point): void {
    this.lineFading = { from, to, since: performance.now() };
    if (this.lineFadeTimer !== undefined) clearTimeout(this.lineFadeTimer);
    this.lineFadeTimer = setTimeout(() => {
      this.lineFadeTimer = undefined;
      this.lineFading = undefined;
      this.drawOverlay();
    }, LINE_FADE_MS);
  }

  /** The palette of a declared type: one button per kind, after the free tools. */
  private declaredTools(
    tools: readonly { kind: string; label: string }[],
    profile: CanvasRender["profile"],
  ): void {
    const key = `${profile}:${tools.map((t) => `${t.kind}:${t.label}`).join("|")}`;
    if (this.toolbar.dataset.declared === key) return;
    this.toolbar.dataset.declared = key;
    for (const old of this.toolbar.querySelectorAll("[data-declared]")) old.remove();
    // After the group button's split, which C4 views hide with what it holds.
    const group = this.toolbar.querySelector('[data-tool="group"]');
    const anchor = group?.closest(".split") ?? group;
    let after: Element | null = anchor;
    const words = messages().palette;
    for (const tool of tools) {
      // The entities of a C4 view keep their pictures: a figure, a cylinder, a box.
      const glyph = profile === "c4" ? (C4_TOOL_ICONS[tool.kind] ?? ICONS.box) : ICONS.box;
      const button = this.button(words.declared(tool.label), glyph, () =>
        this.arm(tool.kind as ElementKind),
      );
      button.setAttribute("data-tool", tool.kind);
      button.setAttribute("data-declared", "");
      // Like the rest of the palette, gone while the canvas is read-only or shows no diagram.
      button.setAttribute("data-write", "");
      button.setAttribute("data-drawing", "");
      button.addEventListener("pointerdown", (e) => this.paletteDrag(e, tool.kind as ElementKind));
      if (after) after.after(button);
      else this.toolbar.append(button);
      after = button;
    }
  }

  /**
   * Dragging a palette button onto the canvas creates the element where it is dropped. The release
   * is heard on the document, not captured by the button, so a drop is no click that arms the tool.
   * Only the release of the same pointer counts; a cancelled press (a touch the browser takes over)
   * or a window that loses the focus stops listening.
   */
  private paletteDrag(e: PointerEvent, kind: ElementKind): void {
    if (e.button !== 0) return;
    const pointer = e.pointerId;
    const button = e.currentTarget;
    const stop = () => {
      document.removeEventListener("pointermove", move, true);
      document.removeEventListener("pointerup", up, true);
      document.removeEventListener("pointercancel", cancel, true);
      window.removeEventListener("blur", stop);
      this.dropNoteOn(undefined);
    };
    // The note tool shows the element it would be attached to while it is over the canvas.
    const move = (event: PointerEvent) => {
      if (event.pointerId !== pointer || kind !== "note") return;
      this.dropNoteOn(this.noteTargetAtEvent(event));
    };
    const cancel = (event: PointerEvent) => {
      if (event.pointerId === pointer) stop();
    };
    const up = (event: PointerEvent) => {
      if (event.pointerId !== pointer) return;
      stop();
      // A press held until its menu opened is no drag: its release only lets the button go.
      if (this.held !== undefined && this.held === button) return;
      const rect = this.stage.getBoundingClientRect();
      const inside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
      if (inside) {
        this.arm(undefined);
        const at = this.snapPoint(this.diagramOf(this.pointOf(event)));
        // A sticky note dropped takes the button's colour, and pops in with its editor.
        if (kind === "sticky") {
          this.createSticky(at);
          return;
        }
        this.create(
          kind,
          at,
          SHAPED_TOOLS.has(kind)
            ? { shape: this.shape }
            : kind === "note"
              ? this.attachment(this.noteTargetAt(this.diagramOf(this.pointOf(event))))
              : {},
        );
      }
    };
    document.addEventListener("pointermove", move, true);
    document.addEventListener("pointerup", up, true);
    document.addEventListener("pointercancel", cancel, true);
    window.addEventListener("blur", stop);
  }

  private centre(): Point {
    const screen = this.screen();
    return { x: screen.width / 2, y: screen.height / 2 };
  }

  private setViewport(viewport: Viewport): void {
    this.viewport = viewport;
    this.layout();
  }

  private select(ids: string[], reveal = false): void {
    this.selection = ids;
    this.post({ type: "select", ids });
    if (this.showLayers) this.refreshLayers();
    if (reveal && ids.length > 0 && this.render) {
      const box = this.elements.get(ids[ids.length - 1]!)?.box;
      if (box) this.viewport = revealBox(this.viewport, this.render.offset, box, this.screen());
      this.layout();
    } else {
      this.drawOverlay();
    }
    this.announceSelection();
  }

  /** Says what is selected, as the drawing shown has it: its kind, id and text. */
  private announceSelection(): void {
    const ids = this.selection;
    const last = ids[ids.length - 1];
    const element = last ? this.elements.get(last) : undefined;
    const relation = last ? this.relations.get(last) : undefined;
    const words = messages().announcements;
    if (ids.length === 0) this.announce(words.nothingSelected);
    else if (ids.length > 1) this.announce(words.selected(ids.length));
    else if (element?.pen)
      this.announce(words.selectedStroke(element.id, element.pen.points.length));
    else if (element) {
      this.announce(words.selectedElement(element.kind, element.id, element.label));
    } else if (relation) {
      this.announce(
        words.selectedRelation(relation.from, relation.to, this.render?.profile === "sequence"),
      );
    } else if (last && this.events.has(last)) {
      this.announce(words.selectedEvent(this.events.get(last)!.kind, last));
    }
  }

  // ------------------------------------------------------------------ inline editor and menu

  private editLabel(id: string, renameId = false): void {
    // Labels and ids are not edited in place on a canvas that only shows.
    if (this.readOnly) {
      this.announce(messages().readOnly.refused);
      return;
    }
    const element = this.elements.get(id);
    const relation = this.relations.get(id);
    const event = relation ? undefined : this.events.get(id);
    if (event) {
      this.editEvent(event, renameId);
      return;
    }
    if (!element && !relation) return;
    if (this.stale) return;
    if (!renameId && (element?.kind === "icon" || element?.kind === "image")) {
      this.announce(messages().announcements.noLabel(element.kind));
      return;
    }
    // Enter and F2 open nothing on a stroke; Shift+F2 renames its id.
    if (!renameId && element?.pen) {
      this.announce(messages().announcements.strokeHasNoText);
      return;
    }
    const value = renameId
      ? relation && !relation.named
        ? ""
        : id
      : element
        ? element.label
        : (relation!.label ?? "");
    const words = messages().inline;
    this.openInline(
      { kind: element ? "element" : "relation", id, rename: renameId },
      value,
      renameId ? words.newId(id) : words.label(id),
    );
  }

  /** The inline editor of a note's text, a fragment's condition or a label, or of an id. */
  private editEvent(event: EventInfo, renameId: boolean): void {
    if (this.stale || this.render?.scenario !== null) return;
    const editable =
      event.kind === "note" ||
      event.kind === "fragment" ||
      event.kind === "divider" ||
      event.kind === "delay";
    if (!editable || (renameId && event.kind !== "note" && event.kind !== "fragment")) {
      this.announce(messages().announcements.nothingToEdit(event.kind));
      return;
    }
    if (!this.eventBox(event)) return;
    const words = messages().inline;
    this.openInline(
      { kind: "event", id: event.key, rename: renameId },
      renameId ? (event.key.includes("#") ? "" : event.key) : (event.label ?? ""),
      renameId ? words.newId(event.key) : words.text(event.key),
    );
  }

  /**
   * Opens the editor over the text of an element, a relation or an event: in the drawing's font,
   * size, weight, colour and alignment, the drawn text hidden while it is open. Ids and the texts
   * the drawing writes on one line take no line break.
   */
  private openInline(target: InlineTarget, value: string, label: string): void {
    this.closeInline();
    const place = this.textPlace(target);
    const multiline = !target.rename && place.lines;
    // A sticky note's words wrap at its card and shrink to fit: its editor does the same.
    const wrap =
      !target.rename &&
      target.kind === "element" &&
      this.elements.get(target.id)?.kind === "sticky";
    // A card of a list: Ctrl+Enter keeps its text and adds the next card after it, as on the stage.
    const parent = target.kind === "element" ? this.elements.get(target.id)?.parent : undefined;
    const inList = !target.rename && parent ? this.elements.get(parent)?.list : undefined;
    const keys = messages().inline;
    const editor = new InlineEditor({
      id: target.id,
      rename: target.rename,
      value,
      multiline,
      wrap,
      label,
      keys: inList ? `${keys.keys(multiline)} ${keys.nextCard}` : keys.keys(multiline),
      commit: () => this.commitInline(),
      cancel: () => this.cancelInline(),
      ...(inList
        ? {
            next: () => {
              this.commitInline();
              this.addNext(target.id);
            },
          }
        : {}),
    });
    this.inline = { editor, target };
    this.stage.append(editor.element);
    this.placeInline();
    editor.focus();
  }

  /**
   * Where the text of what the editor edits is drawn now. An id takes the place of the label it
   * stands over, on one line, in a monospace font; what the scene does not draw (an untitled
   * group, an event without text) gets the middle of its box.
   */
  private textPlace(target: InlineTarget): TextPlace {
    const element = target.kind === "element" ? this.elements.get(target.id) : undefined;
    const relation = target.kind === "relation" ? this.relations.get(target.id) : undefined;
    const event = target.kind === "event" ? this.events.get(target.id) : undefined;
    const drawn = element?.text ?? relation?.text ?? event?.text;
    const font =
      this.content.querySelector("svg")?.getAttribute("font-family") ?? "system-ui, sans-serif";
    const box = element?.box ??
      (relation ? (relation.labelBox ?? boxAround(relation.points)) : undefined) ??
      (event ? this.eventBox(event) : undefined) ?? { x: 0, y: 0, width: 0, height: 0 };
    const place = drawn ?? boxPlace(box, font);
    return target.rename ? { ...place, font: ID_FONT, lines: false } : place;
  }

  /**
   * Puts the open editor over its text at the current zoom and pan, and hides the drawn lines it
   * stands for: after it opens, after a render, and as the view moves.
   */
  private placeInline(): void {
    const inline = this.inline;
    if (!inline) return;
    const { editor, target } = inline;
    const place = this.textPlace(target);
    editor.show(place, this.viewport.zoom, this.screenOf(place.anchor));
    const turned = target.kind === "element" ? this.elements.get(target.id) : undefined;
    editor.turn(turned?.rotation ?? 0, this.screenOf(turned ? centerOf(turned.box) : place.anchor));
    const root = this.content.querySelector("svg");
    if (!root) return;
    const roles =
      target.kind === "element"
        ? ["element"]
        : target.kind === "relation"
          ? ["label"]
          : ["event", "label"];
    // A sticky note's lines are wrapped by the layout, not the label's own: every one is hidden.
    const nodes =
      turned?.kind === "sticky"
        ? wrappedLines(root, target.id)
        : drawnLines(root, target.id, roles, this.drawnText(target));
    for (const node of nodes) node.classList.add("mdg-editing");
  }

  /** The lines the drawing shows for what an editor edits. */
  private drawnText(target: InlineTarget): string[] {
    const element = target.kind === "element" ? this.elements.get(target.id) : undefined;
    const text =
      element?.label ??
      (target.kind === "relation"
        ? this.relations.get(target.id)?.label
        : this.events.get(target.id)?.label) ??
      "";
    if (target.kind === "event" && text === "") return ["⋯"];
    return element?.text?.lines === false ? [text] : text.split("\n");
  }

  /** Shows the drawn text the editor hid. */
  private showDrawnText(): void {
    for (const node of this.content.querySelectorAll(".mdg-editing")) {
      node.classList.remove("mdg-editing");
    }
  }

  /** Takes the editor away, the drawn text shown again unless `keepHidden` (a new text is coming). */
  private closeInline(keepHidden = false): void {
    const inline = this.inline;
    this.inline = undefined;
    inline?.editor.remove();
    if (!keepHidden) this.showDrawnText();
  }

  private commitInline(): void {
    const inline = this.inline;
    if (!inline) return;
    if (this.readOnly) {
      this.cancelInline();
      return;
    }
    const { editor, target } = inline;
    const id = target.id;
    const value = editor.value;
    if (target.rename) {
      this.closeInline();
      this.stage.focus({ preventScroll: true });
      const newId = value.trim();
      if (newId && newId !== id) this.act({ kind: "renameId", id, newId });
      return;
    }
    const element = this.elements.get(id);
    const current = element
      ? element.label
      : (this.relations.get(id)?.label ?? this.events.get(id)?.label ?? "");
    // The old text stays hidden until the drawing of the new one arrives, which says the selection
    // again with it.
    const changed = value !== current && this.act({ kind: "setLabel", id, label: value });
    if (changed) this.relabelled = id;
    this.closeInline(changed);
    this.stage.focus({ preventScroll: true });
  }

  private cancelInline(): void {
    this.closeInline();
    this.stage.focus({ preventScroll: true });
  }

  /** The context menu of a canvas that only shows: copy, the text, the model and the export. */
  private openReadOnlyMenu(at: Point): void {
    const elementIds = this.selection.filter((id) => this.elements.has(id));
    const primary = this.selection[this.selection.length - 1];
    const { menu: words, commands } = messages();
    const items: (MenuItem | "-")[] = [
      {
        label: words.copy,
        key: "Ctrl+C",
        disabled: elementIds.length === 0,
        run: () => this.command("copy"),
      },
      {
        label: words.showInText,
        disabled: !primary,
        run: () => primary && this.post({ type: "focusText", id: primary }),
      },
    ];
    if (this.render?.profile !== "sequence") items.push(...this.belowItems(at));
    if (this.render?.profile === "c4") {
      items.push({ label: words.openModel, run: () => this.post({ type: "openModel" }) });
    }
    items.push({ label: commands.exportSvg, run: () => this.post({ type: "export" }) });
    this.menu.open(items, this.mainPoint(at), this.main.getBoundingClientRect());
  }

  /**
   * "Select the shape below" for a menu opened at a point of the stage: the shape under the
   * selected one there, offered only where two or more shapes lie under the point.
   */
  private belowItems(at: Point): MenuItem[] {
    const point = this.diagramOf(at);
    if (this.stackAt(point).length < 2) return [];
    const { menu, keys } = messages();
    return [{ label: menu.selectBelow, key: keys.altClick, run: () => this.selectBelow(point) }];
  }

  private openMenu(at: Point): void {
    if (this.readOnly) {
      this.openReadOnlyMenu(at);
      return;
    }
    if (this.render?.profile === "sequence") {
      this.openSequenceMenu(at);
      return;
    }
    if (this.render?.profile === "c4") {
      this.openViewMenu(at);
      return;
    }
    const elementIds = this.selection.filter((id) => this.elements.has(id));
    const primary = this.selection[this.selection.length - 1];
    const relation = primary ? this.relations.get(primary) : undefined;
    const element = primary ? this.elements.get(primary) : undefined;
    const run = (command: CanvasCommand) => () => this.command(command);
    const { menu: words, commands, keys } = messages();
    const items: (MenuItem | "-")[] = [];
    if (element || relation) {
      // A stroke has no text to edit, and is no end of a relation; its id is renamed all the same.
      if (!element?.pen) {
        items.push({ label: words.editLabel, key: keys.enter, run: run("editLabel") });
      }
      items.push({ label: words.renameId, key: `${keys.shift}+F2`, run: run("renameId") });
    }
    if (element && element.kind !== "group" && !element.pen)
      items.push({ label: words.connectTo, key: "C", run: run("connect") });
    // Icon… opens the picker on the elements that take an icon; Remove icon takes theirs away.
    const iconTargets = this.iconTargets();
    if (iconTargets.length > 0) {
      items.push({
        label: words.icon,
        key: "I",
        data: { "data-menu": "icon" },
        run: () => {
          const point = this.mainPoint(at);
          this.openIconPicker(point, iconTargets, undefined, point.y);
        },
      });
    }
    const withIcons = elementIds.filter((id) => (this.elements.get(id)?.icon ?? null) !== null);
    if (withIcons.length > 0) {
      items.push({
        label: words.removeIcon,
        data: { "data-menu": "remove-icon" },
        run: () => this.removeIcons(withIcons),
      });
    }
    if (!relation) items.push(...this.belowItems(at));
    if (relation) {
      for (const routing of ["auto", "orthogonal", "polyline", "bezier"]) {
        items.push({
          label: words.routeKind(routing),
          run: () =>
            this.act({
              kind: "setField",
              ids: [relation.key],
              field: "style.routing",
              value: routing === "auto" ? null : routing,
            }),
        });
      }
      items.push(
        {
          label: relation.line === "solid" ? words.dashedLine : words.solidLine,
          run: () =>
            this.act({
              kind: "setField",
              ids: [relation.key],
              field: "line",
              value: relation.line === "solid" ? "dashed" : "solid",
            }),
        },
        {
          label: words.dottedLine,
          run: () =>
            this.act({ kind: "setField", ids: [relation.key], field: "line", value: "dotted" }),
        },
      );
    }
    if (items.length > 0) items.push("-");
    items.push(
      { label: words.cut, key: "Ctrl+X", disabled: elementIds.length === 0, run: run("cut") },
      { label: words.copy, key: "Ctrl+C", disabled: elementIds.length === 0, run: run("copy") },
      {
        label: words.paste,
        key: "Ctrl+V",
        run: () => this.act({ kind: "paste", at: this.diagramOf(at) }),
      },
      {
        label: words.duplicate,
        key: "Ctrl+D",
        disabled: elementIds.length === 0,
        run: run("duplicate"),
      },
      {
        label: words.delete,
        key: keys.delete,
        disabled: this.selection.length === 0,
        run: run("delete"),
      },
      "-",
      { label: words.group, key: "Alt+G", disabled: elementIds.length === 0, run: run("group") },
      {
        label: words.ungroup,
        key: `Alt+${keys.shift}+G`,
        disabled: element?.kind !== "group",
        run: run("ungroup"),
      },
      {
        label: words.convertToContainer,
        disabled: element?.kind !== (this.render?.profile === "free" ? "box" : "node"),
        run: () => {
          if (element) this.act({ kind: "convertToContainer", id: element.id });
        },
      },
      {
        label: words.rotate90,
        disabled: !element || !this.turns(element),
        run: () => {
          if (!element) return;
          const angle = ((element.rotation ?? 0) + 90) % 360;
          this.act({
            kind: "setField",
            ids: [element.id],
            field: "style.rotation",
            value: angle === 0 ? null : angle,
          });
        },
      },
      {
        label: words.resetRotation,
        disabled: !element || !this.turns(element) || !element.rotation,
        run: () => {
          if (element)
            this.act({ kind: "setField", ids: [element.id], field: "style.rotation", value: null });
        },
      },
      { label: words.alignLeft, disabled: elementIds.length < 2, run: run("alignLeft") },
      {
        label: words.alignCentre,
        disabled: elementIds.length < 2,
        run: () => this.act({ kind: "align", ids: elementIds, edge: "center" }),
      },
      { label: words.alignRight, disabled: elementIds.length < 2, run: run("alignRight") },
      { label: words.alignTop, disabled: elementIds.length < 2, run: run("alignTop") },
      {
        label: words.alignMiddle,
        disabled: elementIds.length < 2,
        run: () => this.act({ kind: "align", ids: elementIds, edge: "middle" }),
      },
      { label: words.alignBottom, disabled: elementIds.length < 2, run: run("alignBottom") },
      {
        label: words.distributeHorizontally,
        disabled: elementIds.length < 3,
        run: run("distributeHorizontal"),
      },
      {
        label: words.distributeVertically,
        disabled: elementIds.length < 3,
        run: run("distributeVertical"),
      },
      "-",
      {
        label: words.bringToFront,
        key: `Ctrl+${keys.shift}+]`,
        disabled: elementIds.length === 0,
        run: run("bringToFront"),
      },
      {
        label: words.bringForward,
        key: "Ctrl+]",
        disabled: elementIds.length === 0,
        run: run("bringForward"),
      },
      {
        label: words.sendBackward,
        key: "Ctrl+[",
        disabled: elementIds.length === 0,
        run: run("sendBackward"),
      },
      {
        label: words.sendToBack,
        key: `Ctrl+${keys.shift}+[`,
        disabled: elementIds.length === 0,
        run: run("sendToBack"),
      },
      "-",
      {
        label: words.showInText,
        disabled: !primary,
        run: () => primary && this.post({ type: "focusText", id: primary }),
      },
      {
        label: commands.arrangeUnplaced,
        run: () => this.act({ kind: "arrange", scope: "unplaced" }),
      },
      { label: commands.recomputeLayout, run: () => this.act({ kind: "arrange", scope: "all" }) },
      ...(this.render?.profile === "flow"
        ? [{ label: commands.convertToFree, run: run("convertToFree") }]
        : []),
      { label: commands.exportSvg, run: () => this.post({ type: "export" }) },
    );
    // At the point in the main area: the side panels may lie left of the stage.
    this.menu.open(items, this.mainPoint(at), this.main.getBoundingClientRect());
  }

  /** The context menu of a C4 view: local labels, the model's entities, placement. */
  private openViewMenu(at: Point): void {
    const elementIds = this.selection.filter((id) => this.elements.has(id));
    const primary = this.selection[this.selection.length - 1];
    const element = primary ? this.elements.get(primary) : undefined;
    const relation = primary ? this.relations.get(primary) : undefined;
    const run = (command: CanvasCommand) => () => this.command(command);
    const { menu: words, commands, keys } = messages();
    const items: (MenuItem | "-")[] = [];
    if (element || relation) {
      items.push(
        { label: words.labelInView, key: keys.enter, run: run("editLabel") },
        { label: words.renameInModel, key: `${keys.shift}+F2`, run: run("renameId") },
      );
    }
    if (element && element.kind !== "group") {
      items.push({ label: words.connectTo, key: "C", run: run("connect") });
    }
    if (!relation) items.push(...this.belowItems(at));
    if (items.length > 0) items.push("-");
    items.push(
      { label: commands.addFromModel, key: "A", run: () => this.addEntity(at) },
      { label: words.openModel, run: () => this.post({ type: "openModel" }) },
      {
        label: words.removeFromView,
        key: keys.delete,
        disabled: this.selection.length === 0,
        run: run("delete"),
      },
      "-",
      { label: words.alignLeft, disabled: elementIds.length < 2, run: run("alignLeft") },
      { label: words.alignTop, disabled: elementIds.length < 2, run: run("alignTop") },
      {
        label: words.distributeHorizontally,
        disabled: elementIds.length < 3,
        run: run("distributeHorizontal"),
      },
      "-",
      {
        label: words.showInText,
        disabled: !primary,
        run: () => primary && this.post({ type: "focusText", id: primary }),
      },
      {
        label: commands.arrangeUnplaced,
        run: () => this.act({ kind: "arrange", scope: "unplaced" }),
      },
      { label: commands.recomputeLayout, run: () => this.act({ kind: "arrange", scope: "all" }) },
      { label: commands.exportSvg, run: () => this.post({ type: "export" }) },
    );
    this.menu.open(items, this.mainPoint(at), this.main.getBoundingClientRect());
  }

  private openSequenceMenu(at: Point): void {
    const primary = this.selection[this.selection.length - 1];
    const element = primary ? this.elements.get(primary) : undefined;
    const relation = primary ? this.relations.get(primary) : undefined;
    const event = primary ? this.events.get(primary) : undefined;
    const run = (command: CanvasCommand) => () => this.command(command);
    const { menu: words, commands, keys } = messages();
    const items: (MenuItem | "-")[] = [];
    const preview = this.render?.scenario !== null;
    if (element || relation || event) {
      items.push(
        { label: words.editLabel, key: keys.enter, disabled: preview, run: run("editLabel") },
        {
          label: words.renameId,
          key: `${keys.shift}+F2`,
          disabled: preview,
          run: run("renameId"),
        },
      );
    }
    if (element && element.kind !== "group") {
      items.push({ label: words.messageTo, key: "C", disabled: preview, run: run("connect") });
    }
    // A `return` takes its line from the call it answers.
    if (relation && relation.returns === undefined) {
      items.push({
        label: relation.line === "solid" ? words.makeReply : words.makeCall,
        disabled: preview,
        run: () =>
          this.act({
            kind: "setField",
            ids: [relation.key],
            field: "message",
            value: relation.line === "solid" ? "reply" : "call",
          }),
      });
    }
    if (event) {
      items.push(
        { label: words.moveUp, key: `Alt+${keys.up}`, disabled: preview, run: run("moveEventUp") },
        {
          label: words.moveDown,
          key: `Alt+${keys.down}`,
          disabled: preview,
          run: run("moveEventDown"),
        },
      );
    }
    if (relation && relation.returns === undefined) {
      items.push({
        label: words.activateReceiver,
        key: "Alt+A",
        disabled: preview,
        run: run("toggleActivation"),
      });
    }
    if (event) {
      // The call around the event, through the fragments between them.
      let parent = event.parent;
      while (parent !== null && this.events.get(parent)?.kind === "fragment") {
        parent = this.events.get(parent)?.parent ?? null;
      }
      const inCall = parent !== null;
      const block = [...this.events.values()].some((e) => e.parent === event.key);
      items.push({
        label: words.nestInCall,
        key: "Alt+N",
        disabled: preview,
        run: run("nestInCall"),
      });
      if (block || inCall) {
        items.push({
          label: words.unnestCall,
          key: `Alt+${keys.shift}+N`,
          disabled: preview,
          run: run("unnestCall"),
        });
      }
      if ((relation && relation.returns === undefined) || inCall) {
        items.push({
          label: words.addReturn,
          key: "Alt+R",
          disabled: preview,
          run: run("addReturn"),
        });
      }
    }
    if (items.length > 0) items.push("-");
    items.push(
      { label: words.addNote, key: "O", disabled: preview, run: run("createSequenceNote") },
      {
        label: words.wrapInFragment,
        key: "F",
        disabled: preview,
        run: () => this.fragmentMenu(at),
      },
      { label: words.addDivider, disabled: preview, run: run("createDivider") },
      { label: words.addDelay, disabled: preview, run: run("createDelay") },
      "-",
      {
        label: words.delete,
        key: keys.delete,
        disabled: preview || this.selection.length === 0,
        run: run("delete"),
      },
      {
        label: words.showInText,
        disabled: !primary,
        run: () => primary && this.post({ type: "focusText", id: primary }),
      },
      { label: commands.exportSvg, run: () => this.post({ type: "export" }) },
    );
    this.menu.open(items, this.mainPoint(at), this.main.getBoundingClientRect());
  }
}

function centerOf(box: Box): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** The 16 × 16 picture of a kind of diagram, for its button and its item of New diagram. */
function diagramIcon(type: CreatableDiagram): SVGSVGElement {
  const picture = icon(DIAGRAM_ICONS[type]);
  picture.setAttribute("width", "16");
  picture.setAttribute("height", "16");
  return picture;
}

function boxAround(points: readonly Point[]): Box {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

function cssEscape(value: string): string {
  return value.replace(/["\\]/g, "\\$&");
}

/**
 * A turned element's rotation, as its drawing writes it (`rotate(a cx cy)`), in CSS terms: the
 * turn and the point it is about, in the drawing's units. Nothing for an upright one; undefined
 * for a transform of another form, which an animation in CSS would lose.
 */
function cssTurn(turn: string): { readonly rotate: string; readonly origin: string } | undefined {
  if (turn === "") return { rotate: "", origin: "0px 0px" };
  const match = /^rotate\((-?[\d.]+)[ ,]+(-?[\d.]+)[ ,]+(-?[\d.]+)\)$/.exec(turn.trim());
  if (!match) return undefined;
  return { rotate: `rotate(${match[1]}deg)`, origin: `${match[2]}px ${match[3]}px` };
}

/**
 * Every position a pointer went through since its last `pointermove`: a stylus reports far more
 * than one per frame, and a stroke drawn from the frames alone would lose its curves. The event
 * itself where the browser coalesces nothing.
 */
function coalesced(e: PointerEvent): readonly PointerEvent[] {
  const events = "getCoalescedEvents" in e ? e.getCoalescedEvents() : [];
  return events.length > 0 ? events : [e];
}

/**
 * Asks for SVG files with the system's file chooser, from inside the page (the playground's, or
 * the extension's webview), and reads them as text; a file that is no icon is answered refused,
 * unread. Nothing when the chooser is cancelled.
 */
function pickIconFiles(container: HTMLElement): Promise<PickedIcon[]> {
  return new Promise((resolve) => {
    const input = h("input", {
      type: "file",
      accept: ".svg,image/svg+xml",
      multiple: true,
      hidden: true,
      class: "icon-files",
    });
    const done = (picked: PickedIcon[]) => {
      input.remove();
      resolve(picked);
    };
    input.addEventListener("cancel", () => done([]));
    input.addEventListener("change", () => {
      const files = [...(input.files ?? [])];
      void Promise.all(
        files.map(async (file): Promise<PickedIcon> => {
          const refused = pickedRefusal(file.name, file.type, file.size);
          return refused !== undefined
            ? { file: file.name, svg: "", refused }
            : { file: file.name, svg: await file.text() };
        }),
      ).then(done);
    });
    container.append(input);
    input.click();
  });
}
