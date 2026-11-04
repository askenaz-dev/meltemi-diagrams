# free-layout Specification

## Purpose
Layout and drawing of free diagrams: interior coordinates of group children, derived group sizes, shapes, measured text, icons, images, layers and paint order, and the modes with ELK.
## Requirements
### Requirement: Interior coordinates
In a free diagram, the `place` of an element inside a group SHALL be relative to the interior origin of its innermost group: the group's top-left corner plus `groupPadding` across and the group's header down. The header SHALL be `groupHeader` for a titled group and `groupPadding` for an untitled one (label `""`, no `description`, no styled `icon`). Top-level elements and route waypoints SHALL use diagram coordinates. A group SHALL need a `place` in `manual` and `assisted` layouts. Its size SHALL be its `size` statement, or `groupPadding + max(child right) + groupPadding` by `header + max(child bottom) + groupPadding`, measured from the interior origin; a titled group SHALL be at least as wide as its title, an untitled one SHALL have no minimum. `LayoutResult.origins` SHALL map every child to its parent's interior origin in diagram coordinates.

#### Scenario: Moving a group moves its children
- **WHEN** `group g "G"` is placed at (300, 200) with size (400, 240), its child `a` is placed at (60, 40), and the group's place changes to (500, 200)
- **THEN** `a` is drawn 200 units further right, and its `place` text is unchanged

#### Scenario: Derived group size
- **WHEN** a group placed at (300, 200) without `size` has a 160 × 56 child placed at (100, 50)
- **THEN** with the technical theme's padding of 16 and header of 40, the group is 16 + 180 + 16 wide and 40 + 78 + 16 tall

#### Scenario: Untitled group derived size
- **WHEN** `group g ""` placed at (300, 200) without `size` has a 160 × 56 child placed at (100, 50)
- **THEN** the group is 16 + 180 + 16 wide and 16 + 78 + 16 tall, and its interior origin is 16 below its top edge

#### Scenario: Empty label with a description keeps the band
- **WHEN** `group g "" { description "Backend" }` is laid out
- **THEN** its interior origin is `groupHeader` below its top edge and the description is drawn in the band

### Requirement: Free objects are drawn
- **Boxes** SHALL be drawn with their `shape`:
  - `rounded` uses the element's `radius`, else the theme radius; `rectangle`, `square` and `framed` use the element's `radius`, else none;
  - `ellipse`, `circle`, `diamond` and `cylinder` match the flow shapes; `pill` has a radius of half the shorter side, so a pill taller than it is wide is a vertical stadium;
  - `triangle`, `parallelogram`, `trapezoid`, `pentagon`, `hexagon`, `octagon`, `star`, `cloud`, `document`, `callout`, `arrow`, `framed`, `flag`, `person` and `agent` are drawn as paths whose details scale with the shorter side, clamped so a 24 px box still draws;
  - `agent` is a robot head — a rounded square with two eyes and an antenna — over a rounded body that holds the text, as `person` is a head over a body;
  - the vertices of `diamond`, `triangle`, `parallelogram`, `trapezoid`, `pentagon`, `hexagon`, `octagon`, `star`, `arrow`, `flag` and `callout` are rounded when the element has a `radius` above 0: each vertex is cut `min(radius, half of each edge)` along both of its edges and joined by a curve through it, and connector ends, magnets, hit tests and the text area follow the rounded outline; `person` and `agent` take `radius` as their body's radius.
  - `icon` draws the element's icon alone in its square box (`xMidYMid meet`), with a frame only when `fill`, `stroke` or `pattern` is set: the frame keeps half the theme padding inside it and grows the default box by as much on each side, so the icon keeps its size; the label and the description are drawn outside the box at `labelPosition` (`bottom` by default), half the theme padding away, aligned by `textAlign`; connectors, magnets and selection use the box, while the engine, the composition checks and derived groups use the box plus the label. Without an `icon` style the layout SHALL report `layout.icon-missing` (warning) and draw a dashed placeholder with the id.
- Every shape SHALL have a default size (square shapes 120 × 120, `agent` 160 × 120, `icon` 64 × 64 or its `iconSize`, plus its frame, the others per the design table, scaled with the label size) and an inscribed text area; the text column and the icon row SHALL be placed inside that area, and a box without `size` SHALL grow until its text fits the area.
- **Icons in boxes** SHALL follow `iconPosition`: `left`, `right`, `top` and `bottom` put the icon and the text in one row or column centred in the text area, the icon `iconSize` wide (the theme's token by default); `center` puts the label (and the description) in a band at the `labelPosition` edge inside the box and centres the icon in the rest, as large as fits with the theme padding around it, or `iconSize` when a number is written and fits; a box or node with `iconPosition center` and no `size` takes 120 × 120, widened for its label. In a written `size` the margin around a centred icon SHALL shrink to half the padding when the room is short, and the icon down to 8 px; a `size` without room for that SHALL be `layout.text-overflow`, and so SHALL a framed `icon` shape whose `size` leaves no room for an 8 px icon inside its frame.
- **Groups** SHALL be drawn as a rounded rectangle whose radius is the group's `radius`, else `groupRadius`; an untitled group SHALL draw no title, icon or description and SHALL cut no connector hole.
- **Text** SHALL be measured with `fontSize`, `fontWeight` and the theme font, broken at `\n`, and aligned by `textAlign` within its box. It has no frame unless `fill` or `stroke` is set.
- **Icons** SHALL be drawn centred in their box, 48 units by default, coloured by `iconColor`.
- **Images** SHALL be an image item that fits its box and keeps its ratio, with the description as alternative text.

#### Scenario: Text size
- **WHEN** `text heading "Arquitectura"` has `style heading { fontSize 32 }`
- **THEN** its box is as wide as the text measured at 32 px and as tall as one 32 px line

#### Scenario: Hexagon grows for its label
- **WHEN** `box a "Payments reconciliation"` has `style a { shape hexagon }` and no `size`
- **THEN** its box is wider than a `rounded` box with the same label, and the label lies inside the hexagon's outline

#### Scenario: An agent holds its label in its body
- **WHEN** `box a "Planner\nagent"` has `style a { shape agent }` and no `size`
- **THEN** its box is 160 wide or more, both lines lie inside the body below the head, and a connector ending `to a.north` meets the top of the head

#### Scenario: Icon as the shape with its label below
- **WHEN** `box fn "Lambda"` has `style fn { icon "aws:lambda"; shape icon }` and no `size`
- **THEN** its box is a 64 × 64 square holding only the icon, the text "Lambda" is drawn centred under it, a connector `to fn.south` ends at the box's bottom edge above the label, and `layout.overlap` is reported for a box placed over the label

#### Scenario: A framed icon shape keeps its icon's size
- **WHEN** `box a "A"` has `style a { icon "tabler:server"; shape icon; iconSize 32; fill "#dae8fc"; stroke "#6c8ebf" }` and no `size`
- **THEN** its box is 48 × 48 under `technical.light` and the icon inside the frame is 32 px wide

#### Scenario: A centred icon without room
- **WHEN** `box db "Orders"` has `size db (80, 40)` and `style db { icon "tabler:database"; iconPosition center }`
- **THEN** `layout.text-overflow` is reported on `db`, with a hint giving a size that holds the icon and the label

#### Scenario: Icon shape without an icon
- **WHEN** `box b "B"` has `style b { shape icon }` and no icon
- **THEN** `layout.icon-missing` is reported on `shape` and a dashed placeholder is drawn

#### Scenario: Centred icon with the label at the bottom
- **WHEN** `box db "Orders"` has `style db { icon "tabler:database"; iconPosition center }` and no `size`
- **THEN** the box is 120 × 120, the label is drawn inside near the bottom edge, and the icon is centred in the space above it, larger than the theme's `iconSize`

#### Scenario: Square untitled group
- **WHEN** `group g ""` has `style g { fill "#dae8fc"; radius 0 }`
- **THEN** the scene holds one rect for `g` with `rx` 0, filled `#dae8fc`, and no text item for the group

#### Scenario: Unknown shape
- **WHEN** a box writes `style a { shape blob }`
- **THEN** `prop.invalid-value` is reported on `blob`, listing the shapes

#### Scenario: Rounded diamond meets its connector on the curve
- **WHEN** box `d` with `style d { shape diamond; radius 16 }` is placed right of box `a` and `a -> d` has no route
- **THEN** the connector ends on the rounded left corner of `d`, inside the sharp diamond's vertex, and a magnet of `d` lies on that curve

### Requirement: Paint order and layers
The scene SHALL be painted layer by layer, from the first declared layer to the last. Within a layer, groups SHALL come first (outer before inner), then the other objects in source order, then relations. Elements and relations SHALL be on their `layer`, or on `main`. A box declared after a box that contains it is therefore painted over it: a stack is written outer first.

#### Scenario: Front layer
- **WHEN** `layers main, front` is declared, `a` is declared before `b`, and `a` writes `layer front`
- **THEN** the scene draws `b` before `a`

#### Scenario: Stack order
- **WHEN** `outer`, `middle` and `inner` are declared in that order and placed at one centre with decreasing sizes
- **THEN** the scene draws `outer`, then `middle`, then `inner`

### Requirement: Image resolution
`LayoutOptions.images` SHALL resolve an image path, relative to the file, to a data URI and a pixel size. The default size SHALL be the pixel size, scaled down to at most 640 wide, keeping the ratio. When no resolver is given or the image cannot be read, the layout SHALL draw a placeholder of 160 × 120 with the file name, and SHALL report `layout.image-unavailable` (warning) on the declaration.

#### Scenario: Missing resolver
- **WHEN** a free diagram with `image logo "logo.png"` is laid out without `images`
- **THEN** a placeholder is drawn and `layout.image-unavailable` is reported

### Requirement: Modes in free diagrams
`layout manual` SHALL be the default.

- **`auto`.** The engine SHALL arrange every object; groups fit their children and their own `place` and `size` are ignored, as in flow.
- **`assisted`.** Placed objects SHALL stay, unplaced ones SHALL be arranged, and a group with placed children but no `place` SHALL be `layout.missing-placement`. A placed and sized group SHALL be neither arranged nor an obstacle for the arranged objects, so an untitled group on a back layer is a band behind them.

#### Scenario: Automatic free diagram
- **WHEN** a `layout auto` free diagram of three boxes and two relations is laid out with ELK
- **THEN** the boxes are arranged left to right without overlaps

#### Scenario: Band behind arranged boxes
- **WHEN** a `layout assisted` diagram declares `layers back, main`, `group band "" { layer back }` placed at (300, 200) with size (500, 300), and three unplaced boxes
- **THEN** the boxes are arranged over the band, nothing is pushed out of it, and no composition warning is reported

### Requirement: Turned elements
An element with a `rotation` other than 0 SHALL be drawn as its unturned drawing inside a group whose `transform` is `rotate(<degrees> <cx> <cy>)` about the centre of its box; `place` and `size` SHALL keep meaning the unturned box, and `LayoutResult.boxes` SHALL give it, while `LayoutResult.rotations` SHALL give the angle by id. Its drawn box, the axis-aligned bounding box of its turned outline, SHALL stand for it where other things meet it: the box of a group derived from its children, the obstacles of connectors and of relation labels, the composition checks and the content size of the canvas. In `layout auto` and for the unplaced elements of `layout assisted`, the engine SHALL receive the drawn box's size.

#### Scenario: Turned free box in its group
- **WHEN** `box b "B"`, 160 × 56, has `style b { rotation 90 }` and is the only child of an untitled group without `size`
- **THEN** the group's derived box holds a 56 × 160 drawn box with its padding, and `b`'s `place` is unchanged

#### Scenario: Turned box in an automatic diagram
- **WHEN** a `layout auto` flow diagram arranges `a -> b -> c` and `b` has `rotation 90`
- **THEN** the engine's request gives `b` its 56 × 160 drawn size, and the boxes of `a` and `c` do not overlap `b`'s drawn box

#### Scenario: Not turned at 360
- **WHEN** a node has `rotation 360`
- **THEN** it is drawn without a transform, as with `rotation 0`

### Requirement: Free lines are drawn
A `line` object SHALL be drawn by the connector machinery from its points moved by its parent's interior origin: a stroke in its `stroke` (else the theme's `connector`) at `width` (else `connectorWidth`), dashed or dotted by `line`, routed by its `routing` (`polyline` by default and for `auto`, `orthogonal` and `bezier` when written), its bends rounded by `corners`, its heads `arrowhead` and `arrowtail` (`none` by default, cut from the line as a relation's are), and a label pill drawn as a relation's at 50 % of its length or where its `label` statement puts it, with `color`, `fill` and `icon` as a relation's pill takes them. Its scene group SHALL have role `element`, its id, its `layer`, `track` (the drawn line, heads cut out) and `bounds` (the bounding box of its drawn points). `LayoutResult.boxes` SHALL hold that bounding box, `LayoutResult.connectors` its geometry keyed by its id (`points`, `line`, `via`, and as `fromSide` and `toSide` the sides its first segment leaves by and its last enters by), `LayoutResult.labels` its pill, and `LayoutResult.origins` its parent's origin when it has one. It SHALL be painted where "Paint order and layers" puts a non-group object of its layer, in source order. A line SHALL NOT take lanes, detours, gaps under group titles or the composition checks between boxes, and a group derived from its children SHALL hold a line's bounding box.

#### Scenario: A straight line
- **WHEN** `line l from (40, 200) to (520, 200)` is laid out under `technical.light`
- **THEN** the scene holds a group with role `element`, id `l`, one polyline from (40, 200) to (520, 200) stroked `#526579` at 1.3, no head, and `boxes` gives `l` a box from (40, 200) 480 wide

#### Scenario: A line with a bend, a head and rounded corners
- **WHEN** `line l from (0, 0) to (200, 100) via [(200, 0)]` has `style l { routing orthogonal; corners rounded; arrowhead triangle }`
- **THEN** the drawn points include (190, 0) and (200, 10) and none of them is (200, 0), a filled triangle is drawn at (200, 100) pointing down, and the line stops at the head's base

#### Scenario: A curved line
- **WHEN** `line l from (0, 0) to (200, 0) via [(100, 60)]` has `style l { routing bezier }`
- **THEN** the scene draws it as a path with `C` commands and no fill, and the group's `track` samples the curve

#### Scenario: A line in a group
- **WHEN** `group g "G"` placed at (300, 200) with size (400, 240) holds `line l from (20, 40) to (120, 40)`, and the group's place changes to (500, 200)
- **THEN** `l` is drawn 200 units further right and its statement is unchanged, and `origins` gives `l` the interior origin of `g`

#### Scenario: A labelled line
- **WHEN** `line l "Step" from (0, 0) to (300, 0)` is laid out
- **THEN** the group holds a label pill with role `label` centred at (150, 0), and `label l at 20%` moves it to (60, 0)

#### Scenario: Paint order with a line
- **WHEN** `box a "A"` is declared, then `line l from (0, 20) to (200, 20)` crossing it, then `box b "B"`
- **THEN** the scene draws `a`, then `l`, then `b`, and `layout.overlap` is not reported for `l`

#### Scenario: A line with no length
- **WHEN** `line l from (10, 10) to (10, 10)` is laid out
- **THEN** `layout.degenerate-line` is reported as a warning on the statement, and the line is drawn as a point of its width

### Requirement: Vertical alignment in shapes
A free box's text block (its label lines, its description lines and the icon beside, above or below them) SHALL be placed by `verticalAlign`: `middle` at the shape's text centre as today; `top` in the first row band of the shape's text area, from its top edge plus the theme's `padding`, as tall as the block, whose inscribed span holds the block's width; `bottom` in the last such band from its bottom edge minus `padding`; when no band holds the block, it SHALL move back towards the middle until one does. The text area SHALL be the shape's: the box for `rounded`, `rectangle`, `square`, `framed`, `pill`, `hexagon`, `octagon`, `parallelogram` and `trapezoid`; the curve for `ellipse` and `circle`; the body under the rim for `cylinder`, the body above the tail for `callout`, the page above the wave for `document`, the shaft for `arrow` and the part away from the notch for `flag`. `textAlign` SHALL keep its horizontal meaning within the band. The label audit and `layout.text-overflow` SHALL measure the block where it is placed, and the inline editor's text place SHALL be where the block is drawn.

#### Scenario: Top of a rectangle
- **WHEN** `box a "A"` with `size a (200, 120)` placed at (100, 60) has `style a { shape rectangle; verticalAlign top }` under `technical.light`
- **THEN** the label's vertical centre is 16 px plus half a line below the box's top edge, and with `verticalAlign bottom` it is 16 px plus half a line above the bottom edge

#### Scenario: Top of an ellipse
- **WHEN** `box e "Short"` with `size e (240, 120)` has `style e { shape ellipse; verticalAlign top }`
- **THEN** the label sits in the first band of the ellipse whose inscribed width holds "Short" with the padding, below the box's top edge, and lies inside the curve

#### Scenario: A wide label at the top of an ellipse moves down
- **WHEN** the same ellipse has the label "A considerably longer label"
- **THEN** the block moves down from the top until a band holds it, and no `layout.label-cut` is reported

#### Scenario: Cylinder body
- **WHEN** `box db "Orders"` with `size db (160, 120)` has `style db { shape cylinder; verticalAlign top }`
- **THEN** the label sits under the top rim, not in it, and `verticalAlign bottom` puts it above the bottom rim

#### Scenario: Icon beside top-aligned text
- **WHEN** `box a "A"` with `size a (200, 120)` has `style a { icon "tabler:server"; verticalAlign top; textAlign left }`
- **THEN** the icon and the label form one row at the top band, left of the text area plus the padding

#### Scenario: The inline editor follows
- **WHEN** the text place of `a` with `verticalAlign bottom` is computed
- **THEN** its anchor is the drawn label's position and its area is the bottom band, so typing in place covers the drawn text

#### Scenario: A block taller than the shape
- **WHEN** `box a "One\nTwo\nThree\nFour"` with `size a (160, 40)` has `style a { verticalAlign top }`
- **THEN** no band holds the block, so it stays at the middle, and `layout.label-cut` reports the lines beyond the box as it does with `middle`

### Requirement: Vertical alignment ignored
A written `verticalAlign` that moves nothing SHALL be reported as `layout.vertical-align-ignored` (warning) once per statement that writes it, or once on the diagram's `theme` for a rule or class of the theme, as `layout.label-position-ignored` is: on boxes drawn as `triangle`, `pentagon`, `star`, `person`, `agent` or `icon`, whose text spot is fixed, with the hint to choose a shape with a text band or remove it; on a box whose `iconPosition center` puts the band at a `labelPosition` edge, with the hint that the band sits at `labelPosition`; on texts, icons, images, groups, lines and the kinds of other profiles, with the hint to remove it. A rule or class SHALL be reported only when no element it styles uses the value.

#### Scenario: A star
- **WHEN** `box s "S"` has `style s { shape star; verticalAlign top }`
- **THEN** `layout.vertical-align-ignored` is reported once on `verticalAlign` with the hint to choose a shape with a text band, and the label stays at the star's centre

#### Scenario: A centred icon
- **WHEN** `box db "Orders"` has `style db { icon "tabler:database"; iconPosition center; labelPosition top; verticalAlign bottom }`
- **THEN** the label band stays at the top edge and `layout.vertical-align-ignored` is reported with the hint that the band is at `labelPosition`

#### Scenario: A rule used by one box
- **WHEN** `rule box { verticalAlign top }` styles a rectangle and a star
- **THEN** nothing is reported, since the rectangle uses it

#### Scenario: Written in Spanish
- **WHEN** the interface language is Spanish and `text t "T"` has `style t { verticalAlign top }`
- **THEN** `layout.vertical-align-ignored` is reported with its message and hint in Spanish, the same code and range as in English

### Requirement: Notes in free compositions are drawn
A free note SHALL be drawn as a flow note is: its lines of text at `fontSize` (the theme's `noteSize` by default), `fontWeight` (400 by default), aligned by `textAlign` (`left` by default) in `color` (the theme's `muted` by default), an icon before the first line when styled, and an outline with the note's `radius` (the theme's `radius` by default), `fill`, `stroke`, `width` and `line` only when `fill`, `stroke` or `pattern` is styled. Its default size SHALL be its longest line's width (plus the icon) by its line count times the note line height plus 4; a written `size` SHALL be kept, and one narrower than the longest line SHALL be `layout.text-overflow` on the `size`, as for any object with text. A free note SHALL be painted on its layer in source order among the other objects, SHALL take part in `place`, z-order, hit testing, selection, marquee selection, rotation and the composition checks as any object, and SHALL be excluded from the label audit as notes are.

#### Scenario: A note drawn in a free composition
- **WHEN** a free diagram declares `note hint "Draft\nnot final"` placed at (300, 100) with `style hint { fill "#fff3bf"; stroke "#e8a600" }`
- **THEN** the scene holds one rect filled `#fff3bf` stroked `#e8a600` and two text items at the note size, weight 400, start-anchored, 18 units apart under `technical.light`, and the note's box is the rect

#### Scenario: Centred text at a size
- **WHEN** the note has `style hint { textAlign center; fontSize 16 }` and `size hint (200, 60)`
- **THEN** both lines are measured at 16 px and anchored at the middle of the 200-unit box

#### Scenario: A note on a front layer
- **WHEN** `layers main, front` is declared, box `a` is declared after note `n`, and `n` writes `layer front`
- **THEN** the scene draws `a` before `n`

#### Scenario: A note on a shape
- **WHEN** a free note without an outline is placed over box `a`
- **THEN** no `layout.label-overlap` is reported for the note's text, as for a flow note

#### Scenario: A size too small for the text
- **WHEN** `size hint (40, 20)` is written for `note hint "Draft\nnot final"`
- **THEN** `layout.text-overflow` is reported on the `size` with the width the longest line needs, and the note is drawn at the written size

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

