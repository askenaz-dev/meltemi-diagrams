## Why

Trying 1.6, the owner selected a curved connector: the blue outline and the handles ran straight
between the route's control points while the connector itself curved away from them, so the
handle that adds a bend floated off the line. They also dragged a selection rectangle over arrows
and nothing happened: the rectangle selects boxes only.

## What Changes

- **The outline follows the connector.** A selected relation's outline and its stretch handles
  follow the connector as drawn: the sampled curve of a Bézier route, the rounded corners, the
  elbows of a detour. The layout hands the canvas the drawn line beside the route's points.
- **The rectangle selects connectors.** A selection rectangle selects the relations whose drawn
  line lies fully inside it, with the boxes; Shift and Ctrl add them as for boxes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `diagram-canvas`: selection by rectangle includes relations; route outlines and handles sit on
  the drawn connector.

## Impact

- Layout: `ConnectorGeometry.line`. Editor: `RelationInfo.line`, `routeHandles` and
  `selectInRect` take lines. Canvas: the outline polyline and the band drop.
- Docs: `docs/editor.md` and `docs/es/editor.md` (selection); CHANGELOG 1.7.0.
