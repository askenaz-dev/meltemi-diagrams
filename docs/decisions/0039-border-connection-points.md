# 0039. Connection points on the whole border

Status: accepted (connector-border-points change, 13 October 2026)

## Context

With 1.4, a dragged end snapped to the middle and quarters of each side, and connections started
only from four dots at the middles of a selected box's sides. The owner asked for more: any point
of a box's border should be a connection point, and recomputing the layout should let the engine
choose the points again. `arrange` with scope `all` removed waypoints but kept every port and
point, so a recomputed diagram still carried the hand-picked ends.

## Decision

- **Any point of the border.** Within 12 screen pixels of a box's border, inside or outside, a
  dragged end takes the pointer's projection on the nearest side, to 1 %. Magnets win within 6 px:
  the middle of each side, the four corners and the named ports; Alt turns them off. Further inside
  the end is free. The overlay shows the outline, the magnets and the point taken.
- **Starting on the border.** Within 8 px outside a box's border, where no handle or connector
  is, the canvas shows the point a connection would start from and a crosshair; a press there
  starts a connection pinned at that point. The canvas protocol's `connect` pins its start and its
  end independently. Sequence diagrams and C4 views have no routes and pin nothing.
- **Recompute frees the ends.** `arrange` with scope `all` removes compass sides and points from
  route ends along with waypoints, keeps named ports, and removes routes left with nothing.
  Arranging only the unplaced elements leaves routes alone.

## Alternatives considered

- **More fixed points (eighths, sixteenths).** Still a set of points, which is what the owner asked
  to go beyond, and harder to read on small boxes.
- **A ring inside the box.** It would compete with selecting and moving the box; outside the
  border a press can only mean a connection.
- **Keeping pinned ends on Recompute.** Hand-picked points often stop making sense once boxes move;
  undo restores them, and arranging the unplaced keeps them.

## Consequences

- No language change: routes already took any percentage (decision 0038). No existing drawing
  changes.
- `layout --all` and **Recompute Layout** write fewer `route` statements; files that relied on
  them keeping compass sides get the engine's choice instead.
