## 1. Extension rename

- [x] 1.1 Rename every `*.arch` under `corpus/` and `examples/` to `*.meltemi`, including the edit fixtures `before`/`after`
- [x] 1.2 Rename the CLI constant to `MELTEMI_EXTENSION = ".meltemi"`, the discovery helper and the help text; serve `.meltemi` from the preview server
- [x] 1.3 Update tests, test support, docs, README, CONTRIBUTING, corpus and example READMEs, the CI workflow, OpenSpec context and the unarchived `brand-themes` artifacts
- [x] 1.4 Update the file-type icon and the brand board to `.meltemi`; close the extension question in decision 0002 and write decision 0008

## 2. Agent skill

- [x] 2.1 Write `skills/meltemi-charts/SKILL.md` (front matter, workflow, template, rules, symptom table)
- [x] 2.2 Write `reference/language.md`, `reference/layout.md`, `reference/themes.md` and `reference/converting.md`
- [x] 2.3 Write `examples/platform.meltemi`, validate it and export it
- [x] 2.4 Add `scripts/sync-skills.mjs`, the `skills:sync` script and `AGENTS.md`; sync to `.claude/skills/` and `.codex/skills/`
- [x] 2.5 Add the test that renders the skill examples and compares the agent copies with `skills/`

## 3. Quality

- [x] 3.1 Search the repository for references to the old extension outside the archive and the decision notes, and fix them
- [x] 3.2 Run typecheck, lint, test, build and `studio validate corpus/valid examples skills`; validate the change with `openspec validate meltemi-extension-skill --strict`
