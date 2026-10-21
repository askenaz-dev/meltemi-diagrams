## ADDED Requirements

### Requirement: Icon aliases
`project.json` SHALL accept an optional `"icons"` object mapping alias names to pack prefixes, such as `{ "cloud": "aws" }`. An alias SHALL match `[a-z0-9][a-z0-9-]*`. An alias equal to a pack prefix, or a target that is not a pack, SHALL be `project.invalid-value` on the entry. A value that is not a string SHALL be `project.invalid-value` when the manifest is read. The schema SHALL describe the field.

#### Scenario: Alias
- **WHEN** `project.json` has `"icons": { "cloud": "aws" }` and the project has an `aws` pack
- **THEN** `cloud:lambda` resolves to `aws:lambda` and no diagnostic is reported

#### Scenario: Alias to nothing
- **WHEN** `project.json` has `"icons": { "cloud": "gcp" }` and there is no `gcp` pack
- **THEN** `project.invalid-value` is reported on `"gcp"` listing the packs
