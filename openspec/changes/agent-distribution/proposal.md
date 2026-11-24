# Proposal

## Why

The `meltemi-diagrams` skill reaches a project through our own command (`skill install`) or our
hosted prompt, and through nothing else. The places where people find and install agent skills
today, the plugin marketplaces of Claude Code and Codex and the `skills` command with its public
registry, read a repository directly, and ours is not ready for them: decision 0056 left
"plugin marketplaces or skill registries" as an owner step, the repository's skill names
`pnpm mdg`, which no other project has, and the only plugins we build are those of the local
Docker workspace. The README, the first page a visitor reads, opens with a global npm install and
shows its gallery after 190 lines; and when an export fails because no browser or FFmpeg is
installed, neither a person nor an agent has a command that says what is missing.

The review of 24 November 2026 of a widely used agent skill for diagrams (design.md, Context)
showed how far one install line per host, a first page that shows the result and a diagnostic
command carry a tool that has no engine. Meltemi has the engine and not the reach.

This is a post-1.0 distribution improvement outside `docs/roadmap-1.0.md`.

## What Changes

- The skill has one text: the canonical files name `mdg <command>` as an installed project runs
  it, with one sentence for this repository's `pnpm mdg`, and `skill install` copies them
  unchanged. The rewrite at install time goes away, and every way of installing gives the same
  bytes.
- A public plugin, `plugins/meltemi-diagrams/`, with manifests for Claude Code and Codex and
  marketplace files at the repository's root: `/plugin marketplace add askenaz-dev/meltemi-diagrams`
  and its Codex pair install the skill, and in Claude Code also a native MCP entry that checks
  and draws the files of the project's folder.
- `mdg mcp --stdio` serves the local MCP tools over standard input and output, for a client that
  starts the server itself, with no port, key or listener.
- The agents guide and the README give one set of install commands for each way: the plugin, the
  `skills` command (`npx skills add askenaz-dev/meltemi-diagrams --skill meltemi-diagrams`),
  `mdg skill install` and the hosted prompt, saying what each brings and how it updates.
- The README, in English and Spanish, opens with what the product is, the agents' install and
  four requests in plain words, then the install without an agent, the gallery and a comparison
  with Mermaid, draw.io and diagrams an agent draws as HTML, limits of ours included.
- `mdg doctor` reports, without the network and without writing anything, the Node version, the
  browser for PNG and PDF, FFmpeg for video, the copies of the skill with their version and
  whether a sign-in is stored, as lines or as JSON.
- The skills test also fails when `SKILL.md` passes 32,000 bytes or its description omits a
  profile of the language or a source that `import` reads.

## Capabilities

### New Capabilities

- `agent-plugin`: the public plugin's folder, its manifests and marketplaces, its versions, its
  MCP entry and its checks.
- `mcp-stdio`: the local MCP server over standard input and output.
- `cli-doctor`: the `doctor` command, what each check reports, its JSON and what it never does.
- `repository-readme`: the README's first screen, its gallery, its comparison and the commands it
  shares with the agents guide.

### Modified Capabilities

- `agent-skill`: the canonical skill names the installed command and is copied unchanged; the
  plugin is one of its copies; the size and description rules; the install channels in the guide.

## Impact

Changes touch `packages/cli` (`skill install` without a rewrite, `mcp --stdio`, `doctor`, their
help and messages in both languages), `packages/capture` (what `doctor` reads of the browser and
FFmpeg), `scripts/sync-skills.mjs`, the canonical skill and its copies, the new `plugins/` folder
and the marketplace files at the root, `README.md`, `README.es.md`, `docs/agents.md`, `docs/cli.md`
and their Spanish pairs, and the skills, documentation and README tests. No new dependency: the
stdio transport is in the MCP library the server already uses. The repository's own `AGENTS.md`
and its scripts keep `pnpm mdg`.

## Non-goals

- What the skill teaches about design, the look at the drawing and the brand theme: the
  `diagram-design-guidance` change.
- Listing the plugin in the vendors' own directories and the accounts they need: an owner step of
  `delivery`.
- A bundled MCP entry in the Codex plugin: its guide gives the one line that adds the server.
- Slash commands in the plugin: the skill and the MCP tools are its surface.
- A skill archive attached to GitHub releases: an uploaded skill has no command line to run, and
  the hosted MCP endpoint serves the clients that take uploads.
- Changes to the local Docker workspace's plugins, which keep their name and their own endpoint.
- Publication, deployment and production verification, which belong to `delivery`.
