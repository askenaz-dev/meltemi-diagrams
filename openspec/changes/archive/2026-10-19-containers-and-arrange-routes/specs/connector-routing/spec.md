## MODIFIED Requirements

### Requirement: Parallel lanes
In every drawing by the anchor rules, the free ends of relations (port `auto` or a compass side without a position, no waypoints, not a named port) that meet the same side of the same box less than a lane apart SHALL take separate lanes along that side. A lane is 16 px, or for a side holding labelled relations the height of the tallest label pill plus 4 px. Each run of `n` such ends SHALL be ordered by the coordinate, along the side, of each relation's other anchor (x on north and south, y on east and west; ties in source order), and the `i`-th SHALL be placed `(i − (n − 1) / 2)` lanes from the middle of the run's anchors, clamped to the side. A straight connector one end of which moves while its other end does not SHALL move that end by the same amount, so it stays straight; a connector whose two ends move by different amounts SHALL join them square to their sides. Relations between the same two elements, in either direction, are such ends on both sides, so two of them SHALL be 16 px apart and symmetric about the centre line of their overlap. Ends a lane apart or more, and a single end on a side, SHALL keep their anchors. Pinned ends SHALL NOT move, and connectors that follow the engine's routes SHALL keep them.

#### Scenario: Two parallel relations
- **WHEN** `a` and `b` face each other horizontally and the diagram has `a -> b` twice
- **THEN** the two connectors are horizontal, 16 px apart, and symmetric about the centre line of the overlap

#### Scenario: Two relations into one side
- **WHEN** `node1`, left of `client` and above it, and `db`, right of it and above it, both end on `client.north` with `routing orthogonal` in an `assisted` diagram with every element placed
- **THEN** the two connectors end 16 px apart on the north side, the one from `node1` left of the one from `db`, their last segments do not coincide, and no `layout.connector-overlap` is reported for them

#### Scenario: Two connectors into one side of a free composition
- **WHEN** `corpus/valid/free/composition.meltemi` is drawn, where `fromWeb` and `fromMobile` used to end 1 px apart on the same side of their target
- **THEN** they end 16 px apart, `fromWeb` is still one straight segment, and no other connector of the sheet moves

#### Scenario: A pinned end stays
- **WHEN** one of two relations ending on `client.north` has `route … to client.north 80%`
- **THEN** that end stays at 80 %, and the free end, alone among the free ends of the side, keeps the middle of the side
