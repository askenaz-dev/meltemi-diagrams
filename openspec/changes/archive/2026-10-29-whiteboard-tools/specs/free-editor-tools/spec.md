## ADDED Requirements

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

## MODIFIED Requirements

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
