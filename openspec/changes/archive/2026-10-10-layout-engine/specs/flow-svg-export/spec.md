## MODIFIED Requirements

### Requirement: Manual layout geometry
`layoutDiagram` SHALL produce a scene for a flow diagram whose non-group elements all have a `place`, or whose positions an engine arranges (see `layout-modes`). Each element box SHALL be centred on its `place`. Its size SHALL be the `size` statement, or the default size of its kind when `size` is absent:

- `node` 160 x 56, `decision` 160 x 80 and `data` 160 x 64, widened when the widest measured text line (label or description) plus 16 px on each side is larger;
- `tag`: measured text width plus 18, by 18;
- `note`: longest measured line by 18 per line plus 4.

A group without `place` and `size` SHALL take the bounding box of its children expanded by 16 px on the sides and bottom and 40 px on top, widened to fit its measured title. With both statements it SHALL use them. The canvas SHALL be the bounding box of every item plus a 20 px margin.

#### Scenario: Placed nodes with and without size
- **WHEN** `api` is placed at (360, 180) with size (200, 56) and `db` is placed at (700, 180) without size
- **THEN** the scene has a 200 x 56 rect centred on (360, 180) for `api` and a 160 x 56 rect centred on (700, 180) for `db`

#### Scenario: Default size grows to fit a long label
- **WHEN** `svc["Payments reconciliation service"]` is placed without size and the label measures more than 128 px
- **THEN** its rect is as wide as the label plus 32 px, rounded up, and as tall as the default 56 px

#### Scenario: Group derived from its children
- **WHEN** group `backend` has no placement and contains `api` at (100, 100) and `db` at (300, 100), both 160 x 56
- **THEN** the group rect spans x 4..396 and y 32..144 and is drawn before its children

#### Scenario: Missing placement in manual layout
- **WHEN** a `layout manual` diagram declares `cache` without a `place`
- **THEN** `layout.missing-placement` is reported on the declaration of `cache` and no scene is produced

#### Scenario: Unplaced elements in assisted layout
- **WHEN** a `layout assisted` diagram has one element without `place` and no engine is given
- **THEN** `layout.mode-unsupported` is reported on the `layout` property and no scene is produced; with the ELK engine, or with every element placed, a scene is produced

### Requirement: Route anchors
A relation SHALL be drawn as a polyline from an anchor on the source box through its waypoints to an anchor on the target box, ending in a filled arrowhead. A side with a neighbouring waypoint SHALL anchor at the projection of that waypoint onto the side, clamped to the side. Two facing parallel sides without a waypoint between them SHALL anchor at the centre of the overlap of their extents, or at their own centres when the extents do not overlap. Non-parallel sides without waypoints SHALL anchor at the clamped projection of the other element's centre. An `auto` port SHALL choose the side facing the neighbour point. A named port SHALL anchor at its own point. A relation without a `route` SHALL use `auto` ports and no waypoints. Parallel relations SHALL take lanes, and `routing` SHALL shape the points between the anchors (see `connector-routing`).

#### Scenario: Facing sides with overlapping extents
- **WHEN** `nextjs` spans x 260..460 above `apiGw` which spans x 240..700, and the route is `from nextjs.south to apiGw.north`
- **THEN** the connector is vertical at x = 360

#### Scenario: Waypoint fixes the anchor
- **WHEN** the route is `from clients.east to mcpGw.north via [(1035, 48)]`, `clients` spans y 20..76 and `mcpGw` spans x 580..1040
- **THEN** the connector leaves `clients` at (1020, 48), bends at (1035, 48) and enters `mcpGw` at (1035, 530)

#### Scenario: Auto ports
- **WHEN** `a` is centred at (100, 100) and `b` at (100, 300) with no `route`
- **THEN** the connector leaves the south side of `a` and enters the north side of `b`

#### Scenario: Arrowhead
- **WHEN** any relation is rendered with a theme whose `arrowhead` is `triangle`
- **THEN** the scene contains a filled triangle at the target anchor pointing along the last segment, and the polyline stops at the base of the triangle

#### Scenario: Named port anchor
- **WHEN** a route goes `from api.east to bus.in` and `bus` declares `port in west 25%`
- **THEN** the connector ends at the point a quarter of the way down the west side of `bus`
