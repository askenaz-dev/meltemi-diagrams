# Spec Delta

## MODIFIED Requirements

### Requirement: Export profiles
`export <id> for <target> { … }` SHALL compile into `Document.exports` with its target (a diagram or
story of the file, or an imported diagram) and its options: `format` (required: `svg`, `png`, `pdf`,
`html`, `mp4`, `webm`, `gif`), `size`, `scale`, `background`, `at`, `motion`, `theme`, `fonts`,
`scenario`, `link`, `fps`, `duration`, `scenes` and `file`. `scenes` (`true` or `false`) SHALL
apply to `svg`, `png` and `pdf` of a story and write each scene's final state as `--scenes` does;
`scenes` with `at`, on another format or on a diagram, and `file` with `scenes` on `svg` or
`png`, SHALL be `export.invalid-option`. An unknown target SHALL be
`export.unknown-target`, a missing format `export.missing-format`, and an option that does not
apply to the format or target `export.invalid-option`. A video profile of a diagram without
`duration` SHALL take the default duration of the diagram's effects when it runs (the least common
multiple of the cycles capped at 10 s, or 1 s without moving effects), with a notice; no
diagnostic SHALL be reported for it. An MP4 profile with `background transparent` SHALL compile
without a diagnostic and be drawn over the theme's background, with a notice. Profile ids SHALL share the file namespace. No block SHALL be
reported as `block.unsupported`.

#### Scenario: Transparent PNG profile
- **WHEN** `export slide for checkout { format png; scale 2; background transparent }` compiles
- **THEN** `Document.exports` holds `slide` for `checkout` with scale 2 and a transparent background

#### Scenario: Video of endless effects
- **WHEN** a profile `format mp4` targets a diagram whose flow repeats forever without `duration`
- **THEN** the profile compiles without a diagnostic, and running it writes a 6 s video with a notice naming the duration

#### Scenario: Transparent MP4 profile
- **WHEN** `export clip for checkout { format mp4; background transparent }` compiles and runs
- **THEN** there is no diagnostic, and the video is drawn over the theme's background with a notice saying MP4 has no transparency

#### Scenario: Option that does not apply
- **WHEN** a profile `format svg` writes `fps 30`
- **THEN** `export.invalid-option` is reported on `fps`

#### Scenario: Slides of a story
- **WHEN** `export slides for purchase { format png; scale 2; scenes true }` compiles and
  `mdg export purchase.meltemi --profile slides` runs
- **THEN** there is no diagnostic and `purchase.slides.overview.png` and
  `purchase.slides.processing.png` are written at scale 2

#### Scenario: Scenes with an instant
- **WHEN** a profile for a story writes `scenes true` and `at 1s`
- **THEN** `export.invalid-option` is reported on `at`, saying `scenes` writes every scene's final
  state

#### Scenario: Scenes of a diagram
- **WHEN** `export sheet for checkout { format svg; scenes true }` compiles
- **THEN** `export.invalid-option` is reported on `scenes`, saying it takes a story
