# Stories as the flows of a diagram

## Why

On 2026-11-04 the owner asked for "scenes of animation" that tell several flows of one diagram:
different sets of animations to choose from, so that a reader can see each flow on the same
drawing instead of a copy of the diagram pasted elsewhere with one zone highlighted. The language
already has it: a file may hold several `story` blocks for one diagram, each with scenes that
reveal, highlight, trace, focus and move the camera, and the canvas plays any of them from its
story picker (decision 0023). What is missing is the way out and the way in. The HTML player
exports one story per page, so a reader of a page cannot pick a flow; a story can only be started
in the text, so a person on the canvas who wants a second flow has to write `story … for … { scene
… { } }` by hand before the timeline offers anything; and the frame of a scene, the picture that
goes into a slide or a document, is written one `--at <time>` at a time. This change closes the
three gaps without a new statement of the language.

This is a post-1.0 change outside `docs/roadmap-1.0.md`.

## What changes

- **Several stories in one player.** A player document may carry every story of a file over the
  views they share, and the player offers a **Story** picker in its control bar when there is
  more than one: picking a flow goes to its start, its scenes fill the scene picker, the summary
  lists it and the change is announced. `meltemi-diagrams export <file> --format html --stories`
  writes `<stem>.stories.html` with every story of the file (`--stories a,b` a chosen few, in that
  order), also as an `--embed` fragment; the web app's export dialog and VS Code's **Export HTML
  Player** offer **Every story** when the file has more than one. The player document goes to
  version 3 (`stories` instead of one `timeline`) and the runtime reads versions 2 and 3, so
  pages written before keep playing. **BREAKING** for a page that pastes a new fragment beside an
  older runtime: the older runtime says the document is unreadable, as it does for version 1.
- **A story from the canvas.** A **New story** button beside the story picker writes `story
  <id> for <diagram> { scene scene1 { } }` for the diagram the canvas shows (or the playing
  story's diagram) through a new edit `createStory`, named `story1`, `story2`… like **New
  diagram**, and enters story mode on it with its empty scene, so **Add to scene** and **New
  scene** take over at once; read-only canvases do not offer it.
- **A picture per scene.** `meltemi-diagrams export <file> --story <id> --scenes` writes each
  scene's final state, the frame the player's static view shows: one SVG or PNG per scene, named
  `<stem>.<story>.<scene>.svg`, or one PDF with a page per scene. Export profiles take `scenes`
  on `svg`, `png` and `pdf` of a story. The web app's export dialog offers **One picture per
  scene** for a story (a `.zip` of the pictures, or the print page with one page per scene), and
  the canvas timeline gains **Export scenes** beside **Export HTML**, which VS Code answers with a
  quick pick of the format and files beside the source.
- **Words and guides.** English and Spanish catalogues of the player, the canvas, the web app,
  the CLI and VS Code; `docs/player.md`, `docs/language/stories.md`, `docs/language/export.md`,
  `docs/editor.md` and `docs/cli.md` in both languages; the changelog's open section; decision
  note 0070. The language stays 0.2: `scenes` is an additive option of the `export` block.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `player-export`: player documents hold several stories (version 3); `--stories` writes the page
  of every story; **Export HTML Player** offers every story.
- `player-runtime`: added, the **Story** picker of a document with several stories, the `story`
  attribute, its announcements and summary.
- `story-export`: `--scenes` writes a picture per scene, or a PDF with a page per scene.
- `export-profiles`: the `scenes` option.
- `story-editing`: the `createStory` edit; the canvas's **New story** and **Export scenes**.
- `playground-exports`: added, the dialog's **Every story** target and **One picture per scene**
  box.
- `cli-export`: `--stories` and `--scenes` are refused with a folder.

## Impact

`packages/player` (the document format and builders, the runtime's control bar, summary and
announcements, the page and fragment builders), `packages/editor` (`ExportRequest` targets and
`produceExport`, the session's `createStory` and `exportScenes` actions, the canvas protocol),
`packages/edit` (the `createStory` operation), `packages/canvas` (the toolbar button and the
timeline button), `packages/cli` (`--stories`, `--scenes`, the multi-page PDF capture),
`packages/capture` (a PDF of several pages), `packages/model` (the `scenes` profile option),
`packages/playground` (the export dialog, the zip of stills, the print page), `packages/vscode`
(the quick picks and the timeline's host), `packages/catalog` (reads version 3 documents it
builds itself), the docs in both languages, CHANGELOG and one decision note. No cloud route,
storage or language statement changes; the model JSON gains only the `scenes` key of export
profiles, within its version `0.1` (design, decision 7).

## Non-goals

Colour combinations per flow: a story never changes colours (decision 0023), and the owner said
the animations are enough. Filtered views with their own layout (a diagram shown with some of its
elements and re-laid out) are another change, if wanted. The `export` block keeps one target per
profile, so a page of every story is written from the command line and the dialogs, not from a
profile. The catalog keeps one page per story. Video of several stories in one file, and a
PowerPoint of the stills (the proposal's own 1.0 exclusion, PPTX export).
