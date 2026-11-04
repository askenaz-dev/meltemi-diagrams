## ADDED Requirements

### Requirement: Documentation index and getting started
`docs/README.md` SHALL index the documentation: getting started, the three tracks, the features,
the language reference, the editor, the CLI, exports, the player, the catalog, the playground,
assistance, plugins and safety, quality, compatibility, contributing, the release process and
decisions. `docs/getting-started.md` SHALL take a person from installation (npm, the extension,
the playground) through a first project from a template, validation, export, the canvas, and a
label changed on the canvas that changes the code.

#### Scenario: From the README
- **WHEN** a person opens the README
- **THEN** it shows what the product is, the editing demo, installation, a first diagram, the
  gallery and a link to the documentation index

### Requirement: Tracks by origin
`docs/tracks/from-mermaid.md`, `docs/tracks/from-plantuml.md` and
`docs/tracks/from-visual-editors.md` SHALL each explain what is the same and what differs, map the
constructs people know to `.meltemi` in a table, show how to import existing files and read the
import report, and list the first things to try. A construct a track presents as imported SHALL be
mapped or approximated in the importer's coverage table.

#### Scenario: Track and importer agree
- **WHEN** the tests run
- **THEN** every construct the Mermaid and PlantUML tracks list as imported has the status mapped
  or approximated in the coverage tables

### Requirement: Compatibility and known limitations
`docs/compatibility.md` SHALL list the supported Node versions and operating systems, the browsers
used for captures and the playground, the VS Code versions and forks, FFmpeg, the slide
applications' status, the import coverage, and the known limitations, among them the proposal's
exclusions from 1.0.

#### Scenario: Limitations stated
- **WHEN** a person looks for PPTX export or realtime collaboration
- **THEN** the compatibility page says they are not part of 1.0

### Requirement: Links resolve
A test SHALL resolve every relative link and heading anchor in the repository's Markdown files
(outside dependencies, archived changes and test output) and fail on each that does not.

#### Scenario: Broken link
- **WHEN** a document links to `docs/language/missing.md`
- **THEN** the test fails naming the document, the line and the link
