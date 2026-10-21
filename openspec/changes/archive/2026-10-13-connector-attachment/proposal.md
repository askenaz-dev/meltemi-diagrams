## Why

Testing 1.3, the owner could not attach a connector where they wanted: dragging the end of a
line to the middle of a box's side lands it somewhere else, so they move the boxes until the line
falls in the middle. The reason is in the language: a route's compass port (`api.east`) only
chooses the side, and the anchor rules choose the point on it (the centre of the overlap of facing
sides, or the projection of the nearest bend). Named ports fix a point, but each needs a `port`
declaration in the box. draw.io and Excalidraw let a person drop a line's end on a point of a box
and have it stay there.

## What Changes

- **A point of a side in routes.** A route end may write a position after its compass side:
  `route save from api.east 50% to db.north 25%`. The connector then starts or ends exactly at that
  point of the side and leaves square to it, as at a named port, in every layout mode (the ELK
  engine gets a fixed port). Without a position, the side keeps today's anchor rules.
- **Dropping an end on a point.** Dragging a connector's end over a box shows the box's anchor
  points (the middle and the quarters of each side); the end snaps to the nearest one, or, with Alt,
  to any point of the nearest side. Dropping writes the side and its position. Dropping on the inside
  of the box, away from its edges, lets the layout choose again (`auto`), as a floating connection.
- **Connecting to a point.** Dragging from a box's connection handle onto one of the target's
  anchor points creates the relation with both ends fixed: the handle's side at 50 % and the
  dropped point. Dropping on the inside of the target creates a floating relation, as today.
- **Double-clicking an end** lets the layout choose its point again.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `layout-constraints`: route ends may name a point of a side (`east 30%`), anchored like a named
  port.
- `diagram-canvas`: route editing snaps ends to anchor points and writes their positions;
  connecting onto an anchor point fixes both ends.

## Impact

- Model: `RouteEndpoint.position`; model JSON writes `position` when it is set (additive, version
  0.1 kept). Edit: `setRoute`, `reconnectRelation` and `createRelation` take positions. Layout and
  the ELK adapter anchor positioned ends. Canvas: anchor points while dragging, the protocol's
  `setEnd` and `connect` carry positions.
- Docs: `docs/language/layout.md`, `svg-export.md`, `grammar-0.2.md`, `docs/editor.md` and their
  Spanish versions; CHANGELOG. The language stays 0.2: no valid file could write a position after a
  route end before.
