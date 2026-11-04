# 0038. Connector ends pinned to points of sides

Status: accepted (connector-attachment change, 13 October 2026)

## Context

Testing 1.3, the owner could not put a connector where they wanted: dropping a line's end on the
middle of a box's side landed it elsewhere, so they moved boxes until the line fell in the middle.
A route's compass port (`api.east`) only chose the side; the anchor rules of decision 0006 chose
the point (the centre of the overlap of facing sides, or the projection of the nearest bend).
Named ports fixed a point, but each needed a `port` declaration in the box. draw.io and Excalidraw
let a person drop an end on a point of a box and have it stay there.

## Decision

- **A percentage after a compass side** pins a route's end to that point of the side:
  `route save from api.east 50% to db.north 25%`, read as in `port <name> <side> <n>%`. The end
  anchors like a named port in every layout mode: waypoints do not move it, parallel lanes do not
  shift it, and the ELK engine gets a port at that position. Ends without a percentage keep the
  anchor rules.
- **The canvas snaps** a dragged end, or a new connection, to the middle and quarter points of each
  side and to named ports within 10 screen pixels; nearer a side it takes the pointer's point to
  5 %, or 1 % with Alt; inside the box it frees the end. A double click on an end frees it, and a
  route left with no bends, ports or points is removed.
- **Double clicks on handles** are told from two presses on the same handle, because handles are
  redrawn between the clicks and browsers then do not count a double click.

## Alternatives considered

- **A named port written for every dropped end.** It works with the existing language, but fills
  boxes with ports nobody named and leaves them behind when relations go.
- **`api.east@50%` as one token.** Shorter, but it needs a new token and reads unlike the `port`
  statement people already write.
- **Free points anywhere on the outline.** Closer to draw.io's floating points, but connectors
  must still leave square to a side, and diamonds and cylinders would need their own geometry.

## Consequences

- Additive within language 0.2; existing files draw as before. The model JSON writes `position` on
  pinned ends only, so its version stays 0.1.
- `setRoute`, `reconnectRelation` and `createRelation` take positions; the canvas protocol's
  `setEnd` takes a position or a null port, and `connect` may pin both ends.
