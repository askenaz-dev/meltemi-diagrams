## ADDED Requirements

### Requirement: Composition checks
After every layout, in every mode, the layout SHALL report these warnings:

- **`layout.overlap`**:
  - two nodes, decisions or data stores whose boxes intersect;
  - such a box partly inside a group, or overlapping a group it is not declared in.
- **`layout.label-under-connector`**: a relation label pill that intersects a segment of another relation's connector.
- **`layout.container-margin`**: a box declared in a group that has both `place` and `size`, when the box is closer than half `groupPadding` to the group's edge, or overlaps its title band (`groupHeader`).
- **`layout.connector-overlap`**: two connectors that share a collinear stretch longer than 24 px.

Tags and notes SHALL NOT be checked. Each problem SHALL be reported once, on the declaration or statement of the later element, naming both parties.

#### Scenario: Overlapping boxes
- **WHEN** `a` and `b`, both 160 × 56, are placed at (100, 100) and (180, 100)
- **THEN** `layout.overlap` is reported once, naming `a` and `b`

#### Scenario: Label on another connector
- **WHEN** the label of relation `r1` is placed over the vertical connector of `r2`
- **THEN** `layout.label-under-connector` is reported, naming `r1` and `r2`

#### Scenario: Box touching its group's title band
- **WHEN** a group placed at (300, 200) with size (400, 200) contains a node placed at (300, 115)
- **THEN** `layout.container-margin` is reported on the node, naming the group

#### Scenario: Clean sheet
- **WHEN** the Konfío example is laid out
- **THEN** no composition warning is reported
