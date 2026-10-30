## MODIFIED Requirements

### Requirement: Assets command
`meltemi-diagrams assets` SHALL provide:

- `list [path]`, which prints the bundled fonts (family, group, weights, licence) first, then every pack (prefix, version, source, licence, redistribution, icon count) and project font (family, weight, style, file, licence), and the aliases;
- `icons <query> [--project <path>] [--limit <n>]`, which prints matching references one per line;
- `lock [path]`.

`[path]` defaults to the current folder. `validate` and `export` SHALL print asset diagnostics with the manifest diagnostics. An error SHALL make them exit with 1, and a warning SHALL do so with `--strict`. Unknown subcommands SHALL be usage errors (exit 2).

#### Scenario: List
- **WHEN** `meltemi-diagrams assets list corpus/projects/valid/assets` runs
- **THEN** stdout lists `tabler`, `brand` and `aws` with their licences, marks `aws` as not redistributable, and the exit code is 0

#### Scenario: Bundled fonts listed
- **WHEN** `meltemi-diagrams assets list` runs in a folder without a project
- **THEN** stdout starts with a "Bundled fonts" table of seventeen rows, `Roboto` in group `sans` with weights `400 500 600 700` and licence `OFL-1.1`, `Comic Neue` in `hand` with `400 700`, and the exit code is 0

#### Scenario: Search
- **WHEN** `meltemi-diagrams assets icons "cloud upload" --limit 3` runs
- **THEN** stdout has at most three lines, each a `tabler:` reference whose name or tags contain both words

#### Scenario: Unknown subcommand
- **WHEN** `meltemi-diagrams assets publish` runs
- **THEN** stderr names the subcommands and the exit code is 2
