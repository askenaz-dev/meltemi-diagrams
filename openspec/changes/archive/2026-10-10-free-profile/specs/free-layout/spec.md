## ADDED Requirements

### Requirement: Interior coordinates
In a free diagram, the `place` of an element inside a group SHALL be relative to the interior origin of its innermost group: the group's top-left corner plus `groupPadding` across and `groupHeader` down. Top-level elements and route waypoints SHALL use diagram coordinates. A group SHALL need a `place` in `manual` and `assisted` layouts. Its size SHALL be its `size` statement, or `groupPadding + max(child right) + groupPadding` by `groupHeader + max(child bottom) + groupPadding`, measured from the interior origin. `LayoutResult.origins` SHALL map every child to its parent's interior origin in diagram coordinates.

#### Scenario: Moving a group moves its children
- **WHEN** `group g "G"` is placed at (300, 200) with size (400, 240), its child `a` is placed at (60, 40), and the group's place changes to (500, 200)
- **THEN** `a` is drawn 200 units further right, and its `place` text is unchanged

#### Scenario: Derived group size
- **WHEN** a group placed at (300, 200) without `size` has a 160 × 56 child placed at (100, 50)
- **THEN** with the technical theme's padding of 16 and header of 40, the group is 16 + 180 + 16 wide and 40 + 78 + 16 tall

### Requirement: Free objects are drawn
- **Boxes** SHALL be drawn with their `shape`:
  - `rounded` uses the theme radius and `rectangle` none;
  - `ellipse`, `diamond` and `cylinder` match the flow shapes;
  - `pill` has a radius of half the height.
- **Text** SHALL be measured with `fontSize`, `fontWeight` and the theme font, broken at `\n`, and aligned by `textAlign` within its box. It has no frame unless `fill` or `stroke` is set.
- **Icons** SHALL be drawn centred in their box, 48 units by default, coloured by `iconColor`.
- **Images** SHALL be an image item that fits its box and keeps its ratio, with the description as alternative text.

Default sizes SHALL follow the design table.

#### Scenario: Text size
- **WHEN** `text heading "Arquitectura"` has `style heading { fontSize 32 }`
- **THEN** its box is as wide as the text measured at 32 px and as tall as one 32 px line

### Requirement: Paint order and layers
The scene SHALL be painted layer by layer, from the first declared layer to the last. Within a layer, groups SHALL come first (outer before inner), then the other objects in source order, then relations. Elements and relations SHALL be on their `layer`, or on `main`.

#### Scenario: Front layer
- **WHEN** `layers main, front` is declared, `a` is declared before `b`, and `a` writes `layer front`
- **THEN** the scene draws `b` before `a`

### Requirement: Image resolution
`LayoutOptions.images` SHALL resolve an image path, relative to the file, to a data URI and a pixel size. The default size SHALL be the pixel size, scaled down to at most 640 wide, keeping the ratio. When no resolver is given or the image cannot be read, the layout SHALL draw a placeholder of 160 × 120 with the file name, and SHALL report `layout.image-unavailable` (warning) on the declaration.

#### Scenario: Missing resolver
- **WHEN** a free diagram with `image logo "logo.png"` is laid out without `images`
- **THEN** a placeholder is drawn and `layout.image-unavailable` is reported

### Requirement: Modes in free diagrams
`layout manual` SHALL be the default.

- **`auto`.** The engine SHALL arrange every object; groups fit their children and their own `place` and `size` are ignored, as in flow.
- **`assisted`.** Placed objects SHALL stay, unplaced ones SHALL be arranged, and a group with placed children but no `place` SHALL be `layout.missing-placement`.

#### Scenario: Automatic free diagram
- **WHEN** a `layout auto` free diagram of three boxes and two relations is laid out with ELK
- **THEN** the boxes are arranged left to right without overlaps
