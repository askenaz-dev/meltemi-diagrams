## ADDED Requirements

### Requirement: Export command
`studio export <file.arch>` SHALL compile the file, lay out every renderable flow diagram and write one SVG per diagram next to the input, named `<file>.svg`, or `<file>.<diagram-id>.svg` when the file holds several diagrams, printing `Wrote <path>` per file. `--diagram <id>` SHALL restrict the export to one diagram, `--out <path>` SHALL name the output file (one diagram) or an existing directory, and `--stdout` SHALL print one diagram's SVG instead of writing. The exit code SHALL be 0 on success, 1 when compile or layout diagnostics contain errors, and 2 on usage errors, unreadable input or an unknown `--diagram`.

#### Scenario: Export the annotations corpus file
- **WHEN** `studio export corpus/valid/edge/annotations.arch --out <dir>` runs with an existing directory
- **THEN** `<dir>/annotations.svg` is written, `Wrote` names it and the exit code is 0

#### Scenario: Export to stdout
- **WHEN** `studio export corpus/valid/edge/annotations.arch --stdout` runs
- **THEN** stdout starts with `<svg` and nothing else is written to disk

#### Scenario: Unsupported layout mode
- **WHEN** `studio export corpus/valid/checkout.arch` runs
- **THEN** one `layout.mode-unsupported` error line is printed and the exit code is 1

#### Scenario: Unknown diagram
- **WHEN** `studio export corpus/valid/edge/annotations.arch --diagram nope` runs
- **THEN** stderr names `nope` and lists the available diagrams, and the exit code is 2

#### Scenario: File without a flow diagram
- **WHEN** `studio export corpus/parse-only/payment.arch` runs
- **THEN** `export.no-diagram` is reported and the exit code is 1

### Requirement: Formats
`--format` SHALL accept `svg` (default). Any other value SHALL be a usage error that lists the supported formats.

#### Scenario: Unsupported format
- **WHEN** `studio export file.arch --format png` runs
- **THEN** stderr says that only `svg` is supported in this version and the exit code is 2
