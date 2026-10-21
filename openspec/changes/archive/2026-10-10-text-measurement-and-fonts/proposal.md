## Why

Text widths are estimated today from character classes. A label that is wider than its estimate is cut or overflows its box, and the proposal sets "zero labels cut or overlapping" as the visual goal of 1.0. It also says the engine "measures text and icons before layout" and keeps the result across formats. The fonts named by the themes (Inter, IBM Plex Sans, a monospace) are not part of the product, so an SVG looks different on every machine.

## What Changes

Roadmap change **5** (`docs/roadmap-1.0.md`), part of **Stage 2 (visual system)**.

- **New `@meltemi/diagrams-fonts` package.**
  - It bundles Inter, IBM Plex Sans and Cascadia Mono (OFL-1.1, weights 400 to 700, all script subsets published by Fontsource) and reads them with `fontkit` (MIT).
  - `FontLibrary` resolves a CSS font stack to the first bundled family, measures text with kerning, and gives vertical metrics.
  - It builds TrueType subsets for embedding and glyph outlines for outlined text.
  - A Node loader lives in the `./node` subpath. Other hosts pass the font bytes.
- **`@meltemi/diagrams-layout` measures before laying out.** `LayoutOptions.measurer` (a `TextMeasurer`) replaces the character-class estimate, which remains the fallback measurer for hosts without fonts. The layout then:
  - grows boxes without an explicit `size` to fit their label and description;
  - sizes tags, notes, label pills and the brand frame from measured text;
  - computes text baselines from the font's cap height.

  Two new diagnostics:
  - `layout.text-overflow` (warning): an explicit size is too small for its text. The hint gives the size that fits.
  - `layout.unmeasured-font` (info): a theme font has no bundled metrics.
- **Font policies in `@meltemi/diagrams-render`.**
  - `system`: names the font stack.
  - `embedded`: adds `@font-face` rules with TrueType subsets of the glyphs used, as data URIs.
  - `outlined`: turns text into paths with accessible labels.

  `meltemi-diagrams export --fonts <policy>` chooses one; the default is `embedded`, so an exported SVG looks the same everywhere.
- **License inventory.** `THIRD_PARTY_LICENSES.md` is generated from the runtime dependencies by `pnpm licenses:inventory`, and CI checks that it is current.
- **Docs.** The text and fonts section of `svg-export.md`, a new `docs/language/fonts.md`, and decision note 0012.

## Capabilities

### New Capabilities
- `text-measurement`: bundled fonts, font-stack resolution, measured widths with kerning, script coverage and fallbacks, vertical metrics, determinism.
- `svg-font-policies`: the `system`, `embedded` and `outlined` font policies of the SVG renderer.
- `license-inventory`: the generated third-party license inventory and its check.

### Modified Capabilities
- `flow-svg-export`:
  - default sizes grow to fit text;
  - tags, notes and label pills are sized from measured text;
  - baselines come from cap height;
  - the portable SVG rules allow `<style>` only for the `embedded` policy;
  - new text-fit diagnostics.
- `cli-export`: the `--fonts` option.

## Impact

- **New package:** `packages/fonts`. Its runtime dependencies are `fontkit` and the three `@fontsource` packages, approved by the owner on 2026-10-10.
- **Changed packages:**
  - `@meltemi/diagrams-layout`: the `TextMeasurer` contract, the estimate measurer, fit-to-text sizing, baselines and diagnostics;
  - `@meltemi/diagrams-render`: font policies and the `FontProvider` contract;
  - `@meltemi/diagrams-cli`: uses the bundled library and `--fonts`.
- Every SVG snapshot changes (measured widths and baselines) and is regenerated after review. The stored Konfío example SVG keeps the `system` policy, so it stays readable as text.
- New diagnostic codes: `layout.text-overflow`, `layout.unmeasured-font`.

## Non-goals

- Icon measurement and placement, which arrive with icons in roadmap change 6 (`styles-themes-icons`).
- Choosing fonts per theme (Editorial, Technical, Stage), also roadmap change 6. This change measures whatever fonts the themes name.
- Raster and PDF font handling, which reuse these policies in roadmap change 16 (`export-png-pdf`).
