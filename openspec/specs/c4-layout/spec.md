# c4-layout Specification

## Purpose
C4 views are laid out by the flow pipeline and drawn with C4 shapes, type lines, theme colours, the scope's boundary and relation technologies.
## Requirements
### Requirement: C4 views use the flow layout
C4 views SHALL be laid out by the flow pipeline with every layout mode, constraint, port and routing option, using default sizes per C4 kind measured from their text.

#### Scenario: Assisted layout
- **WHEN** the proposal's container view (`layout assisted`) is exported
- **THEN** ELK arranges the elements and the export has no composition warnings

### Requirement: C4 shapes
A person SHALL be drawn as a head above a rounded body; systems, containers and components as boxes with the label, a type line (`[Software System]`, `[Container: React]`, `[Component: Kotlin]`, `[Person]`) and the description; datastores as cylinders with `[Container: <technology>]`. External entities SHALL be muted and dashed. The boundary SHALL be a dashed band titled with the scope's label and type.

#### Scenario: A container with its technology
- **WHEN** `shop.web` with `technology "React"` is drawn
- **THEN** its box shows `Web` and `[Container: React]`

### Requirement: C4 colours from the theme
Built-in classes `c4_person`, `c4_system`, `c4_container`, `c4_component` and `c4_external` SHALL colour C4 kinds from theme tokens and SHALL apply before the view's classes, rules and styles.

#### Scenario: A style wins
- **WHEN** a view writes `style shop.api { fill "#ffffff" }`
- **THEN** `shop.api` is drawn white while the other containers keep the container colour

### Requirement: Relation labels with technology
A drawn relation SHALL show its label and, on a second line, `[technology]` when the model relation has one.

#### Scenario: Technology line
- **WHEN** `request` has the label `HTTPS` and `technology "JSON/HTTPS"`
- **THEN** its label pill shows `HTTPS` and `[JSON/HTTPS]`

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

