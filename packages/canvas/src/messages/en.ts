import type {
  ArrowKind,
  CreatableDiagram,
  FragmentOperator,
  SceneActionKind,
  ShapeName,
  ZOrder,
} from "@meltemi/diagrams-editor/canvas";
import { plural } from "@meltemi/diagrams-i18n";

/** The names of the shapes of boxes and nodes, by their value in the language. */
const SHAPE_NAMES = {
  rounded: "rounded",
  rectangle: "rectangle",
  square: "square",
  ellipse: "ellipse",
  circle: "circle",
  diamond: "diamond",
  cylinder: "cylinder",
  pill: "pill",
  triangle: "triangle",
  parallelogram: "parallelogram",
  trapezoid: "trapezoid",
  pentagon: "pentagon",
  hexagon: "hexagon",
  octagon: "octagon",
  star: "star",
  cloud: "cloud",
  document: "document",
  callout: "callout",
  arrow: "arrow",
  framed: "framed",
  flag: "flag",
  person: "person",
  agent: "agent",
  icon: "icon",
} satisfies Record<ShapeName, string>;

/** The name of a shape; a value that is not one is shown as written. */
const shapeName = (shape: string): string =>
  Object.hasOwn(SHAPE_NAMES, shape) ? SHAPE_NAMES[shape as ShapeName] : shape;

/** The names of the kinds of arrow of the palette's relation tool. */
const ARROW_NAMES = {
  "->": "arrow",
  "-->": "dashed arrow",
  "--": "line",
  "---": "dashed line",
  "<->": "two-way arrow",
  "<-->": "dashed two-way arrow",
} satisfies Record<ArrowKind, string>;

/** "a hexagon", "an ellipse". */
const withArticle = (word: string) => `${/^[aeiou]/i.test(word) ? "an" : "a"} ${word}`;

/**
 * The canvas's own words in English. Kinds, operators, values and ids are code and stay as they
 * are written; sentences with values are functions, so that each language builds its own grammar.
 */
export const en = {
  /** The toolbar: its pickers, buttons and toggles, and the titles that explain them. */
  toolbar: {
    label: "Canvas tools",
    diagram: "Diagram",
    scenario: "Scenario",
    scenarioTitle: "Preview one scenario read-only, or every event",
    allEvents: "All events",
    story: "Story",
    storyTitle: "Play a story of the file, read-only, with its timeline",
    editDiagram: "Edit the diagram",
    storyOption: (id: string, title: string | null) =>
      title ? `Story: ${id} — ${title}` : `Story: ${id}`,
    relation: "Relation: click the source, then the target",
    message: "Message: click the sender, then the receiver",
    /** The title of the relation tool: its label, its key and the dashed variant. */
    relationTitle: (label: string) => `${label} (R; Shift for dashed)`,
    /** The title of the relation tool where it has kinds of arrow (flow, free and C4). */
    relationKindsTitle: (label: string) =>
      `${label} (R; R again for the next kind of arrow; Shift swaps solid and dashed)`,
    /** The arrow part of the relation tool, which opens the kinds of arrow. */
    arrowMenu: "Kinds of arrow",
    /** What the relation arrow's key does, in its title: R cycles the kinds. */
    arrowMenuKey: "R cycles",
    /** The arrow part of the box (free) or node (flow) tool, which opens the shapes. */
    shapeMenu: "More shapes",
    /** The arrow part of the group tool, which offers a group with a title or a plain container. */
    groupMenu: "Group or container",
    /** The same on free diagrams, where it offers the two lists too. */
    groupMenuLists: "Group, container, column or row",
    /**
     * The kinds of group the group tool creates: a band with a title, an untitled container, and
     * on free diagrams a column or a row, a list that places what it holds one after the other.
     */
    groupKinds: { group: "Group", container: "Container", column: "Column", row: "Row" },
    /** The arrow part of the pen tool, which opens the pen menu. */
    penMenu: "Pen and highlighter: width and colour",
    /** The arrow part of the sticky note button, which picks the colour of new sticky notes. */
    stickyMenu: "Colour of new sticky notes",
    /** The button beside the diagram picker that adds a diagram to the file. */
    newDiagram: "New diagram",
    connect: "Connect the selected element to…",
    moreParticipants: "More participants",
    note: "Note over the selection",
    fragment: "Fragment around the selected events",
    divider: "Divider",
    delay: "Delay",
    zoom: "Zoom",
    zoomOut: "Zoom out",
    zoomIn: "Zoom in",
    fitDiagram: "Fit the diagram",
    /** Options of the zoom picker besides the percentages. */
    fit: "Fit",
    selection: "Selection",
    /** A zoom factor as a percentage: `1.5` is "150%". */
    percent: (zoom: number) => `${Math.round(zoom * 100)}%`,
    /** The Pointer tool's toggle: a trail that points at the diagram and edits nothing. */
    pointer: "Pointer",
    grid: "Show the grid",
    snap: "Snap to the grid and guides",
    minimap: "Show the minimap",
    inspector: "Show the properties",
    layers: "Show the layers",
    /** The toggle of the Libraries panel; its title adds the key, U. */
    libraries: "Libraries",
    arrange: "Arrange",
    playEffects: "Play effects",
    pauseEffects: "Pause effects",
  },

  /** Commands that the toolbar and the context menus both offer. */
  commands: {
    addFromModel: "Add from the model…",
    arrangeUnplaced: "Arrange unplaced elements",
    recomputeLayout: "Recompute layout",
    convertToFree: "Convert to free composition",
    exportSvg: "Export SVG",
  },

  /**
   * Names of keys in shortcuts and keyboard help. Letters, digits, punctuation, Ctrl, Alt and the
   * function keys stay as they are.
   */
  keys: {
    shift: "Shift",
    enter: "Enter",
    delete: "Delete",
    up: "Up",
    down: "Down",
    /** The gesture beside "Select the shape below". */
    altClick: "Alt+click",
  },

  /** The palette: tools named by the kind of element they place. */
  palette: {
    tools: {
      node: "Node",
      decision: "Decision",
      data: "Data store",
      note: "Note",
      tag: "Tag",
      box: "Box",
      text: "Text",
      /** Free diagrams: a square card of paper whose words wrap and shrink to fit it. */
      sticky: "Sticky note",
      icon: "Icon",
      image: "Image",
      participant: "Participant",
      actor: "Actor",
      group: "Group",
      boundary: "Boundary",
      control: "Control",
      entity: "Entity",
      database: "Database",
      collections: "Collections",
      queue: "Queue",
      /** Free diagrams: freehand strokes, highlighter marks, and the eraser of strokes. */
      pen: "Pen",
      highlighter: "Highlighter",
      eraser: "Eraser",
    },
    /** The label of a tool: its name, then how to use it; its key is in its title. */
    hint: (name: string) => `${name}: click on the canvas`,
    /** The label of the box or node tool, with the shape it places (a value of the language). */
    shaped: (name: string, shape: string) => `${name}, ${shapeName(shape)}: click on the canvas`,
    /** The box or node tool with its shape, as its title names it before the key. */
    shapedTool: (name: string, shape: string) => `${name}, ${shapeName(shape)}`,
    /** The label of a tool of a declared type, named by the type. */
    declared: (name: string) => `${name}: click on the canvas`,
    /** The label of the icon tool, which opens the icon picker; its key is in its title. */
    icon: "Icon: find one for the selection or to place",
  },

  /** The operators of a new fragment, each with what it means; the operators stay as written. */
  fragments: {
    alt: "alt: alternatives",
    opt: "opt: optional",
    loop: "loop: repeated",
    par: "par: parallel",
    break: "break: ends the interaction",
    critical: "critical: atomic",
    region: "region: labelled",
  } satisfies Record<FragmentOperator, string>,

  /** The badge of the toolbar, which names the mode of the canvas, and its titles. */
  mode: {
    story: "story",
    storyTitle: "A read-only story; pick “Edit the diagram” to edit.",
    sequence: "sequence",
    sequenceTitle:
      "Drag a participant sideways to reorder it, and a message, note or fragment down to space it. Alt+Up and Alt+Down move the selected event.",
    preview: "scenario preview",
    previewTitle: "A read-only preview of one scenario; pick “All events” to edit.",
    /** The layout statement of the diagram, which is code. */
    layout: (mode: string) => `layout ${mode}`,
    auto: "ELK arranges this diagram; moving a box writes every position and switches to assisted.",
    assisted: "Placed boxes stay; ELK arranges the others.",
    manual: "Every box has a written position.",
  },

  /** The drawing area, its minimap, and what it shows when the text has problems. */
  stage: {
    roleDescription: "diagram canvas",
    label: "Diagram canvas. Tab selects elements, arrows move them, Enter edits the label.",
    minimap: "Minimap",
    /** The banner over the last drawing while the text has errors. */
    outOfDate: (count: number, message: string, line: number) =>
      `Out of date · ${count} ${plural("en", count, { one: "problem", other: "problems" })}: ${message} (line ${line})`,
    /** What the canvas shows instead of a drawing when the text has never been drawn. */
    fixIt: (message: string, line: number) =>
      `${message}\nLine ${line}. Fix it in the text, or use the quick fix there.`,
    /** What assistive technology reads for a drawn element. */
    element: (kind: string, label: string) => `${kind} ${label}`,
    /** What assistive technology reads for a pen stroke, which has no label: its id and points. */
    stroke: (id: string, count: number) =>
      `Stroke ${id}, ${count} ${plural("en", count, { one: "point", other: "points" })}`,
    /** The buttons under the message of a file without diagrams, which create one. */
    create: "Create a diagram",
  },

  /** The kinds of diagram the canvas creates, in a file without diagrams and from New diagram. */
  diagrams: {
    flow: "Flow diagram",
    free: "Free composition",
    sequence: "Sequence diagram",
  } satisfies Record<CreatableDiagram, string>,

  /** What the status line says, which screen readers announce. */
  announcements: {
    fixFirst: "Fix the problems in the text before editing on the canvas.",
    /** An effect was turned on while the diagram's effects are paused. */
    effectsPaused: "Effects paused; press Play effects to see them.",
    nothingSelected: "Nothing selected.",
    selected: (count: number) => `${count} selected.`,
    /** An empty shape has no label to say. */
    selectedElement: (kind: string, id: string, label: string) =>
      label === "" ? `${kind} ${id} selected.` : `${kind} ${id}, ${label}, selected.`,
    selectedRelation: (from: string, to: string, message: boolean) =>
      `${message ? "Message" : "Relation"} ${from} to ${to} selected.`,
    selectedEvent: (kind: string, key: string) => `${kind} ${key} selected.`,
    /** A pen stroke selected: its id and how many points it has. */
    selectedStroke: (id: string, count: number) =>
      `Stroke ${id}, ${count} ${plural("en", count, { one: "point", other: "points" })}, selected.`,
    /** Alt+click: the element selected in the stack under the pointer, counted from the top. */
    selectedBelow: (kind: string, id: string, label: string, index: number, count: number) =>
      `${kind} ${id}${label === "" ? "" : `, ${label},`} selected: ${index} of ${count} under the pointer.`,
    /** What is selected on a frame of a story. */
    selectedOnFrame: (ids: readonly string[]) => `Selected ${ids.join(", ")}.`,
    moved: (ids: readonly string[]) =>
      `Moved ${ids.length === 1 ? ids[0] : `${ids.length} elements`}.`,
    movedBy: (ids: readonly string[], dx: number, dy: number) =>
      `Moved ${ids.length === 1 ? ids[0] : `${ids.length} elements`} by ${dx}, ${dy}.`,
    /** A drag that dropped the selection into a group, or out of every group (null). */
    movedInto: (ids: readonly string[], group: string | null) =>
      `Moved ${ids.length === 1 ? ids[0] : `${ids.length} elements`} ${group === null ? "to the top level" : `into ${group}`}.`,
    /** A message, note or fragment dragged down (a positive distance) or up. */
    eventMoved: (key: string, distance: number) =>
      distance > 0 ? `${key} moved ${distance} down.` : `${key} moved ${-distance} up.`,
    movedVertically: (id: string, direction: "up" | "down") => `Moved ${id} ${direction}.`,
    movedSideways: (id: string, direction: "left" | "right") => `Moved ${id} ${direction}.`,
    space: (id: string, space: number) => `Space above ${id}: ${space}.`,
    resized: (id: string, width: number, height: number) => `${id} is ${width} × ${height}.`,
    reordered: (ids: readonly string[], to: ZOrder) =>
      `Moved ${ids.length === 1 ? ids[0] : "the selection"} ${to}.`,
    converted: "Converted to a free composition.",
    /** A new diagram of the file, which the canvas shows once it is written. */
    createdDiagram: (type: CreatableDiagram) =>
      `Created a ${{ flow: "flow diagram", free: "free composition", sequence: "sequence diagram" }[type]}.`,
    previewReadOnly: "A scenario preview is read-only; pick “All events” to edit.",
    connectFromFirst: "Select the element to connect from first.",
    selectEventToMove: "Select a message, note, fragment or event to move.",
    noEntities: "Every entity this view can draw is already in it.",
    added: (path: string) => `Added ${path} to the view.`,
    created: (kind: string) => `Created a ${kind}.`,
    /** A box or node of a shape other than `rounded`. */
    createdShape: (kind: string, shape: string) =>
      `Created ${withArticle(shapeName(shape))} ${kind}.`,
    place: (kind: string) => `Click on the canvas to place the ${kind}. Escape cancels.`,
    placeShape: (kind: string, shape: string) =>
      `Click on the canvas to place the ${shapeName(shape)} ${kind}. Escape cancels.`,
    /** The kind of arrow the relation tool creates, chosen or cycled with R. */
    arrowKind: (kind: string) => {
      const name = Object.hasOwn(ARROW_NAMES, kind) ? ARROW_NAMES[kind as ArrowKind] : kind;
      return `${name.charAt(0).toUpperCase()}${name.slice(1)} (${kind}).`;
    },
    pickSender: "Click the participant that sends the message. Escape cancels.",
    pickSource: "Click the element the relation starts from. Escape cancels.",
    pickTargetOf: (from: string) => `Click the element to connect ${from} to, or press Escape.`,
    pickStart: "Click an element to start the relation, or press Escape.",
    fromSender: (id: string) => `From ${id}: click the receiver. Shift makes it a reply (dashed).`,
    /** The source is chosen; Shift swaps the line of the kind of arrow, dashed or not. */
    fromSource: (id: string, dashed = false) =>
      `From ${id}: click the target. Shift makes it ${dashed ? "solid" : "dashed"}.`,
    anotherElement: "Click another element: a relation joins two.",
    connected: (
      from: string,
      to: string,
      dashed: boolean,
      heads: "end" | "both" | "none" = "end",
    ) =>
      `Connected ${from} to ${to}${heads === "both" ? ", both ways" : heads === "none" ? " with a line" : ""}${dashed ? ", dashed" : ""}.`,
    /** An icon or an image, which have no label to edit in place. */
    noLabel: (kind: string) => `An ${kind} has no label; change it in the properties.`,
    nothingToEdit: (kind: string) => `A ${kind} has nothing to edit here; see the properties.`,
    /** Enter or F2 on a pen stroke, which has no text to edit in place. */
    strokeHasNoText: "A stroke has no text; change its colour, width and heads in the properties.",
    /** A connector's end dropped on a named port or a point of a side. */
    endPinned: (relation: string, element: string, port: string, position?: number) =>
      position === undefined
        ? `${relation} now ends at ${element}.${port}.`
        : `${relation} now ends at ${element}, ${port} side at ${position}%.`,
    /** A connector's end handed back to the layout. */
    endFree: (relation: string) => `The layout places this end of ${relation}.`,
    /** The relation tool dragged on empty canvas of a free diagram: a line is being drawn. */
    drawingLine: "Drawing a line: release to place it. Shift keeps it at 45°, Escape cancels.",
    /** A free line drawn, from its first point to its last, in diagram units. */
    lineDrawn: (from: { x: number; y: number }, to: { x: number; y: number }) =>
      `Drew a line from (${from.x}, ${from.y}) to (${to.x}, ${to.y}).`,
    lineTooShort: "A line needs two different points: drag further.",
    lineCancelled: "No line drawn.",
    pointerOn: "Pointer on: drag to point at the diagram. Escape or K puts it away.",
    pointerOff: "Pointer off.",
    lineReshaped: (id: string) => `Moved a point of ${id}.`,
    lineBendAdded: (id: string) => `Added a bend to ${id}.`,
    lineBendRemoved: (id: string) => `Removed a bend of ${id}.`,
    /** The icon picker armed the icon tool with an icon, named by its label. */
    placeIcon: (label: string) =>
      `Click on the canvas to place ${label}, or on a shape to give it the icon. Escape cancels.`,
    /** An icon chosen for the selection, or dropped on an element. */
    iconSet: (label: string, ids: readonly string[]) =>
      `${label} is the icon of ${ids.length === 1 ? ids[0] : `${ids.length} elements`}.`,
    /** An icon placed on the canvas from the picker or a library. */
    iconAdded: (label: string) => `Added ${label}.`,
    iconsRemoved: (ids: readonly string[]) =>
      `Removed the icon of ${ids.length === 1 ? ids[0] : `${ids.length} elements`}.`,
    /** The pen, the highlighter or the eraser armed: how to use it, and how to put it away. */
    penArmed:
      "Pen: drag on the canvas to draw; Shift keeps a stroke straight. P or Escape puts it away.",
    highlighterArmed: "Highlighter: drag over what to mark. H or Escape puts it away.",
    eraserArmed: "Eraser: drag across the strokes to erase. E or Escape puts it away.",
    /** A stroke written with the pen or the highlighter, by the points it kept. */
    penDrawn: (count: number) =>
      `Drew a stroke of ${count} ${plural("en", count, { one: "point", other: "points" })}.`,
    /** Escape while a stroke is drawn: nothing is written, and the tool stays in the hand. */
    strokeCancelled: "No stroke drawn.",
    /** The strokes the eraser took, in one step. */
    erased: (count: number) =>
      `Erased ${count} ${plural("en", count, { one: "stroke", other: "strokes" })}.`,
    /** Escape while erasing, or a drag that crossed no stroke. */
    nothingErased: "Nothing erased.",
    /** A colour chosen in the sticky note button's menu: a colour's name, or null for the theme's. */
    stickyColour: (name: string | null) =>
      name === null
        ? "New sticky notes take the theme's colour."
        : `New sticky notes are ${name.toLowerCase()}.`,
    /** A column or a row created with the group tool. */
    createdList: (layout: "column" | "row") =>
      `Created a ${layout === "column" ? "column" : "row"}.`,
    /** A sticky note added to the end of a column, or after a card, by its + or Ctrl+Enter. */
    addedSticky: (list: string) => `Added a sticky note to ${list}.`,
    /** A column added to a row by its + or Ctrl+Enter. */
    addedColumn: (list: string) => `Added a column to ${list}.`,
    /** Elements dropped into a list, or moved in it: where they went, counted from 1. */
    movedInList: (ids: readonly string[], list: string, position: number, count: number) =>
      `Moved ${ids.length === 1 ? ids[0] : `${ids.length} elements`} to ${position} of ${count} in ${list}.`,
    /** Alt+Up or Alt+Down: the card moved before or after its neighbour. */
    movedPast: (id: string, neighbour: string, list: string, before: boolean) =>
      `Moved ${id} ${before ? "before" : "after"} ${neighbour} in ${list}.`,
    /** Alt+Up on the first card of a list, Alt+Down on the last: nothing moves. */
    listEnd: (id: string, list: string, first: boolean) =>
      `${id} is already ${first ? "first" : "last"} in ${list}.`,
    /** Ctrl+Enter with nothing that is in a list, or a list, selected. */
    noListToAdd: "Select a list, or a card of one, to add to it.",
    /** Alt+Up or Alt+Down with nothing that is in a list selected. */
    noListToMove: "Select a card of a list to move it among its neighbours.",
  },

  /** The labels of the editor that opens in place over an element, a relation or an event. */
  inline: {
    label: (id: string) => `Label of ${id}`,
    text: (id: string) => `Text of ${id}`,
    newId: (id: string) => `New id for ${id}`,
    /** The keys of the editor, said to assistive technology. */
    keys: (multiline: boolean): string =>
      multiline
        ? "Enter or Tab keeps the text, Shift+Enter starts a new line, Escape cancels."
        : "Enter or Tab keeps the text, Escape cancels.",
    /** Said after the keys in the editor of a card of a list. */
    nextCard: "Ctrl+Enter keeps it and adds the next card.",
  },

  /** The context menus of the canvas and the toolbar's Arrange menu. */
  menu: {
    label: "Canvas actions",
    editLabel: "Edit label",
    renameId: "Rename id",
    connectTo: "Connect to…",
    /** The shape painted below the selected one, under the point the menu opened at. */
    selectBelow: "Select the shape below",
    /** A route kind, which is a value of the language. */
    routeKind: (routing: string) => `Route kind: ${routing}`,
    solidLine: "Solid line",
    dashedLine: "Dashed line",
    dottedLine: "Dotted line",
    cut: "Cut",
    copy: "Copy",
    paste: "Paste",
    duplicate: "Duplicate",
    delete: "Delete",
    group: "Group",
    ungroup: "Ungroup",
    /** A flow node or a free box becomes a group holding the boxes stacked on it. */
    convertToContainer: "Convert to container",
    /** Turns the selected element a quarter turn clockwise. */
    rotate90: "Rotate 90°",
    /** Removes the selected element's rotation. */
    resetRotation: "Reset rotation",
    alignLeft: "Align left",
    alignCentre: "Align centre",
    alignRight: "Align right",
    alignTop: "Align top",
    alignMiddle: "Align middle",
    alignBottom: "Align bottom",
    distributeHorizontally: "Distribute horizontally",
    distributeVertically: "Distribute vertically",
    bringToFront: "Bring to front",
    bringForward: "Bring forward",
    sendBackward: "Send backward",
    sendToBack: "Send to back",
    showInText: "Show in text",
    labelInView: "Label in this view",
    renameInModel: "Rename in the model",
    openModel: "Open the model",
    removeFromView: "Remove from the view",
    messageTo: "Message to…",
    makeReply: "Make it a reply",
    makeCall: "Make it a call",
    moveUp: "Move up",
    moveDown: "Move down",
    activateReceiver: "Activate the receiver",
    /** Sequence diagrams: the selected events into the block of the call before them. */
    nestInCall: "Nest in the call",
    unnestCall: "Unnest the call",
    /** Sequence diagrams: a `return` at the end of the call's block. */
    addReturn: "Return to the caller",
    addNote: "Add a note",
    wrapInFragment: "Wrap in a fragment…",
    addDivider: "Add a divider",
    addDelay: "Add a delay",
    /** Opens the icon picker on the selection. */
    icon: "Icon…",
    removeIcon: "Remove icon",
  },

  /** The property inspector and its style strip: the words the canvas adds to the fields. */
  inspector: {
    label: "Properties",
    /** The button in the panel's head that folds it to its rail. */
    hidePanel: "Hide the properties panel",
    /** The rail's button, which unfolds the panel. */
    showPanel: "Show the properties panel",
    strip: "Style",
    effects: "Effects",
    /** What the Effects row says when no effect is on. */
    effectsOff: "off",
    /** The disclosure button of an effect's card, named so that it never shares the toggle's name. */
    effectSettings: (effect: string) => `${effect}: settings`,
    /** The unit after the duration in a card's header. */
    milliseconds: "ms",
    /** The selected targets have different values. */
    mixed: "mixed",
    /** Without a written value the theme decides. */
    theme: "theme",
    /** The first option of a select, when nothing is written. */
    defaultFromTheme: "default (theme)",
    defaultOf: (value: string) => `default (${value})`,
    /** The chip of a colour row that inherits the theme's colour again. */
    themeChip: "Theme",
    inherit: (label: string) => `${label}: inherit`,
    inheritTitle: "Inherit from the theme",
    inherited: (value: string) => `${value} (inherited)`,
    ownColour: (field: string) => `${field}: a colour of one's own`,
    ownColourTitle: "A colour of one's own, which stays when the theme changes",
    /** The chip of a picture row that goes back to what applies without a written value. */
    defaultChip: "Default",
    defaultNamed: (name: string) => `Default: ${name}`,
    /** What a picture row shows when nothing is written and nothing applies. */
    defaultValue: "default",
    /** What applies without a written value. */
    byDefault: (name: string) => `${name} (default)`,
    use: (value: string) => `Use ${value}`,
    /** The slider beside a number with bounds, such as the corner radius. */
    slider: (label: string) => `${label}, slider`,
    /** A cell of the alignment picker: where the text goes across, and down for a box. */
    alignCell: (across: string, down?: string) => (down ? `${across}, ${down}` : across),
    /** The alignment picker's chip that takes both written alignments away. */
    alignInherit: "Inherit the alignment: remove both",
    newTheme: "New theme from this one…",
    editTheme: "Edit theme…",
    chooseIcon: "Choose an icon",
    choose: "Choose…",
    /** The Icon field's second button, which takes the written icon away. */
    remove: "Remove",
    removeIcon: "Remove the icon",
    /** The Icon field without an icon. */
    noIcon: "No icon",
    /** The Icon field on an icon that no pack has, which no thumbnail will ever show. */
    iconMissing: (name: string) => `${name} (not found)`,
    iconMissingTitle: (reference: string) =>
      `No pack has the icon ${reference}: check its name, or choose another.`,
    /** Takes a written value away, so the default applies again (the icon size). */
    clear: "Clear",
    clearTitle: "Remove the written value: the default applies",
    /**
     * How a select shows the words of the protocol among its options (effects on or off, an
     * external entity, the kind of a message); values of the language are shown as written.
     */
    options: {
      on: "on",
      off: "off",
      yes: "yes",
      no: "no",
      call: "call",
      reply: "reply",
      async: "async",
      /** The diagram's Canvas field: no `preset` nor `canvas`, or a width and height of one's own. */
      fit: "fit to content",
      custom: "custom",
    } as Readonly<Record<string, string>>,
  },

  /**
   * Names of the pictures of lines, route kinds, corners and heads, for labels and titles. A value
   * without a name here is shown as it is written.
   */
  glyphs: {
    solid: "solid",
    dashed: "dashed",
    dotted: "dotted",
    auto: "automatic",
    orthogonal: "elbow",
    polyline: "straight",
    bezier: "curved",
    sharp: "sharp",
    rounded: "rounded",
    none: "none",
    light: "light",
    rough: "rough",
    triangle: "triangle",
    triangleOutline: "triangle outline",
    open: "open",
    diamond: "diamond",
    diamondOutline: "diamond outline",
    circle: "circle",
    circleOutline: "circle outline",
    bar: "bar",
    cross: "cross",
    many: "many",
    oneOrMany: "one or many",
    onlyOne: "only one",
    zeroOrOne: "zero or one",
    zeroOrMany: "zero or many",
  },

  /**
   * Names of the places of an icon in its box and of a label around a centred icon (the pictures of
   * Icon position and Label position), by their value in the language.
   */
  positions: {
    left: "left",
    right: "right",
    top: "top",
    bottom: "bottom",
    center: "centre",
    middle: "middle",
  } as Readonly<Record<string, string>>,

  /**
   * Names of the shapes of boxes and nodes, for the shapes grid, the box and node buttons and the
   * inspector's Shape field; the grid also finds a shape by its value, which is English.
   */
  shapes: SHAPE_NAMES as Readonly<Record<ShapeName, string>>,

  /** Names of the kinds of arrow of the relation tool, by the arrow written in the text. */
  arrowKinds: ARROW_NAMES as Readonly<Record<ArrowKind, string>>,

  /** The grid of shapes that the box (free) and node (flow) buttons, and F, open. */
  /** The rotation handle of a selected element and what it says while it turns it. */
  rotation: {
    handle: "Rotate (Alt for any angle)",
    degrees: (angle: number) => `${angle}°`,
    status: (angle: number) => `Rotation ${angle}°. Release to keep it; Escape cancels.`,
    done: (id: string, angle: number) =>
      angle === 0 ? `${id} is upright again.` : `${id} turned to ${angle}°.`,
  },

  /**
   * The pen menu, behind the pen button's arrow: the pen or the highlighter, the pen's widths and
   * the colour of the tool chosen. Choices are kept with the canvas's state.
   */
  pen: {
    label: "Pen and highlighter",
    tools: "Tool",
    width: "Width",
    widths: { default: "Default", thin: "Thin", medium: "Medium", thick: "Thick" },
    /** A width chip's name with its size: "Thin, 2 px". */
    widthChip: (name: string, width: number) => `${name}, ${width} px`,
    /** What the width row shows: the width in use. */
    pixels: (width: number) => `${width} px`,
    /** The highlighter is always as wide: its width row says so instead of offering widths. */
    fixedWidth: (width: number) => `The highlighter is always ${width} px wide.`,
    colour: { pen: "Pen colour", highlighter: "Highlighter colour" },
  },

  /**
   * The sticky note button: a click adds one near the centre, a drag places it; its arrow picks
   * the colour of new ones, the theme's or one of six colours of paper, which the strip's fill row
   * names too.
   */
  sticky: {
    button: "Sticky note: click to add one, or drag it onto the canvas",
    /** The button's label once a colour of paper is chosen (its name, as `colours` gives it). */
    coloured: (name: string) =>
      `Sticky note, ${name.toLowerCase()}: click to add one, or drag it onto the canvas`,
    /** The button's title once a colour of paper is chosen, short like the palette's titles. */
    shortColoured: (name: string) => `Sticky note, ${name.toLowerCase()}`,
    /** The first choice of the menu: the theme's `sticky` colour, nothing written. */
    themeColour: "Theme colour",
    colours: {
      yellow: "Yellow",
      pink: "Pink",
      green: "Green",
      blue: "Blue",
      orange: "Orange",
      purple: "Purple",
    },
  },

  /**
   * The + at the end of a hovered or selected list (`layout column` or `layout row`): it adds a
   * sticky note to a column, or a column to a row, with its editor open.
   */
  lists: {
    addSticky: (list: string) => `Add a sticky note to ${list}`,
    addColumn: (list: string) => `Add a column to ${list}`,
  },

  shapeGrid: {
    label: "Shapes",
    /** What the grid says before anything is typed. */
    hint: "Type to find a shape",
    typed: (query: string) => `Find: ${query}`,
    none: (query: string) => `No shape is called “${query}”.`,
  },

  /**
   * The icon picker that the icon tool (I), the inspector's Icon field and the context menu's
   * Icon… open: a search across the packs and the libraries, grouped, with thumbnails.
   */
  iconPicker: {
    label: "Icons",
    search: "Search icons: server, database, aws:lambda…",
    searchLabel: "Search icons",
    results: "Icons found",
    /** The group of the icons chosen earlier while the canvas is open. */
    recent: "Recent",
    searching: "Searching…",
    none: (query: string) => `No icon matches “${query}”.`,
    /** Sequence diagrams and C4 views have no packs to search. */
    empty: "No icons here: sequence diagrams and C4 views draw their own kinds.",
    /** The header of the picker opened on a selection. */
    forTargets: (ids: readonly string[]) =>
      ids.length === 1 ? `Icon of ${ids[0]}` : `Icon of ${ids.length} elements`,
    /** The keys and gestures, at the foot of the picker. */
    hintApply: "Enter or a click sets it · Esc closes",
    hintPlace: "Click, then place it · Enter puts it at the centre · Or drag it onto a shape",
    itemTitle: (label: string, reference: string) =>
      label === reference ? reference : `${label} · ${reference}`,
    /** The picker's button that adds SVG files of one's own to the project. */
    add: "Add icon…",
    addTitle: "Add SVG icons of your own to the project",
  },

  /** The Add icon dialog: the pack, the licence of a new one, and a row per file. */
  addIcons: {
    title: "Add icons to the project",
    prefix: "Pack",
    prefixNew: (prefix: string) => `A new pack, in assets/icons/${prefix}/.`,
    prefixExisting: (prefix: string) => `The icons join the pack ${prefix}.`,
    licence: "Licence of the new pack",
    own: "Own work",
    other: "Other…",
    otherPlaceholder: "SPDX id or LicenseRef-name",
    otherInvalid: "An SPDX identifier, such as MIT, or a LicenseRef- name.",
    files: "Icons",
    name: (file: string) => `Name of ${file}`,
    reference: (reference: string) => `Written as ${reference}`,
    leftOut: "Left out",
    raster: "Pictures are added as images, with the palette's Image tool.",
    tooLarge: (kilobytes: number) => `Larger than ${kilobytes} KB, the most an icon may be.`,
    remove: (file: string) => `Leave out ${file}`,
    checking: "Checking…",
    add: (count: number) => (count === 1 ? "Add 1 icon" : `Add ${count} icons`),
    cancel: "Cancel",
    none: "No file can be added: each one is left out.",
  },

  /**
   * The placement control of the icon picker and the Libraries panel: how an icon is put on the
   * canvas. The choice is the same in both and kept while the canvas is open.
   */
  placement: {
    label: "Insert as",
    icon: "Icon",
    box: "In a box",
    only: "Only the icon",
    iconTitle: "The icon is the shape, its label below",
    boxTitle: "A box of the current shape, the icon beside its label",
    onlyTitle: "The icon alone, without a label",
  },

  /** The element libraries panel. */
  library: {
    label: "Element libraries",
    title: "Libraries",
    search: "Search elements, such as lambda, postgres or pod",
    noResults: (query: string) => `Nothing matches “${query}”.`,
    none: "This diagram has no libraries: sequence diagrams and C4 views draw their own kinds.",
    loading: "Loading…",
    itemTitle: (label: string) =>
      `${label} — click to add at the centre, drag onto the canvas, or onto a shape to give it this icon`,
    created: (label: string, id: string) => `${label} added as ${id}.`,
  },

  /** The layers panel. */
  layers: {
    label: "Layers",
    title: "Layers",
    add: "Add a layer",
    addShort: "Add",
    renameHint: "Double-click to rename",
    rename: (layer: string) => `Rename the layer ${layer}`,
    hide: (layer: string) => `Hide the layer ${layer} on the canvas`,
    show: (layer: string) => `Show the layer ${layer}`,
    up: (layer: string) => `Bring the layer ${layer} forward`,
    down: (layer: string) => `Send the layer ${layer} back`,
    remove: (layer: string) => `Remove the layer ${layer}`,
    moveSelection: "Move the selection to…",
    moved: (count: number, layer: string) =>
      `${count} ${plural("en", count, { one: "element", other: "elements" })} moved to ${layer}.`,
    removed: (layer: string, count: number) =>
      count > 0
        ? `Layer ${layer} removed; ${count} ${plural("en", count, { one: "element", other: "elements" })} went back to main.`
        : `Layer ${layer} removed.`,
  },

  themePanel: {
    label: "Theme",
    title: (id: string) => `Theme ${id}`,
    done: "Done",
    doneTitle: "Close the theme",
    thisFile: "this file",
    where: (file: string) => `Written in ${file}. Classes and rules stay in the code.`,
    chooseColour: (token: string) => `${token}: choose a colour`,
    inherit: "Inherit",
    inheritTitle: "Remove the token: the base theme's colour applies",
  },

  /** The filtered list of elements that "Connect to…" and "Add from the model…" open. */
  picker: {
    label: "Connect to",
    placeholder: "Connect to…",
    input: "Element to connect to",
    list: "Elements",
  },

  /** The dialogs: deleting what depends on an element, and a new theme. */
  dialogs: {
    deleteAll: "Delete all",
    cancel: "Cancel",
    newTheme: "New theme from this one",
    id: "Id",
    idPlaceholder: "my-theme",
    extends: (theme: string) => `It extends ${theme}.`,
    badId: "An id starts with a letter or _ and has letters, digits or _.",
    where: "Where it lives",
    file: "This file",
    fileNote: "The diagram uses it at once.",
    project: "The project",
    projectNote: "themes/<id>.meltemi, the default of every diagram without its own theme.",
    noProject: "Needs a saved file in a project with project.json.",
    create: "Create",
  },

  /** The story timeline: playback, scenes, bars and the edits it makes. */
  story: {
    timeline: "Story timeline",
    actionToAdd: "Action to add",
    time: "Time",
    play: "Play the story",
    pause: "Pause the story",
    addToScene: "Add to scene",
    newScene: "New scene after this one",
    removeAction: "Remove the selected action",
    exportPlayer: "Export the story as an HTML player",
    exportHtml: "Export HTML",
    scene: (id: string, title: string | null) => `scene ${id}${title ? ` — ${title}` : ""}`,
    /** The bar of a scene's transition, whose kind is a value of the language. */
    transition: (kind: string) => `${kind} transition`,
    bar: (label: string, start: string, duration: string) => `${label} · ${start} for ${duration}`,
    grip: "Drag to change the time",
    selectFirst: (action: SceneActionKind) => `Select what to ${action} on the canvas first.`,
    /** A time of a second or more, or zero: `1.2 s`. */
    seconds: (ms: number) => `${Math.round(ms) / 1000} s`,
  },

  /**
   * The canvas while it only shows (`CanvasSettings.readOnly`): the badge of the toolbar, the
   * labels of the stage and of the properties, and what the status line says.
   */
  readOnly: {
    badge: "view only",
    badgeTitle:
      "View only: look around, select, zoom, play stories and export; the diagram cannot be changed here.",
    stage: "Diagram canvas, view only. Tab selects elements; the diagram cannot be changed here.",
    inspector: "Properties, view only",
    /** The status line when the canvas turns read-only. */
    entered: "This canvas is view only: you can look around, select, zoom and play stories.",
    /** The status line when a change is attempted. */
    refused: "View only: the diagram cannot be changed here.",
  },
};

/** The shape of the canvas's catalog in every language. */
export type CanvasMessages = typeof en;
