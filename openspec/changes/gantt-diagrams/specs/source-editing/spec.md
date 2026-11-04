## MODIFIED Requirements

### Requirement: Creating diagrams
`createDiagram { type, id?, title? }` SHALL append `diagram <id>: <type> {` and `}` after the last top-level statement of the file, separated by a blank line, for `type` `flow`, `free`, `sequence` or `gantt`; `title` SHALL add `title "<title>"` inside. The id SHALL default to the first of `diagram1`, `diagram2`… that no diagram, model, theme or story of the file uses. A file without a `language` header SHALL get `language "0.2"` and a blank line first. A given id that is not an identifier or is taken, or another type, SHALL be refused with `edit.invalid-value`. The result SHALL compile without new errors.

#### Scenario: Empty file
- **WHEN** `createDiagram { type: "flow" }` runs on an empty text
- **THEN** the text becomes `language "0.2"\n\ndiagram diagram1: flow {\n}\n`

#### Scenario: Next free id
- **WHEN** the file declares `diagram diagram1: flow { }` and `createDiagram { type: "free", title: "Slide" }` runs
- **THEN** `diagram diagram2: free {\n  title "Slide"\n}` is appended after it

#### Scenario: A gantt chart
- **WHEN** `createDiagram { type: "gantt", title: "Roadmap" }` runs on an empty text
- **THEN** the text becomes `language "0.2"\n\ndiagram diagram1: gantt {\n  title "Roadmap"\n}\n` and it compiles without diagnostics

#### Scenario: Taken id
- **WHEN** `createDiagram { type: "flow", id: "overview" }` runs on a file that declares `overview`
- **THEN** the plan is refused with `edit.invalid-value`

#### Scenario: A C4 view
- **WHEN** `createDiagram { type: "c4" }` runs
- **THEN** the plan is refused with `edit.invalid-value`, since a view needs a model
