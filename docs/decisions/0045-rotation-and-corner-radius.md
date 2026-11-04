# 0045. Rotation, and a corner radius on every shape with corners

Status: accepted (rotation-and-corner-radius change, 20 October 2026)

## Context

Selecting a circle with a centred icon on the 1.8.0 canvas, the owner found that the border's
roundness and the rotation, which draw.io's panel offers for every shape, were missing. Decision
0043 had made `radius` a style property of elements and groups but drew it on `rounded` boxes,
notes, free frames and groups only: `rectangle` and `square` kept square corners whatever was
written, the polygons ignored it, and the inspector hid the slider for every shape but `rounded`.
Nothing turned: the language, the layout and the canvas knew only axis-aligned boxes.

## Decision

- **`radius` rounds every shape with corners.** `ShapeOptions.radius` is the corner radius of
  `rectangle`, `square` and `framed` (none by default), of the vertices of the polygons and of
  decisions (sharp by default) and of the bodies of persons and agents. A vertex is cut
  `min(radius, half of each edge)` along both edges and joined by a quadratic curve through it,
  draw.io's rounding; the outline samples the curves, so connector ends, magnets, hit tests and
  text areas follow them. Without `radius` every drawing is the one of before. Ellipses, circles,
  pills, cylinders, clouds and documents have no corners and ignore it. The strip and the
  inspector show Corner radius wherever it draws, greyed with the radius drawn.
- **`rotation` is an element style property.** `rotation <0..360>` turns an element of a flow
  diagram or a free composition clockwise about the centre of its box, in styles, classes and
  rules. Groups, sequence diagrams and C4 views refuse it with `prop.invalid-value`.
- **The box stays, the drawing turns.** `place` and `size` keep describing the unturned box; the
  element's scene group gets `transform="rotate(...)"`, so its text, icon, pattern and outside label
  turn with it, and `LayoutResult.rotations` gives the angles. The bounding box of the turned
  outline stands for the element in the engine's request, around it in derived groups, as an
  obstacle for connectors and labels, in the composition checks and in the canvas size.
- **Connectors meet the turned outline.** Free ends route to the turned bounding box and slide onto
  the turned outline along the side's normal (`onPolygon`); ports and pinned points are found on
  the unturned shape and turned, leaving square to the bounding box's side nearest the turned
  normal. `route` keeps writing sides in the element's own frame.
- **The canvas turns with the element.** A rotation handle beyond the top-right corner turns the
  element in 15° steps, Alt for any angle, with a live preview through the session (a new
  previewed action, `setField` of `style.rotation`) and one undo step on release; the selection,
  resize and connection handles, magnets, hit tests, resizing and the inline editor work in the
  element's frame; Rotate 90° and Reset rotation are in the context menu and Rotation in the strip.

## Alternatives considered

- **A placement statement `rotate <id> <deg>`.** Rotation could not come from classes or rules,
  and the inspector's style plumbing, the strip and completion would need a second path.
- **Turning the box itself.** The written size would stop being the element's size, and resizing
  a turned element would rewrite both.
- **Level text in turned shapes.** draw.io turns the text; a turned shape with level text can come
  later as an option, not as the default.
- **Circular arcs at polygon vertices.** Tangent arcs grow past a star's tips; quadratic curves stay
  inside the polygon.
- **The handle above the middle of the top edge**, where draw.io puts it: it would sit on the north
  connection handle of this canvas.
- **Checking turned outlines as polygons.** Every composition check would change; the turned
  bounding box errs on the side of reporting, which is enough for diagrams.

## Consequences

- A rule that sets `radius` on nodes now also rounds the corners of nodes drawn as polygons and
  squares (`corpus/valid/edge/node-shapes` redraws its hexagon with 4 px corners).
- Moves of a turned element compose `translate()` with its `rotate()` on the canvas; a cancelled
  gesture restores the rotation.
- New public surface: `CORNERED_SHAPES`, `CORNERED_POLYGONS`, `turnPoint`, `turnedOutline`,
  `onPolygon`, `pointInPolygon`, `LayoutResult.rotations` and `radii`, `ElementInfo.rotation` and
  `radius`, `PreviewedAction`, the editor's `intoFrame`, `outOfFrame`, `turnedBounds` and `bearing`.
  The language stays 0.2.
- The gesture is revised by [decision 0052](0052-canvas-feel-and-naming.md): the angle is the
  turn since the grab, after a drag threshold, drawn without easing until the drop.
