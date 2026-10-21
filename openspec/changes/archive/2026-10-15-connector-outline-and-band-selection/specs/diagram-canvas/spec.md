## MODIFIED Requirements

### Requirement: Selection
The canvas SHALL support:

- click, plus Shift- or Ctrl-click to add and remove;
- a selection rectangle that selects the boxes fully inside it and the relations whose drawn line is fully inside it;
- select all (Ctrl+A) and clear (Escape);
- Tab and Shift+Tab through elements in source order;
- Ctrl with the arrows to the nearest element in that direction.

The selection SHALL be kept across renders, and ids that disappear SHALL be dropped.

#### Scenario: Keyboard traversal
- **WHEN** `client`, `api` and `db` are declared in that order, `api` is selected and Tab is pressed
- **THEN** `db` is selected and scrolled into view

#### Scenario: A rectangle over an arrow
- **WHEN** a selection rectangle is dragged around the whole connector of `save` and no box
- **THEN** `save` is selected

### Requirement: Route editing
A selected relation SHALL show its outline along the connector as drawn (a Bézier route's curve, rounded corners, detours), its bends, its two ends and, for each stretch between two of them, a handle at the middle by length of that stretch of the drawn connector:

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

#### Scenario: The midpoint handle sits on the connector
- **WHEN** a relation pinned to `api.north 31%` and `client.east 50%` is drawn up, across and back into `client`'s east side, and is selected
- **THEN** its one midpoint handle lies on the drawn connector, halfway along it

#### Scenario: A curved connector
- **WHEN** a relation with `routing bezier` is selected
- **THEN** its outline follows the curve and its midpoint handle lies on the curve, not on the line between its ends
