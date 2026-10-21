## MODIFIED Requirements

### Requirement: Export command
`meltemi-diagrams export <file.meltemi>` SHALL compile the file with its imports inside its project, lay out every renderable flow diagram with the file's theme scope, and write one SVG per diagram next to the input. Each file SHALL be named `<file>.svg`, or `<file>.<diagram-id>.svg` when the file holds several diagrams, and the command SHALL print `Wrote <path>` per file. The options SHALL behave as follows:

- `--diagram <id>` restricts the export to one diagram;
- `--out <path>` names the output file (one diagram) or an existing directory;
- `--stdout` prints one diagram's SVG instead of writing;
- `--theme <name>` renders every exported diagram with that theme instead of its own `theme` property, resolved in the same scope.

The exit code SHALL be 0 on success, 1 when compile, module or layout diagnostics of the file contain errors, and 2 on usage errors, unreadable input or an unknown `--diagram`.

#### Scenario: Export the annotations corpus file
- **WHEN** `meltemi-diagrams export corpus/valid/edge/annotations.meltemi --out <dir>` runs with an existing directory
- **THEN** `<dir>/annotations.svg` is written, `Wrote` names it and the exit code is 0

#### Scenario: Export to stdout
- **WHEN** `meltemi-diagrams export corpus/valid/edge/annotations.meltemi --stdout` runs
- **THEN** stdout starts with `<svg` and nothing else is written to disk

#### Scenario: Unsupported layout mode
- **WHEN** `meltemi-diagrams export corpus/valid/checkout.meltemi` runs
- **THEN** one `layout.mode-unsupported` error line is printed and the exit code is 1

#### Scenario: Unknown diagram
- **WHEN** `meltemi-diagrams export corpus/valid/edge/annotations.meltemi --diagram nope` runs
- **THEN** stderr names `nope` and lists the available diagrams, and the exit code is 2

#### Scenario: File without a flow diagram
- **WHEN** `meltemi-diagrams export corpus/parse-only/payment.meltemi` runs
- **THEN** `export.no-diagram` is reported and the exit code is 1

#### Scenario: Theme override
- **WHEN** `meltemi-diagrams export corpus/valid/edge/annotations.meltemi --theme meltemi.dark --stdout` runs
- **THEN** the SVG background rect is filled `#07111F` and the exit code is 0

#### Scenario: Unknown theme override
- **WHEN** `meltemi-diagrams export corpus/valid/edge/annotations.meltemi --theme corporate --stdout` runs
- **THEN** a `layout.unknown-theme` warning is printed, the SVG uses the default theme and the exit code is 0

#### Scenario: Imported theme
- **WHEN** `meltemi-diagrams export corpus/projects/valid/commerce/diagrams/checkout.meltemi --stdout` runs and the diagram uses a theme imported from `themes/company.meltemi`
- **THEN** the SVG uses that theme's background and the exit code is 0
