## MODIFIED Requirements

### Requirement: Icon picker
The canvas SHALL offer one icon picker, a popover anchored to what opened it: the I tool on flow and free diagrams, the inspector's Icon field, and the context menu's **Icon…**. It SHALL hold a search field focused on open, results as the query is typed (`searchIcons`), grouped by pack or library with a 24 px thumbnail and a name each, the typed `pack:name` first when it names an icon, and keyboard navigation (arrows, Enter chooses, Escape closes and returns focus). I SHALL open the picker from the canvas, and close it while the canvas has the focus; in the search field I SHALL be typed like any other letter, and the icon button SHALL open and close the picker. An empty query SHALL show the icons chosen earlier in this canvas session, then the project's own packs (one group per pack, named by `assets/libraries/project.json` when it names them), then the Technology library's first category. On C4 views only the Icon field SHALL open it, with the packs' icons (the first Tabler icons for an empty query, after the project's packs) and no placement control. The picker's footer SHALL offer **Add icon…** on a canvas that edits a project (see `custom-icons`): it SHALL open the Add icon dialog, and the icons added SHALL join Recent and, when nothing was selected, be chosen in the picker.

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
- **THEN** the picker shows `project:pin` chosen with the placement control, and a click on the stage creates a node with that icon

#### Scenario: Add icon refuses an unsafe file
- **WHEN** **Add icon…** is chosen and the picked `bad.svg` holds a `<script>`
- **THEN** the dialog shows the file refused naming `script`, nothing is written, and the picker is unchanged

#### Scenario: No Add icon outside a project
- **WHEN** the picker opens for a single `.meltemi` file opened without a project
- **THEN** the footer shows no **Add icon…**
