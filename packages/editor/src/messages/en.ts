import { plural, seconds } from "@meltemi/diagrams-i18n";

/** Code inside a sentence, as the canvas shows it: `id`. */
const code = (text: string) => `\`${text}\``;

export const en = {
  /** Labels of the inspector's fields that several profiles share. */
  fields: {
    id: "Id",
    kind: "Kind",
    label: "Label",
    description: "Description",
    classes: "Classes",
    icon: "Icon",
    imageFile: "Image file",
    layer: "Layer",
    linkedTo: "Linked to",
    /** The element a note is attached to. */
    attachedTo: "Attached to",
    url: "URL",
    ports: "Ports",
    x: "X",
    y: "Y",
    width: "Width",
    height: "Height",
    from: "From",
    fromPort: "From port",
    to: "To",
    toPort: "To port",
    line: "Line",
    labelAt: "Label position (%)",
    title: "Title",
    direction: "Direction",
    layout: "Layout",
    layers: "Layers (back to front)",
    routing: "Route kind",
    theme: "Theme",
    /** The diagram's canvas: fit to the content, a preset or a custom size. */
    canvas: "Canvas",
    /** The group an element is declared in. */
    inside: "Inside",
    /** The button beside Inside that turns a node or a box into a group holding what is on it. */
    convertToContainer: "Convert to container",
    /** A list group's distance between its children, beside Layout (column or row). */
    spacing: "Spacing",
    /** Where a list group's children sit across its column or row. */
    align: "Align",
  },

  /** Labels of the style fields, by style property; the strip shows the colours, line and heads. */
  style: {
    fill: "Fill",
    stroke: "Stroke",
    color: "Text colour",
    line: "Line",
    width: "Stroke width",
    pattern: "Pattern",
    icon: "Icon",
    iconColor: "Icon colour",
    iconPosition: "Icon position",
    /** Where the label sits around a centred icon or an icon shape. */
    labelPosition: "Label position",
    iconSize: "Icon size",
    arrowtail: "Start arrowhead",
    arrowhead: "End arrowhead",
    routing: "Route kind",
    corners: "Corners",
    radius: "Corner radius",
    rotation: "Rotation",
    shape: "Shape",
    font: "Font",
    fontSize: "Text size",
    fontWeight: "Text weight",
    textAlign: "Text alignment",
    verticalAlign: "Vertical alignment",
    opacity: "Opacity",
  },

  /**
   * Placeholders that are words. Those that are values of the language (`auto`, `main`, `LR`,
   * `off`, `forward`, `forever`) or examples of code stay as written.
   */
  placeholders: {
    /** No scope, no group around an element. */
    none: "none",
  },

  /**
   * Values offered in one click beside a field: the theme's counterpart in the other scheme, and
   * the icon size that fits the box (`iconSize auto`).
   */
  quick: {
    dark: "Dark",
    light: "Light",
    auto: "Auto",
  },

  /** Titles of the inspector: the diagram, the selected element, relation or event, or a count. */
  titles: {
    diagram: (id: string) => `Diagram ${id}`,
    /** An element or an event: its kind (see `kinds`) and its id, when it has one. */
    target: (kind: string, id: string) => (id === "" ? kind : `${kind} ${id}`),
    relation: (name: string) => `relation ${name}`,
    message: (name: string) => `message ${name}`,
    selected: (count: number) => `${count} selected`,
  },

  /**
   * The kinds of elements and events as titles name them; the kinds of declared types keep their
   * own word. A C4 view's scope is a `boundary`.
   */
  kinds: {
    node: "node",
    decision: "decision",
    data: "data",
    group: "group",
    note: "note",
    tag: "tag",
    box: "box",
    text: "text",
    icon: "icon",
    image: "image",
    pen: "pen",
    sticky: "sticky",
    participant: "participant",
    actor: "actor",
    boundary: "boundary",
    control: "control",
    entity: "entity",
    database: "database",
    collections: "collections",
    queue: "queue",
    person: "person",
    system: "system",
    container: "container",
    datastore: "datastore",
    component: "component",
    section: "section",
    task: "task",
    milestone: "milestone",
    marker: "marker",
    message: "message",
    activate: "activate",
    deactivate: "deactivate",
    create: "create",
    destroy: "destroy",
    fragment: "fragment",
    divider: "divider",
    delay: "delay",
  },

  /** The effects of `animate` in the inspector and the strip, by effect. */
  effects: {
    flow: "Flow particles",
    dash: "Moving dash",
    pulse: "Pulse",
    trace: "Trace",
  },

  /** The fields of an effect that is on, after its name: "Pulse: duration (ms)". */
  effectFields: {
    duration: "duration (ms)",
    repeat: "repeat",
    delay: "delay (ms)",
    direction: "direction",
    particles: "particles",
    colour: "colour",
  },
  effectField: (effect: string, field: string) => `${effect}: ${field}`,

  /** The theme panel: its groups of tokens, and labels of tokens whose name says little. */
  themePanel: {
    groups: {
      base: "Base",
      colours: "Colours",
      /** The highlighter's colour and the stickies' fill and text. */
      whiteboard: "Whiteboard",
      fonts: "Fonts",
      type: "Type",
      spacing: "Spacing",
      shapes: "Shapes and lines",
      icons: "Icons",
      frame: "Frame",
      motion: "Motion",
      canvas: "Canvas",
    },
    tokens: {
      extends: "Extends",
      font: "Text font",
      mono: "Code font",
      flowDuration: "Flow particles (ms)",
      dashDuration: "Moving dash (ms)",
      pulseDuration: "Pulse (ms)",
      traceDuration: "Trace (ms)",
      selection: "Selection",
      guide: "Guides",
      sketch: "Sketch",
    },
  },

  /** Sequence diagrams: the fields of participants, messages, events and the diagram. */
  sequence: {
    fields: {
      spaceBefore: "Space before",
      spaceAfter: "Space after",
      gapBefore: "Gap before",
      gapAfter: "Gap after",
      participantSpacing: "Participant spacing",
      message: "Message",
      text: "Text",
      position: "Position",
      over: "Over",
      of: "Of",
      operator: "Operator",
      condition: "Condition",
      participant: "Participant",
      numberFrom: "Number messages from",
      /** The checkbox of a message: an `activate`/`deactivate` pair of its receiver after it. */
      activates: "Activates the receiver",
      /** The field of a message's or a participant's tag, by its place in the list (from 1). */
      tagAt: (n: number) => `Tag ${n}`,
      /** The empty field under the tags, whose text adds one. */
      newTag: "New tag",
      addTag: "Add a tag",
      /** The button beside a tag. */
      removeTag: "Remove",
    },
    /** The condition of a later branch, with its keyword: `else 1`, or `branch 1` without one. */
    branchCondition: (keyword: string | undefined, branch: number) =>
      `Condition (${keyword ?? "branch"} ${branch})`,
    /** Under a call's **Activates the receiver**, read-only: its block draws the bar. */
    blockActivates: (call: string, participant: string) =>
      `The block of ${code(call)} activates ${code(participant)}.`,
    /** Why a sequence action or field cannot be written. */
    reasons: {
      selectEvent: "Select a message, note, fragment or event.",
      selectMessage: "Select the message after which the participant is active.",
      addParticipant: "Add a participant first.",
      pixels: "Write a number of pixels, 0 or more.",
      signedPixels:
        "Write a number of pixels; before the first participant and after the last, 0 or more.",
      messageKind: "A message is a call, a reply or async.",
      nestAfterCall: "Select the events right after the call they belong to.",
      selectCall: "Select a call, or an event inside one.",
      /** T or **Tag** with nothing to tag selected. */
      selectToTag: "Select a message or a participant to tag.",
      /** An end of a bar that is not a written activation's. */
      selectBar: "Select an activation bar.",
      /** An end of a bar dropped where there is no event. */
      dropOnRow: "Drop the end of the bar on the row of an event.",
    },
  },

  /**
   * Starter texts the canvas writes into the file, which follow the interface language like the
   * labels of new elements (the edit package's `defaultLabel`).
   */
  written: {
    divider: "Divider",
    condition: "Condition",
    /** The label of a group created as a list: the group menu's Column and Row. */
    column: "Column",
    row: "Row",
    /** The text of a new tag of a sequence message or participant (T, **Tag**). */
    tag: "Tag",
  },

  /** C4 views: the fields of entities, relations and the view, and the kinds of entities. */
  c4: {
    fields: {
      entity: "Entity",
      localLabel: "Label in this view",
      modelLabel: "Model label",
      technology: "Technology",
      external: "External",
      standsFor: "Stands for",
      standsForLifted: "Stands for (lifted)",
      level: "Level",
      scope: "Scope",
      model: "Model",
      modelFile: "Model file",
    },
    /** The kind of an entity, read-only in the inspector. */
    kinds: {
      person: "person",
      system: "software system",
      container: "container",
      datastore: "container",
      component: "component",
    },
    externalKinds: {
      person: "external person",
      system: "external software system",
      container: "external container",
      datastore: "external container",
      component: "external component",
    },
    /** A combination stands for several model relations: its ends cannot move. */
    reconnectCombination: (key: string, sources: readonly string[]) =>
      `${code(key)} stands for ${sources.map(code).join(", ")}; change them in the model.`,
    /** The palette's tools of a C4 view, by entity kind. */
    tools: {
      person: "Person",
      system: "Software system",
      container: "Container",
      datastore: "Data store",
      component: "Component",
    },
    /** A kind the palette does not offer at the view's level. */
    kindNotDrawn: (kind: string, kinds: readonly string[]) =>
      `This view draws no ${code(kind)}; it draws ${kinds.map(code).join(", ")}.`,
  },

  /** Why an inspector field or a paste cannot be written. */
  reasons: {
    noDiagram: (id: string) => `There is no diagram ${code(id)}.`,
    notInDiagram: (id: string, diagram: string) =>
      `${code(id)} is not in diagram ${code(diagram)}.`,
    /** `kind` is the kind of an event: `note`, `fragment`, `message`… */
    source: "Write the icon or the image path.",
    ports: "Write ports as `name side [n%]`, separated by commas.",
    number: "Write a number.",
    positive: "Write a positive number.",
    percentage: "Write a percentage from 0 to 100.",
    between: (min: number, max: number) => `Write a number from ${min} to ${max}.`,
    /** A value such as the icon size: one of its words, or a number within bounds. */
    wordOrBetween: (words: readonly string[], min: number, max: number) =>
      `Write ${words.map(code).join(" or ")}, or a number from ${min} to ${max}.`,
    /** The choices of the Canvas field, as the protocol writes them. */
    canvasChoice: (choices: readonly string[]) =>
      `The canvas is one of ${choices.map(code).join(", ")}.`,
    notFragment: "The clipboard does not hold a Meltemi Diagrams fragment.",
  },

  /** The status line's note for relations, notes and fragments an edit named to style them. */
  named: (ids: readonly string[]) => `Named ${ids.map(code).join(", ")}.`,

  /** What the canvas session says to the canvas and the host: notices, statuses and refusals. */
  session: {
    /** The text size keys: what they wrote, or why nothing. */
    textSize: (size: number) => `Text size ${size}.`,
    textSizes: "Text sizes changed.",
    noTextSize: "Nothing selected draws text.",
    textSizeEnd: "The text is at the end of the size list.",
    noDiagramStories: "No diagram in this file: play one of its stories.",
    noDiagram:
      "No diagram to draw: add `diagram <id>: flow { }`, `diagram <id>: free { }`, `diagram <id>: sequence { }` or `diagram <id>: gantt { }` to the file.",
    cannotDraw: "The diagram cannot be drawn.",
    copied: "Copied.",
    invalidId: (id: string) => `${code(id)} is not a valid id.`,
    noteAttached: (target: string) => `Created a note attached to ${code(target)}.`,
    /** A head dragged sideways wrote the gap before it. */
    gapSet: (participant: string, amount: number) => `Gap before ${participant}: ${amount}.`,
    /** The layout drew less than the gap a drag wrote: the floor won. */
    gapFloor: (participant: string, written: number, applied: number) =>
      `Gap before ${participant}: ${written} written, ${applied} drawn: the labels need the room.`,
    attachNotesOnly: (kind: string) =>
      `Only a note can be attached to an element; a ${code(kind)} cannot.`,
    notInProject:
      "This file is not in a project: create the theme in the file, or add a project.json.",
    builtInTheme: "The diagram uses a built-in theme; create a theme from it to change its tokens.",
    storyNotDrawn: (story: string) =>
      `The story ${code(story)} shows a diagram that cannot be drawn; fix it in the text first.`,
    /** After **New story**: what to do with its empty scene. */
    storyCreated: (story: string) =>
      `Created the story ${code(story)}: select on the frame and press Add to scene to fill its first scene.`,
    storyNeedsDiagram: "A story is made for a diagram of this file; show one first.",
    textChanged: "The text changed while you were editing; the canvas shows it again.",
    fixFirst: "Fix the problems of the diagram before editing it on the canvas.",
    scenario: "The canvas previews a scenario; pick “All events” to edit the diagram.",
    deleting: (count: number) =>
      `Deleting also removes ${count} ${plural("en", count, { one: "statement", other: "statements" })}.`,
    removingFromView: (count: number) =>
      `Removing from the view also removes ${count} ${plural("en", count, { one: "statement", other: "statements" })}.`,
    convert: "Only flow diagrams that are drawn can be converted to a free composition.",
    cannotArrange: (problem: string) =>
      `Fix the problems of the diagram before arranging it: ${problem}`,
    /**
     * `edit.loses-placement`: what the switch to automatic layout would remove, which the canvas
     * shows in its confirmation.
     */
    losesPlacement: (places: number, routes: number) => {
      const parts = [
        ...(places === 1 ? ["position"] : places > 1 ? [`${places} positions`] : []),
        ...(routes === 1 ? ["route"] : routes > 1 ? [`${routes} routes`] : []),
      ];
      return `The engine will place everything again, and the ${parts.join(" and ")} you moved by hand will be lost. You can undo it afterwards.`;
    },
    /** Numbering asked of a diagram that is not a sequence diagram. */
    numbering: "Only the messages of sequence diagrams are numbered.",
    numbered: "The messages are numbered from 1.",
    unnumbered: "The messages are no longer numbered.",
    /** Reverse direction with nothing that has a direction selected. */
    reverseWhat: "Select a relation, a message or a free line to reverse it.",
    reversed: (from: string, to: string) => `The relation now goes from \`${from}\` to \`${to}\`.`,
    lineReversed: (id: string) => `\`${id}\` now runs the other way.`,
    container: (id: string, children: readonly string[]) =>
      children.length === 0
        ? `${code(id)} is now a container.`
        : `${code(id)} is now a container holding ${children.map(code).join(", ")}.`,
    stackedOn: (inner: string, outer: string) =>
      `${code(inner)} is stacked on ${code(outer)}; convert ${code(outer)} to a container to move them together.`,
    /** The icon picker's choice, or an icon dropped, with nothing that takes an icon. */
    noIconTarget: "Icons go on nodes, decisions, data stores and boxes; select one of them.",
    /** A child of a list nudged or dragged within it: the list sets where it goes. */
    listPlaces: (id: string, list: string) =>
      `${code(list)} places ${code(id)}: drag it between its neighbours, or press Alt+Up or Alt+Down.`,
    /** A position given for a group that is not a list. */
    notList: (id: string) =>
      `${code(id)} is not a list: only a group with \`layout column\` or \`layout row\` takes a position.`,
  },

  /** Canvas actions that do not apply to C4 views, with the reason. */
  c4Refused: {
    group:
      "The boundary of a view is its scope; groups belong to the model's systems and containers.",
    ungroup: "The boundary of a view is its scope; change the scope in the properties.",
    reorder: "C4 views draw the model's entities in its order.",
    convert: "Only flow diagrams convert to a free composition.",
    addLayer: "Layers belong to flow diagrams and free compositions.",
    renameLayer: "Layers belong to flow diagrams and free compositions.",
    removeLayer: "Layers belong to flow diagrams and free compositions.",
    moveLayer: "Layers belong to flow diagrams and free compositions.",
    setLayer: "Layers belong to flow diagrams and free compositions.",
    "move.parent":
      "The elements of a view sit where their entities are in the model; move them between systems and containers in the model's text.",
    "connect.twoWay": "Relations of C4 views go one way: `->`.",
  },

  /** The layers panel's refusals. */
  layers: {
    notHere: "Layers belong to flow diagrams and free compositions.",
    noLayer: (layer: string) => `There is no layer \`${layer}\` to work on.`,
    noMove: "That layer is already at the end.",
  },

  /** Canvas actions that do not apply to sequence diagrams, with the reason. */
  sequenceRefused: {
    resize: "Sequence participants take the size of their label.",
    setVia: "Sequence messages go straight between lifelines.",
    setEnd: "Sequence messages have no ports; change their participants in the inspector.",
    align: "Sequence diagrams keep their columns and rows; drag participants to reorder them.",
    distribute: "Sequence diagrams keep their columns and rows; use `gap` and `space`.",
    arrange: "Sequence diagrams are arranged by the order of events.",
    setLayoutMode:
      "Sequence diagrams are arranged by the order of events; they have no layout mode.",
    reorder: "Sequence diagrams draw everything in order; there is no stacking order.",
    convert: "Only flow diagrams convert to a free composition.",
    addLayer: "Layers belong to flow diagrams and free compositions.",
    renameLayer: "Layers belong to flow diagrams and free compositions.",
    removeLayer: "Layers belong to flow diagrams and free compositions.",
    moveLayer: "Layers belong to flow diagrams and free compositions.",
    setLayer: "Layers belong to flow diagrams and free compositions.",
    paste: "Paste text into the editor to copy events of a sequence diagram.",
    duplicate: "Copy and paste events of a sequence diagram in the text editor.",
    "move.parent":
      "Sequence participants do not move between groups; drag them sideways to reorder them.",
    "create.shape":
      "Sequence participants draw their own shapes; shapes are for free boxes and flow nodes.",
  },

  /**
   * Gantt charts: the fields of bars, diamonds, lines and the chart, the dates as the read-only
   * lines write them, and why a gesture is refused.
   */
  gantt: {
    fields: {
      /** The date a task starts at (`from`), and the date of a milestone or a marker (`at`). */
      start: "Start date",
      date: "Date",
      after: "After",
      /** How a task ends: by default (one day), `for`, `to` or `until`. */
      end: "End",
      duration: "Duration",
      endDate: "End date",
      until: "Until",
      status: "Status",
      critical: "Critical",
      /** The read-only lines: where the schedule puts the task. */
      starts: "Starts",
      ends: "Ends",
      working: "Working time",
      axisFormat: "Axis format",
      ticks: "Ticks",
      weekStart: "Week start",
      axis: "Axis",
      labels: "Labels",
      display: "Display",
      dependencies: "Dependencies",
      dayWidth: "Day width",
      excluded: "Excluded days",
      included: "Included dates",
      today: "Today",
    },
    /** The headings that start a group of fields: a task's schedule, the chart's look and calendar. */
    headings: { schedule: "Schedule", look: "Axis and look", calendar: "Calendar" },
    /** Placeholders of fields that are not written: what applies. */
    placeholders: {
      /** A task without an end lasts a day; a chart without `dayWidth` fills the canvas. */
      oneDay: "one day",
      auto: "auto",
      off: "off",
    },
    /** The quick choices of the chart's fields. */
    quick: { weekends: "Weekends", today: "Today", off: "Off", auto: "Auto" },
    /**
     * The words the inspector shows for the choices of its enums, whose values are the language's:
     * the status of a task, how it ends, the unit of a duration, the first day of the week and the
     * look of the axis.
     */
    options: {
      planned: "planned",
      active: "active",
      done: "done",
      for: "for a duration",
      to: "to a date",
      until: "until other tasks",
      s: "seconds",
      min: "minutes",
      h: "hours",
      d: "days",
      w: "weeks",
      top: "at the top",
      bottom: "at the bottom",
      both: "top and bottom",
      bar: "inside the bars",
      column: "in a column",
      normal: "normal",
      compact: "compact",
      shown: "shown",
      hidden: "hidden",
      monday: "Monday",
      tuesday: "Tuesday",
      wednesday: "Wednesday",
      thursday: "Thursday",
      friday: "Friday",
      saturday: "Saturday",
      sunday: "Sunday",
    } as Readonly<Record<string, string>>,
    /** Under a selected arrow: where a dependency is changed. */
    arrowNote:
      "A dependency is the After of the task it points to: change it there, or delete the arrow.",
    months: [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ],
    /** A date in a read-only line: `19 June 2026`, with `, 17:00` after it when it has a time. */
    date: (day: number, month: string, year: number, time: string | null) =>
      `${day} ${month} ${year}${time === null ? "" : `, ${time}`}`,
    /** The working time between a start and an end: whole days, or hours. */
    workingDays: (days: number) =>
      `${days} ${plural("en", days, { one: "working day", other: "working days" })}`,
    workingHours: (hours: string) => `${hours} working hours`,
    notBar: (id: string) => `${code(id)} is not a task, milestone or marker.`,
    noEnd: (id: string, kind: string) => `${code(id)} is a ${kind}: it has a date, not an end.`,
    untilReplaced: (id: string, length: string) =>
      `${code(id)} now ends ${code(`for ${length}`)}, in place of its ${code("until")}.`,
    /** A bar dragged on a chart that cannot be moved in time. */
    dragRows:
      "Drag a row between the rows of the chart to move it; Left and Right move a bar in time.",
    noRows: "Markers take no row: there is nothing to move them past.",
    mixedRows: "Move the sections and the rows one kind at a time.",
    firstRow: (id: string) => `${code(id)} is the first row already.`,
    lastRow: (id: string) => `${code(id)} is the last row already.`,
    cannotLead: (id: string, kind: string) =>
      `${code(id)} is a ${kind}: only a task or a milestone can be followed.`,
    cannotFollow: (id: string, kind: string) =>
      `${code(id)} is a ${kind}: only a task, a milestone or a marker comes after others.`,
    itself: (id: string) => `${code(id)} cannot come after itself.`,
    alreadyAfter: (to: string, from: string) => `${code(to)} already comes after ${code(from)}.`,
    loop: (to: string, from: string, path: readonly string[]) =>
      `${code(to)} already leads to ${code(from)} (${path.map(code).join(" → ")}): linking them would close a loop.`,
    notHere: (kind: string) =>
      `A gantt chart holds tasks, milestones, markers and sections; ${code(kind)} is none of them.`,
    selectRows: "Select the tasks, milestones or markers to put in a section.",
    /** Choosing `until` for a task when no other task could start after it ends. */
    endNeedsTasks: (id: string) =>
      `${code(id)} has no task to end before: add one after it, then choose Until.`,
    /** A task whose dates the chart cannot resolve yet, which has no end to turn into another. */
    unresolved: (id: string) =>
      `${code(id)} has no dates yet: give it a start date, or put it after another task.`,
    /** An End that is none of the three ways a task ends. */
    notEnd: (value: string) =>
      `${code(value)} is not a way for a task to end: use for, to or until.`,
  },

  /** Canvas actions that do not apply to gantt charts, with the reason. */
  ganttRefused: {
    resize: "Bars take their length from their dates: drag their ends, or change their duration.",
    moveLabel: "A chart draws the labels of its bars inside them or beside them.",
    setVia: "Dependencies run from the end of a task to the start of the next.",
    setEnd:
      "Dependencies run from the end of a task to the start of another; change them in After.",
    createLine:
      "A chart draws its bars and arrows from its dates; lines are for free compositions.",
    setLinePoints:
      "A chart draws its bars and arrows from its dates; lines are for free compositions.",
    createPen: "Pens are for free compositions.",
    setPenPoints: "Pens are for free compositions.",
    attachNote: "Notes belong to flow, free and C4 diagrams.",
    setIcon: "A chart's bars draw no icon from the picker.",
    removeIcon: "A chart's bars draw no icon from the picker.",
    ungroup: "A section holds rows: drag them out of it, or use Alt+Up and Alt+Down.",
    convertToContainer: "Only boxes and nodes become containers.",
    align: "Rows are in order and bars are placed by their dates.",
    distribute: "Rows are in order and bars are placed by their dates.",
    arrange: "A chart is arranged by its dates and the order of its rows.",
    setLayoutMode:
      "A chart is arranged by its dates and the order of its rows; it has no layout mode.",
    reverse:
      "Dependencies run from the end of a task to the start of the next; change them in After.",
    reorder: "A chart draws everything in order; there is no stacking order.",
    convert: "Only flow diagrams convert to a free composition.",
    addLayer: "Layers belong to flow diagrams and free compositions.",
    renameLayer: "Layers belong to flow diagrams and free compositions.",
    removeLayer: "Layers belong to flow diagrams and free compositions.",
    moveLayer: "Layers belong to flow diagrams and free compositions.",
    setLayer: "Layers belong to flow diagrams and free compositions.",
    paste: "Paste text into the editor to copy the rows of a chart.",
    duplicate: "Copy and paste the rows of a chart in the text editor.",
    cut: "Copy and delete the rows of a chart in the text editor.",
  },

  /** Why an export cannot be made, as the command line, the editor and the playground say it. */
  exports: {
    storyNotDrawn: (id: string) => `${code(id)} shows a diagram that cannot be drawn.`,
    nothingToDraw: (id: string) => `${code(id)} has nothing to draw.`,
    cannotDraw: (id: string) => `${code(id)} cannot be drawn.`,
    /** What an export chose because nothing said, as the hosts show it after the export. */
    notices: {
      defaultDuration: (id: string, ms: number) =>
        `The effects of ${code(id)} repeat forever: the video lasts ${seconds("en", ms)}, one loop of them.`,
      /** When the cycles' common multiple would pass 10 s. */
      longestDuration: (id: string, ms: number) =>
        `The effects of ${code(id)} repeat forever: the video lasts ${seconds("en", ms)}, their longest cycle.`,
      stillDuration: (id: string, ms: number) =>
        `${code(id)} has no moving effects: the video lasts ${seconds("en", ms)}.`,
      mp4Background: "MP4 has no transparency: the theme's background was used.",
      clamped: (width: number, height: number, limit: number) =>
        `Made at ${width} × ${height} pixels, the largest that fits the limit of ${limit} a side.`,
    },
    /** After the profile's id: `poster: the profile has problems…`. */
    profileProblems: "the profile has problems; fix them first.",
    notExportable: (name: string) => `${code(name)} is not a diagram or story to export.`,
    /** A player of several stories none of which can be drawn. */
    storiesNotDrawn: (ids: readonly string[]) =>
      `No story can be drawn: ${ids.map(code).join(", ")} ${ids.length === 1 ? "shows" : "show"} a diagram that cannot be drawn.`,
    /** Every story in one player is an HTML player. */
    storiesHtml: "Every story goes into one HTML player; choose the HTML format.",
    /** The pictures of every scene: of a story, as SVG, PNG or PDF, and never at one instant. */
    scenesStory: "A picture per scene takes a story.",
    scenesFormat: "A picture per scene is an SVG, PNG or PDF export.",
    scenesAt: "A picture per scene draws every scene's final state; it cannot take an instant.",
    /** A story without scenes has no picture of a scene. */
    noScenes: (id: string) => `${code(id)} has no scenes.`,
    /** What a player of several stories left out, after it was written. */
    storyLeftOut: (id: string) =>
      `The story ${code(id)} was left out: it shows a diagram that cannot be drawn.`,
  },

  /** Why the catalog leaves an entry out, after its name, and its warnings. */
  catalog: {
    hasErrors: "it has errors",
    cannotDraw: "it cannot be drawn",
    storyNotDrawn: "it shows a diagram that cannot be drawn",
    excluded: (story: string, view: string) =>
      `${story} shows ${view}, which is excluded; the story still draws it.`,
  },

  /** Why a theme cannot be created for the project, or a file of it edited. */
  /** The Add icon dialog: what is wrong with a prefix, a name, a file or a licence. */
  addIcons: {
    prefixEmpty: "Give the pack a prefix.",
    prefixInvalid: (prefix: string) =>
      `${code(prefix)} is not a pack prefix: use lower-case letters, digits and hyphens.`,
    prefixBuiltIn: (prefix: string) => `${code(prefix)} is a built-in pack; choose another prefix.`,
    prefixAlias: (prefix: string, target: string) =>
      `${code(prefix)} is an alias of ${code(target)} in project.json; choose another prefix.`,
    prefixPlugin: (prefix: string) =>
      `${code(prefix)} is the pack of a plugin; choose another prefix.`,
    prefixIconify: (prefix: string, file: string) =>
      `${code(prefix)} is the Iconify file ${code(file)}; add icons to it there, or choose another prefix.`,
    nameEmpty: "Give the icon a name of letters or digits.",
    nameInvalid: (name: string) =>
      `${code(name)} cannot be written in a reference: use letters, digits, \`_\`, \`.\` and \`-\`.`,
    nameTaken: (reference: string) => `${code(reference)} exists already; choose another name.`,
    nameTwice: (name: string) => `Two icons are named ${code(name)}.`,
    notSvg: "This file is not an SVG icon.",
    /** The sanitiser's reason, such as "`<script>` is not allowed in icons." */
    unsafe: (reason: string) => `Refused: ${reason}`,
    licenceMissing: "Choose the licence of the new pack.",
    licenceInvalid: (licence: string) =>
      `${code(licence)} is not an SPDX identifier or a \`LicenseRef-\` name.`,
    needsProject: "Icons are added to a project: open the file in its project's folder.",
    added: (references: readonly string[]) =>
      `Added ${references.map(code).join(", ")} to the project.`,
  },

  projects: {
    noManifest: "This file is not in a project: there is no project.json.",
    themeExists: (id: string) =>
      `${code(`themes/${id}.meltemi`)} already exists; choose another id.`,
    unreadableManifest: "project.json cannot be read; fix it first.",
    notAFile: (path: string) => `${code(path)} is not a file of the project.`,
    /** Steps that would edit a file twice from texts that no longer hold. */
    staleStep: "The steps change a file twice; ask again.",
    /** A file a step was to create is there already. */
    fileExists: (path: string) => `${code(path)} exists already; nothing was written.`,
    /** A JSON file of the assets that a step was to change cannot be read. */
    unreadableJson: (path: string, reason: string) =>
      `${code(path)} cannot be changed (${reason}); fix it first.`,
  },
};
