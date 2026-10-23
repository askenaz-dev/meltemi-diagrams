import { plural } from "@meltemi/diagrams-i18n";

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
    fontSize: "Text size",
    fontWeight: "Text weight",
    textAlign: "Text alignment",
  },

  /**
   * Placeholders that are words. Those that are values of the language (`auto`, `main`, `LR`,
   * `off`, `forward`, `forever`) or examples of code stay as written.
   */
  placeholders: {
    /** No scope, no group around an element. */
    none: "none",
    /** The colour of an effect without one: the colour of the relation's line. */
    linesColour: "the line's",
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
    },
  },

  /** Sequence diagrams: the fields of participants, messages, events and the diagram. */
  sequence: {
    fields: {
      spaceBefore: "Space before",
      gapBefore: "Gap before",
      message: "Message",
      text: "Text",
      position: "Position",
      over: "Over",
      of: "Of",
      operator: "Operator",
      condition: "Condition",
      participant: "Participant",
      numberFrom: "Number messages from",
    },
    /** The condition of a later branch, with its keyword: `else 1`, or `branch 1` without one. */
    branchCondition: (keyword: string | undefined, branch: number) =>
      `Condition (${keyword ?? "branch"} ${branch})`,
    /** Why a sequence action or field cannot be written. */
    reasons: {
      selectEvent: "Select a message, note, fragment or event.",
      selectMessage: "Select the message after which the participant is active.",
      addParticipant: "Add a participant first.",
      pixels: "Write a number of pixels, 0 or more.",
      messageKind: "A message is a call, a reply or async.",
    },
  },

  /**
   * Starter texts the canvas writes into the file, which follow the interface language like the
   * labels of new elements (the edit package's `defaultLabel`).
   */
  written: {
    divider: "Divider",
    condition: "Condition",
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
    noDiagramStories: "No diagram in this file: play one of its stories.",
    noDiagram:
      "No diagram to draw: add `diagram <id>: flow { }`, `diagram <id>: free { }` or `diagram <id>: sequence { }` to the file.",
    cannotDraw: "The diagram cannot be drawn.",
    copied: "Copied.",
    invalidId: (id: string) => `${code(id)} is not a valid id.`,
    notInProject:
      "This file is not in a project: create the theme in the file, or add a project.json.",
    builtInTheme: "The diagram uses a built-in theme; create a theme from it to change its tokens.",
    storyNotDrawn: (story: string) =>
      `The story ${code(story)} shows a diagram that cannot be drawn; fix it in the text first.`,
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
    container: (id: string, children: readonly string[]) =>
      children.length === 0
        ? `${code(id)} is now a container.`
        : `${code(id)} is now a container holding ${children.map(code).join(", ")}.`,
    stackedOn: (inner: string, outer: string) =>
      `${code(inner)} is stacked on ${code(outer)}; convert ${code(outer)} to a container to move them together.`,
    /** The icon picker's choice, or an icon dropped, with nothing that takes an icon. */
    noIconTarget: "Icons go on nodes, decisions, data stores and boxes; select one of them.",
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

  /** Why an export cannot be made, as the command line, the editor and the playground say it. */
  exports: {
    storyNotDrawn: (id: string) => `${code(id)} shows a diagram that cannot be drawn.`,
    nothingToDraw: (id: string) => `${code(id)} has nothing to draw.`,
    cannotDraw: (id: string) => `${code(id)} cannot be drawn.`,
    tooLarge: (format: string, width: number, height: number, limit: number) =>
      `The ${format} would be ${width} × ${height} pixels; the limit is ${limit} a side. Lower the scale or the size.`,
    endless: (id: string) =>
      `The effects of ${code(id)} repeat forever; give the video a duration.`,
    still: (id: string) => `The effects of ${code(id)} do not move; give the video a duration.`,
    transparentMp4: "MP4 has no transparency; choose a colour, or WebM.",
    videoSide: (limit: number) => `A video side may not exceed ${limit} pixels.`,
    /** After the profile's id: `poster: the profile has problems…`. */
    profileProblems: "the profile has problems; fix them first.",
    notExportable: (name: string) => `${code(name)} is not a diagram or story to export.`,
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
  projects: {
    noManifest: "This file is not in a project: there is no project.json.",
    themeExists: (id: string) =>
      `${code(`themes/${id}.meltemi`)} already exists; choose another id.`,
    unreadableManifest: "project.json cannot be read; fix it first.",
    notAFile: (path: string) => `${code(path)} is not a file of the project.`,
    /** Steps that would edit a file twice from texts that no longer hold. */
    staleStep: "The steps change a file twice; ask again.",
  },
};
