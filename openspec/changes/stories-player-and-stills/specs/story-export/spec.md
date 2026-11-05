# Spec Delta

## ADDED Requirements

### Requirement: A picture per scene
`meltemi-diagrams export <file> --story <id> --scenes` SHALL write each scene's final state, the
frame the player's static view shows for that scene: with `svg` or `png`, one file per scene
named `<stem>.<story>.<scene>.<ext>`, with `Wrote` per file; with `pdf`, one file
`<stem>.<story>.pdf` with a page per scene, every page the largest frame's size with its frame
fitted and centred.

#### Scenario: One SVG per scene
- **WHEN** `mdg export purchase.meltemi --story purchase --scenes --out out` runs
- **THEN** `out/purchase.purchase.overview.svg` and `out/purchase.purchase.processing.svg` are
  written, each equal to the frame `--at` writes at that scene's final instant, and `Wrote` names
  both

#### Scenario: A PDF with a page per scene
- **WHEN** `mdg export purchase.meltemi --story purchase --scenes --format pdf` runs
- **THEN** `purchase.purchase.pdf` has two pages, the first showing the overview's final state

#### Scenario: Pages of one size
- **WHEN** a story over a 480 × 300 view and a 640 × 400 view is exported with `--scenes
  --format pdf`
- **THEN** every page is 640 × 400 and the first view's frame is centred on its page

#### Scenario: A story that cannot be drawn
- **WHEN** `--scenes` runs on a story whose view has an error
- **THEN** nothing is written, the diagnostic is printed and the exit code is 1

### Requirement: What scenes refuse
With `--scenes`, `--out` SHALL name a directory for `svg` and `png`, an existing one or a new one
named without an extension, which is made (a file is a usage error), and MAY name the file for
`pdf`; `--scenes` without `--story`, with `--at`, with `--stdout`, or with
`html` or a video format SHALL be a usage error (exit 2), nothing written.

#### Scenario: Scenes with an instant
- **WHEN** `mdg export purchase.meltemi --story purchase --scenes --at 1s` runs
- **THEN** the usage error says `--scenes` writes every scene's final state and cannot take
  `--at`, nothing is written and the exit code is 2

#### Scenario: Scenes to a file
- **WHEN** `mdg export purchase.meltemi --story purchase --scenes --out one.svg` runs
- **THEN** the usage error says `--scenes` writes several files and `--out` must be a directory,
  and the exit code is 2

#### Scenario: Scenes without a story
- **WHEN** `mdg export purchase.meltemi --scenes` runs
- **THEN** the usage error says `--scenes` takes a story and the exit code is 2
