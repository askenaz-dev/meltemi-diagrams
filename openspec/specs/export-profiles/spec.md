# export-profiles Specification

## Purpose
The `export` block: reproducible delivery profiles, their options per format and their diagnostics, run by the command line and the editor.
## Requirements
### Requirement: Export profiles
`export <id> for <target> { … }` SHALL compile into `Document.exports` with its target (a diagram or
story of the file, or an imported diagram) and its options: `format` (required: `svg`, `png`, `pdf`,
`html`, `mp4`, `webm`, `gif`), `size`, `scale`, `background`, `at`, `motion`, `theme`, `fonts`,
`scenario`, `link`, `fps`, `duration` and `file`. An unknown target SHALL be
`export.unknown-target`, a missing format `export.missing-format`, an option that does not apply to
the format or target `export.invalid-option`, and a video of effects that repeat forever without a
duration `export.missing-duration`. Profile ids SHALL share the file namespace. No block SHALL be
reported as `block.unsupported`.

#### Scenario: Transparent PNG profile
- **WHEN** `export slide for checkout { format png; scale 2; background transparent }` compiles
- **THEN** `Document.exports` holds `slide` for `checkout` with scale 2 and a transparent background

#### Scenario: Video of endless effects
- **WHEN** a profile `format mp4` targets a diagram whose flow repeats forever without `duration`
- **THEN** `export.missing-duration` is reported on the profile

### Requirement: Running profiles
`meltemi-diagrams export <file> --profile <id>` SHALL write the profile's output, named
`<stem>.<id>.<ext>` or its `file`, and `--profiles` SHALL write every profile of the file; other
output options SHALL be usage errors with them. `validate` SHALL report profile diagnostics.

#### Scenario: Every profile
- **WHEN** `mdg export sheet.meltemi --profiles` runs on a file with an SVG and a PDF profile
- **THEN** both files are written and listed

