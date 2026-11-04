## Context

`ConnectorGeometry` carries `points` (the route's anchors and waypoints, before the heads are cut
out), `via` and the sides. The canvas draws a selected relation's outline through `points` and
`routeHandles` projects the controls onto `points`, so a Bézier route, whose drawn curve only
touches its controls at the ends, shows a straight outline, and rounded corners and detours
differ from their controls too. `selectInRect` receives boxes only.

## Goals / Non-Goals

**Goals:** the outline and the handles on the drawn connector; rectangles that select arrows.

**Non-Goals:** selecting a connector by the rectangle when only part of it is inside (draw.io
needs the whole shape too); handles for sequence messages.

## Decisions

### The drawn line travels with the geometry

`ConnectorGeometry.line` is the polyline the connector is drawn with: `RelationGeometry.line`
(Bézier samples, rounded corners, detours), which stops at the arrowheads' bases. The editor
copies it into `RelationInfo.line`. The canvas draws the outline through `[points[0], ...line,
points[last]]` so the outline reaches the anchors, and `routeHandles` projects the controls onto
that polyline; the end handles stay at the anchors.
Alternative: sample the curve again in the canvas. The layout already did it, with the heads cut.

### Rectangle selection

`selectInRect(boxes, lines, rect)` returns the ids of the boxes contained in the rectangle and of
the relations whose every point of `line` is inside it. The canvas passes the relations' lines in
every profile; in sequence diagrams a message is a relation too, so the rectangle selects it.

## Risks / Trade-offs

- [A detour's many points make the outline heavier] → a polyline of a few dozen points is cheap
  to draw and hit.
