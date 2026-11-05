# Tasks

## 1. The document and the player

- [x] 1.1 In `packages/player/src/format.ts` raise `PLAYER_VERSION` to 3, replace the story
      document's `timeline` by `stories: StoryEntry[]`, accept version 2 in `isPlayerDocument`
      and add `readPlayerDocument` that lifts a version 2 `timeline` into one entry. Verify a test
      in `packages/player/test/player.test.ts` reads a version 2 object as one story of one and
      refuses version 1.
- [x] 1.2 In `document.ts` add `storiesDocument(stories, layouts, options)` sharing the views,
      returning the stories left out, and make `storyDocument` build a one-entry document. Verify
      tests build the purchase file plus a `refund` story into one document with `checkout` once,
      leave out a story whose view has an error, and give the same JSON twice.
- [x] 1.3 Move the final-state instant to `@meltemi/diagrams-motion` as `sceneStills(timeline)`
      and make `PlayerController.sceneEnd` use it. Verify a motion test lists the purchase
      scenes' instants (1800 − 0.01 ms, 7400 ms) and a player test asserts `sceneEnd` equals them.
- [x] 1.4 In `controller.ts` and `runtime.ts` add the story index, `goToStory`, the **Story**
      picker before the scene picker when there is more than one story, the `story` attribute and
      option, the announcement "Story: <title>" / "Historia: <título>" and the summary headed per
      story with `aria-current`, in `messages/en.ts` and `es.ts`. Verify `pnpm player:test-browser`
      with new scenarios: picking a story shows its first frame at 0 paused, the attribute picks
      first, `+` inside the picker leaves the zoom, one story shows no picker, the Spanish words.
- [x] 1.5 Update `docs/player.md` and `docs/es/player.md` (the picker, the `story` attribute, the
      runtime of a page is its newest fragment's) and `framesPage` for documents of several
      stories (the first story's frames). Verify the docs link test and `pnpm --filter
      @meltemi/diagrams-player test` are green.

## 2. Every story from the command line, the dialog and VS Code

- [x] 2.1 In `packages/editor/src/exports.ts` add the target `{ kind: "stories", stories }` to
      `ExportRequest`, lay out each story's views once per request and build the page with
      `storiesDocument`, reporting the stories left out as notices. Verify an editor test produces
      the two-story page and leaves out the broken story with one diagnostic.
- [x] 2.2 In `packages/cli/src/export-command.ts` add `--stories` (flag or comma list), the
      `<stem>.stories.html` name, the `Wrote … (2 stories)` line and the usage errors (with
      `--story`, another format, `--at`, a folder, an unknown id listing the available ones), in
      `messages/en.ts` and `es.ts` and the help text. Verify `packages/cli/test/export.test.ts`
      covers the page, the order of `--stories refund,purchase --embed`, and every usage error
      with exit 2.
- [x] 2.3 In `packages/playground/src/exports/dialog.ts` add the target **Every story (N)** for
      two or more stories, HTML only, and its download; words in `messages/en.ts` and `es.ts`.
      Verify `pnpm playground:test-browser` with scenarios: the download's document holds both
      stories, the format field offers HTML only, one story offers no target.
- [x] 2.4 In `packages/vscode/src/extension/commands.ts` add the **Every story** quick pick entry
      of **Export HTML Player** for two or more stories, in `package.nls.json` and
      `package.nls.es.json` where the words live. Verify `pnpm --filter meltemi-diagrams test`
      covers the entry's presence and absence and the file written.
- [x] 2.5 Update `docs/language/stories.md`, `docs/cli.md`, `docs/editor.md` and their Spanish
      guides with `--stories` and the dialog's target. Verify the docs link test is green.

## 3. A story from the canvas

- [x] 3.1 In `packages/edit/src/stories.ts` and `types.ts` add `createStory { diagram, id?,
      title?, scene? }` with `newStoryId` beside `newDiagramId`, wired in `plan.ts`. Verify
      `packages/edit/test/stories.test.ts` covers the text written, the next free id past a
      profile's `story2`, the title, the imported diagram refused, and that `story.empty-scene`
      is the only new diagnostic.
- [x] 3.2 In `packages/editor/src/canvas/protocol.ts` and `session.ts` add the canvas action
      `createStory` (no payload), the diagram choice (the shown diagram, or the playing story's),
      `pendingStory` and entering story mode on the applied edit, with the status line's words
      in the session's messages. Verify an editor session test posts `createStory` on `checkout`
      and receives a `story` message with `story1` playing and one scene.
- [x] 3.3 In `packages/canvas/src/app.ts` add the **New story** button after the story picker
      (`data-write`, hidden read-only and in the empty state), words in `messages/en.ts` and
      `es.ts`. Verify `pnpm vscode:test-webview` covers the post, the hidden button when read-only,
      and `pnpm playground:test-browser` covers the created story shown in story mode with its
      empty scene and the status line.
- [x] 3.4 Update the Stories section of `docs/editor.md` and `docs/es/editor.md` and the "In the
      editor" section of `docs/language/stories.md` and its Spanish guide. Verify the docs link
      test is green.

## 4. A picture per scene

- [x] 4.1 In `packages/editor/src/exports.ts` add `scenes` to `ExportRequest`, the outputs
      `{ texts }` and `{ jobs }` named `<stem>.<story>.<scene>.<ext>`, the multi-page
      `CaptureJob` for PDF (pages of the largest frame's size, frames centred) and the refusals
      (with `at`, `html`, a video). Verify editor tests produce two SVG texts equal to the frames
      at `sceneStills`' instants and one PDF job with two pages of 640 × 400 for a two-view story.
- [x] 4.2 In `packages/capture` print a multi-page `capturePage` (one `section` per page with its
      `@page` size) to one PDF. Verify `packages/cli/test/capture.test.ts` reads two pages from
      the PDF written.
- [x] 4.3 In `packages/cli/src/export-command.ts` add `--scenes`, `Wrote` per file, `--out` as a
      directory for SVG and PNG, and the usage errors (without `--story`, with `--at`, `--stdout`,
      `html`, a video, a file `--out`, a folder). Verify `packages/cli/test/story.test.ts` covers
      the file names, the PDF's page count, the equality with `--at` at the scene's instant and
      each usage error with exit 2.
- [x] 4.4 In `packages/model/src/export.ts` add the `scenes` option (svg, png, pdf of a story;
      `export.invalid-option` with `at`, on a diagram, on another format, and `file` with scenes
      on svg or png), and run it from `--profile`. Verify model tests cover the three diagnostics
      and `packages/cli/test/export.test.ts` writes `purchase.slides.overview.png` from the
      profile.
- [x] 4.5 In `packages/playground/src/exports/dialog.ts`, `files.ts`, `raster.ts` and `print.ts`
      add **One picture per scene** for a story with SVG, PNG or PDF (the zip, the progress line,
      the multi-page print frame, the hidden Instant field, the count in the status line), words
      in both catalogues. Verify `pnpm playground:test-browser` with scenarios: the zip's two SVGs
      equal the CLI's, the print frame's two pages, the Instant field hidden, the box unchecked at
      each opening, the Spanish words.
- [x] 4.6 In `packages/canvas/src/story.ts` add **Export scenes** beside **Export HTML** posting
      `exportScenes { story }`; in `packages/vscode/src/extension/commands.ts` answer with a quick
      pick of SVG, PNG and PDF and the files beside the source; in `packages/playground/src/
      canvas-host.ts` open the dialog on the story with the box checked. Verify
      `pnpm vscode:test-webview` covers the post and `pnpm --filter meltemi-diagrams test` the
      files written; the playground suite covers the dialog opened with the box checked.
- [x] 4.7 Update `docs/language/stories.md` (Exports table), `docs/language/export.md` (the
      `scenes` option and its diagnostics), `docs/cli.md`, `docs/editor.md` and the Spanish guides.
      Verify the docs link test is green.

## 5. Record

- [x] 5.1 Write `docs/decisions/0070-stories-as-the-flows-of-a-diagram.md`, add "Amended by 0070"
      to 0023's status line, and add the entry to the changelog's open section (opening one above
      the released section if needed), saying the language stays 0.2. Verify the decision links
      resolve in the docs test.
- [x] 5.2 Run `pnpm typecheck`, `pnpm lint` and `pnpm test` at the root, the three browser suites,
      and `openspec validate "stories-player-and-stills" --strict`. Verify all green and record
      the results in the change's `validation.md`.

## Workflow follow-up

- Archive the change after review; the archive syncs the seven deltas.
