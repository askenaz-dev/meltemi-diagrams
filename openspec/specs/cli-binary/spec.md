# cli-binary Specification

## Purpose
The installed command names (`meltemi-diagrams` and the alias `mdg`) and how the CLI identifies itself.
## Requirements
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

### Requirement: Language of the command line
Every command SHALL accept `--lang en|es` anywhere among its arguments. The language of help, usage errors, messages, summaries, prompts and diagnostics SHALL be `--lang` when given, else `MELTEMI_LANG`, else the first Spanish or English language of `LC_ALL`, `LC_MESSAGES` and `LANG` (ignoring `C` and `POSIX`), else the system's language, else English. Files a command writes, the review report included, SHALL follow `--lang`, else the project's `locale`, else English, and never the machine's language. Another `--lang` value SHALL be a usage error. Codes, exit codes and the keys of machine-readable output SHALL NOT depend on the language. Confirmation prompts SHALL accept the answers of both languages.

#### Scenario: Spanish summary
- **WHEN** `meltemi-diagrams validate corpus/valid --lang es` runs
- **THEN** the summary is in Spanish and the exit code is the same as in English

#### Scenario: Environment
- **WHEN** `MELTEMI_LANG=es` and no `--lang` is given
- **THEN** `meltemi-diagrams --help` prints the help in Spanish, still starting with `meltemi-diagrams`

#### Scenario: Unsupported language
- **WHEN** `meltemi-diagrams validate corpus/valid --lang fr` runs
- **THEN** stderr says that `--lang` must be `en` or `es` and the exit code is 2

#### Scenario: A review report written on a Spanish machine
- **WHEN** `meltemi-diagrams review` writes its report with `LANG=es_CL.UTF-8`, no `--lang` and a project without `locale`
- **THEN** the report's words are English, and its messages in the terminal are Spanish

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

