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
  bearing,
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
  zoomAt,
  zoomStep,
  arrowKindIn,
  arrowKindLine,
  arrowKinds,
  nextArrowKind,
  shapeOutline,
  shapeSize,
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
import { ICONS, clear, h, icon, s } from "./dom.js";
import { glyph, shapeIcon, type IconPlacement } from "./glyphs.js";
import { IconPicker } from "./icon-picker.js";
import { InlineEditor, boxPlace, drawnLines } from "./inline.js";
import { Inspector, ThemePanel } from "./inspector.js";
import { LayersPanel } from "./layers.js";
import { LibraryPanel } from "./library.js";
import { messages, type CanvasMessages } from "./messages/index.js";
import { Dialog, Menu, Picker, type MenuItem } from "./panels.js";
import { PresenceLayer } from "./presence-layer.js";
import { presenceMarks, readPeople, type PersonView, type PresenceShape } from "./presence.js";
import { placementIn } from "./placement.js";
import { ShapeGrid } from "./shape-grid.js";
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
}

/**
 * What the canvas needs from the page that hosts it: a channel to the session (VS Code's webview
 * messages, or the playground's session in the same page) and a place to keep its own state.
 */
export interface CanvasHostApi {
  post(message: CanvasMessage): void;
  getState(): PersistedState | undefined;
  setState(state: PersistedState): void;
}

/** What an inline editor edits: the label (or the id) of an element, a relation or an event. */
interface InlineTarget {
  readonly kind: "element" | "relation" | "event";
  readonly id: string;
  readonly rename: boolean;
}

/** Kinds created without opening the label editor: shapes are placed empty, as in draw.io. */
const QUIET_KINDS: ReadonlySet<string> = new Set([
  "node",
  "decision",
  "data",
  "box",
  "icon",
  "image",
]);

/** The font of an id typed in place: ids are code. */
const ID_FONT = 'ui-monospace, "Cascadia Mono", Menlo, Consolas, monospace';

type Drag =
  | { kind: "pan"; start: Point; viewport: Viewport }
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
    }
  | { kind: "resize"; id: string; handle: Handle; start: Point; box: Box; result: Box }
  /** A rotation handle dragged about the centre of the element's box (diagram coordinates). */
  | { kind: "rotate"; id: string; centre: Point; from: number; angle: number; moving: boolean }
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
  /** Sequence diagrams: a message, note or fragment dragged up or down, never above its space. */
  | { kind: "event"; key: string; start: Point; delta: number; min: number; moving: boolean }
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

/** The pictures of the kinds of group the group tool creates. */
const GROUP_ICONS = { group: ICONS.group, container: ICONS.plainContainer } as const;

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
  { kind: "note", key: "O", profile: "flow" },
  { kind: "tag", key: "T", profile: "flow" },
  { kind: "box", key: "B", profile: "free" },
  { kind: "text", key: "T", profile: "free" },
  { kind: "icon", key: "I", profile: "flow free" },
  { kind: "image", key: "M", profile: "free" },
  { kind: "participant", key: "P", profile: "sequence" },
  { kind: "actor", key: "A", profile: "sequence" },
  { kind: "group", key: "G" },
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
  /** Other people's selections, as the host's last `presence` message left them. */
  private presence: readonly PersonView[] = [];
  private stale = false;
  private drag: Drag | undefined;
  private tool: ElementKind | "relation" | undefined;
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
    { readonly token: number; readonly delta: Point; readonly gone?: boolean } | undefined;
  private previewAgain = false;
  private previewSent: string | undefined;
  /**
   * The stage shows a preview's drawing instead of the last render's: that of a move by `delta`
   * (zero for a resize). Undefined while it shows the last render.
   */
  private previewShown: { readonly delta: Point; readonly offset: Point } | undefined;
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
  /** What the group tool creates: a group with its title, or an untitled container. */
  private groupKind: "group" | "container" = "group";
  private groupButton: HTMLButtonElement | undefined;
  /** The grid of shapes behind the arrow of the box and node buttons, and F. */
  private readonly shapeGrid = new ShapeGrid();
  /** The main parts of the box and node buttons, which show the current shape. */
  private readonly shapeButtons = new Map<string, HTMLButtonElement>();
  /** The icon picker of the I tool, the inspector's Icon field and the context menu's Icon…. */
  private readonly iconPicker: IconPicker;
  /**
   * How a new icon is put on the canvas, chosen in the placement control of the picker or of the
   * Libraries panel: the icon as the shape until another is chosen, kept while the canvas is open.
   */
  private placement: IconPlacement = "icon";
  /** The icon the armed icon tool places where the stage is clicked. */
  private armedIcon: IconChoiceInfo | undefined;
  /** An icon dragged from the picker or the Libraries panel. */
  private iconDrag: IconDrag | undefined;
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
    });
    this.themePanel = new ThemePanel({
      token: (token, value) => this.post({ type: "themeToken", token, value }),
      close: () => this.post({ type: "editTheme", open: false }),
    });
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
    });
    this.libraryPanel.setPlacement(this.placement, false);
    this.iconPicker = new IconPicker({
      search: (query, token) => this.post({ type: "searchIcons", query, token }),
      placement: (placement) => this.setPlacement(placement),
      drag: (choice, event) => this.startIconDrag(choice, event),
    });
    this.tooltips = new Tooltips(root);
    this.buildToolbar();
    this.minimap.append(this.map, this.frame);
    // The minimap sits in the corner of the canvas, never over the inspector.
    this.stage.append(
      this.content,
      this.presenceLayer.element,
      this.overlay,
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
      this.iconPicker.element,
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
      case "render":
        this.applyRender(message);
        break;
      case "stale":
        this.stale = true;
        this.pending = false;
        this.queuedSlide = undefined;
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
        // A label refused is drawn as it was.
        if (!this.inline) this.showDrawnText();
        this.queued = { x: 0, y: 0 };
        this.queuedSlide = undefined;
        this.resetPreview();
        if (message.code === "edit.has-dependents" && message.dependents && message.retry) {
          const retry = message.retry;
          this.dialog.confirm(message.reason, message.dependents, () => this.act(retry));
        } else {
          this.announce(message.reason, true);
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
          if (had) this.inspector.element.focus();
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
    });
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
    return this.local.inspector ?? this.settings.inspector;
  }

  // ------------------------------------------------------------------ render

  private applyRender(render: CanvasRender): void {
    const previous = this.render;
    // Another diagram is another picture: the host sends the others' selections again after it.
    if (previous && previous.diagram !== render.diagram) this.presence = [];
    this.render = render;
    this.revision = render.revision;
    this.noDiagram = false;
    this.stale = false;
    this.content.classList.remove("stale");
    this.banner.hidden = true;
    this.empty.hidden = true;
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
    // A preview on the stage gives way to the render, which is the drop's when one was pending.
    if (!previous || previous.svg !== render.svg || this.previewShown) this.setSvg(render);
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
    if (wasPending && (this.queued.x !== 0 || this.queued.y !== 0)) {
      const delta = this.queued;
      this.queued = { x: 0, y: 0 };
      this.nudge(delta);
    }
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
    this.tool = undefined;
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
      this.stage.classList.remove("placing", "connecting");
      this.menu.close();
      this.picker.close();
      this.shapeGrid.close(false);
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
      this.iconPicker.close(false);
      this.endIconDrag();
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
        g?.setAttribute("aria-label", words.element(element.kind, element.label || element.id));
        // An element drawn as its icon (an icon shape, an icon object) is pressed anywhere on its
        // square, between the strokes of an outline icon too: an area of the canvas's own, under
        // the icon, which exports never have.
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
      // A render that comes while the editor is open draws the text it types over: hidden again.
      this.placeInline();
    }
    clear(this.map);
    this.map.innerHTML = render.svg;
  }

  /** Applies the viewport to every layer. */
  private layout(): void {
    const r = this.render;
    const v = this.viewport;
    this.content.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.zoom})`;
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

  /** The elements that can be seen (hidden layers left out), back to front as they are painted. */
  private painted(): ElementInfo[] {
    const order = (e: ElementInfo) => this.paint.get(e.id) ?? -1;
    return [...this.elements.values()]
      .filter((e) => !this.isHidden(e.layer))
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

  /** What a rubber band must hold to select an element: its box, and the label of an icon shape. */
  private extents(): Map<string, Box> {
    return new Map(
      [...this.elements.values()]
        .filter((e) => !this.isHidden(e.layer))
        .map((e) => [
          e.id,
          e.rotation
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
    if (element) {
      let box = element.box;
      if (drag?.kind === "move" && this.isMoving(id)) {
        box = { ...box, x: box.x + drag.delta.x, y: box.y + drag.delta.y };
      }
      if (drag?.kind === "resize" && drag.id === id) box = drag.result;
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
      return;
    }
    this.presenceLayer.draw(presenceMarks(this.presence, (id) => this.presenceShape(id)));
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
      if (element && !this.stale) this.drawElementHandles(element);
      if (relation && !this.stale && !sequence) this.drawRouteHandles(relation);
    }
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
    } else if (
      this.tool &&
      this.tool !== "relation" &&
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
    this.outlined = outlined;
  }

  private isMoving(id: string): boolean {
    const drag = this.drag;
    return drag?.kind === "move" && drag.moving && drag.ids.includes(id);
  }

  private drawElementHandles(element: ElementInfo): void {
    const box = this.screenBox(element.box);
    // A turned element's handles are drawn in its own frame, turned with it.
    const turn = this.turnAttributes(element.box, element.rotation);
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
    if (element.kind === "group") return;
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
    const shown = this.previewShown?.delta ?? { x: 0, y: 0 };
    const x = drag.delta.x - shown.x;
    const y = drag.delta.y - shown.y;
    const ids = this.render?.profile === "sequence" ? drag.ids : this.withContents(drag.ids);
    for (const id of ids) {
      // A participant's lifeline follows its head.
      for (const g of svg.querySelectorAll(
        `g[data-id="${cssEscape(id)}"][data-role="element"], g[data-id="${cssEscape(id)}"][data-role="lifeline"]`,
      )) {
        // A turned element moves with its rotation.
        const turn = CanvasApp.turnOf(g);
        const shifted = x === 0 && y === 0 ? turn : `translate(${x} ${y}) ${turn}`.trim();
        if (shifted === "") g.removeAttribute("transform");
        else g.setAttribute("transform", shifted);
      }
    }
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
        this.restoreDrawing();
        this.followPointer();
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
      delta: action.kind === "move" ? action.delta : { x: 0, y: 0 },
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
        },
        waiting.delta,
      );
    }
    this.followPointer();
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
    },
    delta: Point,
  ): void {
    const r = this.render!;
    this.putScene(scene);
    const dx = r.offset.x - scene.offset.x;
    const dy = r.offset.y - scene.offset.y;
    const root = this.content.querySelector("svg");
    if (root && (dx !== 0 || dy !== 0)) root.style.transform = `translate(${dx}px, ${dy}px)`;
    this.previewShown = { delta, offset: scene.offset };
    this.markTurns();
    this.hideLayers();
    this.styleSheetGrid();
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
    this.endPreview();
    if (this.previewShown) this.restoreDrawing();
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
    // A rotation under way is dropped.
    for (const g of this.content.querySelectorAll<SVGGElement>("g.turning")) {
      g.classList.remove("turning");
      g.style.transform = "";
      g.style.transformOrigin = "";
    }
    this.drag = undefined;
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

  private button(
    label: string,
    iconPaths: string,
    run: () => void,
    shortcut?: string,
  ): HTMLButtonElement {
    const button = h(
      "button",
      { type: "button", title: shortcut ? `${label} (${shortcut})` : label, "aria-label": label },
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

  /** Plays the diagram's `animate` effects on the canvas, or shows the static drawing again. */
  private readonly playButton: HTMLButtonElement = (() => {
    const button = this.button(messages().toolbar.playEffects, ICONS.play, () =>
      this.post({ type: "playEffects", on: !(this.render?.playing ?? false) }),
    );
    button.setAttribute("aria-pressed", "false");
    button.hidden = true;
    return button;
  })();

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
          words.palette.icon(p.key),
          ICONS.icon,
          () => this.toggleIconPicker(button),
          p.key,
        );
        button.setAttribute("data-tool", p.kind);
        button.setAttribute("aria-haspopup", "dialog");
        button.setAttribute("aria-expanded", "false");
        button.setAttribute("aria-controls", "mdg-icons");
        if (p.profile) button.setAttribute("data-profile", p.profile);
        return button;
      }
      const button = this.button(
        words.palette.hint(tools[p.kind], p.key),
        ICONS[p.kind],
        () => this.arm(p.kind),
        p.key,
      );
      button.setAttribute("data-tool", p.kind);
      // C4 views draw the model's entities and their scope's boundary only.
      if (p.kind === "group") button.setAttribute("data-not-profile", "c4");
      button.addEventListener("pointerdown", (e) => this.paletteDrag(e, p.kind));
      if (SHAPED_TOOLS.has(p.kind)) return this.shapesSplit(button, p.kind, p.profile);
      if (p.kind === "group") return this.groupSplit(button);
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
      this.toggle("inspector", words.toolbar.inspector, ICONS.inspector, () => {
        this.persist({ inspector: !this.showInspector });
        this.syncToggles();
      }),
      this.toggle("layers", words.toolbar.layers, ICONS.layers, () => {
        this.persist({ layers: !this.showLayers });
        this.syncToggles();
      }),
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
    ]) {
      element.setAttribute("data-drawing", "");
    }
    this.syncShapeButtons();
    this.syncToggles();
  }

  /**
   * The arrow part of a split button: a dropdown as tall as the button, with a chevron in the
   * text's colour, that opens a grid or a menu; its title names the menu and its key.
   */
  private splitArrow(label: string, open: (arrow: HTMLButtonElement) => void): HTMLButtonElement {
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
        title: label,
        "aria-label": label,
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
    const arrow = this.splitArrow(messages().toolbar.shapeMenu, (button) =>
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
    const arrow = this.splitArrow(messages().toolbar.arrowMenu, (button) =>
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
   * part offers a group with a title and an untitled container, where a choice becomes current
   * and arms the tool. Sequence diagrams have groups of participants only, and no arrow part.
   */
  private groupSplit(main: HTMLButtonElement): HTMLElement {
    this.groupButton = main;
    const arrow = this.splitArrow(messages().toolbar.groupMenu, (button) =>
      this.openGroupKinds(button),
    );
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
    button.setAttribute("aria-expanded", "true");
    this.menu.open(
      (["group", "container"] as const).map((kind) => {
        const picture = icon(GROUP_ICONS[kind]);
        picture.setAttribute("width", "16");
        picture.setAttribute("height", "16");
        return {
          label: names[kind],
          picture,
          checked: kind === this.groupKind,
          data: { "data-group-kind": kind },
          run: () => {
            this.groupKind = kind;
            this.syncGroupButton();
            this.arm("group");
          },
        };
      }),
      { x: rect.left - base.left, y: 0 },
      base,
      () => button.setAttribute("aria-expanded", "false"),
    );
  }

  /** The group button shows the current kind of group: its picture and its name. */
  private syncGroupButton(): void {
    const button = this.groupButton;
    if (!button) return;
    const words = messages();
    const name =
      this.groupKind === "group" ? words.palette.tools.group : words.toolbar.groupKinds.container;
    const label = words.palette.hint(name, "G");
    button.replaceChildren(icon(GROUP_ICONS[this.groupKind]));
    button.title = `${label} (G)`;
    button.setAttribute("aria-label", label);
    button.dataset.groupKind = this.groupKind;
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
      const label =
        this.shape === "rounded"
          ? words.hint(name, entry.key)
          : words.shaped(name, this.shape, entry.key);
      button.replaceChildren(shapeIcon(this.shape));
      button.title = `${label} (${entry.key})`;
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
    };
    for (const [name, button] of this.toggles)
      button.setAttribute("aria-pressed", String(states[name]));
    // The theme panel takes the inspector's place while it is open; without a drawing there are
    // no properties to show.
    this.inspector.element.hidden = !this.showInspector || this.themePanel.open || this.noDiagram;
    this.themePanel.element.hidden = !this.showInspector || !this.themePanel.open;
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
    this.playButton.hidden = r.effects === 0;
    this.playButton.setAttribute("aria-pressed", String(r.playing));
    this.playButton.title = r.playing ? words.toolbar.stopEffects : words.toolbar.playEffects;
    for (const button of this.toolbar.querySelectorAll<HTMLButtonElement>("[data-profile]")) {
      button.hidden = !forProfile(button.dataset.profile ?? "", r.profile);
    }
    this.declaredTools(r.tools ?? []);
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
    if (this.tool && this.tool !== "relation") {
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
    stage.addEventListener("pointerup", (e) => this.pointerUp(e));
    stage.addEventListener("pointercancel", () => this.resetPreview());
    stage.addEventListener("dblclick", (e) => this.doubleClick(e));
    stage.addEventListener("wheel", (e) => this.wheel(e), { passive: false });
    stage.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (this.storyPanel.active) return;
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
      if (!this.drag && this.borderStart) {
        this.borderStart = undefined;
        stage.classList.remove("connecting");
      }
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

  private pointerDown(e: PointerEvent): void {
    this.menu.close();
    this.picker.close();
    if (this.inline) this.commitInline();
    const point = this.pointOf(e);
    this.pointer = point;
    if (e.button === 2) return;
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
    if (e.button !== 0 || !this.render) return;
    const at = this.diagramOf(point);
    if (this.tool === "relation") {
      this.relationClick(this.hit(e.target), at, e.shiftKey);
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
      this.create(kind, at, SHAPED_TOOLS.has(kind) ? { shape: this.shape } : {});
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
      if (kind === "rotate") {
        const element = this.elements.get(hit.id)!;
        const angle = element.rotation ?? 0;
        this.drag = {
          kind: "rotate",
          id: hit.id,
          centre: centerOf(element.box),
          from: angle,
          angle,
          moving: false,
        };
        return;
      }
      if (kind === "resize") {
        const element = this.elements.get(hit.id)!;
        this.drag = {
          kind: "resize",
          id: hit.id,
          handle: arg as Handle,
          start: at,
          box: element.box,
          result: element.box,
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
      if (this.tool) this.drawOverlay();
      else this.hoverBorder(this.diagramOf(point), e.altKey, this.hit(e.target) !== undefined);
      return;
    }
    const at = this.diagramOf(point);
    const free = e.altKey;
    switch (drag.kind) {
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
        drag.delta = resolved.delta;
        drag.guides = resolved.guides;
        drag.target = free ? undefined : this.landingGroup(drag.ids, drag.delta);
        drag.free = free;
        this.followPointer();
        // Connectors, labels and groups follow as the drop will draw them.
        this.requestPreview();
        break;
      }
      case "resize": {
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
        // Steps of 15 degrees; Alt turns them off.
        const angle = bearing(drag.centre, at, free ? undefined : ROTATION_STEP);
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
        drag.point = free ? { x: Math.round(at.x), y: Math.round(at.y) } : this.snapPoint(at);
        drag.moving =
          drag.moving ||
          Math.hypot(at.x - drag.start.x, at.y - drag.start.y) * this.viewport.zoom >=
            DRAG_THRESHOLD;
        break;
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
    const drag = this.drag;
    this.stage.classList.remove("panning");
    if (this.stage.hasPointerCapture(e.pointerId)) this.stage.releasePointerCapture(e.pointerId);
    if (!drag) return;
    switch (drag.kind) {
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
          this.act({
            kind: "connect",
            from: drag.from,
            to: element,
            line: e.shiftKey ? "dashed" : "solid",
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
    const g = svg?.querySelector(
      `g[data-id="${cssEscape(relation)}"][data-role="relation"] [data-role="label"]`,
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

  /** Whether the canvas offers to turn an element: the elements of flow and free diagrams. */
  private turns(element: ElementInfo): boolean {
    const profile = this.render?.profile;
    return !this.readOnly && element.kind !== "group" && (profile === "flow" || profile === "free");
  }

  /** The angle an element is drawn at now: the rotation handle's while it turns it. */
  private angleOf(element: ElementInfo): number | undefined {
    const drag = this.drag;
    return drag?.kind === "rotate" && drag.id === element.id ? drag.angle : element.rotation;
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
   * Turns an element's drawing to `angle` while its rotation handle is dragged, about the centre
   * of its box in the coordinates of the drawing shown, easing between steps.
   */
  private turnDrawing(id: string, angle: number): void {
    const element = this.elements.get(id);
    const r = this.render;
    const g = this.content.querySelector<SVGGElement>(
      `g[data-id="${cssEscape(id)}"][data-role="element"]`,
    );
    if (!element || !r || !g) return;
    const offset = this.previewShown?.offset ?? r.offset;
    const c = centerOf(element.box);
    g.classList.add("turning");
    g.style.transformOrigin = `${c.x + offset.x}px ${c.y + offset.y}px`;
    g.style.transform = `rotate(${angle}deg)`;
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
    const union = unionBox(
      ids.map((id) => this.elements.get(id)?.box).filter((b): b is Box => b !== undefined),
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
    // Alt+clicks in a row go down a stack; they edit no label.
    if (this.storyPanel.active || e.altKey) return;
    // Pointer capture sends the double click to the stage; what is under the pointer counts.
    const hit = this.hit(document.elementFromPoint(e.clientX, e.clientY) ?? e.target);
    if (!hit) return;
    // Handles are redrawn between the two clicks, so their double clicks are told on the press;
    // but the handle that the first click puts in the middle of a relation lies on its label, and
    // a double click there edits the label, as on the rest of the line.
    if (hit.kind === "handle") {
      if (hit.handle?.startsWith("segment:") && this.relations.has(hit.id)) this.editLabel(hit.id);
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
        if (this.drag) this.resetPreview();
        else if (this.tool) this.arm(undefined);
        else this.select([]);
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
      case "delete":
        if (this.selection.length > 0)
          this.act({ kind: "remove", ids: this.selection, cascade: false });
        return;
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
      case "connect": {
        const from = primary && this.elements.has(primary) ? primary : undefined;
        if (!from) {
          this.announce(messages().announcements.connectFromFirst);
          return;
        }
        const anchor = this.mainPoint(this.screenOf(centerOf(this.elements.get(from)!.box)));
        this.picker.open(
          [...this.elements.values()]
            .filter((e) => e.id !== from && e.kind !== "group")
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
        this.act({ kind: "toggleActivation", ids: this.selection });
        return;
      case "addEntity":
        this.addEntity(this.centre());
        return;
      case "createIcon":
        // I opens the icon picker, and closes it again.
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
    } = {},
  ): boolean {
    if (this.readOnly) return false;
    // `rounded` is the shape without a style: the action carries no shape for it.
    const shape = extra.shape !== undefined && extra.shape !== "rounded" ? extra.shape : undefined;
    // The innermost group under the point holds the new element; groups nest too.
    const group = this.stackAt(at).find((e) => e.kind === "group");
    // A container is a group without a title.
    const container =
      kind === "group" &&
      this.groupKind === "container" &&
      this.render?.profile !== "sequence" &&
      extra.label === undefined;
    const label = container ? "" : extra.label;
    const sent = this.act({
      kind: "create",
      elementKind: kind,
      at,
      ...(group ? { parent: group.id } : {}),
      ...(label !== undefined ? { label } : {}),
      ...(extra.icon !== undefined ? { icon: extra.icon } : {}),
      ...(shape !== undefined ? { shape } : {}),
      ...(extra.source !== undefined ? { source: extra.source } : {}),
    });
    if (!sent) return false;
    const words = messages().announcements;
    this.announce(shape !== undefined ? words.createdShape(kind, shape) : words.created(kind));
    return true;
  }

  private snapPoint(point: Point): Point {
    const grid = this.settings.grid;
    return this.snap
      ? { x: Math.round(point.x / grid) * grid, y: Math.round(point.y / grid) * grid }
      : { x: Math.round(point.x), y: Math.round(point.y) };
  }

  private arm(tool: ElementKind | "relation" | undefined): void {
    // No tool places or connects anything on a canvas that only shows.
    if (this.readOnly && tool !== undefined) return;
    this.tool = this.tool === tool ? undefined : tool;
    this.relationFrom = undefined;
    if (this.tool !== "icon") this.armedIcon = undefined;
    this.stage.classList.toggle("placing", !!this.tool);
    this.syncToggles();
    const words = messages().announcements;
    if (this.tool === "relation") {
      if (this.render?.profile === "sequence") this.announce(words.pickSender);
      else this.announceArrowKind();
      this.stage.focus();
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
    // The current kind of arrow; Shift on this click swaps its solid and dashed lines.
    const kind = this.currentArrowKind();
    const { line, twoWay } = kind
      ? arrowKindLine(kind, dashed)
      : { line: dashed ? ("dashed" as const) : ("solid" as const), twoWay: false };
    this.announce(words.connected(from, id, line === "dashed", twoWay));
    this.act({ kind: "connect", from, to: id, line, ...(twoWay ? { twoWay } : {}) });
  }

  /** The palette of a declared type: one button per kind, after the free tools. */
  private declaredTools(tools: readonly { kind: string; label: string }[]): void {
    const key = tools.map((t) => `${t.kind}:${t.label}`).join("|");
    if (this.toolbar.dataset.declared === key) return;
    this.toolbar.dataset.declared = key;
    for (const old of this.toolbar.querySelectorAll("[data-declared]")) old.remove();
    const anchor = this.toolbar.querySelector('[data-tool="group"]');
    let after: Element | null = anchor;
    const words = messages().palette;
    for (const tool of tools) {
      const button = this.button(words.declared(tool.label), ICONS.box, () =>
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
      document.removeEventListener("pointerup", up, true);
      document.removeEventListener("pointercancel", cancel, true);
      window.removeEventListener("blur", stop);
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
        this.create(
          kind,
          this.snapPoint(this.diagramOf(this.pointOf(event))),
          SHAPED_TOOLS.has(kind) ? { shape: this.shape } : {},
        );
      }
    };
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
    const last = ids[ids.length - 1];
    const element = last ? this.elements.get(last) : undefined;
    const relation = last ? this.relations.get(last) : undefined;
    const words = messages().announcements;
    if (ids.length === 0) this.announce(words.nothingSelected);
    else if (ids.length > 1) this.announce(words.selected(ids.length));
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
    const editor = new InlineEditor({
      id: target.id,
      rename: target.rename,
      value,
      multiline,
      label,
      keys: messages().inline.keys(multiline),
      commit: () => this.commitInline(),
      cancel: () => this.cancelInline(),
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
    for (const node of drawnLines(root, target.id, roles, this.drawnText(target))) {
      node.classList.add("mdg-editing");
    }
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
    // The old text stays hidden until the drawing of the new one arrives.
    const changed = value !== current && this.act({ kind: "setLabel", id, label: value });
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
      items.push(
        { label: words.editLabel, key: keys.enter, run: run("editLabel") },
        { label: words.renameId, key: `${keys.shift}+F2`, run: run("renameId") },
      );
    }
    if (element && element.kind !== "group")
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
      items.push({ label: words.combineRelations, key: "C", run: run("connect") });
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
    if (relation) {
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
    if (relation) {
      items.push({
        label: words.activateReceiver,
        key: "Alt+A",
        disabled: preview,
        run: run("toggleActivation"),
      });
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
