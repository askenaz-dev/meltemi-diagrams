## MODIFIED Requirements

### Requirement: Export profiles
`export <id> for <target> { … }` SHALL compile into `Document.exports` with its target (a diagram or
story of the file, or an imported diagram) and its options: `format` (required: `svg`, `png`, `pdf`,
`html`, `mp4`, `webm`, `gif`), `size`, `scale`, `background`, `at`, `motion`, `theme`, `fonts`,
`scenario`, `link`, `fps`, `duration` and `file`. An unknown target SHALL be
`export.unknown-target`, a missing format `export.missing-format`, and an option that does not
apply to the format or target `export.invalid-option`. A video profile of a diagram without
`duration` SHALL take the default duration of the diagram's effects when it runs (the least common
multiple of the cycles capped at 10 s, or 1 s without moving effects), with a notice; no
diagnostic SHALL be reported for it. Profile ids SHALL share the file namespace. No block SHALL be
reported as `block.unsupported`.

#### Scenario: Transparent PNG profile
- **WHEN** `export slide for checkout { format png; scale 2; background transparent }` compiles
- **THEN** `Document.exports` holds `slide` for `checkout` with scale 2 and a transparent background

#### Scenario: Video of endless effects
- **WHEN** a profile `format mp4` targets a diagram whose flow repeats forever without `duration`
- **THEN** the profile compiles without a diagnostic, and running it writes a 6 s video with a notice naming the duration

#### Scenario: Option that does not apply
- **WHEN** a profile `format svg` writes `fps 30`
- **THEN** `export.invalid-option` is reported on `fps`
