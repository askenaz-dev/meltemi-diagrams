## Why

Signed in, a person expects their projects to follow them between devices and to survive a
reinstalled browser; the owner also wants versions that do not fill the storage, and everything
in the cloud to be the same project the CLI and VS Code open. This change gives a cloud project
one shape: a Yjs document held by one Durable Object that merges every edit (from this page,
from another device, from the command line), persists it, and materialises it to
content-addressed files, so a version costs only what changed and offline edits merge on
reconnect ([decision 0041](../../../docs/decisions/0041-hosted-service.md)). Post-1.0 change,
outside the roadmap; it applies after `cloud-accounts`.

## What Changes

- **The document**: a cloud project is a Yjs document keyed by stable file ids: `files` (id →
  `Y.Text` for the text files the page edits), `paths` (id → path, text and binary files alike)
  and `binaries` (id → hash for images and fonts), so a rename is one small change of `paths`;
  every path passes one rule (`cleanPath`, moved with `isTextPath` and `isImagePath` to
  `@meltemi/diagrams-project`), enforced by the room on every transaction and by every route;
  `yjs` (MIT, approved) is the page's and the Worker's one new runtime dependency.
- **The room**: a Durable Object `ProjectRoom` per project, SQLite-backed, with WebSocket
  hibernation: the page connects to `wss://<origin>/rooms/<id>`, the Worker authenticates the
  upgrade and calls the room with a request it constructs; the room validates every
  transaction, syncs state vectors and updates, persists the document as a throttle (once per
  second at most, ten seconds at the latest) in 1 MiB chunks, counts a revision per
  transaction, applies pushes from the API as transactions, serves the latest files to readers,
  and materialises the files to blobs by diff thirty seconds after the last change and when the
  last client leaves.
- **Storage**: D1 tables `projects`, `project_files`, `project_blobs`, `blobs`, `versions`,
  `version_files`; bytes in an R2 bucket under `blobs/<sha-256>`; thumbnails under `thumbs/`; a
  weekly collection of blobs nothing references.
- **API**: list, create (from a template or from files), read, rename, delete and duplicate
  projects; `/p/<id>` as the project's link (a 302 to `/?project=<id>`); read the latest files
  from the room; push files as one transaction with an optional revision check; upload and
  remove images and fonts by hash, served sandboxed; versions (create with a label, list, read,
  restore, with automatic daily versions, a cap, a rate and thinning); thumbnails (one per
  thirty seconds); usage.
- **Quotas and limits** (`CLOUD_LIMITS`): 100 projects and 200 MiB per account, 2000 files and
  16 MiB of document per project, 2 Mi characters per text file, 10 MiB per binary, 200 versions
  per project (100 unlabelled kept), 20 clients per room, 512 KiB per message; stable error
  codes, `429` for the rates.
- **The page**: a "Projects" drawer (list with thumbnails, new from a template, save the local
  project to the cloud, open, rename, duplicate, delete); a project opened by address
  (`project` read from `location.search`); the cloud project bound to the Studio through a new
  `change` listener (local edits become Yjs transactions, coalesced before they are sent;
  remote changes update the code pane keeping the caret, the canvas and the analysis); undo over
  one's own edits with the same grouping as today; the document kept in IndexedDB so the project
  opens and edits offline and merges on reconnect; a connection indicator; a versions panel;
  usage in the account menu. The anonymous page is untouched: `localStorage` and `#p=` links as
  today.
- **Cascade**: deleting the account deletes its projects, versions, thumbnails and rooms.
- Documentation: `docs/cloud.md` (document, room, storage, API, quotas), `docs/playground.md`
  (projects, versions, offline), decision 0041.

## Capabilities

### New Capabilities

- `cloud-document`: the Yjs document and its path rule, the socket route, the room's protocol
  and persistence, revisions, pushes, reads and materialisation, limits.
- `cloud-projects`: projects and their address, files and blobs, images and fonts, versions,
  thumbnails, quotas, usage and the cascade.
- `playground-cloud`: the projects drawer, the binding of a cloud project to the Studio, undo of
  one's own edits, IndexedDB, the connection indicator, the versions panel.

### Modified Capabilities

- `web-playground`: "Work kept in the browser" (cloud projects in IndexedDB beside the
  anonymous project in `localStorage`) and "One undo history" (in a cloud project, one's own
  edits, grouped as before).

## Non-goals

- Sharing, permissions, viewing by link, publishing: `sharing-and-permissions` (this change
  admits the owner only).
- Presence and editing together: `live-collaboration` (the room already merges several
  clients; this change tests one person on two devices).
- The command line: `cli-cloud` (this change provides the push and read routes it uses).
- The Cloudflare zone, the R2 bucket and the Durable Object namespace in production: the
  delivery change; everything here runs on `wrangler dev`.

## Impact

- New runtime dependency `yjs` (MIT) in `packages/playground` and `packages/cloud`; `lib0`
  comes with it. The licence inventory and `NOTICES.md` list them.
- `packages/cloud`: `src/room.ts` (the Durable Object), `src/document.ts` (shared document
  helpers), `src/materialise.ts`, the socket route `/rooms/:id`, routes for projects, files,
  blobs, versions, thumbnails, usage; migrations `0002_projects.sql` (`project_blobs` among its
  tables); `wrangler.jsonc` adds the R2 binding `BLOBS`, the Durable Object binding `ROOMS`
  with a SQLite migration, and a weekly cron.
- `packages/playground`: `src/cloud/{client,projects,binding,persistence,room,versions}.ts`;
  `Studio` gains a `change` listener, `replaceText` for remote changes, `canUndo` and `canRedo`,
  and delegates undo to the binding in a cloud project; `src/files.ts` re-exports the path
  helpers from `@meltemi/diagrams-project`; messages in both languages; the cloud browser suite
  grows.
- `packages/project`: `CLOUD_LIMITS` next to `PROJECT_LIMITS`, and `src/files.ts` (`cleanPath`,
  `isTextPath`, `isImagePath`, `CLOUD_TEXT_EXTENSIONS`), shared by the page, the Worker and the
  CLI.
