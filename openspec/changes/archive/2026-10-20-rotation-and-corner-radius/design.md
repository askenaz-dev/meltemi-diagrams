## Context

`radius` is a style property in every profile (decision 0043): the layout reads it for `rounded`
boxes and nodes, notes, free frames and groups, and draws `rectangle` and `square` with radius 0
and the polygons sharp whatever is written. The inspector's `withElementDefaults` hides Corner
radius for a box or node whose shape is not `rounded`. Shapes live in
`@meltemi/diagrams-layout/shapes`: `silhouette` gives each shape's polygon, `outlinePath` its SVG
path, and `onOutline`, `pointInShape`, `shapeMagnets` and the text areas all read the silhouette,
which the canvas uses too (`routes.ts`, `selection.ts`).

Nothing turns. A box is its axis-aligned rectangle everywhere: `place` is its centre, `size` its
extent, the engine arranges rectangles, connectors meet rectangle sides (moved onto shaped
outlines by `onOutline`), the checks compare rectangles, and the canvas draws selection frames,
handles and magnets on `ElementInfo.box`. The scene's `GroupItem` already carries a `transform`
that the SVG writer emits.

## Goals / Non-Goals

**Goals:** a corner radius on every shape that has corners, offered where it draws; rotation of
the elements of flow and free diagrams, drawn, routed, arranged, checked and edited on the canvas
like draw.io's; the drawing without these properties unchanged.

**Non-Goals:** rotating groups, sequence participants and C4 entities; flipping; a percentage
radius.

## Decisions

### `radius` rounds every shape with corners, through `ShapeOptions.radius`

`ShapeOptions.radius`, today the body radius of persons and agents, becomes the corner radius of
every cornered shape: `rectangle`, `square` and `framed` draw `roundedRectPath(box, radius ?? 0)`;
the polygon shapes (`diamond`, `triangle`, `parallelogram`, `trapezoid`, `pentagon`, `hexagon`,
`octagon`, `star`, `arrow`, `flag`, `callout`) round each vertex when `radius > 0`. The layout's
`shapeOptions(element)` passes the resolved `style.radius` for those shapes, and for `person` and
`agent` in place of their proportional default. `rounded` keeps its own path with the theme's
radius as default; the icon shape's frame already reads `style.radius ?? theme.radius`.

A rounded vertex is cut `c = min(r, |edge before| / 2, |edge after| / 2)` along both of its edges
and joined by a quadratic curve through the vertex, as draw.io rounds polygons; the path keeps
straight edges between the cuts. The silhouette of a rounded polygon samples each corner curve (8
segments), so `onOutline`, `pointInShape`, `segmentCrossesShape` and the text areas follow it; the
magnets that sat on vertices sit on the curves' midpoints. With `radius` absent or 0 every path and
polygon is the one of today, which keeps every snapshot.

- *Alternatives:* circular arcs tangent to both edges (the arc radius would grow a sharp star tip
  past its box; the quadratic stays inside the polygon); rounding only the drawing and keeping the
  sharp silhouette for connectors (ends would float off a big corner, the bug decision 0043 fixed).

### Corner radius is shown where it draws

`withElementDefaults` shows Corner radius when every target draws one: `RADIUS_KINDS` (nodes,
boxes, notes, groups, and now decisions), free frames, and for nodes and boxes a shape of
`CORNER_SHAPES` (`rounded` and the shapes above). Its greyed default is the radius drawn: the
theme's `radius` for `rounded`, nodes' notes and frames, `groupRadius` for groups, the body radius
for persons and agents, 0 for the others. Ellipses, circles, pills, cylinders, clouds and documents
show none.

### `rotation` is a style property of elements

`rotation: { kind: "number", min: 0, max: 360 }` joins `STYLE_PROPERTIES` and
`ELEMENT_ONLY_PROPERTIES`: degrees, clockwise, about the centre of the box, in style statements,
classes and rules. Groups refuse it per target, as `shape` is refused on kinds that draw their own
(`rotationRefusal`), and the sequence and C4 profiles refuse it as `shapeInProfile` refuses
`shape`, both `prop.invalid-value`. 360 draws as 0; the canvas writes 0 to 359 and removes it at 0.

- *Alternatives:* a placement statement `rotate <id> <deg>` beside `place` and `size` (rotation
  would then not come from classes and rules, and the inspector's style plumbing, the strip and
  the completion would need a second path); radians or a `deg` unit (degrees are what draw.io and
  people type).

### The layout keeps the box and turns the drawing

`place` and `size` keep meaning the unturned box, so turning an element never moves its text in
the file and resizing keeps working in the element's own frame. `layoutDrawing` computes, after
the boxes are known, for each turned element:

- `turned outline`: the shape's outline points (with its options) rotated about the box centre;
- `drawn box`: the axis-aligned bounding box of that outline.

The element's `GroupItem` gets `transform="rotate(<deg> <cx> <cy>)"`, so its outline, text, icon,
pattern and outside label turn together. The drawn boxes replace the boxes in what is not the
element's own frame: the derived box of the group around it, the obstacles and ends of connectors,
the label obstacles, the checks and the canvas size. `LayoutResult.rotations` gives the angle by
id, and `LayoutResult.boxes` stays the unturned box.

The engine's request carries the drawn box's size for a turned element (`arrangeRequest` takes the
sizes it is given), so the engine leaves room for the turned drawing and centres it where it
centres the box.

- *Alternatives:* turning the box itself in `place`/`size` terms (the written size would no longer
  be the element's size); turning only the outline and keeping the text level (draw.io turns the
  text; a diagonal arrow with level text is an option later, not a default).

### Connector ends on a turned element

A connector meets a turned element on its turned outline:

- a free end routes to the drawn box as to any box (sides, lanes, detours), and the end found on
  the drawn box's side moves along that side's inward normal onto the turned outline
  (`onPolygon(points, point, side)`, the ray cast `onOutline` uses, exported);
- a named port or a pinned point (`api.north 30%`) is computed in the element's frame, on its
  unturned shape, and turned with it: `ConnectorEnd.named` gains the world `point`, and its side is
  the drawn box's side whose outward normal is closest to the turned side's normal, so the
  connector leaves square to where the end looks.

`route` statements keep writing `side n%` in the element's own frame, so the canvas converts the
pointer into that frame when it pins an end.

### Composition checks use the drawn box

`checkComposition` receives the drawn boxes for turned elements: overlaps, crossings of group
edges, label audits and connector crossings compare the turned drawing's bounding box. A turned
box inside its group's padding is not a crossing of the group edge, and two turned boxes whose
bounding boxes overlap are reported even when their outlines do not touch, which errs on the side
of telling.

### The canvas turns its overlays and works in the element's frame

`ElementInfo` gains `rotation` (degrees, absent when 0) and `radius` (the resolved
`ShapeOptions.radius` when the shape takes one), so the canvas computes the same outline, magnets
and hit tests as the layout:

- hit tests (`stackAt`, `pointInShape`) turn the pointer into the element's frame first;
- the selection frame, its resize handles and the connection handles are drawn in the element's
  frame inside a `rotate()` group; the marquee, the guides and other people's outlines use the
  drawn box;
- a resize computes `resizeBox` in the element's frame from the pointer delta turned back, and the
  opposite edge stays put in the diagram: the new centre is the old one plus the turned shift of
  the local centre; snapping to the grid is off for a turned element;
- magnets and pinned points are computed on the unturned box and turned for drawing; a drop turns
  the pointer back before `attachEnd`, so the route is written in the element's frame;
- the inline editor's textarea is turned with CSS about the text's centre.

The rotation handle is a 12 px disc 14 px out from the top-right corner, in the element's own
frame, joined to the corner by a short line, shown for one selected element that takes `rotation`
on a canvas that edits. Above the middle of the top edge, where draw.io puts it, it would sit on
the north connection handle. A
drag sets `drag = { kind: "rotate", id, centre, start, angle }`: the angle is the pointer's bearing
from the centre, snapped to 15° unless Alt is held, shown in the status line and as a badge beside
the pointer; the element's drawn group, its selection and its connectors' ends are drawn turned
live from the canvas's own state (the existing live preview asks the session for the connectors).
The release sends `setField` `style.rotation` with the angle, or `null` at 0, one undo step, and
the status line says what it did; Escape restores the drawing. The live preview takes a new
`PreviewedAction`, `setField` of `style.rotation`, beside moves and resizes. Moves of a turned
element compose their `translate()` with its `rotate()`, kept in `data-turn` when the drawing is
put, and a cancelled gesture restores it.

The strip and the inspector show Rotation (`style.rotation`, a number with a slider from 0 to 359)
for the targets that take it, with 0 greyed. The context menu offers **Rotate 90°** (adds 90,
modulo 360) and **Reset rotation** (`null`), disabled where they change nothing.

### Motion

The handle and its line fade in with the selection (`--mdg-motion-fast`); while dragging, the
turned drawing follows the pointer on every frame without easing; on release to a snapped angle the
element's group eases to the written angle (`--mdg-motion-base`, `ease-out`) instead of jumping,
and the transition is dropped under `prefers-reduced-motion`.

### Where the code goes

- `@meltemi/diagrams-model`: `rotation` in `schema.ts`; refusals in `flow.ts` (per target) and
  `style-values.ts` (per profile); messages.
- `@meltemi/diagrams-layout`: `shapes.ts` (`roundPolygon`, cornered `rectangle`/`square`/`framed`,
  `onPolygon`, `turnPoint`/`turnedOutline` exported); `layout.ts` (`shapeOptions`, drawn boxes,
  the group transform, ends on turned elements, the engine sizes, `rotations`); `routing.ts`
  (`ConnectorEnd.named.point`); `checks.ts` reads the drawn boxes it is given.
- `@meltemi/diagrams-editor`: inspector visibility and the Rotation field; `ElementInfo.rotation`
  and `radius` in `render.ts`; completion and hover; messages.
- `@meltemi/diagrams-editor/canvas`: `selection.ts` and `routes.ts` take a rotation; helpers
  `toLocal`/`toDiagram`.
- `@meltemi/diagrams-canvas`: the rotation handle and gesture, turned overlays, resize, the inline
  editor, the context menu, motion, messages en/es.

## Risks / Trade-offs

- [Bounding-box checks over-report turned boxes] → documented; the alternative, polygon checks,
  touches every check and is not needed for the owner's cases.
- [Orthogonal routes to a turned diamond meet it at its drawn box's sides] → the end slides onto
  the turned outline, so the drawing is right; the route is not optimal for 45° shapes.
- [Text audits in a turned box] → the label audit compares texts in the element's own frame,
  where the text and its box turn together; texts of other elements are compared with the drawn
  box.
- [Snapshot churn] → none without `radius` on the new shapes or `rotation`; new corpus sheets
  carry them.
