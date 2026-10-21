## MODIFIED Requirements

### Requirement: Layers
`layers <name>, <name>...` SHALL declare layers from back to front. `main` SHALL always exist and SHALL come last when it is not listed. `layer <name>` in the block of an element or relation SHALL place it on that layer. An undeclared name SHALL be `ref.unknown-layer`, listing the layers. Elements and relations without `layer` SHALL be on `main`. Flow diagrams SHALL accept `layers` and `layer` the same way; sequence diagrams and C4 views SHALL refuse them with `prop.unknown`.

#### Scenario: Unknown layer
- **WHEN** a free diagram declares `layers back` and a box writes `layer front`
- **THEN** `ref.unknown-layer` is reported with the hint "Layers: back, main."

#### Scenario: Layers in a flow diagram
- **WHEN** a flow diagram declares `layers back, main` with `group band "Band" { layer back }` and a node without `layer`
- **THEN** it compiles without diagnostics, the group is painted before the node, and a sequence diagram with `layers back` reports `prop.unknown`
