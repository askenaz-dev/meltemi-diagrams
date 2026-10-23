# 0056. The command line ships the agents' skill and installs it

Status: accepted (agent-skill-install change, 22 October 2026).

## Context

Coding agents draw Meltemi diagrams well with the `meltemi-diagrams` skill (workflow, template,
rules, references, examples), but only this repository had it: `skills/` holds it,
`pnpm skills:sync` copies it to `.claude/skills/` and `.codex/skills/`, and the README and
`AGENTS.md` point to it. The command line's package shipped `dist` and `templates`, nothing for an
agent, and the skill spoke to this repository (`pnpm mdg validate`, `pnpm preview`, "from the
repository root"), so a copy made by hand taught an agent commands a project does not have.

## Decision

- **The package holds a copy of the skill**, written by `pnpm skills:sync` into
  `packages/cli/skills/` as it writes the agent folders, listed in the package's `files`, and
  guarded by the skills test that guards the other copies.
- **`skill install [folder]`** writes the skill for Claude Code (`.claude/skills/meltemi-diagrams/`)
  and Codex (`.codex/skills/meltemi-diagrams/`), or one of them with `--agent`, into the working
  folder or a folder given, or into the person's own folders with `--user`. A copy already there is
  kept, with exit code 2 naming it, unless `--force`, which replaces only the skill's folder.
- **The installed text names the installed command**: `pnpm mdg <command>` becomes
  `mdg <command>`, `pnpm preview` becomes `mdg preview`, and "the repository root" "the project's
  folder", in the Markdown and in the examples' comments; a test fails when any `pnpm` survives,
  so a new repository-only command in the skill needs a rule.
- **Documentation for agents** in `docs/agents.md` and its Spanish copy, linked from the
  documentation index and the README.

## Alternatives considered

- **Copying the skill at build time from the repository root**: the package's build would reach
  outside the package, and tests against the sources would find no copy.
- **Generating a TypeScript module from the skill**, as the assist guide is: a second generated
  format for the same files.
- **Writing the skill for products**: this repository's agents run `pnpm mdg`, which a
  product's `mdg` would not match; two skills would have to be kept equal by hand.
- **Merging into, or always overwriting, an existing copy**: stale references on the one hand, a
  person's edits lost silently on the other.

## Consequences

- `npx @meltemi/diagrams-cli skill install` gives any project's agents the skill.
- Publishing the skill in plugin marketplaces or skill registries stays an owner step of the
  `delivery` change.
- New public surface: the `skill` command and its words; the package's `skills/` folder.
