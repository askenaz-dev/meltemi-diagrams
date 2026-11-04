# 0044. Containers from the canvas, and arrangements that keep the picture

Status: accepted (containers-and-arrange-routes change, 19 October 2026)

## Context

Trying 1.8.0, the owner drew a square with a fill, dropped a database on it and chose
**Recompute Layout**. The square went to a corner and the database joined the row. A box stacked
on a box is a drawing (decision 0043): the model has no "inside" for it, the engine arranges both
as separate nodes, and moving the square leaves the database behind. The container the language
has, the untitled group, could only be reached by creating a titled group and emptying its title.

The recomputed drawing was also worse than the one the engine had made. Recompute wrote ELK's
positions and removed every route, and the next drawing, in `layout assisted` with every box
placed, used the anchor rules: a back edge ran along another connector, two connectors into one
side shared their anchor and arrowhead, and a box a few pixels off its neighbour got a diagonal.
A band with nothing inside made Recompute refuse the whole diagram, without a word on the canvas,
and a container drawn larger than its content shrank to fit it.

## Decision

- **The container is a kind of group on the palette.** The group button is split like the box,
  node and relation buttons: **Group** writes a titled group, **Container** an untitled one, with
  its place and size and no style. G creates the current kind; Alt+G keeps grouping with a title.
  A new container opens no label editor.
- **A box becomes a container in one edit.** `convertToContainer` rewrites a flow node or a free
  box as a group with the same id, label and block, moves in the siblings stacked on it (by the
  checks' stack rule: whole inside, declared after, same layer), keeps its styles but `shape`
  (`square` and `rectangle` become `radius 0`), keeps its `place` and writes its drawn `size` when
  it had none. It is planned in steps on the text each step leaves: styles while it is still a
  node, then the declaration, the moves and the size. Elements with named ports are refused. The
  context menu and a button beside **Inside** run it.
- **Stacks stay drawings, and the canvas says so.** A drop that leaves a box stacked on a node or
  box that is not a group writes the move only, and the status line names the conversion.
- **A band is a band in `auto` too.** A placed and sized group without children at the top level
  is drawn where it is written and left out of the engine's request in `layout auto`, as in
  `assisted`; its `place` is not reported as ignored.
- **A written group size is a minimum.** In `auto` the engine receives the written size of a group
  with children and lays it out at least that large, its children centred
  (`elk.nodeSize.constraints MINIMUM_SIZE`, `elk.nodeSize.minimum`, `elk.contentAlignment`), and
  returns the boxes of its groups. Engines that return none leave the group grown about its centre.
- **Recompute writes the bends.** The `arrange` operation takes the drawn points of the connectors;
  with scope `all` it writes their bends as `via` with free ends, naming anonymous relations first.
  The anchor rules project each free end onto the side facing its first bend, which is where the
  engine's route met the box, so the drawing after Recompute is the drawing before it.
- **Ends that collide on a side take lanes.** Free ends of connectors drawn by the anchor rules
  that land less than a lane apart on one side are spread a lane apart about their middle, ordered
  by where their other ends are; a straight connector moves whole. Parallel relations between two
  boxes are the special case they already were.

## Alternatives considered

- **A `container` kind, or a Container entry in the shapes grid.** A kind reopens every closed list
  0043 avoided; a shape is something B and N repeat, and a container is not a shape.
- **Reparenting into any box under a drop, or reading containment from geometry at layout time.**
  Every plain shape would become a container, and the meaning of 1.8.0 drops would change.
- **A smarter router for `assisted`.** It cannot reproduce layered routing around layers and back
  edges, and the engine's routes are already computed when Recompute runs.
- **Writing the engine's end points as `side n%`.** It pins every end, which the owner would free
  one by one; the projection of the first bend gives the same point.
- **Spreading every shared side.** Tried first: it bent four straight connectors of the corpus into
  Z shapes with 11 px jogs. Only colliding runs are spread, which changes one corpus sheet.
- **Growing the group after the layout to its written size.** Its neighbours would overlap it; the
  engine leaves them room when the minimum is part of the request.

## Consequences

- Files recomputed with `meltemi-diagrams layout --all` or **Recompute Layout** gain `route … via`
  statements for bent connectors. Bends stay when a box is dragged afterwards, as hand-written ones
  do; a double-click drops one, and recomputing rewrites them.
- The `arrange` operation, `ArrangeRequest.groups[].minimum`, `Arrangement.groups`, the
  `convertToContainer` operation and canvas action, and the inspector field's `button` are new
  public surface of the edit, layout and editor packages. The language stays 0.2.
- `free/composition` in the corpus draws its two connectors into one side 16 px apart instead of
  1 px.
