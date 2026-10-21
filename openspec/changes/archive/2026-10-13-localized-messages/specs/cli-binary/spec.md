## ADDED Requirements

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
