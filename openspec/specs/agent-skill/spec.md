# agent-skill Specification

## Purpose
The `meltemi-diagrams` skill for coding agents ships with the command line, `skill install` writes it into a project or the person's folders for Claude Code and Codex with the installed command's names, and the documentation tells people how to use it.
## Requirements
### Requirement: The skill ships with the command line
The `@meltemi/diagrams-cli` package SHALL hold the `meltemi-diagrams` skill under `skills/meltemi-diagrams/` (its `SKILL.md`, `reference/` and `examples/`), the same files with the same content as the repository's `skills/meltemi-diagrams/`, and the agent setup prompt under `agent-setup/prompt.md`; `pnpm skills:sync` SHALL write the skill's copy as it writes `.claude/skills` and `.agents/skills`, and a test SHALL fail when a copy differs. `pnpm release:check` SHALL fail naming the path when the packed CLI tarball lacks `skills/meltemi-diagrams/SKILL.md` or `agent-setup/prompt.md`.

#### Scenario: The package's copy follows the canonical skill
- **WHEN** `skills/meltemi-diagrams/reference/c4.md` changes and `pnpm skills:sync` runs
- **THEN** `packages/cli/skills/meltemi-diagrams/reference/c4.md` holds the same text, and the package's `files` list `skills` and `agent-setup`

#### Scenario: A copy left behind is caught
- **WHEN** the canonical skill changes and `pnpm skills:sync` is not run
- **THEN** the skills test fails naming `packages/cli/skills/meltemi-diagrams` and the command to run

#### Scenario: The repository's agent folders
- **WHEN** `pnpm skills:sync` runs in the repository
- **THEN** `.claude/skills/meltemi-diagrams`, `.agents/skills/meltemi-diagrams` and `packages/cli/skills/meltemi-diagrams` hold the skill, each folder's `.skills-sync.json` lists it, and no `.codex/skills/meltemi-diagrams` exists

#### Scenario: A tarball without the prompt
- **WHEN** `pnpm release:check` packs a CLI whose `files` omit `agent-setup`
- **THEN** the check fails naming `package/agent-setup/prompt.md` as missing

### Requirement: Installing the skill into a project
`meltemi-diagrams skill install [folder] [--agent <names>] [--user] [--force]` SHALL write the skill into the folder each agent reads: `<folder>/.claude/skills/meltemi-diagrams/` for `claude`, and `<folder>/.agents/skills/meltemi-diagrams/` for `codex`, `cursor`, `copilot`, `gemini`, `windsurf`, `devin` and the generic `agents`; `--agent` SHALL take one name, `all` (every distinct folder, the default) or a comma-separated list, and may be repeated; a folder shared by several names SHALL be written once and printed once; the folder is the working one when none is given; with `--user` it SHALL write the same paths under the home folder (`~/.claude/skills`, `~/.agents/skills`) and refuse a folder argument. It SHALL print `Wrote <path>` per folder written and exit 0, and SHALL write skill folders only, never an instruction file of the project. A destination folder that exists SHALL be a usage error (exit 2) naming it and writing nothing, unless `--force`, which replaces that folder only. An unknown or empty agent name SHALL be a usage error listing the eight names and `all`.

#### Scenario: Install for every agent
- **WHEN** `meltemi-diagrams skill install` runs in an empty project folder
- **THEN** `.claude/skills/meltemi-diagrams/SKILL.md` and `.agents/skills/meltemi-diagrams/SKILL.md` exist with the skill's references and examples, exactly two `Wrote` lines are printed, nothing else is written, and the exit code is 0

#### Scenario: Install for both agents
- **WHEN** `meltemi-diagrams skill install --agent codex --agent claude` runs in an empty project folder
- **THEN** `.claude/skills/meltemi-diagrams/` and then `.agents/skills/meltemi-diagrams/` are written, in the table's order, two `Wrote` lines are printed in that order and the exit code is 0

#### Scenario: A list of agents sharing a folder
- **WHEN** `meltemi-diagrams skill install --agent codex,cursor,copilot` runs
- **THEN** `.agents/skills/meltemi-diagrams/` is written once, one `Wrote` line is printed and no `.claude` folder exists

#### Scenario: One agent, for the person
- **WHEN** `meltemi-diagrams skill install --agent gemini --user` runs
- **THEN** the skill is written under `~/.agents/skills/meltemi-diagrams/` and nothing under `~/.claude`

#### Scenario: An existing copy
- **WHEN** the skill was installed before and `skill install` runs again without `--force`
- **THEN** the exit code is 2, the message names `.claude/skills/meltemi-diagrams`, and the files are unchanged; with `--force` they are written again and a file of the person's beside the skill stays

#### Scenario: An unknown agent
- **WHEN** `meltemi-diagrams skill install --agent cline` runs
- **THEN** the exit code is 2 and the message lists `claude`, `codex`, `cursor`, `copilot`, `gemini`, `windsurf`, `devin`, `agents` and `all`

#### Scenario: An empty name in the list
- **WHEN** `meltemi-diagrams skill install --agent claude,` runs
- **THEN** the exit code is 2, the message lists the agents and nothing is written

### Requirement: The installed skill names the installed command
The installed `SKILL.md`, references (`reference/cloud.md` included) and examples SHALL name the command line as it is installed: `mdg <command>` for every `pnpm mdg <command>` of the canonical text (in the examples, only their comments name commands), `mdg preview` serving the folder for `pnpm preview` serving the repository, and "the project's folder" for "the repository root"; `npx @meltemi/diagrams-cli@latest` SHALL stay as written; no `pnpm` SHALL remain in the installed files, and nothing else of them SHALL change.

#### Scenario: Commands rewritten
- **WHEN** the skill is installed
- **THEN** its `SKILL.md` holds `mdg --version`, `mdg validate path/to/sheet.meltemi` and `mdg preview`, its `reference/cloud.md` holds `mdg login` and `mdg push`, and no file of it holds `pnpm`

#### Scenario: A repository command without a rule is caught
- **WHEN** the canonical skill gains a sentence with `pnpm gallery`
- **THEN** the skill command's test fails, naming the line that still holds `pnpm`

### Requirement: Documentation for agents
`docs/agents.md` and `docs/es/agents.md` SHALL hold the one-line prompt in a fenced block, the address `https://diagrams.meltemi.dev/agent-setup/prompt.md` and the page `https://diagrams.meltemi.dev/agent-setup/`, `skill prompt` for an agent without web access, what the skill teaches, how to install it with `skill install` (the agents table: name, agent, folder; the list; `--user`; `--force`; `npm install --global @meltemi/diagrams-cli`; and `npx @meltemi/diagrams-cli@latest skill install --agent <names>` where the command is not installed), by hand from the package's `skills/` folder, what the agent proves and must never do, and how to ask an agent to draw; `docs/cli.md` and its Spanish copy SHALL document `skill install` with the agents and `skill prompt`; `docs/playground.md` and its Spanish copy SHALL list `agent-setup/` among what the build writes and the About dialog's link; the README's "For agents" section in both languages and the documentation index SHALL link the page and the hosted address; `docs/agents.md` SHALL be in the docs test's translated list; a test SHALL fail when the one-line prompt of the docs differs from the agent-setup page's.

#### Scenario: The page is reachable
- **WHEN** the documentation's link check runs
- **THEN** `docs/agents.md` is linked from `docs/README.md` and the README, and every link and anchor in it resolves

#### Scenario: A missing Spanish page
- **WHEN** `docs/agents.md` exists without `docs/es/agents.md`
- **THEN** the localized documentation test fails naming `docs/es/agents.md`

#### Scenario: The one-liner drifts
- **WHEN** a word of the one-line prompt changes in `docs/agents.md` and not in `packages/playground/agent-setup/en.html`
- **THEN** the agent-setup test fails naming the two files

### Requirement: The agent setup prompt
The `@meltemi/diagrams-cli` package SHALL hold `agent-setup/prompt.md` (listed in its `files`), an English text of 500 to 1,000 words addressed to a coding agent, with the sections `# Set up Meltemi Diagrams for a coding agent`, `## What Meltemi Diagrams is`, `## Before you start`, `## Install the skill`, `## Prove it`, `## Never` and `## Next`, in that order. It SHALL tell the agent to check terminal access (and to hand the person the commands and stop when it has none), Node 22.12 or later (when it is missing or older, to tell the person and stop), the command line's version with `npx @meltemi/diagrams-cli@latest --version` or `mdg --version` (1.10.0 or later; when it is older, to tell the person that the published command line is older than the prompt needs and stop) and which agents the project uses, asking when unclear; to install with `npx @meltemi/diagrams-cli@latest skill install --agent <names>` in the project's root, keeping a copy already there and using `--user` and `--force` only when asked; to prove it with a sequence diagram of one real flow under `diagrams/` (at most six participants and twelve messages), or `init --template sequence` and its `diagrams/sign-in.meltemi` when there is no code to read, validated until the last line reads `Checked 1 file: 0 errors, 0 warnings.` and exported to SVG whose path it reports with that line, with `mdg preview` only when asked; and never to print, read, copy or commit a token (`mdg_…`), run `login`, `push`, `pull`, `publish` or any cloud command unasked, commit, stage or change the project's configuration, CI or instruction files beyond the skill folders without asking, add `--force` or `--user` unasked, install or download Node or any other tool, draw a picture by hand, edit an exported SVG or retype a Mermaid or PlantUML source. The text SHALL name no `pnpm` command and no `.codex` folder. `meltemi-diagrams skill prompt` SHALL print the file to stdout byte for byte and exit 0; `skill prompt` with any argument SHALL be a usage error (exit 2). The playground build SHALL copy the file unchanged to `dist/agent-setup/prompt.md`.

#### Scenario: The command prints the prompt
- **WHEN** `meltemi-diagrams skill prompt` runs
- **THEN** stdout is exactly the text of `packages/cli/agent-setup/prompt.md` and the exit code is 0

#### Scenario: The prompt has its sections and rules
- **WHEN** the prompt test reads `packages/cli/agent-setup/prompt.md`
- **THEN** the seven headings are found in order, the text holds `Checked 1 file: 0 errors, 0 warnings.`, `npx @meltemi/diagrams-cli@latest skill install`, `1.10.0`, `Node 22.12`, `If it is missing or older`, `--template sequence` and each never-rule, holds no `pnpm` and no `.codex`, and has 500 to 1,000 words

#### Scenario: A rule removed is caught
- **WHEN** the sentence about tokens (`mdg_…`) is removed from the prompt
- **THEN** the prompt test fails naming the missing rule

#### Scenario: An argument to `skill prompt`
- **WHEN** `meltemi-diagrams skill prompt es` runs
- **THEN** the exit code is 2 and the message says `skill prompt` takes no argument

#### Scenario: The hosted copy
- **WHEN** `pnpm playground:build` runs
- **THEN** `dist/agent-setup/prompt.md` is byte for byte the package's `agent-setup/prompt.md`

### Requirement: The skill's front matter and size
`skills/meltemi-diagrams/SKILL.md` SHALL start with front matter holding `name: meltemi-diagrams`, a `description` of at most 1,024 characters that begins with when to use the skill before what it covers, `license: MIT` and `metadata` with `version` equal to the product version (`CLI_VERSION`); `pnpm release:version <x.y.z>` SHALL write that version; the skills test SHALL fail when a key is missing, the description is longer, the version differs or `SKILL.md` has more than 500 lines. The workflow SHALL open with a "Before you start" paragraph, within the file's first 40 lines, saying that `pnpm mdg --version` says which version is there and that, where `mdg` is not on the path, `npx @meltemi/diagrams-cli@latest <command>` runs the same command; that new sheets go under `diagrams/`, or where the project keeps them; and that cloud commands run only when the person asks and no token (`mdg_…`) is printed, read, copied or committed. Its validation step SHALL name the summary line `Checked 1 file: 0 errors, 0 warnings.` as what success prints, and its review step SHALL say that `pnpm preview` starts a server, to run when the person wants to look and to say how to stop. The cloud commands SHALL be described in `reference/cloud.md`, listed under Reference, and `SKILL.md` SHALL name none of them.

#### Scenario: The front matter
- **WHEN** the skills test reads `SKILL.md` with `CLI_VERSION` at `1.10.0`
- **THEN** it finds `name`, a `description` of at most 1,024 characters starting with "Use when", `license: MIT` and `metadata.version: 1.10.0`, the file has at most 500 lines and the token sentence is within its first 40 lines

#### Scenario: A description over the limit
- **WHEN** the description grows to 1,100 characters
- **THEN** the skills test fails naming the length and the limit

#### Scenario: The version left behind
- **WHEN** `pnpm release:version 1.11.0` runs
- **THEN** `SKILL.md` holds `version: 1.11.0` in its `metadata`; had it been edited by hand to another value, the skills test would fail naming `CLI_VERSION`

#### Scenario: The cloud reference
- **WHEN** the skill is read
- **THEN** `SKILL.md` names no cloud command but the sentence that they run only on request and that no token is printed, read, copied or committed, and `reference/cloud.md` holds `login`, `push`, `pull`, `review`, `publish` and `projects`

