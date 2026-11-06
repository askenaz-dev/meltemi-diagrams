# Browser implementation and build

[Español](es/browser-implementation.md)

Maintainer implementation and operations notes, extracted from the mixed user guide. Product usage is documented in [the public guide](../web-app.md).

## Building and serving it

```bash
pnpm playground:build
```

The build writes a static site to `packages/playground/dist/`: `index.html`, the scripts, the
style sheets, `templates.json`, the fonts, the Tabler data, the runtimes written into HTML exports,
`NOTICES.md`, `api/session`, the answer a static server gives the page's one request to an API
(`{"user":null}`: nobody is signed in), and `_headers`, the two headers the cloud service's assets
platform gives every file of the page (`frame-ancestors 'self'` and `nosniff`; a static server
serves it as a plain file), and `agent-setup/` with `es/agent-setup/`, the static page that tells
how to give coding agents the skill ([drawing with coding agents](../agents.md)), beside its
stylesheet and `agent-setup/prompt.md`, the command line's setup prompt. Any static server serves it; during development `pnpm preview` serves
the repository at `http://localhost:4173/packages/playground/dist/`. The hosted page is
`https://diagrams.meltemi.dev`: the [cloud service](../cloud.md) serves the same build with an account
on top of it (`pnpm cloud:dev` locally), deployed from `main` by the deploy workflow.
The page signs people in at `https://id.meltemi.dev`; set `PLAYGROUND_IDENTITY` to another identity
service's origin when building to change that, and the policy's `form-action` follows.

```bash
pnpm playground:test-browser
```

builds the site, serves it on `127.0.0.1` and drives it in the installed Edge or Chrome.

## How it is built

- The canvas is `@meltemi/diagrams-canvas`, shared with the extension's webview; the page plays
  the extension's role (applies plans, keeps revisions, answers the canvas's requests).
- The explorer is `src/explorer/`: `tree-model.ts` (the tree, the rows the keys walk and the rules
  of names, moves and copies, with no DOM), `tree.ts` (the WAI-ARIA tree, redrawn by key so that
  focus, scroll and an opening folder survive the project's changes), `explorer.ts` (the pane and
  its actions), `switcher.ts` (the header and the Projects panel), `new-project.ts`, `import.ts`
  and `dialogs.ts`. A move goes through `Studio.moveFiles`, which rewrites the imports with
  `moveFileEdits` of `@meltemi/diagrams-editor` and records the move in the history's own stack;
  the pictures of the template cards are drawn when the site is built (`thumbnails.mjs`).
- Projects live in memory (`MemoryHost`, a `ProjectHost` under `/playground`) and compile with
  `ProjectSessions` of `@meltemi/diagrams-editor`, with the page's font and Tabler readers and the
  bundled ELK worker.
- Fonts and icon data are fetched from the page's own origin when first read; the page analyses
  again when they arrive, and exports wait for every file they read.
- The GIF encoder, the WebM and MP4 writers and the ZIP reader and writer are part of the page
  (`packages/playground/src/encode/`, `src/zip.ts`); nothing else is downloaded.
- The account is `src/cloud/`: the session the page asks for once (`session.ts`), the header's
  sign-in link and account menu (`account.ts`) and the API tokens dialog (`tokens-dialog.ts`, over
  `tokens-model.ts` and `tokens.ts`, which need no DOM). The page works the same whatever the
  service answers; it never throws on it.
- Cloud projects are in `src/cloud/` too. `client.ts` makes the calls to the service and none of
  them throws. `projects-model.ts` is the cloud list of the explorer's panel, and `versions.ts` the
  versions panel over `versions-model.ts`; neither model needs a DOM. `project.ts` is one open
  project: its Yjs document (`doc.ts`), the binding that ties the document to the `Studio`
  (`binding.ts`), the socket to the room (`room.ts`), its copy in IndexedDB (`persistence.ts`) and
  the connection's state (`status.ts`). `thumbnails.ts` and `thumbnail-render.ts` make and send the
  preview, `address.ts` reads and writes `?project=`, and `controller.ts` holds it all together for
  the panel and the shell. The `Studio` gains a `change` listener, `replaceText` for changes that
  arrive from elsewhere and `canUndo` and `canRedo`, and delegates undo to the binding while a cloud
  project is open. The one runtime dependency cloud projects add is `yjs` (MIT, listed in
  `NOTICES.md`); the page keeps the browser, the socket, IndexedDB and the clock behind small
  interfaces, so the tests play all of them.
- Sharing, viewing and publishing are in `src/cloud/` as well. `share.ts` draws the share dialog
  over `share-model.ts`, whose `shareView` is the one place that decides what each role is shown (a
  control a person may not use is not drawn), and `share-api.ts`, the calls; `publish.ts`,
  `publish-model.ts` and `publish-api.ts` do the same for publishing, building the page with
  `projectCatalog` (`src/exports/files.ts`), the build the catalog download shares. Viewing is
  `view-mode.ts` (the mode), `snapshot.ts` (the read of a person who is not signed in), `link.ts`
  (opening an address and accepting an invitation), `view-actions.ts` (the copies and the reload),
  `view-bar.ts` (the header's badge and the reload hint) and `view-page.ts`, which ties them
  together. `Studio.setReadOnly` refuses every edit at the one place edits pass, `CodePane.setReadOnly`
  and the shell guard the rest, the binding sends no update as a viewer, and `canvas-settings.ts`
  gives the canvas `readOnly` in its `settings` message ([the editor guide](../editor.md)).
- Presence is in `src/cloud/` as well. `presence.ts` is what a project tells the room about its
  person (the file open, the caret as Yjs relative positions, the canvas selection) with the 250 ms
  throttle and the heartbeat, and what the room says of the others; `presence-wire.ts` is the format
  of the kind 2 messages ([awareness](../cloud.md#awareness)) and the only place that reads a peer's
  payload; `presence-model.ts` decides, against the document as it is now, who the header lists,
  which carets the code pane draws and what the canvas is told; `presence-geometry.ts` says where a
  position is on the pane. None of those four needs a DOM. `presence-bar.ts` draws the header's
  list, `presence-overlay.ts` the carets and selections over the code, and `presence-mount.ts` ties
  them to the shell; `room.ts` carries kind 2 messages both ways, and the canvas draws the rest from
  a `presence` message ([the editor guide](../editor.md)).
