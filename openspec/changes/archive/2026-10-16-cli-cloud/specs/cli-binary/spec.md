## ADDED Requirements

### Requirement: Cloud command names
The binary SHALL offer `login`, `logout`, `whoami`, `push`, `pull`, `publish` and `projects`
under both names (`meltemi-diagrams`, `mdg`), listed by `--help` with one line each in the
interface language; an unknown option of these commands SHALL exit with code 2 and the usage.

#### Scenario: Help lists them
- **WHEN** `mdg --help` runs
- **THEN** the seven commands appear with their descriptions

#### Scenario: Unknown option
- **WHEN** `mdg push --sync` runs
- **THEN** the usage of `push` is printed and the exit code is 2
