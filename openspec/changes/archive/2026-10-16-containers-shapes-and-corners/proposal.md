## Why

Trying 1.7 next to draw.io, the owner could not draw three plain rectangles one inside another
(blue, pink, yellow), nor put a coloured band behind the boxes of an architecture diagram, which
is what the layers of 1.7 were meant for. Layers only change the paint order: a box on `layer back`
is still a node for the layout engine, which arranges it in `auto` and pushes every unplaced box
out of it in `assisted`; three boxes stacked on one layer warn `layout.overlap` for every pair; and
nested groups, which do nest and lay out automatically, always reserve a 40 px title band, are
always rounded at the theme's `groupRadius` and refuse `shape`. In the editor nothing moves a box
into a group by dragging, the palette cannot nest groups, and a covered box cannot be reached with
the pointer.

The owner also asked for what draw.io's panel offers for every shape: the corner radius adjustable
per box and per group (more or less rounded), the border type beside it, and a palette of shapes
(triangle, square, rectangle, rhombus, circle, pentagon…) instead of one kind of box. The language
has six box shapes, in free diagrams only; the corner radius is a theme token; connectors meet a
shape on its bounding rectangle, so an end pinned to a diamond or an ellipse floats in the air, and
text is fitted to the rectangle, so a long label crosses a diamond's outline without a warning.
The inspector already has stroke colour, line (solid, dashed, dotted) and width: the border type
exists; the shape picker has no pictures and there is no radius.

## What Changes

- **Plain containers.** A group whose label is `""`, with no description and no styled icon,
  reserves no title band: its interior starts `groupPadding` below the top edge, nothing is drawn
  in it, no connector hole is cut, and `layout.container-margin` measures from the padding. Nested
  untitled groups with `fill`, `stroke` and `radius 0` are draw.io's nested rectangles, in flow
  (auto, assisted and manual) and in free diagrams; a placed and sized untitled group on a back
  layer is a band behind arranged boxes.
- **Corner radius per element.** `radius <n>` (0 to 64, as the theme tokens) is a style property
  of elements and groups in every profile: boxes and nodes drawn as rounded rectangles, notes,
  groups. The theme's `radius` and `groupRadius` stay the defaults. The inspector shows a Corner
  radius field with a slider for boxes, nodes, notes and groups.
- **Deliberate stacks.** The composition checks no longer report a box fully inside a box declared
  before it on the same layer; partial intersections still warn. Boxes and groups on different
  layers are not checked against each other at all (box against group and connector crossings
  included); a connector is not reported as crossing, nor routed around, a box or group that holds
  one of its ends; a container's own text may lie over its children.
- **A palette of shapes.** `shape` grows from six values to twenty-two: `rounded`, `rectangle`,
  `square`, `ellipse`, `circle`, `diamond`, `cylinder`, `pill`, `triangle`, `parallelogram`,
  `trapezoid`, `pentagon`, `hexagon`, `octagon`, `star`, `cloud`, `document`, `callout`, `arrow`,
  `framed`, `flag` and `person`. Flow `node`s take `shape` too (decision 0018 is narrowed to
  `fontSize`, `fontWeight` and `textAlign`); `decision`, `data`, notes and tags keep their own
  drawing. Every shape gets a default size, an inscribed text area that sizing, overflow and the
  label audit use, and an outline that connector ends meet: auto ends, compass and percentage
  ends, named ports and engine routes are projected from the bounding rectangle onto the outline.
  In the canvas the Box button (the Node button on flow diagrams) becomes a split button: its main
  part creates the current shape, and its arrow opens a grid of the twenty-two shapes with
  pictures; the grid also opens with F and finds a shape as you type its name, so every shape has
  a keyboard path (F, `hex`, Enter) and B or N repeat it. The arrow button gets the same split for
  the four arrow kinds (`->`, `-->`, `<->`, `<-->`), and R cycles through them while the tool is
  armed. The inspector's Shape field shows the same pictures, and magnets, the border preview and
  the drop target follow the outline. The Mermaid and PlantUML importers keep hexagons, parallelograms, trapezoids,
  circles, subroutines, flags, clouds, actors and documents instead of approximating them.
- **Containers in the editor.** Dropping a selection whose centre lands inside another group, or
  outside its group, moves the declarations into that block and rewrites their `place` in the new
  interior, in one undo step (`moveElement`); Alt keeps the parent; nudges never reparent. The
  palette nests a group dropped inside a group. Alt+click cycles through the shapes under the
  pointer (and the context menu offers "Select the shape below"); Ctrl with the arrows prefers the
  nested shape when two are concentric. The inspector shows an Inside field for elements.
- Fixed: converting to free and pasting a fragment dropped `layers` and `layer`; C4 boxes were
  never overlap-checked; the shorthand `id[("…")]` lost its cylinder in the model JSON.
- The language stays 0.2: `radius` and the new `shape` values are additive, and the untitled
  group changes no statement.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `composition-checks`: stacks, layer exemptions, containers of a connector's ends, the band of
  untitled groups, outlines of shaped boxes.
- `free-layout`: untitled groups, `radius`, the shapes with their sizes, text areas and outlines.
- `free-diagram-model`: the shape vocabulary; `shape` on flow nodes; `radius`.
- `flow-diagram-model`: `radius` and `shape` in style blocks.
- `style-classes-and-rules`: the `radius` property; `shape` and `radius` in rules.
- `label-audit`: a container's own text; text measured against the inscribed area of a shape.
- `flow-svg-export`: derived size of untitled groups; route anchors on outlines; `radius`.
- `connector-routing`: containers of an end are not obstacles.
- `theme-tokens`: `radius` and `groupRadius` as defaults that an element overrides.
- `view-conversion`: interior places of untitled groups; `layers` kept.
- `source-editing`: `moveElement`; `createElement` with a shape.
- `diagram-canvas`: selection of stacked shapes, reparenting drops, nested groups from the
  palette, the Shapes menu, the Shape and Corner radius fields, shape-aware magnets.
- `free-editor-tools`: interior origins of untitled groups; completion of shapes and `radius`.
- `quick-styling`: Shape and Corner radius in the strip.
- `mermaid-import`, `plantuml-import`: shapes kept.
- `model-json-interchange`: `shape` on elements.
- `acceptance-suite`: a `stacked` and a `shapes` sheet per profile; a reparent edit scenario.

## Non-goals

- A band in `layout auto` with nothing declared inside it: the engine has no position for it;
  the band is written as a group holding its boxes, which this change makes plain.
- A corner radius as a percentage of the shorter side (draw.io's `arcSize`): the radius is in
  pixels like the theme tokens.
- Shapes on sequence participants and C4 entities, whose kinds draw themselves; constraints
  (`align`, `row`) targeting groups; a "send behind" command, which untitled groups replace.
- Importing draw.io files (universal import, excluded from 1.0).

This is a post-1.0 change outside `docs/roadmap-1.0.md`, released as 1.8.0.

## Impact

- Model: `BOX_SHAPES`, `radius` in `STYLE_PROPERTIES`, `shape` accepted on flow nodes,
  `ElementJson.shape`. Layout: per-group header, `radius`, shape outlines and insets, anchor
  projection, the checks. Edit: `moveElement`, `createElement.shape`, convert/insert keep layers.
  Editor and canvas: drop targets and reparenting, select below, Shapes menu, shape glyphs, radius
  slider, Inside field. Import: Mermaid and PlantUML shape maps. Corpus: new acceptance, valid and
  edit fixtures; SVG, model and visual snapshots that hold untitled groups change.
- Docs: `docs/language/free.md`, `layout.md`, `styles.md`, `svg-export.md`, `grammar-0.2.md`,
  `diagnostics.md`, `model-json.md`, `docs/editor.md`, the import docs, the Spanish versions, the
  skill and its references, decision 0043, CHANGELOG 1.8.0.
