## ADDED Requirements

### Requirement: Default theme setting
`project.json` SHALL accept an optional `theme` string: a built-in theme name, or `<path>#<theme id>` where the path is relative to the project root and names a `.meltemi` file inside the project. The checks SHALL be:

- a value that is not a string, is neither a built-in name nor of the form `<path>#<id>`, or names a path outside the project, is `project.invalid-value` when the manifest is read;
- a file that does not exist, or does not declare the theme, is `project.invalid-value` on the value when the project is compiled.

The schema SHALL describe the field. Diagrams of the project without `theme` SHALL use the default theme (see `project-compilation`).

#### Scenario: Built-in default theme
- **WHEN** `project.json` has `"theme": "editorial.light"`
- **THEN** no diagnostic is reported and the manifest's theme is `editorial.light`

#### Scenario: Theme in a project file
- **WHEN** `project.json` has `"theme": "themes/company.meltemi#corporate"` and that file declares `theme corporate`
- **THEN** no diagnostic is reported

#### Scenario: Missing theme
- **WHEN** `project.json` has `"theme": "themes/company.meltemi#nope"`
- **THEN** `project.invalid-value` is reported on the value, naming `nope` and listing the themes of the file

#### Scenario: Malformed value
- **WHEN** `project.json` has `"theme": "corporate"`
- **THEN** `project.invalid-value` is reported, with the hint to use a built-in name or `<path>#<theme id>`
