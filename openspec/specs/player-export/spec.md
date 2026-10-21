# player-export Specification

## Purpose
Player documents and the offline HTML pages and fragments written by the command line and the editor.
## Requirements
### Requirement: Player documents
A player document SHALL be versioned JSON (`format: "meltemi-player"`, `version: 1`) holding a
story's timeline (or one diagram's effects and their duration, null when they repeat forever), the
scenes, effects and relation ends of its views, element labels, the accent colour and the
`@font-face` rules of its text. Builders SHALL produce it from a compiled story and laid-out views,
or from a laid-out diagram.

#### Scenario: Effects document
- **WHEN** a document is built for a diagram whose flow repeats forever
- **THEN** its `kind` is `effects` and its `durationMs` is null

### Requirement: HTML pages and fragments
`meltemi-diagrams export <file> --format html [--story <id>]` SHALL write a complete, offline HTML
page with the player, its data and its fonts inline, named `<stem>.<story>.html` for a story and
like SVG exports otherwise; `--embed` SHALL write a fragment that can be pasted into a page, more
than once. `--at`, `--motion animated` and `--fonts outlined` with `--format html` SHALL be usage
errors. Embedded data SHALL never end its script element.

#### Scenario: Story page
- **WHEN** `mdg export purchase.meltemi --format html --story purchase` runs
- **THEN** `purchase.purchase.html` opens without a network and plays the story

### Requirement: Export from the editor
VS Code SHALL offer **Meltemi Diagrams: Export HTML Player** for the stories and diagrams of a file, and the
canvas timeline SHALL export the story it plays.

#### Scenario: Timeline export
- **WHEN** **Export HTML** is pressed in the timeline of the story `purchase`
- **THEN** `purchase.purchase.html` is written beside the file

