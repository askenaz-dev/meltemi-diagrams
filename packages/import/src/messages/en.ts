/** Mermaid's shape names that read better as words than with their underscores removed. */
const SHAPE_NAMES: Readonly<Record<string, string>> = {
  doublecircle: "double circle",
  inv_trapezoid: "inverted trapezoid",
};

/**
 * The importers' words in English. Findings (messages and hints) are made in the interface
 * language; `content` is written into imported sheets in the language the import asks for; and
 * `coverage` holds the notes of the coverage tables, which document both languages. Codes,
 * severities, statuses and construct names are not words and stay out. Sentences with values are
 * functions, so each language builds its own grammar.
 */
export const en = {
  /** Findings about the whole import: its format, its result and the sheet it writes. */
  import: {
    /** A defect in a front-end, reported like a syntax problem. */
    stopped: (reason: string) => `The importer stopped: ${reason}`,
    unknownFormat:
      "The source is not recognisably Mermaid, PlantUML or Markdown with diagram blocks.",
    unknownFormatHint: "Pass the format: `--from mermaid`, `--from plantuml` or `--from markdown`.",
    noDiagramBlocks: "The Markdown file has no `mermaid`, `plantuml` or `puml` fenced block.",
    /** The imported sheet does not compile: the line of the sheet and the compiler's message. */
    selfCheck: (line: number, message: string) =>
      `The imported sheet has an error on its line ${line}: ${message}`,
    partial: (count: number) =>
      `${count} essential construct${count === 1 ? " was" : "s were"} not imported; the sheet is incomplete.`,
    /** `import.renamed-id`: a source id that is not an identifier of the language. */
    renamedId: (source: string, id: string) =>
      `\`${source}\` is not a valid id; it is written as \`${id}\`.`,
  },
  /** Findings that several front-ends share. */
  common: {
    /** A line or a statement that cannot be read, quoted. */
    cannotRead: (text: string) => `Cannot read \`${text}\`.`,
    /** The syntax a statement should have, as written in the source language. */
    expected: (syntax: string) => `Expected \`${syntax}\`.`,
    expectedEither: (first: string, second: string) => `Expected \`${first}\` or \`${second}\`.`,
    /** A CSS property of a Mermaid style that no style property matches. */
    css: (name: string) => `The CSS property \`${name}\` has no equivalent.`,
    /** A PlantUML command that is left out, such as `legend` or `scale`. */
    notImported: (word: string) => `\`${word}\` is not imported.`,
    sprites: "Sprites are not imported.",
    endWithoutBlock: "`end` without an open block.",
    blockNotClosed: "The block is not closed with `end`.",
    noteNotClosed: "The note is not closed with `end note`.",
    nestedBoxes: "Boxes cannot be nested.",
    invalidJson: (text: string) => `\`${text}\` is not valid JSON.`,
  },
  /** Findings of `mergeImport`, about the sheet that is imported again. */
  merge: {
    /** A diagram whose type changed: its id and its types before and after, as written. */
    typeChanged: (id: string, before: string, after: string) =>
      `\`${id}\` was a ${before} diagram and is now ${after}; the new import replaces it.`,
    /** A block of the existing sheet that the import does not produce. */
    kept: (name: string) => `\`${name}\` is not in the source; it is kept as it was.`,
    /** A copied statement that no longer compiles: what it was and the compiler's message. */
    droppedError: (what: string, message: string) => `${what} was dropped: ${message}`,
    /** An adjustment written in the block of an element that is gone. */
    adjustmentDropped: (statement: string, id: string) =>
      `\`${statement}\` of \`${id}\` was dropped: \`${id}\` is no longer in the source.`,
    /** A statement dropped because the ids it names are gone. */
    dropped: (statement: string, ids: readonly string[]) =>
      `\`${statement}\` was dropped: ${ids.map((id) => `\`${id}\``).join(", ")} ${ids.length === 1 ? "is" : "are"} no longer in the source.`,
    /** Ids taken out of a statement's targets, which keeps the others. */
    targetsRemoved: (ids: readonly string[], keyword: string) =>
      `${ids.map((id) => `\`${id}\``).join(", ")} ${ids.length === 1 ? "was" : "were"} removed from \`${keyword}\`: no longer in the source.`,
  },
  /** Findings of the Mermaid front-end shared by its diagram types. */
  mermaid: {
    config: "Mermaid configuration (themes, layout options) is not imported.",
    frontMatterField: (field: string) => `The front matter field \`${field}\` is not imported.`,
    frontMatterLine: "This front matter line is not imported.",
    frontMatterNotClosed: "The front matter is not closed with `---`.",
    init: "`%%{init}%%` directives (themes, configuration) are not imported.",
    noDiagram: "The Mermaid source has no diagram.",
    /** A diagram type the importer recognises and leaves out, such as `classDiagram`. */
    unsupported: (keyword: string) => `Mermaid \`${keyword}\` diagrams are not imported.`,
    notADiagramType: (word: string) => `\`${word}\` is not a Mermaid diagram type.`,
    supportedHint:
      "Supported: flowchart, graph, sequenceDiagram, C4Context, C4Container, C4Component, C4Dynamic, architecture-beta and block-beta.",
    c4Description: "C4 views have no description; `accDescr` is not imported.",
    labelHtml: "HTML formatting in a label is kept as plain text.",
    labelMarkdown: "Markdown emphasis in a label is kept as plain text.",
    labelIcon: "Font Awesome icons in labels are not drawn; the text is kept.",
    /**
     * A flowchart or block shape drawn as the nearest one: Mermaid's name, such as `lean_left`,
     * and the `shape` it gets, such as `parallelogram`.
     */
    shape: (shape: string, drawn: string) =>
      `The ${SHAPE_NAMES[shape] ?? shape.replace(/_/g, " ")} shape is drawn as ${/^[aeiou]/.test(drawn) ? "an" : "a"} ${drawn}.`,
  },
  /** Findings of Mermaid flowcharts. */
  flowchart: {
    unknownDirection: (direction: string) => `Unknown direction \`${direction}\`.`,
    header: "The header is not `flowchart <direction>`.",
    elk: "`flowchart-elk` is read as a flowchart; Meltemi lays every flow diagram out with ELK.",
    click: "Interactions (`click`) are not imported.",
    endWithoutSubgraph: "`end` without an open `subgraph`.",
    subgraphDirection:
      "A subgraph's own direction is not kept; the diagram's direction applies to its children.",
    link: (statement: string) => `Cannot read the link in \`${statement}\`.`,
    linkLabel: (statement: string) => `The link label is not closed in \`${statement}\`.`,
    target: (statement: string) => `Cannot read the target in \`${statement}\`.`,
    invisible: "Invisible links only steer Mermaid's layout; they are not imported.",
    /** A Mermaid 11 `@{ shape: … }` name the importer does not know. */
    namedShape: (name: string) => `The shape \`${name}\` is drawn as a node.`,
    nodeAttribute: (key: string) => `The node attribute \`${key}\` is not imported.`,
    linkAttribute: (key: string) => `The link attribute \`${key}\` is not imported.`,
    subgraphNotClosed: "The subgraph is not closed with `end`.",
    notANode: (source: string) => `\`${source}\` is not a node or subgraph.`,
    undefinedClass: (name: string) => `The class \`${name}\` is not defined with \`classDef\`.`,
    noLink: (index: number) => `There is no link number ${index}.`,
    storedData: "The stored-data shape is drawn as a data store.",
    textShape: "A text or comment shape becomes a note.",
  },
  /** Findings of Mermaid sequence diagrams. */
  sequence: {
    /** Arrows without an exact equivalent, by what they lose. */
    arrows: {
      cross: "A cross at the end is drawn as an arrowhead.",
      reply: "A line without arrowhead is drawn as a reply.",
      call: "A line without arrowhead is drawn as a call.",
    },
    links: "Participant menus (`link`, `links`) are not imported.",
    properties: "Participant properties are not imported.",
    participantType: (type: string) => `The type \`${type}\` is drawn as a participant.`,
    boxColour: "Box colours are not kept.",
    autonumberOff: "`autonumber off` is not kept; numbering runs through the diagram.",
    autonumberStep: "The numbering step is not kept; numbers go up by one.",
    sideNote: "A side note names one participant; the others are dropped.",
    /** `else`, `and` or `option` outside the fragment that takes it. */
    branchOutside: (word: string) => `\`${word}\` outside a fragment that accepts it.`,
  },
  /** Findings of Mermaid architecture diagrams. */
  architecture: {
    junction: "A junction becomes a small node without text that its edges meet at.",
    icon: (name: string) => `The icon \`${name}\` is not in the project's packs; it is not drawn.`,
    iconHint: "Add the pack to the project's assets, then import again.",
    notAGroup: (parent: string, source: string) =>
      `\`${parent}\` is not a group; \`${source}\` is drawn outside it.`,
    undeclared: (source: string) => `\`${source}\` is not declared; the edge is not imported.`,
    notInAGroup: (source: string) => `\`${source}\` is not in a group; the edge joins it directly.`,
  },
  /** Findings of Mermaid block diagrams. */
  block: {
    /** A block arrow pointing another way than right. */
    arrow: "The block arrow is drawn pointing right.",
    undefinedClass: (source: string, name: string) =>
      `\`${source}\` or \`${name}\` is not defined.`,
    notABlock: (source: string) => `\`${source}\` is not a block.`,
  },
  /** Findings of C4 macros, in Mermaid and C4-PlantUML. */
  c4: {
    closeWithoutBoundary: "`}` without an open boundary.",
    needsAlias: (macro: string) => `\`${macro}\` needs an alias.`,
    elementWithBody: "An element with a body is read as a boundary of its kind.",
    notDrawn: (macro: string) => `\`${macro}\` is not drawn; what it holds is kept.`,
    boundaryTags: "Tags and links of boundaries are not imported.",
    needsEnds: (macro: string) => `\`${macro}\` needs a source and a target.`,
    bidirectional: "A bidirectional relation becomes two relations.",
    directions: "Relation directions are left to the layout.",
    numbers: "Relation numbers are not drawn.",
    descriptions: "Relation descriptions are not imported.",
    drawingOnly: (macro: string) => `\`${macro}\` only changes the drawing; it is not imported.`,
    deploymentNodes: "Deployment nodes are not imported.",
    unknownMacro: (macro: string) => `\`${macro}\` is not a C4 macro the importer knows.`,
    boundaryNotClosed: "The boundary is not closed with `}`.",
    tags: "Tags are not imported.",
    links: "Links to URLs are not imported.",
    containerBoundaryAsSystem:
      "A container boundary around containers is read as the boundary of their system.",
    systemInSystem: "A system boundary inside another system is drawn as its own system.",
    containerBoundaryOutside:
      "A container boundary outside a system is placed in a system named after the diagram.",
    duplicate: (source: string) =>
      `\`${source}\` is declared twice; the first declaration is kept.`,
    containerInNamedSystem:
      "A container outside a system boundary is placed in a system named after the diagram.",
    containerInScope: "A container outside the boundary is placed in the system of the scope.",
    componentOutside: "A component outside a container boundary is placed in a container.",
    /** A person or a system declared inside a boundary, by the language's kind. */
    nested: (kind: "person" | "system" | "container" | "datastore" | "component") =>
      `A ${kind} inside a boundary is drawn at the top level.`,
    /** A relation end that is not an element: the end, and whether it names a boundary. */
    missingEnd: (source: string, boundary: boolean) =>
      `\`${source}\` is not an element of the diagram${boundary ? " (boundaries that are not drawn cannot be related)" : ""}; the relation is not imported.`,
    relationToParent: "A relation between an element and what contains it cannot be modelled.",
    componentScopes:
      "A component view has one scope; other container boundaries are drawn as their containers or systems.",
    componentNeedsContainer:
      "A component view needs a container; the diagram is drawn at the container level.",
    containerScopes:
      "A container view has one scope; other system boundaries are drawn as their systems.",
    containerNeedsSystem:
      "A container view needs a system; the diagram is drawn at the context level.",
    dynamic: "A dynamic diagram is drawn as a container view without step numbers.",
  },
  /** Findings of the PlantUML front-end shared by its diagram types. */
  plantuml: {
    /** An `@start…` block other than `@startuml`, such as `@startmindmap`. */
    unsupportedStart: (kind: string) => `PlantUML \`@start${kind}\` diagrams are not imported.`,
    supportedHint: "Supported: component, deployment, use case, sequence and C4-PlantUML diagrams.",
    /** `C4_Deployment` or `C4_Sequence`. */
    unsupportedC4: (name: string) => `\`${name}\` diagrams are not imported.`,
    c4LevelsHint: "Supported C4 levels: C4_Context, C4_Container, C4_Component and C4_Dynamic.",
    /** A diagram type found by its statements: class, activity, state, object, timing or data. */
    unsupportedKind: (kind: string) => `PlantUML ${kind} diagrams are not imported.`,
    empty: "The PlantUML block has no diagram.",
    blockNotClosed: (kind: string) => `The block is not closed with \`@end${kind}\`.`,
    titleNotClosed: "The title is not closed with `end title`.",
    skinparam: "`skinparam` styling is not imported.",
    style: "`<style>` blocks are not imported.",
    hide: "`hide` and `show` commands are not imported.",
  },
  /** Findings of PlantUML component, deployment and use case diagrams. */
  description: {
    containerNotClosed: "The container is not closed with `}`.",
    closeWithoutContainer: "`}` without an open container.",
    together: "`together` only steers PlantUML's layout; its elements are kept.",
    ports: "Ports are not imported.",
    noName: (statement: string) => `\`${statement}\` has no name.`,
    stereotypes: "Stereotypes become the element's description.",
    hidden: "Hidden links only steer PlantUML's layout; they are not imported.",
    directions: "Arrow directions are left to the layout.",
    multiplicity: "Labels at the ends of a link are not drawn.",
    otherHeads:
      "Heads without an equivalent (`#`, `+`, `^`, sockets) are drawn as plain arrowheads.",
    noteOnLink: "Notes on links are not imported.",
    unattachedNote: "The note is not attached to an element.",
    /** A container keyword whose shape is lost, such as `component`. */
    containerShape: (keyword: string) => `A ${keyword} with a body is drawn as a group.`,
  },
  /** Findings of PlantUML sequence diagrams. */
  plantumlSequence: {
    fragmentNotClosed: "The fragment is not closed with `end`.",
    space: "Extra space between messages is left to the layout.",
    footbox: "`hide footbox` is not imported.",
    participantColours: "Participant colours are not imported.",
    participantStereotypes: "Participant stereotypes are not imported.",
    returnWithoutActivation: "`return` needs an activation started by a message.",
    numberingControl: "Pausing or resuming the numbering is not imported.",
    numberingFormat: "Numbering steps and formats are not kept.",
    boxColours: "Box colours are not imported.",
    endBoxWithoutBox: "`end box` without `box`.",
    elseOutside: "`else` outside `alt`, `par` or `critical`.",
    endWithoutFragment: "`end` without an open fragment.",
    noteAcross: "A note across the diagram spans every participant declared so far.",
    noteOnMessage: "A note on a message is placed beside its participant.",
    noteWithoutParticipant: "The note names no participant.",
    noteShapes: "Hexagonal and boxed notes are drawn as notes.",
    ref: "A reference frame is drawn as a note over its participants.",
    gate: "Messages from or to outside the diagram go through a participant `outside`.",
    parallel: "Parallel messages (`&`) are drawn one after the other.",
    twoHeads: "A message with two different heads is drawn one way.",
    heads: "Half, lost and circle arrowheads are drawn as plain ones.",
    messageColours: "Message colours are not imported.",
  },
  /** Findings of the PlantUML preprocessor and its expressions. */
  preprocessor: {
    importArchives: "`!import` reads archives, which the importer does not open.",
    assertion: (text: string) => `Assertion failed: ${text}`,
    themes: "PlantUML themes are not imported.",
    pragma: "`!pragma` settings are not imported.",
    /** A closing directive such as `!endif` without its opening one. */
    unopened: (word: string) => `\`!${word}\` without the directive that opens it.`,
    unknownDirective: (word: string) =>
      `\`!${word}\` is not a preprocessor directive the importer knows.`,
    tooManyLines: (max: number) => `Preprocessing produced more than ${max} lines.`,
    tooDeep: (name: string, max: number) =>
      `\`${name}\` expands more than ${max} levels deep; it may call itself without end.`,
    arguments: (name: string, count: number) => `\`${name}\` takes ${count} arguments.`,
    callNotClosed: (name: string) => `The call of \`${name}\` is not closed.`,
    notAFunction: (name: string) => `\`${name}\` is not a function.`,
    unknownBuiltin: (name: string) => `\`${name}\` is not a built-in function the importer knows.`,
    blockNotClosed: "The block is not closed.",
    loop: (max: number) => `The loop runs more than ${max} times.`,
    standardLibrary: (name: string) =>
      `The standard library \`${name}\` is not read; its sprites and macros are not imported.`,
    remote: (path: string) => `\`${path}\` is a remote include; the importer never fetches files.`,
    absolute: (path: string) => `\`${path}\` is an absolute path; includes must be relative.`,
    outside: (path: string) => `\`${path}\` is outside the folder being imported.`,
    includesItself: (path: string) => `\`${path}\` includes itself.`,
    notFound: (path: string) => `\`${path}\` was not found.`,
    /** An include when the host gave no way to read files. */
    unreadable: (path: string) => `\`${path}\` cannot be read here.`,
    noBlockNumber: (sub: string) => `The file has no block number ${sub}.`,
    noSubpart: (sub: string) => `The file has no \`!startsub ${sub}\`.`,
    unclosedString: (text: string) => `Unclosed string in \`${text}\`.`,
    /** An unexpected character or operator in an expression. */
    unexpected: (what: string, text: string) => `Unexpected \`${what}\` in \`${text}\`.`,
    unclosedJson: (text: string) => `Unclosed JSON in \`${text}\`.`,
    expectedIn: (operator: string, text: string) => `Expected \`${operator}\` in \`${text}\`.`,
    undefinedVariable: (name: string) => `\`${name}\` is not defined.`,
    incomplete: (text: string) => `The expression \`${text}\` is incomplete.`,
    trailing: (text: string) => `Unexpected text after the expression \`${text}\`.`,
  },
  /**
   * Words written into the imported sheet, in the language the import asks for: they are content,
   * like the labels the person writes.
   */
  content: {
    /** The comment under the header: the source's name and format. */
    header: (from: string) => `Imported from ${from} by meltemi-diagrams.`,
    /** A comment that keeps a line the importer could not read. */
    notImported: (text: string) => `Not imported: ${text}`,
    /** The label of a system added for containers outside every system boundary. */
    system: "System",
    /** The label of a container added for components outside every container boundary. */
    components: "Components",
  },
  /**
   * The notes of the coverage tables (`MERMAID_COVERAGE`, `PLANTUML_COVERAGE`) by note; C4 entity
   * macros also report theirs as findings. The English ones are the tables' `notes`.
   */
  coverage: {
    syntax: "`import.syntax`.",
    syntaxEssential: "`import.syntax`, essential.",
    syntaxKeptAsComment: "`import.syntax`, essential; kept as a comment.",
    syntaxFirstKept: "`import.syntax`; the first declaration is kept.",
    unsupportedDiagram: "`import.unsupported-diagram`.",
    essential: "Essential.",
    drawingOnly: "Drawing only.",
    c4Description: "C4 views have no description; there it is dropped.",
    lineBreaks: "`<br>` becomes a line break.",
    classicShapes: "Classic shape names map as in the rows above.",
    doubleRing: "The double ring is not drawn.",
    mirrored: "The mirrored form is not drawn.",
    innermostSubgraph: "A node belongs to the innermost subgraph that mentions it.",
    missingPacks: "Icons of packs the project lacks are dropped.",
    sidesAsPorts: "Positions are left to ELK; the sides are kept as ports.",
    databaseSystem: "A database system is drawn as a system.",
    queueSystem: "A queue system is drawn as a system.",
    queueContainer: "A queue container is drawn as a container.",
    externalOnly: "Only persons and systems are marked external.",
    queueContainerExternal:
      "A queue container is drawn as a container; only persons and systems are marked external.",
    databaseComponent: "A database component is drawn as a component.",
    queueComponent: "A queue component is drawn as a component.",
    databaseComponentExternal:
      "A database component is drawn as a component; only persons and systems are marked external.",
    queueComponentExternal:
      "A queue component is drawn as a component; only persons and systems are marked external.",
    containerBoundaryAsSystem:
      "Around containers without components it is read as their system's boundary (approximated).",
    boundaryType: 'With `$type="system"` or `"container"` it is read as that boundary.',
    directions: "Directions are left to the layout.",
    stepNumbers: "Step numbers are not drawn.",
    looseContainers:
      "Outside a system boundary it goes into the scope's system or one named after the diagram (approximated).",
    deployment: "Essential: deployment diagrams are not imported.",
    passes: "At most 1000 passes.",
    deterministic: "Imports are deterministic: dates and environment are empty.",
    relativeIncludes: "Relative to the including file, inside the imported folder or project.",
    recognised: "Recognised, never read.",
    libraryMacros: "Their macros are not imported.",
    neverFetches: "`import.include`, essential: the importer never fetches files.",
    preprocessorEssential: "`import.preprocessor`, essential.",
    unclosedBlock: "An unclosed block is `import.syntax`.",
    elementsKept: "Its elements are kept.",
  },
};

/** A note of the coverage tables, by its key in the catalogs. */
export type CoverageNote = keyof typeof en.coverage;
