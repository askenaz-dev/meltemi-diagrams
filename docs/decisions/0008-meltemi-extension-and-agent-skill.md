# 0008. `.meltemi` files and the agent skill

Status: accepted (meltemi-extension-skill change, October 2026)

## Context

The proposal used `.arch` as a working extension. With the product named inside the Meltemi
family, the owner decided that diagram files carry the family name: `.meltemi`. At the same time,
most sheets will be written or converted by coding agents (Claude Code, Codex and others), which
need the language, the placement rules and the export workflow in a form they load on demand.

## Decision

- Diagram sources are `.meltemi` files. The extension lives in one constant (`MELTEMI_EXTENSION`
  in `packages/cli/src/cli.ts`); the corpus, examples, docs and the file-type icon use it.
- The agent instructions are an Agent Skill at `skills/meltemi-diagrams/`: `SKILL.md` (workflow,
  template, rules, symptoms and fixes) plus `reference/` (language, layout, themes, converting)
  and `examples/platform.meltemi`. The skill is self-contained so it can be installed in other
  repositories that only consume the language.
- `skills/` is the canonical copy; `pnpm skills:sync` copies it to `.claude/skills/` and
  `.codex/skills/`, a test checks the copies are identical, and `AGENTS.md` at the root points
  every other agent to it.
- The skill's example sheet compiles and renders in the test suite, so the instructions never
  drift from the language.

## Alternatives considered

- Keeping `.arch`: neutral but anonymous; the owner wants the family name on the files.
- `.chart` or `.mcharts`: tied to the product name, which may still change; the family name is
  stable.
- Documentation only, no skill: agents would have to find and read `docs/`, which is written for
  people maintaining the tool rather than for people drawing with it.

## Consequences

- One rename across corpus, examples, tests, docs and brand assets; snapshots keep their names
  because they derive from the file stem.
- Three copies of the skill in the repository, kept equal by the sync script and the test.
- The command and package names are recorded in decision 0002.
