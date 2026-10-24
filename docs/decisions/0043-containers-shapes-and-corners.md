# 0043. Plain containers, stacks, shapes and corner radii

Status: accepted (containers-shapes-and-corners change, 16 October 2026). The free-only text
properties gain `verticalAlign`, the text placed within each shape's text band, by
[decision 0058](0058-lines-sketch-and-text-alignment.md).

## Context

Trying 1.7 next to draw.io, the owner could not draw three plain rectangles one inside another,
nor put a coloured band behind the boxes of an architecture diagram, which is what the layers of
1.7 were meant for. A box on `layer back` was still a node for the engine, arranged in `auto` and
pushed away in `assisted`; boxes stacked on one layer warned `layout.overlap` for every pair; and
groups, which nest and lay out, always reserved a 40 px title band, always took the theme's
`groupRadius` and refused `shape`. Nothing on the canvas moved a box into a group, the palette could
not nest groups, and a covered box could not be reached with the pointer.

The owner also asked for what draw.io's panel offers for every shape: the corner radius per box and
per group, and a palette of shapes with pictures instead of one kind of box. The language had six
box shapes, in free diagrams only (decision 0018); connectors met every shape on its bounding
rectangle, so an end pinned to a diamond (decision 0038) floated beside it; and text was fitted to
the rectangle, so a long label crossed a diamond's outline without a warning. The Mermaid and
PlantUML importers approximated hexagons, parallelograms, circles, clouds and actors for that
reason.

## Decision

- **Untitled groups are the containers.** A group whose label is `""`, with no `description` and
  no styled icon, reserves no title band: its interior starts `groupPadding` below its top edge, it
  draws only its outline, cuts no gap in connectors and asks its children for half the padding at
  the top as on the other sides. Every reader of the header (derived sizes, interior origins, the
  engine's padding, label obstacles, the minimum width, the checks, `convertToFree`, the editor)
  asks the same rule. With `fill`, `stroke` and `radius 0`, nested untitled groups are draw.io's
  nested rectangles, in flow and free diagrams and in every layout mode.
- **`radius` is a style of every profile.** A number from 0 to 64, like the theme tokens, on
  elements and groups; relations refuse it. Nodes, `rounded` boxes, notes, framed texts and groups
  read it over the theme's `radius` or `groupRadius`, clamped to half the shorter side;
  `rectangle`, `square` and `framed` stay square, `pill` stays round, and polygons ignore it. The
  theme tokens become the defaults.
- **Stacks and layers are settled in the checks.** A box lying strictly inside a box declared
  before it on the same layer is a stack, not `layout.overlap`; a partial overlap still is, so are
  two boxes that coincide, and so is a stack declared inner first, on the outer box, with a hint to
  declare the outer box first. Boxes and groups on different layers are not
  checked against each other, and a connector is neither checked against nor routed around a box
  on another layer, or a box or group that holds one of its ends. A container's own text may lie
  over the boxes it holds. A placed and sized group is neither arranged nor an obstacle, so an
  untitled group on a back layer is a band behind the boxes the engine arranges.
- **Twenty-two shapes, on free boxes and flow nodes.** `rounded`, `rectangle`, `square`,
  `ellipse`, `circle`, `diamond`, `cylinder`, `pill`, `triangle`, `parallelogram`, `trapezoid`,
  `pentagon`, `hexagon`, `octagon`, `star`, `cloud`, `document`, `callout`, `arrow`, `framed`,
  `flag` and `person`, one camel-case word each. This narrows decision 0018: flow `node`s take
  `shape`, and only `fontSize`, `fontWeight` and `textAlign` stay free-only. Decisions, data
  stores, notes, tags, groups, free texts, icons and images, sequence participants and C4 entities
  refuse it in `style` statements and rules, since their kind is their drawing; only `rule node`
  and `rule box` may set it. One geometry module in the layout
  holds each shape's default size, its outline and its text rows, and the canvas draws its
  pictures, ghosts, magnets and hit tests from the same functions.
- **Text fits the shape.** Sizing, `layout.text-overflow` and the label audit measure the text
  against the rows of the shape it lies in, not its rectangle, so a default-sized hexagon is wider
  than a rounded box with the same label, a decision with a long label grows until the label is
  inside the diamond, and a text that leaves a shape is reported.
- **Connector ends meet the outline.** This extends decision 0038: every end found on the
  rectangle (anchor rules, waypoint projections, percentages, named ports, lanes, engine routes)
  slides along its side's inward normal to the first point of the outline, or to the nearest one
  when the normal meets none. The text keeps `side n%`, ends stay square to their side, and
  arrowheads follow the final tip. `layout.connector-crossing` follows the outline too, so a line
  through a diamond's empty corner is not a finding.
- **The canvas picks shapes by their pictures.** This extends the glyph strips of decision 0036
  with a `shape` family drawn from the outline builders. The box and node buttons are split: the
  main part creates the canvas's current shape, kept in memory and never written, and the arrow
  opens a grid of the twenty-two pictures; F opens the grid from the keyboard, typing filters by
  name, Enter creates, and B or N repeat. The arrow button is split the same way for `->`, `-->`,
  `<->` and `<-->`, and R cycles them while the relation tool is armed. The inspector shows Shape
  pictures, and a Corner radius slider only where a radius is drawn.
- **Reparenting is one operation.** `moveElement` moves a declaration with its block and comments
  into another group's block or the diagram body and rewrites its `place` in the new interior; the
  canvas sends it when a drag ends with the selection's centre in another group, Alt keeps the
  parents, nudges never reparent, and the inspector's Inside field writes it too. Alt+click selects
  the shape below, and Ctrl with the arrows prefers the nested one.
- **Importers keep shapes.** Mermaid's hexagon, parallelograms, trapezoids, circles, stadium,
  subroutine and flag, and PlantUML's cloud, hexagon, use case, interface, actor, card, file and
  folder are written as `style <id> { shape … }`; mirrored and double-ringed forms are approximated
  to the nearest shape. Mermaid's nested blocks are untitled groups.

## Alternatives considered

- **A `title none` property or a `band` kind for containers.** Either touches both profile tables,
  the model JSON, the edits and every closed list of kinds; the empty label needs no new word.
- **`group id {` without a label as the untitled form.** It would change what existing files mean.
- **A `shape` on groups, or a percentage radius as draw.io's `arcSize`.** A pixel number that
  overrides the token is one property for boxes, notes and groups, and needs no new value kind.
- **Exempting any containment from the overlap check.** It would hide a box covered by a bigger
  one declared after it; the declaration order says which picture was meant.
- **A `backdrop` marker read by the engine, the checks, the audit and the canvas.** Heavier, and
  it still could not express nesting, which untitled groups do.
- **Shapes on free boxes only.** Architecture diagrams would have to be converted to draw a
  hexagon, and the importers would keep approximating.
- **Aliases and mirrored variants** (`circle` for `ellipse`, `parallelogramLeft`). A new value
  pattern for the first and a longer list for the second; importers approximate the mirrors.
- **draw.io's ray from the centre through the anchor.** It moves the point along the side and
  breaks connectors that leave square to a side.
- **One key per shape.** Twenty-two bindings with most letters taken; F and the grid's filter give
  every shape a keyboard path.

## Consequences

- The language stays 0.2: `radius` and the new `shape` values are additive, `shape` on a flow node
  was an error before, and an untitled group changes no statement. The model JSON gains `shape` on
  elements after `source` (the shape the declaration implies, `cylinder` for `id[("…")]`); its
  version stays 0.1 since no existing field changes.
- Drawings change where the new rules apply: the children of an untitled group are drawn 24 px
  higher in the technical themes (only importer output had such groups), connector ends on
  decisions, data stores, tags and other shaped boxes move onto their outline, and decisions with
  long labels grow.
- Composition warnings disappear for deliberate stacks, bands on back layers and connectors inside
  their containers; sending an inner box to the back turns its stack into a warning that names
  both boxes.
- Hosts read `ElementInfo.shape`, the canvas mirrors the layout's default sizes, and the
  importers' coverage tables move the kept shapes to mapped.
