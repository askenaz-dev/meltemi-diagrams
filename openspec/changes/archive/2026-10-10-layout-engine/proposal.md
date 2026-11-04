## Why

The proposal defines three composition modes:

- **`auto`**: the system computes every position.
- **`assisted`**: the engine respects fixed positions and arranges the rest.
- **`manual`**: nothing is moved.

Dragging a box in an automatic view switches it to `assisted` and records the position. Automatic suggestions are soft; fixed positions and declared constraints are strong, and when they contradict each other a diagnostic names the conflict instead of a box moving silently. Recomputing the whole composition is an explicit action.

It also asks for:

- named ports;
- relative constraints;
- automatic, orthogonal, polyline and Bézier routes;
- parallel relations that keep independent routes;
- composition rules: labels never under connectors, enough container margin, the primary flow separated from secondary dependencies;
- stability under small edits.

ELK is the candidate engine, behind a replaceable adapter (EPL-2.0, its obligations documented).

Today only fully placed diagrams render: `layout auto` and `assisted` report `layout.mode-unsupported`, ports are compass points, and there are no constraints, route kinds or composition checks.

## What Changes

Roadmap change **7** (`docs/roadmap-1.0.md`), **Stage 2 (flow and free)**.

- **Engine adapter.**
  - The layout gains `LayoutEngine`, a synchronous interface that arranges nodes, groups, ports and edges, and `LayoutOptions.engine`.
  - `@meltemi/diagrams-layout-elk` is a separate package. It implements the interface with `elkjs` 0.12.0 (EPL-2.0), layered algorithm, direction from the diagram, hierarchical groups, ports, and edge priorities for the primary flow.
- **Modes.**
  - `auto` arranges everything. `place` and waypoint `route` statements are ignored, and reported as `layout.placement-ignored`.
  - `assisted` keeps placed elements fixed and arranges the rest around them.
  - `manual` stays as it is.
  - Without an engine, unplaced elements stay `layout.mode-unsupported`.
- **Named ports.**
  - Declared as `port <name> <side> [<n>%]` in an element block.
  - Used in `route` statements (`route r from api.events to bus.in`) and by the engine.
  - An unknown port is `placement.unknown-port`.
- **Relative constraints** in `placement` blocks:
  - `align <ids> top|middle|bottom|left|center|right`;
  - `row <ids>` and `column <ids>`;
  - `order <ids> [horizontal|vertical]`;
  - `distance <id>, <id> <n>`, a minimum gap.

  The engine satisfies them by moving free elements only. A constraint that fixed elements violate is `layout.constraint-conflict`, an error naming the elements.
- **Route kinds.** The diagram property and relation style property `routing` takes `auto`, `orthogonal`, `polyline` or `bezier`. Bézier connectors are curved paths.
- **Parallel relations** between the same two elements take separate lanes.
- **Composition checks** (warnings):
  - `layout.overlap`: boxes overlapping each other, or crossing a group's edge;
  - `layout.label-under-connector`: a relation label lying on another connector;
  - `layout.container-margin`: a box too close to its group's edge or title band;
  - `layout.connector-overlap`: two connectors running along each other.
- **Explicit recompute.**
  - The edit operation `arrange` writes `place` statements from an arrangement, for unplaced elements or for all of them, and switches `auto` to `assisted`.
  - `setPosition` on an `auto` diagram switches it to `assisted`.
  - `meltemi-diagrams layout <file>` runs it from the command line.
- **Stability.** Layouts are deterministic. The engine follows source order, so adding an element leaves the order of the others unchanged.
- **Docs.** A new `docs/language/layout.md`, grammar, diagnostics, SVG export and README updates, the skill's layout reference, and decision note 0015. The licence inventory gains `elkjs` (EPL-2.0).

## Capabilities

### New Capabilities
- `layout-modes`: the engine adapter, `auto` and `assisted` arrangement around fixed elements, ignored placement in `auto`, determinism and stability.
- `layout-constraints`: named ports, relative constraints, conflict diagnostics.
- `connector-routing`: route kinds, parallel lanes, Bézier paths.
- `composition-checks`: overlap, labels under connectors, container margins, connector overlap.
- `elk-adapter`: the ELK package: graph mapping, options, licence.
- `layout-actions`: the `arrange` edit operation, the switch to `assisted` on drag, and the `layout` command.

### Modified Capabilities
- `flow-diagram-model`: element blocks accept `port`; diagram property `routing`; placement statements `align`, `row`, `column`, `order`, `distance`; route endpoints may name ports.
- `flow-svg-export`: manual layout geometry with named ports and lanes. `layout.mode-unsupported` now applies only without an engine.
- `cli-export`: export arranges `auto` and `assisted` diagrams with the ELK engine; with `--stdout`, diagnostics go to stderr.
- `source-editing`: rename and cascading removal cover constraint targets and named-port routes.

## Impact

- New package `@meltemi/diagrams-layout-elk` with `elkjs` 0.12.0 (approved; EPL-2.0 OR GPL-3.0-or-later, used under EPL-2.0).
- `@meltemi/diagrams-model`: ports on elements, `ConstraintEntry`, `routing`, port references in routes, and the corresponding JSON keys.
- `@meltemi/diagrams-layout`: the engine interface, arrangement, the constraint solver, routers by kind, lanes, composition checks, and paths for curved connectors.
- `@meltemi/diagrams-edit`: the `arrange` operation, the `assisted` switch on `setPosition`, and constraints in rename and removal.
- `@meltemi/diagrams-cli`: the `layout` command, and the engine in `export`.
- Corpus: sheets in `auto` and `assisted`, invalid cases for the new codes; snapshots of affected sheets.

## Non-goals

- Layout of `sequence`, `c4` and `free` diagrams, which come with their profiles (roadmap changes 9 to 11).
- Canvas interaction (guides, snapping, multi-selection), which comes with the editor (roadmap change 8).
