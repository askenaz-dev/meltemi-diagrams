## ADDED Requirements

### Requirement: Format command
`meltemi-diagrams format <path>...` SHALL format every given file, and the sources of every given folder taken as a project, with the indentation from the project's `format` setting. It SHALL write only files whose text changes, print `Formatted <path>` for each one, and finish with `Formatted N of M files.`. A file with syntax errors SHALL print its diagnostics and one `format.syntax-errors` line, and SHALL stay unchanged. The exit code SHALL be 0 when no file was refused, 1 when one was, and 2 on usage errors or unreadable paths.

#### Scenario: Formatting a project
- **WHEN** `meltemi-diagrams format <project>` runs on a project with one badly indented file and one canonical file
- **THEN** only the first file is rewritten, the output says `Formatted 1 of 2 files.`, and the exit code is 0

#### Scenario: File with syntax errors
- **WHEN** a given file has an unterminated string
- **THEN** its diagnostic and `format.syntax-errors` are printed, the file is unchanged, and the exit code is 1

#### Scenario: Missing path
- **WHEN** `meltemi-diagrams format nope.meltemi` runs
- **THEN** a message names the path and the exit code is 2

### Requirement: Check and stdout modes
With `--check` the command SHALL write nothing, print `Would format <path>` for each file that would change, and exit with 1 when at least one would. With `--stdout` it SHALL accept exactly one file, print its formatted text, and write nothing.

#### Scenario: Check in CI
- **WHEN** `meltemi-diagrams format --check corpus/projects/valid/commerce` runs on the canonical example project
- **THEN** nothing is printed except `Checked 3 files: all formatted.` and the exit code is 0

#### Scenario: Check finds a change
- **WHEN** `--check` runs on a folder with one badly indented file
- **THEN** `Would format <path>` names it, the file is unchanged, and the exit code is 1

#### Scenario: Stdout with two files
- **WHEN** `meltemi-diagrams format --stdout a.meltemi b.meltemi` runs
- **THEN** a usage message is printed and the exit code is 2
