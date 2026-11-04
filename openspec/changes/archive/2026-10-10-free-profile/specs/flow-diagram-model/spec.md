## MODIFIED Requirements

### Requirement: Profile gating
A `diagram` block whose type is `sequence` or `c4` SHALL be parsed but SHALL produce `profile.unsupported` (error) on the type token with the message naming the profile and the version. `flow` and `free` diagrams SHALL compile. A type outside the four profiles SHALL produce `profile.unknown`. Other diagrams in the same file SHALL still compile.

#### Scenario: Unsupported profile beside a flow diagram
- **WHEN** a file contains `diagram payment: sequence { ... }` followed by `diagram checkout: flow { ... }`
- **THEN** `profile.unsupported` is reported on `sequence` and the flow diagram `checkout` is compiled normally

#### Scenario: Unknown profile
- **WHEN** a file contains `diagram x: mindmap { }`
- **THEN** `profile.unknown` is reported on `mindmap` listing `flow, sequence, c4, free`
