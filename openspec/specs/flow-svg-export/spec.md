# flow-svg-export Specification

## Purpose
Layout of placed `flow` diagrams into a vector scene and its portable SVG: geometry, route anchors, labels and annotations, styles and themes.
## Requirements
### Requirement: Manual layout geometry
`layoutDiagram` SHALL produce a scene for a flow diagram whose non-group elements all have a `place`, or whose positions an engine arranges (see `layout-modes`). Each element box SHALL be centred on its `place`. Its size SHALL be the `size` statement, or the default size of its kind when `size` is absent:

- `node` 160 x 56 and `data` 160 x 64, widened when the widest measured text line (label or description) plus 16 px on each side is larger, and when an icon beside the text (`iconPosition left` or `right`) needs the room, or taller for one above or below it (`top`, `bottom`);
- `decision` 160 x 80, grown until its text fits the diamond's inscribed area, as a shaped node does;
- a `node` with a `shape` takes that shape's default size and grows until its text fits the shape's inscribed area; `shape icon` is 64 x 64, or `iconSize` when a number is written, grown by half the theme padding on each side when `fill`, `stroke` or `pattern` frames it, with its label outside;
- a `node` or `data` with `iconPosition center` 120 x 120, widened for its label;
- `tag`: measured text width plus 18, by 18;
- `note`: longest measured line by 18 per line plus 4.

A group without `place` and `size` SHALL take the bounding box of its children expanded by 16 px on the sides and bottom and by its header on top: 40 px for a titled group, widened to fit its measured title, and 16 px for an untitled one (label `""`, no description, no styled icon); a child drawn with `shape icon` counts with its label. With both statements it SHALL use them. The canvas SHALL be the bounding box of every item plus a 20 px margin.

#### Scenario: Placed nodes with and without size
- **WHEN** `api` is placed at (360, 180) with size (200, 56) and `db` is placed at (700, 180) without size
- **THEN** the scene has a 200 x 56 rect centred on (360, 180) for `api` and a 160 x 56 rect centred on (700, 180) for `db`

#### Scenario: Default size grows to fit a long label
- **WHEN** `svc["Payments reconciliation service"]` is placed without size and the label measures more than 128 px
- **THEN** its rect is as wide as the label plus 32 px, rounded up, and as tall as the default 56 px

#### Scenario: Decision grows until its text fits the diamond
- **WHEN** `decision ok "Approved?"` and `decision long "Is the payment approved by risk?"` are placed without size
- **THEN** `ok` keeps the default 160 x 80, and `long` is 80 tall, wider than a `node` with the same label, and has every corner of its label's glyphs inside the diamond

#### Scenario: Icon below the text grows the node
- **WHEN** `api["API"]` has `style api { icon "tabler:server"; iconPosition bottom; iconSize 40 }` and no size
- **THEN** its rect is taller than 56 px, the icon is drawn 40 px wide under the label, and both lie inside the rect with the theme padding

#### Scenario: Icon shape in a group
- **WHEN** `group g` without placement holds `fn` with `style fn { icon "aws:lambda"; shape icon }` placed at (100, 100)
- **THEN** the group rect encloses the icon's square and the label under it, expanded by its padding

#### Scenario: Group derived from its children
- **WHEN** group `backend` has no placement and contains `api` at (100, 100) and `db` at (300, 100), both 160 x 56
- **THEN** the group rect spans x 4..396 and y 32..144 and is drawn before its children

#### Scenario: Untitled group derived from its children
- **WHEN** `group backend ""` has no placement and contains `api` at (100, 100) and `db` at (300, 100), both 160 x 56
- **THEN** the group rect spans x 4..396 and y 56..144, holds no text item, and is drawn before its children

#### Scenario: Missing placement in manual layout
- **WHEN** a `layout manual` diagram declares `cache` without a `place`
- **THEN** `layout.missing-placement` is reported on the declaration of `cache` and no scene is produced

#### Scenario: Unplaced elements in assisted layout
- **WHEN** a `layout assisted` diagram has one element without `place` and no engine is given
- **THEN** `layout.mode-unsupported` is reported on the `layout` property and no scene is produced; with the ELK engine, or with every element placed, a scene is produced

### Requirement: Route anchors
A relation SHALL be drawn as a polyline from an anchor on the source box through its waypoints to an anchor on the target box, ending in a filled arrowhead. A side with a neighbouring waypoint SHALL anchor at the projection of that waypoint onto the side, clamped to the side. Two facing parallel sides without a waypoint between them SHALL anchor at the centre of the overlap of their extents, or at their own centres when the extents do not overlap. Non-parallel sides without waypoints SHALL anchor at the clamped projection of the other element's centre. An `auto` port SHALL choose the side facing the neighbour point. A named port SHALL anchor at its own point. A relation without a `route` SHALL use `auto` ports and no waypoints. Parallel relations SHALL take lanes, and `routing` SHALL shape the points between the anchors (see `connector-routing`).

For a box drawn with a shape other than a rectangle, every anchor found on the bounding rectangle (by these rules, by a percentage or a named port, by a lane, or by the engine) SHALL be moved along the inward normal of its side to the first point of the shape's outline, or to the nearest outline point when the normal meets none or when the point lies in a corner of the rectangle (a lane pushed to the end of its side), so the connector ends on the shape.

#### Scenario: Facing sides with overlapping extents
- **WHEN** `nextjs` spans x 260..460 above `apiGw` which spans x 240..700, and the route is `from nextjs.south to apiGw.north`
- **THEN** the connector is vertical at x = 360

#### Scenario: Waypoint fixes the anchor
- **WHEN** the route is `from clients.east to mcpGw.north via [(1035, 48)]`, `clients` spans y 20..76 and `mcpGw` spans x 580..1040
- **THEN** the connector leaves `clients` at (1020, 48), bends at (1035, 48) and enters `mcpGw` at (1035, 530)

#### Scenario: Auto ports
- **WHEN** `a` is centred at (100, 100) and `b` at (100, 300) with no `route`
- **THEN** the connector leaves the south side of `a` and enters the north side of `b`

#### Scenario: Pinned end on a diamond
- **WHEN** `d` is a 160 × 80 `shape diamond` box centred at (280, 200) and a route ends `to d.north 5%`
- **THEN** the connector's last point lies on the diamond's upper-left edge, at x = 208 and y = 196, not at the rectangle's corner

#### Scenario: Pinned end on an ellipse
- **WHEN** `e` is a 160 × 72 `shape ellipse` box centred at (280, 400) and a route ends `to e.west 8%`
- **THEN** the connector's last point lies on the ellipse, within 0.5 px of its outline

#### Scenario: Arrowhead
- **WHEN** any relation is rendered with a theme whose `arrowhead` is `triangle`
- **THEN** the scene contains a filled triangle at the target anchor pointing along the last segment, and the polyline stops at the base of the triangle

#### Scenario: Named port anchor
- **WHEN** a route goes `from api.east to bus.in` and `bus` declares `port in west 25%`
- **THEN** the connector ends at the point a quarter of the way down the west side of `bus`

### Requirement: Labels and annotations
A relation label SHALL render as a pill (surface fill, line stroke) centred on the point at `label ... at <n>%` along the polyline plus the offset, or at 50 % without offset when no `label` statement exists. The pill SHALL be as wide as its measured text plus 12 px, and never narrower than it is tall. The rest SHALL render as follows:

- `note` elements as left-aligned muted text without a border;
- `tag` elements as pills with mono text;
- `data` elements as cylinders;
- `decision` elements as diamonds;
- element descriptions as smaller lines under the label, one per `\n`.

Every text item SHALL carry a baseline equal to its vertical centre plus half the cap height of its measured font times its size.

#### Scenario: Step label beside an arrow
- **WHEN** `a -> b: "1" as r1` is routed vertically and `label r1 at 50% offset (16, 0)` is set
- **THEN** a pill with the text `1` is centred 16 px to the right of the midpoint of the connector

#### Scenario: Note with three lines
- **WHEN** `note limits "Límites a validar\nOBO: 30 RPS\nCIBA: Enterprise"` is placed
- **THEN** the scene has three text items with the same left x, 18 px apart, and no rect for the note

#### Scenario: Shapes by kind
- **WHEN** a diagram places a `data` element, a `decision` element and a `tag`
- **THEN** the scene has a cylinder path, a diamond path and a pill rect respectively, each wrapped in a group carrying the element id

#### Scenario: Baseline from cap height
- **WHEN** a 13 px Inter label is centred at y = 100 and laid out with the bundled measurer
- **THEN** its baseline is 100 + 13 × 0.7275 / 2, rounded to two decimals

### Requirement: Styles and themes
Element styles SHALL apply `fill`, `stroke`, `color` (label and description text), `line dashed` (dashed outline), `width` (outline width), `radius` (corner radius of rounded rectangles and groups, over the theme's `radius` or `groupRadius`; of `rectangle`, `square` and `framed` nodes; the rounded vertices of polygon nodes and decisions), `rotation` (the element's group turned about the centre of its box) and `pattern`. Relation styles SHALL apply `stroke` to the connector and arrowhead, `width` to the connector, `arrowhead` to the head, `fill` and `color` to the label pill, and `line` as an override of the arrow style. `fill "none"` SHALL draw no background. Styles SHALL be resolved with the precedence of the `style-classes-and-rules` capability. The theme SHALL be the project's default theme when the diagram has no `theme`, and `technical.light` otherwise. `theme "<name>"` SHALL resolve a theme in scope or one of the built-in themes `technical.light`, `technical.dark`, `editorial.light`, `editorial.dark`, `stage.light` and `stage.dark`; any other name SHALL report `layout.unknown-theme` as a warning and use the default. The layout SHALL accept a theme name override that takes precedence over the diagram's `theme` property, and a default theme name (`defaultTheme`) used when the diagram has none. When the resolved theme has `frame footer` or `frame header`, the scene SHALL add a strip whose height scales with `frameSize` (44 px at 12 px) with a hairline, the Meltemi mark drawn with the theme gradient when `mark` is `meltemi`, the `brand` text and the diagram title; `frame none` SHALL add nothing. The `brand` token of the `technical.*` and `stage.*` themes SHALL be `Meltemi Diagrams`. The layout SHALL also accept a frame override, `frame: "none"`, applied after the theme resolves and before anything is drawn, in every profile: the scene SHALL then be laid out as if the theme had `frame none`, with every other token of the theme (palette, fonts, sizes, arrowheads, sketch) unchanged; without the override the theme's own `frame` SHALL apply, and the override SHALL change no diagnostic.

#### Scenario: Dashed proposed element
- **WHEN** `style proxy { line dashed; stroke "#c4552c" }` is set on a placed node
- **THEN** its rect has a dash pattern and the stroke colour `#c4552c`

#### Scenario: Square node
- **WHEN** `style proxy { radius 0 }` is set on a placed node
- **THEN** its rect has `rx` 0 while the other nodes keep the theme radius

#### Scenario: Rounded decision
- **WHEN** `style choose { radius 8 }` is set on a decision
- **THEN** each of its four corners is drawn as a curve starting 8 px from the vertex, and nothing is reported

#### Scenario: Turned node in the SVG
- **WHEN** `style api { rotation 45 }` is set on a node placed at (300, 120)
- **THEN** the SVG's `<g data-id="api" data-role="element">` carries `transform="rotate(45 300 120)"`, shifted by the scene offset

#### Scenario: Dark relation label
- **WHEN** `style r1 { fill "#1b1f23"; color "#ffffff" }` is set on a labelled relation
- **THEN** the label pill is filled `#1b1f23` with white text and the connector keeps the theme colour

#### Scenario: Unknown theme
- **WHEN** a diagram sets `theme "corporate"`
- **THEN** `layout.unknown-theme` is reported as a warning and the scene uses the `technical.light` tokens

#### Scenario: Default frame
- **WHEN** a diagram without a `theme` property is laid out without a default theme
- **THEN** the scene is 44 px taller than its content, ends with a group of role `frame` holding the mark paths, the text `Meltemi Diagrams` and the diagram title, and declares one linear gradient

#### Scenario: Neutral theme has no frame
- **WHEN** a diagram sets `theme "editorial.light"`
- **THEN** the scene has no `frame` group and no gradient

#### Scenario: Theme override
- **WHEN** a diagram sets `theme "editorial.light"` and the layout is called with the override `technical.dark`
- **THEN** the scene background is `#07111F` and the frame is present

#### Scenario: Default theme option
- **WHEN** a diagram without `theme` is laid out with `defaultTheme` `editorial.dark`, and another diagram with `theme "technical.light"` is laid out with the same option
- **THEN** the first uses the `editorial.dark` tokens and the second keeps `technical.light`

#### Scenario: Frame override on the default theme
- **WHEN** a diagram without a `theme` property is laid out with the option `frame: "none"`
- **THEN** the scene has no `frame` group and no gradient, is 44 px shorter than the same diagram laid out without the option, and its background, fonts, arrowheads and the sizes of its boxes are the same as that diagram's

#### Scenario: Frame override on a sequence diagram with a header theme
- **WHEN** a sequence diagram sets `theme "stage.light"` and is laid out with `frame: "none"`
- **THEN** the scene has no `frame` group, its participants start at the margin instead of under a header strip, and the `stage.light` type sizes and strokes apply

#### Scenario: The override reports nothing of its own
- **WHEN** a diagram sets `theme "corporate"` and is laid out with `frame: "none"`
- **THEN** `layout.unknown-theme` is reported as a warning, exactly as without the option, and the scene uses the `technical.light` tokens with no `frame` group

### Requirement: Portable SVG
`renderSvg(scene)` SHALL emit a standalone SVG with:

- `xmlns`, `width`, `height` and `viewBox`;
- a background rect;
- `<title>` and `<desc>` from the diagram title and description when present;
- a `<defs>` block with `<linearGradient>`, `<radialGradient>` and `<pattern>` entries only when the scene declares gradients or patterns, with `gradientUnits`, `gradientTransform` and stop opacity when given;
- inline presentation attributes otherwise;
- escaped text;
- baselines taken from the scene's text items;
- a `transform` attribute on groups that carry one;
- a `<g data-id="...">` wrapper for every element and relation, with `data-layer="<name>"` when it is on a layer other than `main`, and `<g data-id="<pack>:<name>" data-role="icon">` for every icon, holding only paths;
- `opacity` and `fill-rule` on paths that carry them.

It SHALL contain no `<marker>`, no `dominant-baseline`, and no `<style>` except the `@font-face` block of the `embedded` font policy. Rendering the same scene twice SHALL give identical text.

#### Scenario: Structure
- **WHEN** the annotations corpus file is exported with the `system` policy
- **THEN** the SVG starts with `<svg xmlns="http://www.w3.org/2000/svg"`, contains `data-id="api"`, contains no `<marker`, no `<style` and no `dominant-baseline`, and matches the stored snapshot

#### Scenario: Escaping
- **WHEN** a label contains `Home & Experience <beta>`
- **THEN** the SVG text contains `Home &amp; Experience &lt;beta&gt;`

#### Scenario: Title and description
- **WHEN** a diagram sets `title "Checkout"` and `description "Purchase path"`
- **THEN** the SVG contains `<title>Checkout</title>` and `<desc>Purchase path</desc>` before any shape

#### Scenario: Gradient definitions
- **WHEN** a scene with the Meltemi frame is rendered
- **THEN** the SVG contains one `<defs>` block with a `<linearGradient id="meltemi-wind"` whose stops are the theme `accent` and `accentEnd`, and the mark group carries a `transform` attribute

#### Scenario: Pattern definitions
- **WHEN** a scene with a dots pattern is rendered
- **THEN** the `<defs>` block contains one `<pattern` with `patternUnits="userSpaceOnUse"`, and the overlay shape references it with `fill="url(#…)"`

#### Scenario: Icons as paths
- **WHEN** a diagram with `style api { icon "tabler:server" }` is rendered
- **THEN** the SVG contains `<g data-id="tabler:server" data-role="icon" transform="translate(`, its children are `<path` elements with `stroke-linecap="round"`, and it contains no `<use`, `<image` or `<symbol`

#### Scenario: Layer attribute
- **WHEN** a diagram declares `layers back, main` and `band` is on `back`
- **THEN** the SVG has `<g data-id="band" data-role="element" data-layer="back">` and no `data-layer` on groups of `main`

### Requirement: Text fits its box
When an explicit `size` gives an element less width than its widest measured text line plus 6 px on each side, the layout SHALL report `layout.text-overflow` (warning) on the `size` statement. The message SHALL name the text, and the hint SHALL give `size <id> (<width>, <height>)` with the comfortable width (text plus the theme `padding` on each side, 16 px in `technical.light`). The same SHALL apply to a group with an explicit size and a wider title. Text SHALL never be scaled down. When a theme font stack has no bundled family, or text contains characters no bundled subset covers, the layout SHALL report `layout.unmeasured-font` (info) once per diagram, listing the font or the characters.

#### Scenario: Explicit size too small
- **WHEN** `size api (80, 56)` is set and the label `API Gateway` measures 79.66 px at 13 px weight 600
- **THEN** `layout.text-overflow` is reported on that `size` statement with the hint `size api (112, 56)`

#### Scenario: Unknown theme font
- **WHEN** a file theme sets `font "Comic Sans MS"` and a diagram uses it
- **THEN** `layout.unmeasured-font` (info) names `Comic Sans MS`, and the scene is produced with estimated widths

#### Scenario: Emoji in a label
- **WHEN** a label is `Deploy 🚀`
- **THEN** `layout.unmeasured-font` (info) lists `🚀`, and the box still fits the rest of the label

#### Scenario: Padding token
- **WHEN** the same `size api (80, 56)` is laid out with a theme that sets `padding 24`
- **THEN** the hint is `size api (128, 56)`

### Requirement: Layout geometry for editors
When `layoutDiagram` produces a scene, `LayoutResult` SHALL also report, in diagram coordinates (the coordinates of `place` statements):

- `offset`: the vector from diagram to scene coordinates;
- `boxes`: the box of every element and group;
- `labels`: the label pill of every relation that has one, by relation key;
- `connectors`: for every relation, the drawn points, the from and to sides, and the written waypoints.

A scene point SHALL equal the diagram point plus `offset`.

#### Scenario: Offset and boxes agree with the scene
- **WHEN** `corpus/valid/checkout.meltemi` is laid out with ELK
- **THEN** for every element, its box plus `offset` equals the rect drawn in the scene, and every connector's first point plus `offset` equals the first point of its polyline

### Requirement: Image items
The scene SHALL support an image item with a box, a data URI and an optional title. `renderSvg` SHALL draw it inside the element's `<g data-id>` as `<image x y width height href="data:…" preserveAspectRatio="xMidYMid meet">`, followed by a `<title>` holding the description when one exists. A scene with the same image twice SHALL embed it twice; no external reference SHALL be written. The placeholder for an unavailable image SHALL be a dashed rectangle with the file name.

#### Scenario: Image in the SVG
- **WHEN** a free diagram with `image logo "logo.png" { description "Company logo" }` sized (160, 40) is rendered with a resolver
- **THEN** the SVG holds `<g data-id="logo">` with an `<image` of width 160 and height 40, a `data:` `href`, `preserveAspectRatio="xMidYMid meet"` and `<title>Company logo</title>`

### Requirement: Free diagrams render through the same pipeline
`renderSvg` SHALL draw free scenes with the same structure, determinism and font policies as flow scenes. Free text objects SHALL be text items without a frame. Box shapes SHALL be path or rect items, and layer order SHALL be the order of the items.

#### Scenario: Free corpus snapshot
- **WHEN** `corpus/valid/free/overview.meltemi` is exported with the `system` policy
- **THEN** the SVG matches the stored snapshot, and rendering it twice gives identical text

### Requirement: Relation ends
A relation SHALL draw its target head (`arrowhead`, else the theme's) and its source head
(`arrowtail`, else the target head for a two-way relation, else none) in its stroke colour and
width, after its line and before its label, with the geometry below, where L is the theme's
`arrowSize` and W is 7/8 of it, and SHALL end its line where the head needs it:

- `triangle` and `triangleOutline`: a triangle L long and W wide; the line ends at its base;
- `open`: a V L long and W wide; the line reaches the tip;
- `diamond` and `diamondOutline`: a diamond 1.5 L long and W wide; the line ends at its back;
- `circle` and `circleOutline`: a circle of radius 0.45 L touching the tip; the line ends at its back;
- `bar`: a bar 1.2 W long, L/2 before the tip; `cross`: an X W wide, 0.6 L before the tip;
- `many`: a crow's foot from L before the tip to the tip and 0.6 W on either side; `oneOrMany`
  adds a bar 1.3 L before the tip; `onlyOne` is two bars L/2 and L before the tip;
- `zeroOrOne`: a bar L/2 before the tip and an outlined circle behind it; `zeroOrMany`: a crow's
  foot and an outlined circle behind it; the line ends at the circle's back.

Filled shapes SHALL be filled with the stroke colour; outlined shapes SHALL have no fill. A Bézier
connector SHALL be trimmed at both ends, leaving and entering along the side normals. The group's
`track` SHALL be the trimmed line.

#### Scenario: Two-way triangle
- **WHEN** a flow diagram has `a <-> b` with the default theme
- **THEN** the relation's group draws its line, then two filled triangles, one at each anchor, and
  the line ends 8 px before each anchor

#### Scenario: Crow's foot
- **WHEN** a relation has `style r { arrowhead zeroOrMany }`
- **THEN** its target end draws three prongs that meet L before the anchor and an outlined circle
  behind them, and its line ends at the circle

### Requirement: Dotted lines
`line dotted` SHALL draw the line or outline with round dots: a dash of 0 and a gap of
`1.5 × width + 3`, with round caps, in the SVG as `stroke-dasharray` and `stroke-linecap="round"`.
A motion dash SHALL replace it while the effect runs.

#### Scenario: Dotted relation
- **WHEN** `style r { line dotted }` targets a relation 1.3 px wide
- **THEN** its polyline has `stroke-dasharray="0 4.95"` and round caps

