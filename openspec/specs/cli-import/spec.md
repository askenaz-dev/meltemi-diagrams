# cli-import Specification

## Purpose
`meltemi-diagrams import` writes imported sheets, merges re-imports and reports findings with exit codes.
## Requirements
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

### Requirement: Import folders
`meltemi-diagrams import <folder>` SHALL import every Mermaid, PlantUML and Markdown file below the
folder (hidden folders and `node_modules` left out; PlantUML `.iuml` includes read through the
files that include them; Markdown files without diagram blocks passed over), each into its sheet
beside it or under `--out` keeping the folders, with `--force`, `--merge`, `--check` and `--json`
as for one file, and sum up how many were complete, partial, failed or not replaced. The exit code
SHALL be 2 when one failed or was not replaced, 1 when one was partial, else 0.

#### Scenario: A folder of diagrams
- **WHEN** a folder holds `flows/checkout.mmd`, `sequences/pay.puml` (including
  `includes/people.iuml`) and a `README.md` without diagrams
- **THEN** two sheets are written and the summary reads `2 complete, 0 partial, 1 without diagrams`

