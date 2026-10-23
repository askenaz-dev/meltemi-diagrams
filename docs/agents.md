# Drawing with coding agents

[Español](es/agents.md)

Claude Code, Codex and other coding agents draw, convert and export Meltemi diagrams with the
`meltemi-diagrams` skill: a workflow, a template, the rules that save iterations, references for the
language, layout, C4, sequence diagrams, free compositions, stories and converting, and complete
examples. An agent that reads it writes `.meltemi` files, validates them with the command line and
fixes what it reports, instead of drawing pictures by hand.

## Installing the skill

The command line ships the skill. In a project's folder:

```bash
mdg skill install
```

It writes `.claude/skills/meltemi-diagrams/` for Claude Code and `.codex/skills/meltemi-diagrams/`
for Codex. `--agent claude` or `--agent codex` writes one of them; `--user` writes them into your
own folders (`~/.claude/skills`, `~/.codex/skills`), for every project; a copy already there is
kept unless you add `--force`, which replaces only the skill's own folder. Without the command line
installed:

```bash
npx @meltemi/diagrams-cli skill install
```

The installed skill names the commands as they are installed (`mdg validate`, `mdg export`,
`mdg preview`), so the agent runs what your project has. Another agent reads it from the same files:
copy `skills/meltemi-diagrams/` from the package (`node_modules/@meltemi/diagrams-cli/skills/`) to
the folder your agent reads skills from, or point the agent's instructions (an `AGENTS.md`, for
instance) at its `SKILL.md`.

## Asking for a diagram

Ask in your own words, naming what to draw and from what: "draw the checkout service from
`docs/architecture.md` as a flow diagram", "convert `diagrams/billing.mmd` to Meltemi and keep its
layout", "add a sequence diagram of the payment with an approved and a declined scenario", "make a
C4 container view of the shop". The skill tells the agent to import Mermaid and PlantUML sources
instead of retyping them, to choose the profile (flow, free, sequence or C4), to validate until no
diagnostic remains and to export SVG for you to look at with `mdg preview`.

## In this repository

The canonical skill is `skills/meltemi-diagrams/`; `pnpm skills:sync` copies it to
`.claude/skills/`, `.codex/skills/` and the command line's package, and a test fails when a copy
drifts. See [the command line](cli.md#agents-skill) for `skill install`.
