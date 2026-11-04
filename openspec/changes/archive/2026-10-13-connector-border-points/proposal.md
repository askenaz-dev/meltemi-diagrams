## Why

Trying 1.4, the owner asked for more connection points: not only the middle and the quarters of a
box's sides, but any point of its border, as draw.io allows, and connections that can start from
any point of the border rather than from the four dots beside a selected box. They also asked that
"Arrange" let the layout engine choose the best connection points again.

## What Changes

- **Any point of the border.** Dragging a connector's end, or a new connection, near a box's border
  takes the point of the border under the pointer, to 1 %, including the corners. It still snaps to
  the middle of each side, the corners and the named ports when within 6 screen pixels, which Alt
  turns off. The box shows its outline and the point the end will take; further inside the box
  than 12 pixels from the border, the end is free and the layout chooses it.
- **Connections from any point of the border.** Hovering just outside a box's border shows the
  point a connection would start from; dragging from there to another box creates the relation with
  its start pinned to that point, and its end pinned when dropped on the target's border. The four
  dots beside a selected box stay and start from the middle of their side.
- **Arrange frees the ends.** Arranging a whole diagram (the canvas's "Recompute Layout", `mdg
  layout --all`) removes the compass sides and points written in routes, as it already removes
  waypoints, so the engine chooses where connectors meet the boxes; named ports stay, and a route
  left with nothing is removed.
- Fixed: arranging read a route's parts by position, which a route with points broke.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `diagram-canvas`: route editing and connecting take any point of the border, with magnets;
  connections start from the border.
- `layout-actions`: arranging everything frees the compass ends and points of routes.

## Impact

- Canvas: border hover, magnets, outline preview; the protocol's `connect` pins its start
  independently of its end. Edit: `arrange` with scope `all` rewrites route ends.
- Docs: `docs/editor.md`, `docs/language/layout.md` and their Spanish versions; CHANGELOG 1.5.0.
