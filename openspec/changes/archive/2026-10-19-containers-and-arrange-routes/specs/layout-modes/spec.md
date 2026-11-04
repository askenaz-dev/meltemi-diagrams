## MODIFIED Requirements

### Requirement: Layout engine interface
`@meltemi/diagrams-layout` SHALL define a synchronous `LayoutEngine` with `arrange(request)`. A request lists:

- nodes with size, kind, parent group, ports and, for fixed nodes, their centre;
- groups with paddings, parent and, in `auto`, for a group with a written `size` and children, that size as its minimum;
- edges with source, target, ports and whether they are primary (`->`) or secondary (`-->`);
- the direction and spacings.

The result gives every node's centre and every edge's points, and may give every group's box. `LayoutOptions.engine` SHALL pass an engine to `layoutDiagram`, and `LayoutOptions.layout` SHALL lay the diagram out as if its `layout` were that mode. With a scene, `LayoutResult.boxes` SHALL give the box of every element and group in diagram coordinates, the coordinates of `place` statements. Without one, a diagram in `auto` or `assisted` with unplaced elements SHALL report `layout.mode-unsupported` (error) with a hint that hosts pass an engine, and SHALL produce no scene.

#### Scenario: No engine
- **WHEN** a `layout auto` diagram with unplaced elements is laid out without an engine
- **THEN** `layout.mode-unsupported` is reported and the scene is null

#### Scenario: A test engine
- **WHEN** the same diagram is laid out with an engine that places every node on a diagonal
- **THEN** the scene centres each box on the engine's position and draws its relations

#### Scenario: A sized group reaches the engine as a minimum
- **WHEN** a `layout auto` diagram has `group g "" { a }` with `place g at (300, 200)` and `size g (238, 196)` and is laid out with a test engine that records its request
- **THEN** the request's group `g` has `minimum` 238 × 196, and the drawn box of `g` is the box the engine returned for it

### Requirement: Automatic mode
In `layout auto`, every element other than a group SHALL be arranged by the engine, and groups SHALL fit their children, except that a group with a written `size` SHALL be laid out at least that large, its children centred inside, and drawn at the engine's box, grown about its centre to that size when the engine gives no box or a smaller one. A group at the top level with `place` and `size` and no children SHALL be drawn at its place and size, out of the engine's request and not in the way of the arranged boxes, as in `assisted`. The following SHALL apply as usual: `size`, `label`, `route` statements without waypoints (their ports), constraints, and styles. A `place` of an element, or of a group with children, or a `route` with waypoints, SHALL be ignored, and the first such statement SHALL be reported as `layout.placement-ignored` (warning) with the hint to use `layout assisted` to fix positions. Connectors SHALL follow the engine's points for `routing auto` and `orthogonal`.

#### Scenario: Arranged checkout
- **WHEN** a `layout auto` diagram with `client -> api -> orders -> db` and direction `LR` is exported with the ELK engine
- **THEN** the boxes are centred left to right in that order, no two boxes overlap, and every connector starts and ends on its boxes

#### Scenario: Ignored placement
- **WHEN** a `layout auto` diagram contains `place api at (10, 10)`
- **THEN** `layout.placement-ignored` is reported as a warning on that statement and `api` is placed by the engine

#### Scenario: A band in automatic mode
- **WHEN** a `layout auto` diagram with three related nodes has `group band "" { layer back }` with `place band at (300, 200)` and `size band (500, 300)` and `layers back, main`
- **THEN** the diagram draws without diagnostics, the band is drawn at (300, 200) with size 500 × 300, the three nodes are arranged exactly as without the band, and `arrange` with scope `all` keeps the band's place and size

#### Scenario: A container keeps its size
- **WHEN** a `layout auto` diagram has `group node3 "" { db }` with `size node3 (238, 196)` and `db` is 160 × 64
- **THEN** the drawn box of `node3` is at least 238 × 196 and `db` is centred in it within 1 px

#### Scenario: A nested band in automatic mode
- **WHEN** a `layout auto` diagram has `group outer "Outer" { a; group band "" }` with `place band` and `size band`
- **THEN** `layout.missing-placement` is reported for `band` as before, since its group is drawn around the arranged boxes
