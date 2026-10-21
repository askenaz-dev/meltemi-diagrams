## Why

Trying 1.8.0, the owner drew a pink square (`shape square` with a fill), dropped the database on
it and pressed **Recompute Layout**: the square went to a corner and the database joined the row,
because a box stacked on a box is a drawing, not a container. The container the language has, the
untitled group of decision 0043, can only be reached from the canvas by creating a titled group
and emptying its title, and nothing turns the square the owner already has into one. The
recomputed drawing was also worse than the one the engine made: Recompute writes ELK's positions
and throws away ELK's routes, so a back edge ran along another connector, two connectors into the
same side of a box shared their anchor and arrowhead, and a box the engine left a few pixels off
its neighbour got a diagonal. And a band drawn with nothing inside makes Recompute refuse the
whole diagram, silently from the canvas.

## What Changes

- **A container on the palette.** The group button becomes a split button like the box and
  relation buttons: its main part arms the current kind of group, its arrow offers **Group** (with
  a title) and **Container** (untitled, a plain container). G creates the current kind near the
  centre. A container is written `group <id> ""` with its `place` and `size`, drawn as the theme
  draws groups, with no title band; fill, stroke and radius are chosen in the inspector as for any
  group.
- **Convert to container.** The context menu and the inspector offer it for a flow node or a free
  box. A new `convertToContainer` edit rewrites the declaration as a group with the same id, label
  and description, moves the boxes stacked on it (whole inside it, declared after it, on its layer)
  into its block, keeps its `place`, `size`, styles, class, link and animations, drops `shape`
  (`square` and `rectangle` become `radius 0`, since groups are rectangles) and writes the drawn
  size when the element had none. Relations keep their ends. A node with named ports is refused.
- **A hint for stacks.** When a drop leaves a box stacked on a node or box that is not a group,
  the status line says so and names the conversion, so a stack is never mistaken for a container.
- **Bands survive Recompute.** A group with `place` and `size` and no children is drawn where it
  is in `layout auto` too, out of the engine's request, as `assisted` already does; its `place` is
  not reported as ignored. Recompute no longer refuses a diagram for a band, and when an arrange is
  refused the canvas says why in the status line instead of doing nothing.
- **A container keeps its size through Recompute.** The written `size` of a group is the minimum
  the engine lays it out at, with its children centred inside; `arrange` writes the engine's box,
  so a container drawn larger than its content stays that large.
- **Recompute keeps the routes.** `arrange` with scope `all` writes the bends of the engine's
  routes as `route <id> from <a> to <b> via [...]`, ends free, rounded to whole units; a route the
  engine drew straight is removed as today. An anonymous relation that needs a route is named
  first. Exporting an `auto` diagram, arranging it with `--all` and exporting again gives the same
  connectors.
- **Lanes on a shared side.** In every drawing by the anchor rules, the free ends of relations
  that meet the same side of the same box spread along that side, 16 px apart (or a label's height
  for labelled ones), in the order of their other ends so the connectors do not cross. This
  replaces the parallel lanes of relations between the same two boxes, which it includes.
- Docs (`docs/editor.md`, `docs/language/layout.md`, `svg-export.md` and the Spanish versions,
  the skill's references), decision 0044 and the CHANGELOG entry of the unreleased 1.8.0.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `diagram-canvas`: the split group button and the container kind, Convert to container, the stack
  hint, the status of a refused arrange.
- `source-editing`: `convertToContainer`; `arrange` takes routes.
- `layout-actions`: `arrange` with scope `all` writes bends and the engine's group boxes; the
  layout command keeps the picture with `--all`.
- `layout-modes`: bands in `auto`; a written group size is a minimum; the engine interface returns
  group boxes.
- `connector-routing`: lanes on a shared side.
- `elk-adapter`: minimum sizes of compound nodes, centred content, group boxes returned.

## Non-goals

- A container with a shape other than a rectangle: groups stay rounded rectangles (decision 0043).
- Reparenting into a stacked shape on drop, or reading containment from geometry at layout time:
  a node is not a container, and a stack stays a drawing.
- Writing the engine's end points (compass sides and percentages) at Recompute: ends stay free and
  the anchor rules project them onto the first bend.
- Bends for **Arrange Unplaced**, which keeps routes as they are.
- Live preview of the conversion; a reverse "Convert to box" (`ungroup` already dissolves a group).

This is a post-1.0 change outside `docs/roadmap-1.0.md`; it joins the unreleased 1.8.0.

## Impact

- Language: nothing; `group <id> ""`, `via` and `radius` are already language 0.2.
- Layout: bands in `auto`, the engine's box for a sized group, lanes per side, `Arrangement.groups`.
- ELK adapter: `elk.nodeSize.minimum` and `MINIMUM_SIZE` on compound nodes, centred content, group
  boxes collected from the laid-out graph.
- Edit: `convertToContainer`; `arrange.routes` and the route writing; naming of anonymous
  relations in the same plan.
- Editor and canvas: the split group button and `container` palette kind, the Convert action, the
  stack hint, the refused-arrange status, the inspector entry, messages in English and Spanish;
  `arrangeOperation` passes routes and group boxes.
- CLI: `layout --all` writes bends.
- Corpus: edit fixtures for the conversion, an acceptance edit scenario, snapshots of arranged
  files that gain `via` lists.
- Docs: `docs/editor.md`, `docs/language/layout.md`, `docs/language/svg-export.md` and their
  Spanish versions, the skill's layout and editor references, decision 0044, CHANGELOG 1.8.0.
