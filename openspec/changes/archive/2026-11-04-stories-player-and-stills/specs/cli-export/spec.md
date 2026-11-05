# Spec Delta

## MODIFIED Requirements

### Requirement: Project folders
`meltemi-diagrams export <folder>` SHALL export every source of the project below the folder with
the same options, in one browser session for pictures and videos: each file's diagrams named as for
one file, beside the file or under `--out` keeping the folders; with `--profiles` or `--profile`,
the profiles of every file. Files without diagrams SHALL be passed over; `--diagram`, `--story`,
`--stories`, `--scenes`, `--scenario` and `--stdout` SHALL be usage errors with a folder.

#### Scenario: Whole project
- **WHEN** `mdg export architecture --out site` runs
- **THEN** `site/diagrams/containers.svg`, `site/diagrams/context.svg` and
  `site/diagrams/purchase.svg` are written

#### Scenario: Every story of a folder
- **WHEN** `mdg export architecture --format html --stories` runs
- **THEN** the usage error says `--stories` chooses within one file and the exit code is 2
