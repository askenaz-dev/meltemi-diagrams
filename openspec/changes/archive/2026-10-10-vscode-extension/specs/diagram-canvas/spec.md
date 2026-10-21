## ADDED Requirements

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

- click, plus Shift- or Ctrl-click to add and remove;
- a selection rectangle that selects the boxes fully inside it;
- select all (Ctrl+A) and clear (Escape);
- Tab and Shift+Tab through elements in source order;
- Ctrl with the arrows to the nearest element in that direction.

The selection SHALL be kept across renders, and ids that disappear SHALL be dropped.

#### Scenario: Keyboard traversal
- **WHEN** `client`, `api` and `db` are declared in that order, `api` is selected and Tab is pressed
- **THEN** `db` is selected and scrolled into view

### Requirement: Moving, nudging and resizing
A move SHALL be one batch of `setPosition` for every selected element, every placed descendant of a selected group, and every selected group that has a `place`, by the delta of `resolveMove`. Arrow keys SHALL nudge by 1 px, or by one grid step with Shift. A resize SHALL keep the opposite edges, snap width and height to the grid with a minimum of 24 px, and write `setSize` and `setPosition` in one batch; Alt+Shift with the arrows SHALL resize from the keyboard by one grid step. Groups without `place` and `size` SHALL have no resize handles.

#### Scenario: Move two boxes
- **WHEN** `api` and `db` are selected and dragged by one grid step
- **THEN** one edit changes both `place` statements and one undo restores them

### Requirement: Dragging in automatic mode materialises the layout
A gesture that changes geometry in a `layout auto` diagram SHALL be preceded, in the same batch, by `arrange` with scope `all` and the current positions. The diagram then becomes `layout assisted` with every box placed, and only the boxes the gesture moved change position on screen.

#### Scenario: First drag in auto
- **WHEN** `api` is dragged by (28, 0) in a `layout auto` diagram of four boxes without `place` statements
- **THEN** the text gains `layout assisted` and four `place` statements, `api`'s is 28 px right of its arranged position, the other three boxes keep their positions, and one undo restores the original text

### Requirement: Creating and connecting
The palette SHALL create a node, decision, data store, note, tag or group, by drag and drop or by keyboard (N, D, S, O, T, G) at the centre of the viewport, snapped to a free grid cell:

- the new element SHALL go inside the group under the drop point;
- it SHALL get a generated id (`node1`, `decision1`, …) and a `place`, with a `size` for groups;
- it SHALL then be selected with its label ready to edit.

Dragging from a connection handle to another box SHALL create a relation (`->`; `-->` with Shift). "Connect to…" (C) SHALL offer the other elements in a filtered list.

#### Scenario: Create a data store
- **WHEN** the data store tool is dropped at (420, 260) with a 14 px grid in a `manual` diagram
- **THEN** the text gains `data1[("Data")]` and `place data1 at (420, 266)`, and `data1` is selected

#### Scenario: Connect with the keyboard
- **WHEN** `api` is selected, C is pressed and `db` is chosen
- **THEN** the text gains `api -> db`

### Requirement: Editing text in place
Enter or F2 on an element or relation, or a double-click, SHALL open an inline input over it. Committing SHALL write `setElementLabel` or `setRelationLabel`; Escape SHALL cancel. Shift+F2 SHALL rename the id with `renameElement` or `renameRelation`.

#### Scenario: Edit a label
- **WHEN** the label of `api` is edited to `Orders API` and committed
- **THEN** only the label string of `api`'s declaration changes

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
A selected relation SHALL show its bends, the midpoints of its segments and its two ends as handles:

- dragging a bend SHALL move it, snapped to the grid;
- dragging a midpoint SHALL insert a bend;
- double-clicking a bend SHALL remove it;
- dragging an end onto a side or a named port of the same box SHALL change that port;
- dropping an end on another box SHALL reconnect the relation with `reconnectRelation`.

Anonymous relations SHALL first be named with `materializeRelationId`. The route kind SHALL be chosen in the inspector or the context menu and written as the relation's `routing` style.

#### Scenario: Add a bend
- **WHEN** the midpoint of the straight route of `create` is dragged 56 px down
- **THEN** the text gains `route create from api.east to orders.west via [(x, y)]` with the bend at the snapped point

### Requirement: Property inspector
The inspector SHALL show the fields of the diagram when nothing is selected, of one element, of one relation, or the style fields shared by several selected items:

- **diagram**: title, description, direction, layout, routing, theme, preset;
- **element**: id, kind, label, description, classes, ports, position, size and every style property;
- **relation**: id, label, ends and ports, line, routing, arrowhead, style properties and label position.

Each change SHALL be one edit plan: `setDiagramProperty`, `setStyleProperty`, `setElementLabel`, `setDescription`, `setElementKind`, `setRelationLine`, `addPort`, `removePort`, `setPosition`, `setSize` or `setRoute`. Fields SHALL show the written value or, greyed, the default.

#### Scenario: Change a colour shared by a style
- **WHEN** `style api, db { fill "#eef" }` exists and the inspector sets the fill of `api` to `accent`
- **THEN** the statement becomes `style db { fill "#eef" }` and `style api { fill accent }` is added

### Requirement: Keyboard operation and focus
Every pointer action SHALL have a keyboard alternative, as listed in decision 0017 and the editor guide. Focus SHALL be visible on every control and on the focused element. Elements SHALL expose their kind and label to assistive technology. A live region SHALL announce the selection and the result of each action. The canvas SHALL not use keys that VS Code binds globally (Ctrl+G, Ctrl+Shift+G, Ctrl+K chords, Ctrl+Alt with the arrows, Alt with Left or Right), and SHALL leave undo and redo to VS Code.

#### Scenario: Keyboard only
- **WHEN** a user tabs into the canvas, selects `api` with Tab, nudges it with Shift+Right and presses Delete then confirms
- **THEN** each step has a visible focus indicator and an announcement, and the text changes as with the pointer

### Requirement: Two-way selection
Selecting on the canvas SHALL reveal the first selected id in the text without taking focus. Moving the text cursor SHALL highlight the element or relation of the statement under it on the canvas.

#### Scenario: Cursor in a placement statement
- **WHEN** the text cursor is inside `place db at (700, 180)`
- **THEN** the canvas highlights `db`
