import { catalog, plural } from "@meltemi/diagrams-i18n";
import { messages } from "./index.js";

/** Code inside a sentence: `id`. */
const code = (text: string) => `\`${text}\``;

/** A time for people: `800 ms`, `0 s`, `1.25 s`; Spanish prose writes the decimal comma. */
function time(ms: number, comma: boolean): string {
  const text = ms === 0 || ms >= 1000 ? `${Math.round(ms) / 1000} s` : `${ms} ms`;
  return comma ? text.replace(".", ",") : text;
}

/**
 * The words of the language services: hovers and keyword documentation, completion details, the
 * titles of quick fixes and refactors, why a rename is refused and the details of the outline.
 * Code in them (keywords, values, ids and samples) stays as written in both languages. They are
 * apart from the editor's other words because the canvas page bundles those, never these.
 */
const en = {
  /** One line of documentation for each keyword, property and value: completion and hover. */
  keywords: {
    // top level
    language: 'The language version of the file, such as `language "0.2"`.',
    import: "Imports themes and blocks from another `.meltemi` file of the project.",
    diagram:
      "A diagram: `diagram <id>: flow { ... }`, `diagram <id>: free { ... }` or `diagram <id>: sequence { ... }`.",
    theme: 'A theme for the diagram (`theme "technical.dark"`), or a theme block at the top level.',
    model: "A model block (compiled by the C4 profile).",
    story:
      "A story about a diagram: `story <id> for <diagram> { scene ... }`, drawn frame by frame on one clock.",
    export:
      "A reproducible delivery: `export <id> for <diagram-or-story> { format png; … }`, written by `meltemi-diagrams export --profile <id>`.",
    // declarations
    node: 'A box: `node <id> "Label"`, or `<id>["Label"]`.',
    decision: 'A decision diamond: `decision <id> "Label?"`.',
    data: 'A data store cylinder: `data <id> "Label"`, or `<id>[("Label")]`.',
    group:
      "A band holding declarations, relations and nested groups; in a sequence diagram, a box around participants.",
    note: 'Free text without a border: `note <id> "Line one\\nLine two" [on <element>]`; in a sequence diagram, a note on lifelines: `note [<id>] over a, b "Text"`, `left of a` or `right of a`.',
    on: 'Attaches a note to an element: `note <id> "Text" on <element>` draws a dotted leader from the note to the element and keeps them near each other in an automatic layout.',
    tag: 'A small pill, often placed on a box corner: `tag <id> "PKCE"`.',
    box: 'A shape with a label in a free diagram: `box <id> "Label"`, or `<id>["Label"]`.',
    text: 'Measured text without a frame in a free diagram: `text <id> "Line one\\nLine two"`.',
    image: 'An image file of the project in a free diagram: `image <id> "logo.png"`.',
    sticky:
      'A sticky note of a free diagram: `sticky <id> "Text"`, a square card that keeps its size and wraps and shrinks its text to fit it. In a theme, the colour of stickies.',
    pen: "A freehand stroke of a free diagram through its points, in the coordinates of its group: `pen <id> [(x, y), (x, y), ...]`; one point is a dot.",
    // sequence participants
    participant: 'A participant with a box head: `participant <id> "Label"`, or `<id>["Label"]`.',
    actor: 'A person: `actor <id> "Label"`.',
    boundary: 'A system boundary: `boundary <id> "Label"`.',
    control: 'A controller: `control <id> "Label"`.',
    entity: 'A domain entity: `entity <id> "Label"`.',
    database: 'A database: `database <id> "Label"`, or `<id>[("Label")]`.',
    collections: 'A set of instances: `collections <id> "Label"`.',
    queue: 'A message queue: `queue <id> "Label"`.',
    // sequence events
    activate: "Starts an activation bar on a participant: `activate <participant>`.",
    deactivate: "Ends the innermost activation bar of a participant: `deactivate <participant>`.",
    create: "The participant appears here: its head is drawn at this row, `create <participant>`.",
    destroy: "The lifeline ends here with a cross: `destroy <participant>`.",
    alt: 'Alternatives: `alt [<id>] "Condition" { ... } else "Other" { ... }`.',
    opt: 'An optional part: `opt [<id>] "Condition" { ... }`.',
    loop: 'A repeated part: `loop [<id>] "Until done" { ... }`.',
    par: "Parallel parts: `par [<id>] { ... } and { ... }`.",
    break: 'Ends the enclosing interaction when it happens: `break [<id>] "Condition" { ... }`.',
    critical:
      'An atomic part with options: `critical [<id>] "Label" { ... } option "Other" { ... }`.',
    region: 'A labelled region: `region [<id>] "Label" { ... }`.',
    else: "Another branch of an `alt` fragment.",
    and: "Another branch of a `par` fragment.",
    option: "Another branch of a `critical` fragment.",
    divider: 'A labelled line across every lifeline: `divider "Label"`.',
    delay:
      'In a sequence diagram, a gap in time across every lifeline: `delay` or `delay "Label"`. In `animate`, the time before the first cycle, 0 to 60 s, such as `500ms`.',
    over: "A note over one or more participants.",
    left: "A note left of a participant: `left of <participant>`.",
    right: "A note right of a participant: `right of <participant>`.",
    of: "The participant beside a note.",
    autonumber:
      "Numbers the messages of a sequence diagram: `autonumber` from 1, or `autonumber 10`.",
    kind: "`kind async` draws a message with an open arrowhead; `sync` is the default.",
    async: "A message the sender does not wait for, drawn with an open arrowhead.",
    sync: "A call the sender waits for, drawn with a filled arrowhead; the default.",
    scenario: 'One path through a sequence diagram: `scenario <id> "Label" { choose check "OK" }`.',
    choose:
      'In a scenario, the branch of an `alt` or `critical` fragment: `choose <fragment> "Condition"` or `choose <fragment> <n>`.',
    skip: "In a scenario, leaves out an `opt` or `break` fragment: `skip <fragment>`.",
    take: "In a scenario, keeps an `opt` or `break` fragment: `take <fragment>`.",
    space: "Extra space above a message, note or fragment: `space <id> 24`.",
    gap: "Extra space left of a participant: `gap <participant> 40`.",
    sequence: "A sequence diagram: participants, messages in order, fragments and scenarios.",
    // diagram properties
    direction:
      "Flow of the automatic layout: `LR` (default), `RL`, `TB` or `BT`. In `animate`, `forward` (default) or `reverse` along the relation.",
    layout:
      "`auto` (ELK arranges everything), `assisted` (placed boxes stay, ELK arranges the rest) or `manual`.",
    routing: "Connector shape: `auto`, `orthogonal`, `polyline` or `bezier`.",
    layers: "Layers of a free diagram from back to front: `layers back, main, front`.",
    title: "The title, in the SVG `<title>` and the brand frame.",
    description: "A description: the SVG `<desc>`, or the second line of a box.",
    preset: "`document`, `slide` (16:9) or `board` (a whiteboard that grows) canvas.",
    board:
      "A whiteboard canvas that grows with what is drawn on it: `preset board` reports no `layout.too-large`.",
    canvas: "A fixed canvas size: `canvas (1280, 720)`.",
    placement: "Positions, sizes, routes, label anchors and constraints.",
    style: "Visual properties for elements or named relations: `style a, b { fill accent }`.",
    animate: "Animation of elements or relations: `animate r { effect flow }`.",
    class: "A reusable set of style properties, or `class <id>` to apply one.",
    rule: "Style properties for every element of a kind: `rule data { pattern dots }`.",
    // element blocks
    port: "A named port on a side: `port in west 30%`.",
    layer: "The layer of an object or relation of a free diagram: `layer front`.",
    link: "Identity with an element of another diagram: `link checkout.api`.",
    assumption:
      'Marks an inferred relation as not confirmed, drawn dashed in the muted colour: `assumption "Usual for checkouts"`. Remove it to confirm the relation.',
    url: 'A hyperlink for exports: `url "https://docs.example.com/api"`; SVG, PDF and HTML keep it.',
    // placement
    place: "The centre of a box: `place <element> at (x, y)`.",
    size: "Width and height of a box: `size <element> (w, h)`.",
    route: "Ports and waypoints of a relation: `route <r> from a.east to b.west via [(x, y)]`.",
    label: "Position of a relation label: `label <r> at 50% offset (0, -16)`.",
    align:
      "Aligns edges or centres: `align a, b, c top` (`middle`, `bottom`, `left`, `center`, `right`).",
    row: "Equal vertical centres: `row a, b, c`.",
    column: "Equal horizontal centres: `column a, b, c`.",
    order: "Increasing order along an axis: `order a, b, c [horizontal|vertical]`.",
    distance: "A minimum gap between two boxes: `distance a, b 80`.",
    at: "Position of a `place` or a `label`.",
    from: "The source end of a route.",
    to: "The target end of a route.",
    via: "Waypoints of a route: `via [(x, y), ...]`.",
    // style properties
    icon: 'An icon `"<pack>:<name>"` left of or above the text, or an icon object of a free diagram: `icon <id> "tabler:server"`.',
    shape:
      "Shape of a free box or a flow node: `rounded` (default), `rectangle`, `square`, `ellipse`, `circle`, `diamond`, `cylinder`, `pill`, `triangle`, `parallelogram`, `trapezoid`, `pentagon`, `hexagon`, `octagon`, `star`, `cloud`, `document`, `callout`, `arrow`, `framed`, `flag`, `person` or `agent`.",
    radius:
      "Corner radius, 0 to 64: of a box, node, decision, note or group in a style, over the theme's `radius` (`groupRadius` for groups); it rounds the corners of `rounded`, `rectangle`, `square` and `framed` boxes and the vertices of polygons (none by default on them); ellipses, circles, pills, cylinders, clouds and documents ignore it. In a theme, the default of rounded boxes, nodes and notes.",
    rotation:
      "Degrees an element is turned, 0 to 360, clockwise about the centre of its box; its text and icon turn with it. Elements of flow diagrams and free compositions, not groups.",
    fontSize: "Text size of a free box or text, 6 to 160.",
    fontWeight: "Text weight of a free box or text: 400, 500, 600 or 700.",
    textAlign: "`left`, `center` or `right` alignment of a free box or text.",
    verticalAlign:
      "`top`, `middle` (default) or `bottom`: where a free box's text sits within its shape's text band.",
    sketch:
      "A theme token: `none`, `light` or `rough` strokes, painted by hand in two passes (`sketch.light` and `sketch.dark` use `light`).",
    iconColor: "Colour of a monochrome icon.",
    iconPosition: "`left` or `top`; boxes only.",
    fill: 'Background colour; `"none"` draws no background.',
    stroke: "Outline or connector colour.",
    color: "Text colour; in `animate`, the colour of flow particles, a pulse or a trace.",
    line: "`solid`, `dashed` or `dotted` outline or connector.",
    width: "Outline or connector width, 0 to 64; the width of a pen's stroke, 1 to 64.",
    opacity:
      "How opaque an element, group, line or pen of a free diagram is, 0 to 1: `opacity 0.35`.",
    highlight: "In a theme, the colour of the highlighter: `stroke highlight` on a pen.",
    stickyText: "In a theme, the colour of the text of stickies.",
    pattern: "`none`, `hatch`, `dots` or `cross` over the shape; elements only.",
    arrowhead:
      "The head at a relation's target: `triangle`, `open`, `none`, `triangleOutline`, `diamond`, `diamondOutline`, `circle`, `circleOutline`, `bar`, `cross`, or the crow's-foot ends `many`, `oneOrMany`, `onlyOne`, `zeroOrOne`, `zeroOrMany`; relations only.",
    arrowtail:
      "The head at a relation's source, with the values of `arrowhead`; none by default, or the end's head for `<->`. Relations only.",
    corners: "`sharp` or `rounded` bends of straight and elbow connectors; relations only.",
    sharp: "Bends with a corner.",
    triangleOutline: "A hollow triangle, as UML draws generalisation.",
    diamond:
      "A diamond: the shape of a box or a node, or a filled head at a relation's end, as UML draws composition.",
    diamondOutline: "A hollow diamond, as UML draws aggregation.",
    circleOutline: "A hollow circle.",
    bar: "A bar across the line.",
    many: "A crow's foot: many, in entity-relationship notation.",
    oneOrMany: "A crow's foot and a bar: one or many.",
    onlyOne: "Two bars: exactly one.",
    zeroOrOne: "A circle and a bar: zero or one.",
    zeroOrMany: "A circle and a crow's foot: zero or many.",
    dotted: "Round dots, spaced by the line's width.",
    rounded:
      "Rounded: the shape of boxes and nodes without one, or the bends of a connector with `corners rounded`.",
    circle: "A circle: the shape of a box or a node, or a filled head at the end of a relation.",
    cross: "An X: a pattern over a shape, or the head at the end of a relation.",
    // animate
    effect:
      "`flow` (particles along a relation), `pulse` (a halo around an element, relation, note or fragment), `dash` (a dash moving along a relation or an outline) or `trace` (a highlight that fills a relation from its start to its end, then starts again).",
    duration:
      "Duration of one cycle, 100 ms to 60 s, such as `1200ms` or `1.2s`; by default the theme's, else 1200 ms for flow, 1500 ms for trace and 1 s for the others.",
    particles: "How many particles a flow effect runs along the relation, 1 to 8; 1 by default.",
    forward: "From the source to the target of the relation.",
    reverse: "From the target to the source of the relation.",
    repeat:
      "`forever` or a number of cycles in `animate`; in a scenario, the iterations of a loop: `repeat <loop> <n>`.",
    // values
    auto: "Chosen automatically.",
    assisted: "Placed boxes stay; the engine arranges the others around them.",
    manual: "Every box needs a `place`; the default of free diagrams.",
    free: "A free composition: boxes, text, icons, images and groups placed by hand.",
    flow: "A flow diagram: nodes, decisions, data stores and groups, arranged by ELK.",
    orthogonal: "Horizontal and vertical segments.",
    polyline: "Straight segments.",
    bezier: "A smooth curve.",
  },

  /**
   * What the words of a list group mean in a group block of a free diagram, where `layout`,
   * `align`, `column` and `row` are not the diagram's or the placement's: completion and hover.
   */
  listWords: {
    layout:
      "Makes the group a list that arranges its children in source order: `layout column` (one under the other) or `layout row` (side by side); a `place` on a child is ignored.",
    spacing:
      "The distance between the children of a list, 0 to 400: `spacing 12`; half the theme's `groupPadding` by default.",
    align:
      "Where the children of a list sit across it: `start` (default), `center`, `end` or `stretch`.",
    column: "The children one under the other, the list growing downwards.",
    row: "The children side by side, the list growing to the right; a row of columns is a kanban board.",
    start: "At the start across the list: the left of a column, the top of a row; the default.",
    center: "Centred across the list.",
    end: "At the end across the list: the right of a column, the bottom of a row.",
    stretch: "Stretched across the list to its width (a column) or its height (a row).",
  },

  /** What every option of an `export` profile does: completion and hover in its block. */
  exportOptions: {
    export:
      "A reproducible delivery: `export <id> for <diagram-or-story> { format png; … }`, written by `meltemi-diagrams export --profile <id>`.",
    for: "The diagram or story the profile exports.",
    format:
      "What the profile writes: `svg`, `png`, `pdf`, `html` (the player), `mp4`, `webm` or `gif`.",
    size: "The output size `(width, height)` in pixels; the picture is fitted and centred. PNG, PDF and video.",
    scale: "PNG pixels per unit, 1 to 8; 2 by default.",
    background:
      "`transparent`, a quoted colour or a colour token such as `accent`; the theme's background by default.",
    at: "The instant to draw, such as `1.5s`: of the diagram's effects or of the story. SVG, PNG and PDF.",
    motion: "`static` (the default) or `animated`, the animated SVG profile. SVG of diagrams.",
    theme: 'The theme to render with, such as `theme "stage.dark"`, instead of the diagram\'s own.',
    fonts: "SVG and HTML text: `embedded` (the default), `outlined` or `system`.",
    scenario: "The scenario of the sequence diagram to draw.",
    link: "A URL the whole picture links to, such as the story's player. SVG and PDF.",
    fps: "Video frames per second, 1 to 60; 30 by default.",
    duration: "How long the video lasts; needed when the effects repeat forever.",
    file: 'The output path, relative to this file, such as `file "slides/checkout.png"`; `<stem>.<id>.<ext>` by default.',
    autoplay: "The HTML player starts at once, unless the viewer asks for reduced motion.",
    loop: "The HTML player starts again at the end.",
    embed: "Writes a fragment of HTML to paste into a page, instead of a complete page.",
  },

  /** What the story vocabulary means: completion and hover inside stories. */
  storyWords: {
    story:
      "A story about a diagram: `story <id> for <diagram> { scene ... }`. Scenes run one after the other on one clock.",
    for: "The diagram the story starts with; scenes may change it with `view`.",
    title: 'The title of the story: `title "A purchase"`.',
    description: "A description of the story.",
    scene:
      'A step of the story: `scene <id> ["Title"] { view; transition; actions }`. It starts when the previous one ends.',
    view: "The diagram this scene shows: `view <diagram>`, first in the scene. A change of view needs a `transition`.",
    transition:
      "How the scene's view replaces the previous one: `transition cut|fade|morph [over <time>]`, before the actions.",
    cut: "Switches to the new view at once.",
    fade: "Cross-fades the two views; 800 ms by default.",
    morph:
      "Moves the boxes both views draw (same id) from their old place to the new one and cross-fades the rest; 800 ms by default.",
    reveal:
      "Fades the targets in: `reveal a, b [over <time>]`; 600 ms by default. Targets first revealed start hidden.",
    hide: "Fades the targets out: `hide a, b [over <time>]`; 600 ms by default.",
    highlight:
      "Outlines the targets in the accent colour for the action's time: `highlight a [over <time>]`; 1 s by default.",
    focus:
      "Dims everything but the targets and the relations between them to the end of the scene: `focus a, b`, or `focus all` to clear it; 600 ms by default.",
    camera:
      "Moves the view box to the targets plus 40 px: `camera a, b`, or `camera all` for the whole view; 800 ms by default.",
    trace:
      "Draws one relation from its source to its target in the accent colour: `trace r [over <time>]`; 1.2 s by default.",
    draw: "Draws pens, free lines and named relations from their first point to their last, one after the other, and leaves them drawn: `draw a, b [over <time>]`; 800 ms by default. Targets first drawn start hidden.",
    hold: "Waits: `hold 2s`.",
    parallel:
      "Actions that start together: `parallel { ... }`. It lasts as long as its longest action.",
    over: "The time the action or transition takes, such as `over 800ms` or `over 1.5s`.",
    all: "Every element of the view: `focus all` clears the focus, `camera all` frames the whole view.",
  },

  /** The type line of a C4 entity in its hover: `[Software System: Go]`. */
  c4Types: {
    person: "Person",
    system: "Software System",
    container: "Container",
    datastore: "Container",
    component: "Component",
  },
  externalC4Types: {
    person: "External Person",
    system: "External Software System",
    container: "External Container",
    datastore: "External Container",
    component: "External Component",
  },

  /** A duration for people: `800 ms`, `1.25 s`. */
  time: (ms: number) => time(ms, false),
  /** After what another file declares: a model, a diagram, a view. */
  imported: " (imported)",
  /** The branch of a fragment without a condition: `branch 2`. */
  branch: (n: number) => `branch ${n}`,

  /** Headings of hovers on diagrams, stories and scenes. */
  headings: {
    diagram: (type: string, name: string) => `**${type} diagram** ${code(name)}`,
    unresolvedDiagram: (name: string) => `**diagram** ${code(name)} — not resolved`,
    story: (name: string) => `**story** ${code(name)}`,
    scene: (name: string) => `**scene** ${code(name)}`,
  },

  /** Hovers on elements, relations, events, models, ports, icons, images, themes and links. */
  hover: {
    /** Facts about an element, joined with " · ". */
    placed: (x: string, y: string) => `place (${x}, ${y})`,
    arranged: (x: string, y: string) => `arranged at (${x}, ${y})`,
    size: (width: string, height: string) => `size ${width} × ${height}`,
    defaultSize: (width: string, height: string) => `size ${width} × ${height} (default)`,
    ports: (ports: string) => `ports ${ports}`,
    /** Where something sits: groups or fragments, outermost first. */
    within: (path: string) => `in ${path}`,
    layer: (layer: string) => `layer ${code(layer)}`,
    linked: (target: string) => `linked to ${code(target)}`,

    /** Whiteboard objects: the points of a pen, the colour of a sticky, a list group. */
    points: (count: number) => `${count} point${count === 1 ? "" : "s"}`,
    colour: (colour: string, token: string | null) =>
      `colour ${code(colour)}${token ? ` (the theme's ${code(token)})` : ""}`,
    list: (layout: string) => `list ${code(`layout ${layout}`)}`,
    listSpacing: (spacing: string, byDefault: boolean) =>
      `${code(`spacing ${spacing}`)}${byDefault ? " (default)" : ""}`,
    listAlign: (align: string, byDefault: boolean) =>
      `${code(`align ${align}`)}${byDefault ? " (default)" : ""}`,
    placedBy: (list: string) => `placed by the list ${code(list)}`,

    /** What a relation is. */
    relation: "relation",
    message: "message",
    reply: "reply",
    asyncMessage: "async message",
    named: (id: string) => ` as ${code(id)}`,
    label: (label: string) => `label “${label}”`,
    spaceBefore: (amount: string) => `space ${amount} before`,
    route: (from: string, to: string, via: string) => `route ${from} → ${to}${via}`,
    via: (points: string) => ` via ${points}`,

    /** Notes and fragments of sequence diagrams. */
    over: (participants: string) => `over ${participants}`,
    beside: (position: "left" | "right", participant: string) =>
      `${position} of ${code(participant)}`,
    fragment: (operator: string, id: string) => `**${operator}** fragment${id}`,
    noCondition: "(no condition)",
    events: (count: number) => `${count} event${count === 1 ? "" : "s"}`,
    decidedBy: (scenarios: string) => `decided by ${scenarios}`,
    scenario: (id: string, label: string) => `**scenario** ${code(id)} — ${label}`,
    times: (count: number) => ` ${count} times`,

    /** Models, ports, icons, images, themes and links. */
    model: (name: string, entities: number, relations: number, imported: boolean) =>
      `**model** ${code(name)} — ${entities} entities, ${relations} relations${imported ? " (imported)" : ""}`,
    unresolvedModel: (name: string) => `**model** ${code(name)} — not resolved`,
    port: (name: string, element: string, side: string, percent: number) =>
      `**port** ${code(name)} of ${code(element)} — ${side} side, ${percent}% along it`,
    compassPort: (port: string) =>
      `**port** ${code(port)} — ${port === "auto" ? "the side facing the other end" : `the ${port} side`}`,
    iconStatus: {
      "unknown-pack": "unknown pack",
      "unknown-icon": "unknown icon",
      unusable: "unusable",
      malformed: "malformed",
    },
    unknownLicence: "licence unknown",
    image: (path: string, format: string, width: number, height: number) =>
      `**image** ${code(path)} — ${format}, ${width} × ${height} px`,
    missingImage: (path: string) =>
      `**image** ${code(path)} — not found in the project, or not a PNG, JPEG, GIF, WebP or SVG file`,
    theme: (name: string) => `**theme** ${code(name)}`,
    extends: (theme: string, frame: string | undefined) =>
      `extends ${theme}${frame ? ` · frame ${frame}` : ""}`,
    builtInTheme: (name: string, background: string, font: string, frame: string) =>
      `**theme** ${code(name)} (built in)\n\nbackground ${background} · font ${font} · frame ${frame}`,
    linkTo: (element: string, diagram: string, type: string) =>
      `**link** to ${code(element)} of ${code(diagram)} (${type})`,
    identityOnly: "Identity only: nothing is kept in step between the views.",
    link: (text: string) => `**link** ${code(text)} — identity with an element of another diagram`,

    /** Kinds and types of declared diagram types, from their plugins. */
    required: " (required)",
    kindOf: (title: string, plugin: string | null) =>
      `A kind of ${title} diagrams${plugin ? `, from the plugin ${plugin}` : ""}.`,
    kinds: (kinds: string, plugin: string | null) =>
      `. Kinds: ${kinds}${plugin ? `. From the plugin ${plugin}.` : "."}`,

    /** Entities of models. */
    inModel: (name: string) => `model ${code(name)}`,
    drawnIn: (views: string) => ` · drawn in ${views}`,
  },

  /** Hovers in export profiles. */
  profile: {
    noFormat: "no format",
    target: (kind: "diagram" | "story" | null, name: string) =>
      `of the ${kind ?? "unknown target"} ${code(name)}`,
    scale: (scale: number) => `scale ${scale}`,
    background: (background: string) => `background ${background}`,
    at: (ms: number) => `at ${ms} ms`,
    heading: (id: string, facts: string) =>
      `**export profile** ${code(id)} — ${facts}\n\n\`meltemi-diagrams export <file> --profile ${id}\``,
    notFound: (name: string) => `${code(name)} — not found`,
    /** The detail of a profile in the outline: `png of checkout`. */
    symbol: (format: string, target: string) => `${format} of ${target}`,
  },

  /** Hovers and the outline in stories. */
  story: {
    unresolvedView: (id: string) => `${code(id)} — the view did not resolve`,
    inView: (view: string) => `in ${view}`,
    summary: (duration: string, scenes: number, view: string) =>
      `${duration} in ${scenes} scene${scenes === 1 ? "" : "s"}, about ${view}`,
    span: (start: string, end: string, view: string, transition: string | null) =>
      `${start} to ${end} · view ${view}${transition ? ` · ${transition} transition` : ""}`,
    timing: (start: string, duration: string, byDefault: boolean) =>
      `From ${start} for ${duration}${byDefault ? " (default)" : ""}.`,
    symbol: (duration: string) => `story · ${duration}`,
  },

  /** Details of completion items. */
  completion: {
    noConditionBranch: "branch without a condition",
    imageFile: "image file",
    port: (side: string, percent: number) => `port on ${side} at ${percent}%`,
    compassPort: "compass port",
    model: "model",
    layer: "layer",
    relationsOnly: "relations only",
    fragment: (operator: string) => `${operator} fragment`,
    diagram: (type: string) => `${type} diagram`,
    story: "story",
    imported: "imported",
  },

  /** Labels the snippets of new blocks write, which the person types over. */
  snippets: {
    customer: "Customer",
    shop: "Shop",
    uses: "Uses",
    request: "Request",
    response: "Response",
    title: "Title",
  },

  /** Titles of quick fixes and refactors: commands. */
  fixes: {
    arrangeUnplaced: "Arrange the unplaced elements with ELK",
    switchLayout: (mode: string) => `Switch to \`layout ${mode}\``,
    removeFromInclude: (entry: string) => `Remove ${code(entry)} from include`,
    addScope: (path: string) => `Add \`scope ${path}\``,
    changeTo: (value: string) => `Change to ${code(value)}`,
    removeDeactivate: "Remove this `deactivate`",
    activateBefore: (participant: string) => `Add \`activate ${participant}\` before it`,
    declareElement: (id: string, kind: "node" | "box" | "participant") =>
      `Declare ${code(id)} as a ${kind}`,
    declareLayer: (layer: string) => `Declare layer ${code(layer)}`,
    removeLink: "Remove the link",
    declarePort: (port: string, element: string) =>
      `Declare port ${code(port)} on ${code(element)}`,
    usePort: (element: string, port: string) => `Use \`${element}.${port}\``,
    setSize: (element: string, width: number, height: number) =>
      `Set the size of ${code(element)} to ${width} × ${height}`,
    confirmAssumption: "Confirm the relation (remove its assumption)",
    nameRelation: (id: string) => `Name this relation ${code(id)}`,
    arrangeDiagram: (id: string) => `Arrange diagram ${code(id)} (recompute every position)`,
    removePlace: (element: string, list: string) =>
      `Remove \`place ${element}\` (the list ${code(list)} places it)`,
    addListLayout: (group: string) => `Add \`layout column\` to ${code(group)}`,
    switchPreset: (preset: string) => `Switch to \`preset ${preset}\``,
  },

  /** Why the token under the cursor cannot be renamed here. */
  rename: {
    notRenamable: "Only the ids of elements, relations, notes and fragments can be renamed.",
    nameRelationFirst: "Name the relation with `as <id>` before renaming it.",
    importedModel: (path: string) =>
      `${code(path)} belongs to an imported model; rename it across the project.`,
    importedDiagram: (id: string) =>
      `${code(id)} belongs to an imported diagram; rename it across the project.`,
  },

  /** Details of the outline's symbols. */
  symbols: {
    model: "model",
    theme: "theme",
    extends: (theme: string) => `extends ${theme}`,
  },

  /** Words for the kinds of free objects the editor's own table does not name. */
  kinds: {
    line: "line",
    pen: "pen",
    sticky: "sticky",
  },
};

const es: typeof en = {
  keywords: {
    // nivel superior
    language: 'La versión del lenguaje del archivo, como `language "0.2"`.',
    import: "Importa temas y bloques de otro archivo `.meltemi` del proyecto.",
    diagram:
      "Un diagrama: `diagram <id>: flow { ... }`, `diagram <id>: free { ... }` o `diagram <id>: sequence { ... }`.",
    theme:
      'Un tema para el diagrama (`theme "technical.dark"`), o un bloque de tema en el nivel superior.',
    model: "Un bloque de modelo (lo compila el perfil C4).",
    story:
      "Una historia sobre un diagrama: `story <id> for <diagram> { scene ... }`, dibujada cuadro a cuadro con un solo reloj.",
    export:
      "Una entrega reproducible: `export <id> for <diagram-or-story> { format png; … }`, que escribe `meltemi-diagrams export --profile <id>`.",
    // declaraciones
    node: 'Una caja: `node <id> "Label"`, o `<id>["Label"]`.',
    decision: 'Un rombo de decisión: `decision <id> "Label?"`.',
    data: 'Un cilindro de almacén de datos: `data <id> "Label"`, o `<id>[("Label")]`.',
    group:
      "Una banda que contiene declaraciones, relaciones y grupos anidados; en un diagrama de secuencia, una caja alrededor de participantes.",
    note: 'Texto libre sin borde: `note <id> "Line one\\nLine two" [on <element>]`; en un diagrama de secuencia, una nota sobre líneas de vida: `note [<id>] over a, b "Text"`, `left of a` o `right of a`.',
    on: 'Adjunta una nota a un elemento: `note <id> "Text" on <element>` dibuja una guía punteada de la nota al elemento y los mantiene cerca en una disposición automática.',
    tag: 'Una pequeña píldora, a menudo colocada en la esquina de una caja: `tag <id> "PKCE"`.',
    box: 'Una forma con una etiqueta en un diagrama libre: `box <id> "Label"`, o `<id>["Label"]`.',
    text: 'Texto medido sin marco en un diagrama libre: `text <id> "Line one\\nLine two"`.',
    image: 'Un archivo de imagen del proyecto en un diagrama libre: `image <id> "logo.png"`.',
    sticky:
      'Una nota adhesiva de un diagrama libre: `sticky <id> "Text"`, una tarjeta cuadrada que conserva su tamaño y ajusta y reduce su texto para que quepa. En un tema, el color de las notas adhesivas.',
    pen: "Un trazo a mano alzada de un diagrama libre que pasa por sus puntos, en las coordenadas de su grupo: `pen <id> [(x, y), (x, y), ...]`; con un solo punto dibuja un punto redondo.",
    // participantes de secuencias
    participant:
      'Un participante con una cabecera de caja: `participant <id> "Label"`, o `<id>["Label"]`.',
    actor: 'Una persona: `actor <id> "Label"`.',
    boundary: 'Un límite del sistema: `boundary <id> "Label"`.',
    control: 'Un controlador: `control <id> "Label"`.',
    entity: 'Una entidad del dominio: `entity <id> "Label"`.',
    database: 'Una base de datos: `database <id> "Label"`, o `<id>[("Label")]`.',
    collections: 'Un conjunto de instancias: `collections <id> "Label"`.',
    queue: 'Una cola de mensajes: `queue <id> "Label"`.',
    // eventos de secuencias
    activate: "Inicia una barra de activación en un participante: `activate <participant>`.",
    deactivate:
      "Termina la barra de activación más interna de un participante: `deactivate <participant>`.",
    create:
      "El participante aparece aquí: su cabecera se dibuja en esta fila, `create <participant>`.",
    destroy: "La línea de vida termina aquí con una cruz: `destroy <participant>`.",
    alt: 'Alternativas: `alt [<id>] "Condition" { ... } else "Other" { ... }`.',
    opt: 'Una parte opcional: `opt [<id>] "Condition" { ... }`.',
    loop: 'Una parte que se repite: `loop [<id>] "Until done" { ... }`.',
    par: "Partes en paralelo: `par [<id>] { ... } and { ... }`.",
    break:
      'Termina la interacción que lo contiene cuando ocurre: `break [<id>] "Condition" { ... }`.',
    critical:
      'Una parte atómica con opciones: `critical [<id>] "Label" { ... } option "Other" { ... }`.',
    region: 'Una región con etiqueta: `region [<id>] "Label" { ... }`.',
    else: "Otra rama de un fragmento `alt`.",
    and: "Otra rama de un fragmento `par`.",
    option: "Otra rama de un fragmento `critical`.",
    divider: 'Una línea con etiqueta que cruza todas las líneas de vida: `divider "Label"`.',
    delay:
      'En un diagrama de secuencia, un salto en el tiempo que cruza todas las líneas de vida: `delay` o `delay "Label"`. En `animate`, el tiempo antes del primer ciclo, de 0 a 60 s, como `500ms`.',
    over: "Una nota sobre uno o más participantes.",
    left: "Una nota a la izquierda de un participante: `left of <participant>`.",
    right: "Una nota a la derecha de un participante: `right of <participant>`.",
    of: "El participante junto a una nota.",
    autonumber:
      "Numera los mensajes de un diagrama de secuencia: `autonumber` desde 1, o `autonumber 10`.",
    kind: "`kind async` dibuja un mensaje con una punta abierta; `sync` es el predeterminado.",
    async: "Un mensaje que el emisor no espera, dibujado con una punta abierta.",
    sync: "Una llamada que el emisor espera, dibujada con una punta rellena; la predeterminada.",
    scenario:
      'Un camino a través de un diagrama de secuencia: `scenario <id> "Label" { choose check "OK" }`.',
    choose:
      'En un escenario, la rama de un fragmento `alt` o `critical`: `choose <fragment> "Condition"` o `choose <fragment> <n>`.',
    skip: "En un escenario, omite un fragmento `opt` o `break`: `skip <fragment>`.",
    take: "En un escenario, conserva un fragmento `opt` o `break`: `take <fragment>`.",
    space: "Espacio adicional sobre un mensaje, una nota o un fragmento: `space <id> 24`.",
    gap: "Espacio adicional a la izquierda de un participante: `gap <participant> 40`.",
    sequence:
      "Un diagrama de secuencia: participantes, mensajes en orden, fragmentos y escenarios.",
    // propiedades del diagrama
    direction:
      "El sentido de la disposición automática: `LR` (predeterminado), `RL`, `TB` o `BT`. En `animate`, `forward` (predeterminado) o `reverse` a lo largo de la relación.",
    layout:
      "`auto` (ELK organiza todo), `assisted` (las cajas colocadas se quedan y ELK organiza el resto) o `manual`.",
    routing: "La forma de los conectores: `auto`, `orthogonal`, `polyline` o `bezier`.",
    layers: "Las capas de un diagrama libre, de atrás hacia adelante: `layers back, main, front`.",
    title: "El título, en el `<title>` del SVG y en el marco de marca.",
    description: "Una descripción: el `<desc>` del SVG, o la segunda línea de una caja.",
    preset: "Lienzo `document`, `slide` (16:9) o `board` (una pizarra que crece).",
    board:
      "Un lienzo de pizarra que crece con lo que se dibuja en él: `preset board` no informa `layout.too-large`.",
    canvas: "Un tamaño fijo de lienzo: `canvas (1280, 720)`.",
    placement: "Posiciones, tamaños, rutas, anclas de etiquetas y restricciones.",
    style:
      "Propiedades visuales de elementos o de relaciones con nombre: `style a, b { fill accent }`.",
    animate: "Animación de elementos o relaciones: `animate r { effect flow }`.",
    class: "Un conjunto reutilizable de propiedades de estilo, o `class <id>` para aplicar uno.",
    rule: "Propiedades de estilo para todos los elementos de un tipo: `rule data { pattern dots }`.",
    // bloques de elementos
    port: "Un puerto con nombre en un lado: `port in west 30%`.",
    layer: "La capa de un objeto o de una relación de un diagrama libre: `layer front`.",
    link: "Identidad con un elemento de otro diagrama: `link checkout.api`.",
    assumption:
      'Marca una relación inferida como no confirmada, dibujada discontinua en el color atenuado: `assumption "Usual for checkouts"`. Quítalo para confirmar la relación.',
    url: 'Un hipervínculo para las exportaciones: `url "https://docs.example.com/api"`; SVG, PDF y HTML lo conservan.',
    // colocación
    place: "El centro de una caja: `place <element> at (x, y)`.",
    size: "El ancho y el alto de una caja: `size <element> (w, h)`.",
    route:
      "Los puertos y puntos de paso de una relación: `route <r> from a.east to b.west via [(x, y)]`.",
    label: "La posición de la etiqueta de una relación: `label <r> at 50% offset (0, -16)`.",
    align:
      "Alinea bordes o centros: `align a, b, c top` (`middle`, `bottom`, `left`, `center`, `right`).",
    row: "Los centros a la misma altura: `row a, b, c`.",
    column: "Los centros en la misma vertical: `column a, b, c`.",
    order: "Orden creciente a lo largo de un eje: `order a, b, c [horizontal|vertical]`.",
    distance: "Una separación mínima entre dos cajas: `distance a, b 80`.",
    at: "La posición de un `place` o de un `label`.",
    from: "El extremo de origen de una ruta.",
    to: "El extremo de destino de una ruta.",
    via: "Los puntos de paso de una ruta: `via [(x, y), ...]`.",
    // propiedades de estilo
    icon: 'Un icono `"<pack>:<name>"` a la izquierda o encima del texto, o un objeto icono de un diagrama libre: `icon <id> "tabler:server"`.',
    shape:
      "La forma de una caja libre o de un nodo de flujo: `rounded` (predeterminada), `rectangle`, `square`, `ellipse`, `circle`, `diamond`, `cylinder`, `pill`, `triangle`, `parallelogram`, `trapezoid`, `pentagon`, `hexagon`, `octagon`, `star`, `cloud`, `document`, `callout`, `arrow`, `framed`, `flag`, `person` o `agent`.",
    radius:
      "El radio de las esquinas, de 0 a 64: en un estilo, el de una caja, un nodo, una decisión, una nota o un grupo, en lugar del `radius` del tema (`groupRadius` en los grupos); redondea las esquinas de las cajas `rounded`, `rectangle`, `square` y `framed` y los vértices de los polígonos (ninguno por defecto en ellos); las elipses, los círculos, las píldoras, los cilindros, las nubes y los documentos lo ignoran. En un tema, el predeterminado de las cajas redondeadas, los nodos y las notas.",
    rotation:
      "Los grados que se gira un elemento, de 0 a 360, en el sentido de las agujas del reloj alrededor del centro de su caja; su texto y su icono giran con él. Elementos de los diagramas de flujo y las composiciones libres, no grupos.",
    fontSize: "El tamaño del texto de una caja libre o de un texto, de 6 a 160.",
    fontWeight: "El grosor del texto de una caja libre o de un texto: 400, 500, 600 o 700.",
    textAlign: "Alineación `left`, `center` o `right` de una caja libre o de un texto.",
    verticalAlign:
      "`top`, `middle` (predeterminada) o `bottom`: dónde va el texto de una caja libre dentro de la franja de texto de su forma.",
    sketch:
      "Un token de tema: trazos `none`, `light` o `rough`, pintados a mano en dos pasadas (`sketch.light` y `sketch.dark` usan `light`).",
    iconColor: "El color de un icono monocromo.",
    iconPosition: "`left` o `top`; solo cajas.",
    fill: 'El color de fondo; `"none"` no dibuja fondo.',
    stroke: "El color del contorno o del conector.",
    color:
      "El color del texto; en `animate`, el color de las partículas, de un pulso o de un recorrido.",
    line: "Contorno o conector `solid`, `dashed` o `dotted`.",
    width: "El ancho del contorno o del conector, de 0 a 64; el del trazo de un lápiz, de 1 a 64.",
    opacity:
      "Cuán opaco es un elemento, un grupo, una línea o un lápiz de un diagrama libre, de 0 a 1: `opacity 0.35`.",
    highlight: "En un tema, el color del marcador: `stroke highlight` en un lápiz.",
    stickyText: "En un tema, el color del texto de las notas adhesivas.",
    pattern: "`none`, `hatch`, `dots` o `cross` sobre la forma; solo elementos.",
    arrowhead:
      "La punta en el destino de una relación: `triangle`, `open`, `none`, `triangleOutline`, `diamond`, `diamondOutline`, `circle`, `circleOutline`, `bar`, `cross`, o los extremos de pata de gallo `many`, `oneOrMany`, `onlyOne`, `zeroOrOne`, `zeroOrMany`; solo relaciones.",
    arrowtail:
      "La punta en el origen de una relación, con los valores de `arrowhead`; ninguna de forma predeterminada, o la del extremo final con `<->`. Solo relaciones.",
    corners: "Codos `sharp` o `rounded` de los conectores rectos y en ángulo; solo relaciones.",
    sharp: "Codos con esquina.",
    triangleOutline: "Un triángulo hueco, como UML dibuja la generalización.",
    diamond:
      "Un rombo: la forma de una caja o de un nodo, o una punta rellena en el extremo de una relación, como UML dibuja la composición.",
    diamondOutline: "Un rombo hueco, como UML dibuja la agregación.",
    circleOutline: "Un círculo hueco.",
    bar: "Una barra que cruza la línea.",
    many: "Una pata de gallo: muchos, en la notación entidad-relación.",
    oneOrMany: "Una pata de gallo y una barra: uno o muchos.",
    onlyOne: "Dos barras: exactamente uno.",
    zeroOrOne: "Un círculo y una barra: cero o uno.",
    zeroOrMany: "Un círculo y una pata de gallo: cero o muchos.",
    dotted: "Puntos redondos, separados por el ancho de la línea.",
    rounded:
      "Redondeado: la forma de las cajas y los nodos que no tienen otra, o los codos de un conector con `corners rounded`.",
    circle:
      "Un círculo: la forma de una caja o de un nodo, o una punta rellena en el extremo de una relación.",
    cross: "Una X: un patrón sobre una forma, o la punta en el extremo de una relación.",
    // animate
    effect:
      "`flow` (partículas a lo largo de una relación), `pulse` (un halo alrededor de un elemento, una relación, una nota o un fragmento), `dash` (un trazo que se mueve a lo largo de una relación o de un contorno) o `trace` (un resaltado que llena una relación de su inicio a su fin y vuelve a empezar).",
    duration:
      "La duración de un ciclo, de 100 ms a 60 s, como `1200ms` o `1.2s`; de forma predeterminada, la del tema, si no, 1200 ms para flow, 1500 ms para trace y 1 s para los demás.",
    particles:
      "Cuántas partículas recorren la relación en un efecto flow, de 1 a 8; 1 de forma predeterminada.",
    forward: "Del origen al destino de la relación.",
    reverse: "Del destino al origen de la relación.",
    repeat:
      "`forever` o un número de ciclos en `animate`; en un escenario, las iteraciones de un bucle: `repeat <loop> <n>`.",
    // valores
    auto: "Se elige automáticamente.",
    assisted: "Las cajas colocadas se quedan; el motor organiza las demás a su alrededor.",
    manual: "Cada caja necesita un `place`; lo predeterminado en los diagramas libres.",
    free: "Una composición libre: cajas, texto, iconos, imágenes y grupos colocados a mano.",
    flow: "Un diagrama de flujo: nodos, decisiones, almacenes de datos y grupos, organizados por ELK.",
    orthogonal: "Segmentos horizontales y verticales.",
    polyline: "Segmentos rectos.",
    bezier: "Una curva suave.",
  },

  listWords: {
    layout:
      "Convierte el grupo en una lista que ordena a sus hijos en el orden del código: `layout column` (uno debajo de otro) o `layout row` (uno al lado de otro); se ignora el `place` de un hijo.",
    spacing:
      "La distancia entre los hijos de una lista, de 0 a 400: `spacing 12`; de forma predeterminada, la mitad del `groupPadding` del tema.",
    align:
      "Dónde quedan los hijos de una lista a lo ancho de ella: `start` (predeterminado), `center`, `end` o `stretch`.",
    column: "Los hijos uno debajo de otro; la lista crece hacia abajo.",
    row: "Los hijos uno al lado de otro; la lista crece hacia la derecha. Una fila de columnas es un tablero kanban.",
    start:
      "Al principio, a lo ancho de la lista: a la izquierda en una columna, arriba en una fila; lo predeterminado.",
    center: "Centrados a lo ancho de la lista.",
    end: "Al final, a lo ancho de la lista: a la derecha en una columna, abajo en una fila.",
    stretch: "Estirados a lo ancho de la lista: a su ancho (una columna) o a su alto (una fila).",
  },

  exportOptions: {
    export:
      "Una entrega reproducible: `export <id> for <diagram-or-story> { format png; … }`, que escribe `meltemi-diagrams export --profile <id>`.",
    for: "El diagrama o la historia que exporta el perfil.",
    format:
      "Lo que escribe el perfil: `svg`, `png`, `pdf`, `html` (el reproductor), `mp4`, `webm` o `gif`.",
    size: "El tamaño de salida `(width, height)` en píxeles; la imagen se ajusta y se centra. PNG, PDF y video.",
    scale: "Píxeles del PNG por unidad, de 1 a 8; 2 de forma predeterminada.",
    background:
      "`transparent`, un color entre comillas o un token de color como `accent`; de forma predeterminada, el fondo del tema.",
    at: "El instante que se dibuja, como `1.5s`: de los efectos del diagrama o de la historia. SVG, PNG y PDF.",
    motion:
      "`static` (lo predeterminado) o `animated`, el perfil de SVG animado. SVG de diagramas.",
    theme:
      'El tema con el que se dibuja, como `theme "stage.dark"`, en lugar del propio del diagrama.',
    fonts: "El texto de SVG y HTML: `embedded` (lo predeterminado), `outlined` o `system`.",
    scenario: "El escenario del diagrama de secuencia que se dibuja.",
    link: "Una URL a la que enlaza toda la imagen, como el reproductor de la historia. SVG y PDF.",
    fps: "Cuadros por segundo del video, de 1 a 60; 30 de forma predeterminada.",
    duration: "Cuánto dura el video; hace falta cuando los efectos se repiten indefinidamente.",
    file: 'La ruta de salida, relativa a este archivo, como `file "slides/checkout.png"`; `<stem>.<id>.<ext>` de forma predeterminada.',
    autoplay:
      "El reproductor HTML empieza de inmediato, salvo que quien lo ve pida movimiento reducido.",
    loop: "El reproductor HTML vuelve a empezar al final.",
    embed:
      "Escribe un fragmento de HTML para pegar en una página, en lugar de una página completa.",
  },

  storyWords: {
    story:
      "Una historia sobre un diagrama: `story <id> for <diagram> { scene ... }`. Las escenas se suceden una tras otra con un solo reloj.",
    for: "El diagrama con el que empieza la historia; las escenas pueden cambiarlo con `view`.",
    title: 'El título de la historia: `title "A purchase"`.',
    description: "Una descripción de la historia.",
    scene:
      'Un paso de la historia: `scene <id> ["Title"] { view; transition; actions }`. Empieza cuando termina la anterior.',
    view: "El diagrama que muestra esta escena: `view <diagram>`, primero en la escena. Un cambio de vista necesita una `transition`.",
    transition:
      "Cómo la vista de la escena reemplaza a la anterior: `transition cut|fade|morph [over <time>]`, antes de las acciones.",
    cut: "Cambia a la nueva vista de inmediato.",
    fade: "Funde las dos vistas; 800 ms de forma predeterminada.",
    morph:
      "Mueve las cajas que dibujan ambas vistas (mismo id) de su lugar anterior al nuevo y funde el resto; 800 ms de forma predeterminada.",
    reveal:
      "Hace aparecer los objetivos: `reveal a, b [over <time>]`; 600 ms de forma predeterminada. Los objetivos que se revelan por primera vez empiezan ocultos.",
    hide: "Hace desaparecer los objetivos: `hide a, b [over <time>]`; 600 ms de forma predeterminada.",
    highlight:
      "Resalta el contorno de los objetivos en el color de acento durante la acción: `highlight a [over <time>]`; 1 s de forma predeterminada.",
    focus:
      "Atenúa todo salvo los objetivos y las relaciones entre ellos hasta el final de la escena: `focus a, b`, o `focus all` para quitarlo; 600 ms de forma predeterminada.",
    camera:
      "Lleva el encuadre a los objetivos más 40 px: `camera a, b`, o `camera all` para toda la vista; 800 ms de forma predeterminada.",
    trace:
      "Dibuja una relación de su origen a su destino en el color de acento: `trace r [over <time>]`; 1,2 s de forma predeterminada.",
    draw: "Dibuja lápices, líneas libres y relaciones con nombre de su primer punto al último, uno tras otro, y los deja dibujados: `draw a, b [over <time>]`; 800 ms de forma predeterminada. Los objetivos que se dibujan por primera vez empiezan ocultos.",
    hold: "Espera: `hold 2s`.",
    parallel: "Acciones que empiezan juntas: `parallel { ... }`. Dura lo que su acción más larga.",
    over: "El tiempo que dura la acción o la transición, como `over 800ms` o `over 1.5s`.",
    all: "Todos los elementos de la vista: `focus all` quita el foco, `camera all` encuadra toda la vista.",
  },

  c4Types: {
    person: "Persona",
    system: "Sistema de software",
    container: "Contenedor",
    datastore: "Contenedor",
    component: "Componente",
  },
  externalC4Types: {
    person: "Persona externa",
    system: "Sistema de software externo",
    container: "Contenedor externo",
    datastore: "Contenedor externo",
    component: "Componente externo",
  },

  time: (ms) => time(ms, true),
  imported: " (importado)",
  branch: (n) => `rama ${n}`,

  headings: {
    diagram: (type, name) => `**diagrama ${type}** ${code(name)}`,
    unresolvedDiagram: (name) => `**diagrama** ${code(name)} — sin resolver`,
    story: (name) => `**historia** ${code(name)}`,
    scene: (name) => `**escena** ${code(name)}`,
  },

  hover: {
    placed: (x, y) => `posición (${x}, ${y})`,
    arranged: (x, y) => `posición calculada (${x}, ${y})`,
    size: (width, height) => `tamaño ${width} × ${height}`,
    defaultSize: (width, height) => `tamaño ${width} × ${height} (predeterminado)`,
    ports: (ports) => `puertos ${ports}`,
    within: (path) => `en ${path}`,
    layer: (layer) => `capa ${code(layer)}`,
    linked: (target) => `enlace a ${code(target)}`,

    points: (count) => `${count} ${plural("es", count, { one: "punto", other: "puntos" })}`,
    colour: (colour, token) =>
      `color ${code(colour)}${token ? ` (el ${code(token)} del tema)` : ""}`,
    list: (layout) => `lista ${code(`layout ${layout}`)}`,
    listSpacing: (spacing, byDefault) =>
      `${code(`spacing ${spacing}`)}${byDefault ? " (predeterminado)" : ""}`,
    listAlign: (align, byDefault) =>
      `${code(`align ${align}`)}${byDefault ? " (predeterminado)" : ""}`,
    placedBy: (list) => `colocado por la lista ${code(list)}`,

    relation: "relación",
    message: "mensaje",
    reply: "respuesta",
    asyncMessage: "mensaje asíncrono",
    named: (id) => ` con el id ${code(id)}`,
    label: (label) => `etiqueta “${label}”`,
    spaceBefore: (amount) => `${amount} de espacio antes`,
    route: (from, to, via) => `ruta ${from} → ${to}${via}`,
    via: (points) => ` por ${points}`,

    over: (participants) => `sobre ${participants}`,
    beside: (position, participant) =>
      `a la ${position === "left" ? "izquierda" : "derecha"} de ${code(participant)}`,
    fragment: (operator, id) => `**fragmento ${operator}**${id}`,
    noCondition: "(sin condición)",
    events: (count) => `${count} ${plural("es", count, { one: "evento", other: "eventos" })}`,
    decidedBy: (scenarios) => `decidido por ${scenarios}`,
    scenario: (id, label) => `**escenario** ${code(id)} — ${label}`,
    times: (count) => ` ${count} ${plural("es", count, { one: "vez", other: "veces" })}`,

    model: (name, entities, relations, imported) =>
      `**modelo** ${code(name)} — ${entities} ${plural("es", entities, { one: "entidad", other: "entidades" })}, ${relations} ${plural("es", relations, { one: "relación", other: "relaciones" })}${imported ? " (importado)" : ""}`,
    unresolvedModel: (name) => `**modelo** ${code(name)} — sin resolver`,
    port: (name, element, side, percent) =>
      `**puerto** ${code(name)} de ${code(element)} — lado ${side}, a un ${percent} % de su longitud`,
    compassPort: (port) =>
      `**puerto** ${code(port)} — ${port === "auto" ? "el lado que mira hacia el otro extremo" : `el lado ${port}`}`,
    iconStatus: {
      "unknown-pack": "paquete desconocido",
      "unknown-icon": "icono desconocido",
      unusable: "no se puede usar",
      malformed: "mal formado",
    },
    unknownLicence: "licencia desconocida",
    image: (path, format, width, height) =>
      `**imagen** ${code(path)} — ${format}, ${width} × ${height} px`,
    missingImage: (path) =>
      `**imagen** ${code(path)} — no está en el proyecto, o no es un archivo PNG, JPEG, GIF, WebP o SVG`,
    theme: (name) => `**tema** ${code(name)}`,
    extends: (theme, frame) => `extiende ${theme}${frame ? ` · marco ${frame}` : ""}`,
    builtInTheme: (name, background, font, frame) =>
      `**tema** ${code(name)} (integrado)\n\nfondo ${background} · fuente ${font} · marco ${frame}`,
    linkTo: (element, diagram, type) =>
      `**enlace** a ${code(element)} de ${code(diagram)} (${type})`,
    identityOnly: "Solo identidad: nada se mantiene sincronizado entre las vistas.",
    link: (text) => `**enlace** ${code(text)} — identidad con un elemento de otro diagrama`,

    required: " (obligatoria)",
    kindOf: (title, plugin) =>
      `Un tipo de los diagramas ${title}${plugin ? `, del plugin ${plugin}` : ""}.`,
    kinds: (kinds, plugin) => `. Tipos: ${kinds}${plugin ? `. Del plugin ${plugin}.` : "."}`,

    inModel: (name) => `modelo ${code(name)}`,
    drawnIn: (views) => ` · dibujada en ${views}`,
  },

  profile: {
    noFormat: "sin formato",
    target: (kind, name) =>
      kind === "diagram"
        ? `del diagrama ${code(name)}`
        : kind === "story"
          ? `de la historia ${code(name)}`
          : `del destino desconocido ${code(name)}`,
    scale: (scale) => `escala ${scale}`,
    background: (background) => `fondo ${background}`,
    at: (ms) => `en ${ms} ms`,
    heading: (id, facts) =>
      `**perfil de exportación** ${code(id)} — ${facts}\n\n\`meltemi-diagrams export <file> --profile ${id}\``,
    notFound: (name) => `${code(name)} — no encontrado`,
    symbol: (format, target) => `${format} de ${target}`,
  },

  story: {
    unresolvedView: (id) => `${code(id)} — la vista no se resolvió`,
    inView: (view) => `en ${view}`,
    summary: (duration, scenes, view) =>
      `${duration} en ${scenes} ${plural("es", scenes, { one: "escena", other: "escenas" })}, sobre ${view}`,
    span: (start, end, view, transition) =>
      `de ${start} a ${end} · vista ${view}${transition ? ` · transición ${transition}` : ""}`,
    timing: (start, duration, byDefault) =>
      `Desde ${start} durante ${duration}${byDefault ? " (predeterminado)" : ""}.`,
    symbol: (duration) => `historia · ${duration}`,
  },

  completion: {
    noConditionBranch: "rama sin condición",
    imageFile: "archivo de imagen",
    port: (side, percent) => `puerto en ${side} al ${percent} %`,
    compassPort: "puerto cardinal",
    model: "modelo",
    layer: "capa",
    relationsOnly: "solo relaciones",
    fragment: (operator) => `fragmento ${operator}`,
    diagram: (type) => `diagrama ${type}`,
    story: "historia",
    imported: "importado",
  },

  snippets: {
    customer: "Cliente",
    shop: "Tienda",
    uses: "Usa",
    request: "Solicitud",
    response: "Respuesta",
    title: "Título",
  },

  fixes: {
    arrangeUnplaced: "Organizar con ELK los elementos sin colocar",
    switchLayout: (mode) => `Cambiar a \`layout ${mode}\``,
    removeFromInclude: (entry) => `Quitar ${code(entry)} de \`include\``,
    addScope: (path) => `Agregar \`scope ${path}\``,
    changeTo: (value) => `Cambiar a ${code(value)}`,
    removeDeactivate: "Quitar este `deactivate`",
    activateBefore: (participant) => `Agregar \`activate ${participant}\` antes`,
    declareElement: (id, kind) =>
      `Declarar ${code(id)} como ${kind === "box" ? "caja" : kind === "participant" ? "participante" : "nodo"}`,
    declareLayer: (layer) => `Declarar la capa ${code(layer)}`,
    removeLink: "Quitar el enlace",
    declarePort: (port, element) => `Declarar el puerto ${code(port)} en ${code(element)}`,
    usePort: (element, port) => `Usar \`${element}.${port}\``,
    setSize: (element, width, height) =>
      `Cambiar el tamaño de ${code(element)} a ${width} × ${height}`,
    confirmAssumption: "Confirmar la relación (quitar su `assumption`)",
    nameRelation: (id) => `Nombrar esta relación ${code(id)}`,
    arrangeDiagram: (id) => `Organizar el diagrama ${code(id)} (recalcular todas las posiciones)`,
    removePlace: (element, list) =>
      `Quitar \`place ${element}\` (la lista ${code(list)} lo coloca)`,
    addListLayout: (group) => `Agregar \`layout column\` a ${code(group)}`,
    switchPreset: (preset) => `Cambiar a \`preset ${preset}\``,
  },

  rename: {
    notRenamable:
      "Solo se puede cambiar el nombre de los ids de elementos, relaciones, notas y fragmentos.",
    nameRelationFirst: "Nombra la relación con `as <id>` antes de cambiarle el nombre.",
    importedModel: (path) =>
      `${code(path)} pertenece a un modelo importado; cámbiale el nombre en todo el proyecto.`,
    importedDiagram: (id) =>
      `${code(id)} pertenece a un diagrama importado; cámbiale el nombre en todo el proyecto.`,
  },

  symbols: {
    model: "modelo",
    theme: "tema",
    extends: (theme) => `extiende ${theme}`,
  },

  kinds: {
    line: "línea",
    pen: "lápiz",
    sticky: "nota adhesiva",
  },
};

/**
 * The services' words in the interface language (`getLocale()`) or in the locale given. Look them
 * up when an answer is built, never when a module loads.
 */
export const serviceMessages = catalog(en, es);

/** The services' words in one language. */
export type ServiceWords = typeof en;

/** The entry of a table of words for a word of the text; never one of `Object`'s own members. */
export function entryOf(table: object, word: string): string | undefined {
  return Object.hasOwn(table, word) ? (table as Readonly<Record<string, string>>)[word] : undefined;
}

/**
 * The word for a kind of element or event in the interface language, as the inspector names it
 * ("node", "nodo"), or as the services name the free objects it does not ("pen", "lápiz"). The
 * kinds of declared types keep their own word.
 */
export function kindWord(kind: string): string {
  return entryOf(messages().kinds, kind) ?? entryOf(serviceMessages().kinds, kind) ?? kind;
}

/**
 * How completion and the outline detail an element: its kind word, then the first line of its
 * label when it has one ("sticky · Cache the"); a pen, which has none, is its kind word alone.
 */
export function elementDetail(element: { readonly kind: string; readonly label: string }): string {
  const kind = kindWord(element.kind);
  const label = element.label.split("\n")[0]!;
  return label === "" ? kind : `${kind} · ${label}`;
}
