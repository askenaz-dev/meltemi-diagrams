## MODIFIED Requirements

### Requirement: Selection
The canvas SHALL support:

- click, plus Shift- or Ctrl-click to add and remove; the topmost painted shape under the pointer is the one clicked, and a shape drawn as a path (diamond, ellipse, polygon…) is hit only inside its outline;
- Alt+click to select the shape below the one under the pointer, cycling through the stack in paint order, and "Select the shape below" in the context menu;
- a selection rectangle that selects the boxes fully inside it and the relations whose drawn line is fully inside it;
- select all (Ctrl+A) and clear (Escape);
- Tab and Shift+Tab through elements in source order;
- Ctrl with the arrows to the nearest element in that direction, preferring the nested (smaller) shape when two are concentric.

The selection SHALL be kept across renders, and ids that disappear SHALL be dropped.

#### Scenario: Keyboard traversal
- **WHEN** `client`, `api` and `db` are declared in that order, `api` is selected and Tab is pressed
- **THEN** `db` is selected and scrolled into view

#### Scenario: A rectangle over an arrow
- **WHEN** a selection rectangle is dragged around the whole connector of `save` and no box
- **THEN** `save` is selected

#### Scenario: Select below
- **WHEN** `outer`, `middle` and `inner` are stacked at one centre and the centre is Alt+clicked twice
- **THEN** the first Alt+click selects `middle` and the second `outer`

#### Scenario: Empty corner of a diamond
- **WHEN** the top-left corner of the bounding rectangle of a `shape diamond` box is clicked
- **THEN** nothing is selected

### Requirement: Moving, nudging and resizing
A move SHALL be one batch of `setPosition` for every selected element, every placed descendant of a selected group, and every selected group that has a `place`, by the delta of `resolveMove`. While a selection is dragged, the canvas SHALL show the innermost group whose box contains the centre of the dragged selection's box (the dragged elements and their descendants excluded, hidden layers skipped) as the drop target, highlighted like a connection target; on release, every dragged element whose parent differs from the target SHALL first be moved into it with `moveElement` (`parent` `null` when the centre lands outside every group) and its `setPosition` SHALL be written in the target's interior coordinates, all in the same batch; holding Alt SHALL keep the current parents. The same batch SHALL keep the drawing where it was: when every child of a group without `place` is dragged, they keep their parent and the group moves with them; a group left with no children and without `place` or `size` gets its drawn place and size written; a placed free group without `size` that gains or loses a child gets its drawn size written, so its interior does not move. An element whose parent is on a hidden layer keeps it while the centre stays inside that parent's box; hidden groups are never new targets. Arrow keys SHALL nudge by 1 px, or by one grid step with Shift, and SHALL never change the parent. A resize SHALL keep the opposite edges, snap width and height to the grid with a minimum of 24 px, and write `setSize` and `setPosition` in one batch; Alt+Shift with the arrows SHALL resize from the keyboard by one grid step. Groups without `place` and `size` SHALL have no resize handles.

#### Scenario: Move two boxes
- **WHEN** `api` and `db` are selected and dragged by one grid step
- **THEN** one edit changes both `place` statements and one undo restores them

#### Scenario: Drag a box into a group
- **WHEN** top-level `box c` is dragged so that its centre lands inside the placed group `g` (interior origin at (116, 120)) at drawn centre (200, 180)
- **THEN** the text declares `c` inside `group g { … }` with `place c at (84, 60)`, in one undo step

#### Scenario: Drag a box out of its group
- **WHEN** `api`, a child of `backend`, is dragged so that its centre lands outside every group
- **THEN** `api` is declared at the top level with its `place` in diagram coordinates

#### Scenario: Alt keeps the parent
- **WHEN** top-level `box c` is dragged over `g` with Alt held
- **THEN** only `place c` changes and `c` stays at the top level

#### Scenario: Nudge inside a group
- **WHEN** `api`, a child of `backend`, is nudged with the arrow keys
- **THEN** only `place api` changes and `backend`'s block is unchanged

### Requirement: Creating and connecting
The palette SHALL create a node, decision, data store, note, tag or group, by drag and drop or by keyboard (N, D, S, O, T, G) at the centre of the viewport, snapped to a free grid cell:

- the new element SHALL go inside the group under the drop point, groups included, so groups nest;
- it SHALL get a generated id (`node1`, `decision1`, …) and a `place`, with a `size` for groups;
- it SHALL then be selected with its label ready to edit.

The box button (free) and the node button (flow) SHALL be split buttons: the main part SHALL arm the tool with the canvas's current shape (`rounded` until one is chosen) and show its picture; the arrow part SHALL open a grid of the twenty-two shapes with a picture and a name each, and choosing one SHALL make it current and arm the tool. The ghost SHALL take the shape's default size and outline, and the drop or click SHALL create the element with `style <id> { shape <value> }` in the same edit (no style for `rounded`). B and N SHALL create the current shape near the centre. F SHALL open the grid from the keyboard on free and flow diagrams: the arrows move through it, typing filters the shapes by their name in the interface language or in English, Enter creates the highlighted shape near the centre and makes it current, and Escape closes it. The arrow parts SHALL be hidden and F SHALL do nothing when the canvas is read-only.

Dragging from a connection handle to another box SHALL create a relation (`->`; `-->` with Shift). Dropping on a point of the target's border SHALL also fix both ends, the handle's side at 50 % and the dropped point, in a `route`; dropping further inside the target SHALL create the relation alone. Hovering within 8 screen pixels outside any box's border SHALL show the point a connection would start from; dragging from there to another box SHALL create the relation with its start pinned to that point and its end pinned when dropped on the target's border. For a box drawn with a non-rectangular shape, the border, the magnets (the shape's vertices and side midpoints; no corners on ellipses) and the previewed point SHALL follow the shape's outline, while the written `route` keeps the side and percentage form. "Connect to…" (C) SHALL offer the other elements in a filtered list. The palette's arrow button SHALL be a split button whose menu lists the four arrow kinds `->`, `-->`, `<->` and `<-->` with pictures; choosing one SHALL make it current and arm the relation tool. The relation tool (R) SHALL create a relation of the current kind from the first clicked element to the second, Escape cancelling and Shift on the second click flipping solid and dashed; while the tool is armed, R again SHALL cycle to the next kind, named in the status line. Connection handles keep creating `->` (`-->` with Shift).

#### Scenario: Create a data store
- **WHEN** the data store tool is dropped at (420, 260) with a 14 px grid in a `manual` diagram
- **THEN** the text gains `data1[("Data")]` and `place data1 at (420, 266)`, and `data1` is selected

#### Scenario: Create a hexagon from the box button
- **WHEN** the arrow of the box button is pressed on a free diagram, `hexagon` is chosen and the stage is clicked at (420, 260), then B is pressed
- **THEN** the text gains `box box1 "Box"`, `style box1 { shape hexagon }` and `place box1 at (420, 266)` in one undo step, then `box box2 "Box"` with `style box2 { shape hexagon }` near the centre, and the box button shows the hexagon

#### Scenario: Shape from the keyboard
- **WHEN** F is pressed on a flow diagram, `sta` is typed and Enter is pressed
- **THEN** the text gains `node1["Node"]`, `style node1 { shape star }` and a `place` near the centre, and the grid closes

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

### Requirement: Property inspector
The inspector SHALL begin with the style strip (swatches, picker, inherit, line, width, corner radius, shape, route, corners, start and end heads, effects and speed, and the theme row for the diagram) and SHALL then show the fields of the diagram when nothing is selected, of one element, of one relation, or the style fields shared by several selected items:

- **diagram**: title, description, direction, layout, routing, theme, preset;
- **element**: id, kind, label, description, classes, ports, inside (the parent group, or none), position, size and every style property that applies to its kind: Shape, shown with a picture per value, for free boxes and flow nodes; Corner radius, a number from 0 to 64 with a slider, only where the radius is drawn: `rounded` boxes and nodes, notes, the frames of free texts, icons and images, and groups, with the radius drawn (a rule's or a class's, else the theme's `radius`, or `groupRadius` for a group) greyed as the default; a box or node drawn with another shape has no Corner radius field;
- **relation**: id, label, ends and ports, line (solid, dashed or dotted), routing, corners, start and end heads, classes, style properties and label position.

Each change SHALL be one edit plan: `setDiagramProperty`, `setStyleProperty`, `setElementLabel`, `setDescription`, `setElementKind`, `setRelationLine`, `setClasses`, `addPort`, `removePort`, `setPosition`, `setSize`, `setRoute` or `moveElement`; a change to several selected items SHALL be one batch plan. Fields SHALL show the written value or, greyed, the default.

#### Scenario: Change a colour shared by a style
- **WHEN** `style api, db { fill "#eef" }` exists and the inspector sets the fill of `api` to `accent`
- **THEN** the statement becomes `style db { fill "#eef" }` and `style api { fill accent }` is added

#### Scenario: Width for a selection
- **WHEN** `api` and `db` are selected and the strip sets the width to 2
- **THEN** one undo step gives both `width 2`

#### Scenario: Shape by its picture
- **WHEN** box `a` is selected and the `ellipse` picture of the Shape field is chosen
- **THEN** the text gains `style a { shape ellipse }`

#### Scenario: Corner radius of a group
- **WHEN** group `g` is selected and the Corner radius slider is set to 0
- **THEN** the text gains `style g { radius 0 }`, and the field showed 14 greyed before the change under `technical.light`

#### Scenario: No corner radius where none is drawn
- **WHEN** a free box with `style b { shape rectangle }`, or a flow node with `style h { shape hexagon }`, is selected
- **THEN** neither the strip nor the inspector shows a Corner radius field, while a `rounded` box or node shows it with the theme's `radius` greyed

#### Scenario: Inside field
- **WHEN** top-level `box c` is selected and `g` is chosen in the Inside field
- **THEN** `c` is declared inside `group g` and keeps its drawn position

#### Scenario: Radius typed out of range
- **WHEN** 90 is typed in the Corner radius field
- **THEN** the field refuses it and the text is unchanged
