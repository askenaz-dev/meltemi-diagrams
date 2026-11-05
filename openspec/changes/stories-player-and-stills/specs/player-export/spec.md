# Spec Delta

## MODIFIED Requirements

### Requirement: Player documents
A player document SHALL be versioned JSON (`format: "meltemi-player"`, `version: 3`) holding,
for a story document, its stories in order (each with its id, title, description and timeline),
or for an effects document the key of its root view, and for every view by key (the diagram id,
deduplicated as `id-2`, `id-3`, never a file path) its scene, effects and relation ends, and for
effects documents when its effects end (null when they repeat forever); element labels
(`names`); the details hover cards and the panel show (`details`: per element its kind, its C4
type word in the content language, technology, description, url, external, entity path and what
it opens as `{ view, element, transition }` or null; per relation its label, technology,
description, assumption, whether it was lifted and its model sources; per view its C4 level and
scope and its parent view); the accent colour and the `@font-face` rules of the text of every
view. A story document's `id`, `title` and `description` SHALL be its first story's. Builders
SHALL produce it from one compiled story or several, each with its laid-out views, the views
shared and embedded once, or from a laid-out diagram with the reachable views and their targets
the host resolved, with the content locale for the type words, and SHALL read only the compiled
diagram's labels, kinds, technology, descriptions, URLs, entity paths and relation fields, never
comments, source positions, paths or diagnostics. A story whose views cannot be drawn SHALL be
left out of a document of several and reported by the builder; none drawn SHALL give no
document. The runtime SHALL read version 3 and version 2 (one story) documents alike. The same
inputs SHALL give the same document.

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

#### Scenario: Two stories over one view
- **WHEN** a document is built from the stories `purchase` and `refund`, both for `checkout`
- **THEN** `stories` has two entries in that order, each with its own timeline, `views` holds
  `checkout` once, and the document's `id` and `title` are `purchase`'s

#### Scenario: A story that cannot be drawn is left out
- **WHEN** a document is built from three stories and one shows a view with an error
- **THEN** the document holds the two others, the builder names the one left out, and a document
  built from that story alone is not made

#### Scenario: A version 2 page still plays
- **WHEN** `<meltemi-player>` reads a document with `version: 2` and one `timeline`
- **THEN** it plays that story as one of one, with no story picker

### Requirement: HTML pages and fragments
`meltemi-diagrams export <file> --format html [--story <id> | --stories [<ids>]]` SHALL write a
complete, offline HTML page with the player, its data and its fonts inline, named
`<stem>.<story>.html` for a story, `<stem>.stories.html` for every story of the file (`--stories`
alone, in source order) or the listed ones (`--stories a,b`, in that order), and like SVG exports
otherwise; `--embed` SHALL write a fragment that can be pasted into a page, more than once. The
page of a diagram SHALL bundle every view reachable by drill-down from it across the project (C4
child views scoped to its entities and the diagrams its elements link to), laid out once each,
views with errors or that cannot be drawn left out with the targets that lead to them, and the
command SHALL report how many views it bundled; the page of several stories SHALL report how many
stories it holds and name those left out, their diagnostic printed once. HTML SHALL be the format
of `--stories` when none is given. `--at`, `--motion
animated` and `--fonts outlined` with `--format html`, `--stories` with `--story`, with another
format or with an id that is no story of the file (the available ones listed) SHALL be usage
errors. Embedded data SHALL never end its script element. Writing the same sources twice SHALL
give the same bytes. `playerElement` SHALL write `interactive="false"` when asked and nothing
otherwise.

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

#### Scenario: Every story of the file
- **WHEN** `mdg export flows.meltemi --format html --stories` runs on a file with the stories
  `purchase` and `refund`
- **THEN** `flows.stories.html` is written, its document holds both stories in source order over
  one `checkout` view, the output says it holds two stories, and the page's control bar offers a
  Story picker

#### Scenario: A chosen few, in order
- **WHEN** `mdg export flows.meltemi --format html --stories refund,purchase --embed` runs
- **THEN** the fragment's document lists `refund` first and `purchase` second

#### Scenario: Stories with another format
- **WHEN** `mdg export flows.meltemi --format svg --stories` runs
- **THEN** the usage error says `--stories` writes an HTML player, nothing is written and the exit
  code is 2

#### Scenario: HTML when no format is given
- **WHEN** `mdg export flows.meltemi --stories` runs
- **THEN** `flows.stories.html` is written, as with `--format html`

#### Scenario: An id that is no story
- **WHEN** `mdg export flows.meltemi --format html --stories purchase,tour` runs and `tour` does
  not exist
- **THEN** stderr names `tour` and lists `purchase` and `refund`, and the exit code is 2

### Requirement: Export from the editor
VS Code SHALL offer **Meltemi Diagrams: Export HTML Player** for the stories and diagrams of a
file and, when the file has more than one story, for **Every story**, writing the same page
`produceExport` writes for the command line, bundled views included, and the canvas timeline
SHALL export the story it plays.

#### Scenario: Timeline export
- **WHEN** **Export HTML** is pressed in the timeline of the story `purchase`
- **THEN** `purchase.purchase.html` is written beside the file

#### Scenario: The same page as the command line
- **WHEN** **Export HTML Player** writes the `context` view of commerce
- **THEN** its embedded document equals the one `mdg export --diagram context --format html` embeds

#### Scenario: Nothing to export
- **WHEN** **Export HTML Player** runs on a file without diagrams or stories
- **THEN** the command says there is nothing to play and writes no file

#### Scenario: Every story from the quick pick
- **WHEN** **Export HTML Player** runs on a file with two stories and **Every story** is picked
- **THEN** `<stem>.stories.html` is written beside the file with the document
  `mdg export --format html --stories` embeds

#### Scenario: One story offers no such entry
- **WHEN** **Export HTML Player** runs on a file with one story and one diagram
- **THEN** the quick pick lists the story and the diagram and no **Every story** entry
