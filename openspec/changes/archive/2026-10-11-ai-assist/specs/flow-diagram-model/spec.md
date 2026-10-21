## ADDED Requirements

### Requirement: Relation assumptions
Relation blocks of flow, free, sequence and C4 diagrams, and relations of models, SHALL accept
`assumption "<why>"`, recorded as the relation's `assumption` (null when absent) and in the model
JSON. A C4 view relation SHALL take the assumption of its model relations when every relation it
combines is one. Layouts SHALL draw assumed relations dashed in the theme's muted colour unless a
style sets the line or colour.

#### Scenario: Inferred relation
- **WHEN** a flow diagram has `api -> cache { assumption "Reads are usually cached" }`
- **THEN** the relation's `assumption` is `Reads are usually cached` and it is drawn dashed
