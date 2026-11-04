## Why

Coding agents draw Meltemi diagrams well when they read the `meltemi-diagrams` skill (workflow,
template, rules, references, examples), but only this repository has it: it lives in `skills/`,
`pnpm skills:sync` copies it to `.claude/skills/` and `.codex/skills/`, and the README's "For
agents" section and `AGENTS.md` point to it. A person who installs the command line from npm gets
`dist` and `templates` and nothing for their agent, and the skill itself speaks to this repository
(`pnpm mdg validate`, `pnpm preview`, "from the repository root"), so copying it by hand into a
project teaches the agent commands that do not exist there. The owner listed it as a pending thread
on 2026-10-22. Post-1.0 change, outside the roadmap; it builds on `cli-complete` (the command line's
commands) and `ai-assist` (the skill as the assist guide's source).

## What Changes

- **The skill ships with the command line.** `@meltemi/diagrams-cli` holds `skills/meltemi-diagrams`
  (SKILL.md, reference, examples), the same files as the repository's `skills/`; `pnpm skills:sync`
  writes that copy too, and the drift test that guards `.claude/skills` and `.codex/skills` guards
  it.
- **`meltemi-diagrams skill install`.** Writes the skill into a project for Claude Code
  (`.claude/skills/meltemi-diagrams/`) and Codex (`.codex/skills/meltemi-diagrams/`), or into the
  person's own folders with `--user`; `--agent claude|codex|all` picks the agents (all by default),
  `--force` replaces a copy already there. The installed text names the installed command (`mdg
  validate`, `mdg preview`, the project's folder) instead of this repository's scripts. It prints
  `Wrote <path>` per folder and exits 0, or 2 on a usage error or a copy it would overwrite.
- **Documentation for agents.** `docs/agents.md` and `docs/es/agents.md`: what the skill teaches,
  installing it with the command, by hand from the package or from the repository, and asking an
  agent to draw; `docs/cli.md` and its Spanish copy document `skill install`; the README's "For
  agents" section points to the page; the changelog's 1.10.0 section; decision 0056.

## Non-goals

- Publishing the skill in a plugin marketplace or a skills registry: an owner step of the
  `delivery` change, which owns the pipelines and the accounts.
- The assist guide (`pnpm assist:guide`), which already reads the skill's references unchanged.

## Capabilities

### New Capabilities

- `agent-skill`: the skill shipped with the command line, the `skill install` command and its
  rewrite of commands for an installed project, and the documentation for agents.

### Modified Capabilities

None.

## Impact

- `scripts/sync-skills.mjs`: a third target, `packages/cli/skills`.
- `packages/cli`: `package.json` `files` gains `skills`; `src/skill-command.ts` (new), `src/cli.ts`
  (the `skill` command), `src/messages/en.ts` and `es.ts` (help, words); `test/skill.test.ts`
  (new).
- `packages/render/test/skills.test.ts`: the CLI's copy joins the drift check.
- `docs/agents.md`, `docs/es/agents.md` (new), `docs/cli.md`, `docs/es/cli.md`, `docs/README.md`,
  `README.md`, `README.es.md`, `CHANGELOG.md`, `docs/decisions/0056-agent-skill-install.md`.
