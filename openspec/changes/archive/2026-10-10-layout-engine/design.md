## Context

- `layoutDiagram` is synchronous and only renders fully placed diagrams.
- Anchors follow decision 0006: projected waypoints, overlap centres and elbows.
- Ports are compass points written in `route` statements. Groups without `place` and `size` fit their children.
- `elkjs` 0.12.0 runs the Java ELK compiled to JavaScript. Its public API returns promises, but its bundled worker exposes a dispatcher that lays out synchronously when called directly; a probe gave about 80 ms to load and under 60 ms for a first layout.
- Text, icons and default sizes are measured before layout.

## Goals / Non-Goals

**Goals:**
- `auto` and `assisted` render with a professional layered layout, and placed elements never move.
- Constraints are strong and conflicts are explicit.
- Route kinds and lanes give readable connectors; checks catch common composition faults.
- The engine is replaceable, and ELK's licence stays in its own package.

**Non-Goals:**
- Layout of other profiles, and canvas interaction (roadmap changes 8 to 11).

## Decisions

### D1. A synchronous engine interface

```ts
interface LayoutEngine {
  readonly name: string;
  arrange(request: ArrangeRequest): Arrangement;
}
```

- **Requests** carry:
  - nodes with sizes, parent group and kind;
  - for `assisted`, the fixed centre of placed nodes;
  - ports with side and position;
  - groups with their paddings;
  - edges with endpoints, ports and whether they are primary (`->`) or secondary (`-->`);
  - the direction and spacings.
- **Arrangements** return node centres and edge points.
- Keeping it synchronous keeps `layoutDiagram` and every caller synchronous.

The ELK adapter loads `elkjs/lib/elk-worker.min.js` through `createRequire`, registers the layered algorithm once, and calls the worker's dispatcher directly. This relies on the shape of `elkjs` 0.12.0, which is pinned exactly; the adapter's tests fail if a different version changes it.

| Alternative | Why not |
|---|---|
| Asynchronous layout throughout | Every host, test and edit path would become asynchronous for one dependency |
| Our own layered algorithm | Years of work ELK already did; the proposal names ELK |

### D2. ELK mapping

| Meltemi | ELK |
|---|---|
| direction `LR`, `RL`, `TB`, `BT` | `elk.direction` `RIGHT`, `LEFT`, `DOWN`, `UP` |
| groups | compound nodes; `elk.hierarchyHandling INCLUDE_CHILDREN`; padding from `groupPadding` and `groupHeader` |
| named ports | ELK ports at their exact position, `portConstraints FIXED_POS`, shared by their relations |
| compass ports, and the other relation ends of a box with ports | one ELK port per relation end, on the written side or on the side where relations enter or leave, spread along it; `FIXED_SIDE` when the box has no named ports |
| primary relations (`->`) | `elk.layered.priority.straightness` 10, `direction` 10 |
| secondary relations (`-->`) | priority 0 |
| spacing | `spacing.nodeNode` 40, `spacing.nodeNodeBetweenLayers` 70, `spacing.edgeEdge` 16, `spacing.edgeNode` 20 |
| stability | `considerModelOrder.strategy NODES_AND_EDGES`, `crossingMinimization.forceNodeModelOrder`, `randomSeed 1` |
| routing | `elk.edgeRouting ORTHOGONAL` |

Relation labels are not passed to ELK; they are placed on the routes afterwards, as today.

### D3. Modes

- **`manual`**: unchanged.
- **`auto`**:
  - All non-group elements are arranged. The scene's groups fit their children, unless they are placed and sized; in `auto` those are ignored too.
  - `place` statements and `route` statements with waypoints are reported once as `layout.placement-ignored` (warning) on the first such statement. `size`, `label` and port-only `route` statements apply.
  - Connectors use ELK's bend points with `routing auto` or `orthogonal`. ELK's routes are orthogonal, so `polyline` and `bezier` join their anchors directly; a curve through orthogonal bends loops.
- **`assisted`**:
  - Placed elements are fixed. ELK arranges the whole graph.
  - Each free element keeps its offset from the fixed element nearest to it in the arrangement. A single mean offset was tried first; it broke the order when the fixed elements were further apart than ELK would place them.
  - A free element that then overlaps a positioned box is pushed away from that fixed element, along the layout direction, until it is clear.
  - Connectors use the anchor rules of decision 0006, since ELK's routes do not match the moved nodes.
- **Constraints** (D5) run after arrangement, in every mode.

### D4. Named ports

```text
bus["Event bus"] {
  port in west
  port out east 30%
}
placement {
  route publish from api.east to bus.in
}
```

- `port <name> <side> [<n>%]`: `side` is `north`, `south`, `east` or `west`; the percentage runs along the side (left to right, top to bottom), 50 % by default.
- Names are identifiers other than the compass words and `auto`. A duplicate is `ref.duplicate-id`.
- Routes may name ports; an unknown one is `placement.unknown-port`, listing the element's ports.
- The anchor of a named port is that point. Projection onto the side (decision 0006) applies only to compass ports.

### D5. Constraints

| Statement | Meaning |
|---|---|
| `align a, b, c top` | equal top edges (`bottom`, `left`, `right` likewise) |
| `align a, b, c middle` | equal vertical centres; `center` gives equal horizontal centres |
| `row a, b, c` | `align … middle` |
| `column a, b, c` | `align … center` |
| `order a, b, c [horizontal\|vertical]` | strictly increasing centres along the axis, in the written order; the default axis follows `direction` |
| `distance a, b 80` | at least 80 px between the two boxes, edge to edge |

- The solver projects free elements onto each constraint in turn, for up to 20 rounds:
  - **align**: the reference is the first fixed member, or the mean of the free ones;
  - **order**: free members are shifted past their predecessor plus the node spacing;
  - **distance**: the free member is pushed away.
- Fixed elements never move. Whatever is still violated afterwards is `layout.constraint-conflict` (error) on the statement, naming the elements and the gap or difference. The scene is still produced.
- In `manual`, constraints are only checked.
- The model reports unknown targets (`ref.unknown-element`), repeated targets, a single-target `align`, `row` or `column`, and bad values (`prop.invalid-value`).

### D6. Routing

- **`routing`**, a diagram property and a relation style property (`auto` by default):
  - `auto`: decision 0006, or ELK's routes in `auto` mode;
  - `orthogonal`: axis-aligned segments through the anchors and waypoints, with one elbow inserted between points that differ on both axes, along the direction of the first segment;
  - `polyline`: straight segments;
  - `bezier`: a cubic Catmull-Rom spline through the anchor points and waypoints, with tangents at the ends normal to the sides. In the scene it is a path, and the arrowhead follows the last tangent.
- **Lanes.** Relations between the same pair of elements, in either direction, without waypoints and with compass ports, get lanes: the `i`-th of `n` moves its anchors by `(i − (n − 1) / 2) × 16` px along the side.

### D7. Composition checks (warnings, all modes)

| Code | Rule |
|---|---|
| `layout.overlap` | two nodes, decisions or data stores intersect; or such a box crosses the edge of a group it is not inside |
| `layout.label-under-connector` | a relation label pill intersects a segment of another relation's connector |
| `layout.container-margin` | a box inside a placed and sized group is closer than half `groupPadding` to its edge, or overlaps its title band |
| `layout.connector-overlap` | two connectors share a collinear stretch longer than 24 px |

Tags and notes are annotations that authors place on boxes on purpose; they are not checked. Each pair is reported once, on the later element's statement.

### D8. Actions

- **`planEdit({ kind: "arrange", diagram, positions, sizes, scope })`**:
  - writes `place` for the elements of `positions`, either the unplaced ones (`scope: "unplaced"`) or all of them (`"all"`), rounded to whole units;
  - with `"all"`, also rewrites the `place` and `size` of placed and sized groups, and removes the waypoints of `route` statements, so routes follow the new positions;
  - turns `layout auto`, written or implied, into `layout assisted`.
- **`setPosition`** on an `auto` diagram also writes `layout assisted`.
- **`meltemi-diagrams layout <file> [--diagram <id>] [--all] [--check] [--stdout]`** lays each diagram out with ELK as `assisted` (or as `auto` with `--all`) through `LayoutOptions.layout`, reads the boxes from `LayoutResult.boxes` in diagram coordinates, and applies `arrange`. The written positions are exactly what the export draws. `--check` writes nothing and exits 1 when something would change.

### D9. ELK licence

`elkjs` is `EPL-2.0 OR GPL-3.0-or-later`; we use it under EPL-2.0. It lives only in `@meltemi/diagrams-layout-elk`, unmodified, and is installed from npm. Bundled builds (editor, playground) must carry the EPL notice and point to the elkjs source repository; the licence inventory records it.

## Risks / Trade-offs

- [The synchronous dispatcher is not public API] → The exact version is pinned, and adapter tests cover it. If it disappears, the adapter can wrap the public promise API behind the same interface in an asynchronous host.
- [Assisted arrangement is approximate] → Fixed elements are exact. Free ones may need a nudge, done with a `place` that becomes fixed.
- [New composition warnings on existing sheets] → They point at real problems. The corpus and the Konfío example are reviewed and fixed where needed.
