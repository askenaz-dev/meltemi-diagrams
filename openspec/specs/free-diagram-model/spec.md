# free-diagram-model Specification

## Purpose
The free profile: `diagram <id>: free { }` objects (box, text, icon, image, group), free style properties, layers and identity links between diagrams, compiled into the shared diagram model.
## Requirements
### Requirement: Free diagrams compile
`diagram <id>: free { }` SHALL compile into the same diagram model as flow, with `type` set to `free`. It SHALL accept:

- the declarations `box`, `text`, `icon`, `image`, `note`, `line` and `group`, and the shorthand `id["Label"]` (a box) and `id[("Label")]` (a box with `shape cylinder`);
- relations `->`, `-->`, `<->` and `<-->`, and the headless `--` and `---`, with labels, ids and blocks;
- `placement` with `place`, `size`, `route`, `label` and the constraints;
- `style`, `class`, `rule` and `animate`;
- the diagram properties of flow and `layers`, with `layout manual` as the default.

Flow kinds (`node`, `decision`, `data`, `tag`) SHALL be `prop.unknown` in a free diagram, with a hint listing the free kinds; `note` is a free kind ("Notes in free compositions").

#### Scenario: The proposal's example
- **WHEN** the free example of the proposal (`text heading`, two boxes, a relation, placement, a route and an animation) is compiled
- **THEN** it compiles without errors, `heading` is a `text` object, `api` and `events` are boxes, and the diagram's layout is `manual`

#### Scenario: Flow kinds in free
- **WHEN** a free diagram declares `decision ok "OK?"`
- **THEN** `prop.unknown` is reported with a hint that lists the free kinds, `line` and `note` among them

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

