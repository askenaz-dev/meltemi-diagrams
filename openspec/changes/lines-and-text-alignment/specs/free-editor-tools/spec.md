## ADDED Requirements

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

## MODIFIED Requirements

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
