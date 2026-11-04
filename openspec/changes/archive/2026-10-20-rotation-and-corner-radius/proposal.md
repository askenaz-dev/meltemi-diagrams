## Why

Trying a circle with a centred icon on the 1.8.0 canvas, the owner found two things missing that
draw.io's panel has for every shape: the roundness of the border and the rotation. The corner
radius is offered only for `rounded` boxes and nodes, notes, free frames and groups: `rectangle`
and `square` draw square corners whatever is written, the polygons (diamond, hexagon, star…)
ignore `radius`, and the inspector hides the slider for them. Rotation does not exist anywhere:
not in the language, not in the drawing, not on the canvas.

## What Changes

- **Corner radius on every shape with corners.** `radius` rounds the corners of `rectangle`,
  `square` and `framed` boxes, the frame of an icon shape, and the vertices of the polygon shapes
  (`diamond`, `triangle`, `parallelogram`, `trapezoid`, `pentagon`, `hexagon`, `octagon`, `star`,
  `arrow`, `flag`, `callout`), on flow nodes, free boxes and decisions; it sets the body radius of
  `person` and `agent`. Without `radius` they keep today's drawing: square corners and sharp
  vertices, the theme's radius on `rounded` boxes. Connector ends, magnets, hit tests and text
  areas follow the rounded outline. Shapes without corners (`ellipse`, `circle`, `pill`,
  `cylinder`, `cloud`, `document`) ignore it, as before.
- **The slider wherever it draws.** The strip and the inspector show Corner radius for every shape
  above, greyed with the radius drawn: the theme's for `rounded`, 0 for the others.
- **Rotation.** `rotation <degrees>` (0 to 360, clockwise) is a style property of the elements of
  flow diagrams and free compositions — nodes, decisions, data stores, notes, tags, boxes, texts,
  icons and images — in `style` statements, classes and rules. The element is drawn turned about
  the centre of its box, its text and icon with it; `place` and `size` keep meaning the unturned
  box. Connectors meet the turned outline; ports and pinned points (`api.north 30%`) turn with the
  element; the layout engine leaves room for the turned box, and the composition checks use it.
  Groups, sequence participants and C4 entities refuse it with `prop.invalid-value`.
- **Rotating on the canvas.** A selected element shows a rotation handle beyond its top-right
  corner:
  dragging it turns the element live, snapping to 15° steps (Alt turns the steps off), and the
  release writes `style <id> { rotation <n> }` in one undo step; 0 removes it. The selection
  frame, the resize handles, the connection handles, the magnets and the inline text editor turn
  with the element; resizing a turned element keeps its opposite edge where it was. The strip and
  the inspector show Rotation as a slider with its number, and the context menu offers **Rotate
  90°** and **Reset rotation**.
- **Motion.** The handle fades in with the selection, the live rotation follows the pointer
  without lag, and the element eases into a snapped angle on release, on the shared motion tokens
  and off under `prefers-reduced-motion`.
- Docs (`docs/language/styles.md`, `layout.md`, `docs/editor.md` and their Spanish versions, the
  skill's references), decision 0045, CHANGELOG 1.8.0.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `style-classes-and-rules`: `radius` on the shapes with corners; the `rotation` property and its
  refusals.
- `free-layout`: rounded corners of rectangles, squares and polygons; turned objects.
- `flow-svg-export`: the same for flow nodes and decisions; the turned element group.
- `connector-routing`: ends on a turned element.
- `layout-modes`: the engine sees a turned element's bounding box.
- `composition-checks`: turned elements are checked by their bounding box.
- `quick-styling`: Corner radius on every shape with corners; Rotation in the strip.
- `diagram-canvas`: the rotation handle, turned selection, handles, hit tests and editor, the
  Rotation field, the context menu.

## Non-goals

- Rotating groups with their children, sequence participants and C4 entities.
- Flipping (mirror) and skewing.
- Rotating relation labels independently of their connectors.
- A percentage radius as draw.io's `arcSize` (decision 0043).

This is a post-1.0 change outside `docs/roadmap-1.0.md`; it joins the unreleased 1.8.0.

## Impact

- Model: `rotation` in `STYLE_PROPERTIES` and `ELEMENT_ONLY_PROPERTIES`, refused on groups and
  in sequence and C4 diagrams; the language stays 0.2 (an additive property).
- Layout: `ShapeOptions.radius` for every cornered shape, rounded polygon paths and outlines;
  turned drawing (group `transform`), turned outlines for connector ends, the engine's sizes and
  the checks; `LayoutResult.rotations`.
- Editor: Corner radius visibility by shape, the Rotation field, `ElementInfo.rotation` and
  `ElementInfo.radius`, completion and hover of `rotation`.
- Canvas: rotation handle and gesture, turned overlays, hit tests, magnets, resize and inline
  editor, the context menu, motion.
- Corpus: valid sheets with rotation and rounded polygons, their SVG and model snapshots; edit
  fixtures; acceptance sheet.
- Docs and skill as above.
