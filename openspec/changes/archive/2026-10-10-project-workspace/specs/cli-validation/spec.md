## MODIFIED Requirements

### Requirement: Validate command
`meltemi-diagrams validate <path>...` SHALL validate every given file, and every given folder as a project:

- the project root is the folder, or its nearest ancestor with `project.json`;
- its sources are compiled together with the manifest;
- given files are compiled with their imports inside their project.

It SHALL print one line per diagnostic as `<path>:<line>:<column>: <severity> <code> <message>`, including diagnostics located in `project.json`, followed by a summary line with the number of files, errors and warnings. The exit code SHALL be 0 when no error was found, 1 when at least one error was found, and 2 on usage errors or unreadable paths.

#### Scenario: Valid corpus
- **WHEN** `meltemi-diagrams validate corpus/valid` runs
- **THEN** the output ends with a summary naming the file count and zero errors and the exit code is 0

#### Scenario: File with an error
- **WHEN** `meltemi-diagrams validate corpus/invalid/ref.unknown-element.meltemi` runs
- **THEN** one line `corpus/invalid/ref.unknown-element.meltemi:6:11: error ref.unknown-element ...` is printed and the exit code is 1

#### Scenario: Missing path
- **WHEN** `meltemi-diagrams validate does-not-exist.meltemi` runs
- **THEN** a message names the missing path and the exit code is 2

#### Scenario: Project with an import cycle
- **WHEN** `meltemi-diagrams validate corpus/projects/invalid/module.cycle` runs
- **THEN** a `module.cycle` line names the importing file and the exit code is 1

#### Scenario: Manifest problem
- **WHEN** a project's `project.json` has an unknown field
- **THEN** a line `<project>/project.json:<line>:<column>: warning project.unknown-field ...` is printed
