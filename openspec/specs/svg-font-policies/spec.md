# svg-font-policies Specification

## Purpose
The `system`, `embedded` and `outlined` font policies of the SVG renderer and their determinism.
## Requirements
### Requirement: Font policies
`renderSvg(scene, { fonts, provider })` SHALL support three font policies:

- **`system`** (the default) SHALL write the theme's font stacks as `font-family` attributes and no font data.
- **`embedded`** SHALL add one `<style>` element inside `<defs>`. It holds one `@font-face` rule per family, weight and subset file used, each with the bundled WOFF2 subset file as a base64 `data:` URI and a `unicode-range` limited to the characters used. Text elements stay `<text>`.
- **`outlined`** SHALL replace every `<text>` with a `<path>` drawn from the glyph outlines, laid out with kerning, positioned by the text anchor and baseline, filled with the text colour, and carrying `aria-label` with the original text.

A text item with a written `stack` (a `font` style) SHALL be drawn, under every policy, with `font-family` set to the written stack followed by the scene's stack of the item's role (`body` or `mono`), so that a viewer without the family falls back as the theme does; its family for the `embedded` faces and the `outlined` paths SHALL be resolved from the written stack alone. A written stack that resolves to no bundled or project family SHALL stay a `<text>` under `outlined`, with its `font-family`, and SHALL add no `@font-face` rule under `embedded`.

A policy other than `system` without a provider SHALL throw a usage error naming the policy.

#### Scenario: Embedded fonts
- **WHEN** a diagram with labels in Inter 600 and a tag in Cascadia Mono is rendered with `embedded`
- **THEN** the SVG contains exactly one `<style>`, `@font-face` rules for `Inter` 600 and `Cascadia Mono` with `data:font/woff2;base64,` sources, and its `<text>` elements are unchanged

#### Scenario: Outlined text
- **WHEN** the same diagram is rendered with `outlined`
- **THEN** it contains no `<text>` and no `<style>`, and each former text is a `<path aria-label="…">` whose bounding box width equals the measured width within 0.5 px

#### Scenario: Missing provider
- **WHEN** `renderSvg(scene, { fonts: "embedded" })` is called without a provider
- **THEN** it throws an error that names the `embedded` policy

#### Scenario: A text with its own font
- **WHEN** a `technical.light` diagram with `style api { font "Roboto" }` on node `api` is rendered with `embedded`
- **THEN** the `<text>` of `api` has `font-family="Roboto, &quot;Inter&quot;, …"` (the theme's body stack after the written family), the `<style>` holds a `@font-face` rule for `Roboto` 600 limited to the label's characters and the Inter rules for the other texts, and the other `<text>` elements have no `font-family` of their own

#### Scenario: Outlined with a written font
- **WHEN** the same diagram is rendered with `outlined`
- **THEN** the label of `api` is a `<path aria-label="…">` drawn from Roboto's outlines whose width equals the width measured with Roboto within 0.5 px

#### Scenario: A written font nobody has
- **WHEN** `style api { font "Comic Sans MS" }` is rendered with `embedded` and with `outlined`
- **THEN** the `embedded` output has no `@font-face` rule for `Comic Sans MS` and its `<text>` has `font-family="Comic Sans MS, &quot;Inter&quot;, …"`, and the `outlined` output keeps that `<text>` while the other texts are paths

### Requirement: Deterministic font output
Rendering the same scene with the same policy SHALL give byte-identical SVG. The `@font-face` rules SHALL be ordered by family, weight and subset name, and each `unicode-range` SHALL list code points in ascending order.

#### Scenario: Twice the same
- **WHEN** the annotations corpus diagram is rendered twice with `embedded`
- **THEN** both outputs are identical

### Requirement: Project fonts in font policies
`FontLibrary.addFont(data, source)` SHALL register a project font under its family, weight and style, read from the font. Measuring, `embedded` and `outlined` SHALL use it like a bundled font, except that:

- `embedded` SHALL write the whole file as one `@font-face` rule, without `unicode-range`, with the format of the file (`woff2`, `woff`, `truetype` or `opentype`);
- a font whose embedding is restricted SHALL be measured, but its text SHALL be written as `<text>` with the font name under `embedded` and `outlined`.

Registering the same file twice SHALL keep one face.

#### Scenario: Embedded project font
- **WHEN** a scene whose body font is a registered TrueType project font is rendered with `embedded`
- **THEN** the `<style>` holds one rule for that family with a `data:font/ttf;base64,` source and `format("truetype")`, and no `unicode-range`

#### Scenario: Restricted project font
- **WHEN** the registered font restricts embedding and the scene is rendered with `outlined`
- **THEN** its text stays `<text>` and the other fonts are outlined

### Requirement: A hand font for sketch themes
`@meltemi/diagrams-fonts` SHALL bundle a fourth family, Patrick Hand (SIL Open Font License 1.1, from `@fontsource/patrick-hand`, weight 400; the owner approved the download on 2026-10-24), measured and embedded as the three families are: its subsets embedded with `unicode-range` under `embedded`, its outlines under `outlined`, a weight it lacks measured and embedded with 400, the licence inventory regenerated by `pnpm licenses:inventory`, and `docs/language/fonts.md` listing it. Since it has one weight, its `@font-face` rule SHALL declare the range `400 700`, so a browser draws a heavier label with the same file as it is measured and outlined, not in a synthesized bold, and a face that several weights ask for SHALL be embedded once, limited to the characters of them all. The `sketch.light` and `sketch.dark` themes SHALL name it first in `font`, with Inter after it for the characters it lacks, so no sketch picture carries `layout.unmeasured-font`.

#### Scenario: Embedded hand font
- **WHEN** a diagram with `theme "sketch.light"` is rendered with `embedded` after the font is bundled
- **THEN** the `<style>` holds one `@font-face` rule for `Patrick Hand`, `font-weight:400 700`, with a `data:font/woff2;base64,` source and a `unicode-range`, and labels of weight 600 use that rule

#### Scenario: Outlined hand font
- **WHEN** the same diagram is rendered with `outlined`
- **THEN** it contains no `<text>`, and each label is a `<path aria-label="…">` whose width equals the measured width within 0.5 px

#### Scenario: Characters the hand lacks
- **WHEN** a label of a `sketch.light` diagram holds Greek letters
- **THEN** they are measured with Inter and, under `outlined`, drawn with Inter's outlines, and no `layout.unmeasured-font` is reported

#### Scenario: Inventory out of date
- **WHEN** the font package is added and `pnpm licenses:inventory` is not run
- **THEN** the release check fails naming `THIRD_PARTY_LICENSES.md`

