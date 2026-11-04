## ADDED Requirements

### Requirement: Turned elements are checked by their drawn box
The composition checks SHALL compare a turned element by its drawn box, the axis-aligned bounding box of its turned outline: overlaps with other boxes, stacks, the edges and margins of the group that holds it, crossings by connectors and labels over it. Texts inside a turned element SHALL be audited in the element's own frame, where they turn with it.

#### Scenario: Turned box crossing its group edge
- **WHEN** a 160 × 56 box with `rotation 90` sits in a group whose interior is 120 px tall
- **THEN** `layout.overlap` reports that the box crosses the edge of its group

#### Scenario: Turned box inside its group
- **WHEN** the same box sits in a group whose interior is 200 px tall and 120 px wide
- **THEN** nothing is reported for it
