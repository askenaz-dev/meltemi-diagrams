# layout-modes Specification

## Purpose
How flow diagrams are arranged in `auto`, `assisted` and `manual` modes through a replaceable, synchronous layout engine: placed boxes stay fixed, unplaced ones are arranged deterministically and stably, and hosts without an engine report what they cannot place.
## Requirements
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

### Requirement: Assisted mode
In `layout assisted`, placed elements SHALL keep their `place` exactly. The engine SHALL arrange the whole graph, except groups that have both `place` and `size` and no children, and the relations that end on them, which SHALL be left out of the engine's request and drawn by the anchor rules. Each unplaced element SHALL keep its offset from the placed element nearest to it in the arrangement. An unplaced element that then overlaps a box already positioned SHALL be moved away from that placed element, along the layout direction, until it is clear; placed and sized groups SHALL NOT count as such boxes. Connectors SHALL use the anchor rules of the route anchors requirement.

#### Scenario: Fixed boxes stay
- **WHEN** a `layout assisted` diagram places `api` at (300, 200) and `db` at (700, 200) and declares `cache` without a place, related to both
- **THEN** `api` and `db` are centred exactly on their places, and `cache` is placed by the engine without overlapping them

#### Scenario: Adding a node keeps fixed positions
- **WHEN** a node `audit` and a relation to it are added to that diagram
- **THEN** `api` and `db` keep their centres

#### Scenario: A band does not change the arrangement
- **WHEN** a `layout assisted` diagram with three unplaced related nodes gains `layers back, main` and `group band "" { layer back }` placed at (300, 200) with size (500, 300)
- **THEN** the three nodes are arranged exactly as without the band, and the band is not in the engine's request

#### Scenario: Unplaced element without an engine
- **WHEN** a `layout assisted` diagram has an unplaced node and the host gives no engine
- **THEN** `layout.mode-unsupported` is reported and no scene is produced

### Requirement: Deterministic and stable arrangement
Arranging the same diagram twice SHALL give identical scenes. The engine SHALL follow the source order of elements and relations within each layer. Adding an element with no relations at the end of a diagram SHALL NOT change the relative order of the existing elements along the layout direction.

#### Scenario: Same input, same output
- **WHEN** the same `auto` diagram is laid out twice with the ELK engine
- **THEN** the two scenes are equal

#### Scenario: Added element keeps the order
- **WHEN** an unrelated node is appended to an `auto` diagram of a chain `a -> b -> c`
- **THEN** `a`, `b` and `c` keep their left-to-right order

### Requirement: Turned elements in the arrangement
In `layout auto`, and for the unplaced elements of `layout assisted`, the engine's request SHALL give a turned element the size of its drawn box, the bounding box of its turned outline, so the engine leaves room for the turned drawing; the element's box SHALL be centred where the engine centres that drawn box, with its own written or default size. `assisted` offsets and pushes SHALL compare drawn boxes.

#### Scenario: Room for a turned node
- **WHEN** a `layout auto` diagram has `client -> api -> db`, `api` is 160 × 56 and has `rotation 90`, and is laid out with a test engine that records its request
- **THEN** the request gives `api` width 56 and height 160, and the drawn box of `api` is centred on the engine's centre for it

#### Scenario: Assisted push uses the drawn box
- **WHEN** a `layout assisted` diagram places a node turned by 90 degrees and leaves a related node unplaced
- **THEN** the unplaced node does not overlap the placed node's drawn box

