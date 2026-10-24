## ADDED Requirements

### Requirement: Editing a free line
A selected `line` object SHALL show its outline along the line as drawn (rounded corners, a Bézier curve), its two ends, its bends and, for each stretch between two of them, a handle at the middle by length of that stretch, and no selection frame, resize, rotation or connection handles. Dragging an end or a bend SHALL move that point, snapped to the grid; dragging a midpoint SHALL insert a bend; double-clicking a bend SHALL remove it; dragging the line by its stroke past the drag threshold, or nudging it with the arrow keys, SHALL move every point by the same amount. Each drop SHALL post `setLinePoints { element, from, to, via }` in diagram coordinates, and the session SHALL write the statement's tuples in the parent's interior coordinates with minimal edits that keep the rest of the statement and its comments, inserting `via [...]` after `to` when bends appear and removing it when none is left, in one undo step. While dragging, the outline and the handles SHALL follow the pointer on every frame from the clean points, without a layout round trip. The line SHALL be hit by its painted stroke and its label pill, included in marquee selection by its bounding box, and its label SHALL be edited in place and moved as a relation's label is (`label <id> at …`). A line's ends SHALL offer no magnets and no box outline, since they are points. Copy and paste SHALL shift its points as places are shifted; deleting it SHALL remove its `label` statement with it; alignment and distribution SHALL leave lines out.

#### Scenario: Drag an end
- **WHEN** `line l from (98, 98) to (294, 98)` is selected and its end at (294, 98) is dragged to (352, 170) with a 14 px grid
- **THEN** the statement becomes `line l from (98, 98) to (350, 168)` and nothing else of the line changes

#### Scenario: Add and remove a bend
- **WHEN** the midpoint of the straight line `l` is dragged 56 px down and then that bend is double-clicked
- **THEN** the statement first gains `via [(196, 154)]` after `to (294, 98)`, then loses the `via` list, in two undo steps

#### Scenario: Move the whole line
- **WHEN** `l` is dragged by its stroke by (28, 14)
- **THEN** both ends (and every bend) move by (28, 14) in one edit

#### Scenario: A line in a group keeps interior coordinates
- **WHEN** `line l from (20, 40) to (120, 40)` inside group `g` whose interior origin is at (316, 240) has its start dragged to the drawn point (350, 280)
- **THEN** the statement becomes `line l from (34, 40) to (120, 40)`

#### Scenario: Label in place
- **WHEN** `line l "Step" from (0, 0) to (300, 0)` is selected and Enter is pressed
- **THEN** the inline editor opens on the pill at the middle of the line, and committing "Done" rewrites the statement's label

#### Scenario: Strip of a selected line
- **WHEN** `line l from (0, 0) to (300, 0)` is selected
- **THEN** the strip shows its stroke, line, width, both heads (`none` greyed), the route kind (`polyline` greyed) and the corners, none of a box's shape, radius, rotation or icon position, and choosing the dashed chip writes `style l { line dashed }`

#### Scenario: Stale revision
- **WHEN** a `setLinePoints` arrives with a revision that is not current
- **THEN** it is rejected with `edit.stale-revision` and the current render is sent again

#### Scenario: Read-only canvas
- **WHEN** the canvas is read-only and a line is selected
- **THEN** no handles are drawn and dragging its stroke moves nothing

## MODIFIED Requirements

### Requirement: Creating and connecting
The palette SHALL create a node, decision, data store, note, tag or group, by drag and drop or by keyboard (N, D, S, O, T, G) at the centre of the viewport, snapped to a free grid cell, and an icon (I) through the icon picker:

- the new element SHALL go inside the group under the drop point, groups included, so groups nest;
- it SHALL get a generated id (`node1`, `decision1`, …) and a `place`, with a `size` for groups;
- nodes, decisions, data stores and boxes SHALL be written with an empty label and selected without opening the label editor; notes, tags and free texts SHALL get their default text and open the label editor; groups SHALL get their default title.

The box button (free) and the node button (flow) SHALL be split buttons: the main part SHALL arm the tool with the canvas's current shape (`rounded` until one is chosen) and show its picture; the arrow part SHALL open a grid of the twenty-four shapes with a picture and a name each, and choosing one SHALL make it current and arm the tool. Choosing `icon`, by a click or with Enter, SHALL instead open the icon picker with the **Icon** placement to place a new element, since an icon shape needs its icon, and SHALL leave the current shape and the tools as they were. The ghost SHALL take the shape's default size and outline, and the drop or click SHALL create the element with `style <id> { shape <value> }` in the same edit (no style for `rounded`). B and N SHALL create the current shape near the centre. F SHALL open the grid from the keyboard on free and flow diagrams: the arrows move through it, typing filters the shapes by their name in the interface language or in English, Enter creates the highlighted shape near the centre and makes it current, and Escape closes it. The arrow parts SHALL be hidden and F SHALL do nothing when the canvas is read-only.

Dragging from a connection handle to another box SHALL create a relation (`->`; `-->` with Shift). Dropping on a point of the target's border SHALL also fix both ends, the handle's side at 50 % and the dropped point, in a `route`; dropping further inside the target SHALL create the relation alone. Hovering within 8 screen pixels outside any box's border SHALL show the point a connection would start from; dragging from there to another box SHALL create the relation with its start pinned to that point and its end pinned when dropped on the target's border. For a box drawn with a non-rectangular shape, the border, the magnets (the shape's vertices and side midpoints; no corners on ellipses) and the previewed point SHALL follow the shape's outline, while the written `route` keeps the side and percentage form; an element drawn with `shape icon` SHALL use its icon's square, not its label. "Connect to…" (C) SHALL offer the other elements in a filtered list. The palette's arrow button SHALL be a split button whose menu lists the six kinds `->`, `-->`, `--`, `---`, `<->` and `<-->` with pictures (the two line kinds drawn without heads); choosing one SHALL make it current and arm the relation tool. The relation tool (R) SHALL create a relation of the current kind from the first clicked element to the second, Escape cancelling and Shift on the second click flipping solid and dashed; while the tool is armed, R again SHALL cycle to the next kind, named in the status line. Connection handles keep creating `->` (`-->` with Shift).

#### Scenario: Create a data store
- **WHEN** the data store tool is dropped at (420, 260) with a 14 px grid in a `manual` diagram
- **THEN** the text gains `data1[("")]` and `place data1 at (420, 266)`, `data1` is selected and no label editor is open

#### Scenario: Create a hexagon from the box button
- **WHEN** the arrow of the box button is pressed on a free diagram, `hexagon` is chosen and the stage is clicked at (420, 260), then B is pressed
- **THEN** the text gains `box box1 ""`, `style box1 { shape hexagon }` and `place box1 at (420, 266)` in one undo step, then `box box2 ""` with `style box2 { shape hexagon }` near the centre, and the box button shows the hexagon

#### Scenario: Shape from the keyboard
- **WHEN** F is pressed on a flow diagram, `sta` is typed and Enter is pressed
- **THEN** the text gains `node1[""]`, `style node1 { shape star }` and a `place` near the centre, and the grid closes

#### Scenario: An agent from the grid
- **WHEN** F is pressed on a flow diagram, `agen` is typed and Enter is pressed
- **THEN** the text gains `node1[""]` and `style node1 { shape agent }`, and the node button shows the agent's picture

#### Scenario: The icon shape from the grid
- **WHEN** F is pressed on a flow diagram whose current shape is `rounded`, `icon` is typed and Enter is pressed
- **THEN** the shapes grid closes, the icon picker opens with the placement **Icon** chosen, the text is unchanged and the node button still shows the rounded shape

#### Scenario: A note opens its editor
- **WHEN** O is pressed on a flow diagram
- **THEN** the text gains a note with its default text and the label editor is open on it

#### Scenario: Arrow kind cycled
- **WHEN** R is pressed twice, then `api` and `db` are clicked
- **THEN** the text gains `api --> db`, and the status line named the dashed kind after the second R

#### Scenario: Shapes grid when read-only
- **WHEN** the canvas is read-only and F is pressed
- **THEN** nothing opens and the box button has no arrow part

#### Scenario: Nested group from the palette
- **WHEN** the group tool is dropped inside the placed group `g`
- **THEN** the new `group group1 "Group" { }` is declared inside `g` with a `place` in `g`'s interior coordinates

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

#### Scenario: Magnets of a diamond
- **WHEN** a connector's end is dragged over a `shape diamond` box
- **THEN** the outline shown is the diamond and its magnets are the four vertices and the four side midpoints on the outline, none at the rectangle's corners

#### Scenario: Connect to an icon shape
- **WHEN** a line is dragged from `api`'s east handle onto the label under `fn`, which has `shape icon`
- **THEN** the relation `api -> fn` is created and its connector ends on the icon's square, not on the label
