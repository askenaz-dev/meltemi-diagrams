## ADDED Requirements

### Requirement: Rounded corners
A relation SHALL take `corners` from its style, else the theme's `corners` (built-in themes
`sharp`). With `rounded`, every bend of an `auto`, `orthogonal` or `polyline` connector SHALL be
replaced by a quadratic curve through the bend whose ends are 10 px from it along each segment, or
half the shorter segment when that is less, sampled in eight steps into the connector's points, so
the connector stays a polyline for labels, checks, gaps under group titles and motion. `bezier`
connectors SHALL be unchanged.

#### Scenario: Rounded elbow
- **WHEN** a relation with `routing orthogonal` and `corners rounded` bends once at (100, 50)
  between long segments
- **THEN** its points include (90, 50) and (100, 60) and none of them is (100, 50)

#### Scenario: Sharp by default
- **WHEN** the same relation has no `corners` and the theme is built in
- **THEN** its points include (100, 50)
