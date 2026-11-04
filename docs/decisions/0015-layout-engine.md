# 0015. Layout engine, constraints and routing

Status: accepted (layout-engine change, 10 October 2026)

## Context

Until this change only fully placed diagrams rendered: `layout auto` and `layout assisted` reported
`layout.mode-unsupported`. The proposal asks for several things:

- automatic and assisted layout that respects written positions;
- strong constraints and explicit conflicts;
- named ports and several route kinds;
- composition checks;
- an engine that can be replaced.

It names ELK. Layout must stay synchronous, because every host, edit and test calls
`layoutDiagram` synchronously.

## Decision

- **Engine interface.** `@meltemi/diagrams-layout` defines `LayoutEngine.arrange(request)`, which
  is synchronous.
  - The request lists boxes with sizes, parent groups, ports and fixed centres, groups with their
    paddings, and relations with ports and kind.
  - The result gives centres and edge points.
  - Hosts pass the engine in `LayoutOptions.engine`. Without one, unplaced `auto` and `assisted`
    diagrams report `layout.mode-unsupported`.
- **ELK.** `@meltemi/diagrams-layout-elk` wraps `elkjs` 0.12.0, pinned exactly.
  - It loads `elkjs/lib/elk-worker.min.js` and calls its dispatcher directly, which lays out
    synchronously.
  - It uses the layered algorithm: the direction mapped to `elk.direction`, groups as compound
    nodes with `INCLUDE_CHILDREN`, and orthogonal routing.
  - Spacing is 40, 70 and 16 px.
  - Stability comes from model order and a fixed random seed. Primary relations get priority for
    straightness and direction.
- **Ports in ELK.**
  - Named ports are fixed points.
  - Every other relation end of a box with ports gets its own port, on its compass side or on the
    side where relations enter or leave. With `FIXED_POS`, ELK attaches a relation without a port
    to a corner of the box, which bent straight chains by half a box.
- **Modes.**
  - `auto` takes ELK's centres and routes and ignores places, reporting the first one.
  - `assisted` fixes placed boxes. Each free box keeps its offset from the nearest placed box in
    ELK's arrangement, and is pushed out of overlaps along the direction.
  - A single mean offset broke the order of boxes when the placed ones were further apart than ELK
    would put them.
- **Constraints.**
  - `align`, `row`, `column`, `order` and `distance` are solved after arrangement by projecting
    free boxes for up to 20 rounds.
  - Placed boxes never move. What still fails is `layout.constraint-conflict`, and the scene is
    still drawn.
- **Routing.**
  - `routing auto|orthogonal|polyline|bezier` is a diagram property and a relation style.
  - Bézier connectors are Catmull-Rom curves drawn as paths.
  - In `auto` mode, straight and curved connectors join their anchors directly, because a curve
    through ELK's orthogonal bends loops.
  - Parallel relations take lanes 16 px apart.
- **Composition checks.** The checks for overlaps, labels under connectors, group margins and
  connectors running together are warnings. They sweep boxes sorted by x, so 500 boxes take
  milliseconds instead of the half second of a pairwise check.
- **Writing positions down.**
  - `planEdit` gains `arrange`, and `setPosition` turns `layout auto` into `layout assisted`.
  - `meltemi-diagrams layout` lays a diagram out with `LayoutOptions.layout` set to `assisted`, or
    to `auto` with `--all`.
  - It reads `LayoutResult.boxes` in diagram coordinates and writes them with `arrange`. Exporting
    before and after gives the same SVG.

## ELK licence

`elkjs` is licensed `EPL-2.0 OR GPL-3.0-or-later`; Meltemi Diagrams uses it under EPL-2.0.

- It is installed unmodified from npm and imported only by `@meltemi/diagrams-layout-elk`, so the
  rest of the code base does not depend on it.
- `THIRD_PARTY_LICENSES.md` lists it with its licence.
- Builds that bundle it, such as the editor or the playground, must ship the EPL-2.0 notice and say
  where its source is: `https://github.com/kieler/elkjs`, version 0.12.0.
- Changes to elkjs itself would have to be published under EPL-2.0. We make none.

## Alternatives considered

- **An asynchronous engine API.** It would make every host, edit and test asynchronous for one
  dependency. If the synchronous dispatcher ever disappears, an asynchronous host can wrap the
  public promise API behind the same interface.
- **Our own layered algorithm.** It would repeat years of work that ELK already does well, and the
  proposal names ELK.
- **Dagre.** It is unmaintained, has no compound-node ports and does not route orthogonally.
- **Solving constraints inside ELK.** ELK's layered algorithm has no general alignment
  constraints. Projecting afterwards keeps placed boxes exact and conflicts explicit.

## Consequences

- The command line, the editor and every export pass the ELK engine. The corpus SVG tests render
  `auto` and `assisted` sheets with it.
- Sheets that write `place` without a `layout` statement now get `layout.placement-ignored`. They
  should say `layout manual`, or `layout assisted` when they want the engine to place the rest.
- Exporting with `--stdout` prints diagnostics to stderr, so stdout holds only the SVG.
