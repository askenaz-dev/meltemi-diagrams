## MODIFIED Requirements

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
