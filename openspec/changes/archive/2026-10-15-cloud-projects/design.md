## Context

The page holds a project as a `MemoryHost` of text and bytes, edits it through `Studio`
(`applyEdits`, `write`, one `History` per file with groups and typing coalescence), and keeps
it in `localStorage` as `{ open, files }`. Everything the canvas does becomes text edits; layout
is deterministic. The Worker of `cloud-accounts` serves the page, knows who is asking and keeps
users. Cloudflare's free plan gives D1, R2 and SQLite-backed Durable Objects with WebSocket
hibernation; its daily budgets of rows written (D1 and Durable Object storage alike, 100 000 a
day) and of Durable Object requests (100 000 a day, an incoming WebSocket message counting one
twentieth of a request) are the numbers this design protects. A Durable Object SQLite value is
capped at 2 MB and a received WebSocket message at 1 MiB; D1 takes 100 bound parameters per
statement.

## Goals / Non-Goals

**Goals:**

- One write path for every editor of a project: the page, another device, the command line.
- Offline work that merges, and a page that never shows a conflict dialog.
- Versions that cost what changed, capped and thinned by policy; autosave creates none.
- Few rows written and few requests: the room persists on a throttle, materialises on a longer
  pause by diff, readers read from the room, and the page coalesces what it sends.
- The anonymous page unchanged.

**Non-Goals:**

- Roles, links, presence (the next changes); the CLI's commands.

## Decisions

### The document

```
Y.Doc
├── files:    Y.Map<fileId, Y.Text>   // the text files the page edits: .meltemi .json .md .txt .svg .css
├── paths:    Y.Map<fileId, string>   // every file's path, text and binary alike
└── binaries: Y.Map<fileId, string>   // images and fonts: sha-256 (hex) of the bytes
```

A file id is 16 characters of base32 from 10 random bytes, chosen by whoever adds the file; it
never changes. A rename is `paths.set(id, newPath)`: one small, undoable change that keeps the
text's history and merges with concurrent edits of the text. `snapshot`, `GET /files`, `PUT
/files`, the binding and the CLI translate id ↔ path, so everything outside the document still
speaks paths. Two ids with one path (two devices adding or renaming offline) are resolved
deterministically: the lexically smaller id keeps the path, the other is reported as
`<path>~<id>`, and both are listed as `collisions` in `hello` and `GET /files` so the page and
the CLI can show them.

The path rule, enforced by the room on every transaction whatever its origin and by every route
that takes a path: relative, `/`-separated, no empty, `.` or `..` segment, no segment starting
with `.`, no `\`, `:` or control character, at most 100 characters per segment and 12 segments.
It is the playground's `cleanPath`, which moves to `@meltemi/diagrams-project`
(`packages/project/src/files.ts`, exported with `isTextPath`, `isImagePath` and the
`CLOUD_TEXT_EXTENSIONS` list); the playground re-exports them from `src/files.ts`, and the
Worker and the CLI import them. A route answers `400 path.invalid`; the socket rolls the
transaction back and closes with `4400 path.invalid`.

The room validates every transaction (socket, push, restore) before keeping it: keys of
`files` and `binaries` have a path in `paths`, `files` values are `Y.Text`, `binaries` values
are lowercase 64-hex hashes present in `project_blobs(project_id, hash)` for this project
(`blob.unknown` otherwise, `doc.invalid` for any other shape), and `CLOUD_LIMITS` hold: 2000
entries in `paths`, 2 Mi characters per text (`SOURCE_LIMITS`), 16 MiB for the encoded document
(`doc.too-large`, `quota.files`). A broken transaction is rolled back and the client told.

The file that is open is each person's own and stays out of the document (in the page's
settings per project).

Alternative: paths as keys (`files: Y.Map<path, Y.Text>`). Yjs cannot move an integrated
`Y.Text` to another key, so a rename would be a delete plus a new text carrying the whole
content, losing its undo stack and every concurrent remote edit of it; the id layer costs one
small map. Alternative: one `Y.Text` per project holding a serialised bundle, which would make
every rename a rewrite and give the files one shared history.

### The room

`ProjectRoom` (`src/room.ts`), one per project id, SQLite-backed (`new_sqlite_classes`), with
the WebSocket Hibernation API. On construction it reads `meta(revision, chunks)` and
reassembles the encoded state from `doc_chunks(n, bytes)`.

**The socket route.** The page connects to `wss://<origin>/rooms/<id>`. The Worker answers
`GET /rooms/<id>` only with `Upgrade: websocket`; any other method, or a request without the
upgrade, is a 404. It resolves the principal (cookie; anonymous → `401 auth.required`), checks
the upgrade's `Origin` against its own origin (`403 request.forbidden`), resolves access (in
this change the owner; anyone else → `404 project.not-found`), and calls the room with a
request it constructs: the fixed internal URL `https://room/connect` and only the headers it
sets, `X-Meltemi-Sub`, `X-Meltemi-Role` (`owner`; the sharing change adds the others),
`X-Meltemi-Name`, `X-Meltemi-Picture`; no client header or path is forwarded. Each socket's
attachment holds them. The room's internal routes (`/files`, `/restore`, `/destroy`, `/stats`,
`/disconnect`) are reachable only through Worker-constructed requests, so `POST
/rooms/<id>/destroy` from a browser is a 404 and a spoofed `X-Meltemi-Role` never reaches the
room.

Messages are binary; the first byte is the kind:

| Kind | Direction | Payload |
| --- | --- | --- |
| 0 `sync` | client → room | the client's state vector; the room answers kind 1 with the missing update |
| 1 `update` | both | a Yjs update; the room applies it, persists, bumps `revision`, broadcasts to the others |
| 2 `awareness` | both | `live-collaboration` |
| 3 `hello` | room → client | JSON `{ role, revision, limits, collisions, you }` on connect |
| 4 `error` | room → client | JSON `{ code }`, then the socket closes with a 44xx code (4400–4429) |

A viewer that sends an update is closed with `4403 access.denied`; a message over 512 KiB
(`CLOUD_LIMITS.message`, below the platform's 1 MiB so the room sees it) with `4413
message.too-large`; a transaction that breaks a rule is rolled back and answered with `4400
path.invalid`, `4400 blob.unknown`, `4400 doc.invalid`, `4413 doc.too-large` or `4413
quota.files`; the 21st client with `4409 room.full`.

Persistence is a throttle, not a debounce: the room writes at most once per second while
changes keep arriving and once more after the last one, and in any case at the latest ten
seconds after the first unpersisted change, so a client that never pauses cannot postpone it;
on `webSocketClose` it writes at once. Each write stores the encoded state in chunks of at most
1 MiB (`doc_chunks(n, bytes)`) plus the `meta(revision, chunks)` row in one storage
transaction. The pending timer keeps the object from hibernating; between messages with no
pending work it may hibernate, and the next message reloads the document from storage. Each
transaction bumps `revision`, persisted with the document.

In `DEV` the room answers `GET /stats` with the counts of storage writes, materialisations, D1
rows written and incoming messages, and `POST /disconnect` closes a client's socket for the
suite's reconnection tests; both are internal routes, reached only through the Worker's `DEV`
handlers.

Alternative: append each update as a row and compact. Safer against an eviction in the
one-second window, and thousands of rows per typing session against a daily budget of a
hundred thousand; the throttle with the keep-awake timer is the trade this design takes, and
the browser suite measures rows written and messages per minute of typing through `/stats`.

### Reads, pushes and materialisation

The room answers internal requests from the Worker: `GET /files` (the latest `{ revision,
files: { path: text }, binaries: { path: hash }, collisions }`), `PUT /files` (a push: `{
files: { path: text | null }, binaries: { path: hash | null }, ifRevision? }`, every path
checked by the rule, applied as one transaction with origin `push` in which an existing path
keeps its id, a new path gets one and `null` deletes; `409 revision.mismatch` when
`ifRevision` differs; `400 blob.unknown` for a hash not in `project_blobs`), `POST /restore`
(a version's files as one transaction with origin `restore`), `POST /destroy` (`deleteAll`),
and in `DEV` `GET /stats` and `POST /disconnect`. Readers therefore see the latest state
without touching D1.

Materialisation runs thirty seconds after the last change, when the last client leaves, and
before a version is made, by diff: the room hashes every text file's UTF-8 bytes with SHA-256,
reads the current `project_files`, writes the new hashes to R2 (`blobs/<hash>`) and `blobs`,
upserts only the paths whose hash changed and deletes only the removed paths, chunked to 100
bound parameters per statement inside one `batch()`; `projects.revision` and `updated_at`
follow. Images and fonts were stored by hash when uploaded. The room runs `materialise()`
itself: a Durable Object class lives in the same Worker script and receives the same `env`, so
it reaches `env.DB` and `env.BLOBS` directly; no service binding and no public route exist for
it.

### Storage

```
projects      (id, owner_sub, name, description, created_at, updated_at, revision,
               thumbnail_at NULL, deleted_at NULL)
project_files (project_id, path, hash)                         primary key (project_id, path)
project_blobs (project_id, hash)                               primary key (project_id, hash)
blobs         (hash, size, media_type, created_at)
versions      (id, project_id, number, label NULL, auto, created_by, created_at)
version_files (version_id, path, hash)
```

Project ids are 20 characters of base32 from 12 random bytes. `project_blobs` holds every hash
uploaded to a project through `PUT …/binaries`, copied by `duplicate` and removed with the
project; it is what the room's hash check and `GET`/`HEAD …/blobs/<hash>` consult, never the
live map. Bytes live in R2 under `blobs/<hash>`; thumbnails under `thumbs/<project id>.svg`.
Usage per account is the sum of `blobs.size` over the distinct hashes its projects
(`project_files`, `project_blobs`) and versions reference, kept in `users.storage_bytes` and
refreshed at materialisation, version creation and binary upload; `GET /api/account/usage`
returns it with the counts. A weekly cron deletes blobs referenced by no `project_files`,
`version_files` or `project_blobs` row and older than seven days.

Alternative: text inline in D1 rows and only images in R2. Two paths for one thing, and rows
written for every materialised file; one content-addressed store is simpler and R2 reads are
cheap.

### Versions

`POST /api/projects/:id/versions { label? }` materialises, copies `project_files` to
`version_files` under the next number, and answers the version. Automatic versions: at the
first materialisation of a UTC day whose files differ from the latest version, one unlabelled
version with `auto = 1`. Thinning at each creation: unlabelled versions beyond 100 go, oldest
first; unlabelled versions older than thirty days keep the newest of each ISO week; labelled
versions never go. `CLOUD_LIMITS.versions` caps a project at 200 versions, labelled ones
counted: after thinning, a `POST …/versions` or a restore that would make the 201st answers
`413 quota.versions`, and the daily automatic version is skipped. More than six creations per
project per minute answer `429 versions.rate`. `GET …/versions` lists `{ number, label, auto,
created_at, created_by, changed }` (`changed` = paths whose hash differs from the previous
version); `GET …/versions/:n` returns the files; `POST …/versions/:n/restore` makes an
automatic version of the current state and applies the version through the room (`restore`
origin, not undoable: the page treats it as remote).

Alternative: a version per autosave. The owner asked for versions that do not fill the
storage; explicit versions with a daily automatic one are what Google Docs does.

### Images and fonts

`PUT /api/projects/:id/binaries/<path>` (the path checked by the rule) with the bytes, at most
10 MiB, hashes them, stores the blob, writes the `project_blobs` row, and sets the file's path
and hash in the room (`paths` and `binaries` under one id); `DELETE` removes the entry. The
stored `media_type` comes from the magic bytes for PNG, JPEG, GIF, WebP and the fonts woff2,
ttf and otf (`font/woff2`, `font/ttf`, `font/otf`); `image/svg+xml` is accepted only when the
body parses as XML with an `svg` root; anything else is `400 binary.invalid`, whatever
`Content-Type` claims. `GET` and `HEAD /api/projects/:id/blobs/<hash>` answer when
`project_blobs` or `version_files` of the project hold the hash (404 otherwise), the `GET`
streaming the bytes; both carry `Cache-Control: private, max-age=31536000, immutable`,
`Content-Security-Policy: sandbox`, `X-Content-Type-Options: nosniff` and
`Content-Disposition: attachment; filename="<hash>"`, so an SVG with a script opened top-level
executes nothing on the page's origin while `<img>` and the page's own `fetch` still get the
bytes. The URL is scoped to a project so that access is the project's.

### Thumbnails

The page renders the open diagram as a static SVG (the same `produceExport` as the SVG export)
five seconds after the analysis settles, at most once a minute, and `PUT
/api/projects/:id/thumbnail` when its hash changed (at most 200 KiB); the Worker takes one per
thirty seconds per project (`429 thumbnail.rate` beyond it); `GET` serves it as
`image/svg+xml` with `Content-Security-Policy: sandbox` and the list and the drawer show it in
an `<img>`.

### The page

`src/cloud/client.ts` wraps the API (`fetch` to the page's origin, JSON errors to typed
errors). `src/cloud/projects.ts` is the drawer. `src/cloud/room.ts` is the socket: it connects
to `wss://<origin>/rooms/<id>`, speaks the protocol above, reconnects with backoff (1 s
doubling to 30 s), and on a kind 4 answer to a local edit shows the code in the status line,
returns the local text to the room's state and reopens the socket. `src/cloud/persistence.ts`
keeps each document in IndexedDB (`meltemi-cloud`: store `docs` with the encoded state, store
`updates` appended per local transaction and compacted into `docs` on open or past 200
entries), so a project opens from IndexedDB at once, connects, syncs, and keeps working
offline; updates made offline reach the room on reconnect through the normal sync.

A project is opened from the drawer or by address: on load the page reads `project` (and
`invite`, for the sharing change) from `location.search`, opens that project, and keeps the
address as it is, so a reload reopens it; the project's link stays `<origin>/p/<id>`, which the
Worker answers with a 302 to `/?project=<id>` keeping the query (a page served under `/p/`
would break every relative asset URL, and `base-uri 'none'` forbids `<base>`).

`src/cloud/binding.ts` ties a `Y.Doc` to the `Studio` through one interface:

- `StudioListener` gains `change(event)`, `{ kind: "text" | "add" | "delete" | "rename";
  path; from?; before?; after? }`, emitted by `write`, `addFiles`, `deleteFile`, `renameFile`,
  `applyProject` and `load` (today `changed` carries only the path, `files` nothing, and
  `addFiles` and `load` emit nothing). The binding turns a `text` into the minimal `Y.Text`
  delete and insert (common prefix and suffix), an `add` into a new id in `paths` with a
  `Y.Text` or a hash, a `delete` into the removal of the id from the three maps, and a `rename`
  into `paths.set(id, to)`, each inside one transaction with origin `LOCAL`. Local updates are
  coalesced before they leave: merged with `Y.mergeUpdates` and sent every 250 ms at most.
- Remote changes (transactions whose origin is not `LOCAL`) update the Studio through
  `Studio.replaceText(path, text, { remote: true, selection })`, a new method that writes the
  host and emits `text` with that `selection` and without recording history. The binding holds
  the code pane's selection accessor (`playground.code.selection()`), captures it in
  `doc.on("beforeTransaction")` for remote transactions as relative positions of the open text,
  and resolves them after the transaction into the `selection` it passes, so the caret stays on
  the same text; added, removed and renamed ids call `addFiles`, `deleteFile` and `renameFile`
  as remote (the binding ignores its own `change` echoes while it applies a remote transaction);
  binaries fetch their blob and add the bytes.
- Undo: one `Y.UndoManager` per `Y.Text` with `trackedOrigins` `{ LOCAL }` and
  `captureTimeout: 700`, and one over `paths` so that a rename is its own undoable step. The
  binding calls `undoManager.stopCapturing()` before every non-typing local transaction (canvas
  plans, fixes, format, rename, import, file operations) and after a typing transaction that
  deletes text or inserts a line break: `History`'s rule, so a drag followed by typing within
  700 ms undoes separately and Enter ends a step. Each local transaction has a group id written
  to the stack item's `meta` on `stack-item-added`; undoing from the open file pops its item and
  the top items of other files that carry the same group, as `History` does today. `Studio.undo()`,
  `redo()`, `canUndo()` and `canRedo()` delegate to the binding in a cloud project; the header
  buttons read `canUndo` and `canRedo` instead of `history` directly.

Opening a cloud project loads its files into the `MemoryHost`, binds, selects the file the
person last had open in it, and shows the state in the status line: connected and saved,
saving, offline (changes kept here), reconnecting. The anonymous project keeps today's path
untouched: `localStorage`, the previous-project restore, `#p=` links (a link opened while
signed in opens as the anonymous project, with "Save to the cloud" in the drawer).

### Quotas

`CLOUD_LIMITS` in `@meltemi/diagrams-project`, next to `PROJECT_LIMITS`, used by the page (to
refuse before sending) and the Worker (to refuse anyway): 100 projects and 200 MiB per account,
2000 files and 16 MiB of document per project, 2 Mi characters per text file, 10 MiB per
binary, 200 versions per project, 20 clients per room, 512 KiB per message. Errors are `413`
with `quota.projects`, `quota.storage`, `quota.files`, `quota.binary`, `quota.versions`,
`doc.too-large`, `message.too-large`, `room.full`; `400` with `path.invalid`, `blob.unknown`,
`doc.invalid`, `binary.invalid`; `429` with `versions.rate`, `thumbnail.rate`; and the page
shows them in the status line.

### Open decisions

1. **Where readers read.** Alternatives: D1 (`project_files` plus R2, possibly thirty seconds
   stale); the room. Recommended: the room; the Worker's cost is one internal request, and the
   files are always the latest.
2. **Automatic daily version.** Alternatives: none; one per day when changed. Recommended: one
   per day, unlabelled and thinned; it is what people expect when they ask "what did it look
   like yesterday".
3. **Thumbnails.** Alternatives: none; rendered by the page. Recommended: by the page, which
   already has the renderer; the Worker never renders.
4. **The open file.** Alternatives: in the document (synced); per person in the page's
   settings. Recommended: per person; two people may read different files of one project.

## Risks / Trade-offs

- **Rows written and requests.** The one-second throttle, the thirty-second materialisation by
  diff and the page's 250 ms coalescing bound them to a few per second of typing per project;
  the `DEV` stats route and the browser suite's minute of typing make the numbers visible
  (between 20 and 90 storage writes, at most 3 materialisations, at most 60 D1 rows and at most
  300 incoming messages).
- **Eviction during the persistence window.** If the platform evicted an object with a pending
  write, at most one second of edits could be lost (ten seconds for a client that never
  pauses); the clients hold the same updates in IndexedDB and resend them on the next sync, so
  the loss would be transient.
- **Large documents.** 16 MiB of encoded state covers thousands of pages of text and is written
  in 1 MiB chunks under the platform's 2 MB value cap; images and fonts never enter the
  document.
- **Path collisions.** Two devices naming one path offline both keep their files; the rule is
  deterministic and visible, never silent.
- **Two histories.** Cloud projects undo through Yjs, the anonymous one through `History`; the
  grouping rule is the same and both are tested by the same scenarios.
