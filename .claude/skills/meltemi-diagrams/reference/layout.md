# Layout: modes, constraints, ports, coordinates, sizes, anchors, groups, frame

## Modes

| Mode             | Use it for                                   | Positions                                                     |
| ---------------- | -------------------------------------------- | ------------------------------------------------------------- |
| `auto` (default) | new sheets, quick drafts, generated diagrams | ELK arranges every box in the `direction`; `place` is ignored |
| `assisted`       | a sheet where some boxes must stay put       | placed boxes stay; ELK places the others around them          |
| `manual`         | conversions and pixel-exact sheets           | every box needs a `place`                                     |

- ELK keeps the source order within each column, so declare boxes in reading order.
- Primary arrows (`->`) are kept straighter than secondary ones (`-->`).
- `pnpm mdg layout sheet.meltemi` writes the arranged positions into the file and switches `auto`
  to `assisted`; `--all` arranges everything anew and writes the bends ELK draws as waypoints with
  free ends, so the connectors look as they did in `auto`; `--check` only reports.

## Constraints

Constraints go in `placement` and hold in every mode. Placed boxes never move; free ones do.

```text
placement {
  align api, orders, db top      // also bottom, left, right, middle, center
  row client, api                // equal vertical centres
  column api, cache              // equal horizontal centres
  order a, b, c horizontal       // left to right in this order (axis defaults to direction)
  distance api, db 80            // at least 80 px between the boxes
}
```

If placed boxes break a constraint, `layout.constraint-conflict` names them and how far off they
are; the sheet still renders.

## Ports and connector shapes

```text
bus["Event bus"] {
  port in west 30%
  port out east
}
placement {
  route publish from api.east to bus.in
}
style notify { routing bezier }
```

- A named port is an exact point on a side, 50 % along it by default; compass ports (`east`) only
  choose the side.
- `routing` is `auto` (anchor rules below, or ELK's routes in `auto` mode), `orthogonal`,
  `polyline` or `bezier`; set it for the diagram or per relation in a `style`.
- Two or more arrows between the same boxes are spread 16 px apart automatically.

## Coordinates

- Pixel units, origin at the top-left, y grows downwards. The canvas is computed from the content
  plus a 20 px margin, so start wherever you like; coordinates from an existing SVG can be copied
  as they are.
- `place <id> at (x, y)` is the centre of the box. From a rectangle `x, y, w, h` the centre is
  `(x + w/2, y + h/2)`.
- Use a grid: multiples of 20 for centres, row pitch 70 to 90 px for 56 px boxes, column pitch of
  the box width plus 40 px.

## Sizes

| Kind                  | Default                                                                | Give `size` when                                       |
| --------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------ |
| `node`                | 160 x 56, wider when its text needs it                                 | you want it larger than its text, or match an original |
| `node` with `shape`   | the shape's size (free.md), grown until the text fits inside the shape | the same                                               |
| `shape icon`          | 64 x 64 (or `iconSize`; 16 more when framed), the label outside it     | you want a larger icon; `iconSize 96` says it better   |
| `iconPosition center` | 120 x 120, wider for a long label                                      | the same; a small `size` leaves no room for the icon   |
| `decision`            | 160 x 80, grown until its text fits the diamond                        | the same                                               |
| `data`                | 160 x 64, wider when its text needs it                                 | the same                                               |
| `group`               | fits children + 16 px, 40 px top (16 px untitled), and title           | you want a band of a fixed size (then also `place`)    |
| `tag`                 | text width + 18, height 18                                             | never, unless matching an original                     |
| `note`                | longest line, 18 px per line                                           | never, unless matching an original                     |

Text is measured with the bundled fonts (Inter, IBM Plex Sans, Cascadia Mono), so boxes without
`size` always fit their label and descriptions. A `size` that is too narrow is reported as
`layout.text-overflow` with a hint that gives a width that fits: follow it. Aligned columns of boxes
look best with one shared `size` that fits the longest label.

Text layout inside a box: label centred; with a description the label moves up 8 px and the
description sits 10 px below the centre; extra description lines add 16 px each (`\n`).

## Arrows and anchors

A relation without `route` uses `auto` ports on both ends. The exporter picks the side facing the
other box and then:

1. facing parallel sides (south to north, east to west) meet at the centre of the overlap of
   their extents, so aligned boxes get straight arrows and a wide band under a box gets a vertical
   arrow under that box;
2. without overlap, each side uses its own centre (the arrow is diagonal: align the boxes or add a
   waypoint);
3. perpendicular sides get one elbow;
4. with waypoints, each side anchors at the projection of its neighbouring waypoint, clamped to the
   side;
5. free ends that land less than 16 px apart on one side of a box spread 16 px apart (more for
   labelled relations), ordered by where their other ends are; a straight arrow moves whole.

Waypoint example, a line that leaves to the right and drops onto the top of a wide gateway:

```text
route ext from clients.east to gateway.north via [(1035, 48)]
```

On a decision, a data store, a tag or a node with a `shape`, the point found on the rectangle then
slides along the side's normal onto the outline, so arrows touch the diamond, the cylinder's rim
or the hexagon; `d.north 5%` still reads as a point of the north side.

The polyline is 1.3 px with a filled 8 px arrowhead; `-->` and `line dashed` dash it, `line dotted`
dots it, `<->` puts the head at both ends and `corners rounded` rounds its bends.

## Relation labels

`a -> b: "text" as r` draws a pill centred on the route at 50 % unless `label r at <n>% offset
(dx, dy)` moves it. For vertical arrows use `offset (16, 0)`; for horizontal ones `offset (0, -16)`.
Style the pill with `style r { fill "#0B1830"; color "#FFFFFF" }` for a dark step badge; one
character labels become circles.

## Groups

```text
group runtime "AgentCore Runtime" {
  node a "Agent A"
  node b "Agent B"
}
placement {
  place a at (337, 358); size a (155, 56)
  place b at (509, 358); size b (155, 56)
  // runtime fits a and b, or:
  place runtime at (510, 390); size runtime (540, 200)
}
```

A group is drawn first (rounded band, radius 14, or its own `radius`) with its label at the
top-left (20 px in, 18 px down) and an optional description under it. Children keep diagram
coordinates. Nested groups work. Arrows may start or end at a group; the anchor rules treat it as
a box. `group backend "" { ... }` (empty label, no description, no icon) is a plain container: no
title, no 40 px band (the padding is 16 px all round), no gap cut in arrows; with
`style backend { fill "#dae8fc"; radius 0 }` it is a flat coloured rectangle. A connector between
two boxes of a group, or of a box they are stacked in, is never routed around that container.

## Z-order

Groups (outer first), then nodes, data, decisions and notes in source order, then relations with
their labels, then tags, then the brand frame. A box declared after a box that holds it entirely
is drawn over it and is not `layout.overlap` (a stack: declare the outer box first). Place tags on
box corners (`place t at (x + w/2, y)` for the top-right corner) and they stay on top. With
`layers back, main`, anything with `layer back` is drawn first and is not checked against the
boxes of `main`.

## Legend and notes

- A legend is a row of tags under the sheet, each styled with a category's `fill`, `stroke` and
  `color`; add a white dashed tag for "proposed" and a dark one for "brand label" if used.
- Notes are left-aligned text blocks: `place` their centre; a 4-line note is about 72 px tall.

## Frame

With the default theme the exporter adds a 44 px footer: hairline, Meltemi mark, the `brand`
text and the diagram `title`; the `stage.*` themes put a taller strip on top. Nothing inside the
sheet changes. Use `theme "editorial.light"` or a file theme with `frame none` for a bare sheet
(see themes.md). Sizes in this guide are those of the technical themes; the stage themes use larger
type, so give explicit `size` values more room or leave them out.
