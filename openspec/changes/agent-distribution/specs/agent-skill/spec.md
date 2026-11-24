## MODIFIED Requirements

### Requirement: The skill ships with the command line
The `@meltemi/diagrams-cli` package SHALL hold the `meltemi-diagrams` skill under `skills/meltemi-diagrams/` (its `SKILL.md`, `reference/` and `examples/`), the same files with the same content as the repository's `skills/meltemi-diagrams/`, and the agent setup prompt under `agent-setup/prompt.md`; `pnpm skills:sync` SHALL write the skill's copy as it writes `.claude/skills`, `.agents/skills` and the public plugin's `plugins/meltemi-diagrams/skills`, and a test SHALL fail when a copy differs. `pnpm release:check` SHALL fail naming the path when the packed CLI tarball lacks `skills/meltemi-diagrams/SKILL.md` or `agent-setup/prompt.md`.

#### Scenario: The package's copy follows the canonical skill
- **WHEN** `skills/meltemi-diagrams/reference/c4.md` changes and `pnpm skills:sync` runs
- **THEN** `packages/cli/skills/meltemi-diagrams/reference/c4.md` holds the same text, and the package's `files` list `skills` and `agent-setup`

#### Scenario: A copy left behind is caught
- **WHEN** the canonical skill changes and `pnpm skills:sync` is not run
- **THEN** the skills test fails naming `packages/cli/skills/meltemi-diagrams` and the command to run

#### Scenario: The repository's agent folders
- **WHEN** `pnpm skills:sync` runs in the repository
- **THEN** `.claude/skills/meltemi-diagrams`, `.agents/skills/meltemi-diagrams`, `packages/cli/skills/meltemi-diagrams` and `plugins/meltemi-diagrams/skills/meltemi-diagrams` hold the skill, each folder's `.skills-sync.json` lists it, and no `.codex/skills/meltemi-diagrams` exists

#### Scenario: A tarball without the prompt
- **WHEN** `pnpm release:check` packs a CLI whose `files` omit `agent-setup`
- **THEN** the check fails naming `package/agent-setup/prompt.md` as missing

### Requirement: The installed skill names the installed command
The canonical `SKILL.md`, references (`reference/cloud.md` included) and examples SHALL name the command line as it is installed: `mdg <command>` for every command (in the examples, only their comments name commands), `mdg preview` serving the folder, and "the project's folder" for where commands run; `npx @meltemi/diagrams-cli@latest` SHALL stay as written. The only `pnpm` of the skill SHALL be the sentence of "Before you start" saying that inside the Meltemi Diagrams repository `pnpm mdg <command>` runs the same command. `skill install` SHALL copy the files without changing a byte, so that every copy and every way of installing gives the same text.

#### Scenario: Commands rewritten
- **WHEN** the canonical skill is read
- **THEN** its `SKILL.md` holds `mdg --version`, `mdg validate path/to/sheet.meltemi` and `mdg preview`, its `reference/cloud.md` holds `mdg login` and `mdg push`, and the only line of any file with `pnpm` is the sentence about the Meltemi Diagrams repository

#### Scenario: A repository command without a rule is caught
- **WHEN** the canonical skill gains a sentence with `pnpm gallery`
- **THEN** the skills test fails, naming the line that holds `pnpm`

#### Scenario: The installed copy is the canonical text
- **WHEN** `meltemi-diagrams skill install` writes the skill into a project
- **THEN** each file written equals the package's file byte for byte

### Requirement: The skill's front matter and size
`skills/meltemi-diagrams/SKILL.md` SHALL start with front matter holding `name: meltemi-diagrams`, a `description` of at most 1,024 characters that begins with when to use the skill before what it covers and names every profile of the language and every source that `import` reads, `license: MIT` and `metadata` with `version` equal to the product version (`CLI_VERSION`); `pnpm release:version <x.y.z>` SHALL write that version; the skills test SHALL fail when a key is missing, the description is longer or omits a profile or a source, the version differs, or `SKILL.md` has more than 500 lines or more than 32,000 bytes counted with LF line ends. The workflow SHALL open with a "Before you start" paragraph, within the file's first 40 lines, saying that `mdg --version` says which version is there, that where `mdg` is not on the path `npx @meltemi/diagrams-cli@latest <command>` runs the same command, and that inside the Meltemi Diagrams repository `pnpm mdg <command>` does; that new sheets go under `diagrams/`, or where the project keeps them; and that cloud commands run only when the person asks and no token (`mdg_…`) is printed, read, copied or committed. Its validation step SHALL name the summary line `Checked 1 file: 0 errors, 0 warnings.` as what success prints, and its review step SHALL say that `mdg preview` starts a server, to run when the person wants to look and to say how to stop. The cloud commands SHALL be described in `reference/cloud.md`, listed under Reference, and `SKILL.md` SHALL name none of them.

#### Scenario: The front matter
- **WHEN** the skills test reads `SKILL.md` with `CLI_VERSION` at `1.10.0`
- **THEN** it finds `name`, a `description` of at most 1,024 characters starting with "Use when", `license: MIT` and `metadata.version: 1.10.0`, the file has at most 500 lines and 32,000 bytes, and the token sentence is within its first 40 lines

#### Scenario: A description over the limit
- **WHEN** the description grows to 1,100 characters
- **THEN** the skills test fails naming the length and the limit

#### Scenario: A profile missing from the description
- **WHEN** the language gains a profile that the description does not name
- **THEN** the skills test fails naming the profile

#### Scenario: A file over the size
- **WHEN** `SKILL.md` grows to 32,400 bytes
- **THEN** the skills test fails naming the size and the limit, and a checkout with CRLF line ends measures the same size as one with LF

#### Scenario: The version left behind
- **WHEN** `pnpm release:version 1.11.0` runs
- **THEN** `SKILL.md` holds `version: 1.11.0` in its `metadata`; had it been edited by hand to another value, the skills test would fail naming `CLI_VERSION`

#### Scenario: The cloud reference
- **WHEN** the skill is read
- **THEN** `SKILL.md` names no cloud command but the sentence that they run only on request and that no token is printed, read, copied or committed, and `reference/cloud.md` holds `login`, `push`, `pull`, `review`, `publish` and `projects`

## ADDED Requirements

### Requirement: The ways to install in the agents guide
`docs/agents.md` and `docs/es/agents.md` SHALL give, in one table and one fenced block for each,
the four ways to install: the plugin for Claude Code and for Codex, the `skills` command with
`--skill meltemi-diagrams`, `mdg skill install` and the hosted prompt. For each it SHALL say what
it brings, how it updates and what it sends: the `skills` command is a third party's and sends
anonymous counts unless `DISABLE_TELEMETRY=1` is set; ours send nothing.

#### Scenario: The four ways
- **WHEN** the documentation test reads `docs/agents.md`
- **THEN** it finds `/plugin marketplace add askenaz-dev/meltemi-diagrams`, `/plugin install meltemi-diagrams@meltemi`, `codex plugin marketplace add askenaz-dev/meltemi-diagrams`, `npx skills add askenaz-dev/meltemi-diagrams --skill meltemi-diagrams` and `mdg skill install`, each in a fenced block

#### Scenario: What each brings
- **WHEN** a person reads the table
- **THEN** the Claude Code plugin's row says it brings the skill and the MCP tools for the project's folder, the Codex plugin's row the skill and the line that adds the MCP server, and the other rows the skill alone

#### Scenario: The Spanish page falls behind
- **WHEN** a command of the table changes in `docs/agents.md` and not in `docs/es/agents.md`
- **THEN** the documentation test fails naming the command and the Spanish file
