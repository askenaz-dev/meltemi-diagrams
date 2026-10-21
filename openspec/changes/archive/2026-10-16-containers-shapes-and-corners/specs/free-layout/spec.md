## MODIFIED Requirements

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
  - `rounded` uses the element's `radius`, else the theme radius; `rectangle` and `square` none;
  - `ellipse`, `circle`, `diamond` and `cylinder` match the flow shapes; `pill` has a radius of half the shorter side, so a pill taller than it is wide is a vertical stadium;
  - `triangle`, `parallelogram`, `trapezoid`, `pentagon`, `hexagon`, `octagon`, `star`, `cloud`, `document`, `callout`, `arrow`, `framed`, `flag` and `person` are drawn as paths whose details scale with the shorter side, clamped so a 24 px box still draws.
- Every shape SHALL have a default size (square shapes 120 × 120, the others per the design table, scaled with the label size) and an inscribed text area; the text column and the icon row SHALL be placed inside that area, and a box without `size` SHALL grow until its text fits the area.
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

#### Scenario: Square untitled group
- **WHEN** `group g ""` has `style g { fill "#dae8fc"; radius 0 }`
- **THEN** the scene holds one rect for `g` with `rx` 0, filled `#dae8fc`, and no text item for the group

#### Scenario: Unknown shape
- **WHEN** a box writes `style a { shape blob }`
- **THEN** `prop.invalid-value` is reported on `blob`, listing the shapes

### Requirement: Paint order and layers
The scene SHALL be painted layer by layer, from the first declared layer to the last. Within a layer, groups SHALL come first (outer before inner), then the other objects in source order, then relations. Elements and relations SHALL be on their `layer`, or on `main`. A box declared after a box that contains it is therefore painted over it: a stack is written outer first.

#### Scenario: Front layer
- **WHEN** `layers main, front` is declared, `a` is declared before `b`, and `a` writes `layer front`
- **THEN** the scene draws `b` before `a`

#### Scenario: Stack order
- **WHEN** `outer`, `middle` and `inner` are declared in that order and placed at one centre with decreasing sizes
- **THEN** the scene draws `outer`, then `middle`, then `inner`

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
