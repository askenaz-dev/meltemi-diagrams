# free-editor-tools Specification

## Purpose
Canvas and language-service support for free diagrams: the free palette with icon and image pickers, z-order and layers, interior coordinates in canvas edits, conversion from the canvas, and completion, hover, definitions and quick fixes for free statements.
## Requirements
### Requirement: Free palette and pickers
On a free diagram the canvas palette SHALL offer box (B; a split button whose arrow opens the shapes grid, also opened with F), text (T), sticky (S; a split button whose arrow picks its colour), icon (I; the icon picker), image (M), note (O), group (G; a split button whose menu offers Group, Container, Column and Row), pen (P; a split button whose arrow opens the pen menu with Pen, Highlighter (H), the widths and the colours), eraser (E), the arrow tool (R; a split button with the six relation kinds of `quick-styling`'s "Relation tool": `->`, `-->`, `--`, `---`, `<->` and `<-->`) and connect (C). On a flow diagram it SHALL offer the flow kinds as before, with T creating a tag, the node button split the same way (N, F), the same arrow button and the same icon picker (I), and no sticky, pen or eraser. Boxes SHALL be created with an empty label and without opening the label editor; texts and stickies SHALL be created with their default text and open it.

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

#### Scenario: The whiteboard tools on a flow diagram
- **WHEN** a flow diagram is shown
- **THEN** the palette has no sticky, pen or eraser button, and S, P, H and E create nothing

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

### Requirement: Note tool on the free palette
On a free diagram the canvas palette SHALL offer the note tool (O), creating `note <id> "Note"` with a `place` near the centre and opening its label editor, as the flow palette does; the tool SHALL be draggable onto the canvas like the other tools. On a sequence diagram O SHALL keep creating a note over the selection and the palette's note button SHALL stay hidden. On a read-only canvas the note button SHALL be hidden and O SHALL announce the refusal and write nothing.

#### Scenario: Create a note with O
- **WHEN** O is pressed on a free diagram
- **THEN** the text gains `note note1 "Note"` and a `place` near the centre, `note1` is selected and its label editor is open

#### Scenario: O on a sequence diagram
- **WHEN** O is pressed on a sequence diagram with `api` selected
- **THEN** the text gains `note over api "Note"` and no `note note1` is declared

#### Scenario: Shown per profile
- **WHEN** the canvas shows a free diagram, then a C4 view, then a sequence diagram
- **THEN** the palette's note button is visible on the first two and hidden on the third

#### Scenario: O on a read-only canvas
- **WHEN** the canvas is read-only and O is pressed on a free diagram
- **THEN** the note tool is hidden, the status line announces the view-only refusal, and the document is unchanged

### Requirement: Attached notes on the canvas
On flow and free diagrams a drop of the note tool, or a click with it armed, on an element (the topmost under the point, groups included) SHALL create the note at the element's east edge plus the theme's `groupPadding`, aligned to its top, with `attachedTo` set to the element, SHALL show the drop outline on the element while the tool is over it, and SHALL say in the status line that the note is attached; a drop or click on empty canvas SHALL create an unattached note. The inspector of a note SHALL show **Attached to** after the label: an `enum` field listing the ids of the diagram's other elements, empty for none, writing `attachNote` (`attachNote` action, `attachNote` operation). Delete on an element with attached notes SHALL list the attachments among the dependents, and confirming SHALL strip them and keep the notes. Copy, paste and Duplicate SHALL keep a note's attachment when its target is copied with it and drop it otherwise. Moving a note or its element SHALL redraw the leader with the live preview.

#### Scenario: Drop on an element
- **WHEN** the note tool is dragged from the palette and released on `api` (box at (420, 60) size (200, 56)) in a flow diagram under `technical.light`
- **THEN** the text gains `note note1 "Note" on api` and a `place note1` that puts the note's left edge 16 units (the theme's `groupPadding`) right of `api`'s east edge at x 520 and its top level with `api`'s top at y 32, snapped to the 14 px grid, the status line says the note is attached to `api`, and the label editor opens

#### Scenario: Attached to in the inspector
- **WHEN** `note1` is selected and `db` is chosen in Attached to
- **THEN** the declaration reads `note note1 "Note" on db`, and choosing the empty option removes the clause

#### Scenario: Delete keeps the note
- **WHEN** `api` has `note1` attached and one relation, and Delete is pressed on `api`
- **THEN** the dialog lists the relation and the attachment of `note1`, and confirming removes `api` and the relation and leaves `note note1 "Note"`

#### Scenario: Paste without the target
- **WHEN** `note1 "Note" on api` is copied alone and pasted
- **THEN** the text gains `note note1_2 "Note"` without `on`, and copying `api` and `note1` together pastes `note1_2` attached to `api_2`

#### Scenario: Attach to an id the diagram lacks
- **WHEN** an `attachNote` action names `ghost` as the element of `note1`
- **THEN** it is refused with `edit.unsafe-target`, the status line says so, and the declaration is unchanged

### Requirement: Language services for notes
Completion SHALL offer `note` among the statements of free diagrams and C4 views, the word `on` after a note's text, and after `on ` the ids of the diagram's other elements (the drawn entity paths in a view). Hover on the target of `on` SHALL show the element's hover (the entity's in a view), and go to definition SHALL open its declaration (the model's entity in a view). The quick fix for `ref.unknown-element` on an attachment SHALL offer the close ids, and the formatter SHALL keep the `on` clause as written. Hover on `on` SHALL describe the attachment.

#### Scenario: Completion of the target
- **WHEN** completion runs after `note n "Text" on ` in a free diagram with boxes `api` and `db`
- **THEN** the items are `api` and `db`, without `n`

#### Scenario: Completion of `on`
- **WHEN** completion runs after `note n "Text" ` in a flow diagram
- **THEN** the items include `on`

#### Scenario: Definition from the attachment
- **WHEN** go to definition runs on `shop.api` in `note cache "Cached" on shop.api` of a view
- **THEN** the result is `container api` in the model

#### Scenario: Quick fix for an unknown target
- **WHEN** `note n "Text" on ap` reports `ref.unknown-element` and the diagram declares `api`
- **THEN** a quick fix offers `api`, and applying it writes `on api`

#### Scenario: Format keeps the clause
- **WHEN** `note   n   "Text"   on   api` is formatted
- **THEN** the line reads `note n "Text" on api`

### Requirement: Pen, highlighter and eraser
On a free diagram that edits, P SHALL arm the pen, H the highlighter and E the eraser, as SHALL the pen button, the entries of its menu and the eraser button; each SHALL stay armed after every stroke until Escape, another tool, K or its own button puts it away, and arming one SHALL put the Pointer away as any tool does. A read-only canvas SHALL refuse the three (their buttons `data-write`), and story mode SHALL hide them.

- **Settings.** The pen menu (the pen button's arrow) SHALL offer Pen and Highlighter, three widths (thin 2, medium 4, thick 8) and the colour row of the strip (the theme's `ink` first, then the colour tokens and a colour input); the highlighter SHALL have its own colour (the theme's `highlight` by default) and its width SHALL be 20. The choices SHALL be kept with the canvas's state across reloads, per host.
- **Drawing.** A press with the pen or the highlighter SHALL start a stroke from the raw pointer positions (coalesced events included) in diagram units, drawn at every frame on the overlay as the path the layout will draw, in the tool's colour, width and opacity; Shift SHALL keep the stroke a straight segment from the press; Escape SHALL cancel it. The release SHALL simplify the points (Ramer–Douglas–Peucker at 0.75 screen pixels, in diagram units at the current zoom), round them to a tenth, and post `createPen` with the parent being the innermost group under the first point whose drawn box holds the whole stroke and that is not a list (a stroke over a list's cards belongs to the list's nearest ancestor that is not a list; the top level when no group holds it), so that a new stroke never resizes a list or moves its neighbours, the points in its interior, and a style part only for what differs from the defaults: `stroke` when the colour is not the theme's `ink` (the highlighter writes `stroke highlight`), `width` when it is not 3, and `opacity 0.35` for the highlighter. A press released within the drag threshold SHALL write a one-point pen. The new pen SHALL not be selected, the tool SHALL stay armed, each stroke SHALL be one undo step, and the status line SHALL say the stroke was drawn with its point count.
- **Stylus.** While a pointer of type `pen` draws, touch pointers SHALL be ignored, and a stylus's barrel button SHALL erase as the eraser does.
- **Eraser.** The eraser's cursor SHALL be a circle of 16 px; a press on a pen SHALL delete it, and a drag SHALL delete every pen whose path passes within 8 screen pixels of the pointer, each hidden at once and all removed at the release in one `remove` action (one undo step); nothing but pens SHALL be erased; Escape SHALL cancel the drag and bring the hidden strokes back.
- **The strip and the inspector.** A selected pen SHALL show the strip's Stroke (the colour row), Width (1 to 64), Opacity (0 to 1), Line and both heads with `none` greyed, and the inspector's id, description, layer, classes, link and URL, and no geometry fields.

#### Scenario: A stroke with the pen
- **WHEN** P is pressed on the free fixture and the pointer is dragged from (300, 200) through (340, 190) and (380, 210) to (420, 200) inside `group notes`
- **THEN** the text gains `pen pen1 [(…), …]` inside `notes` with its points in the group's interior and no `style`, nothing is selected, the pen stays armed, and the status line names the point count

#### Scenario: A stroke across two columns
- **WHEN** on the kanban template a stroke is drawn from a card of the To do column to a card of the Doing column
- **THEN** the pen is written outside the row of columns, at the points it was drawn, and no column moves or grows

#### Scenario: A thick red stroke
- **WHEN** the pen menu picks thick and the `danger` swatch and a stroke is drawn
- **THEN** the text gains the pen followed by `style pen1 { stroke danger; width 8 }`, and after a reload the menu still shows thick and `danger`

#### Scenario: A highlighter stroke
- **WHEN** H is pressed and a stroke is dragged under a heading
- **THEN** the text gains the pen followed by `style pen1 { stroke highlight; width 20; opacity 0.35 }` and the heading stays readable under it

#### Scenario: A straight stroke and a dot
- **WHEN** a stroke is dragged with Shift held, and the pen is then pressed and released without moving
- **THEN** the first pen has two points on a straight segment and the second has one point

#### Scenario: Erased in one step
- **WHEN** E is pressed and the pointer is dragged across two pens and a box
- **THEN** both pens are gone from the text in one `remove` action, the box is untouched, and one undo brings both back

#### Scenario: Read-only
- **WHEN** the canvas is read-only
- **THEN** the pen, highlighter and eraser buttons are hidden and P, H and E do nothing

#### Scenario: Letters in the editor
- **WHEN** `p` is typed in the inline label editor
- **THEN** it is text and no tool is armed

### Requirement: Sticky tool
On a free diagram S and the sticky button SHALL create `sticky sticky1 "Sticky"` (the text in the interface language) near the centre with its text editor open, and the button dragged onto the canvas SHALL place it under the pointer; the button's arrow SHALL pick the card's colour among the theme's `sticky` and six fixed colours (yellow `#fff59d`, pink `#f8bbd0`, green `#c8e6c9`, blue `#bbdefb`, orange `#ffe0b2`, purple `#e1bee7`), the choice kept with the canvas's state, and a fixed colour SHALL be written as `style <id> { fill "<hex>" }` in the same edit. The text editor of a sticky SHALL wrap at the card's inner width and show the text at the size the layout will draw it; Enter SHALL commit and Shift+Enter SHALL break a line. The strip SHALL show the fill row with the six colours before the theme tokens, the text size, weight and alignment, opacity, rotation and radius; the inspector SHALL show the sticky's text, description, layer, classes, link, URL and its geometry.

#### Scenario: A sticky from the keyboard
- **WHEN** S is pressed on a free diagram, `Cache the catalogue` is typed and Enter is pressed
- **THEN** the text gains `sticky sticky1 "Cache the catalogue"` with a `place` near the centre and no `style`, and the card shows the words wrapped

#### Scenario: A pink sticky dropped
- **WHEN** pink is picked from the sticky button's arrow and the button is dragged to (400, 300)
- **THEN** the text gains `sticky sticky1 "Sticky"`, `style sticky1 { fill "#f8bbd0" }` and `place sticky1 at (392, 294)` (snapped), and the editor opens on the card

#### Scenario: Read-only
- **WHEN** the canvas is read-only
- **THEN** the sticky button is hidden and S does nothing

### Requirement: Lists on the canvas
The group button's menu SHALL offer Column and Row beside Group and Container, creating `group <id> "Column" { layout column }` or `group <id> "Row" { layout row }` (the label in the interface language) with the new group's size. Dragging elements over a list group SHALL show an insertion bar between its children at the pointer's position, in the theme's `guide` colour, and the live preview SHALL show the children making room; the drop SHALL post `move` with the group as `parent`, the `index` of the bar and no point, so the declaration moves there and its `place` goes; dragging a child within its list SHALL reorder it the same way; dragging a child out onto the canvas or into another group SHALL write its `place` at the drop as today; Alt SHALL keep the group and show no bar. A hovered or selected list group SHALL show a **+** button at its end (below a column's last child, right of a row's) that creates a sticky in a column, or a column group in a row, at the end with its editor open. Ctrl+Enter on a selected child of a list SHALL create the same after it, and Alt+Up and Alt+Down SHALL move the child before or after its neighbour in the list's order, in a row as in a column (before is left in a row), since Alt+Left and Alt+Right belong to VS Code's workbench. The inspector of a list group SHALL show Layout (none, column, row), Spacing and Align, and resizing a list group SHALL write its `size` as its least size. Whenever an action from the canvas makes a list grow or shrink (a card created in it, moved into, within or out of it, or removed), the session SHALL keep the top-left corner of the outermost list that has a `place` where it was drawn, rewriting that `place` in the same edit, so a column grows downward and a row to the right and the cards already there do not move.

#### Scenario: A card dropped between two cards
- **WHEN** `sticky c` is dragged from the canvas onto column `todo` between its cards `a` and `b`
- **THEN** an insertion bar shows between `a` and `b` while the pointer is there, the drop declares `c` between them inside `todo`, `c`'s `place` is gone, and the cards below moved down before the release in the preview

#### Scenario: A card reordered
- **WHEN** card `b` of `todo` is dragged above `a` and released
- **THEN** `b` is declared before `a` and the text has no new `place`

#### Scenario: A card taken out
- **WHEN** card `a` of `todo` is dragged onto empty canvas at (600, 400)
- **THEN** `a` is declared at the top level with `place a at (600, 400)` (snapped)

#### Scenario: The plus of a column
- **WHEN** column `todo` is selected and its **+** is pressed
- **THEN** `sticky sticky1 "Sticky"` is declared last in `todo` with its editor open, the column grew downward to hold it, its `place` was rewritten so its top edge stayed, and the cards already in it did not move

#### Scenario: A column added to a board
- **WHEN** the **+** of a row group is pressed
- **THEN** `group group1 "Column" { layout column }` is declared last in the row and its title editor opens

#### Scenario: Moved with the keyboard
- **WHEN** card `b` of `todo` is selected and Alt+Up is pressed
- **THEN** `b` is declared before `a`, stays selected, and the status line says it moved

#### Scenario: A list from the menu
- **WHEN** the group button's arrow is pressed and Column is chosen
- **THEN** the text gains `group group1 "Column" { layout column }` with its `place` and `size`, and G then creates another column

### Requirement: Language services for whiteboard statements
Completion SHALL offer `pen` and `sticky` among the declarations of a free diagram, `layout`, `spacing` and `align` with their values in a group block, `opacity` in the style blocks of free diagrams, `board` after `preset`, and `draw` among a scene's actions with the view's pens, lines and named relations as its targets. Hover SHALL describe a pen (its point count, group and layer), a sticky (its text and colour) and a list group (its layout, spacing and alignment). Quick fixes SHALL offer to remove the `place` of `layout.place-ignored`, to add `layout column` for `spacing` or `align` without a layout, and to write `preset board` for `layout.too-large` on a `preset document`.

#### Scenario: Completing a group block
- **WHEN** completion is requested inside `group todo "To do" { la`
- **THEN** `layout` is offered, and after `layout ` the values `column` and `row`

#### Scenario: Completing a draw action
- **WHEN** completion is requested after `draw ` in a scene whose view holds pens `title` and `arrow`, a line `rule` and a box `api`
- **THEN** `title`, `arrow` and `rule` are offered and `api` is not

#### Scenario: A quick fix for a placed card
- **WHEN** `layout.place-ignored` is reported on `place a at (40, 40)`
- **THEN** a quick fix removes the statement, and the diagram compiles without the warning

#### Scenario: Hover on a pen
- **WHEN** the pointer rests on `pen arrow [...]` with 24 points inside `group notes`
- **THEN** the hover says it is a pen of 24 points in `notes` on layer `main`

