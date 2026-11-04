## ADDED Requirements

### Requirement: Plugin installation settings
project.json SHALL accept an optional `plugins` object mapping plugin names (lower-case words) to
`{ "path", "version", "permissions" }`: a folder inside the project, an exact version and a subset
of `diagram-types` and `icons`. Paths outside the project, inexact versions and unknown permissions
(including `network`) SHALL be `project.invalid-value`; the schema SHALL describe the field.

#### Scenario: Network permission
- **WHEN** project.json grants a plugin `"network"`
- **THEN** `project.invalid-value` says that it cannot be granted
