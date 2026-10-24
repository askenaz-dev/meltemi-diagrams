## ADDED Requirements

### Requirement: Free lines are drawn
A `line` object SHALL be drawn by the connector machinery from its points moved by its parent's interior origin: a stroke in its `stroke` (else the theme's `connector`) at `width` (else `connectorWidth`), dashed or dotted by `line`, routed by its `routing` (`polyline` by default and for `auto`, `orthogonal` and `bezier` when written), its bends rounded by `corners`, its heads `arrowhead` and `arrowtail` (`none` by default, cut from the line as a relation's are), and a label pill drawn as a relation's at 50 % of its length or where its `label` statement puts it, with `color`, `fill` and `icon` as a relation's pill takes them. Its scene group SHALL have role `element`, its id, its `layer`, `track` (the drawn line, heads cut out) and `bounds` (the bounding box of its drawn points). `LayoutResult.boxes` SHALL hold that bounding box, `LayoutResult.connectors` its geometry keyed by its id (`points`, `line`, `via`, `fromSide` and `toSide` `auto`), `LayoutResult.labels` its pill, and `LayoutResult.origins` its parent's origin when it has one. It SHALL be painted where "Paint order and layers" puts a non-group object of its layer, in source order. A line SHALL NOT take lanes, detours, gaps under group titles or the composition checks between boxes, and a group derived from its children SHALL hold a line's bounding box.

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
