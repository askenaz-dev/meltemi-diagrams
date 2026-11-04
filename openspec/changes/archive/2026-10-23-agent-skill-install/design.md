## Context

The skill is canonical in `skills/meltemi-diagrams/` (SKILL.md, `reference/*.md`,
`examples/*.meltemi`); `scripts/sync-skills.mjs` copies every skill under `skills/` into
`.claude/skills/` and `.codex/skills/`, recording what it copied in `.skills-sync.json` so it never
deletes skills it does not own; `packages/render/test/skills.test.ts` fails when a copy drifts.
`pnpm assist:guide` builds the assist package's guide from the same references. The command line
(`packages/cli`) ships `dist` and `templates`, finds its templates beside `dist` and `src`
(`new URL("../templates/", import.meta.url)`), and dispatches commands in `src/cli.ts` with help in
`src/messages/en.ts` and `es.ts`. The skill's text addresses this repository: thirteen
`pnpm mdg …` commands in SKILL.md and thirty-one in the references and examples, `pnpm preview`
serving "the repository", and "from the repository root".

## Goals / Non-Goals

**Goals:**

- One command makes a project's agents draw with the skill, from the npm package alone.
- The installed skill names commands that exist where it is installed.
- The copy in the package can never drift from the canonical skill.

**Non-Goals:**

- Marketplaces and registries (the `delivery` change's owner steps).
- Changing what the skill teaches.

## Decisions

### The package holds a copy written by the sync script

`scripts/sync-skills.mjs` gains the target `packages/cli/skills`, written and pruned like the agent
folders, and `files` lists `skills`. The command reads `new URL("../skills/", import.meta.url)`, as
templates are read. Alternatives: (a) copy at `build` time from the repository root (the package's
build would reach outside it, and `pnpm test` against sources would find no copy); (b) inline the
skill as a generated TypeScript module, as the assist guide is (a second generated format for the
same files). Recommendation: the sync script's copy, guarded by the existing drift test.

### The installed text speaks of the installed command

`installedText(text)` rewrites, in SKILL.md, the references and the examples (whose comments name
commands): `pnpm mdg ` → `mdg `; the sentence
"`pnpm preview` serves the repository at `http://localhost:4173`" → "`mdg preview` serves the
folder at `http://localhost:4173`"; "(from the repository root)" → "(from the project's folder)".
A test fails when the installed text still holds `pnpm`, so a new repository-only command in the
skill is caught. `mdg` is the command's alias and is installed with it; the docs say to use
`npx @meltemi/diagrams-cli` where it is not on the path. Alternatives: (a) write the skill for
products and let the repository's agents read `mdg` (the repository has no `mdg` on the path: its
agents run `pnpm mdg`); (b) two skills (two texts to keep equal). Recommendation: one canonical
text, rewritten on install by explicit rules.

### Where it installs, and what it overwrites

`skill install [folder]`: the folder is the working one by default; `--agent claude` writes
`<folder>/.claude/skills/meltemi-diagrams/`, `--agent codex` `<folder>/.codex/skills/...`, `all`
(default) both; `--user` writes the same paths under the home folder (`~/.claude/skills`,
`~/.codex/skills`) and refuses a folder argument. A destination that exists is a usage error naming
it, unless `--force`, which replaces the whole folder (never the folders beside it). The examples
keep their diagrams; only their comments' commands change. Alternatives: merging into an existing folder (leaves stale references);
always overwriting (loses a person's own edits silently). Recommendation: refuse, and `--force`.

## Risks / Trade-offs

- [The rewrite misses a new repository command] → the test that no `pnpm` survives the rewrite.
- [A person edits the installed copy and reinstalls] → the refusal names the folder; `--force`
  is explicit.
- [The package grows] → the skill is about 60 KB of text.
