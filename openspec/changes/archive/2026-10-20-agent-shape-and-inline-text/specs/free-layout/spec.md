## MODIFIED Requirements

### Requirement: Free objects are drawn
- **Boxes** SHALL be drawn with their `shape`:
  - `rounded` uses the element's `radius`, else the theme radius; `rectangle`, `square` and `framed` use the element's `radius`, else none;
  - `ellipse`, `circle`, `diamond` and `cylinder` match the flow shapes; `pill` has a radius of half the shorter side, so a pill taller than it is wide is a vertical stadium;
  - `triangle`, `parallelogram`, `trapezoid`, `pentagon`, `hexagon`, `octagon`, `star`, `cloud`, `document`, `callout`, `arrow`, `framed`, `flag`, `person` and `agent` are drawn as paths whose details scale with the shorter side, clamped so a 24 px box still draws;
  - `agent` is a robot head — a rounded square with two eyes and an antenna — over a rounded body that holds the text, as `person` is a head over a body;
  - the vertices of `diamond`, `triangle`, `parallelogram`, `trapezoid`, `pentagon`, `hexagon`, `octagon`, `star`, `arrow`, `flag` and `callout` are rounded when the element has a `radius` above 0: each vertex is cut `min(radius, half of each edge)` along both of its edges and joined by a curve through it, and connector ends, magnets, hit tests and the text area follow the rounded outline; `person` and `agent` take `radius` as their body's radius.
- Every shape SHALL have a default size (square shapes 120 × 120, `agent` 160 × 120, the others per the design table, scaled with the label size) and an inscribed text area; the text column and the icon row SHALL be placed inside that area, and a box without `size` SHALL grow until its text fits the area.
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

#### Scenario: Square untitled group
- **WHEN** `group g ""` has `style g { fill "#dae8fc"; radius 0 }`
- **THEN** the scene holds one rect for `g` with `rx` 0, filled `#dae8fc`, and no text item for the group

#### Scenario: Unknown shape
- **WHEN** a box writes `style a { shape blob }`
- **THEN** `prop.invalid-value` is reported on `blob`, listing the shapes

#### Scenario: Rounded diamond meets its connector on the curve
- **WHEN** box `d` with `style d { shape diamond; radius 16 }` is placed right of box `a` and `a -> d` has no route
- **THEN** the connector ends on the rounded left corner of `d`, inside the sharp diamond's vertex, and a magnet of `d` lies on that curve
