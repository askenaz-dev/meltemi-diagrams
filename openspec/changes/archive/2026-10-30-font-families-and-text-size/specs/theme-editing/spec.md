## MODIFIED Requirements

### Requirement: Embeddable fonts in the panel
The `font` and `mono` controls of the panel SHALL be the canvas's font picker (`diagram-canvas`, "Font picker"): a button that shows the written family in its own face (the base theme's family greyed when the token is not written), opening the groups Sans, Serif, Monospace, Handwriting and Project fonts of every bundled family and every font of the project's `assets/fonts/` that exports embed, each row drawn in its family, and an "inherit" row that removes the token. A stack written by hand that is none of them SHALL show as "custom" and stay as written. Choosing a family SHALL write the family quoted with `setThemeToken`.

#### Scenario: Project font
- **WHEN** the project has `assets/fonts/Atkinson.woff2` and the panel chooses it for `font`
- **THEN** the block gains `font "Atkinson Hyperlegible"` and the exported SVG embeds it

#### Scenario: A popular family
- **WHEN** the panel of `brand` opens the `font` picker, types `lo` in its search and chooses `Lora`
- **THEN** the block gains `font "Lora"`, the button shows "Lora" drawn in Lora, and every diagram that uses `brand` redraws its body text in Lora

#### Scenario: A hand-written stack
- **WHEN** `brand` writes `font "Georgia, serif"` and the panel opens
- **THEN** the `font` button shows "custom", the picker lists no pressed row, and choosing "inherit" removes the token

#### Scenario: Code font picker
- **WHEN** the panel opens the `mono` picker of a theme that extends `technical.light`
- **THEN** the button shows "Cascadia Mono" greyed as inherited, and choosing `Source Code Pro` writes `mono "Source Code Pro"`
