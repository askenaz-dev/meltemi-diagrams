## Context

A route end is `<element>[.<port>]`: `auto` (the default), a compass side or a named port. Named
ports (`port out east 30%`, declared in the element's block) anchor at their point; compass sides
only choose the side, and the anchor rules of decision 0006 choose the point: the centre of the
overlap of facing sides, the projection of the neighbouring bend, or the side's centre. In `auto`
mode the ELK adapter turns written compass sides into ports at 50 % and named ports into ports at
their position.

On the canvas, dragging an end onto a box writes the nearest named port within 10 px, else the
nearest side (`setEnd` → `setRoute` or `reconnectRelation`); dragging from a connection handle
writes `a -> b`. So a person who drops an end on the middle of a side gets the side, and the line
lands where the overlap rule puts it. Dragging bends already turns `layout auto` into `assisted`
with every box placed (the `GEOMETRY` actions), so bends do move.

## Goals / Non-Goals

**Goals:**

- Any point of a box's side can be a connector's end, written in the route, in every layout mode.
- Dropping an end shows where it will attach and snaps to the useful points.
- Ends can go back to the layout's choice.

**Non-Goals:**

- Ends inside a box or on its corners: connectors still leave square to a side.
- Anchor points on non-rectangular outlines (cylinders, diamonds): points are on the bounding box's
  sides, as named ports are today.
- Changing the anchor rules for ends without a position.

## Decisions

### A position after the compass side

`route save from api.east 50% to db.north 25%`: a percentage after a compass endpoint, with the
same meaning as in `port <name> <side> <n>%` (0 to 100, left to right on `north` and `south`, top to
bottom on `east` and `west`). It is valid only after a compass side; after `auto`, a bare element
or a named port it is `prop.invalid-value`, as is a value outside 0..100. `RouteEndpoint` gains
`position: number | null` (the fraction, as `PortDefinition.position`).
Alternative: writing a named port for every dropped end. It clutters the element's block with
ports nobody named and makes deleting a relation leave ports behind.
Alternative: `api.east@50%` as one token. It would need a lexer change and reads unlike the
`port` statement people already know.

### Positioned ends anchor like named ports

The layout resolves a positioned compass end exactly as a named port: a fixed point, left square to
the side. Waypoints no longer move it (rule 1 of decision 0006 projects only free ends), parallel
lanes skip it, and the ELK adapter gets a port at that position (`<side>@<n>` ids, distinct from the
50 % compass ports). Model JSON writes `position` (a percentage) only when it is set, so existing
outputs do not change.

### Snapping on the canvas

While an end is dragged over a box, the canvas draws the box's anchor points: the middle of each
side (larger) and its quarter points, and the box's named ports. The end snaps to the nearest point
within 10 screen pixels; Alt snaps to the nearest side at the pointer's projection, rounded to 1 %.
Elsewhere along the border (within 10 px of a side) the end takes the nearest side at the projection
rounded to 5 %. Inside the box, further than that from every side, the end is floating: dropping
writes `auto` (removes the port and its position). The preview line follows the snapped point.

### Connecting to a point

Dragging from a connection handle (whose side is known) onto an anchor point of the target creates
`a -> b` and its route `route a_b from a.<handle side> 50% to b.<side> <n>%`, naming the relation
as other route edits do. Dropping on the target's inside creates a floating relation, as today, so
quick connections stay one line of text. The relation tool (R) and "Connect to…" stay floating.

### Going back

Double-clicking an end handle writes `auto` for that end (and removes the route when nothing else
is left in it, as removing the last bend does).

## Risks / Trade-offs

- [Routes that pin ends no longer follow boxes' moves smartly] → the point stays on the side as the
  box moves, which is what pinning means; double-click returns it to the layout.
- [More `route` statements] → only when a person pins an end; quick connections stay floating.
- [ELK ports at many positions] → one port per distinct position per side, which ELK handles with
  fixed port constraints already used by named ports.
