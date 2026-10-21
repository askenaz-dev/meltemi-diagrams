## MODIFIED Requirements

### Requirement: Source file structure
A source file SHALL consist of an optional header `language "<version>"` that, when present, MUST be the first statement, followed by `import` statements and top-level blocks `model <id> { }`, `diagram <id>: <type> [using <ref>] { }`, `story <id> for <ref> { }`, `export <id> for <ref> { }` and `theme <id> { }`. An unrecognised top-level statement SHALL produce `syntax.unexpected-top-level` and parsing SHALL continue after it. A header that is not the first statement SHALL produce `syntax.header-not-first`.

#### Scenario: Minimal file
- **WHEN** the text is `language "0.2"` followed by `diagram example: flow { A -> B }`
- **THEN** the CST contains a `Header` node with version `0.2` and one `DiagramBlock` node with id `example` and type `flow`

#### Scenario: Header after a block
- **WHEN** a `diagram` block appears before `language "0.2"`
- **THEN** the parser reports `syntax.header-not-first` on the header and still returns both nodes

#### Scenario: Unknown top-level word
- **WHEN** the top level contains the line `widget x { }`
- **THEN** the parser reports `syntax.unexpected-top-level` on `widget` and the following `diagram` block is parsed normally

#### Scenario: Imports between header and blocks
- **WHEN** the text is `language "0.2"`, then `import "./themes.meltemi" as t`, then a `diagram` block
- **THEN** the CST contains a `Header`, an `ImportStatement` and a `DiagramBlock` in that order
