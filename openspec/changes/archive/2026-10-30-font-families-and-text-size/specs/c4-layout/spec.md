## ADDED Requirements

### Requirement: Text properties on entities and relations
C4 entities and relations SHALL take `font`, `fontSize` and `fontWeight` as flow nodes and relations do (`style-classes-and-rules`, "Text properties in every profile"): an entity's name at the written size and weight, its description and technology line scaled by the theme's ratios of the written size, its box grown to hold them; a relation's label at the written size and weight with its technology line scaled. `textAlign`, `verticalAlign` and `opacity` SHALL stay refused in views with `prop.invalid-value` naming free diagrams.

#### Scenario: A larger container
- **WHEN** container `shop.api` has `style shop.api { fontSize 20; font "Open Sans" }` in a container view
- **THEN** its name is measured with Open Sans at 20 px, its type line is scaled from 20, its box is wider than the default and holds its lines, and the other containers are unchanged

#### Scenario: A relation's technology line
- **WHEN** relation `shop.web -> shop.api` is named `calls` with `style calls { fontSize 14 }`
- **THEN** its label is measured and drawn at 14 px weight 500 and its `[HTTPS]` technology line at the technology ratio of 14, in a pill `round(14 × 18 / 11)` plus the technology line high

#### Scenario: Alignment refused in a view
- **WHEN** a container view contains `style shop.api { textAlign left }`
- **THEN** `prop.invalid-value` is reported on `textAlign` naming free diagrams, and the view is drawn without it
