## ADDED Requirements

### Requirement: Icon picker
The canvas SHALL offer one icon picker, a popover anchored to what opened it: the I tool on flow and free diagrams, the inspector's Icon field, and the context menu's **Icon…**. It SHALL hold a search field focused on open, results as the query is typed (`searchIcons`), grouped by pack or library with a 24 px thumbnail and a name each, the typed `pack:name` first when it names an icon, and keyboard navigation (arrows, Enter chooses, Escape closes and returns focus). I SHALL open the picker from the canvas, and close it while the canvas has the focus; in the search field I SHALL be typed like any other letter, and the icon button SHALL open and close the picker. An empty query SHALL show the icons chosen earlier in this canvas session, then the Technology library's first category. On C4 views only the Icon field SHALL open it, with the packs' icons (the first Tabler icons for an empty query) and no placement control.

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

### Requirement: Motion and finish
Every popover, menu, panel, tooltip and transient outline of the canvas SHALL open, close and move with transitions on shared motion tokens (`--mdg-motion-fast` 120 ms, `--mdg-motion` 160 ms, `--mdg-motion-slow` 220 ms, `--mdg-ease`): popovers and menus (the icon picker, the shapes grid, the arrow and New diagram menus, the context menu, the head grids) fade and rise from their anchor on opening and fade on closing; side panels slide in; tooltips fade after a short hover delay; drop and connect target outlines and the inline editor's outline fade in; buttons and chips transition their colours. Under `prefers-reduced-motion: reduce` every duration SHALL be zero and no transform SHALL animate.

#### Scenario: A menu opens with a transition
- **WHEN** the arrow of the box button is pressed
- **THEN** the shapes grid is rendered with a transition of 160 ms on its opacity and transform, and is interactive at once

#### Scenario: Reduced motion
- **WHEN** the system asks for reduced motion and the same arrow is pressed
- **THEN** the grid appears without a transition

## MODIFIED Requirements

### Requirement: Creating and connecting
The palette SHALL create a node, decision, data store, note, tag or group, by drag and drop or by keyboard (N, D, S, O, T, G) at the centre of the viewport, snapped to a free grid cell, and an icon (I) through the icon picker:

- the new element SHALL go inside the group under the drop point, groups included, so groups nest;
- it SHALL get a generated id (`node1`, `decision1`, …) and a `place`, with a `size` for groups;
- nodes, decisions, data stores and boxes SHALL be written with an empty label and selected without opening the label editor; notes, tags and free texts SHALL get their default text and open the label editor; groups SHALL get their default title.

The box button (free) and the node button (flow) SHALL be split buttons: the main part SHALL arm the tool with the canvas's current shape (`rounded` until one is chosen) and show its picture; the arrow part SHALL open a grid of the twenty-four shapes with a picture and a name each, and choosing one SHALL make it current and arm the tool. Choosing `icon`, by a click or with Enter, SHALL instead open the icon picker with the **Icon** placement to place a new element, since an icon shape needs its icon, and SHALL leave the current shape and the tools as they were. The ghost SHALL take the shape's default size and outline, and the drop or click SHALL create the element with `style <id> { shape <value> }` in the same edit (no style for `rounded`). B and N SHALL create the current shape near the centre. F SHALL open the grid from the keyboard on free and flow diagrams: the arrows move through it, typing filters the shapes by their name in the interface language or in English, Enter creates the highlighted shape near the centre and makes it current, and Escape closes it. The arrow parts SHALL be hidden and F SHALL do nothing when the canvas is read-only.

Dragging from a connection handle to another box SHALL create a relation (`->`; `-->` with Shift). Dropping on a point of the target's border SHALL also fix both ends, the handle's side at 50 % and the dropped point, in a `route`; dropping further inside the target SHALL create the relation alone. Hovering within 8 screen pixels outside any box's border SHALL show the point a connection would start from; dragging from there to another box SHALL create the relation with its start pinned to that point and its end pinned when dropped on the target's border. For a box drawn with a non-rectangular shape, the border, the magnets (the shape's vertices and side midpoints; no corners on ellipses) and the previewed point SHALL follow the shape's outline, while the written `route` keeps the side and percentage form; an element drawn with `shape icon` SHALL use its icon's square, not its label. "Connect to…" (C) SHALL offer the other elements in a filtered list. The palette's arrow button SHALL be a split button whose menu lists the four arrow kinds `->`, `-->`, `<->` and `<-->` with pictures; choosing one SHALL make it current and arm the relation tool. The relation tool (R) SHALL create a relation of the current kind from the first clicked element to the second, Escape cancelling and Shift on the second click flipping solid and dashed; while the tool is armed, R again SHALL cycle to the next kind, named in the status line. Connection handles keep creating `->` (`-->` with Shift).

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
