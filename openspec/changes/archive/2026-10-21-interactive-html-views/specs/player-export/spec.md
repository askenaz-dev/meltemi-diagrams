## MODIFIED Requirements

### Requirement: Player documents
A player document SHALL be versioned JSON (`format: "meltemi-player"`, `version: 2`) holding a
story's timeline, or for an effects document the key of its root view, and for every view by key
(the diagram id, deduplicated as `id-2`, `id-3`, never a file path) its scene, effects and relation
ends, and for effects documents when its effects end (null when they repeat forever); element labels
(`names`); the details hover cards and the panel show (`details`: per element its kind, its C4 type
word in the content language, technology, description, url, external, entity path and what it opens
as `{ view, element, transition }` or null; per relation its label, technology, description,
assumption, whether it was lifted and its model sources; per view its C4 level and scope and its
parent view); the accent colour and the `@font-face` rules of the text of every view. Builders SHALL
produce it from a compiled story and laid-out views, or from a laid-out diagram with the reachable
views and their targets the host resolved, with the content locale for the type words, and SHALL
read only the compiled diagram's labels, kinds, technology, descriptions, URLs, entity paths and
relation fields, never comments, source positions, paths or diagnostics. The same inputs SHALL give
the same document.

#### Scenario: Effects document
- **WHEN** a document is built for a diagram whose flow repeats forever
- **THEN** its `kind` is `effects`, `views[key].durationMs` is null and `details[key].elements` has
  one entry per element

#### Scenario: Type words in the content language
- **WHEN** the `containers` view of `corpus/valid/c4/commerce.meltemi` is built with the locale `es`
- **THEN** `details.containers.elements["shop.api"]` has `type: "Contenedor"`, `technology: "HTTP"`
  and `opens: { view: "components", element: null, transition: "morph" }` when `components` is
  bundled, and `details.containers.elements["shop.db"].opens` is null

#### Scenario: Comments never reach the document
- **WHEN** the source holds the comment `// internal: rotate keys on Friday`
- **THEN** the document's JSON does not contain that text

#### Scenario: Older shape refused
- **WHEN** `isPlayerDocument` is given an object with `version: 1`
- **THEN** it returns false and `<meltemi-player>` shows the unreadable message

### Requirement: HTML pages and fragments
`meltemi-diagrams export <file> --format html [--story <id>]` SHALL write a complete, offline HTML
page with the player, its data and its fonts inline, named `<stem>.<story>.html` for a story and
like SVG exports otherwise; `--embed` SHALL write a fragment that can be pasted into a page, more
than once. The page of a diagram SHALL bundle every view reachable by drill-down from it across the
project (C4 child views scoped to its entities and the diagrams its elements link to), laid out
once each, views with errors or that cannot be drawn left out with the targets that lead to them,
and the command SHALL report how many views it bundled. `--at`, `--motion animated` and `--fonts outlined`
with `--format html` SHALL be usage errors. Embedded data SHALL never end its script element.
Writing the same sources twice SHALL give the same bytes. `playerElement` SHALL write
`interactive="false"` when asked and nothing otherwise.

#### Scenario: Story page
- **WHEN** `mdg export purchase.meltemi --format html --story purchase` runs
- **THEN** `purchase.purchase.html` opens without a network and plays the story

#### Scenario: Bundled views
- **WHEN** `mdg export corpus/valid/c4/commerce.meltemi --diagram context --format html` runs twice
- **THEN** the page's document has the views `context`, `containers` and `components`,
  `details.context.elements.shop.opens` is `{ view: "containers", element: null, transition: "morph" }`,
  the output says three views were bundled, and both runs write identical bytes

#### Scenario: A broken child view is not bundled
- **WHEN** the `components` view has an error and `context` is exported
- **THEN** the page bundles `context` and `containers` only, `details.containers.elements["shop.api"].opens`
  is null and the diagnostic is printed once

### Requirement: Export from the editor
VS Code SHALL offer **Meltemi Diagrams: Export HTML Player** for the stories and diagrams of a
file, writing the same page `produceExport` writes for the command line, bundled views included, and
the canvas timeline SHALL export the story it plays.

#### Scenario: Timeline export
- **WHEN** **Export HTML** is pressed in the timeline of the story `purchase`
- **THEN** `purchase.purchase.html` is written beside the file

#### Scenario: The same page as the command line
- **WHEN** **Export HTML Player** writes the `context` view of commerce
- **THEN** its embedded document equals the one `mdg export --diagram context --format html` embeds

#### Scenario: Nothing to export
- **WHEN** **Export HTML Player** runs on a file without diagrams or stories
- **THEN** the command says there is nothing to play and writes no file
