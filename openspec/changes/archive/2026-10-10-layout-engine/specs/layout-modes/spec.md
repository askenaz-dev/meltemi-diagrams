## ADDED Requirements

### Requirement: Layout engine interface
`@meltemi/diagrams-layout` SHALL define a synchronous `LayoutEngine` with `arrange(request)`. A request lists:

- nodes with size, kind, parent group, ports and, for fixed nodes, their centre;
- groups with paddings and parent;
- edges with source, target, ports and whether they are primary (`->`) or secondary (`-->`);
- the direction and spacings.

The result gives every node's centre and every edge's points. `LayoutOptions.engine` SHALL pass an engine to `layoutDiagram`, and `LayoutOptions.layout` SHALL lay the diagram out as if its `layout` were that mode. With a scene, `LayoutResult.boxes` SHALL give the box of every element and group in diagram coordinates, the coordinates of `place` statements. Without one, a diagram in `auto` or `assisted` with unplaced elements SHALL report `layout.mode-unsupported` (error) with a hint that hosts pass an engine, and SHALL produce no scene.

#### Scenario: No engine
- **WHEN** a `layout auto` diagram with unplaced elements is laid out without an engine
- **THEN** `layout.mode-unsupported` is reported and the scene is null

#### Scenario: A test engine
- **WHEN** the same diagram is laid out with an engine that places every node on a diagonal
- **THEN** the scene centres each box on the engine's position and draws its relations

### Requirement: Automatic mode
In `layout auto`, every element other than a group SHALL be arranged by the engine, and groups SHALL fit their children. The following SHALL apply as usual: `size`, `label`, `route` statements without waypoints (their ports), constraints, and styles. A `place`, or a `route` with waypoints, SHALL be ignored, and the first such statement SHALL be reported as `layout.placement-ignored` (warning) with the hint to use `layout assisted` to fix positions. Connectors SHALL follow the engine's points for `routing auto` and `orthogonal`.

#### Scenario: Arranged checkout
- **WHEN** a `layout auto` diagram with `client -> api -> orders -> db` and direction `LR` is exported with the ELK engine
- **THEN** the boxes are centred left to right in that order, no two boxes overlap, and every connector starts and ends on its boxes

#### Scenario: Ignored placement
- **WHEN** a `layout auto` diagram contains `place api at (10, 10)`
- **THEN** `layout.placement-ignored` is reported as a warning on that statement and `api` is placed by the engine

### Requirement: Assisted mode
In `layout assisted`, placed elements SHALL keep their `place` exactly. The engine SHALL arrange the whole graph. Each unplaced element SHALL keep its offset from the placed element nearest to it in the arrangement. An unplaced element that then overlaps a box already positioned SHALL be moved away from that placed element, along the layout direction, until it is clear. Connectors SHALL use the anchor rules of the route anchors requirement.

#### Scenario: Fixed boxes stay
- **WHEN** a `layout assisted` diagram places `api` at (300, 200) and `db` at (700, 200) and declares `cache` without a place, related to both
- **THEN** `api` and `db` are centred exactly on their places, and `cache` is placed by the engine without overlapping them

#### Scenario: Adding a node keeps fixed positions
- **WHEN** a node `audit` and a relation to it are added to that diagram
- **THEN** `api` and `db` keep their centres

### Requirement: Deterministic and stable arrangement
Arranging the same diagram twice SHALL give identical scenes. The engine SHALL follow the source order of elements and relations within each layer. Adding an element with no relations at the end of a diagram SHALL NOT change the relative order of the existing elements along the layout direction.

#### Scenario: Same input, same output
- **WHEN** the same `auto` diagram is laid out twice with the ELK engine
- **THEN** the two scenes are equal

#### Scenario: Added element keeps the order
- **WHEN** an unrelated node is appended to an `auto` diagram of a chain `a -> b -> c`
- **THEN** `a`, `b` and `c` keep their left-to-right order
