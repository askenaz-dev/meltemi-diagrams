## MODIFIED Requirements

### Requirement: Creating and connecting
The palette SHALL create a node, decision, data store, note, tag or group, by drag and drop or by keyboard (N, D, S, O, T, G) at the centre of the viewport, snapped to a free grid cell:

- the new element SHALL go inside the group under the drop point, groups included, so groups nest;
- it SHALL get a generated id (`node1`, `decision1`, …) and a `place`, with a `size` for groups;
- nodes, decisions, data stores and boxes SHALL be written with an empty label and selected without opening the label editor; notes, tags and free texts SHALL get their default text and open the label editor; groups SHALL get their default title.

The box button (free) and the node button (flow) SHALL be split buttons: the main part SHALL arm the tool with the canvas's current shape (`rounded` until one is chosen) and show its picture; the arrow part SHALL open a grid of the twenty-three shapes with a picture and a name each, and choosing one SHALL make it current and arm the tool. The ghost SHALL take the shape's default size and outline, and the drop or click SHALL create the element with `style <id> { shape <value> }` in the same edit (no style for `rounded`). B and N SHALL create the current shape near the centre. F SHALL open the grid from the keyboard on free and flow diagrams: the arrows move through it, typing filters the shapes by their name in the interface language or in English, Enter creates the highlighted shape near the centre and makes it current, and Escape closes it. The arrow parts SHALL be hidden and F SHALL do nothing when the canvas is read-only.

Dragging from a connection handle to another box SHALL create a relation (`->`; `-->` with Shift). Dropping on a point of the target's border SHALL also fix both ends, the handle's side at 50 % and the dropped point, in a `route`; dropping further inside the target SHALL create the relation alone. Hovering within 8 screen pixels outside any box's border SHALL show the point a connection would start from; dragging from there to another box SHALL create the relation with its start pinned to that point and its end pinned when dropped on the target's border. For a box drawn with a non-rectangular shape, the border, the magnets (the shape's vertices and side midpoints; no corners on ellipses) and the previewed point SHALL follow the shape's outline, while the written `route` keeps the side and percentage form. "Connect to…" (C) SHALL offer the other elements in a filtered list. The palette's arrow button SHALL be a split button whose menu lists the four arrow kinds `->`, `-->`, `<->` and `<-->` with pictures; choosing one SHALL make it current and arm the relation tool. The relation tool (R) SHALL create a relation of the current kind from the first clicked element to the second, Escape cancelling and Shift on the second click flipping solid and dashed; while the tool is armed, R again SHALL cycle to the next kind, named in the status line. Connection handles keep creating `->` (`-->` with Shift).

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

### Requirement: Editing text in place
Enter or F2 on an element or relation, or a double-click, SHALL open an inline editor over the text it edits: an element's text area (its label box, a shape's inscribed area, the body of `person` and `agent`), a relation's label or, without one, its midpoint. The editor SHALL use the font, size at the current zoom, weight, colour and alignment of the drawn text, SHALL have no background, no border and no browser autocomplete, spelling or correction, SHALL hide the drawn text while open, and SHALL grow with its lines. Enter, Tab or a click outside SHALL commit with `setElementLabel` or `setRelationLabel`; Shift+Enter SHALL insert a line break, written `\n`; Escape SHALL cancel. Shift+F2 SHALL rename the id with `renameElement` or `renameRelation` in the same editor, on one line.

#### Scenario: Edit a label
- **WHEN** the label of `api` is edited to `Orders API` and committed
- **THEN** only the label string of `api`'s declaration changes

#### Scenario: Text added to an empty shape
- **WHEN** an empty `box box1 ""` with `shape hexagon` is double-clicked, `Payments` is typed and Enter is pressed
- **THEN** the declaration reads `box box1 "Payments"`, and while typing the editor lay inside the hexagon in the drawing's font size at the current zoom

#### Scenario: Two lines
- **WHEN** `Planner`, Shift+Enter and `agent` are typed in the editor of `node1` and Enter is pressed
- **THEN** the declaration's label is `"Planner\nagent"` and the node draws two lines

#### Scenario: Cancel
- **WHEN** the editor of `api` is open, `x` is typed and Escape is pressed
- **THEN** the text is unchanged and `api`'s drawn label is shown again

#### Scenario: No autocomplete
- **WHEN** the editor is open
- **THEN** it is a text area with autocomplete, autocorrect and spellcheck off
