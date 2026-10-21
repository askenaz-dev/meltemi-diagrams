## MODIFIED Requirements

### Requirement: Route editing
A selected relation SHALL show its bends, the midpoints of its segments and its two ends as handles:

- dragging a bend SHALL move it, snapped to the grid;
- dragging a midpoint SHALL insert a bend;
- double-clicking a bend SHALL remove it; a route left without bends, ports or points SHALL be removed;
- dragging an end over a box SHALL show the box's outline, its magnets (the middle of each side, the corners and its named ports) and the point the end will take: within 12 screen pixels of the border, the point of the nearest side under the pointer, to 1 %, or a magnet within 6 px of it; with Alt, no magnet;
- dropping an end on a point of the same box's border SHALL write that port and position in the route; dropping it further inside the box SHALL write `auto` for that end;
- dropping an end on another box SHALL reconnect the relation with `reconnectRelation`, with the dropped point;
- double-clicking an end SHALL write `auto` for that end.

Anonymous relations SHALL first be named with `materializeRelationId`. The route kind SHALL be chosen in the inspector or the context menu and written as the relation's `routing` style.

#### Scenario: Add a bend
- **WHEN** the midpoint of the straight route of `create` is dragged 56 px down
- **THEN** the text gains `route create from api.east to orders.west via [(x, y)]` with the bend at the snapped point

#### Scenario: Drop an end on the middle of a side
- **WHEN** the end of `save` at `db` is dragged near the middle of `db`'s west side and dropped
- **THEN** the text gains `route save from api to db.west 50%` and the connector ends at that point

#### Scenario: Drop an end on any point of the border
- **WHEN** the end of `save` at `db` is dropped on `db`'s north border, 37 % from its left, away from every magnet
- **THEN** the route's end becomes `db.north 37%`

#### Scenario: Let the layout choose again
- **WHEN** that end is double-clicked
- **THEN** the route's end becomes `db`, without a port, and the route is removed when it holds nothing else

### Requirement: Creating and connecting
The palette SHALL create a node, decision, data store, note, tag or group, by drag and drop or by keyboard (N, D, S, O, T, G) at the centre of the viewport, snapped to a free grid cell:

- the new element SHALL go inside the group under the drop point;
- it SHALL get a generated id (`node1`, `decision1`, …) and a `place`, with a `size` for groups;
- it SHALL then be selected with its label ready to edit.

Dragging from a connection handle to another box SHALL create a relation (`->`; `-->` with Shift). Dropping on a point of the target's border SHALL also fix both ends, the handle's side at 50 % and the dropped point, in a `route`; dropping further inside the target SHALL create the relation alone. Hovering within 8 screen pixels outside any box's border SHALL show the point a connection would start from; dragging from there to another box SHALL create the relation with its start pinned to that point and its end pinned when dropped on the target's border. "Connect to…" (C) SHALL offer the other elements in a filtered list. The palette's relation tool (R) SHALL create a relation from the first clicked element to the second, Escape cancelling and Shift making it dashed.

#### Scenario: Create a data store
- **WHEN** the data store tool is dropped at (420, 260) with a 14 px grid in a `manual` diagram
- **THEN** the text gains `data1[("Data")]` and `place data1 at (420, 266)`, and `data1` is selected

#### Scenario: Connect with the keyboard
- **WHEN** `api` is selected, C is pressed and `db` is chosen
- **THEN** the text gains `api -> db`

#### Scenario: Connect with the tool
- **WHEN** the relation tool is chosen, `api` is clicked and then `db` with Shift held
- **THEN** the text gains `api --> db`

#### Scenario: Connect to a point
- **WHEN** a line is dragged from `api`'s east handle and dropped on the middle of `db`'s north side
- **THEN** the text gains `api -> db as api_db` and `route api_db from api.east 50% to db.north 50%`

#### Scenario: Connect from any point of the border
- **WHEN** a line is dragged from just outside `cache`'s north border, 30 % from its left, and dropped inside `db`
- **THEN** the text gains `cache -> db as cache_db` and `route cache_db from cache.north 30% to db.auto`
