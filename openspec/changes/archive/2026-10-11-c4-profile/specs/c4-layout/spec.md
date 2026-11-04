## ADDED Requirements

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
