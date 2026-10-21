## MODIFIED Requirements

### Requirement: Assisted mode
In `layout assisted`, placed elements SHALL keep their `place` exactly. The engine SHALL arrange the whole graph, except groups that have both `place` and `size` and no children, and the relations that end on them, which SHALL be left out of the engine's request and drawn by the anchor rules. Each unplaced element SHALL keep its offset from the placed element nearest to it in the arrangement. An unplaced element that then overlaps a box already positioned SHALL be moved away from that placed element, along the layout direction, until it is clear; placed and sized groups SHALL NOT count as such boxes. Connectors SHALL use the anchor rules of the route anchors requirement.

#### Scenario: Fixed boxes stay
- **WHEN** a `layout assisted` diagram places `api` at (300, 200) and `db` at (700, 200) and declares `cache` without a place, related to both
- **THEN** `api` and `db` are centred exactly on their places, and `cache` is placed by the engine without overlapping them

#### Scenario: Adding a node keeps fixed positions
- **WHEN** a node `audit` and a relation to it are added to that diagram
- **THEN** `api` and `db` keep their centres

#### Scenario: A band does not change the arrangement
- **WHEN** a `layout assisted` diagram with three unplaced related nodes gains `layers back, main` and `group band "" { layer back }` placed at (300, 200) with size (500, 300)
- **THEN** the three nodes are arranged exactly as without the band, and the band is not in the engine's request

#### Scenario: Unplaced element without an engine
- **WHEN** a `layout assisted` diagram has an unplaced node and the host gives no engine
- **THEN** `layout.mode-unsupported` is reported and no scene is produced
