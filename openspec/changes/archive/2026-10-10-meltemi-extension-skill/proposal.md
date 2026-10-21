## Why

Diagram files were named `.arch`, a working extension from the proposal. The product now belongs to the Meltemi family and its owner wants the files to say so: `.meltemi`. Separately, the sheets will mostly be written or converted by coding agents (Claude Code, Codex and others), and nothing in the repository tells an agent how to diagram: the language reference is written for maintainers, and the conversion recipe that produced the Konfío sheet lived only in a conversation.

## What Changes

- Rename the diagram file extension from `.arch` to `.meltemi` everywhere: the CLI constant and help, the corpus, the examples, the edit fixtures, tests, documentation, the CI workflow, the file-type icon and the brand board.
- Add the Agent Skill `skills/meltemi-charts/`: `SKILL.md` with the workflow, template, rules and a symptom table, plus `reference/language.md`, `reference/layout.md`, `reference/themes.md`, `reference/converting.md` and `examples/platform.meltemi`.
- Add `scripts/sync-skills.mjs` (`pnpm skills:sync`) that copies `skills/` to `.claude/skills/` and `.codex/skills/`, an `AGENTS.md` at the root for other agents, and a test that the copies are identical and the skill's example renders.
- Record the decision in `docs/decisions/0008-meltemi-extension-and-agent-skill.md` and close the extension question in decision 0002.

No **BREAKING** changes to the language; existing files only need renaming.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `arch-language-syntax`: lexical structure names `.meltemi` text.
- `cli-validation`: `studio validate` discovers `.meltemi` files.
- `cli-export`: `studio export <file.meltemi>` and the corpus paths.
- `flow-diagram-model`: corpus paths in scenarios.
- `model-json-interchange`: corpus paths in scenarios.

## Impact

- Mechanical rename across the repository; snapshot files keep their names because they derive from the file stem.
- New top-level folder `skills/` and file `AGENTS.md`; `.claude/skills/` and `.codex/skills/` gain a copy of the skill beside the OpenSpec skills.
- `openspec/specs/` is updated only when this change is archived.

## Non-goals

- Renaming the `studio` command or the `@dac/*` packages (still provisional).
- Publishing the skill or the CLI to a registry; the skill assumes the repository checkout or an installed `studio`.
