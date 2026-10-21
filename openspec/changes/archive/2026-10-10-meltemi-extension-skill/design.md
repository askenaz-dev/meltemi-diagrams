## Context

The old extension appeared in one CLI constant, in file names under `corpus/` and `examples/`, in test helpers that filter by suffix, in docs and in the brand assets. The skill must serve two readers: an agent inside this repository (where `pnpm studio` exists) and an agent in another repository that only writes `.meltemi` files, so it has to be self-contained and progressive: a short `SKILL.md` that loads first, and references that load when needed.

## Goals / Non-Goals

**Goals:**
- One rename with no behaviour change, verified by the full suite.
- A skill that lets an agent produce a correct, good-looking sheet on the first validation pass, and convert an existing diagram the way the Konfío sheet was converted.
- Copies for Claude Code and Codex that cannot drift from the canonical skill.

**Non-Goals:**
- Teaching the `sequence`, `c4` and `free` profiles (not compiled yet).
- A skill for maintaining the tool itself (CONTRIBUTING covers that).

## Decisions

### D1. The extension is a constant and a glob

`MELTEMI_EXTENSION = ".meltemi"` in `packages/cli/src/cli.ts`; `findDiagramFiles` and the export naming use it. Test support filters by `.meltemi`; snapshot names derive from the stem, so `checkout.model.json`, `annotations.svg` and friends stay. Edit fixtures are `before.meltemi` and `after.meltemi`. The preview server serves `.meltemi` as plain text.

### D2. Skill structure (Agent Skills format)

`skills/meltemi-charts/SKILL.md` has YAML front matter (`name`, `description`) and under 200 lines of body: workflow, template, rules, symptom table, links. `reference/language.md` condenses the grammar and the diagnostics with fixes; `reference/layout.md` explains coordinates, sizes, the anchor rules and groups; `reference/themes.md` the tokens and built-ins; `reference/converting.md` the step-by-step conversion with the mapping table from the Konfío work. `examples/platform.meltemi` is a neutral, complete sheet (bands, stores, decision, notes, tags, steps, waypoints, shared styles, legend, file theme). Content avoids repository-only paths except the `pnpm studio` commands, which are explained as "from the repository root".

### D3. Canonical copy and sync

`skills/` is the source of truth. `scripts/sync-skills.mjs` deletes and recopies each skill into `.claude/skills/<name>` and `.codex/skills/<name>`. `packages/render/test/skills.test.ts` lists both copies and compares every file byte for byte with `skills/`, and compiles, lays out and renders every `skills/**/*.meltemi`, so a stale copy or a broken example fails CI. `AGENTS.md` points agents that use neither folder to `skills/meltemi-charts/SKILL.md`. Symlinks were rejected: they need privileges on Windows and some agents do not follow them.

### D4. Specs name the extension

The main specs mention corpus paths and `studio export <file.arch>`; this change carries MODIFIED requirements for them so that archiving updates `openspec/specs/`. The `brand-themes` change (unarchived) was edited in place to use `.meltemi` as well, and its versions of `Export command` and `JSON document shape` are the base of the blocks here, so the order of archiving does not matter.

## Risks / Trade-offs

- [An `.arch` reference survives somewhere] -> a repository-wide search for the old extension ran after the rename (only history and decision notes may keep it); the suite and `studio validate` cover corpus, examples and the skill.
- [Three copies of the skill] -> the sync script and the equality test.
- [Skill text drifts from the language] -> the example sheet is compiled in tests; diagnostics listed in the skill are the documented codes.

## Migration Plan

Rename `*.arch` to `*.meltemi` in user folders; nothing else changes.

## Open Questions

- Whether to publish the skill separately once the CLI is on npm.
- Whether `AGENTS.md` should also carry the repository's engineering conventions.
