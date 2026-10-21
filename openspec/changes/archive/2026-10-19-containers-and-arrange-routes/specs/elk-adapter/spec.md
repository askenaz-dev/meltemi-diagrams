## MODIFIED Requirements

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
