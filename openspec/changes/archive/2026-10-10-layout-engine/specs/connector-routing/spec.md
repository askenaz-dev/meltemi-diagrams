## ADDED Requirements

### Requirement: Route kinds
A flow diagram SHALL accept the property `routing auto|orthogonal|polyline|bezier`, `auto` by default, and relations SHALL accept the style property `routing` with the same values, through `style` statements, classes and `rule relation`. A relation's route SHALL take its own `routing`, else the diagram's:

- **`auto`**: the anchor rules (decision 0006), or the engine's points in `auto` mode;
- **`orthogonal`**: axis-aligned segments through the anchors and waypoints, inserting one elbow between consecutive points that differ on both axes, so that the first segment leaves along the normal of the source side and the last one enters along the normal of the target side; without waypoints the two anchors are joined like ports (below);
- **`polyline`**: straight segments between the anchors and waypoints;
- **`bezier`**: a smooth cubic curve through the anchors and waypoints, leaving and entering perpendicular to the box sides, drawn as a path with the arrowhead along the final tangent.

In `auto` mode with an engine, `auto` and `orthogonal` connectors SHALL follow the engine's routes, and `polyline` and `bezier` connectors SHALL join their anchors directly, since the engine's routes are orthogonal. A connector between a compass port and a named port, without waypoints, SHALL leave and enter along the normals of their sides: none, one or two elbows when the sides allow it, and otherwise a 20 px stub out of each port joined by one elbow.

An unknown value SHALL be `prop.invalid-value`. `routing` on an element target of a `style` statement, or in an element rule, SHALL be `prop.invalid-value`.

#### Scenario: Orthogonal into a top side
- **WHEN** a relation with `routing orthogonal` and no waypoints leaves the south side of a box at (0, 0) for the north side of a box at (100, 100)
- **THEN** its points are (0, 0), (0, 50), (100, 50) and (100, 100), and the arrow enters the target from above

#### Scenario: Orthogonal with a diagonal waypoint
- **WHEN** a relation with `routing orthogonal` leaves (100, 100) towards a waypoint at (200, 150)
- **THEN** its points include an elbow at (200, 100), and every segment is horizontal or vertical

#### Scenario: Bézier connector
- **WHEN** a relation has `routing bezier`
- **THEN** the scene draws it as a path with `C` commands and no fill, and the arrowhead tip is at the target anchor

#### Scenario: Polyline keeps diagonals
- **WHEN** a relation with `routing polyline` has the waypoint (200, 150) between (100, 100) and (300, 100)
- **THEN** its points are those three, without elbows

### Requirement: Parallel lanes
Relations between the same two elements, in either direction, that have no waypoints and use compass or `auto` ports SHALL take separate lanes. The `i`-th of `n` relations, in source order, SHALL move both its anchors by `(i − (n − 1) / 2) × 16` px along the side. A single relation SHALL keep its anchors.

#### Scenario: Two parallel relations
- **WHEN** `a` and `b` face each other horizontally and the diagram has `a -> b` twice
- **THEN** the two connectors are horizontal, 16 px apart, and symmetric about the centre line of the overlap
