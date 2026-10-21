## 1. Font library

- [x] 1.1 Build `packages/fonts`:
  - the family registry (Inter, IBM Plex Sans, Cascadia Mono; weights 400 to 700; subsets and ranges from each package's `unicode.json`);
  - `resolveFontStack`;
  - `FontLibrary` with lazy subset loading, measuring with kerning, the average-advance fallback, `unmeasured()`, `capHeight` and caches;
  - `createNodeFontLibrary` under `./node`;
  - a vitest alias and tsconfig.

  Test every text-measurement scenario.
- [x] 1.2 Implement `faces(family, weight, text)` (the bundled WOFF2 subset files used, with `unicode-range` limited to the characters used) and `outline(text, family, weight, size)` (kerned glyph paths in pixel space, y down). Test the faces chosen, their ranges, and that the outline width equals the measured width.

## 2. Layout

- [x] 2.1 Add `TextMeasurer`, `estimateMeasurer` and `LayoutOptions.measurer`. Measure tags, notes, label pills and the frame, store baselines from cap height in `TextItem`, and replace every `estimateTextWidth` call. Test the baseline scenario.
- [x] 2.2 Implement fit-to-text sizing for nodes, decisions, data and derived groups, plus `layout.text-overflow` and `layout.unmeasured-font`. Test the long-label, explicit-size-too-small, unknown-font and emoji scenarios.

## 3. Render

- [x] 3.1 Add `RenderOptions` with the `system`, `embedded` and `outlined` policies, the `FontProvider` contract and the missing-provider error. Use the scene baselines. Test the embedded, outlined, missing-provider and determinism scenarios.
- [x] 3.2 Render corpus, example and project snapshots with the bundled library as measurer and the `system` policy. Review the regenerated SVGs (widths and baselines change, structure does not) and update them.

## 4. CLI and inventory

- [x] 4.1 Use `createNodeFontLibrary` in `export` and add `--fonts` (default `embedded`). Test the font-policies scenario and the stdout scenario.
- [x] 4.2 Write `scripts/licenses.mjs` and `pnpm licenses:inventory [--check]`, generate `THIRD_PARTY_LICENSES.md`, and add the check to CI. Test the fonts-listed scenario on the generated file.

## 5. Documentation and quality

- [x] 5.1 Write `docs/language/fonts.md` (bundled fonts, measurement, fit-to-text, overflow, policies), update `svg-export.md` and `diagnostics.md`, write decision `0012-fonts-and-measurement.md`, and update the skill's layout reference (boxes grow to fit text; use `size` only to make them larger). Run `pnpm skills:sync`.
- [x] 5.2 Run the benchmark and check that the compile and layout targets still hold. Run typecheck, lint, test, build, `mdg validate`, `mdg format --check`, and `openspec validate --strict`. Archive, fill the spec purposes and mark the roadmap.
