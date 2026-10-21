## Context

1.4 pins route ends to points of sides (`api.east 30%`). On the canvas, `attachEnd` snaps a dragged
end to the middle and quarters of each side and to named ports within 10 px, takes the side at the
pointer to 5 % within 10 px of the border, to 1 % with Alt, and frees the end inside the box.
Connections start only from four dots beside a selected box, at the middles of its sides, and pin
both ends only when dropped on one of the target's anchor points. `arrange` with scope `all`
removes waypoints but keeps every port; it reads a route's arguments by position, which breaks when
a percentage follows an end.

## Goals / Non-Goals

**Goals:**

- Any point of a box's border is a connection point, with a few magnets for the common ones.
- A connection can start where the person presses on the border.
- Arranging a whole diagram hands connection points back to the engine.

**Non-Goals:**

- Points inside a box or on non-rectangular outlines (cylinder caps, diamond edges): points are on
  the bounding box's border, as in 1.4.
- Changing how `layout auto` treats pinned ends: they stay pinned until the person or "Arrange"
  frees them.

## Decisions

### The border, to 1 %, with magnets

`attachEnd` takes, within 12 screen pixels of the border, the nearest side and the pointer's
projection on it to 1 % (corners are 0 % and 100 % of a side). Magnets win within 6 px: the
middle of each side, the four corners and the named ports. Alt turns the magnets off. Further inside
than 12 px the end is free. The overlay draws the box's outline, the magnets as small dots and the
point the end will take as a filled dot.
Alternative: more fixed points (eighths). Still a set of points, which is what the owner asked to
go beyond.

### Starting on the border

When no drag is under way, the pointer within 8 screen pixels outside a box's border (not over
another box, a handle or a connector) shows the point it would start from and a crosshair cursor.
Pressing there starts a connection whose start is pinned to that point; the end is pinned when
dropped on the target's border and free when dropped inside it. Starting from one of the four dots
keeps 1.4's behaviour: the start is pinned to the middle of its side only when the end is pinned.
The ring is outside the box, so pressing on the box still selects and moves it.

### Arrange frees ends

`arrange` with scope `all` writes, for each route, its ends without compass sides or points (bare
elements) and without waypoints, keeps named ports, and removes routes left with nothing. The
`unplaced` scope does not touch routes. Route parts are read with `routeParts`.

## Risks / Trade-offs

- [The border ring overlaps a neighbour's ring when boxes are close] → the box under the pointer
  wins, then the nearest border.
- [Arranging loses hand-picked points] → it is the stated purpose of "Recompute"; undo restores
  them, and "Arrange the unplaced elements" keeps them.
