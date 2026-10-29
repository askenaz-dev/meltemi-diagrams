# free-diagram-model Specification

## Purpose
The free profile: `diagram <id>: free { }` objects (box, text, icon, image, group), free style properties, layers and identity links between diagrams, compiled into the shared diagram model.
## Requirements
### Requirement: Free diagrams compile
`diagram <id>: free { }` SHALL compile into the same diagram model as flow, with `type` set to `free`. It SHALL accept:

- the declarations `box`, `text`, `icon`, `image`, `note`, `line`, `pen`, `sticky` and `group`, and the shorthand `id["Label"]` (a box) and `id[("Label")]` (a box with `shape cylinder`);
- relations `->`, `-->`, `<->` and `<-->`, and the headless `--` and `---`, with labels, ids and blocks;
- `placement` with `place`, `size`, `route`, `label` and the constraints;
- `style`, `class`, `rule` and `animate`;
- the diagram properties of flow and `layers`, with `layout manual` as the default;
- `layout`, `spacing` and `align` in group blocks ("List groups").

Flow kinds (`node`, `decision`, `data`, `tag`) SHALL be `prop.unknown` in a free diagram, with a hint listing the free kinds; `note` is a free kind ("Notes in free compositions"), and so are `pen` ("Pen strokes") and `sticky` ("Stickies").

#### Scenario: The proposal's example
- **WHEN** the free example of the proposal (`text heading`, two boxes, a relation, placement, a route and an animation) is compiled
- **THEN** it compiles without errors, `heading` is a `text` object, `api` and `events` are boxes, and the diagram's layout is `manual`

#### Scenario: Flow kinds in free
- **WHEN** a free diagram declares `decision ok "OK?"`
- **THEN** `prop.unknown` is reported with a hint that lists the free kinds, `line`, `note`, `pen` and `sticky` among them

### Requirement: Free objects
- **`text <id> "Text"`** SHALL require its text.
- **`icon <id> "<pack>:<name>"`** SHALL require an icon reference, checked like style icons when the project has asset services.
- **`image <id> "<path>"`** SHALL require a path that is relative, uses `/`, has no URL scheme and stays inside the project root. It SHALL otherwise report `asset.outside-project`.

Elements SHALL expose `source` (the icon reference or image path). The style property `shape` SHALL take `rounded`, `rectangle`, `square`, `ellipse`, `circle`, `diamond`, `cylinder`, `pill`, `triangle`, `parallelogram`, `trapezoid`, `pentagon`, `hexagon`, `octagon`, `star`, `cloud`, `document`, `callout`, `arrow`, `framed`, `flag`, `person`, `agent` or `icon`; it SHALL be accepted on free boxes and on flow `node`s, and refused with `prop.invalid-value` on free `text`, `icon` and `image` objects, on `decision`, `data`, `note`, `tag`, groups and relations, naming `node` and `box`, in `style` statements as in rules. `fontSize` (6 to 160), `fontWeight` (400, 500, 600, 700) and `textAlign` (`left`, `center`, `right`) SHALL be accepted in free diagrams and refused in flow diagrams with `prop.invalid-value`. `radius` (0 to 64) SHALL be accepted on elements and groups of both profiles.

#### Scenario: Image path outside the project
- **WHEN** a free diagram declares `image logo "../../outside.png"` in a project whose root is the file's folder
- **THEN** `asset.outside-project` is reported on the path

#### Scenario: Shape in flow
- **WHEN** a flow diagram writes `style api { shape hexagon }` on a node
- **THEN** it compiles without diagnostics and the style entry of `api` has `shape` `hexagon`

#### Scenario: An agent node
- **WHEN** a flow diagram writes `style planner { shape agent }` on a node
- **THEN** it compiles without diagnostics and the style entry of `planner` has `shape` `agent`

#### Scenario: An icon as the shape
- **WHEN** a flow diagram writes `style lambda { icon "aws:lambda"; shape icon }` on a node
- **THEN** it compiles without diagnostics and the style entry of `lambda` has `shape` `icon`

#### Scenario: Shape on a decision
- **WHEN** a flow diagram writes `style ok { shape ellipse }` on a decision
- **THEN** `prop.invalid-value` is reported on `shape`, naming `node` and `box`

#### Scenario: Shape on a text, an icon or an image
- **WHEN** a free diagram writes `style t { shape hexagon }` on a text, `style i { shape star }` on an icon and `style p { shape pill }` on an image
- **THEN** `prop.invalid-value` is reported on each `shape`, naming `node` and `box`, as for `rule text { shape pill }`

#### Scenario: Text properties in flow
- **WHEN** a flow diagram writes `style api { fontSize 20 }`
- **THEN** `prop.invalid-value` is reported, naming free diagrams

#### Scenario: Unknown shape value
- **WHEN** a free diagram writes `style a { shape blob }`
- **THEN** `prop.invalid-value` is reported on `blob`, listing the twenty-four shapes

### Requirement: Layers
`layers <name>, <name>...` SHALL declare layers from back to front. `main` SHALL always exist and SHALL come last when it is not listed. `layer <name>` in the block of an element or relation SHALL place it on that layer. An undeclared name SHALL be `ref.unknown-layer`, listing the layers. Elements and relations without `layer` SHALL be on `main`. Flow diagrams SHALL accept `layers` and `layer` the same way; sequence diagrams and C4 views SHALL refuse them with `prop.unknown`.

#### Scenario: Unknown layer
- **WHEN** a free diagram declares `layers back` and a box writes `layer front`
- **THEN** `ref.unknown-layer` is reported with the hint "Layers: back, main."

#### Scenario: Layers in a flow diagram
- **WHEN** a flow diagram declares `layers back, main` with `group band "Band" { layer back }` and a node without `layer`
- **THEN** it compiles without diagnostics, the group is painted before the node, and a sequence diagram with `layers back` reports `prop.unknown`

### Requirement: Identity links
`link <diagram>.<element>` in an element block, in flow or free diagrams, SHALL record an identity link. The model SHALL resolve links to elements of other diagrams of the same file. A link whose first part is an import binding SHALL be left to the project, which SHALL resolve it through the binding. An unresolved link SHALL be `ref.unknown-link`. The diagram SHALL expose its links with their target and ranges.

#### Scenario: Link in the same file
- **WHEN** a free diagram's box writes `link checkout.api` and the file has `diagram checkout: flow` declaring `api`
- **THEN** the element's link targets diagram `checkout`, element `api`, and nothing is reported

#### Scenario: Unknown link
- **WHEN** a box writes `link checkout.ghost`
- **THEN** `ref.unknown-link` is reported on `ghost`

### Requirement: Free lines
A free diagram SHALL accept the declaration `line <id> ["Label"] from (x, y) to (x, y) [via [(x, y), ...]] [{ ... }]`: an object of kind `line` whose label is the optional second argument, empty by default, and whose points are two tuples of numbers without units after `from` and `to` and an optional list of such tuples after `via`, in the interior coordinates of its innermost group, as `place` is. The element SHALL expose `line` (`{ from, to, via }`; null on every other kind). A statement whose points are missing, not tuples, or followed by anything else SHALL be `prop.invalid-value` with the form in the hint. `line` SHALL be `prop.unknown` in flow, sequence and C4 diagrams, and the hint of `prop.unknown` for a flow kind in a free diagram SHALL list `line` among the free kinds. A line SHALL take no `place`, `size` or `rotation` (`prop.invalid-value`, with the hint that its points are written in its statement) and SHALL refuse `shape`, `radius`, `pattern`, `iconPosition`, `labelPosition`, `iconSize`, `fontSize`, `fontWeight`, `textAlign` and `verticalAlign` with `prop.invalid-value`; it SHALL accept `stroke`, `width`, `line`, `arrowhead`, `arrowtail`, `routing`, `corners`, `color`, `fill`, `icon` and `class` in `style` statements, classes and `rule line { }`, and `description`, `class`, `layer` and `url` in its block. `label <id> at <n>% [offset (dx, dy)]` SHALL accept a line as it accepts a named relation. The free profile's `ruleKinds` SHALL include `line`.

#### Scenario: A line with bends and a label
- **WHEN** a free diagram contains `line divider "Phase 2" from (40, 200) to (520, 200) via [(280, 180)]` and `style divider { line dashed; arrowhead triangle }`
- **THEN** the element `divider` has kind `line`, label `Phase 2`, `line.from` (40, 200), `line.to` (520, 200), `line.via` [(280, 180)], and the style entry has `line` `dashed` and `arrowhead` `triangle`, without diagnostics

#### Scenario: A line inside a group
- **WHEN** `group g "G"` placed at (300, 200) holds `line l from (0, 0) to (100, 0)`
- **THEN** `l`'s group path is `g` and its points are kept as written, relative to `g`'s interior origin

#### Scenario: A line in a flow diagram
- **WHEN** a flow diagram contains `line l from (0, 0) to (100, 0)`
- **THEN** `prop.unknown` is reported on `line` with the hint listing the flow kinds, and a free diagram that declares `decision ok "OK?"` reports `prop.unknown` with a hint that lists `line` among the free kinds

#### Scenario: Malformed points
- **WHEN** a free diagram contains `line l from (0, 0) to 100`
- **THEN** `prop.invalid-value` is reported on `100` with the hint `line <id> ["Label"] from (x, y) to (x, y) [via [(x, y), ...]]`

#### Scenario: A placed line
- **WHEN** a free diagram contains `line l from (0, 0) to (100, 0)` and `place l at (50, 50)`
- **THEN** `prop.invalid-value` is reported on `l` in the `place` statement with the hint that a line's points are written in its statement, and `style l { shape pill }` reports `prop.invalid-value` on `shape`

#### Scenario: Label on a line
- **WHEN** a free diagram contains `line l "Step" from (0, 0) to (200, 0)` and `label l at 30% offset (0, -16)`
- **THEN** the placement records a `label` entry for `l` at 30 % with offset (0, −16), and no diagnostic is reported

### Requirement: Vertical text alignment
`verticalAlign` (`top`, `middle` or `bottom`) SHALL be accepted in free diagrams on boxes, in `style` statements, classes and rules, and refused in flow diagrams with `prop.invalid-value` naming free diagrams, as `fontSize`, `fontWeight` and `textAlign` are; a value outside the three SHALL be `prop.invalid-value` listing them. The style entry SHALL keep the word, the model JSON SHALL carry it in `styles`, and declared diagram types SHALL validate it like `textAlign`.

#### Scenario: Vertical alignment on a box
- **WHEN** a free diagram contains `box a "A"` and `style a { verticalAlign top; textAlign left }`
- **THEN** it compiles without diagnostics and the style entry of `a` has `verticalAlign` `top` and `textAlign` `left`

#### Scenario: Vertical alignment in a flow diagram
- **WHEN** a flow diagram writes `style api { verticalAlign bottom }`
- **THEN** `prop.invalid-value` is reported on `verticalAlign` with the message that it applies to free diagrams only

#### Scenario: Unknown value
- **WHEN** a free diagram writes `style a { verticalAlign center }`
- **THEN** `prop.invalid-value` is reported on `center` listing `top, middle, bottom`

### Requirement: Notes in free compositions
`note <id> "Text" [on <element>]` SHALL be a free kind: `note` joins the free profile's declarations ("Free diagrams compile"), the hint for a flow kind in a free diagram lists it among them, and `rule note { }` is accepted. A free note SHALL require its text, SHALL take `\n` line breaks, and SHALL accept in its block `description`, `class`, `layer`, `link` and `url`. The style properties `fill`, `stroke`, `pattern`, `line`, `width`, `color`, `radius`, `icon`, `iconColor`, `iconSize`, `rotation`, `fontSize`, `fontWeight` and `textAlign` SHALL be accepted on a free note, in `style` statements, classes and rules; `shape` SHALL be refused on it with `prop.invalid-value` naming `node` and `box`, as on texts. `node`, `decision`, `data` and `tag` SHALL stay `prop.unknown` in a free diagram with the hint listing the free kinds. Free notes SHALL appear in model JSON as elements of kind `note`.

#### Scenario: A free note
- **WHEN** a free diagram declares `note hint "Draft\nnot final" { layer front }` with `layers main, front` and `style hint { fill "#fff3bf"; stroke "#e8a600"; textAlign center }`
- **THEN** it compiles without diagnostics, `hint` has kind `note`, a two-line label and layer `front`, and its style entry has `fill`, `stroke` and `textAlign`

#### Scenario: The hint names the free kinds
- **WHEN** a free diagram declares `decision ok "OK?"`
- **THEN** `prop.unknown` is reported with a hint that lists the free kinds, `note` among them

#### Scenario: A note without text
- **WHEN** a free diagram declares `note n`
- **THEN** the declaration reports that `note n` needs its text, with the form `note <id> "Text" [on <element>]`

#### Scenario: Shape on a free note
- **WHEN** a free diagram writes `style n { shape pill }` on a note
- **THEN** `prop.invalid-value` is reported on `shape`, naming `node` and `box`

#### Scenario: Text properties on a flow note
- **WHEN** a flow diagram writes `style limits { textAlign center }` on a note
- **THEN** `prop.invalid-value` is reported, naming free diagrams

### Requirement: Pen strokes
`pen <id> [(x, y), (x, y), …] [{ … }]` SHALL be a declaration of free diagrams: a freehand stroke through the listed points, written in the interior coordinates of its group as a line's points are. The list SHALL hold at least one tuple of two unitless numbers (decimals allowed) and MAY continue across lines as a `via` list does; a missing list, an empty one, or an item that is not such a tuple SHALL be `prop.invalid-value` on the statement with the form in the hint. The block SHALL take `description`, `class`, `layer`, `link` and `url`, and a pen SHALL have no label. `place`, `size` and `rotation` on a pen SHALL be `prop.invalid-value` with the hint that its points are written in its statement. A pen SHALL take the style properties `stroke` (the theme's `ink` colour by default), `width` (1 to 64, 3 by default), `line`, `opacity`, `arrowhead` and `arrowtail` (none by default), and SHALL refuse `fill`, `shape`, `radius`, `pattern`, `routing`, `corners`, the icon properties and the text properties with `prop.invalid-value`; `rule pen { … }` SHALL style every pen, its heads included. The model SHALL record the element with kind `pen` and `pen: { points }`. Flow, sequence and C4 diagrams SHALL refuse `pen` with `prop.unknown`.

#### Scenario: A stroke compiles
- **WHEN** a free diagram declares `pen arrow [(40, 60), (90.5, 58), (140, 70), (150, 66)]` and `style arrow { width 4; arrowhead triangle }`
- **THEN** it compiles without diagnostics, `arrow` has kind `pen`, four points with `90.5` kept, and the style entry has `width` 4 and `arrowhead` `triangle`

#### Scenario: A stroke in a group
- **WHEN** `pen p [(10, 10), (30, 20)]` is declared inside `group notes "Notes"`
- **THEN** `p` has the group path `notes` and its points are stored as written, in the group's interior

#### Scenario: One point
- **WHEN** a free diagram declares `pen dot [(100, 100)]`
- **THEN** it compiles without diagnostics and `dot` has one point

#### Scenario: Points that are not tuples
- **WHEN** a free diagram declares `pen p [10, 20, 30]` or `pen p []` or `pen p`
- **THEN** `prop.invalid-value` is reported on each statement with the hint `pen <id> [(x, y), (x, y), ...]`

#### Scenario: A placed or sized pen
- **WHEN** the placement block has `place p at (10, 10)` or `size p (20, 20)` for a pen, or `style p { rotation 45 }`
- **THEN** `prop.invalid-value` is reported on each, with the hint that a pen's points are written in its statement

#### Scenario: A box's property on a pen
- **WHEN** a free diagram writes `style p { fill surface }` and `style p { shape pill }` on a pen
- **THEN** `prop.invalid-value` is reported on `fill` and on `shape`, naming the properties a pen takes

#### Scenario: Width out of the pen's range
- **WHEN** a free diagram writes `style p { width 0 }` on a pen
- **THEN** `prop.invalid-value` is reported on `0` naming the range 1 to 64

#### Scenario: A pen in a flow diagram
- **WHEN** a flow diagram declares `pen p [(0, 0), (10, 10)]`
- **THEN** `prop.unknown` is reported on `pen` with the hint that pens belong to free diagrams

#### Scenario: A rule for pens
- **WHEN** a free diagram has `rule pen { width 5; stroke accent; arrowhead open }` and two pens
- **THEN** both pens resolve to width 5, the accent colour and an open head, without diagnostics

### Requirement: Stickies
`sticky <id> "Text" [{ … }]` SHALL be a declaration of free diagrams: a square note card whose text is required and in which `\n` breaks lines. The block SHALL take `description`, `class`, `layer`, `link` and `url`. A sticky SHALL take `fill` (the theme's `sticky` colour by default), `stroke` (none by default), `line` and `width` (of that outline), `color` (the theme's `stickyText`), `fontSize`, `fontWeight`, `textAlign` (`center` by default), `verticalAlign` (`middle` by default), `radius` (2 by default), `rotation`, `opacity`, `icon`, `iconColor` and `iconSize`, and SHALL refuse `shape`, `pattern`, `iconPosition`, `labelPosition` and the relation properties with `prop.invalid-value`; `rule sticky { … }` SHALL style every sticky. The model SHALL record kind `sticky`; a sticky SHALL be a relation endpoint, take `place`, `size`, `ports` and the constraints as a box does, and be an element of stories and effects as a box is. A sticky without its text SHALL be `prop.invalid-value` with the form in the hint. Flow, sequence and C4 diagrams SHALL refuse `sticky` with `prop.unknown`.

#### Scenario: A sticky compiles
- **WHEN** a free diagram declares `sticky idea "Cache the\ncatalogue"` and `style idea { fill "#f8bbd0" }`
- **THEN** it compiles without diagnostics, `idea` has kind `sticky` and the label `Cache the\ncatalogue`, and the style entry has `fill` `#f8bbd0`

#### Scenario: A sticky as an endpoint
- **WHEN** a free diagram has `sticky a "A"`, `box b "B"` and `a -> b`
- **THEN** the relation resolves with `a` as its source, without diagnostics

#### Scenario: A sticky without text
- **WHEN** a free diagram declares `sticky s`
- **THEN** `prop.invalid-value` is reported with the hint `sticky <id> "Text"`

#### Scenario: A shape on a sticky
- **WHEN** a free diagram writes `style s { shape hexagon }` on a sticky
- **THEN** `prop.invalid-value` is reported on `shape`, naming `node` and `box`

#### Scenario: A sticky in a flow diagram
- **WHEN** a flow diagram declares `sticky s "S"`
- **THEN** `prop.unknown` is reported on `sticky` with the hint that stickies belong to free diagrams

### Requirement: List groups
A group block of a free diagram SHALL take `layout column` or `layout row`, which makes the group a list that arranges its children along that axis in source order ("List groups arrange their children" in `free-layout`), `spacing <n>` (0 to 400, the distance between children) and `align start|center|end|stretch` (where children sit across the axis). `spacing` or `align` on a group without `layout` SHALL be `prop.invalid-value` with the hint to write `layout column` or `layout row`; any other value of the three SHALL be `prop.invalid-value` listing the values; on an element block they SHALL be `prop.unknown`; in a flow diagram all three SHALL be `prop.invalid-value` naming free diagrams. The model SHALL record `list: { layout, spacing, align }` on a list group (`spacing` and `align` null when not written) and `list` null on other groups.

#### Scenario: A column of cards
- **WHEN** a free diagram declares `group todo "To do" { layout column; spacing 12; sticky a "A"; sticky b "B" }`
- **THEN** it compiles without diagnostics and `todo` has `list` `{ layout: "column", spacing: 12, align: null }`

#### Scenario: A board of columns
- **WHEN** a free diagram declares `group board "" { layout row; align stretch; group todo "To do" { layout column } group done "Done" { layout column } }`
- **THEN** it compiles without diagnostics, `board` has `list.layout` `row` and `align` `stretch`, and both columns have `list.layout` `column`

#### Scenario: Spacing without a layout
- **WHEN** a group block has `spacing 12` and no `layout`
- **THEN** `prop.invalid-value` is reported on `spacing` with the hint to write `layout column` or `layout row`

#### Scenario: An unknown layout
- **WHEN** a group block has `layout grid`
- **THEN** `prop.invalid-value` is reported on `grid` listing `column, row`

#### Scenario: A list in a flow diagram
- **WHEN** a flow diagram's group block has `layout column`
- **THEN** `prop.invalid-value` is reported on `layout` naming free diagrams

### Requirement: Opacity
`opacity <number>` from 0 to 1 SHALL be a style property of free diagrams, accepted on elements, groups, lines and pens in `style`, `class` and `rule` statements and stored as a number. It SHALL be `prop.invalid-value` on a relation target (the hint naming elements, groups, lines and pens), outside the range (naming it), and in flow diagrams (naming free diagrams, as the text properties are).

#### Scenario: A translucent highlighter stroke
- **WHEN** a free diagram writes `style mark { width 20; opacity 0.35 }` on a pen
- **THEN** the style entry has `opacity` 0.35 without diagnostics

#### Scenario: Opacity on a relation
- **WHEN** a free diagram writes `style request { opacity 0.5 }` on a relation
- **THEN** `prop.invalid-value` is reported on `opacity` with the hint that it applies to elements, groups, lines and pens

#### Scenario: Opacity out of range or in a flow diagram
- **WHEN** a free diagram writes `style a { opacity 1.5 }` and a flow diagram writes `style api { opacity 0.5 }`
- **THEN** `prop.invalid-value` is reported on `1.5` naming the range 0 to 1, and on the flow diagram's `opacity` naming free diagrams

