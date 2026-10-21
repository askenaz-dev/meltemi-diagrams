## ADDED Requirements

### Requirement: Command names
The CLI package SHALL install the binaries `meltemi-diagrams` and `mdg`, both running the same entry point with identical behaviour and exit codes. Help, usage, error and version output SHALL name `meltemi-diagrams`, and the help text SHALL mention the `mdg` alias. An unknown command SHALL be rejected with exit code 2, naming the command and pointing to `meltemi-diagrams --help`.

#### Scenario: Both binaries declared
- **WHEN** `packages/cli/package.json` is read
- **THEN** its `bin` maps both `meltemi-diagrams` and `mdg` to `./dist/bin.js`

#### Scenario: Help text
- **WHEN** `meltemi-diagrams --help` runs
- **THEN** the output starts with `Usage: meltemi-diagrams <command> [options]` and contains `Alias: mdg`

#### Scenario: Unknown command
- **WHEN** `mdg frobnicate` runs
- **THEN** stderr says `meltemi-diagrams: unknown command "frobnicate". Run "meltemi-diagrams --help".` and the exit code is 2

### Requirement: Root script
The workspace SHALL expose the CLI from sources as `pnpm mdg <command>`, and SHALL NOT keep a `studio` script.

#### Scenario: Running from sources
- **WHEN** `pnpm mdg validate corpus/valid` runs in the repository
- **THEN** it validates the corpus exactly as the built `meltemi-diagrams validate corpus/valid` would

#### Scenario: Old script removed
- **WHEN** the root `package.json` scripts are listed
- **THEN** there is a `mdg` script and no `studio` script
