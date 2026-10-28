# Agent guide

This repository is Meltemi Diagrams: diagrams as code for the Meltemi family. Diagrams are
`.meltemi` text files; the `meltemi-diagrams` command validates them and exports SVG.

## Drawing or converting a diagram

Read [skills/meltemi-diagrams/SKILL.md](skills/meltemi-diagrams/SKILL.md) first. It holds the
workflow, the template, the rules that save iterations and the references (language, layout,
themes, converting). The same skill is copied to `.claude/skills/` and `.agents/skills/`; run
`pnpm skills:sync` after editing `skills/`.

```bash
pnpm mdg validate path/to/sheet.meltemi
```

```bash
pnpm mdg export path/to/sheet.meltemi
```

## Working on the tool itself

Read [CONTRIBUTING.md](CONTRIBUTING.md). Changes are planned with OpenSpec under `openspec/`
(`/opsx:propose`, `/opsx:apply`, `/opsx:archive`); the language reference is in `docs/language/`
and decisions in `docs/decisions/`. The browser suites are `pnpm vscode:test-webview` and
`pnpm player:test-browser`. Run `pnpm typecheck`, `pnpm lint` and `pnpm test` before
asking for review.
