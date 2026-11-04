## ADDED Requirements

### Requirement: The import command
`meltemi-diagrams import <file>` SHALL import the file and write `<stem>.meltemi` beside it, or
the path given with `--out`. `--from mermaid|plantuml|markdown` SHALL force the format. Local
`!include` files SHALL be read relative to the source, inside the folder of the source (or of its
project when it has one). Icons SHALL be checked against the project's packs when the target is in
a project. The source file SHALL never be modified.

#### Scenario: Default output
- **WHEN** `mdg import docs/checkout.mmd` runs
- **THEN** `docs/checkout.meltemi` is written and the command prints `Imported docs/checkout.mmd →
  docs/checkout.meltemi (complete)`

### Requirement: Overwriting and merging
When the output exists, the command SHALL refuse with exit 2 unless `--force` (replace) or
`--merge` (re-import keeping adjustments, see import-merge) is given. `--check` SHALL write nothing
and report what would happen.

#### Scenario: Existing output
- **WHEN** `checkout.meltemi` exists and `mdg import checkout.mmd` runs without options
- **THEN** nothing is written, exit is 2, and the message names `--force` and `--merge`

### Requirement: Report and exit codes
Findings SHALL print like `validate` (`file:line:column severity code message`) with ranges in the
source file, followed by the counts mapped, approximated and dropped per diagram. `--json` SHALL
print `{ source, output, status, written, diagrams, findings, coverage }` instead. The exit code
SHALL be 0 when the import is complete, 1 when partial, and 2 for usage errors, unreadable files,
unknown formats, unsupported diagrams and refused overwrites.

#### Scenario: Partial import
- **WHEN** a PlantUML file has a line the importer cannot read
- **THEN** the sheet is written, the finding is printed with the source position, and exit is 1
