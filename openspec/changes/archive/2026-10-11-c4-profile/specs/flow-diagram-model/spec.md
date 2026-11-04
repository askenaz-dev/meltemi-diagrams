## MODIFIED Requirements

### Requirement: Profile gating
`flow`, `free`, `sequence` and `c4` diagrams SHALL compile, and `model` blocks SHALL compile. A type outside the four profiles SHALL produce `profile.unknown`. `story` and `export` blocks SHALL still be parsed and reported as `block.unsupported`. Other diagrams in the same file SHALL still compile.

#### Scenario: Unsupported profile beside a flow diagram
- **WHEN** a file contains `story purchase for checkout { … }` followed by `diagram checkout: flow { ... }`
- **THEN** `block.unsupported` is reported on `story` and the flow diagram `checkout` is compiled normally

#### Scenario: Unknown profile
- **WHEN** a file contains `diagram x: mindmap { }`
- **THEN** `profile.unknown` is reported on `mindmap` listing `flow, sequence, c4, free`
