## ADDED Requirements

### Requirement: Pen strokes are drawn
The layout SHALL turn a pen into a scene group with role `element`, a `track` (its points, from its group's interior origin) and `bounds` (the box of the points grown by half the stroke width on every side), painted on its layer in source order as a line is. One point SHALL be drawn as a dot of the stroke's width; two points as a segment; three or more as one path that starts at the first point, draws a quadratic curve through the midpoint of each pair of consecutive points with the shared point as its control, and ends at the last point, with round caps and joins, no fill, and the resolved `stroke`, `width`, `line` and `opacity`. `arrowhead` and `arrowtail` SHALL be cut and drawn along the end segments as a line's heads are. A pen SHALL take no part in the composition checks (`layout.overlap`, `layout.connector-crossing`, lanes and the label audit) and SHALL count for a derived group's size, the canvas size and marquee selection. A sketched theme SHALL leave a pen's path as drawn, with no sketch passes. `meltemi-diagrams export`, the canvas and the player SHALL produce the same path for the same points.

#### Scenario: A smoothed stroke
- **WHEN** `pen p [(0, 0), (20, 0), (20, 20)]` is laid out at the top level with `width 3`
- **THEN** the scene holds one path `M 0 0 Q 20 0 20 10 L 20 20` with stroke width 3, round caps and joins and no fill, the group's track is the three points, and its bounds are (-1.5, -1.5) to (21.5, 21.5)

#### Scenario: A dot
- **WHEN** `pen p [(40, 40)]` is laid out with `width 6`
- **THEN** the scene draws a disc of diameter 6 centred at (40, 40)

#### Scenario: A stroke in a group moves with it
- **WHEN** `pen p [(10, 10), (30, 20)]` is declared in a group placed at (300, 200) with interior origin (316, 240)
- **THEN** the path starts at (326, 250) and the group's derived size holds the stroke

#### Scenario: A highlighter stroke
- **WHEN** a pen has `width 20`, `opacity 0.35` and `stroke highlight`
- **THEN** the path is drawn 20 wide in the theme's `highlight` colour with opacity 0.35, and the text it crosses stays readable in the exported SVG

#### Scenario: Sketched themes leave pens alone
- **WHEN** a free diagram under `sketch.rough` has a pen and a box
- **THEN** the box is painted in two sketch passes and the pen as one unjittered path

#### Scenario: A stroke over a box is not an overlap
- **WHEN** a pen crosses two boxes and runs under a label
- **THEN** no `layout.overlap`, `layout.connector-crossing` or label-audit finding names the pen

#### Scenario: A malformed stroke draws nothing
- **WHEN** a free diagram has a pen whose statement is `prop.invalid-value`
- **THEN** the layout of the last valid compilation is kept and nothing is drawn for the statement

### Requirement: Stickies are drawn
A sticky SHALL be a square of 160 × 160 at the 13 px label size, scaled with `labelSize`, or its written `size`, and SHALL never grow for its text: the text is wrapped at the card's inner width (the width minus twice the theme's `padding`) at spaces, a word longer than the inner width is broken at it, `\n` keeps its breaks, lines are 1.25 times the font size apart, and the font size is `fontSize` or 1.2 times the label size. When the wrapped block is taller than the inner height, the font size SHALL step down by 1 until it fits or reaches 8; a block that still does not fit SHALL be `layout.text-overflow` (warning) with the hint of a size at which it fits, and the text SHALL be drawn clipped to the card. The card SHALL be drawn as a shadow rect 3 px lower in black at 15 % opacity, the card rect with its `fill`, `radius` and a stroke only when `stroke` is styled, an icon before the first line at the top left when `icon` is styled, and the text in `stickyText` aligned by `textAlign` and `verticalAlign` within the inner box. Connectors, magnets, ports, `layout.overlap` and the label audit SHALL treat the card as a rectangle, and rotation SHALL turn it as any object.

#### Scenario: Default size
- **WHEN** `sticky s "Idea"` is laid out under `technical.light`
- **THEN** its box is 160 × 160, its text is centred in the card at 15.6 px, and the scene holds the shadow rect, the card rect with `rx` 2 and no stroke

#### Scenario: Wrapped text
- **WHEN** `sticky s "Move the catalogue cache to the edge before the sale"` is laid out at the default size
- **THEN** the text is drawn on several lines none wider than the inner width, broken at spaces, 19.5 px apart

#### Scenario: Text that shrinks to fit
- **WHEN** a sticky holds sixty words at the default size
- **THEN** its lines are drawn at a font size below 15.6 and at least 8, the block fits the inner height, and nothing is reported

#### Scenario: Text that cannot fit
- **WHEN** a sticky holds four hundred words at the default size
- **THEN** `layout.text-overflow` is reported as a warning on the sticky with a size in the hint, the text is drawn at 8 px and clipped to the card

#### Scenario: A connector ends on the card
- **WHEN** `sticky a "A"` at (100, 100), `box b "B"` at (500, 100) and `a -> b` are laid out
- **THEN** the connector leaves the card's east edge and enters the box's west edge

#### Scenario: A sticky under a sketch theme
- **WHEN** a sticky is laid out under `sketch.light`
- **THEN** its text is measured and drawn in the hand font, its card's fill stays clean, and a card with a written `stroke` has its outline painted in two sketch passes like a box

### Requirement: List groups arrange their children
A group with `layout column` or `layout row` SHALL place its children (elements and groups; lines and pens keep their written points and are not arranged) in source order along its axis from the interior origin: each child at the running sum of the previous children's sizes plus `spacing` (half `groupPadding` by default), and across the axis at the start of the interior (`align start`), centred in the inner cross size (`center`), at its end (`end`), or, with `stretch`, a child without a written size on that axis takes the inner cross size. Each child keeps its written `size` or its default size. A written `size` on the group SHALL be its least size: the group grows along either axis when its children need more, and without `size` it is derived as any group's is. A `place` on a child of a list group SHALL be `layout.place-ignored` (warning) on the `place` statement with the hint to remove it or the group's `layout`, and the child is placed by the list. The engine SHALL treat a list group as a leaf of its derived size in every mode and never arrange its children; `meltemi-diagrams layout` and the Arrange commands SHALL write no `place` for them and no `size` for the list group, whose size stays derived. A list group MAY hold list groups.

#### Scenario: A column
- **WHEN** `group todo "To do" { layout column; spacing 12; sticky a "A"; sticky b "B" }` is placed at (100, 100) under `technical.light`
- **THEN** `a` is drawn at the interior origin, `b` 172 below it, and the group is 160 plus twice `groupPadding` wide and the header plus 332 plus `groupPadding` tall

#### Scenario: A row that stretches
- **WHEN** a row group has `align stretch` and holds two column groups, one 300 tall and one 500 tall
- **THEN** both columns are drawn 500 tall and the second starts `spacing` to the right of the first

#### Scenario: A written size as a minimum
- **WHEN** a column group has `size (240, 200)` and children that need 400 of height
- **THEN** the group is drawn 240 wide and 400 plus its padding tall, and nothing is reported

#### Scenario: A placed child
- **WHEN** a child of a column group has `place a at (40, 40)`
- **THEN** `layout.place-ignored` is reported as a warning on the `place` statement with the hint, and `a` is drawn where the list puts it

#### Scenario: A pen inside a list
- **WHEN** a column group holds a sticky and `pen p [(10, 10), (60, 10)]`
- **THEN** the pen is drawn at its points in the interior and the sticky at the origin, and the group's size holds both

#### Scenario: A list in an automatic layout
- **WHEN** a free diagram with `layout auto` holds a column group of three stickies and two boxes outside it
- **THEN** the engine arranges the group and the boxes, the stickies keep their column order inside the group, and writing the layout down adds a `place` for the group and nothing for the stickies (a list's size stays derived from its children, so it can still shrink)

#### Scenario: A kanban board
- **WHEN** a row group with `align stretch` holds three column groups of stickies
- **THEN** the columns are drawn side by side at equal height, each with its stickies top to bottom
