## Context

- The layout estimates widths with `estimateTextWidth`, using 0.58 em per body character with class adjustments and 0.6 em for mono. It sizes tags, notes, label pills and the brand frame with it. Boxes use fixed default sizes whatever their text.
- The renderer writes `font-family` stacks and computes baselines as `centre + 0.35 × size`.
- The SVG contract forbids `<style>`, so fonts are never embedded today.
- The themes name Inter (`meltemi.*`) and IBM Plex Sans (`studio.*`) for body text, and a monospace stack starting with `ui-monospace, "Cascadia Mono"`.
- `fontkit` 2.0.4 reads the Fontsource WOFF2 files, applies kerning and returns glyph outlines. Its subsets have no `cmap` table, so browsers cannot use them in `@font-face`. This was checked on 2026-10-10.

## Goals / Non-Goals

**Goals:**
- Measure with the fonts that are actually drawn, so labels never overflow a box the layout sized.
- Make exported SVGs look the same on every machine.
- Keep layout and render host-neutral: fonts reach them through small interfaces.

**Non-Goals:**
- Icons, theme font choices, raster and PDF output (see the proposal).

## Decisions

### D1. Bundled fonts from Fontsource, read with fontkit

| Family | Package | Use |
|---|---|---|
| Inter | `@fontsource/inter` 5.3.0 | body text of the Meltemi themes |
| IBM Plex Sans | `@fontsource/ibm-plex-sans` 5.3.0 | body text of the `studio.*` themes |
| Cascadia Mono | `@fontsource/cascadia-mono` 5.3.0 | tags and monospace text |

- Weights 400, 500, 600 and 700 in the normal style are used.
- Each family ships one WOFF2 file per script subset (`latin`, `latin-ext`, `cyrillic`, …) with a `unicode.json` of ranges. The library loads subsets lazily and picks, for each character, the subset whose range contains it.
- All three are OFL-1.1, which allows bundling and embedding in documents.

| Alternative | Why not |
|---|---|
| Full TTF files from upstream releases (GitHub zips) | Not versioned by the lockfile and much larger |
| Precomputed width tables, with no font parser at runtime | Cannot subset or outline, and kerning tables would be large |
| `opentype.js` | Does not read WOFF2 |

### D2. Package and interfaces

| Package | Public surface |
|---|---|
| `@meltemi/diagrams-layout` | `TextMeasurer { width(text, fontStack, weight, size): number; capHeight(fontStack, weight): number; knows(fontStack): boolean }`; `estimateMeasurer` (the current estimate, cap height 0.7); `LayoutOptions.measurer` |
| `@meltemi/diagrams-render` | `FontProvider { family(fontStack): string \| undefined; faces(family, weight, text): EmbeddedFace[] (bundled WOFF2 subset files with a `unicodeRange`); outline(text, family, weight, size): { d: string; width: number } }`; `RenderOptions { fonts?: "system" \| "embedded" \| "outlined"; provider?: FontProvider }` |
| `@meltemi/diagrams-fonts` | `FontLibrary` (implements both, built from a `FontFileLoader = (family, file) => Uint8Array \| undefined`); `BUNDLED_FAMILIES`; `resolveFontStack(stack)` |
| `@meltemi/diagrams-fonts/node` | `createNodeFontLibrary()`: resolves the Fontsource packages next to the module and reads files |

`FontLibrary` caches the parsed font of each subset, and the widths of each string by font, weight and size. The CLI creates one library per run. The editor and the playground create one per session.

### D3. Characters outside the bundled subsets

A character that no subset of the family covers is measured with that family's average advance (`xAvgCharWidth`), and the library records it. The layout then reports `layout.unmeasured-font` once per diagram, with severity `info` and the characters listed, so emoji or rare scripts stay visible to the author. A font stack whose families are all unknown, such as a theme set to `"Comic Sans MS"`, is measured with `estimateMeasurer` and gives the same diagnostic.

### D4. Fit-to-text sizing and overflow

- **Text padding.** The horizontal padding inside a box is 16 px on each side.
- **Boxes without `size`.** Their width is the larger of the default width and the widest text line plus padding, rounded up to a whole pixel. The text lines are the label and each description line. Heights stay the defaults: text is one line per `\n`.
- **Groups without `size`.** Their derived box is widened when the title is wider than the children's box.
- **Tags, notes and label pills.** They are sized from measured text plus their existing padding.
- **The brand frame.** Its minimum width uses measured widths.
- **Overflow.** When an explicit `size` (or an explicit group size) leaves less than 6 px between its widest text and an edge, the layout reports `layout.text-overflow` (warning) on the `size` statement. Tight designs, such as converted sheets, keep working. The message names the text, and the hint gives `size <id> (<min width>, <height>)`. The text is still drawn centred, so the overflow is visible rather than hidden.

The proposal rejects shrinking type to make text fit, so the layout never scales text.

### D5. Baselines from cap height

The layout stores `baseline = centreY + capHeight × size / 2` in every `TextItem`, with `capHeight` from the measured font (Inter 0.7275 em). The renderer uses that value. Uppercase and lowercase text then sits optically centred in its box with any font.

### D6. SVG font policies

| Policy | Output | Where it renders exactly |
|---|---|---|
| `system` | `font-family` stacks (as today) | where the fonts are installed |
| `embedded` | one `<style>` in `<defs>` with `@font-face` rules: family, weight, `src: url(data:font/woff2;base64,…) format("woff2")` with the bundled subset file, and a `unicode-range` limited to the characters used, one rule per subset file used | browsers, including SVG used as `<img>`, documentation sites and GitHub |
| `outlined` | each text becomes a `<path>` from glyph outlines, positioned with kerning and the anchor; the path carries `aria-label` with the text | everywhere, including office apps; text is no longer selectable |

- `renderSvg(scene)` keeps `system` as its default, so geometry tests stay readable.
- `meltemi-diagrams export` defaults to `embedded`.
- Profiles in roadmap change 16 choose a policy per destination, for example `outlined` for presentations.
- The portable-SVG rule "no `<style>`" becomes "no `<style>` except the `@font-face` block of the embedded policy".

| Alternative | Trade-off |
|---|---|
| Always outline | Exact everywhere, but larger files and no selectable or searchable text |
| Build glyph-level subsets with fontkit | Smaller, but fontkit writes no `cmap`, `name`, `OS/2` or `post` table, and browsers reject such fonts |
| Never embed | Text width and look depend on each viewer's installed fonts |

### D7. License inventory

`scripts/licenses.mjs` reads `pnpm licenses list --prod --json` and writes `THIRD_PARTY_LICENSES.md`: package, version, license, homepage, and for fonts the note that they are embedded in exports under OFL-1.1. `pnpm licenses:inventory --check` fails when the file is stale, and CI runs it. Change 24 extends the inventory into the release notices.

### D8. Snapshot policy

- Corpus and example SVGs are rendered with the `system` policy and the bundled library as measurer, so snapshots show real geometry with readable text.
- Separate tests check the `embedded` and `outlined` output on one small diagram.
- The regenerated snapshots are reviewed: widths change, structure does not.

## Risks / Trade-offs

- [fontkit performance on large diagrams] → Parsed fonts and string widths are cached. A 500-node diagram measures each distinct label once, and the benchmark checks that compile and layout stay under the targets.
- [Fallback fonts in `system` mode differ from the measured font] → `system` is opt-in for exports. The default embeds the measured fonts.
- [Embedded data URIs inflate SVGs] → Only the subset files that contain used characters are embedded, about 15 to 25 KB per weight for Latin text. Profiles that need smaller files choose `outlined` or `system`.
- [Unicode coverage gaps (emoji, CJK)] → `layout.unmeasured-font` lists them. Such characters render with the viewer's fallback, and the box is still sized from the average advance.
