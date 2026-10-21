# text-measurement Specification

## Purpose
Bundled fonts, font-stack resolution, measured widths with kerning and fallbacks, and vertical metrics.

## Requirements
### Requirement: Bundled fonts and font stacks
`@meltemi/diagrams-fonts` SHALL bundle Inter, IBM Plex Sans and Cascadia Mono in weights 400, 500, 600 and 700 with every script subset the Fontsource packages publish. `resolveFontStack(stack)` SHALL return the first family of a CSS font stack that is bundled, matching names without quotes and case-insensitively, or undefined when none is.

#### Scenario: Theme stack
- **WHEN** `resolveFontStack('"Inter", "Segoe UI", Roboto, sans-serif')` is called
- **THEN** the result is `Inter`

#### Scenario: Monospace stack
- **WHEN** `resolveFontStack('ui-monospace, "Cascadia Mono", Consolas, monospace')` is called
- **THEN** the result is `Cascadia Mono`

#### Scenario: Unknown stack
- **WHEN** `resolveFontStack('"Comic Sans MS", cursive')` is called
- **THEN** the result is undefined

### Requirement: Measured widths
`FontLibrary.width(text, stack, weight, size)` SHALL return the advance width in pixels of `text`, laid out with the font's kerning in the resolved family and nearest bundled weight. Each character SHALL use the script subset whose Unicode range contains it. A character no subset covers SHALL be measured with the family's average advance and recorded as unmeasured. For a stack without a bundled family, the library SHALL report that it does not know the stack. Results SHALL be identical across runs and platforms.

#### Scenario: Kerning
- **WHEN** `AVAV` and `AV` are measured in Inter 600 at 13 px
- **THEN** the width of `AVAV` is less than twice the width of `AV`

#### Scenario: Mixed scripts
- **WHEN** `Diseño Ωmega` is measured in Inter 400 at 13 px
- **THEN** the latin, latin-ext and greek subsets are used, and the width is greater than zero and equal on a second call

#### Scenario: Uncovered character
- **WHEN** `API 🚀` is measured in Inter 400
- **THEN** the rocket is measured with the average advance and listed by `unmeasured()`

### Requirement: Vertical metrics
`FontLibrary.capHeight(stack, weight)` SHALL return the cap height of the resolved font in ems, and `estimateMeasurer.capHeight` SHALL return 0.7.

#### Scenario: Inter cap height
- **WHEN** `capHeight('"Inter", sans-serif', 600)` is called
- **THEN** the result is 1490 / 2048 (0.7275 rounded to four decimals)

#### Scenario: Unknown stack cap height
- **WHEN** `estimateMeasurer.capHeight("whatever", 400)` is called
- **THEN** the result is 0.7

