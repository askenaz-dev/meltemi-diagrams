## ADDED Requirements

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

## MODIFIED Requirements

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
