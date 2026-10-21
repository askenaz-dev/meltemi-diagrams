# story-export Specification

## Purpose
Writing frames of a story from the command line with `meltemi-diagrams export --story <id> [--at <time>]`.
## Requirements
### Requirement: Story frames from the command line
`meltemi-diagrams export <file> --story <id> [--at <time>]` SHALL write the frame of the story at
the given time, or at its end when `--at` is absent, named `<stem>.<story>.svg`. An unknown story,
a malformed time or `--story` with `--diagram`, `--scenario` or `--motion animated` SHALL be a usage
error (exit 2). `validate` SHALL report story diagnostics like any other.

#### Scenario: Frame of a story
- **WHEN** `mdg export purchase.meltemi --story purchase --at 500ms` runs
- **THEN** `purchase.purchase.svg` shows the revealed boxes at the opacity of that instant

