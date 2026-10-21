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

