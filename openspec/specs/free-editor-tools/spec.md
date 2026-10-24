# free-editor-tools Specification

## Purpose
Canvas and language-service support for free diagrams: the free palette with icon and image pickers, z-order and layers, interior coordinates in canvas edits, conversion from the canvas, and completion, hover, definitions and quick fixes for free statements.
## Requirements
### Requirement: Free palette and pickers
On a free diagram the canvas palette SHALL offer box (B; a split button whose arrow opens the shapes grid, also opened with F), text (T), icon (I; the icon picker), image (M), group (G), the arrow tool (R; a split button with the six relation kinds of `quick-styling`'s "Relation tool": `->`, `-->`, `--`, `---`, `<->` and `<-->`) and connect (C). On a flow diagram it SHALL offer the flow kinds as before, with T creating a tag, the node button split the same way (N, F), the same arrow button and the same icon picker (I). Boxes SHALL be created with an empty label and without opening the label editor; texts SHALL be created with their default text and open it.

- **Icon.** The I tool SHALL open the canvas's icon picker (see `diagram-canvas`): a search across the packs and the libraries, with a placement control — the icon as the shape (`shape icon`), the icon in a box, or, in free diagrams only, just the icon (`icon <id> "<reference>"`). Once an icon is chosen, a click on empty canvas SHALL place the element and a click on a box SHALL give that box the icon.
- **Image.** The host SHALL ask for an image file and SHALL create `image <id> "<path>"` with the path relative to the `.meltemi` file. A file outside the project SHALL be refused with a message.
- **Shapes.** The grid SHALL show a picture and a name for each of the twenty-four shapes, in the interface language, SHALL find a shape as its name is typed, and SHALL create the box or node with `style <id> { shape <value> }`; the chosen shape stays current for B, N and the button's main part. Choosing `icon` SHALL instead open the icon picker with the **Icon** placement, without making `icon` current, since an icon shape needs its icon.

#### Scenario: Create a text
- **WHEN** the text tool is dropped at (300, 100) on a free diagram
- **THEN** the text gains `text text1 "Text"` and `place text1 at (300, 98)` (snapped to the 14 px grid), and the label editor opens

#### Scenario: Create an empty box
- **WHEN** B is pressed on a free diagram
- **THEN** the text gains `box box1 ""` and a `place` near the centre, `box1` is selected and no label editor is open

#### Scenario: Just the icon
- **WHEN** I is pressed on a free diagram, **Only the icon** is chosen in the placement control, `server` is typed and the Tabler server icon is chosen with Enter
- **THEN** the text gains `icon icon1 "tabler:server"` and a `place` near the centre

#### Scenario: Create a star on a flow diagram
- **WHEN** F is pressed on a flow diagram, `sta` is typed and Enter is pressed
- **THEN** the text gains `node1[""]`, `style node1 { shape star }` and a `place` near the centre, and N then creates another star

#### Scenario: The icon shape opens the picker
- **WHEN** the arrow of the box button is pressed on a free diagram and `icon` is chosen
- **THEN** the icon picker opens with the placement **Icon**, nothing is written, and B still creates a `rounded` box

#### Scenario: Shapes hidden when read-only
- **WHEN** the canvas is read-only
- **THEN** the split buttons show no arrow part and F does nothing

#### Scenario: Dashed arrow kind
- **WHEN** the arrow button's menu is opened on a free diagram, `-->` is chosen, and `a` then `b` are clicked
- **THEN** the text gains `a --> b`

### Requirement: Order and layers on the canvas
The canvas SHALL offer bring to front (Ctrl+Shift+]), send to back (Ctrl+Shift+[), bring forward (Ctrl+]) and send backward (Ctrl+[) in the keyboard map and the context menu, each one `reorderElement`. The inspector SHALL show a Layer field for elements and relations of free and flow diagrams, with the declared layers, and a Layers field for the diagram.

#### Scenario: Bring to front
- **WHEN** `a` is declared before `b` in the same block and `a` is brought to front
- **THEN** `a`'s declaration moves after `b`'s, and `a` is drawn above `b`

### Requirement: Interior coordinates in canvas edits
For children of groups in free diagrams, the session SHALL write positions relative to the parent's interior origin from `LayoutResult.origins`, which for an untitled group lies `groupPadding` below its top edge. This SHALL hold for moves, nudges, creations inside a group, reparenting drops, alignment, distribution, pastes and arrangements.

- Moving a group SHALL write only the group's `place`.
- Resizing a group from its left or top edge SHALL shift its children's places by the opposite amount, so they stay where they are drawn.
- Copying a child whose group is not copied SHALL carry its drawn position.
- A reparenting drop SHALL write the moved element's `place` in the new parent's interior so it stays where it was dropped.

#### Scenario: Move a child
- **WHEN** child `a` of group `g` (interior origin at (116, 120)) is drawn centred at (196, 150) and is moved by (14, 0)
- **THEN** the text gains `place a at (94, 30)`

#### Scenario: Move a group
- **WHEN** group `g` with two placed children is moved by (28, 14)
- **THEN** only `place g` changes

#### Scenario: Child of an untitled group
- **WHEN** `group g ""` is placed at (300, 200) with size (400, 240) and its child `a` is created at drawn centre (200, 150)
- **THEN** the text gains `place a at (84, 54)`, measured from the interior origin (116, 96)

### Requirement: Convert to free composition in the editor
The canvas toolbar, the context menu and the command palette SHALL offer **Convert to Free Composition** for flow diagrams. It SHALL apply `convertToFree` and switch the canvas to the new diagram.

#### Scenario: Convert from the canvas
- **WHEN** the command runs on the checkout canvas
- **THEN** the document gains `checkout_free` and the canvas shows it

### Requirement: Language services for free diagrams
Completion SHALL offer:

- the free kinds;
- `shape` with its twenty-two values, in free diagrams and on flow nodes; `radius`, `fontSize`, `fontWeight` and `textAlign` with their values;
- `layers` and `layer` with the declared layers;
- `link` with `<diagram>.<element>` targets;
- image paths of the project's image files inside `image "…"`.

Hover SHALL describe the new kinds, the shapes, `radius` and links. Go to definition on a link SHALL open the linked element. Quick fixes SHALL declare an unknown layer and remove an unknown link.

#### Scenario: Definition of a link
- **WHEN** go to definition runs on `api` in `link checkout.api`
- **THEN** the result is the declaration of `api` in `diagram checkout`

#### Scenario: Completion of shapes on a flow node
- **WHEN** completion runs after `shape ` inside `style api { }` of a flow diagram
- **THEN** the items include `hexagon`, `cloud` and `person`

#### Scenario: No text properties on a flow node
- **WHEN** completion runs inside `style api { }` of a flow diagram
- **THEN** the items include `shape` and `radius` and exclude `fontSize`

### Requirement: Layers panel
The canvas SHALL offer a Layers panel for flow and free diagrams (a toolbar toggle and the key L) listing the layers from front to back with how many elements and relations each holds. The panel SHALL add a layer (`layer<n>`, appended before `main`, through `setDiagramProperty layers`), rename one (`renameLayer`, which rewrites `layers` and every `layer` statement of the diagram; `main` cannot be renamed, a taken name is refused), remove one (its elements and relations go back to `main`, then `layers` loses it), move one up or down, hide or show it on the canvas without writing anything, and move the selection to it (`setElementProperty layer` for each element and relation). Hidden layers SHALL be left out of rectangle and keyboard selection, and hiding SHALL be kept with the canvas's state per diagram.

#### Scenario: Add and rename a layer
- **WHEN** Add is pressed in the panel of a diagram without `layers` and the new layer is renamed `back`
- **THEN** the text gains `layers back, main`

#### Scenario: Move the selection to a layer
- **WHEN** `band` is selected and "Move to back" is chosen
- **THEN** `band`'s block gains `layer back`, and the panel shows one element on `back`

#### Scenario: Remove a layer
- **WHEN** `back` holding `band` is removed
- **THEN** `band` loses `layer back` and the `layers` statement goes, in one undo step

### Requirement: Line kinds and free lines in the palette
On flow and free diagrams the arrow button's menu SHALL list the six kinds of "Relation tool" with their pictures (`--` and `---` drawn without heads), a choice making the kind current and arming the tool, and R while armed SHALL cycle through the six. On a free diagram, a press of the armed relation tool on empty canvas that moves past the drag threshold SHALL draw a line: a ghost from the press point to the pointer, both snapped to the grid, constrained to 45° steps with Shift, and the release SHALL create `line <id> from (x, y) to (x, y)` with a generated id (`line1`, `line2`, …) and no label, inside the group under the press point with its points in that group's interior, plus the styles of the current kind in the same edit: none for `--`; `line dashed` for `---`; `arrowhead <head>` for `->`; `line dashed; arrowhead <head>` for `-->`; `arrowtail <head>; arrowhead <head>` for `<->`; the same with `line dashed` for `<-->`, where `<head>` is the effective theme's `arrowhead` token. The new line SHALL be selected and the status line SHALL say so. A press on an element SHALL keep the two-click sequence of the tool, a press on empty canvas released before the threshold SHALL keep today's prompt, and on a flow diagram a press on empty canvas SHALL draw nothing. Escape during the drag SHALL cancel it.

#### Scenario: Draw a line
- **WHEN** the relation tool is armed with `->` on a free diagram under `technical.light`, the empty canvas is pressed at (98, 98) and the pointer is released at (294, 98) with a 14 px grid
- **THEN** the text gains `line line1 from (98, 98) to (294, 98)` and `style line1 { arrowhead triangle }` in one undo step, `line1` is selected, and the status line says a line was drawn

#### Scenario: A dashed line without heads
- **WHEN** the kind `---` is current and a line is drawn
- **THEN** the text gains `line line1 from … to …` and `style line1 { line dashed }`, and with `--` no style is written

#### Scenario: Two-way under an editorial theme
- **WHEN** the diagram uses `editorial.light`, the kind `<->` is current and a line is drawn
- **THEN** the text gains `style line1 { arrowtail open; arrowhead open }`

#### Scenario: Inside a group
- **WHEN** a line is drawn starting inside the placed group `g`
- **THEN** `line line1` is declared inside `g`'s block with its points in `g`'s interior coordinates

#### Scenario: A press on a box still connects
- **WHEN** the relation tool is armed and `api` is pressed and the pointer moves 40 px before release
- **THEN** no line is created, `api` is the relation's source, and clicking `db` creates `api -> db`

#### Scenario: Nothing on a flow diagram
- **WHEN** the relation tool is armed on a flow diagram and the empty canvas is pressed and dragged 100 px
- **THEN** no line is created and the status line asks for the element to start from

#### Scenario: Escape cancels the ghost
- **WHEN** a line is being drawn and Escape is pressed
- **THEN** nothing is written and the ghost disappears

### Requirement: Services for lines and alignment
Completion SHALL offer `line` among the free kinds in a free body, `from`, `to` and `via` in their places of a `line` statement, `verticalAlign` with `top`, `middle` and `bottom` among the free style properties, and the element ids after every relation token. Hover SHALL describe a line with its kind, label, points (from the parent's interior) and layer, and `verticalAlign` with one line from the reference. Go to definition and references SHALL resolve a line's id from `style`, `animate`, `label` and `rule` targets. The quick fix "Replace with the closest accepted alternative" SHALL offer `verticalAlign` for `vertialAlign` as it does for other `prop.unknown` words.

#### Scenario: Completion of a line statement
- **WHEN** completion runs after `line l "L" ` in a free body
- **THEN** the items include `from`, and after `from (0, 0) ` they include `to`

#### Scenario: Hover on a line
- **WHEN** the cursor is on `l` in `line l "Step" from (40, 200) to (520, 200)` inside `group g`
- **THEN** the hover names the kind `line`, the label `Step`, the points (40, 200) and (520, 200) in `g`'s interior, and the layer

#### Scenario: No vertical alignment on a flow node
- **WHEN** completion runs inside `style api { }` of a flow diagram
- **THEN** the items exclude `verticalAlign`, as they exclude `textAlign`

#### Scenario: Completion of alignment values
- **WHEN** completion runs after `verticalAlign ` inside `style a { }` of a free diagram
- **THEN** the items are `top`, `middle` and `bottom`

