## ADDED Requirements

### Requirement: Format settings
`project.json` SHALL accept an optional `format` object with `indent` (a whole number of spaces from 1 to 8, or `"tab"`). A wrong value SHALL be `project.invalid-value`, and an unknown key inside `format` SHALL be `project.unknown-field`. `formatOptionsFor(manifest)` SHALL return the formatter options of the project, with two spaces when the setting is absent. The schema SHALL describe the same field.

#### Scenario: Four spaces
- **WHEN** `project.json` has `"format": { "indent": 4 }`
- **THEN** `formatOptionsFor` returns `{ indent: 4 }` and no diagnostic is reported

#### Scenario: Invalid indentation
- **WHEN** `project.json` has `"format": { "indent": 12 }`
- **THEN** `project.invalid-value` is reported on `12`, and the default of two spaces is used

#### Scenario: Unknown format key
- **WHEN** `project.json` has `"format": { "width": 80 }`
- **THEN** `project.unknown-field` is reported on `width`
