# cli-export Specification

## Purpose
Behaviour, options, outputs and exit codes of `meltemi-diagrams export`.
## Requirements
### Requirement: Export command
`meltemi-diagrams export <file.meltemi>` SHALL compile the file with its imports inside its project, lay out every renderable flow diagram with the file's theme scope, the project's default theme, the bundled font library and the ELK engine, and write one SVG per diagram next to the input. Each file SHALL be named `<file>.svg`, or `<file>.<diagram-id>.svg` when the file holds several diagrams, and the command SHALL print `Wrote <path>` per file. The options SHALL behave as follows:

- `--diagram <id>` restricts the export to one diagram;
- `--out <path>` names the output file (one diagram) or an existing directory;
- `--stdout` prints one diagram's SVG instead of writing, with diagnostics on stderr so that stdout holds only the SVG;
- `--theme <name>` renders every exported diagram with that theme instead of its own `theme` property, resolved in the same scope;
- `--fonts system|embedded|outlined` chooses the font policy, with `embedded` as the default.

The exit code SHALL be 0 on success, 1 when compile, module or layout diagnostics of the file contain errors, and 2 on usage errors, unreadable input, an unknown `--diagram` or an unknown `--fonts` value.

#### Scenario: Export the annotations corpus file
- **WHEN** `meltemi-diagrams export corpus/valid/edge/annotations.meltemi --out <dir>` runs with an existing directory
- **THEN** `<dir>/annotations.svg` is written, `Wrote` names it and the exit code is 0

#### Scenario: Export to stdout
- **WHEN** `meltemi-diagrams export corpus/valid/edge/annotations.meltemi --stdout` runs
- **THEN** stdout starts with `<svg` and contains an `@font-face` rule, and nothing else is written to disk

#### Scenario: Unsupported layout mode
- **WHEN** `meltemi-diagrams export corpus/valid/checkout.meltemi --stdout` runs on its `layout assisted` diagram with two unplaced elements
- **THEN** no `layout.mode-unsupported` is reported, because the command arranges the diagram with ELK: the SVG contains every element, the placed ones at their places, and the exit code is 0

#### Scenario: Unknown diagram
- **WHEN** `meltemi-diagrams export corpus/valid/edge/annotations.meltemi --diagram nope` runs
- **THEN** stderr names `nope` and lists the available diagrams, and the exit code is 2

#### Scenario: File without a flow diagram
- **WHEN** `meltemi-diagrams export corpus/parse-only/payment.meltemi` runs
- **THEN** `export.no-diagram` is reported and the exit code is 1

#### Scenario: Theme override
- **WHEN** `meltemi-diagrams export corpus/valid/edge/annotations.meltemi --theme technical.dark --stdout` runs
- **THEN** the SVG background rect is filled `#07111F` and the exit code is 0

#### Scenario: Unknown theme override
- **WHEN** `meltemi-diagrams export corpus/valid/edge/annotations.meltemi --theme corporate --stdout` runs
- **THEN** a `layout.unknown-theme` warning is printed, the SVG uses the default theme and the exit code is 0

#### Scenario: Imported theme
- **WHEN** `meltemi-diagrams export corpus/projects/valid/commerce/diagrams/checkout.meltemi --stdout` runs and the diagram uses a theme imported from `themes/company.meltemi`
- **THEN** the SVG uses that theme's background and the exit code is 0

#### Scenario: Project default theme
- **WHEN** `meltemi-diagrams export corpus/projects/valid/commerce/diagrams/overview.meltemi --stdout` runs, the diagram has no `theme`, and `project.json` sets `"theme": "themes/company.meltemi#corporate"`
- **THEN** the SVG uses the background and brand of `corporate`, no warning is printed, and the exit code is 0

#### Scenario: Font policies
- **WHEN** the annotations file is exported with `--fonts system`, `--fonts outlined` and `--fonts bogus`
- **THEN** the first has no `<style>`, the second has no `<text>`, and the third prints a usage error with exit code 2

### Requirement: Formats
`--format` SHALL accept `svg` (default). Any other value SHALL be a usage error that lists the supported formats.

#### Scenario: Unsupported format
- **WHEN** `meltemi-diagrams export file.meltemi --format png` runs
- **THEN** stderr says that only `svg` is supported in this version and the exit code is 2

### Requirement: Project folders
`meltemi-diagrams export <folder>` SHALL export every source of the project below the folder with
the same options, in one browser session for pictures and videos: each file's diagrams named as for
one file, beside the file or under `--out` keeping the folders; with `--profiles` or `--profile`,
the profiles of every file. Files without diagrams SHALL be passed over; `--diagram`, `--story`,
`--scenario` and `--stdout` SHALL be usage errors with a folder.

#### Scenario: Whole project
- **WHEN** `mdg export architecture --out site` runs
- **THEN** `site/diagrams/containers.svg`, `site/diagrams/context.svg` and
  `site/diagrams/purchase.svg` are written

