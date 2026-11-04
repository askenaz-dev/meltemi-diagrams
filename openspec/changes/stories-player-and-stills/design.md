# Design

## Context

A player document (`packages/player/src/format.ts`, `PLAYER_VERSION` 2) of kind `story` holds
one `timeline` and the `views` it shows by view key, with `names`, `details`, `accent` and
`fontFaces`; `storyDocument(story, layouts, options)` builds it and `isPlayerDocument` refuses
any other version. The runtime (`runtime.ts`, `controller.ts`) keeps the scenes of that one
timeline, a scene picker, the static view, the summary (`storySummary`) and the live region;
`playerPage`, `playerFragment` and `framesPage` (`html.ts`) embed one document. `produceExport`
in `packages/editor/src/exports.ts` takes an `ExportRequest` whose target is a diagram or a
story, builds the document through `storyLayoutsIn` and returns text, a `CaptureJob` (one SVG
for `capturePage`, printed or rasterised by `packages/capture`) or a video job. The CLI
(`export-command.ts`), the web app's dialog (`packages/playground/src/exports/dialog.ts`, with
`print.ts`, `raster.ts`, `files.ts` and the project `zip.ts`) and VS Code
(`extension/commands.ts`) build the same requests. The canvas's story picker
(`packages/canvas/src/app.ts`, `applyStory`, `pickStory`) lists the stories the session sends
(`storyChoices`, `storyPlayback` in `packages/editor/src/story.ts`); the timeline
(`packages/canvas/src/story.ts`, `StoryPanel`) acts through `CanvasAction`s the session turns
into `@meltemi/diagrams-edit` operations (`setStoryTiming`, `insertStoryAction`,
`removeStoryAction`, `insertScene`), and its **Export HTML** posts `exportPlayer` to the host.
`createDiagram` (`packages/edit/src/diagrams.ts`, `session.ts:createDiagram` with
`pendingDiagram`) is the model for an edit that creates a block and shows it. The player's
static view shows a scene's final state at `sceneEnd(index)` (`controller.ts`): the scene's end,
less 0.01 ms before another scene, so the next transition's first frame never shows. See
proposal.md for the motivation.

## Goals / Non-Goals

**Goals:**

- One player document, one page and one fragment for every story of a file, over views
  embedded once, with the picker, the summary and the announcements of the chosen story.
- A story started from the canvas with one edit, shown at once in story mode.
- The still of every scene equal to the player's static view of that scene, from the command
  line, profiles, the dialog and the timeline, as SVG, PNG or a multi-page PDF.

**Non-Goals:**

- A story picker in the canvas's playback beyond the one it has; the catalog's pages; the
  published pages of the cloud (they embed the catalog).
- Editing a story's id or title from the canvas, and scenes with actions written at creation.
- A `stories` target for export profiles and a video of several stories.

## Decisions

1. **Version 3 story documents hold a list of stories.** `StoryPlayerDocument` becomes
   `{ kind: "story", stories: readonly StoryEntry[], views, names, details, accent, fontFaces,
   id, title, description }` with `StoryEntry { id, title, description, timeline }` in the order
   given and the document's `id`, `title` and `description` those of the first story, so a
   single-story page reads as today. `PLAYER_VERSION` is 3; `isPlayerDocument` accepts 2 and 3
   and `readPlayerDocument` lifts a version 2 document's `timeline` into a one-entry `stories`,
   so the runtime, `frameSvg` and the catalog read what older builders wrote. `storyDocument`
   keeps its signature for one story and `storiesDocument(stories, layouts, options)` builds the
   shared one: views keyed once (`freeKey`), each story's timeline rekeyed to them, a story
   whose views cannot be drawn left out and returned in `left: string[]` for the caller to
   report; no story drawn gives undefined. Alternatives: one `<meltemi-player>` per story on the
   page with a selector outside (views and fonts embedded once per story, and `--embed` gives no
   single element); an optional `stories` field under version 2 (an older runtime would play the
   first story and say nothing, which the version check exists to prevent).

2. **The picker belongs to the control bar.** When `stories.length > 1` the runtime adds a
   `<select aria-label="Story">` before the scene picker, options `title ?? id`, and
   `PlayerController` gains `story` (index), `goToStory(index)` (time 0, playing stopped, the
   static view kept, the viewport kept, as a scene change keeps it), `scenes` and `duration` of
   the chosen story; `handle.story` and `goToStory` are public. The element attribute
   `story="<id>"` picks the first shown (unknown ids fall back to the first entry) and
   `ElementOptions.story` writes it. The live region says "Story: <title>" (Spanish "Historia:
   <título>"), the frame's name and the summary follow the chosen story, and the summary of a
   document with several stories is headed by each story in turn, every story's scenes listed,
   with the chosen one's marked `aria-current`. Keys typed inside the picker stay its own, as
   the scene picker's do. No new key: Page Up/Down walk scenes; a flow is a deliberate choice.

3. **`--stories` is the file's stories, in order.** The CLI option `--stories` (a flag, or a
   comma-separated list of ids) with `--format html` builds `ExportRequest.target =
   { kind: "stories", stories: StoryDefinition[] }`, which `produceExport` lays out through
   `storyLayoutsIn` per story (views cached by key within the request) and
   `storiesDocument`; the output is `<stem>.stories.html` (or the fragment with `--embed`), and
   the `Wrote` line says how many stories it holds and names the ones left out with their
   diagnostic printed once. `--stories` with `--story`, with any other format, with `--at`, or
   with a folder is a usage error (exit 2), and an id that is no story of the file lists the
   available ones. The web dialog's **Every story (N)** target and VS Code's **Every story**
   quick pick entry build the same request; the dialog shows the HTML format only for it (the
   other options hidden as for a story, with Autoplay and Loop kept). Alternatives: repeating
   `--story` (ambiguous with the one-frame meaning); an `export … for stories` profile (a new
   target form of the language for a page the command line writes in one go).

4. **`createStory` is an edit like `createDiagram`.** `packages/edit` gains
   `createStory { diagram, id?, title?, scene? }` in `stories.ts`: it appends
   `story <id> for <diagram> {`, `  scene <scene> {`, `  }`, `}` after the last top-level
   statement with a blank line before, `title "<title>"` inside when given; `id` defaults to
   the first of `story1`, `story2`… that no diagram, model, theme, story or export profile of
   the file uses (`newStoryId(compilation)` beside `newDiagramId`), `scene` to `scene1`;
   `diagram` must be a diagram of the file, of any profile, else `edit.unsafe-target`; an id
   that is not an identifier or is taken is `edit.invalid-id` / `edit.id-conflict`. The result
   compiles with `story.empty-scene` only, which `checked` allows (warnings are not new
   errors). The session answers the canvas's `createStory` action (no payload) with the diagram
   the canvas shows (`this.current`) or, in story mode, the playing story's target, keeps
   `pendingStory = id` as `pendingDiagram` is kept, and on the applied edit sets `this.story`
   so the next `storyMessages` enters story mode on it; the status line says the story was
   created and what to do next. Alternative: a dialog asking id and title (the canvas has none
   for **New diagram**; ids and titles are edited in the text, where hover documents them).

5. **The canvas offers it beside the picker.** `app.ts` adds a **New story** button
   (`ICONS.story`, `data-write`) after `storySelect`, shown whenever a diagram is shown or a
   story plays and hidden on a read-only canvas and in the empty state; it posts
   `{ type: "createStory" }`. `CanvasAction` and the protocol gain `createStory` and
   `exportScenes { story }`; `StoryPanel` adds **Export scenes** (`ICONS.export`, text "Export
   scenes") beside **Export HTML**, which calls `host.exportScenes(story)`; the hosts answer:
   VS Code with a quick pick of SVG, PNG and PDF and `produceExport` beside the file
   (`exportScenes` in `commands.ts`), the web app by opening the export dialog on that story
   with the format SVG and **One picture per scene** checked. Alternative: a palette command in
   VS Code (**Export Scenes**); not added, the timeline is where the story is.

6. **Scene stills are the static view's frames.** `@meltemi/diagrams-motion` gains
   `sceneStills(timeline)`: for each scene, its id, title and the instant of its final state
   (the scene's end for the last scene, `end - 0.01` otherwise, the controller's rule moved to
   motion so the player and the exporters share it). `ExportRequest` gains `scenes: boolean`
   (false by default): with a story target and `svg` or `png`, `produceExport` returns a new
   output `{ texts: [{ name, text }] }` or `{ jobs: [{ name, job }] }` of one frame per scene,
   named `<stem>.<story>.<scene>.<ext>`; with `pdf`, one `CaptureJob { kind: "pdf", pages:
   [{ svg, width, height }] }` whose page is `capturePage` with a `section` per frame, every
   page the largest frame's size with its frame fitted and centred (as videos fit frames),
   printed by `packages/capture` to one PDF named `<stem>.<story>.pdf`. `scenes` with `at`,
   `html` or a video is refused by the request builder with the CLI's wording. The CLI writes
   every file and prints `Wrote` per file; `--out` must be a directory for SVG and PNG (a file
   is a usage error) and may be a file for PDF; `--stdout` is a usage error with `--scenes`.
   Alternatives: `--at` per scene by hand (today); a single SVG sheet of every scene (a layout
   of its own; a PDF page per scene is what slides and documents take).

7. **Profiles take `scenes`.** `packages/model/src/export.ts` adds the boolean option
   `scenes` for `svg`, `png` and `pdf` with a story target (`export.invalid-option` otherwise,
   also with `at`); `file` with `scenes` is `export.invalid-option` on `svg` and `png` (several
   files) and names the PDF. `profileRequest` sets `scenes` and the CLI's `--profile` writes the
   files as `--scenes` does.

8. **The web app zips the stills and prints the pages.** With **One picture per scene**
   checked (a checkbox shown for a story target with SVG, PNG or PDF, unchecked at each
   opening), SVG and PNG download `<stem>.<story>.scenes.zip` holding the files, written with
   the project archive's `zip.ts` (the PNGs drawn by `raster.ts` one by one with the progress
   line of videos), and PDF opens the print dialog on the multi-page `capturePage`; the status
   says how many pictures. The request is the CLI's (`scenes: true`), so the files match
   `--scenes` byte for byte for SVG. Alternative: one download per scene (browsers ask about
   multiple downloads and some refuse them).

9. **The guard tests.** `packages/player/test/player.test.ts` builds a two-story document from
   the purchase file plus a second story and asserts `frameSvg` per story equals
   `storyFrame`'s; the browser suite (`pnpm player:test-browser`) exercises the picker, the
   announcement, the summary and the `story` attribute; `packages/edit/test/stories.test.ts`
   covers `createStory`'s text and refusals; `packages/cli/test/story.test.ts` covers `--scenes`
   names, the PDF page count and the usage errors, and `export.test.ts` `--stories`; the
   playground browser suite covers **New story**, **Export scenes** and the dialog; the VS Code
   webview suite covers the two buttons' posts.

10. **The decision note.** `docs/decisions/0070-stories-as-the-flows-of-a-diagram.md` records
    the document version, the picker, the edit, the stills' instant and the non-goals; 0023
    gets "Amended by 0070" on its status line for the document version and the player.

## Risks / Trade-offs

- [A page with an older runtime and a new fragment] → the runtime says the document is
  unreadable, as the spec already requires for version 1; `docs/player.md` says a page's runtime
  is the one of its newest fragment.
- [A file whose stories show views of different sizes in one PDF] → pages of one size, the
  largest, frames centred; the task's fixture has two views.
- [`story.empty-scene` on every new story] → the warning is the hint; the status line says
  what to add, and the first **Add to scene** clears it.
- [A story that cannot be drawn among several] → left out and reported; the page still plays
  the others; none drawn is the same problem as today.
- [The 0.01 ms instant drifts from the player's] → one function in motion, used by both; the
  player test asserts `sceneEnd` equals `sceneStills`' instant.
- [Many scenes make many files] → named by scene id, written under `--out`; the zip in the
  browser.
