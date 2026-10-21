## ADDED Requirements

### Requirement: Validate command
`studio validate <path>...` SHALL compile every `.arch` file given, or found recursively under a given directory, and print one line per diagnostic as `<path>:<line>:<column>: <severity> <code> <message>`, followed by a summary line with the number of files, errors and warnings. The exit code SHALL be 0 when no error was found, 1 when at least one error was found, and 2 on usage errors or unreadable paths.

#### Scenario: Valid corpus
- **WHEN** `studio validate corpus/valid` runs
- **THEN** the output ends with a summary naming the file count and zero errors and the exit code is 0

#### Scenario: File with an error
- **WHEN** `studio validate corpus/invalid/ref.unknown-element.arch` runs
- **THEN** one line `corpus/invalid/ref.unknown-element.arch:6:11: error ref.unknown-element ...` is printed and the exit code is 1

#### Scenario: Missing path
- **WHEN** `studio validate does-not-exist.arch` runs
- **THEN** a message names the missing path and the exit code is 2

### Requirement: Machine-readable and strict modes
With `--json` the command SHALL print a single JSON object `{ files: [{ path, diagnostics }], summary }` using the diagnostics JSON shape and nothing else on stdout. With `--strict` warnings SHALL count as errors for the exit code.

#### Scenario: JSON output
- **WHEN** `studio validate --json corpus/valid` runs
- **THEN** stdout parses as JSON with a `files` array and a `summary` object

#### Scenario: Strict mode with a warning
- **WHEN** a file with only a `syntax.mixed-line-endings` warning is validated with and without `--strict`
- **THEN** the exit code is 1 with `--strict` and 0 without it
