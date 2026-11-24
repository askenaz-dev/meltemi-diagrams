## Purpose

The public plugin of Meltemi Diagrams for coding agents: one folder of the repository that the
marketplaces of Claude Code and Codex install from, with the skill, a native MCP entry for the
project's folder, and the checks that keep its files true.

## ADDED Requirements

### Requirement: The plugin's folder
`plugins/meltemi-diagrams/` SHALL hold `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`,
`.mcp.json`, `bin/mcp.mjs`, `README.md` and `skills/meltemi-diagrams/`, the canonical skill
written by `pnpm skills:sync`. No file of it SHALL be a link or name a path outside the folder,
and a test SHALL fail naming the file when one is missing or the skill differs.

#### Scenario: The folder after a sync
- **WHEN** `pnpm skills:sync` runs after `skills/meltemi-diagrams/SKILL.md` changes
- **THEN** `plugins/meltemi-diagrams/skills/meltemi-diagrams/SKILL.md` holds the same bytes and the six paths exist

#### Scenario: A manifest removed
- **WHEN** `plugins/meltemi-diagrams/.codex-plugin/plugin.json` is deleted
- **THEN** the plugin test fails naming that path

#### Scenario: A path that leaves the folder
- **WHEN** a manifest names `../../skills/` as its skills
- **THEN** the plugin test fails naming the manifest and the path

### Requirement: The marketplaces of the repository
The repository's root SHALL hold `.claude-plugin/marketplace.json`, a marketplace named `meltemi`
whose one plugin `meltemi-diagrams` has the source `./plugins/meltemi-diagrams`, and
`.agents/plugins/marketplace.json`, the same for Codex with a local source of that path. Both
SHALL parse and list no other plugin, and Claude Code's SHALL name an owner, which its format
requires.

#### Scenario: Claude Code's marketplace
- **WHEN** the plugin test reads `.claude-plugin/marketplace.json`
- **THEN** its `name` is `meltemi`, its `owner.name` is set, and its only plugin is `meltemi-diagrams` with `source` `./plugins/meltemi-diagrams`

#### Scenario: Codex's marketplace
- **WHEN** the plugin test reads `.agents/plugins/marketplace.json`
- **THEN** its only plugin is `meltemi-diagrams` with `source` `{ "source": "local", "path": "./plugins/meltemi-diagrams" }`

#### Scenario: A source that does not exist
- **WHEN** a marketplace's source names a folder that is not in the repository
- **THEN** the plugin test fails naming the marketplace file and the source

### Requirement: One identity in both manifests
The two plugin manifests SHALL carry the same `name` (`meltemi-diagrams`), `description`,
`author`, `license` (`MIT`), `homepage`, `repository` and `keywords`. The `description` SHALL have
at most 500 characters and name the five profiles. A test SHALL fail naming the key when the
manifests differ.

#### Scenario: Equal identities
- **WHEN** the plugin test compares the two manifests
- **THEN** the seven keys are equal, and the description has at most 500 characters and names flow, sequence, C4, free and gantt

#### Scenario: A description changed in one
- **WHEN** the description of `.claude-plugin/plugin.json` changes and the Codex manifest's does not
- **THEN** the plugin test fails naming `description`

### Requirement: The versions of the plugin
The Claude Code manifest SHALL carry no `version`, so that each commit that changes the plugin's
folder is an update for those who installed it. The Codex manifest's `version` SHALL equal the
product version, which `pnpm release:version` writes with the skill's.

#### Scenario: No version for Claude Code
- **WHEN** the plugin test reads `.claude-plugin/plugin.json`
- **THEN** it finds no `version` key

#### Scenario: The product version for Codex
- **WHEN** `pnpm release:version 1.12.0` runs
- **THEN** `.codex-plugin/plugin.json` holds `"version": "1.12.0"`; had it another value, the plugin test would fail naming `CLI_VERSION`

### Requirement: The MCP entry of the Claude Code plugin
The plugin's `.mcp.json` SHALL declare one server, `meltemi`, over standard input and output: Node
running the plugin's `bin/mcp.mjs` with the project's folder. The launcher SHALL start
`mcp --stdio --folder <folder>` with the project's own `@meltemi/diagrams-cli` when it has one and
with `npx -y @meltemi/diagrams-cli@latest` otherwise, without a shell. The entry SHALL hold no
address, port, token or key.

#### Scenario: The tools of the folder
- **WHEN** Claude Code enables the plugin in a project that holds `diagrams/checkout.meltemi`
- **THEN** the server lists `validate`, `inspect_story` and `preview`, and `preview` of that path returns its picture

#### Scenario: A project that pins the command line
- **WHEN** the project's `node_modules` holds `@meltemi/diagrams-cli`
- **THEN** the launcher runs that version and downloads nothing

#### Scenario: A folder with spaces
- **WHEN** the project's folder is `C:\Users\Ana\My diagrams`
- **THEN** the server starts and serves that folder

#### Scenario: The command line cannot start
- **WHEN** neither the project's command line nor `npx` can be started
- **THEN** the launcher writes one line to standard error saying what it tried and how to install the command line, and exits with a code other than 0

### Requirement: The Codex plugin brings the skill
The Codex manifest SHALL name the plugin's skills and an `interface` with a display name, a short
and a long description, the developer's name, a category and its capabilities, and SHALL declare
no MCP server. The agents guide SHALL give the one line that adds the stdio server to Codex.

#### Scenario: The Codex manifest
- **WHEN** the plugin test reads `.codex-plugin/plugin.json`
- **THEN** it finds `skills` pointing to `./skills/`, the six `interface` fields and no `mcpServers`

#### Scenario: The line for the server
- **WHEN** a person reads the Codex part of the agents guide
- **THEN** it holds `codex mcp add meltemi -- npx -y @meltemi/diagrams-cli@latest mcp --stdio --folder .` and says to run it in the project's folder

### Requirement: The plugin is tried in its clients
Before the guide names a client, the plugin SHALL be installed in that client from the
repository's marketplace and found active: the skill listed and, in Claude Code, the three tools
of the folder answering. The trial's record SHALL be a dated note under `docs/quality/` with the
client's version and what each check returned, and `claude plugin validate` SHALL pass for the
marketplace and the plugin's folder with no warning but the missing `version`.

#### Scenario: Claude Code
- **WHEN** the plugin is installed with `/plugin marketplace add` and `/plugin install meltemi-diagrams@meltemi` in an empty project
- **THEN** the note records the skill listed, the tools `validate`, `inspect_story` and `preview` answering, and the validation's output

#### Scenario: A client where it does not load
- **WHEN** the plugin installs in a client and its skill is not listed
- **THEN** the note records the failure and the guide does not name that client until it is fixed
