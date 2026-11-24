# 0080 — One skill text, a public plugin, stdio MCP and `doctor`

## Context

The `meltemi-diagrams` skill reached a project only through `skill install` or the hosted prompt.
The places where people find agent skills, the plugin marketplaces of Claude Code and Codex and the
`skills` command, read a repository as it is, and this one was not ready for them: its skill named
`pnpm mdg`, which `skill install` rewrote to `mdg` (decision 0056), and the only plugins it built
were the local Docker workspace's. The review of `cathrynlavery/diagram-design` on 24 November
2026 showed how much an install line per host, a first page that shows results and a diagnostic
command carry a tool.

## Decision

- **One text.** The canonical skill names `mdg <command>` as an installed command line runs it,
  with one sentence saying that `pnpm mdg <command>` runs it inside this repository. `skill install`
  copies the files unchanged; the rewrite of decision 0056 and its function go. The skills test
  fails on any other `pnpm` and holds `SKILL.md` to 32,000 bytes with LF line ends and its
  description to naming every profile and every source of `import`.
- **A plugin folder in this repository.** `plugins/meltemi-diagrams/` holds a manifest for Claude
  Code and one for Codex with one identity, the skill's copy (the fourth target of
  `pnpm skills:sync`), `.mcp.json`, a launcher, a README and an icon drawn from the brand's glyph.
  Marketplaces named `meltemi` at the root (`.claude-plugin/marketplace.json`,
  `.agents/plugins/marketplace.json`) list it by relative path, as the local workspace's plugins
  are already listed.
- **Versions.** Claude Code's manifest has no `version`, so the commit of the plugin's folder is
  the version and each merge that changes it is an update; Codex's carries the declared product
  version, written by `pnpm release:version`. `claude plugin validate` warns about the missing
  version, and nothing else.
- **MCP over stdio.** `mdg mcp --stdio` connects the same server to the MCP library's stdio
  transport: no listener, no port, no key; standard output carries protocol messages only; the
  command exits 0 when its input closes. An unexpanded `${…}` given as `--folder` is the working
  folder.
- **A launcher without a shell.** `.mcp.json` runs `node ${CLAUDE_PLUGIN_ROOT}/bin/mcp.mjs
${CLAUDE_PROJECT_DIR}`. The launcher runs the project's own `@meltemi/diagrams-cli` when it has
  one, else npm's `npx-cli.js` beside the running Node with `-y @meltemi/diagrams-cli@latest`, both
  as `node <script>`, so Windows needs no `cmd /c` and a folder with spaces no quoting; with neither
  it prints one line saying how to install the command line.
- **Codex gets the skill from the plugin and the server from one line**
  (`codex mcp add meltemi -- npx -y @meltemi/diagrams-cli@latest mcp --stdio --folder .`): its pages
  state neither the variables nor the working folder of a plugin's stdio server.
- **The `skills` command** reads the repository as it is, and the guide names the skill
  (`--skill meltemi-diagrams`) because this repository also keeps the OpenSpec skills.
- **`mdg doctor`** reports `node`, `browser`, `ffmpeg`, `skill` and `sign-in`, with the finders the
  exports use, comparing the skill copies by major and minor version, asking the credentials store
  only whether an entry exists. Only `node` fails; it installs, writes and requests nothing.
- **The README** opens with a sentence, badges, links and the demo, then the agents' install and
  four requests, the install without an agent, the gallery of the five profiles and a comparison
  whose last paragraph says what the others do better. A test holds the order, the commands shared
  with the agents guide and the two languages' structure.

## Alternatives considered

- Keeping the repository's wording and rewriting it in each channel: marketplaces and the `skills`
  command read the files as they are, so the rewrite cannot run there.
- The repository's root as the plugin, an npm package as its source, or a repository of its own:
  a monorepo root is not plugin-shaped, a package is another one to publish, and a separate
  repository would release the skill apart from the language it teaches.
- A version bumped by a commit on `main`, as the reviewed skill does: releases here never commit
  back to `main`.
- The plugin starting the HTTP listener: a fixed port per project, a process that outlives the
  session and a key to carry.
- `npx` as the entry's command: a script that clients cannot start as a program on Windows.
- `doctor --fix`: the command would install tools, which the rules for agents forbid.

## Consequences

Every way of installing gives the same skill; the repository is a marketplace for both clients;
updates need nothing beyond merging. The plugin's server needs Node 22.12 and, until a release
carries `--stdio`, a command line built from this repository. New public surface: `mdg doctor` and
its JSON, `mcp --stdio`, the plugin and its marketplaces. This decision replaces the install-time
rewrite of decision 0056.
