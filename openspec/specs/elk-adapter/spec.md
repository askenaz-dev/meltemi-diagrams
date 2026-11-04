# elk-adapter Specification

## Purpose
The ELK-based layout engine package: how a layout request maps to an ELK graph and back, the options that keep the result professional and stable, and the record of the EPL-2.0 licence under which elkjs is used.
## Requirements
### Requirement: ELK engine
`@meltemi/diagrams-layout-elk` SHALL export `createElkEngine()`, a `LayoutEngine` backed by `elkjs` 0.12.0, which SHALL be the package's only dependency besides the layout package. It SHALL:

- run the layered algorithm synchronously;
- map the diagram direction to `elk.direction`;
- map groups to compound nodes with `INCLUDE_CHILDREN` hierarchy handling and the theme's group paddings;
- give a group with a `minimum` size the ELK options that make that size its minimum (`elk.nodeSize.constraints` `MINIMUM_SIZE` and `elk.nodeSize.minimum`) with its content centred (`elk.contentAlignment` `[H_CENTER, V_CENTER]`);
- map named ports to ELK ports at their exact position (`FIXED_POS`), shared by the relations that use them;
- give every other relation end of a box that has ports its own ELK port: on the written compass side, or else on the side where relations enter or leave in the layout direction, spread evenly along the side (`FIXED_SIDE` when the box has no named ports), so that no relation is attached to a corner;
- give primary relations higher straightness and direction priority than secondary ones;
- use orthogonal edge routing, node and layer spacings of 40 and 70 px, model-order stability options and a fixed random seed.

It SHALL return centres in diagram coordinates, edge points from source to target, and the box of every group in diagram coordinates. An ELK failure SHALL surface as an error with the original message, which the layout reports as `layout.engine-failed` (error) without a scene.

#### Scenario: Chain left to right
- **WHEN** the engine arranges `a -> b -> c` with direction `LR`
- **THEN** the centre of `a` is left of `b`, which is left of `c`, and each edge's first point lies on its source box

#### Scenario: Top to bottom
- **WHEN** the same chain is arranged with direction `TB`
- **THEN** the centres increase downwards

#### Scenario: Straight chain with ports
- **WHEN** `a -> b -> c` is arranged with direction `LR`, and only the relation from `b` names the port `b.east`
- **THEN** the three centres share the same y, and the relation `a -> b` ends at the vertical centre of `b`

#### Scenario: Group children stay inside
- **WHEN** a group contains `a` and `b` and the graph also has `c` outside it
- **THEN** the arranged centres of `a` and `b` lie inside the group's arranged box, and `c` lies outside

#### Scenario: A container keeps its minimum size
- **WHEN** a group holding one 160 × 64 box has `minimum: { width: 238, height: 196 }` and paddings of 16
- **THEN** the returned box of the group is at least 238 × 196, the box's centre is the group's centre within 1 px, and the group does not overlap the other nodes of the graph

#### Scenario: A group without a minimum fits its children
- **WHEN** the same group has no `minimum`
- **THEN** the returned box of the group is the box's size plus its paddings

### Requirement: ELK licence record
The licence inventory SHALL list `elkjs` with its licence `EPL-2.0 OR GPL-3.0-or-later`. The docs and decision 0015 SHALL record that it is used under EPL-2.0, kept in its own package, unmodified, and that bundled builds carry the EPL notice and a pointer to its source.

#### Scenario: Inventory
- **WHEN** `pnpm licenses:inventory --check` runs
- **THEN** it passes with `elkjs 0.12.0 EPL-2.0 OR GPL-3.0-or-later` in `THIRD_PARTY_LICENSES.md`

### Requirement: Injectable worker loader
`createElkEngine({ loadWorker })` SHALL use `loadWorker()` to obtain the constructor of the ELK worker instead of resolving `elkjs/lib/elk-worker.min.js` from the installed package, so that bundled hosts can ship the worker as a file or a bundled module. Without the option, it SHALL resolve the installed package as before under Node; outside Node it SHALL fail with a message that asks for `loadWorker`. The package SHALL import no Node module at load time: the default loader and `loadElkWorkerFile` SHALL reach Node's modules only when called. `loadElkWorkerFile(path)` SHALL evaluate the worker file as a CommonJS module with `self` hidden, in the default path too: the file starts ELK as a real web worker when `self` exists and `document` does not, which is the case in the VS Code extension host.

#### Scenario: A host that defines self
- **WHEN** the engine is created while `globalThis.self` exists, with the default loader or with `loadElkWorkerFile`
- **THEN** it arranges a chain exactly as without `self`, and leaves `self.onmessage` unset

#### Scenario: Bundled worker
- **WHEN** an engine is created with a loader that requires a copy of `elk-worker.min.js` from another folder
- **THEN** it arranges a chain exactly as the default engine does

#### Scenario: Browser bundle
- **WHEN** the package is bundled for the browser and an engine is created with a loader that returns the bundled worker module
- **THEN** the bundle contains no `node:` import and the engine arranges a chain exactly as under Node

### Requirement: Relation ends on group sides
When a route names a side of a group (`route r from api.east to fn.west` where `api` is a group),
the ELK graph SHALL give the group's container a port on that side, with fixed sides and positions
chosen by ELK, so the layout succeeds. The drawn connector SHALL start or end on the border of the
group as drawn: an end that the engine leaves short of or inside the group's box SHALL move along
its first or last segment onto the border.

#### Scenario: Route from a group
- **WHEN** a flow diagram in `layout auto` routes a relation from `api.east`, where `api` is a
  group, to a node
- **THEN** the layout has no diagnostics and the connector's first point lies on the right edge of
  the drawn group

