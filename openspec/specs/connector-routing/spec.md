# connector-routing Specification

## Purpose
The shapes of connectors (`auto`, `orthogonal`, `polyline`, `bezier`), how they leave and enter box sides, and the lanes that keep parallel relations apart.
## Requirements
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
In every drawing by the anchor rules, the free ends of relations (port `auto` or a compass side without a position, no waypoints, not a named port) that meet the same side of the same box less than a lane apart SHALL take separate lanes along that side. A lane is 16 px, or for a side holding labelled relations the height of the tallest label pill plus 4 px. Each run of `n` such ends SHALL be ordered by the coordinate, along the side, of each relation's other anchor (x on north and south, y on east and west; ties in source order), and the `i`-th SHALL be placed `(i − (n − 1) / 2)` lanes from the middle of the run's anchors, clamped to the side. A straight connector one end of which moves while its other end does not SHALL move that end by the same amount, so it stays straight; a connector whose two ends move by different amounts SHALL join them square to their sides. Relations between the same two elements, in either direction, are such ends on both sides, so two of them SHALL be 16 px apart and symmetric about the centre line of their overlap. Ends a lane apart or more, and a single end on a side, SHALL keep their anchors. Pinned ends SHALL NOT move, and connectors that follow the engine's routes SHALL keep them.

#### Scenario: Two parallel relations
- **WHEN** `a` and `b` face each other horizontally and the diagram has `a -> b` twice
- **THEN** the two connectors are horizontal, 16 px apart, and symmetric about the centre line of the overlap

#### Scenario: Two relations into one side
- **WHEN** `node1`, left of `client` and above it, and `db`, right of it and above it, both end on `client.north` with `routing orthogonal` in an `assisted` diagram with every element placed
- **THEN** the two connectors end 16 px apart on the north side, the one from `node1` left of the one from `db`, their last segments do not coincide, and no `layout.connector-overlap` is reported for them

#### Scenario: Two connectors into one side of a free composition
- **WHEN** `corpus/valid/free/composition.meltemi` is drawn, where `fromWeb` and `fromMobile` used to end 1 px apart on the same side of their target
- **THEN** they end 16 px apart, `fromWeb` is still one straight segment, and no other connector of the sheet moves

#### Scenario: A pinned end stays
- **WHEN** one of two relations ending on `client.north` has `route … to client.north 80%`
- **THEN** that end stays at 80 %, and the free end, alone among the free ends of the side, keeps the middle of the side

### Requirement: Default connectors around boxes
In every layout mode, an `auto` or `orthogonal` connector with no waypoints and no parallel lane
whose route — the engine's in `auto` mode, else the anchor rules' — runs through another shape
SHALL go around when it can:

- with both ends free (no written port), it SHALL first take, among the L and Z routes between the
  middles of any two sides that leave and enter square with a 20 px stub, the one that crosses the
  fewest shapes, then the shortest, then the one with the fewest bends;
- when it still crosses a shape, or an end is pinned (a compass side, a point of a side or a named
  port), it SHALL take the shortest orthogonal detour that leaves and enters at the route's own
  first and last points, square to their sides with a 20 px stub, passing through no shape and
  neither end box, where each change of direction counts as 40 px.

A shape that contains one of the connector's end boxes (a group that holds it, or a box it is
stacked inside) SHALL NOT count as a shape in the way, nor SHALL a shape on another layer than the
relation. A route SHALL change only when the new one crosses fewer shapes. A connector that crosses
nothing SHALL keep its route.

#### Scenario: Around a box in the way
- **WHEN** an assisted view places `api` above `db`, with `bank` below `db`, and `api -> bank` would run straight through `db`
- **THEN** the connector of `api -> bank` goes around `db` and crosses no box

#### Scenario: Around a box with pinned ends
- **WHEN** a diagram in `auto` mode draws `client` above `db`, `api` to their left, and `client -> api` with `route request from client.south to api.south`
- **THEN** the connector leaves `client`'s south side and enters `api`'s south side, crosses no box, and `layout.connector-crossing` is not reported

#### Scenario: Inside a container
- **WHEN** `a` and `b` are stacked inside the box `outer`, placed side by side, and `a -> b` has no route
- **THEN** the connector is the straight line between them and does not detour around `outer`

#### Scenario: Over a band on a back layer
- **WHEN** `layers back, main` is declared, `band` is a box on `back` under `api` and `db`, and `api -> db` runs across it
- **THEN** the connector keeps the straight route

### Requirement: Labels placed clear
A relation label without a `label` statement SHALL sit at the first of 50 %, 42 %, 58 %, 34 %, 66 %,
26 %, 74 %, 18 % and 82 % of its connector where its pill covers no shape, no group title band, no
other label and no other connector, or at the stop that covers the fewest. A label placed with
`label` SHALL stay where it is written.

#### Scenario: Label off a box
- **WHEN** the middle of a connector lies over another box
- **THEN** its label sits at the nearest clear stop along the connector

### Requirement: Connectors under group titles
A straight connector that crosses the title or description of a group it does not join SHALL be
drawn with a gap of 3 px around them, as passing under the title; the relation's track, which
motion follows, SHALL stay whole.

#### Scenario: Entering a group from above
- **WHEN** a connector enters a group through its title
- **THEN** the connector is drawn in two pieces that stop 3 px from the title, and no label overlap is reported

### Requirement: Rounded corners
A relation SHALL take `corners` from its style, else the theme's `corners` (built-in themes
`sharp`). With `rounded`, every bend of an `auto`, `orthogonal` or `polyline` connector SHALL be
replaced by a quadratic curve through the bend whose ends are 10 px from it along each segment, or
half the shorter segment when that is less, sampled in eight steps into the connector's points, so
the connector stays a polyline for labels, checks, gaps under group titles and motion. `bezier`
connectors SHALL be unchanged.

#### Scenario: Rounded elbow
- **WHEN** a relation with `routing orthogonal` and `corners rounded` bends once at (100, 50)
  between long segments
- **THEN** its points include (90, 50) and (100, 60) and none of them is (100, 50)

#### Scenario: Sharp by default
- **WHEN** the same relation has no `corners` and the theme is built in
- **THEN** its points include (100, 50)

### Requirement: Ends on turned elements
A connector SHALL meet a turned element on its turned outline. A free end SHALL be routed to the element's drawn box as to any box (sides, lanes, detours around obstacles), and the point found on a side of the drawn box SHALL move along that side's inward normal onto the turned outline, or to the nearest point of it when the normal meets none. A named port or a point pinned to a side (`api.north 30%`) SHALL be computed on the unturned shape in the element's own frame and turned with it; the connector SHALL leave or enter it square to the drawn box's side whose outward normal is closest to the turned side's normal. `route` statements SHALL keep naming sides and percentages in the element's own frame.

#### Scenario: Free end on a turned square
- **WHEN** square `s` has `rotation 45` and `a`, placed left of it at the same height, has `a -> s` without a route
- **THEN** the connector ends on the left vertex of the turned square, on its outline

#### Scenario: Pinned end turns with the element
- **WHEN** node `api` has `rotation 90` and `route save from api.north 50% to db` is written
- **THEN** the connector starts at the middle of `api`'s turned north side, which faces east, and leaves it eastwards

#### Scenario: Unturned elements keep their ends
- **WHEN** a diagram without `rotation` is laid out
- **THEN** every connector has the same points as before this requirement

### Requirement: Lines are routed as connectors
A free `line` object SHALL be routed by the rules of "Route kinds" from its written points, which are its anchors and waypoints: `polyline` by default (its `auto` is `polyline`, since a line has no box to anchor to); `orthogonal` SHALL insert one elbow between consecutive points that differ on both axes, the first segment leaving along the axis of the longer displacement of the first pair; `bezier` SHALL curve through every point. `corners` SHALL apply as "Rounded corners" says. A line SHALL take no lane and no detour, and the heads SHALL be `arrowtail` and `arrowhead`, `none` by default, drawn and cut as "Ends" are for relations. A relation with `heads` `none` SHALL be routed exactly as a relation with heads, the line reaching its boxes.

#### Scenario: Default polyline
- **WHEN** `line l from (100, 100) to (300, 100) via [(200, 150)]` has no `routing`
- **THEN** its points are those three, without elbows, whatever the diagram's `routing`

#### Scenario: Orthogonal line
- **WHEN** `line l from (0, 0) to (200, 100)` has `style l { routing orthogonal }`
- **THEN** its points are (0, 0), (200, 0) and (200, 100), every segment horizontal or vertical

#### Scenario: Heads on a line
- **WHEN** `line l from (0, 0) to (200, 0)` has `style l { arrowtail circle; arrowhead triangle }`
- **THEN** a circle is drawn at (0, 0), a triangle at (200, 0), and the drawn line is shorter than 200 by the heads' lengths

#### Scenario: Headless relation reaches the boxes
- **WHEN** `a -- b` joins two boxes 100 px apart
- **THEN** the connector's drawn line is 100 px long, from the east side of `a` to the west side of `b`, with no head at either end

#### Scenario: Unknown routing on a line
- **WHEN** `line l from (0, 0) to (100, 0)` has `style l { routing curved }`
- **THEN** `prop.invalid-value` is reported on `curved` listing `auto, orthogonal, polyline, bezier`

