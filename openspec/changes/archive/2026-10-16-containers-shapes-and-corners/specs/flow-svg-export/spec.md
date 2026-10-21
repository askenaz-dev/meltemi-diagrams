## MODIFIED Requirements

### Requirement: Manual layout geometry
`layoutDiagram` SHALL produce a scene for a flow diagram whose non-group elements all have a `place`, or whose positions an engine arranges (see `layout-modes`). Each element box SHALL be centred on its `place`. Its size SHALL be the `size` statement, or the default size of its kind when `size` is absent:

- `node` 160 x 56 and `data` 160 x 64, widened when the widest measured text line (label or description) plus 16 px on each side is larger;
- `decision` 160 x 80, grown until its text fits the diamond's inscribed area, as a shaped node does;
- a `node` with a `shape` takes that shape's default size and grows until its text fits the shape's inscribed area;
- `tag`: measured text width plus 18, by 18;
- `note`: longest measured line by 18 per line plus 4.

A group without `place` and `size` SHALL take the bounding box of its children expanded by 16 px on the sides and bottom and by its header on top: 40 px for a titled group, widened to fit its measured title, and 16 px for an untitled one (label `""`, no description, no styled icon). With both statements it SHALL use them. The canvas SHALL be the bounding box of every item plus a 20 px margin.

#### Scenario: Placed nodes with and without size
- **WHEN** `api` is placed at (360, 180) with size (200, 56) and `db` is placed at (700, 180) without size
- **THEN** the scene has a 200 x 56 rect centred on (360, 180) for `api` and a 160 x 56 rect centred on (700, 180) for `db`

#### Scenario: Default size grows to fit a long label
- **WHEN** `svc["Payments reconciliation service"]` is placed without size and the label measures more than 128 px
- **THEN** its rect is as wide as the label plus 32 px, rounded up, and as tall as the default 56 px

#### Scenario: Decision grows until its text fits the diamond
- **WHEN** `decision ok "Approved?"` and `decision long "Is the payment approved by risk?"` are placed without size
- **THEN** `ok` keeps the default 160 x 80, and `long` is 80 tall, wider than a `node` with the same label, and has every corner of its label's glyphs inside the diamond

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

### Requirement: Styles and themes
Element styles SHALL apply `fill`, `stroke`, `color` (label and description text), `line dashed` (dashed outline), `width` (outline width), `radius` (corner radius of rounded rectangles and groups, over the theme's `radius` or `groupRadius`) and `pattern`. Relation styles SHALL apply `stroke` to the connector and arrowhead, `width` to the connector, `arrowhead` to the head, `fill` and `color` to the label pill, and `line` as an override of the arrow style. `fill "none"` SHALL draw no background. Styles SHALL be resolved with the precedence of the `style-classes-and-rules` capability. The theme SHALL be the project's default theme when the diagram has no `theme`, and `technical.light` otherwise. `theme "<name>"` SHALL resolve a theme in scope or one of the built-in themes `technical.light`, `technical.dark`, `editorial.light`, `editorial.dark`, `stage.light` and `stage.dark`; any other name SHALL report `layout.unknown-theme` as a warning and use the default. The layout SHALL accept a theme name override that takes precedence over the diagram's `theme` property, and a default theme name (`defaultTheme`) used when the diagram has none. When the resolved theme has `frame footer` or `frame header`, the scene SHALL add a strip whose height scales with `frameSize` (44 px at 12 px) with a hairline, the Meltemi mark drawn with the theme gradient when `mark` is `meltemi`, the `brand` text and the diagram title; `frame none` SHALL add nothing. The `brand` token of the `technical.*` and `stage.*` themes SHALL be `Meltemi Diagrams`.

#### Scenario: Dashed proposed element
- **WHEN** `style proxy { line dashed; stroke "#c4552c" }` is set on a placed node
- **THEN** its rect has a dash pattern and the stroke colour `#c4552c`

#### Scenario: Square node
- **WHEN** `style proxy { radius 0 }` is set on a placed node
- **THEN** its rect has `rx` 0 while the other nodes keep the theme radius

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
