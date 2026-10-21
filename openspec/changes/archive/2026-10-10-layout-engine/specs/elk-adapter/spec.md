## ADDED Requirements

### Requirement: ELK engine
`@meltemi/diagrams-layout-elk` SHALL export `createElkEngine()`, a `LayoutEngine` backed by `elkjs` 0.12.0, which SHALL be the package's only dependency besides the layout package. It SHALL:

- run the layered algorithm synchronously;
- map the diagram direction to `elk.direction`;
- map groups to compound nodes with `INCLUDE_CHILDREN` hierarchy handling and the theme's group paddings;
- map named ports to ELK ports at their exact position (`FIXED_POS`), shared by the relations that use them;
- give every other relation end of a box that has ports its own ELK port: on the written compass side, or else on the side where relations enter or leave in the layout direction, spread evenly along the side (`FIXED_SIDE` when the box has no named ports), so that no relation is attached to a corner;
- give primary relations higher straightness and direction priority than secondary ones;
- use orthogonal edge routing, node and layer spacings of 40 and 70 px, model-order stability options and a fixed random seed.

It SHALL return centres in diagram coordinates and edge points from source to target. An ELK failure SHALL surface as an error with the original message, which the layout reports as `layout.engine-failed` (error) without a scene.

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

### Requirement: ELK licence record
The licence inventory SHALL list `elkjs` with its licence `EPL-2.0 OR GPL-3.0-or-later`. The docs and decision 0015 SHALL record that it is used under EPL-2.0, kept in its own package, unmodified, and that bundled builds carry the EPL notice and a pointer to its source.

#### Scenario: Inventory
- **WHEN** `pnpm licenses:inventory --check` runs
- **THEN** it passes with `elkjs 0.12.0 EPL-2.0 OR GPL-3.0-or-later` in `THIRD_PARTY_LICENSES.md`
