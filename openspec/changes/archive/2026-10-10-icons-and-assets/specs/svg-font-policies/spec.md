## ADDED Requirements

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
