## ADDED Requirements

### Requirement: Catalog settings
`project.json` SHALL accept an optional `catalog` object with `title` (non-empty string),
`description` (string), `out` (a relative path inside the project: a folder or a `.html` file),
`exclude` (relative paths of folders or files, or `<file>#<id>` for one block) and `source`
(boolean, false by default). A wrong type, an absolute path or a path that leaves the project SHALL
be `project.invalid-value`; an unknown setting SHALL be `project.unknown-field` (warning). The
schema SHALL describe the object.

#### Scenario: Valid settings
- **WHEN** `catalog` is `{ "title": "Shop", "exclude": ["drafts", "diagrams/a.meltemi#x"] }`
- **THEN** no diagnostic is reported and the catalog's title is `Shop`

#### Scenario: Output outside the project
- **WHEN** `catalog.out` is `"../site"`
- **THEN** `project.invalid-value` is reported on the value
