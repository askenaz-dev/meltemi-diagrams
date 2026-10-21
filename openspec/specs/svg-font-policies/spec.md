# svg-font-policies Specification

## Purpose
The `system`, `embedded` and `outlined` font policies of the SVG renderer and their determinism.
## Requirements
### Requirement: Font policies
`renderSvg(scene, { fonts, provider })` SHALL support three font policies:

- **`system`** (the default) SHALL write the theme's font stacks as `font-family` attributes and no font data.
- **`embedded`** SHALL add one `<style>` element inside `<defs>`. It holds one `@font-face` rule per family, weight and subset file used, each with the bundled WOFF2 subset file as a base64 `data:` URI and a `unicode-range` limited to the characters used. Text elements stay `<text>`.
- **`outlined`** SHALL replace every `<text>` with a `<path>` drawn from the glyph outlines, laid out with kerning, positioned by the text anchor and baseline, filled with the text colour, and carrying `aria-label` with the original text.

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

