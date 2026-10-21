## MODIFIED Requirements

### Requirement: Composition checks
After every layout, in every mode, the layout SHALL report these warnings:

- **`layout.overlap`**:
  - two nodes, decisions, data stores, boxes or C4 entities of the same layer whose boxes intersect, unless the later-declared box lies inside the earlier one and at least 1 px in from one of its sides (a deliberate stack); two boxes whose rectangles coincide overlap. When the earlier-declared box lies so inside the later one (a stack written in the wrong order), the warning SHALL carry a hint, in the interface language, to declare the outer box first;
  - such a box partly inside a group of its layer, or overlapping a group of its layer it is not declared in.
- **`layout.label-under-connector`**: a relation label pill that intersects a segment of another relation's connector.
- **`layout.container-margin`**: a box declared in a group that has both `place` and `size`, on the same layer as the group, when the box is closer than half `groupPadding` to the group's edge, or overlaps its title band (`groupHeader` for a titled group; an untitled group has no band and its top margin is half `groupPadding`).
- **`layout.connector-overlap`**: two connectors that share a collinear stretch longer than 24 px.
- **`layout.connector-crossing`**: a connector that runs through a box of its layer that it does not join and that does not contain one of its end boxes (groups are not crossing-checked; a group that holds an end is never an obstacle); for a box drawn with a non-rectangular shape, "through" is measured against the shape's outline.

Tags and notes SHALL NOT be checked. Boxes and groups on different layers SHALL NOT be checked against each other. Each problem SHALL be reported once, on the declaration or statement of the later element, naming both parties.

#### Scenario: Overlapping boxes
- **WHEN** `a` and `b`, both 160 × 56, are placed at (100, 100) and (180, 100)
- **THEN** `layout.overlap` is reported once, naming `a` and `b`

#### Scenario: Stacked boxes
- **WHEN** `outer` (260 × 240), `middle` (210 × 180) and `inner` (150 × 130) are declared in that order and placed at the same centre
- **THEN** no `layout.overlap` is reported

#### Scenario: Stack declared in the wrong order
- **WHEN** `inner` (150 × 130) is declared before `outer` (260 × 240) and both are placed at the same centre
- **THEN** `layout.overlap` is reported on `outer`, naming `inner` and `outer`, with a hint to declare `outer` before `inner`

#### Scenario: Coinciding boxes
- **WHEN** `a` and `b`, both 160 × 56, are placed at (200, 200)
- **THEN** `layout.overlap` is reported on `b`, naming `a` and `b`, since `b` hides `a` entirely

#### Scenario: Band on a back layer
- **WHEN** `layers back, main` is declared, `band` is a box on `back` placed over `api` and over a group that does not declare it, and `api -> db` runs across `band`
- **THEN** no `layout.overlap` and no `layout.connector-crossing` names `band`

#### Scenario: Connector inside a container
- **WHEN** `a` and `b` are stacked inside the box `outer` and `a -> b` is drawn between them
- **THEN** `layout.connector-crossing` is not reported for `outer`

#### Scenario: Label on another connector
- **WHEN** the label of relation `r1` is placed over the vertical connector of `r2`
- **THEN** `layout.label-under-connector` is reported, naming `r1` and `r2`

#### Scenario: Box touching its group's title band
- **WHEN** a group placed at (300, 200) with size (400, 200) contains a node placed at (300, 115)
- **THEN** `layout.container-margin` is reported on the node, naming the group

#### Scenario: Untitled group has no band
- **WHEN** `group g ""` placed at (300, 200) with size (400, 200) contains a 160 × 56 node placed at (300, 136), whose top edge is 8 px (half the theme padding of 16) below the group's top edge
- **THEN** nothing is reported, while the same node at (300, 132) or inside a titled group is reported

#### Scenario: Group on another layer
- **WHEN** `layers back, main` is declared, `group g ""` writes `layer back`, is placed at (300, 200) with size (400, 200), and holds `box a "A"` on `main` placed at (68, 16), 4 px from the group's edge
- **THEN** no `layout.container-margin` is reported, as no `layout.overlap` is when `a` sticks out of `g`

#### Scenario: Through a diamond's empty corner
- **WHEN** a `routing polyline` relation passes through the top-left corner of the bounding rectangle of a `shape diamond` box without touching its outline
- **THEN** `layout.connector-crossing` is not reported

#### Scenario: Clean sheet
- **WHEN** the Konfío example is laid out
- **THEN** no composition warning is reported

#### Scenario: Straight connector through a box
- **WHEN** a `routing polyline` relation from `web` to `db` passes over `api`, placed between them
- **THEN** `layout.connector-crossing` is reported on the relation, naming `api`
