## 1. Model

- [x] 1.1 `port <name> <side> [<n>%]` in element blocks: `PortDefinition` on elements, reserved names, duplicates
- [x] 1.2 Route endpoints accept named ports; `placement.unknown-port` listing the element's ports
- [x] 1.3 Constraints `align`, `row`, `column`, `order`, `distance` in placement blocks: `ConstraintEntry` with targets, edge, axis and distance; target and value checks
- [x] 1.4 Diagram property `routing` and relation style property `routing` (relations only)
- [x] 1.5 JSON: ports, constraints, routing; model tests

## 2. Layout

- [x] 2.1 `LayoutEngine`, `ArrangeRequest`, `Arrangement`; `LayoutOptions.engine`; requests built from the diagram with measured sizes, groups, ports and edges
- [x] 2.2 `auto` mode: arranged positions and engine routes; `layout.placement-ignored`
- [x] 2.3 `assisted` mode: fixed positions, nearest-anchor offsets, overlap push
- [x] 2.4 Constraint solver and `layout.constraint-conflict`
- [x] 2.5 Named port anchors, parallel lanes, routing kinds (orthogonal, polyline, Bézier paths with tangent arrowheads)
- [x] 2.6 Composition checks: `layout.overlap`, `layout.label-under-connector`, `layout.container-margin`, `layout.connector-overlap`
- [x] 2.7 `layout.engine-failed`; layout tests with a test engine

## 3. ELK adapter

- [x] 3.1 `@meltemi/diagrams-layout-elk` with `elkjs` 0.12.0: synchronous dispatcher, graph mapping, options, results in diagram coordinates
- [x] 3.2 Tests: directions, groups, ports, determinism, stability, failures
- [x] 3.3 Licence inventory, vitest alias, package metadata

## 4. Edit and CLI

- [x] 4.1 `arrange` operation; `setPosition` switches `auto` to `assisted`; edit tests
- [x] 4.2 `export` passes the ELK engine; `meltemi-diagrams layout` with `--diagram`, `--all`, `--check`; help
- [x] 4.3 CLI tests

## 5. Corpus, docs and skill

- [x] 5.1 Corpus: `auto` and `assisted` sheets, ports, constraints, routing kinds, lanes; invalid cases for the new codes; review snapshot changes; keep the Konfío example free of composition warnings
- [x] 5.2 `docs/language/layout.md`; grammar, diagnostics, SVG export, README; decision 0015
- [x] 5.3 Skill: layout reference with modes, ports, constraints and routing; `pnpm skills:sync`

## 6. Verification

- [x] 6.1 `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm licenses:inventory --check`, corpus validation and format checks
- [x] 6.2 Export the `auto` and `assisted` corpus sheets and look at them
