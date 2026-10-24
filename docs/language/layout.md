# Layout

[Español](../es/language/layout.md)

A flow diagram is arranged in one of three modes. You can mix written positions with automatic
arrangement, add constraints that line boxes up, name ports on boxes and choose how connectors are
drawn. The same rules apply in the command line, the editor and every export. Free diagrams use the
same modes with `layout manual` as their default, and place group children inside their group
([free.md](free.md)). Sequence diagrams have their own layout, from the order of their events
([sequence.md](sequence.md)); C4 views use the flow layout ([c4.md](c4.md)). When the engine
arranges a diagram, it leaves room for relation labels between the boxes.

## Modes

```text
diagram checkout: flow {
  direction LR
  layout assisted
  ...
}
```

| Mode             | Positions                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------- |
| `auto` (default) | The layout engine arranges every box. `place` statements and route waypoints are ignored. |
| `assisted`       | Placed boxes stay exactly where they are; the engine arranges the others around them.     |
| `manual`         | Every box needs a `place`; a missing one is `layout.missing-placement`.                   |

- **`auto`**:
  - Every box, note and tag is arranged. Groups fit their children, and a group's own `place` is
    ignored too. A group's written `size` is the least size the engine gives it, its children
    centred inside, so a container drawn larger than its content keeps its size.
  - A group at the top level with `place` and `size` and nothing inside, a band, stays where it is
    written, out of the engine's way, as in `assisted`; its `place` is not reported. A band inside
    a group the engine arranges has no place to keep and is `layout.missing-placement`.
  - The first ignored `place`, or `route` with waypoints, is reported once as
    `layout.placement-ignored`, with the hint to use `layout assisted`.
  - `size`, `label`, the ports of `route` statements, constraints and styles apply as usual.
  - Connectors follow the engine's orthogonal routes.
- **`assisted`**:
  - The engine arranges the whole graph.
  - Each unplaced box keeps its offset from the placed box nearest to it in that arrangement.
  - A box that would then overlap one already positioned moves away from that placed box, along
    the layout direction, until it is clear.
  - A group with both `place` and `size` is neither arranged nor in the way of the arranged boxes,
    so an untitled group on a back layer is a band behind them
    ([free.md](free.md#layers-and-order)).
  - Connectors use the anchor rules of [svg-export.md](svg-export.md).
- **`manual`**: positions are only what is written.

`direction` (`LR`, `RL`, `TB`, `BT`) sets the flow of the arrangement. Primary relations (`->`)
weigh more than secondary ones (`-->`) when the engine straightens edges.

### The engine

The command line, the editor and every export use ELK's layered algorithm (`elkjs` 0.12.0, in
`@meltemi/diagrams-layout-elk`; see decision 0015). The arrangement is deterministic:

- the same source gives the same picture;
- boxes keep their source order within each layer;
- adding an unrelated box does not reorder the existing ones.

Hosts pass an engine to `layoutDiagram(compilation, diagram, { engine })`. Without one, `auto` and
`assisted` diagrams render only when every box is placed, and report `layout.mode-unsupported`
otherwise. An engine is any object with a synchronous `arrange(request)`:

- the request lists boxes with their sizes, parent groups, ports and, in `assisted`, the fixed
  centres; groups with their paddings, whose top is the title band of a titled group and
  `groupPadding` for an untitled one; and relations with their ports and kind;
- the engine returns every box's centre and every relation's points.

An engine that throws is reported as `layout.engine-failed`.

### Writing positions down

`meltemi-diagrams layout <file.meltemi>` runs the engine and writes what it would draw:

- **without options**: a `place` for every unplaced box, around the placed ones, as `layout
assisted` draws them;
- **`--all`**: arranges everything anew, rewrites every `place` (and the `place` and `size` of
  placed groups) and hands connection points back to the engine: compass sides and points go and
  named ports stay. The bends of the connectors the engine draws are written as waypoints, ends
  free (`route store from api to db via [(860, 120)]`), naming an anonymous relation
  `<from>_<to>` first; a route left with nothing is removed. The connectors exported after it have
  the bends they had before it, each within 1 px.

In free diagrams both also write a `place` and a `size` for every arranged group, and the places
of group children relative to the group's interior.

Both turn `layout auto` into `layout assisted`, so the file keeps the picture. Other options:

| Option           | Effect                                                 |
| ---------------- | ------------------------------------------------------ |
| `--diagram <id>` | arranges one diagram                                   |
| `--check`        | writes nothing and exits 1 when something would change |
| `--stdout`       | prints the result instead of writing it                |

Dragging a box in the editor writes its `place` and also turns `layout auto` into `layout
assisted`. Editors call `planEdit()` with the `arrange` operation, which is the same edit the
command makes.

## Named ports

A box can declare ports in its block. Routes then connect to them by name:

```text
bus["Event bus"] {
  port in west
  port out east 30%
}
placement {
  route publish from api.east to bus.in
}
```

- `port <name> <side> [<n>%]` puts a port on `north`, `south`, `east` or `west`. The percentage
  runs along the side, left to right or top to bottom, and is 50 % by default.
- Port names are identifiers other than the compass words and `auto`. A duplicate is
  `ref.duplicate-id`.
- A route that names a port the box does not declare is `placement.unknown-port`, with the box's
  ports in the hint.
- A named port is a point: connectors start or end exactly there and leave along the side's normal.
  Compass ports only choose the side; the anchor rules choose the point.
- A percentage after a compass side pins a route's end to that point of the side, read as in
  `port`: `route publish from api.east 50% to bus.in` leaves the middle of `api`'s east side. The
  end then anchors like a named port, in every layout mode, and bends do not move it. After `auto`,
  a bare element or a named port, or outside 0 to 100, the percentage is `prop.invalid-value`.
- On a box drawn with a shape other than a rectangle (a decision's diamond, a data store's
  cylinder, a `shape hexagon` node), a port or a pinned point is drawn where the side's normal
  through it meets the outline; the text keeps the side and the percentage
  ([free.md](free.md#text-and-shapes)).

## Constraints

Constraints go in `placement` blocks and hold in every mode:

| Statement                              | Meaning                                                                 |
| -------------------------------------- | ----------------------------------------------------------------------- |
| `align a, b, c top`                    | equal top edges; also `bottom`, `left`, `right`                         |
| `align a, b, c middle`                 | equal vertical centres; `center` gives equal horizontal centres         |
| `row a, b, c`                          | the same as `align a, b, c middle`                                      |
| `column a, b, c`                       | the same as `align a, b, c center`                                      |
| `order a, b, c [horizontal\|vertical]` | strictly increasing centres in the written order; axis from `direction` |
| `distance a, b 80`                     | at least 80 px between the two boxes, edge to edge                      |

- **Who moves.** Placed boxes never move. Free boxes are moved until every constraint holds:
  - aligned boxes take the first placed member as reference, or else the mean of the free ones;
  - ordered boxes are pushed past their predecessor plus 40 px;
  - a box closer than `distance` is pushed away.
- **Conflicts.** What still fails after 20 rounds is `layout.constraint-conflict` (error) on the
  statement, naming the boxes and how far off they are. The picture is still drawn.
- **`manual`.** Every box is placed, so constraints only check the positions.
- **Model errors.** Constraints apply to boxes, notes and tags, not groups. The model reports:
  - an unknown box (`ref.unknown-element`);
  - a box listed twice;
  - an `align`, `row` or `column` with a single box;
  - a `distance` without exactly two boxes and a positive gap.

## Connectors

```text
routing orthogonal          // diagram default
style notify { routing bezier }
```

`routing` is a diagram property and a relation style property (also through classes and `rule
relation`):

| Value            | Connector                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------ |
| `auto` (default) | the anchor rules of [svg-export.md](svg-export.md), or the engine's routes in `auto` mode                    |
| `orthogonal`     | horizontal and vertical segments through the anchors and waypoints, leaving and entering square to the sides |
| `polyline`       | straight segments between the anchors and waypoints                                                          |
| `bezier`         | a smooth curve through the anchors and waypoints, leaving and entering square to the sides                   |

The engine's routes are orthogonal, so in `auto` mode `polyline` and `bezier` connectors join their
anchors directly.

**Rounded corners.** `corners rounded` (a relation style, or the theme token for every relation)
replaces each bend of an `auto`, `orthogonal` or `polyline` connector by a curve that starts 10 px
from the bend, or half the shorter segment when that is less. The built-in themes keep `sharp`
corners, but for the `sketch.*` pair, which rounds them; `bezier` connectors are smooth already.

**Lines without heads.** A relation written `--` or `---` is routed exactly as an arrow: the anchor
rules, the lanes, the detours and the gaps under group titles apply, and the line reaches both
boxes, since there is no head to stop at.

**Free lines.** A `line` of a free diagram ([free.md](free.md#lines)) is a connector whose anchors
and waypoints are its written points, moved by its parent's interior origin. It is `polyline` by
default, and for `auto` too, since it has no box to anchor to: straight segments through its
points. `routing orthogonal` puts one elbow between two consecutive points that differ on both
axes, the first segment along the axis of the longer step (`from (0, 0) to (200, 100)` goes
through (200, 0)); `routing bezier` curves through every point; `corners rounded` rounds its
bends. Its heads are `arrowtail` and `arrowhead`, none by default, cut from the line as a
relation's are. A line takes no lane, no detour and no gap under a group title, and the
composition checks between boxes leave it out: its points are where you wrote them. A line whose
points coincide is drawn as a dot of its width and reported as `layout.degenerate-line`
(warning).

**Turned elements.** A connector meets an element turned by `rotation` on its turned outline. A
free end is routed to the turned drawing's bounding box, like any box, and slides from that box's
side onto the outline. A named port or a pinned point (`api.north 30%`) is found on the unturned
element and turns with it: `api.north` of a node turned by 90 degrees faces east, and the connector
leaves it eastwards. In `layout auto` the engine arranges the turned drawing's bounding box, and the
element's box is centred on it.

**Around other boxes.** In every mode, an `auto` or `orthogonal` connector with no waypoints and
no parallel lane whose route — the engine's or the anchor rules' — would run through another box
goes around it. With both ends free it first takes the L- or Z-shaped route between the middles of
two sides that crosses the fewest boxes, then the shortest one. When that still crosses a box, or
an end is pinned (`api.south`, `api.south 30%` or a named port), it takes the shortest orthogonal
detour that leaves and enters where the connector did, square to those sides, with as few bends
as it can. A connector nothing stands in the way of keeps its route. A box or group that holds one
of the connector's ends (a group around it, a box it is stacked inside) is not in the way, nor is
a box on another layer than the relation, so connectors cross containers and bands straight.

**Labels the layout places.** A relation's label without a `label` statement sits in the middle
of its connector when that spot is clear; otherwise it slides along the connector, out from the
middle, to the first spot where it covers no box, no group title, no other label and no other
connector. `label <relation> at <n>%` places it by hand.

**Group titles.** A straight connector that crosses a group's title (and its description) is
drawn with a gap there, so it passes under the title instead of over it. Untitled groups have no
title band, so they cut no gap and labels may sit at their top.

**Lanes.** Free ends of connectors drawn by the anchor rules (no waypoints, no named port, no
point of a side) that meet the same side of a box less than a lane apart are spread a lane apart:
16 px, or a label's height plus 4 px on a side holding labelled relations. The ends of a run are
ordered along the side by where each connector's other end is, so they do not cross, and centred
on the middle of their anchors. A straight connector moved at one end moves at the other too, so
it stays straight. Relations between the same two boxes, in either direction, are such ends at
both boxes, so they run in parallel lanes 16 px apart.

## Composition checks

After every layout the scene is checked. Each finding is a warning on the later element's statement:

| Code                           | Finding                                                                                                                                                        |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `layout.overlap`               | two boxes of a layer intersect, unless the later one lies strictly inside the earlier one; a box crosses the edge of a group, or lies over a group not its own |
| `layout.label-under-connector` | a relation label lies on another relation's connector                                                                                                          |
| `layout.container-margin`      | a box in a placed and sized group of its layer is within half the group padding of its edge, or in its title band (an untitled group has none)                 |
| `layout.connector-overlap`     | two connectors run along each other for more than 24 px                                                                                                        |
| `layout.connector-crossing`    | a connector runs through a box of its layer that it does not join and that does not hold one of its ends; a shaped box by its outline                          |
| `layout.label-cut`             | a text goes beyond its shape's text area, its label's background or the picture                                                                                |
| `layout.label-overlap`         | a text overlaps another text, the box of an element it does not belong to, or another connector                                                                |

`layout.connector-overlap` also keeps the primary flow (`->`) apart from secondary dependencies
(`-->`); ELK already routes primary relations straighter. Notes and tags are annotations that you
place on boxes on purpose, so their boxes are not checked; their text still must not cover other
text. In free diagrams, texts, icons and images are annotations too.

- **Stacks.** A box declared after a box of its layer that holds it, strictly inside it, is a
  deliberate stack, drawn over it, and is not reported; a partial overlap is, and so are two boxes
  that coincide. A stack declared inner first is reported on the outer box, naming both, with a
  hint to declare the outer box first. Moving an inner box to the back therefore turns a clean
  stack into a finding.
- **Layers.** Boxes and groups on different layers are not checked against each other, and a
  connector is not checked against boxes on another layer, so a band on a back layer may lie
  under boxes and connectors.
- **Containers.** A group or box that holds one of a connector's ends is not crossed by it, and a
  container's own text may lie over the boxes it holds; two texts drawn at the same point are still
  `layout.label-overlap`, so stacked boxes need empty or separate labels.
- **Shapes.** A connector that passes through a diamond's empty corner does not cross it:
  `layout.connector-crossing` follows the outline of shaped boxes, and `layout.label-cut` measures
  their text against the shape's text area. `layout.overlap` compares the rectangles.

The label checks (`label-cut`, `label-overlap`) look at the drawing itself: every text, measured
with the theme's fonts, against its own shape's text area, the other texts, the boxes and the drawn
connectors, in every profile. A text already named by another finding (an overflowing `size`,
overlapping boxes, a label on a connector, a connector through a box) is not reported again. The
acceptance corpus keeps every profile at zero (`docs/quality.md`).

`meltemi-diagrams validate` and `export` print the findings, as the editor shows them.
