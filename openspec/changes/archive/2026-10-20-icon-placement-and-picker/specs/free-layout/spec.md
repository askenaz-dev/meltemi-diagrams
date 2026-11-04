## MODIFIED Requirements

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

