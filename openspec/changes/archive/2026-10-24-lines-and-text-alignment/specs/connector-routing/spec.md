## ADDED Requirements

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
