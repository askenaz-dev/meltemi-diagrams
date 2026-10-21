## Why

The product owner chose the name **Meltemi Diagrams** on 2026-10-10 and kept `.meltemi` as the file extension. The repository still says "Architecture Studio (working name)" in the README and "Meltemi Charts" in the export frame, the brand assets, the agent skill and the docs. The VS Code extension (`vscode-extension` change) is about to ship under the product name, so the name has to be the same everywhere before that: in exported sheets, in the extension, in the skill agents load, and in the lockup.

## What Changes

This change is part of **Stage 6 (public release preparation: naming)** brought forward. It closes the product-name part of decision 0002.

- The brand token of the built-in `meltemi.light` and `meltemi.dark` themes becomes `Meltemi Diagrams`. Every export with the default frame shows the new wordmark, and the stored SVG snapshots and the Konfío example are regenerated.
- Brand assets are renamed from `brand/meltemi-charts-*.svg` to `brand/meltemi-diagrams-*.svg`:
  - the lockups get a `DIAGRAMS` product pill, re-vectorised from Cascadia Mono like `CHARTS` was;
  - the board and the asset descriptions are updated;
  - `brand/README.md` records the decision.
- The agent skill becomes `skills/meltemi-diagrams` (`name: meltemi-diagrams`). `pnpm skills:sync` tracks the skills it manages in a manifest, removes the ones that no longer exist in `skills/`, and never deletes foreign skills such as the OpenSpec ones.
- Docs, examples and project context use the product name:
  - README title and introduction, `AGENTS.md`, `package.json` description;
  - the OpenSpec project context, the grammar reference, the example READMEs;
  - the example `brand` strings in the corpus and the skill.
- A new decision note, `docs/decisions/0009-product-name.md`, records the product name, what stays provisional, and the trademark check still due before publication. Decisions 0002, 0007 and 0008 are updated to the product name.

SVGs exported with a Meltemi theme read `Meltemi Diagrams` in the footer. Sources, model JSON and the neutral `studio.*` themes are unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities
- `flow-svg-export`: the default frame shows the `Meltemi Diagrams` wordmark.
- `theme-blocks`: the documented example `brand` value uses the new name. No behaviour changes; the scenario text changes.

## Impact

- Code: `BRAND_NAME` in `packages/layout/src/theme.ts`, and the tests that assert the wordmark (layout, model, render and CLI theme tests, the skills test).
- Snapshots:
  - `corpus/valid/edge/*.svg` that use a Meltemi theme;
  - `corpus/valid/edge/themed.meltemi` and its model JSON;
  - `examples/konfio-agent-platform/konfio-agent-platform.svg`.
- Files: renames in `brand/`, `skills/`, `.claude/skills/` and `.codex/skills/`, and a sync script that deletes skill folders no longer present in `skills/`.
- No new dependencies and no new diagnostic codes.
- Ordering: apply before `vscode-extension`, which uses `brand/meltemi-diagrams-file-icon.svg`, the extension name `meltemi-diagrams` and the renamed skill.

## Non-goals

- Renaming the `studio` command or the `@dac/*` package scope. Both stay provisional in decision 0002 and are reviewed together before publication.
- Changing the `.meltemi` extension, which is final.
- A trademark search or registering domains and Marketplace publisher ids.
- Redrawing the Meltemi mark, glyph or file icon. Only names, the pill text and descriptions change.
