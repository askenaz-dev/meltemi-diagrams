# diagram-canvas Specification

## Purpose
The canvas session and its pure helpers: renders and stale states, viewport, minimap, grid, snapping and guides, selection, gestures, creation and connection, clipboard, grouping, alignment, route editing, the inspector and keyboard operation, each action becoming one edit of the text.
## Requirements
### Requirement: Canvas session and protocol
`CanvasSession` SHALL hold the current analysis, the chosen diagram and the selection. `update(analysis)` SHALL produce host messages:

- **`render`**: revision, diagrams, chosen diagram, mode, SVG, geometry and selection;
- **`stale`**: problem count and first problem, while the last render stays shown;
- **`empty`**: the file has no flow diagram.

`receive(message)` SHALL answer each canvas message with an edit plan, a rejection or new state, and SHALL reject messages whose revision is not current with `edit.stale-revision`. Every incoming message SHALL pass `isCanvasMessage`, which checks shape, finite numbers and known kinds.

#### Scenario: Stale gesture
- **WHEN** a move gesture arrives with revision 4 while the document is at revision 5
- **THEN** it is rejected with `edit.stale-revision` and the current render is sent again

#### Scenario: Errors keep the last render
- **WHEN** a rendered diagram gets a syntax error
- **THEN** the session sends `stale` with the problem count, the webview keeps the last picture dimmed, and gestures are refused until the error is fixed

### Requirement: Viewport, zoom, pan and minimap
The canvas helpers SHALL map screen points to diagram points through `pan + zoom × (point + offset)`:

- `zoomAt` SHALL keep the point under the pointer fixed and clamp the zoom between 10 % and 800 %;
- `zoomStep` SHALL walk the presets 10, 25, 50, 75, 100, 125, 150, 200, 300, 400 and 800 %;
- `fitViewport` and `fitSelection` SHALL fit with a 24 px margin and at most 100 %;
- `keepOrigin` SHALL compensate a change of offset between renders;
- `minimapViewport` SHALL give the scale of the content in a 200 × 140 box and the rectangle of the visible area, and SHALL map a point of the minimap back to a pan.

#### Scenario: Zoom around the pointer
- **WHEN** the zoom goes from 100 % to 200 % with the pointer over the diagram point (300, 200)
- **THEN** that point is under the pointer before and after

#### Scenario: Minimap pan
- **WHEN** the user clicks the centre of the minimap
- **THEN** the viewport is centred on the centre of the content

### Requirement: Grid, snapping and guides
The grid SHALL default to 14 px (`meltemi.canvas.grid`) and SHALL be drawn over the whole workspace, with every fourth line stronger. When lines would be closer than 6 screen pixels, only the strong lines SHALL be drawn. `resolveMove` SHALL snap the primary box first to guides, then to the grid:

- **guides**: an edge or centre of another box within 6 screen pixels;
- **grid**: the centre of the primary box to the nearest grid line.

The guides used SHALL be returned for drawing. Alt SHALL disable snapping and guides and round to whole pixels.

#### Scenario: Centre on the grid
- **WHEN** a 160 × 56 box centred on (100, 100) is dragged by (30, 9) with a 14 px grid and no other box near
- **THEN** its new centre is (126, 112)

#### Scenario: Guide wins over grid
- **WHEN** another box's top edge is 3 screen pixels from the dragged box's top edge
- **THEN** the dragged box's top edge aligns with it and the guide is returned

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

### Requirement: Dragging in automatic mode materialises the layout
A gesture that changes geometry in a `layout auto` diagram SHALL be preceded, in the same batch, by `arrange` with scope `all` and the current positions. The diagram then becomes `layout assisted` with every box placed, and only the boxes the gesture moved change position on screen.

#### Scenario: First drag in auto
- **WHEN** `api` is dragged by (28, 0) in a `layout auto` diagram of four boxes without `place` statements
- **THEN** the text gains `layout assisted` and four `place` statements, `api`'s is 28 px right of its arranged position, the other three boxes keep their positions, and one undo restores the original text

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

### Requirement: Deleting with dependency detection
Delete SHALL plan `removeElement` without cascade for the selected elements and `removeRelation` for the selected relations. When removal is refused with dependents, the canvas SHALL list them in a dialog that the keyboard can operate, and SHALL cascade only after confirmation.

#### Scenario: Confirm a cascade
- **WHEN** `db` is used by one relation and one `place` and Delete is pressed
- **THEN** the dialog lists the two statements, and confirming deletes the declaration, the relation and the `place` in one undo step

### Requirement: Clipboard
Copy SHALL put a complete `.meltemi` fragment on the clipboard. It SHALL hold:

- the selected declarations, with groups and their children;
- the relations among them;
- their placement statements;
- their styles, rebuilt for the copied targets.

Paste SHALL compile the fragment, rename clashing ids with a suffix `_2`, `_3`, …, offset the places by two grid steps (or to the pointer for a context-menu paste), and insert it with `insertFragment`. Duplicate SHALL copy and paste. Cut SHALL copy, then remove with cascade. Text that is not a fragment SHALL paste nothing and show a status message.

#### Scenario: Duplicate a pair
- **WHEN** `api` and `db` with `api -> db as save` are selected and Ctrl+D is pressed
- **THEN** the text gains `api_2`, `db_2` and `api_2 -> db_2 as save_2`, placed 28 px right and below, and the copies are selected

### Requirement: Grouping, aligning and distributing
Alt+G SHALL group the selected sibling elements with `groupElements`, and Alt+Shift+G SHALL ungroup the selected group with `ungroup`. The toolbar, the context menu and the keyboard SHALL do the following, writing the positions in one batch:

- align the selection's left, centre, right, top, middle or bottom edges to the extreme box, or to the centre of the selection for centres;
- distribute three or more boxes with equal gaps horizontally or vertically.

#### Scenario: Distribute
- **WHEN** three boxes 160 px wide are centred at x 100, 200 and 500 and are distributed horizontally
- **THEN** the middle one moves to x 300 and the others stay

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

### Requirement: Property inspector
The inspector SHALL begin with the style strip (swatches, picker, inherit, line, width, corner radius, rotation, shape, icon position, route, corners, start and end heads, effects and speed, and the theme row for the diagram) and SHALL then show the fields of the diagram when nothing is selected, of one element, of one relation, or the style fields shared by several selected items:

- **diagram**: title, description, direction, layout, routing, theme, preset;
- **element**: id, kind, label, description, classes, ports, inside (the parent group, or none), position, size and every style property that applies to its kind: Shape, shown with a picture per value, for free boxes and flow nodes; Corner radius, a number from 0 to 64 with a slider, wherever the radius is drawn: `rounded`, `rectangle`, `square` and `framed` boxes and nodes, the polygon shapes and decisions, persons and agents, notes, the frames of free texts, icons and images, and groups, with the radius drawn (a rule's or a class's, else the theme's `radius` for `rounded` boxes, notes and frames, `groupRadius` for a group, the body radius for persons and agents, 0 for the others) greyed as the default; an ellipse, a circle, a pill, a cylinder, a cloud or a document has no Corner radius field; Rotation, a number from 0 to 359 with a slider, for the elements of flow diagrams and free compositions other than groups, with 0 greyed; Icon (thumbnail, name, Choose… opening the icon picker, and Remove) for the elements and relations that draw an icon; Icon position (five pictures) and Icon size (a number from 8 to 128 with a slider, the drawn size greyed as the default, an **auto** choice and Clear) for nodes, decisions, data stores and boxes; Icon position for C4 entities too, without `center`, which they draw as `top`; and Label position (four pictures) when the icon is the centre piece (`iconPosition center` or `shape icon`);
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

#### Scenario: Icon position by its picture
- **WHEN** node `api` with an icon is selected and the `right` picture of the Icon position field is chosen
- **THEN** the text gains `style api { iconPosition right }`

#### Scenario: Icon position of a C4 entity
- **WHEN** container `shop.web` with an icon is selected on a C4 container view
- **THEN** the Icon position field offers the `left`, `right`, `top` and `bottom` pictures and no `center`

#### Scenario: Label position appears with a centred icon
- **WHEN** node `db` with `style db { icon "tabler:database"; iconPosition center }` is selected
- **THEN** the inspector shows Label position with `bottom` greyed, and choosing `top` writes `labelPosition top`

#### Scenario: Icon size auto
- **WHEN** the Icon size slider of `db` is set to 48 and then **auto** is chosen
- **THEN** the text gains `iconSize 48`, then `iconSize auto`

#### Scenario: Corner radius of a group
- **WHEN** group `g` is selected and the Corner radius slider is set to 0
- **THEN** the text gains `style g { radius 0 }`, and the field showed 14 greyed before the change under `technical.light`

#### Scenario: No corner radius where none is drawn
- **WHEN** a free box with `style b { shape ellipse }`, or a flow node with `style h { shape circle }`, is selected
- **THEN** neither the strip nor the inspector shows a Corner radius field, while a `rounded` box or node shows it with the theme's `radius` greyed, and a `rectangle` box or a `hexagon` node shows it with 0 greyed

#### Scenario: Inside field
- **WHEN** top-level `box c` is selected and `g` is chosen in the Inside field
- **THEN** `c` is declared inside `group g` and keeps its drawn position

#### Scenario: Radius typed out of range
- **WHEN** 90 is typed in the Corner radius field
- **THEN** the field refuses it and the text is unchanged

#### Scenario: Rotation field
- **WHEN** node `api` is selected and 30 is typed in the Rotation field, then group `g` is selected
- **THEN** the text gains `style api { rotation 30 }`, and the inspector of `g` shows no Rotation field

### Requirement: Keyboard operation and focus
Every pointer action SHALL have a keyboard alternative, as listed in decision 0017 and the editor guide. Focus SHALL be visible on every control and on the focused element. Elements SHALL expose their kind and label to assistive technology. A live region SHALL announce the selection and the result of each action. The canvas SHALL not use keys that VS Code binds globally (Ctrl+G, Ctrl+Shift+G, Ctrl+K chords, Ctrl+Alt with the arrows, Alt with Left or Right, Ctrl+Alt+B), and SHALL leave undo and redo to VS Code; the inspector's fold has its header and rail buttons on every canvas and the host's own chord where the host binds one.

#### Scenario: Keyboard only
- **WHEN** a user tabs into the canvas, selects `api` with Tab, nudges it with Shift+Right and presses Delete then confirms
- **THEN** each step has a visible focus indicator and an announcement, and the text changes as with the pointer

#### Scenario: Ctrl+Alt+B reaches the host
- **WHEN** the stage has the focus and Ctrl+Alt+B is pressed
- **THEN** the canvas handles nothing and does not prevent the event, which reaches the host's page; in the playground that page folds the properties

### Requirement: Two-way selection
Selecting on the canvas SHALL reveal the first selected id in the text without taking focus. Moving the text cursor SHALL highlight the element or relation of the statement under it on the canvas.

#### Scenario: Cursor in a placement statement
- **WHEN** the text cursor is inside `place db at (700, 180)`
- **THEN** the canvas highlights `db`

### Requirement: Canvas colours from the theme
Each render SHALL carry the canvas colours of the diagram's resolved theme: `selection`, else
`accent`, and `guide`, else `accent`. Selection outlines, handles, wires, the rubber band, the point a dragged end will take
and the point a connection would start from SHALL use the selection colour; alignment guides, the
outline of the box under a dragged end or near the pointer and its magnets SHALL use the guide
colour. Keyboard focus rings and the panels SHALL keep the editor's colours.

#### Scenario: Blue theme, blue outlines
- **WHEN** a diagram uses `technical.light`, whose `accent` is blue, and no theme sets `selection` or `guide`
- **THEN** the outline drawn around `db` while an end is dragged over it is the theme's `accent`

#### Scenario: Colours set in the theme
- **WHEN** the diagram's theme sets `selection "#0B6BCB"` and `guide "#16A34A"`
- **THEN** selection handles are `#0B6BCB` and alignment guides are `#16A34A`

### Requirement: Element libraries panel
The canvas SHALL offer a Libraries panel for flow and free diagrams (a toolbar toggle with the tooltip "Libraries (U)" and the key U) with a search box, the placement control of the icon picker (**Icon**, **In a box**, free diagrams **Only the icon**; the same choice as the picker's) and the libraries the document knows, each with its categories; a category SHALL list its elements with a 24 px thumbnail and the label. Clicking an element SHALL create it at the centre of the view and dragging it onto the canvas SHALL create it where it is dropped, labelled as the element, with `style <id> { icon "<pack>:<name>" }` and, for the **Icon** placement, `shape icon`, then selected; dragging it onto a node, decision, data store or box SHALL highlight the target and write only its icon. Search SHALL match labels, names and keywords across the libraries and show up to 60 elements. Thumbnails of a pack still loading SHALL be asked for again when a later render arrives.

#### Scenario: Create from a library
- **WHEN** "AWS Lambda" of the AWS library's Compute category is clicked in a flow diagram with the placement **Icon**
- **THEN** the text gains `lambda1["AWS Lambda"]` followed by `style lambda1 { icon "aws:lambda"; shape icon }`, and `lambda1` is selected

#### Scenario: Create in a box
- **WHEN** the placement **In a box** is chosen and the same element is clicked
- **THEN** the text gains `lambda1["AWS Lambda"]` followed by `style lambda1 { icon "aws:lambda" }`

#### Scenario: Drop onto a node
- **WHEN** "AWS Lambda" is dragged from the panel onto `api` and released
- **THEN** the text gains `style api { icon "aws:lambda" }` and no element is created

#### Scenario: Search across libraries
- **WHEN** `postgres` is typed in the panel's search box
- **THEN** the Technology library's PostgreSQL element is listed

### Requirement: Other people's selections
The canvas SHALL accept a `presence` host message with people (name, colour, selected element
ids, and a pointer `{ x, y }` in diagram units when the person's pointer is over their canvas)
and draw, on a layer above the scene, a coloured outline with a name tag around each element
another person has selected, and a cursor glyph in the person's colour with the name tag at its
tail at each pointer, the name set as a text node; the cursor SHALL move to a new position
with a 200 ms transition and SHALL scale with the scene, so that it points at the same place
at every zoom; the layer SHALL be neither selectable nor exported, SHALL clear when the message
carries nobody or the canvas shows another file, SHALL draw nothing while a story plays, and
SHALL ignore ids the scene does not hold and pointers that are not two finite numbers.

#### Scenario: Outline with a name
- **WHEN** the host sends `presence` with Ben selecting `api`
- **THEN** `api` shows an outline in Ben's colour with the tag `Ben`, and clicking it selects `api` for the person, not Ben's outline

#### Scenario: A cursor with a name
- **WHEN** the host sends `presence` with Ben's pointer at `(120, 80)` and then at `(220, 80)`
- **THEN** a cursor in Ben's colour tagged `Ben` is drawn at the first point and glides to the second, and a click through it reaches the element under it

#### Scenario: A cursor at every zoom
- **WHEN** the canvas is zoomed to 50% and the host sends Ben's pointer at `(120, 80)`
- **THEN** the cursor's tip is at the scene point `(120, 80)` and the glyph keeps its size on screen

#### Scenario: Unknown element
- **WHEN** the message names an id the scene lacks, or a pointer with `NaN`
- **THEN** nothing is drawn for it and no error is raised

#### Scenario: A name holding markup
- **WHEN** the message carries the name `<img src=x>` selecting `api` with a pointer
- **THEN** both tags show those characters and the layer holds no element made from them

#### Scenario: Not exported
- **WHEN** the SVG is exported while a cursor is drawn
- **THEN** the SVG holds no cursor, tag or name

### Requirement: Containers on the canvas
The group button SHALL be a split button: its main part SHALL arm the tool with the canvas's current kind of group (**Group** until one is chosen) and show its picture; its arrow part SHALL open a menu of two kinds with a picture and a name each, **Group** (a band with a title) and **Container** (an untitled group, a plain container), and choosing one SHALL make it current and arm the tool. G SHALL create the current kind near the centre; Alt+G SHALL keep grouping the selection with a title. A container SHALL be created with `createElement` as a group with the label `""`, its `place` and its `size`, inside the group under the drop point, with no style written, and SHALL then be selected without opening the label editor.

The context menu of a flow node or a free box, and a **Convert to container** button under **Inside** in the inspector, SHALL run `convertToContainer` with the boxes stacked on the element (whole inside its box, declared after it, on its layer) as children, their free places in the new interior, and the element's drawn size; the status line SHALL name the container and its children. When a drop leaves a moved element stacked on a node or box of its layer that is not a group, the status line SHALL say so and name the conversion, writing nothing.

When an arrange cannot be made because the diagram has layout errors, the status line SHALL say that the problems must be fixed first and give the first message, instead of doing nothing.

#### Scenario: Create a container
- **WHEN** the arrow of the group button is pressed on a flow diagram, **Container** is chosen and the stage is clicked at (420, 260) with a 14 px grid, then G is pressed
- **THEN** the text gains `group group1 "" { }`, `place group1 at (420, 266)` and a `size group1` in one undo step, then `group group2 "" { }` with a place and a size near the centre, no label editor opens, and the group button shows the container

#### Scenario: Convert a square with a database on it
- **WHEN** `node3` is a flow node with `shape square`, a fill and `size node3 (238, 196)`, `db` is declared after it and drawn whole inside it, and **Convert to container** is chosen on `node3`
- **THEN** the text declares `group node3 "" { db[("Database")] }`, `style node3 { … }` keeps the fill and gains `radius 0` without `shape`, `place node3` and `size node3` are unchanged, `api -> db` still resolves, the status line says `node3` is now a container holding `db`, and dragging `node3` moves `db` with it

#### Scenario: Refused conversion
- **WHEN** **Convert to container** is chosen on a node that declares `port in west`
- **THEN** the text is unchanged and the status line says the ports must be removed first

#### Scenario: A drop that stacks
- **WHEN** `db` is dropped whole inside the box of `node3`, a node with `shape square` that is not a group
- **THEN** `db` keeps its parent, its `place` is written where it was dropped, and the status line says `db` is stacked on `node3` and that converting `node3` to a container moves them together

#### Scenario: Refused arrange
- **WHEN** **Recompute Layout** is chosen on an `assisted` diagram holding a placed and sized group without children inside another group, which `auto` cannot draw (`layout.missing-placement`)
- **THEN** nothing is written and the status line says the problems of the diagram must be fixed before arranging it, with that message

### Requirement: Rotating on the canvas
On a canvas that edits, one selected element of a flow diagram or a free composition that takes `rotation` SHALL show a rotation handle: a disc beyond its top-right corner, in the element's own frame, joined to the corner by a short line and clear of the resize and connection handles, appearing with the selection. Dragging it SHALL turn the element about the centre of its box: the angle is the element's angle at the press plus the change of the pointer's bearing about the centre since the press, snapped to 15° steps unless Alt is held, shown in the status line and beside the pointer; nothing SHALL turn until the pointer has moved past the drag threshold (3 px on screen), and a press released before that SHALL write nothing; the element, its selection and its connectors SHALL follow live. Releasing SHALL write `style <id> { rotation <n> }` (0 to 359), or remove it at 0, in one undo step; Escape SHALL cancel and restore the drawing.

A turned element SHALL be selected, hit, marquee-selected and dropped onto by its turned outline; its selection frame, resize handles and connection handles SHALL be drawn turned with it; resizing it SHALL work in its own frame, keeping the opposite edge where it was in the diagram, without grid snapping; its magnets and the points pinned by dragging a connector end onto it SHALL lie on its turned outline and be written as `side n%` in its own frame; the inline text editor SHALL be turned with its text. The context menu SHALL offer **Rotate 90°**, which adds 90 to the angle modulo 360, and **Reset rotation**, which removes it, each disabled where it changes nothing or the element takes no rotation.

The handle SHALL fade in with the selection. While dragging, the live rotation SHALL follow the pointer on every frame without easing, as the SVG `transform` of the element's group, and the drawn element, its selection outline and the angle badge SHALL show the same angle about the same centre at every moment, including after a live preview answers and when a preview is refused. In a diagram with `layout auto` a rotation preview or drop SHALL materialise the arrangement first, as moves do, so the turned element keeps its centre. On release the element SHALL ease into the written angle over `--mdg-motion-fast`, with the transitions dropped under `prefers-reduced-motion`.

#### Scenario: Rotate with the handle
- **WHEN** node `api` placed at (200, 120) is selected and its rotation handle is dragged a quarter turn clockwise about its centre
- **THEN** the status line names 90° and the angle shows beside the pointer, the element is drawn turned while dragging, and the release gives `style api { rotation 90 }` in one undo step, after which the status line says `api` turned to 90°

#### Scenario: A press with jitter writes nothing
- **WHEN** the rotation handle of an upright node is pressed, the pointer moves 2 px and is released
- **THEN** nothing turns, no `rotation` is written and the node is still upright

#### Scenario: The outline and the drawing agree
- **WHEN** the handle of node `api` is dragged through 45° and a live preview answers during the drag
- **THEN** at every frame the element's group and the selection outline are turned by the same angle about the same centre, and the badge shows that angle

#### Scenario: Rotate in an automatic layout
- **WHEN** node `api` of a diagram with `layout auto` is turned to 30° with the handle
- **THEN** the arrangement is written first, `api` keeps its centre during the drag and after the drop, and the text gains `style api { rotation 30 }` in the same undo step

#### Scenario: A refused preview keeps the drawing turned
- **WHEN** a rotation preview is refused while the handle is held at 60°
- **THEN** the drawing stays turned at 60° with its outline, and releasing writes `rotation 60`

#### Scenario: Free angle with Alt
- **WHEN** the handle is dragged with Alt held through 37° about the centre and released
- **THEN** the text gains `rotation 37`

#### Scenario: Escape restores
- **WHEN** the handle is being dragged and Escape is pressed
- **THEN** nothing is written and the element is drawn as before

#### Scenario: Select a turned element by its outline
- **WHEN** square `s` of 120 × 120 has `rotation 45` and the pointer clicks a corner of its unturned box that lies outside the turned square
- **THEN** `s` is not selected

#### Scenario: Resize a turned element
- **WHEN** node `api` with `rotation 90` is resized by dragging its turned east handle outward by 40 px in its own frame
- **THEN** `size api` grows 40 px wide, `place api` moves 20 px along the turned east direction, and the turned west edge stays where it was

#### Scenario: Pin an end on a turned element
- **WHEN** a connector's end is dragged onto the middle of the turned north side of node `api` with `rotation 90`
- **THEN** the route is written as `api.north 50%`

#### Scenario: Rotate 90° from the context menu
- **WHEN** node `api` with `rotation 300` is selected and **Rotate 90°** is chosen
- **THEN** the text gains `rotation 30` in place of 300

#### Scenario: No handle on a group or in read-only canvases
- **WHEN** a group, or an element of a read-only canvas, is selected
- **THEN** no rotation handle is drawn

### Requirement: Empty file and new diagrams
When the document has no diagram and no story is playing, the canvas SHALL show the reason and one button per kind it can create — flow diagram, free composition, sequence diagram — and SHALL clear the diagram selector, the inspector, the minimap and the layout and stale badges of the last render. A button SHALL write `diagram <id>: <type> { }` through `createDiagram` and show the new diagram. A **New diagram** button beside the diagram selector SHALL offer the same kinds for any file. Read-only canvases SHALL show neither the buttons nor the New diagram button.

#### Scenario: Start from an empty file
- **WHEN** the text is emptied and the Flow diagram button is pressed
- **THEN** the text becomes `language "0.2"`, a blank line and `diagram diagram1: flow {` … `}`, the canvas shows the empty diagram with its palette, and the selector names `diagram1`

#### Scenario: Nothing stale is left
- **WHEN** a file showing `overview` is emptied
- **THEN** the selector, the inspector, the minimap and the layout badge no longer show `overview`

#### Scenario: Another diagram in the file
- **WHEN** New diagram › Free composition is chosen in a file declaring `overview`
- **THEN** `diagram diagram1: free {` … `}` is appended after `overview` and shown

#### Scenario: Read-only
- **WHEN** the canvas is read-only and the file has no diagram
- **THEN** the reason is shown without buttons

### Requirement: Canvas size in the inspector
The diagram inspector SHALL show a **Canvas** field with fit to content, document, slide and custom, and, for custom, a width and a height from 100 to 10000. Choosing SHALL write `preset document`, `preset slide` or `canvas (w, h)` and remove the other statement in the same plan, or remove both for fit to content. Custom SHALL start from the drawn size of the content.

#### Scenario: A slide
- **WHEN** Canvas › Slide is chosen for a diagram with `canvas (800, 600)`
- **THEN** the text has `preset slide` and no `canvas` statement, in one undo step

#### Scenario: A custom size
- **WHEN** Canvas › Custom is chosen and the width is set to 1600 and the height to 900
- **THEN** the text has `canvas (1600, 900)` and no `preset`

#### Scenario: Out of range
- **WHEN** 50 is typed as the width
- **THEN** the field refuses it with the range and the text is unchanged

### Requirement: Visible split buttons
The arrow part of the box/node button and of the relation button SHALL be a visible dropdown control: a chevron in the foreground colour, at least 16 px wide and as tall as the button, inside one outline shared with the main part, with hover and keyboard focus states and a tooltip naming its menu and key ("More shapes (F)", "Kinds of arrow (R cycles)", in the interface language). A right-click or a press longer than 450 ms on the main part SHALL open the same menu; a short click SHALL still arm the tool.

#### Scenario: Long press
- **WHEN** the box button is pressed for half a second and released
- **THEN** the shapes grid is open and no tool is armed

#### Scenario: Short click
- **WHEN** the box button is clicked
- **THEN** the box tool is armed with the current shape and no menu opens

### Requirement: Live preview of moves and resizes
While boxes of a flow diagram, a free composition or a C4 view are dragged or resized, the canvas SHALL send `preview` messages carrying the move or resize the drop would send, at most one awaiting an answer, the latest gesture first. The session SHALL plan it as the drop would, apply it to a copy of the text without writing, recording history or changing the revision, lay out the shown diagram and answer with its drawing, or with none when the action would be refused or the copy has errors. The canvas SHALL show the answered drawing, keeping the dragged boxes under the pointer, so connectors, labels and groups follow during the gesture; Escape or a refused drop SHALL bring back the last drawing.

#### Scenario: A connector follows a dragged box
- **WHEN** `api` with `client -> api` is dragged 200 px right and the pointer is still pressed
- **THEN** the stage draws the connector of `client -> api` ending at `api`'s new position, and the text is unchanged

#### Scenario: Escape restores
- **WHEN** the same drag is cancelled with Escape
- **THEN** the stage shows the drawing from before the drag and nothing is written

#### Scenario: A group grows with its child
- **WHEN** a child of an unsized free group is resized larger
- **THEN** the group's drawing grows during the gesture as it will after the drop

#### Scenario: Refused preview
- **WHEN** a preview carries a move of a group into a group it holds, which the session refuses
- **THEN** the answer has no drawing and the canvas keeps moving the boxes alone

### Requirement: Icon picker
The canvas SHALL offer one icon picker, a popover anchored to what opened it: the I tool on flow and free diagrams, the inspector's Icon field, and the context menu's **Icon…**. It SHALL hold a search field focused on open, results as the query is typed (`searchIcons`), grouped by pack or library with a 24 px thumbnail and a name each, the typed `pack:name` first when it names an icon, and keyboard navigation (arrows, Enter chooses, Escape closes and returns focus). I SHALL open the picker from the canvas, and close it while the canvas has the focus; in the search field I SHALL be typed like any other letter, and the icon button SHALL open and close the picker. An empty query SHALL show the icons chosen earlier in this canvas session, then the project's own packs (one group per pack, named by `assets/libraries/project.json` when it names them), then the Technology library's first category. On C4 views only the Icon field SHALL open it, with the packs' icons (the first Tabler icons for an empty query, after the project's packs) and no placement control. The picker's footer SHALL offer **Add icon…** on a canvas that edits a project (see `custom-icons`): it SHALL open the Add icon dialog, and the icons added SHALL join Recent and, when nothing was selected, the first SHALL be chosen as a click on it in the picker would choose it.

With elements selected that take icons, choosing SHALL write `style <id> { icon "<reference>" }` on each in one batch and close. Without a selection the picker SHALL show a placement control with pictures — **Icon** (`shape icon`, label below), **In a box** (the current shape with the icon beside the text) and, on free diagrams, **Only the icon** (an `icon` object) — kept in memory while the canvas is open, and choosing SHALL arm a tool whose ghost shows the icon: a click on empty canvas or a drop creates the element with an empty label, a click on a node, decision, data store or box gives that shape the icon and creates nothing, and Enter in the picker creates the element at the centre. Results SHALL be draggable onto the stage: over a node, decision, data store or box the target is highlighted like a move's drop target and the drop writes only its icon; over empty space the drop creates as the tool does. The context menu of an element with an icon SHALL offer **Remove icon** (`setStyleProperty icon null`). Read-only canvases SHALL not open the picker.

#### Scenario: Icon for the selection
- **WHEN** `api` and `db` are selected, I is pressed, `server` is typed and the Tabler server icon is chosen
- **THEN** one undo step gives both `style … { icon "tabler:server" }`, and the picker is closed

#### Scenario: Icon as the shape from the tool
- **WHEN** nothing is selected on a flow diagram, I is pressed, `lambda` is typed, "AWS Lambda" is chosen with the placement **Icon** and the stage is clicked at (420, 260)
- **THEN** the text gains `node1[""]`, `style node1 { icon "aws:lambda"; shape icon }` and `place node1 at (420, 266)`, in one undo step

#### Scenario: Icon in a box from the tool
- **WHEN** the placement **In a box** is chosen and the same icon is dropped at (420, 260)
- **THEN** the text gains `node1[""]` and `style node1 { icon "aws:lambda" }` without a `shape`

#### Scenario: Drop onto an existing box
- **WHEN** a result of the picker is dragged over `db` and released
- **THEN** `db` was highlighted while the pointer was over it, the text gains `style db { icon "…" }` and nothing else changes

#### Scenario: Remove an icon
- **WHEN** **Remove icon** is chosen in the context menu of `db`, which has `style db { icon "tabler:database"; fill "#eef" }`
- **THEN** the statement becomes `style db { fill "#eef" }`

#### Scenario: The armed tool on a shape
- **WHEN** nothing is selected, I is pressed, the Tabler server icon is clicked in the results and `db` is clicked on the stage
- **THEN** the text gains `style db { icon "tabler:server" }`, no element is created and the tool is no longer armed

#### Scenario: I in the search field
- **WHEN** I is pressed on a flow diagram and then I again
- **THEN** the picker stays open with `i` in its search field, and a press on the icon button closes it

#### Scenario: Read-only
- **WHEN** the canvas is read-only and I is pressed
- **THEN** nothing opens

#### Scenario: The project's packs for an empty query
- **WHEN** the project has `assets/icons/brand/logo.svg` and `assets/icons/brand/pin.svg`, I is pressed and nothing is typed
- **THEN** the results show Recent (when any), then a `brand` group with `brand:logo` and `brand:pin`, then the Technology library's first category

#### Scenario: Add icon from the picker
- **WHEN** nothing is selected, I is pressed, **Add icon…** is chosen and `pin.svg` is added to `project`
- **THEN** the icon tool is armed with `project:pin`, the status line says it was added and how to place it, a click on the stage creates a node with that icon, and the picker lists it among the recent icons

#### Scenario: Add icon refuses an unsafe file
- **WHEN** **Add icon…** is chosen and the picked `bad.svg` holds a `<script>`
- **THEN** the dialog shows the file refused naming `script`, nothing is written, and the picker is unchanged

#### Scenario: No Add icon outside a project
- **WHEN** the picker opens for a single `.meltemi` file opened without a project
- **THEN** the footer shows no **Add icon…**

### Requirement: Motion and finish
Every popover, menu, panel, tooltip and transient outline of the canvas SHALL open, close and move with transitions on shared motion tokens (`--mdg-motion-fast` 120 ms, `--mdg-motion` 160 ms, `--mdg-motion-slow` 220 ms, `--mdg-ease`): popovers and menus (the icon picker, the shapes grid, the arrow and New diagram menus, the context menu, the head grids) fade and rise from their anchor on opening and fade on closing; side panels slide in; tooltips fade after a short hover delay; drop and connect target outlines and the inline editor's outline fade in; buttons and chips transition their colours. Under `prefers-reduced-motion: reduce` every duration SHALL be zero and no transform SHALL animate.

#### Scenario: A menu opens with a transition
- **WHEN** the arrow of the box button is pressed
- **THEN** the shapes grid is rendered with a transition of 160 ms on its opacity and transform, and is interactive at once

#### Scenario: Reduced motion
- **WHEN** the system asks for reduced motion and the same arrow is pressed
- **THEN** the grid appears without a transition

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

### Requirement: Pointer tool
The canvas SHALL offer a Pointer tool as a toolbar toggle (tooltip "Pointer (K)") and the key K, on every canvas that shows a diagram, read-only ones included: K or the button turns it on and off, Escape turns it off, and arming any creation or relation tool turns it off. While it is on, the canvas SHALL select, move, resize, create, connect, edit and open nothing from the pointer: a press and drag SHALL draw a trail on the presence layer, 3 px wide with round caps and joins, tapering to 1 px over its last points, each point fading out 800 ms after its own moment, in the theme's `accent` or, when the host shares presence and names the person's colour, in that colour; a point of the trail SHALL be kept in diagram units, so a pan or a zoom keeps the trail on the diagram; the cursor over the stage SHALL be a dot in the trail's colour; wheel zoom, Space-drag and middle-button pan SHALL keep working; double clicks, the right button and the context-menu key SHALL open nothing; the status line SHALL announce the tool on and off. The trail SHALL be no part of the SVG, of any export or of the HTML views. The tool SHALL write nothing and SHALL work when the canvas is read-only (its command is a view command). Under `prefers-reduced-motion: reduce` the points SHALL not fade: the trail is the stroke drawn so far, removed at once when the pointer lifts. The state SHALL not be persisted. K typed in the inline label editor or in a picker's search field SHALL stay text and SHALL not touch the tool.

#### Scenario: Point without editing
- **WHEN** K is pressed on a flow canvas, the pointer is pressed on `api`, dragged 80 px and released
- **THEN** `api` is not selected, no `place` changes, the inline editor is not open, the status line said the pointer is on, and a trail of 3 px width in the theme's accent is drawn on the presence layer and gone within a second

#### Scenario: Nothing opens while pointing
- **WHEN** the pointer is on and `api` is double-clicked, then right-clicked, then Shift+F10 is pressed
- **THEN** no inline editor and no context menu opens, and the document is unchanged

#### Scenario: Escape and K put it away
- **WHEN** the pointer is on and Escape is pressed, then K twice
- **THEN** after Escape the toggle reads not pressed and a press on `api` selects it; after the first K the pointer is on and after the second it is off

#### Scenario: Pan and zoom while pointing
- **WHEN** the pointer is on, Space is held while dragging, then Ctrl+wheel turns
- **THEN** the view pans, then zooms, and no trail is drawn by the pan

#### Scenario: On a read-only canvas
- **WHEN** the canvas is read-only and K is pressed
- **THEN** the pointer turns on, the status line announces it without the "view only" refusal, and a drag draws a trail

#### Scenario: Not exported
- **WHEN** the SVG is exported while a trail is drawn
- **THEN** the SVG holds no trail, no canvas element and nothing of the presence layer

#### Scenario: Reduced motion
- **WHEN** the system asks for reduced motion and a stroke is drawn and released
- **THEN** the whole stroke stays drawn until the pointer lifts, and then nothing of it remains on the next frame

#### Scenario: Arming a tool puts the pointer away
- **WHEN** the pointer is on and N is pressed on a flow canvas, or a palette button is pressed to arm a tool
- **THEN** the pointer is off, N creates a node and an armed tool is waiting for its click

#### Scenario: K while typing a label
- **WHEN** the inline label editor of `api` is open and `k` is typed
- **THEN** the letter joins the label, the pointer stays off and no trail is drawn

### Requirement: Pointer trails of others
The `presence` host message SHALL accept, on each person, a `laser` batch `{ batch, points }` (`batch` an integer that grows with each batch of that person; `points` at most 64 entries `{ x, y, t }`, `x` and `y` in diagram units within the pointer bound, `t` an integer 0..1000 in milliseconds since the batch's first point) and an optional `me: { colour }` naming the person's own presence colour. The canvas SHALL append the points of a batch it has not drawn (by the person's cursor key and `batch`) to that person's trail, each point `t` ms after the batch arrived, drawn in the person's colour with the same width, taper and fade as the person's own trail, and SHALL draw nothing for a batch it has already drawn, a batch that does not fit the bounds, or a person without a pointer key. The canvas SHALL post `presenceLaser { points, diagram? }` to a host that shares presence while a stroke is drawn, at most every 50 ms, with the points added since the last post and `t` since the batch's first point, never to a host that does not share presence, and never as a message that writes the document. The trails SHALL clear with the presence layer (another file, nobody present, a story playing).

#### Scenario: A peer's trail
- **WHEN** the host sends `presence` with Ben's pointer at `(120, 80)` and a `laser` batch of ten points from `(120, 80)` to `(220, 80)` with `t` 0..200
- **THEN** a trail in Ben's colour appears point by point over 200 ms from the first point to the last, and fades within 800 ms of its last point

#### Scenario: The same batch twice
- **WHEN** the host sends the same `presence` message again with Ben's batch 7 unchanged
- **THEN** no point is drawn again

#### Scenario: A batch that does not fit
- **WHEN** the message carries a batch of 65 points, or a point with `t` 5000, or `x` `NaN`
- **THEN** nothing of that batch is drawn and no error is raised, and the person's cursor is still drawn

#### Scenario: The person's own colour
- **WHEN** the host sends `presence` with `me: { colour: "#e03131" }` and the pointer draws a stroke
- **THEN** the trail and the dot cursor are `#e03131`, and after a `presence` message without `me` they are the theme's accent again

#### Scenario: Points posted to the host
- **WHEN** a host that has sent `presence` sees a 300 ms stroke drawn with the pointer
- **THEN** it receives `presenceLaser` messages at most every 50 ms whose points together are the stroke, each batch's `t` starting at 0, and a host that never sent `presence` receives none

### Requirement: Collapsible inspector
The property inspector SHALL be headed by a row holding its title and a fold button (**Hide the properties panel**, `aria-expanded="true"`, `aria-controls` naming the panel), and SHALL fold to a 36 px rail holding one button (**Show the properties panel**, `aria-expanded="false"`, `aria-controls` naming the panel) that unfolds it. The fold button, the rail's button, the toolbar's **Show the properties** toggle (`aria-pressed`) and the host's `setInspectorCollapsed` SHALL all change the one kept state `PersistedState.inspector`, so the toggle and the panel always agree; a kept value that is not a boolean SHALL read as the host's `CanvasSettings.inspector`. The theme panel SHALL fold with the inspector, its head holding the same fold button, and SHALL come back when the inspector unfolds. There SHALL be no rail and no panel without a diagram or while a story plays. Folding from inside the panel SHALL move the focus to the rail's button; unfolding SHALL put it on the panel. The panel's width SHALL change over `--mdg-motion-slow`, the rail fading in after `--mdg-motion-fast`, and none of it under reduced motion; the canvas SHALL keep its viewport (no fit, no zoom) as the stage grows or shrinks. The fold SHALL write nothing to the document and SHALL work on a read-only canvas, whose fields stay disabled. When the host names a key for the fold (`CanvasHostApi.keys.inspector`), the titles of the toggle, the fold button and the rail's button SHALL end in that key in parentheses; otherwise they SHALL be the names alone.

#### Scenario: Fold from the header and keep it
- **WHEN** the header's **Hide the properties panel** button is pressed and the canvas is reloaded with its kept state
- **THEN** the panel is a 36 px rail with one button **Show the properties panel** (`aria-expanded="false"`), the toolbar's **Show the properties** toggle reads `aria-pressed="false"`, the stage's transform is what it was, and after the reload the panel is still a rail

#### Scenario: The rail unfolds and focuses the panel
- **WHEN** the rail's button is pressed
- **THEN** the panel is 260 px wide with its title, its fields and the header button `aria-expanded="true"`, the toggle reads `aria-pressed="true"`, and the panel has the focus

#### Scenario: The toolbar toggle and the panel agree
- **WHEN** the panel is open and the toolbar's **Show the properties** toggle is pressed, then pressed again
- **THEN** the panel is a rail after the first press and open after the second, the toggle's `aria-pressed` following each time

#### Scenario: Folding from a field moves the focus
- **WHEN** the Title field of the inspector has the focus and the header button is pressed
- **THEN** the rail's button has the focus and the field is not reachable until the panel unfolds

#### Scenario: The theme panel folds too
- **WHEN** a theme is being edited in the theme panel and its head's fold button is pressed, then the rail's button
- **THEN** the rail stands where the theme panel was, and after the unfold the theme panel is back with the same theme

#### Scenario: No rail without a diagram or during a story
- **WHEN** the file has no diagram, or a story is playing
- **THEN** neither the panel nor the rail is shown, and the toggle is hidden while the story plays as today

#### Scenario: A read-only canvas folds without writing
- **WHEN** the canvas is read-only, the header button is pressed and the rail's button is pressed
- **THEN** the panel folds and unfolds, its fields are disabled as before, and the host receives no action

#### Scenario: Motion on the tokens
- **WHEN** the panel folds
- **THEN** the panel's computed transition on its width is 0.22 s, the rail becomes visible after 0.12 s, and under `prefers-reduced-motion: reduce` both are 0 s

#### Scenario: A kept value that is not a boolean
- **WHEN** the host's kept state holds `"inspector": "no"` and the host's setting is `true`
- **THEN** the canvas opens with the panel shown and the toggle `aria-pressed="true"`, and the next fold writes a boolean `false`

#### Scenario: The host names the key
- **WHEN** the host passes `keys: { inspector: "Ctrl+Alt+B" }`
- **THEN** the toggle's title is "Show the properties (Ctrl+Alt+B)", its `aria-label` "Show the properties", its `aria-keyshortcuts` "Control+Alt+B", the header button's title "Hide the properties panel (Ctrl+Alt+B)" and the rail's "Show the properties panel (Ctrl+Alt+B)"

#### Scenario: No key, or an empty one, from the host
- **WHEN** the host passes no `keys`, or `keys: { inspector: "" }`
- **THEN** the three titles are the names alone, and none of the three has `aria-keyshortcuts`

### Requirement: Tooltips of icon-only controls
Every icon-only button, toggle, chip and split arrow of the toolbar and the panels SHALL have an accessible name that says what it does without naming a key, a `title` equal to that name followed by the key in parentheses when the control has one (shown by the canvas's bubble 400 ms after the pointer rests, the control keeping its `title`), and `aria-keyshortcuts` holding the key as ARIA writes it ("L", "Shift+1", "Control+Alt+B") when it has one; a toggle SHALL keep one name and `aria-pressed`, except a control whose effect flips, which SHALL be named per state. The palette's tools SHALL be named by the tool and its use ("Node: click on the canvas"; "Node, rounded: click on the canvas" for a shaped tool; "Icon: find one for the selection or to place" for the icon tool) and titled by the tool and its key once ("Node (N)", "Node, rounded (N)", "Icon (I)"); the split arrows SHALL be named by their menu ("More shapes", "Kinds of arrow", "Group or container") and keep the tooltip the requirement "Visible split buttons" names ("More shapes (F)", "Kinds of arrow (R cycles)"). Each pane control of the canvas (the properties toggle, the fold button, the rail's button) SHALL draw the same glyph, a frame with a bar at the right holding two rows, which no other control of the canvas or of a host page draws. Every word SHALL exist in English and Spanish.

#### Scenario: The layers toggle
- **WHEN** the toolbar is drawn
- **THEN** the layers toggle's `aria-label` is "Show the layers", its title "Show the layers (L)" and its `aria-keyshortcuts` "L"; in Spanish "Mostrar las capas", "Mostrar las capas (L)" and "L"

#### Scenario: The palette says the key once
- **WHEN** a flow diagram is open
- **THEN** the node tool's `aria-label` is "Node: click on the canvas", its title "Node (N)" and its `aria-keyshortcuts` "N", and after `hexagon` is chosen in the shapes grid its name is "Node, hexagon: click on the canvas" and its title "Node, hexagon (N)"; the icon tool's `aria-label` is "Icon: find one for the selection or to place", its title "Icon (I)"; the shapes arrow's `aria-label` is "More shapes", its title "More shapes (F)" and its `aria-keyshortcuts` "F"

#### Scenario: The bubble after the pointer rests
- **WHEN** the pointer rests on the header's fold button
- **THEN** no bubble shows at once, the bubble shows its title within a second, and when the pointer leaves the button still has its `title`

#### Scenario: The Spanish key words
- **WHEN** the interface language is Spanish and the toolbar is drawn
- **THEN** the fit button's title is "Ajustar el diagrama a la vista (Mayús+1)" and its `aria-keyshortcuts` "Shift+1"

#### Scenario: A control without a title is caught
- **WHEN** a toolbar button is drawn with an `aria-label` and no `title`
- **THEN** the webview suite's check that every toolbar button has a label and a title fails naming the button

### Requirement: Editing a pen stroke
A pen SHALL be caught by its stroke (within 6 screen pixels of its drawn path) and by a selection rectangle that contains its bounds, and SHALL be skipped by a press on the stage that hits nothing else only when it is not under the pointer. Selected, it SHALL show its bounds as the frame with the eight resize handles, and no rotation, connection, point or label handles. Dragging it by its stroke, or the arrow keys, SHALL move every point (`setPenPoints`, one undo step, the grid not applied); a resize handle SHALL scale the points about the opposite side or corner (Shift keeping the proportions, the bounds at least 4 units) and the outline SHALL follow the pointer at every frame. Enter, F2 and a double click SHALL do nothing on a pen (it has no text), Shift+F2 SHALL rename its id, Delete SHALL remove it with its styles and animations, copying and Duplicate SHALL shift its points as a line's, alignment and distribution SHALL leave it out, and the element SHALL tell assistive technology it is a stroke with its point count.

#### Scenario: Selected by its stroke
- **WHEN** the stage is pressed on the path of `pen1` and released
- **THEN** `pen1` is selected, its frame is its bounds, eight resize handles show and no rotation handle

#### Scenario: Moved by its stroke
- **WHEN** `pen1` is dragged by its stroke 30 to the right
- **THEN** every point of `pen pen1 [...]` is 30 greater in x, in one undo step, and nothing snapped

#### Scenario: Scaled
- **WHEN** the south-east handle of `pen1` is dragged so its bounds double in width and height
- **THEN** every point is mapped about the north-west corner, the path is twice as large, and one undo restores it

#### Scenario: Nudged and deleted
- **WHEN** Right is pressed with `pen1` selected and then Delete
- **THEN** every point moves 1 to the right, and the pen with its `style pen1 { … }` is gone

#### Scenario: A double click on a stroke
- **WHEN** `pen1` is double-clicked
- **THEN** no editor opens and the selection is unchanged

### Requirement: Strokes of others
The `presence` host message's `laser` batch MAY carry `pen: { width, colour, opacity, stroke, cancel? }` (`width` 1 to 64, `colour` a string of at most 32 characters, `opacity` 0 to 1, `stroke` an integer from 0 to 2,147,483,647 numbering the person's strokes, `cancel` true when the stroke was cancelled). The canvas SHALL draw the batches of one `stroke` as one stroke in that width, colour and opacity on the presence layer, growing as its points arrive and not fading and never joined to the person's previous stroke, whether or not the person's pointer is still shown, SHALL drop it at once on its `cancel` batch, and SHALL otherwise keep it until a `render` host message arrives after its last batch or ten seconds pass, whichever comes first; a batch whose `pen` part does not fit SHALL be dropped whole. While a stroke is drawn with the pen or the highlighter, the canvas SHALL post `presenceLaser` with the same `pen` part to a host that shares presence, at the pointer's cadence, with a new `stroke` number for each stroke, and SHALL post a batch with `cancel` when Escape cancels the stroke.

#### Scenario: A peer's stroke grows
- **WHEN** the host sends `presence` with Ben's `laser` batch of ten points and `pen: { width: 4, colour: "#e03131", opacity: 1 }`, then a second batch of ten more
- **THEN** a 4 px red stroke is drawn through the first ten points, then through all twenty, and it is still drawn after two seconds

#### Scenario: The stroke gives way to the document
- **WHEN** a `render` host message arrives after Ben's last batch
- **THEN** Ben's presence stroke is gone and the rendered scene holds his pen

#### Scenario: A pen part that does not fit
- **WHEN** a batch carries `pen: { width: 900, colour: "#e03131", opacity: 1 }`
- **THEN** nothing of that batch is drawn and Ben's cursor is still drawn

#### Scenario: Posted while drawing
- **WHEN** a host that has sent `presence` sees a 300 ms stroke drawn with the highlighter
- **THEN** it receives `presenceLaser` messages at most every 50 ms whose `pen` part is `{ width: 20, colour: "<the highlight colour>", opacity: 0.35 }`

