# text-measurement Specification

## Purpose
Bundled fonts, font-stack resolution, measured widths with kerning and fallbacks, and vertical metrics.
## Requirements
### Requirement: Bundled fonts and font stacks
`@meltemi/diagrams-fonts` SHALL bundle seventeen families from their Fontsource packages, each with every script subset the package publishes and the weights it has among 400, 500, 600 and 700, in four groups:

| Group  | Families                                                               |
|--------|------------------------------------------------------------------------|
| `sans` | Inter, IBM Plex Sans, Roboto, Open Sans, Lato, Montserrat, Poppins, Nunito |
| `serif`| Merriweather, Lora, Playfair Display                                   |
| `mono` | Cascadia Mono, Roboto Mono, Source Code Pro                            |
| `hand` | Patrick Hand, Caveat, Comic Neue                                       |

Inter, IBM Plex Sans, Cascadia Mono, Roboto, Open Sans, Montserrat, Poppins, Nunito, Merriweather, Lora, Playfair Display, Roboto Mono, Source Code Pro and Caveat SHALL have the four weights; Lato and Comic Neue 400 and 700; Patrick Hand 400. Each `BundledFamily` SHALL record its `group` and its `license` as the installed package records it (SIL Open Font License 1.1 for every family). A weight a family lacks SHALL be measured, embedded and outlined with the nearest weight it has (ties to the heavier), under the `@font-face` range rule of `svg-font-policies`. `FALLBACK_FAMILIES` SHALL stay Inter then IBM Plex Sans. `resolveFontStack(stack)` SHALL return the first family of a CSS font stack that is bundled, matching names without quotes and case-insensitively, or undefined when none is. The owner approves the download of the thirteen new packages before they are added.

#### Scenario: Theme stack
- **WHEN** `resolveFontStack('"Inter", "Segoe UI", Roboto, sans-serif')` is called
- **THEN** the result is `Inter`

#### Scenario: Monospace stack
- **WHEN** `resolveFontStack('ui-monospace, "Cascadia Mono", Consolas, monospace')` is called
- **THEN** the result is `Cascadia Mono`

#### Scenario: Unknown stack
- **WHEN** `resolveFontStack('"Comic Sans MS", cursive')` is called
- **THEN** the result is undefined

#### Scenario: A popular family
- **WHEN** `resolveFontStack('"Roboto", sans-serif')` is called and `Diseño` is measured in Roboto 500 at 14 px
- **THEN** the result is `Roboto`, the width is greater than zero and equal on a second call, and `unmeasured()` lists nothing

#### Scenario: A family with two weights
- **WHEN** `Checkout` is measured in Lato at weights 500 and 600
- **THEN** the width at 500 equals the width at 400 and the width at 600 equals the width at 700, and `faces("Lato", 600, "Checkout")` returns the 700 file with `weightTo` unset and `weight` 700

#### Scenario: Every family has its files
- **WHEN** `bundledFontFiles()` is listed after the packages are installed
- **THEN** it holds, for each of the seventeen families, its `unicode.json` and one `latin` subset file per weight the table records, and a library reading only those files measures each family as the library over the installed packages

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

### Requirement: Family catalogue
`FONT_GROUPS` SHALL be `sans`, `serif`, `mono`, `hand` in that order, and `FontLibrary.families()` SHALL return every bundled family and every font added with `addFont`, each as `{ family, group, weights, license, source, restricted }`: `source` `bundled` or `project`, project fonts in the group `project` with the licence they were registered with (or none) and `restricted` from their `fsType`, bundled families first in `FONT_GROUPS` order, then project fonts in registration order. `bundledFamily(name)` SHALL return undefined for a family that is not bundled, and `knows(stack)` SHALL be false for a stack with no bundled or project family.

#### Scenario: The catalogue
- **WHEN** `families()` is called on a library without project fonts
- **THEN** it returns seventeen entries, the first eight in group `sans` starting with Inter, Roboto Mono in `mono` with weights 400, 500, 600 and 700, Comic Neue in `hand` with weights 400 and 700, every `license` `OFL-1.1` and every `source` `bundled`

#### Scenario: A project font in the catalogue
- **WHEN** `addFont` registers `Company Sans` 400 with a restricted `fsType` and `families()` is called
- **THEN** the last entry is `Company Sans` in group `project`, `source` `project`, `restricted` true

#### Scenario: A family that is not bundled
- **WHEN** `bundledFamily("Arial")` and `knows("Arial, sans-serif")` are called
- **THEN** the first is undefined and the second is false

