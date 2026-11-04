## ADDED Requirements

### Requirement: Layout geometry for editors
When `layoutDiagram` produces a scene, `LayoutResult` SHALL also report, in diagram coordinates (the coordinates of `place` statements):

- `offset`: the vector from diagram to scene coordinates;
- `boxes`: the box of every element and group;
- `labels`: the label pill of every relation that has one, by relation key;
- `connectors`: for every relation, the drawn points, the from and to sides, and the written waypoints.

A scene point SHALL equal the diagram point plus `offset`.

#### Scenario: Offset and boxes agree with the scene
- **WHEN** `corpus/valid/checkout.meltemi` is laid out with ELK
- **THEN** for every element, its box plus `offset` equals the rect drawn in the scene, and every connector's first point plus `offset` equals the first point of its polyline
