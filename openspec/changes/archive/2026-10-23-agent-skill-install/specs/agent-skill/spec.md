## ADDED Requirements

### Requirement: The skill ships with the command line
The `@meltemi/diagrams-cli` package SHALL hold the `meltemi-diagrams` skill under `skills/meltemi-diagrams/` (its `SKILL.md`, `reference/` and `examples/`), the same files with the same content as the repository's `skills/meltemi-diagrams/`; `pnpm skills:sync` SHALL write that copy as it writes `.claude/skills` and `.codex/skills`, and a test SHALL fail when the copy differs.

#### Scenario: The package's copy follows the canonical skill
- **WHEN** `skills/meltemi-diagrams/reference/c4.md` changes and `pnpm skills:sync` runs
- **THEN** `packages/cli/skills/meltemi-diagrams/reference/c4.md` holds the same text, and the package's `files` list `skills`

#### Scenario: A copy left behind is caught
- **WHEN** the canonical skill changes and `pnpm skills:sync` is not run
- **THEN** the skills test fails naming `packages/cli/skills/meltemi-diagrams` and the command to run

### Requirement: Installing the skill into a project
`meltemi-diagrams skill install [folder] [--agent claude|codex|all] [--user] [--force]` SHALL write the skill into `<folder>/.claude/skills/meltemi-diagrams/` for `claude`, `<folder>/.codex/skills/meltemi-diagrams/` for `codex`, and both for `all` (the default), the folder being the working one when none is given; with `--user` it SHALL write the same paths under the home folder and refuse a folder argument. It SHALL print `Wrote <path>` per folder written and exit 0. A destination folder that exists SHALL be a usage error (exit 2) naming it and writing nothing, unless `--force`, which replaces that folder only. An unknown `--agent` SHALL be a usage error listing the agents.

#### Scenario: Install for both agents
- **WHEN** `meltemi-diagrams skill install` runs in an empty project folder
- **THEN** `.claude/skills/meltemi-diagrams/SKILL.md` and `.codex/skills/meltemi-diagrams/SKILL.md` exist with the skill's references and examples, two `Wrote` lines are printed and the exit code is 0

#### Scenario: One agent, for the person
- **WHEN** `meltemi-diagrams skill install --agent claude --user` runs
- **THEN** the skill is written under `~/.claude/skills/meltemi-diagrams/` and nothing under `.codex`

#### Scenario: An existing copy
- **WHEN** the skill was installed before and `skill install` runs again without `--force`
- **THEN** the exit code is 2, the message names `.claude/skills/meltemi-diagrams`, and the files are unchanged; with `--force` they are written again and a file of the person's beside the skill stays

#### Scenario: An unknown agent
- **WHEN** `meltemi-diagrams skill install --agent cursor` runs
- **THEN** the exit code is 2 and the message lists `claude`, `codex` and `all`

### Requirement: The installed skill names the installed command
The installed `SKILL.md`, references and examples SHALL name the command line as it is installed: `mdg <command>` for every `pnpm mdg <command>` of the canonical text (in the examples, only their comments name commands), `mdg preview` serving the folder for `pnpm preview` serving the repository, and "the project's folder" for "the repository root"; no `pnpm` SHALL remain in the installed files, and nothing else of them SHALL change.

#### Scenario: Commands rewritten
- **WHEN** the skill is installed
- **THEN** its `SKILL.md` holds `mdg validate path/to/sheet.meltemi` and `mdg preview`, and no file of it holds `pnpm`

#### Scenario: A repository command without a rule is caught
- **WHEN** the canonical skill gains a sentence with `pnpm gallery`
- **THEN** the skill command's test fails, naming the line that still holds `pnpm`

### Requirement: Documentation for agents
`docs/agents.md` and `docs/es/agents.md` SHALL say what the skill teaches, how to install it with `skill install` (and with `npx @meltemi/diagrams-cli skill install` where the command is not installed), by hand from the package's `skills/` folder, and how to ask an agent to draw; `docs/cli.md` and its Spanish copy SHALL document `skill install`; the README's "For agents" section and the documentation index SHALL link the page.

#### Scenario: The page is reachable
- **WHEN** the documentation's link check runs
- **THEN** `docs/agents.md` is linked from `docs/README.md` and the README, and every link and anchor in it resolves

#### Scenario: A missing Spanish page
- **WHEN** `docs/agents.md` exists without `docs/es/agents.md`
- **THEN** the localized documentation test fails naming the page
