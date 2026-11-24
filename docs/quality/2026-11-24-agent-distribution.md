# Agent distribution — 24 November 2026

Local implementation of the `agent-distribution` change, on top of `diagram-design-guidance`
(`9808dca`), on Windows with Node 24.15.0, pnpm 10.33.2, Claude Code 2.1.312 and Codex CLI 0.156.1.
Nothing was pushed, published or installed into the person's own client configuration.

## What was built

- One text for the skill: the canonical files name `mdg <command>`, with one sentence for
  `pnpm mdg` inside this repository, and `skill install` copies them byte for byte.
- `plugins/meltemi-diagrams/` with manifests for Claude Code (no `version`) and Codex (the product
  version), the skill's copy written by `pnpm skills:sync`, a launcher, `.mcp.json`, a README and an
  icon drawn from the brand's glyph; marketplaces named `meltemi` in `.claude-plugin/` and
  `.agents/plugins/`.
- `mdg mcp --stdio`; `mdg doctor`; the four ways to install in the agents guide; the README ordered
  for a first visit with a comparison; size and description guards for the skill.

## Trials with the clients

The repository was not pushed, so every trial used local paths. The published command line has no
`--stdio` until this change is released, so the trial project held a stand-in
`node_modules/@meltemi/diagrams-cli` that runs this worktree's sources: the launcher's first path,
the project's own command line.

### Claude Code

- `claude plugin validate` on the repository and on `plugins/meltemi-diagrams`: passed, with one
  warning each, the missing `version`, which is on purpose (each commit is an update). The plugin
  directory checks found nothing once the icon was added. `--strict` fails on that warning alone.
- `claude -p … --plugin-dir plugins/meltemi-diagrams` in the trial project, allowed only the
  plugin's server: the skill was listed as `meltemi-diagrams:meltemi-diagrams`, the server as
  `plugin:meltemi-diagrams:meltemi` with `validate`, `inspect_story` and `preview`; `validate` of
  the payment sequence gave no diagnostic and `preview` drew it at 723 × 796 with 6 elements and 11
  relations. The whole run took 18 seconds.
- The launcher to the server's answer to `initialize`: 1.4 s the first time and 1.3 s the second,
  through the stand-in. A first start through `npx` downloads the command line and was not timed.
- Not tried: installing from GitHub with `/plugin marketplace add askenaz-dev/meltemi-diagrams`,
  which needs the branch pushed; and a system other than Windows.

### Codex

- With `CODEX_HOME` set to an empty scratch folder, so that the person's Codex was untouched:
  `codex plugin marketplace add <worktree>` added `meltemi` from `.agents/plugins/marketplace.json`;
  `codex plugin list` showed `meltemi-diagrams@meltemi`; `codex plugin add meltemi-diagrams@meltemi`
  installed it, `installed, enabled`, version 1.11.0, with `skills/meltemi-diagrams/SKILL.md` in its
  cache. The guides now give `codex plugin add` instead of the `/plugins` browser.
- Not tried: a Codex session listing the skill, which needs a sign-in in that home; installing from
  GitHub.

### The `skills` command

Not run: it downloads and runs a third party's package from npm, which waits for the person's
permission.

## Gates

- `pnpm typecheck`, `pnpm lint`: green.
- `pnpm test`: 11,745 passed and 1 skipped; the 4 tests of `local-operations` fail under Git
  Bash's `tar` and pass 8/8 from PowerShell, as before.
- New tests: `mcp-stdio` 6, `doctor` 11, `plugin` 12, `readme` 11, and the skills, docs and
  release tests extended.
- `pnpm release:check`: the release is ready; `plugins/` is in no package.
- `openspec validate agent-distribution --strict`: valid.
