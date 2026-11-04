## Context

Decision 0043 made the untitled group the container: `group <id> ""` with no description and no
styled icon reserves no title band, nests, carries its children when moved (the session adds a
flow group's descendants to a drag, `session.ts` `moveOperations`; free children are placed in the
interior) and goes to ELK as a compound node (`INCLUDE_CHILDREN`). The canvas reaches it only
sideways: the group tool (G) and Alt+G write a titled group, the shapes grid writes nodes and
boxes, `setElementKind` refuses groups, and a box dropped on a node or box becomes a stack, which
only the composition checks know (`checks.ts` `stacked`: whole inside an earlier box of its layer,
at least 1 px in from one side).

Recompute Layout is `arrangeOperation(scope: "all")`: `layoutDiagram` as `auto` with the engine,
then the `arrange` edit writes every `place`, the `place` and `size` of placed groups, removes the
`via` lists and compass ends of every route and switches to `layout assisted`. The engine's routes
are in that same `LayoutResult.connectors` and are dropped. The next drawing has no unplaced
element, so the engine is not called and every connector follows the anchor rules
(`routePoints`): straight between facing sides, a diagonal when the sides do not overlap, L or Z
detours around obstacles. `parallelLanes` separates only relations between the same two boxes. A
placed and sized group without children is left out of the engine's request in `assisted`
(`bands`), but in `auto` its box is derived from no children and the layout fails with
`layout.missing-placement`, which `arrangeOperation` turns into `undefined` and the canvas into
nothing.

Constraints: language 0.2 unchanged; edits stay minimal CST changes; the layout stays synchronous
and deterministic; the engine stays behind `LayoutEngine`; `assisted` drawings of placed diagrams
must not change where nothing is written anew.

## Goals / Non-Goals

**Goals:** a container one click away and one action away from an existing shape; a stack never
mistaken for a container; Recompute that keeps bands, container sizes and the engine's connectors;
connectors into one side that do not share an anchor, in every mode.

**Non-Goals:** containment inferred from geometry; shaped containers; writing the engine's end
points; bends for Arrange Unplaced; previewing the conversion.

## Decisions

### The container is a kind of group on the palette, not a shape or a kind

The palette's `group` tool gets the split-button treatment of the box, node and relation tools
(`SHAPED_TOOLS` becomes a map of split tools): the main part arms the current group kind, the
arrow opens a two-entry menu with pictures, **Group** (a band with a title) and **Container** (a
plain rectangle), choosing one makes it current (kept in memory, never written) and arms the tool;
G creates the current kind near the centre; Alt+G keeps grouping the selection with a title. The
`createElement` operation gains nothing: a container is `createElement { elementKind: "group",
label: "" }` with `at` and `size`, which already writes `group <id> "" { }`, `place` and `size`
(an empty group needs both). The editor's `defaultLabel("group")` is used for Group only. No style
is written: the theme draws an untitled group as it draws groups, without the band, and fill,
stroke and radius are the inspector's business, as for every group.

- *Alternatives:* a `container` kind (decision 0043 rejected a new kind: every closed kind list);
  a "Container" entry in the shapes grid (a container is not a shape, and the grid's memory of the
  current shape would then create groups from B and N); a fourth palette key (the free letters,
  E, H, J, K, Q, V, W, X, Y, Z, name nothing in either language).
- *Consequence:* `PaletteKind` gains `container` as a canvas-side kind that maps to
  `createElement` of a group with an empty label; the canvas tests of the split buttons cover it.

### Conversion rewrites the declaration in place: `convertToContainer`

`convertToContainer { diagram, element, children: { id, at? }[], size? }` in `@meltemi/diagrams-edit`
(`structure.ts`, beside `groupElements` and `ungroup`):

- the target is a flow `node` or a free `box`; any other kind, sequence diagrams and C4 views are
  `edit.unsafe-target`; an element with `port` statements is `edit.has-dependents` naming them,
  since groups have no named ports;
- the declaration is replaced by `group <id> <label> {` … `}` at the same place: a flow
  `node3[""]` becomes `group node3 "" {`, a free `box b "Label" { description "…"; link x }`
  keeps its `description` and `link` as the first statements of the block (an empty label with no
  description makes it untitled; a label makes a titled group, which is still a group);
- `children` (the host's list) are moved into the block with the `moveElement` edit, in order of
  declaration, each with its `at` when given (free diagrams: interior coordinates; flow diagrams:
  no `at`, places are absolute); a child that is not a sibling of the element, is the element
  itself or is a group holding it is `edit.unsafe-target`;
- `style <id> { … }` statements and rules keep every property but `shape`: `shape square` and
  `shape rectangle` become `radius 0`, other shapes are dropped (a statement left empty goes);
  `class`, `animate` and the element's `layer` stay;
- `place` stays; `size` stays, or is written from `size` (the drawn size the host passes) when the
  element had none, since a placed group needs one; relations whose end is the element stay;
- the inverse restores the text exactly, as every plan.

The host (`session.ts`, action `convertToContainer { id }`) computes `children` from the drawn
boxes with the checks' stack rule (`stacked(outer, inner)` exported from `checks.ts`, same layer,
declared after), the free `at` from the new interior (`interiorOrigin` with `groupPadding` as
header, since the group is untitled) and `size` from the element's box. The context menu of a node
or box and the inspector (a **Convert to container** button under **Inside**) run it; the status
line says `node3 is now a container holding db.`

- *Alternatives:* `setElementKind` to `group` (groups differ in block structure and the operation
  is defined as a kind swap of a leaf; the refusal stays); `groupElements` over the stacked boxes
  plus `removeElement` of the shape (two ids, lost styles and relations, two steps); a conversion
  in the canvas by text replacement (no inverse, no refusals).

### Stacks stay a drawing; the drop says so

After a drop, when a moved element's box is stacked on a node or box of its layer (the same
`stacked` rule) that is not its parent, the session's status says `db is stacked on node3; convert
node3 to a container to move them together.` Nothing is written. The hint is the status of the
move, so it also reaches assistive technology.

- *Alternatives:* reparenting into stacked shapes (changes the meaning of 1.8.0 drops and makes
  every plain shape a container); converting automatically (a drop would rewrite another element's
  declaration).

### A band is a band in every mode

`layoutDrawing` leaves a placed and sized group with no children out of the engine's request in
`auto` as in `assisted`, draws it at its `place` and `size`, and skips its `place` when choosing
the first ignored placement. In `auto` this holds for bands at the top level of the diagram, whose
places are in diagram coordinates; a band nested in an arranged group has no place to keep, since
its group is drawn around children the engine moves, and stays an error as before. The arrange edit writes
nothing new for it (its `place` and `size` are kept with `all`, as today for placed groups).
Recompute therefore keeps bands, and the "band in `layout auto`" non-goal of 0043 closes.

The canvas learns when an arrange is refused: `arrangeOperation` returns the layout's first error
beside `undefined`, and the session answers the `arrange` action with the status
`Fix the problems of the diagram before arranging it: <message>` (the VS Code command keeps its
warning).

- *Alternative:* keeping bands only in Recompute (the `auto` drawing and Recompute would disagree,
  and Recompute is defined as "lay out as `auto`, write what is drawn").

### A written group size is a minimum for the engine

`ArrangeRequest.groups[]` gains `minimum?: { width, height }`, the written `size` of a group
with children in `auto`. The ELK adapter sets on that compound node `elk.nodeSize.constraints:
MINIMUM_SIZE`, `elk.nodeSize.minimum: (w, h)` and `elk.contentAlignment: [H_CENTER, V_CENTER]`.
Tried on the pinned build (0.12.0) with a 160 × 64 child, paddings of 16 and a 238 × 196 minimum:
these three give exactly 238 × 196 with the child centred and the neighbours pushed clear;
adding `MINIMUM_SIZE_ACCOUNTS_FOR_PADDING` gives 238 × 206, so it is not used, and no second pass
is needed. `collect` records every container's box, and `Arrangement` gains an optional
`groups: ReadonlyMap<string, Box>` (engines that leave it out keep working). In `auto`, the box of
a group with a minimum is the union of the engine's box and the box fitted to its children, grown
about its centre to the minimum when an engine gives no box or a smaller one; a group without
`size` stays fitted, so nothing else changes, and `fromBoxes` writes the box.

- *Alternatives:* writing `max(written, derived)` after the layout (neighbours would overlap the
  enlarged box); `elk.nodeSize.fixedGraphSize` (hierarchical layouts of ELK 0.9+ ignore it).

### Recompute writes the engine's bends as `via`

`arrange` gains `routes?: ReadonlyMap<string, readonly Point[]>`: for each relation key, the
drawn points from the `auto` layout (`LayoutResult.connectors[key].points`, diagram coordinates,
ends included). With scope `all`, for a relation whose points have interior bends, the plan writes
`route <id> from <from> to <to> via [(x, y), …]` with the bends rounded to whole units, ends free:
replacing the `via` of an existing route (ends freed as today, named ports kept), or as a new
statement in the placement block; a relation without bends is removed as today. A relation without
an id gains `as <from>_<to>` first, in the same plan, by the existing materialisation
(`relations.ts`). `via` points are diagram coordinates in free diagrams too, as every `via`. The
ends then come from the anchor rules: `routePoints` with `via` projects each end onto the side
facing its first bend (`anchorOnSide`), which is where the engine's route met the box, so the
drawing after Recompute matches the engine's up to rounding.

`arrangeOperation` passes `result.connectors` for scope `all` and nothing for `unplaced`. The
layout command's "same picture" holds for `--all` up to 1 px, which the CLI test checks on the
connector points of both SVGs; `label` statements are untouched, since labels are placed from the
route.

- *Alternatives:* a smarter `assisted` router (it cannot reproduce layered routing around layers
  and back edges, and the engine's routes are already computed); writing the end points as compass
  sides and percentages too (pins every end, which the owner would have to free one by one; the
  projection onto the first bend gives the same point).
- *Consequence:* bends stay when a box is dragged afterwards, as hand-written bends do; the docs
  say Recompute writes them and how to drop them (double-click a bend, or Recompute again).

### Lanes per side replace lanes per pair

`endLanes` gives each relation a lane per end: after the anchor sides of every relation drawn by
the anchor rules are known (first pass: `anchorPoints` with lane 0, which gives `fromSide` and
`toSide`), the free ends (port `auto`, no `via`, not named, no written position) are grouped by
`(box, side)`, and within a side into runs of ends less than a lane apart (16 px, or the labelled
rule of today). A run of `n` ends sorted by the coordinate along the side of each relation's other
anchor (x on north and south, y on east and west; ties by source order) is placed a lane apart
about the middle of its anchors; the second pass applies each end's own offset (`slide`, clamped
to the side). A straight connector moved at one end only moves its other end the same, and one
moved by different amounts at its ends is joined square to its sides (`portElbows`). A relation
between the same two boxes is one such run on each side, so the parallel lanes of today come out
the same. Engine routes (`followEngine`) are untouched, since ELK spreads its ports; pinned ends
never move. Obstacle avoidance (`avoidingRoute`, `detourRoute`) keeps the old gate: relations in
parallel lanes between the same two boxes are not rerouted.

Spreading every shared side, even ends already apart, was tried first: it turned four straight
connectors of the corpus and examples into Z shapes with 11 px jogs. Spreading only runs that
collide changes one sheet of the corpus, `free/composition`, whose two connectors into one side
ended 1 px apart.

- *Alternatives:* ELK-style even spreading `(i + 1) / (n + 1)` of the side (sends ends to the
  thirds of a wide box; 16 px lanes keep connectors near the centre); leaving `manual` alone (the
  owner's picture is `assisted` with everything placed, which draws as `manual`).

### Where the code goes

- `@meltemi/diagrams-layout`: `bands` in every mode (`layout.ts`), `groups` minimum and engine
  boxes (`arrangeRequest`, `layoutDrawing`), `sideLanes` (`layout.ts`, `routing.ts`), `stacked`
  exported (`checks.ts`), `LayoutResult.firstError` is not needed: `arrangeOperation` reads
  `diagnostics`. Public: `ArrangeRequest.groups[].minimum`, `Arrangement.groups`.
- `@meltemi/diagrams-layout-elk`: the four size options, `collect` of container boxes, the second
  pass.
- `@meltemi/diagrams-edit`: `convertToContainer` (`structure.ts`, `types.ts`, `plan.ts`, messages),
  `arrange.routes` and the route writing (`plan.ts`).
- `@meltemi/diagrams-editor`: `arrangeOperation` with routes and refusal reason; session actions
  `convertToContainer`, the stack hint, the refused-arrange status, the `container` palette kind;
  inspector button; messages.
- `@meltemi/diagrams-canvas`: the split group button and its menu, the context menu entry, the
  inspector entry, glyphs for Group and Container, messages en/es.
- `@meltemi/diagrams-cli`: nothing but tests (`layout --all` writes bends through the edit).

## Risks / Trade-offs

- [A later ELK ignores `nodeSize.minimum` on compound nodes] → the layout grows the group about its
  centre to the minimum, and the adapter test on the minimum fails on the upgrade.
- [`via` lists make `placement` longer] → only routes with bends get one; Recompute again rewrites
  them; the docs name the double-click that drops a bend.
- [Lanes reorder when a box moves past another] → the order is by the other end's coordinate, so
  a swap is a crossing avoided, and the drawing is still deterministic.
- [A conversion of a labelled node makes a titled group] → documented; the owner's case has an
  empty label, and the inspector's label field empties a title.
- [Snapshot churn] → every snapshot of a file arranged with `--all` gains `via` lists; regenerated
  and reviewed once.
- [A band placed where the engine puts boxes] → in `auto` the band is not an obstacle, as in
  `assisted`; a box under it is a stack by the 1.8.0 rule and raises no warning.
