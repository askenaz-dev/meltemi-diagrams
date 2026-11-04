## ADDED Requirements

### Requirement: Relation ends
A relation SHALL draw its target head (`arrowhead`, else the theme's) and its source head
(`arrowtail`, else the target head for a two-way relation, else none) in its stroke colour and
width, after its line and before its label, with the geometry below, where L is the theme's
`arrowSize` and W is 7/8 of it, and SHALL end its line where the head needs it:

- `triangle` and `triangleOutline`: a triangle L long and W wide; the line ends at its base;
- `open`: a V L long and W wide; the line reaches the tip;
- `diamond` and `diamondOutline`: a diamond 1.5 L long and W wide; the line ends at its back;
- `circle` and `circleOutline`: a circle of radius 0.45 L touching the tip; the line ends at its back;
- `bar`: a bar 1.2 W long, L/2 before the tip; `cross`: an X W wide, 0.6 L before the tip;
- `many`: a crow's foot from L before the tip to the tip and 0.6 W on either side; `oneOrMany`
  adds a bar 1.3 L before the tip; `onlyOne` is two bars L/2 and L before the tip;
- `zeroOrOne`: a bar L/2 before the tip and an outlined circle behind it; `zeroOrMany`: a crow's
  foot and an outlined circle behind it; the line ends at the circle's back.

Filled shapes SHALL be filled with the stroke colour; outlined shapes SHALL have no fill. A Bézier
connector SHALL be trimmed at both ends, leaving and entering along the side normals. The group's
`track` SHALL be the trimmed line.

#### Scenario: Two-way triangle
- **WHEN** a flow diagram has `a <-> b` with the default theme
- **THEN** the relation's group draws its line, then two filled triangles, one at each anchor, and
  the line ends 8 px before each anchor

#### Scenario: Crow's foot
- **WHEN** a relation has `style r { arrowhead zeroOrMany }`
- **THEN** its target end draws three prongs that meet L before the anchor and an outlined circle
  behind them, and its line ends at the circle

### Requirement: Dotted lines
`line dotted` SHALL draw the line or outline with round dots: a dash of 0 and a gap of
`1.5 × width + 3`, with round caps, in the SVG as `stroke-dasharray` and `stroke-linecap="round"`.
A motion dash SHALL replace it while the effect runs.

#### Scenario: Dotted relation
- **WHEN** `style r { line dotted }` targets a relation 1.3 px wide
- **THEN** its polyline has `stroke-dasharray="0 4.95"` and round caps
