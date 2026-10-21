## 1. Exports

- [x] 1.1 Change `BRAND_NAME` to `Meltemi Diagrams` and update the tests that assert the wordmark (layout themes, model themes, render defs, CLI export theme). Verify: `pnpm test` fails only on SVG snapshots.
- [x] 1.2 Regenerate the SVG snapshots (`pnpm test -u`), the Konfío example SVG, and the `brand` strings in `corpus/valid/edge/themed.meltemi` and its model JSON. Check that every changed SVG differs only in footer text and width, then run `pnpm test`.

## 2. Brand assets

- [x] 2.1 Rename `brand/meltemi-charts-*.svg` to `brand/meltemi-diagrams-*.svg` and update the ids, `<title>` and `<desc>` inside each file.
- [x] 2.2 Replace the `CHARTS` pill in both lockups with a `DIAGRAMS` pill outlined from Cascadia Mono, widened to fit, and keep the mark and wordmark untouched. Verify in the browser that the light and dark lockups render at 1x and 2x.
- [x] 2.3 Update the board's live text and `brand/README.md` (name decided, file list, pill note).

## 3. Agent skill

- [x] 3.1 Rename `skills/meltemi-charts` to `skills/meltemi-diagrams`, set `name: meltemi-diagrams`, and replace the product name and example `brand` strings in the skill files.
- [x] 3.2 Make `scripts/sync-skills.mjs` keep a `.skills-sync.json` manifest per agent folder, and delete only managed skills that are gone from `skills/`, never foreign folders such as `openspec-*`.

  Extend the skills test:
  - the manifests must match `skills/`;
  - a foreign folder must survive a sync into a temporary directory.

  Then run `pnpm skills:sync` and `pnpm test`.

## 4. Documentation and context

- [x] 4.1 Update the README title and introduction ("Meltemi Diagrams"), branding section and skill section, `AGENTS.md`, the root `package.json` description and the example README.
- [x] 4.2 Update `docs/language/grammar-0.2.md` and the project context in `openspec/config.yaml`. The context keeps the `studio` and `@dac/*` notes as provisional.
- [x] 4.3 Write `docs/decisions/0009-product-name.md`, and update decisions 0002, 0007 and 0008 to the product name.

## 5. Quality

- [x] 5.1 Search for `Meltemi Charts` and `meltemi-charts` outside `openspec/changes/archive/` and the decision notes. Verify: no matches remain.
- [x] 5.2 Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm studio validate corpus/valid`, and `openspec validate meltemi-diagrams-name --strict`.
