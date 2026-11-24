# Design

## Context

See proposal.md for the motivation. What shapes the approach:

- The canonical skill is `skills/meltemi-diagrams/`; `scripts/sync-skills.mjs` copies it to
  `.claude/skills`, `.agents/skills` and `packages/cli/skills`, and
  `packages/render/test/skills.test.ts` holds the copies equal. The canonical text names
  `pnpm mdg`; `installedText` (`packages/cli/src/skill-command.ts`) rewrites it to `mdg` when
  `skill install` copies it, and a test fails when a `pnpm` survives.
- The repository already builds plugins, for the local Docker workspace only
  (`packages/cloud/src/local-agent-setup.ts`): a marketplace file at the root, a plugin under
  `plugins/<name>/` with `.claude-plugin/plugin.json` or `.codex-plugin/plugin.json`, `skills`
  and `mcpServers: "./.mcp.json"`. `scripts/check-local-agent-plugins.ts` checks that shape; its
  plugin is `meltemi-diagrams-local`.
- `mdg mcp` serves Streamable HTTP on `127.0.0.1:7373` and nothing else
  (`packages/cli/src/mcp-command.ts`, `mcp-http.ts`); folder mode (`--folder`) needs no account and
  draws previews with its own rasteriser, with no browser. The MCP library it uses
  (`@modelcontextprotocol/server` 2.3.1) includes a stdio transport.
- Releases are automatic on each push to `main`; versions are stamped in the packaging checkout
  and no commit goes back to `main`, so the manifests in the repository hold the declared version
  (`1.11.0` while the releases are `1.11.x`).
- Facts read on 24 November 2026:
  - Claude Code (its plugin and marketplace references): a marketplace is
    `.claude-plugin/marketplace.json` at the repository's root; a plugin's source may be a folder
    of the same repository (`./plugins/x`), with no `..` and no link out of it; a manifest without
    `version` takes the commit of the plugin's folder as its version, so every change is an
    update, while a written version holds users until it changes; a plugin's `.mcp.json` may
    declare stdio servers, with `${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_PROJECT_DIR}` expanded in
    `command`, `args` and `env`; the working folder of such a server is not stated;
    `claude plugin validate <path> --strict` checks manifests, marketplaces, skills and `.mcp.json`.
  - Codex (its plugin pages): the manifest is `.codex-plugin/plugin.json` and the marketplace
    `.agents/plugins/marketplace.json`, with a local source relative to the marketplace's root; a
    marketplace on a branch receives later commits. The pages state neither the shape of a
    plugin's stdio server, nor variables expanded in it, nor its working folder.
  - The `skills` command (`vercel-labs/skills`): `npx skills add owner/repo` searches `skills/`
    and the agents' folders of a repository; `--skill <name>` picks one; installs are counted by
    anonymous telemetry, off with `DISABLE_TELEMETRY=1`; what it does with a name found in
    several folders is not stated. This repository also holds the OpenSpec skills under
    `.claude/skills` and `.codex/skills`, which that search would offer.
- The reviewed skill is `cathrynlavery/diagram-design` (MIT). What transfers: one plugin root with
  a manifest per host, an install line per host in the README, a first page that shows results
  and compares honestly, a read-only `doctor`, and tests that hold the skill's size and
  description. Its version bump by a commit on `main` does not: ours never commits back.

## Goals / Non-Goals

**Goals:**

- Any way of installing gives the same skill, byte for byte.
- A person with Claude Code or Codex installs from the repository with the client's own commands,
  and with any other agent through the `skills` command, without our command line installed first.
- Updates need no step of ours beyond merging to `main`.
- The README and the agents guide never disagree on a command.

**Non-Goals:**

- A package or a registry of our own for the plugin.
- Telemetry of ours, or counting installs.
- Changing what the hosted prompt (`agent-setup/prompt.md`) tells an agent to do.

## Decisions

### One text: the canonical skill names `mdg`

The canonical files change from `pnpm mdg <command>` to `mdg <command>`, from `pnpm preview` to
`mdg preview` and from "the repository root" to "the project's folder". "Before you start" gains
one clause: inside the Meltemi Diagrams repository, `pnpm mdg <command>` runs the same command.
`installedText` and its test go; `skill install` copies bytes. The skills test keeps the guard the
other way round: any `pnpm` outside that sentence fails.

- Alternative: keep the repository's wording and rewrite in every channel. Rejected: marketplaces
  and the `skills` command read the repository's files as they are, so the rewrite cannot run
  there, and a second generated tree for them would be a second text to keep equal.
- Alternative (decision 0056 weighed it and chose the rewrite): write the skill for products and
  leave this repository's agents without a matching command. Answered now by the one clause, which
  the repository's `AGENTS.md` already agrees with.

### The plugin is a folder of this repository

`plugins/meltemi-diagrams/` holds both manifests, the MCP entry, its launcher, a README and the
skill's copy, the fourth target of `pnpm skills:sync`. The marketplaces at the root name it by
relative path, the form both clients document and the local plugins already use.

- Alternative: the repository's root as the plugin. Rejected: a monorepo root is not
  plugin-shaped, and Claude Code refuses paths that leave the plugin's folder.
- Alternative: an npm package as the plugin's source. Rejected: a twenty-first package to publish
  and to register for trusted publishing, and only one of the two clients documents that source.
- Alternative: a repository of its own. Rejected: the skill would be reviewed and released apart
  from the language it describes.

### The marketplace is `meltemi`, the plugin `meltemi-diagrams`

The install reads `meltemi-diagrams@meltemi`, and the family's other products can add plugins to
the same marketplace name from their own repositories. The local workspace's plugin keeps the name
`meltemi-diagrams-local` and its marketplaces `meltemi-local-<port>`, so both can be installed.

- Alternative: a marketplace named `meltemi-diagrams`. Rejected: `meltemi-diagrams@meltemi-diagrams`
  reads as a mistake, and the name would not fit a second product.

### Versions: none for Claude Code, the declared one for Codex

Claude Code's manifest has no `version`: the commit of the plugin's folder is the version, and a
merge that changes the skill is the update. Codex's manifest carries the declared product version,
written by `pnpm release:version` with the skill's `metadata.version` and held by the same test;
Codex follows the branch.

- Alternative: a version bumped by a commit on `main` after each merge, as the reviewed skill
  does. Rejected: the release design has no commits back to `main`.
- Alternative: the stamped release version in both manifests. Rejected: it exists only in the
  packaging checkout, which no marketplace reads.

### The command line gains a stdio transport

`mcp --stdio` builds the same server (`buildServer` with the folder's or the account's handlers)
and connects it to the library's stdio transport instead of `startLocalServer`. Standard output is
the protocol's; the address line and the calls' lines go to standard error; a closed input ends
the process with code 0. `--port` is refused, no key is read and no socket is opened.

- Alternative: have the plugin start the HTTP listener and point the client at its address.
  Rejected: a fixed port per project, a process that outlives the session and a key to carry.

### The plugin's server is started by a launcher, without a shell

`.mcp.json` runs `node ${CLAUDE_PLUGIN_ROOT}/bin/mcp.mjs ${CLAUDE_PROJECT_DIR}`. The launcher, a
file with no dependency, resolves `@meltemi/diagrams-cli` from the project's `node_modules` and
runs its `bin` with the running Node; otherwise it runs npm's own `npx-cli.js`, found beside the
running Node, with `-y @meltemi/diagrams-cli@latest`. Both are `node <script>` calls, so Windows
needs no `cmd /c` and a folder with spaces needs no quoting. It passes
`mcp --stdio --folder <folder>` and its own standard streams through.

- Alternative: `npx` as the entry's `command`. Rejected: on Windows `npx` is a script that a
  client cannot start as a program, and one entry must serve every system.
- Alternative: require a global install of the command line. Rejected: the plugin would not work
  on its own.
- Alternative: pin the plugin to one version of the command line. Rejected: the repository holds
  only the declared version; `@latest` matches what the skill's own "Before you start" names, and
  a project that wants a fixed version adds the package to its dependencies.

### Codex gets the skill from the plugin and the server from one line

The Codex manifest names the skills and its `interface`, and declares no server. The guide gives
`codex mcp add meltemi -- npx -y @meltemi/diagrams-cli@latest mcp --stdio --folder .`, to run in
the project's folder.

- Alternative: the same stdio entry in the Codex manifest. Rejected: its pages state neither the
  variables nor the working folder of a plugin's stdio server, and a server that reads the wrong
  folder is worse than a line the person runs. `--folder` reads an unexpanded placeholder as the
  working folder, so the entry can be added the day those facts are stated.

### The `skills` command reads the repository as it is

No configuration file is added. The documented command names the skill,
`npx skills add askenaz-dev/meltemi-diagrams --skill meltemi-diagrams`, because that search also
finds the OpenSpec skills this repository keeps for its own work. Every copy it can find is equal
to the canonical one, so which folder it takes does not matter.

- Alternative: mark the OpenSpec skills as internal in their front matter. Rejected: OpenSpec
  writes those files again on each update.
- Alternative: stop keeping the agents' copies in the repository. Rejected: agents that work here
  read them.

### The README is ordered for a first visit, and tested

Order: the sentence, badges, links and demo; "With your coding agent" (plugin and `skills`
commands, four requests, link to the guide); "Without an agent" (npm, VS Code, the web app);
"Gallery"; "How it compares"; then what is there today. The comparison's four columns and six rows
are those of `specs/repository-readme`, and the paragraph after it names what the others do
better: Mermaid is drawn by GitHub in Markdown and needs nothing installed; draw.io and Excalidraw
need no text at all; an agent's HTML needs no tool and no language. A new test
(`packages/acceptance/test/readme.test.ts`) holds the order, the commands shared with the guide
and the two languages' structure.

- Alternative: leave the README's content to review. Rejected: it has drifted before, and the
  agents' commands now live in two files.

### `doctor` reuses what the exports use

`doctor` calls `findBrowser` and `findFfmpeg` with `ffmpegVersion` of `packages/capture`, the same
functions the PNG, PDF and video exports call, so it cannot disagree with them. The skill check
reads `metadata.version` of each `SKILL.md` in the folder's and the home's `.claude/skills` and
`.agents/skills`, and compares major and minor only: a copy installed from the repository carries
the declared version, `1.12.0` beside a command line `1.12.7`. The sign-in check asks the
credentials store whether an entry exists for the host. Statuses are `ok`, `warn` and `fail`; only
`node` can fail, since nothing else stops `validate` and an SVG export.

- Alternative: `doctor --fix`. Rejected: the command would install tools, which the product's
  rules for agents forbid.
- Alternative: a check of the cloud service's reach. Rejected: `doctor` makes no request.

### The size and description guards

The skills test adds a size in bytes, 32,000 with LF line ends (the file is 21 KB, and
`diagram-design-guidance` adds about 3 KB), and requires the description to name each entry of
`DIAGRAM_TYPES` and each source of `import`. The 500-line and 1,024-character rules stay.

- Alternative: lines only. Rejected: long table rows pass a line count while the text loaded on
  every use keeps growing.

### Unresolved choices

One fact is not ours to decide: whether Codex starts a marketplace plugin's skill from this
layout as it does the local workspace's. The recommendation is to try it (task 7.2) before the
guide names Codex's plugin, as `specs/agent-plugin` requires; the alternative, were it to fail, is
the Codex row of the guide with the `skills` command and the `codex mcp add` line, which need no
plugin. Nothing else is open.

## Interfaces and packages

- `skills/meltemi-diagrams/**`: commands named as installed; `scripts/sync-skills.mjs` gains the
  target `plugins/meltemi-diagrams/skills`.
- `packages/cli`: `skill-command.ts` loses `installedText` and copies files; `mcp-command.ts`
  gains `--stdio`; a new `doctor-command.ts` registered in `cli.ts`, with `messages/en.ts` and
  `messages/es.ts` (help, lines, fixes). Public surface: the `doctor` command and its JSON, the
  `--stdio` option.
- `packages/capture`: no change of interface; `doctor` imports `findBrowser`, `findFfmpeg` and
  `ffmpegVersion`.
- `plugins/meltemi-diagrams/`: `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`,
  `.mcp.json`, `bin/mcp.mjs`, `README.md`, `skills/`. Root: `.claude-plugin/marketplace.json`,
  `.agents/plugins/marketplace.json`.
- `scripts/release-version.mjs`: also writes the Codex manifest's `version`.
- Tests: `packages/render/test/skills.test.ts` (one text, size, description, the plugin's copy),
  `packages/cli/test/skill.test.ts`, new `packages/cli/test/doctor.test.ts` and
  `mcp-stdio.test.ts`, new `packages/acceptance/test/plugin.test.ts` and `readme.test.ts`,
  `packages/acceptance/test/docs.test.ts` (the shared commands).
- Guides: `README.md`, `README.es.md`, `docs/agents.md`, `docs/cli.md`, `docs/getting-started.md`
  and their Spanish pairs; `CHANGELOG.md`; decision note
  `docs/decisions/0080-agent-distribution.md`, which records that it replaces the rewrite of 0056.

## Risks / Trade-offs

- [`main` is ahead of the published command line for the minutes a release takes, or longer when
  one fails, so a plugin can teach a statement the installed command does not know] → the skill's
  "Before you start" has the agent read the version; the diagnostics name an unknown statement;
  release failures are already watched.
- [The first start of the plugin's server downloads the command line and may pass the client's
  start timeout] → the launcher prefers the project's own install; the plugin's README says to run
  `npx -y @meltemi/diagrams-cli@latest --version` once; the trial of task 7.1 measures a cold
  start and records it.
- [`npx-cli.js` is not beside Node in some installs, such as a Node from a system package without
  npm] → the launcher prints the one line of `specs/agent-plugin`, naming
  `npm install --global @meltemi/diagrams-cli` and the project dependency as the two ways out, and
  exits; the trial records the installs it was tried with.
- [The `skills` command changes how it searches a repository] → the documented command names the
  skill, and task 7.3 records what `--list` prints today.
- [People who installed with `skill install` keep an older text] → `doctor` reports the copy's
  version, and `skill install --force` writes the current one.
- [Two skills named `meltemi-diagrams` when both the public and the local plugin are installed] →
  each is listed under its plugin's name, and their descriptions say which works on the open
  local editor.
- [The README test makes prose hard to edit] → it holds order, commands, pictures and the two
  languages' structure, never sentences.
- [The other open change edits the same skill] → `diagram-design-guidance` only adds text;
  whichever is applied second writes its commands with the names in force, and the one-text test
  catches a `pnpm` it brings.
