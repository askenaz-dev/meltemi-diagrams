## MODIFIED Requirements

### Requirement: Profile gating
`flow`, `free`, `sequence`, `c4` and `gantt` diagrams SHALL compile, and `model` blocks SHALL compile. A type outside the five profiles SHALL produce `profile.unknown`. `story` and `export` blocks SHALL still be parsed and reported as `block.unsupported`. Other diagrams in the same file SHALL still compile.

#### Scenario: Unsupported profile beside a flow diagram
- **WHEN** a file contains `story purchase for checkout { … }` followed by `diagram checkout: flow { ... }`
- **THEN** `block.unsupported` is reported on `story` and the flow diagram `checkout` is compiled normally

#### Scenario: Unknown profile
- **WHEN** a file contains `diagram x: mindmap { }`
- **THEN** `profile.unknown` is reported on `mindmap` listing `flow, sequence, c4, free, gantt`

#### Scenario: A gantt chart beside a flow diagram
- **WHEN** a file declares `diagram plan: gantt { task a from 2026-06-01 for 2d }` and a flow diagram
- **THEN** both compile without diagnostics and `plan` has type `gantt`
