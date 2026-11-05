# Design

## Context

The hosted endpoint (`packages/cloud/src/mcp/`) defines each tool with `tool({ name, title,
description, scope, input, output, annotations, preview?, run })` (`tool.ts`). `register()` wraps
each `run` the same way:
- it counts the call per account in D1 (`countCall`);
- it checks the scope and the arguments (a lenient schema, so refusals keep their codes);
- it answers `isError` results `{ code, message, … }`;
- it logs `mcp: <name> <ms> ms <code>`.

Every `run(session, args)` acts on the Worker's own dependencies: `op.deps.store`,
`op.deps.rooms` and `op.deps.renderers`. Four tools call the renderer object:
- `preview` → `renderers.render`;
- `validate` and `write_files` (when it writes a `.meltemi` file) → `renderers.validate`;
- `publish` → `renderers.catalog`.

The object's work is platform-free. `renderer-engine.ts` (`PreviewEngine`, from the public
packages `editor`, `assets`, `fonts`, `language`, `layout-elk` and `project`), `renderer-raster.ts`
(resvg-wasm 2.6.2, fitted to four megapixels), `renderer-fonts.ts` and `renderer-files.ts` import
nothing of Cloudflare. Only `renderer-runtime.ts` and `renderer-bundle.js` load the WebAssembly,
fonts and icon packs lazily from the Worker's bundle.

The HTTP API covers every tool's operation (`docs/cloud.md`):
- projects and files: `PUT /api/projects/<id>/files` with `ifRevision` and `Idempotency-Key`;
- blobs and binaries;
- versions, sharing, members, invitations, live sessions and publish.

The command line's `CloudClient` (`packages/cli/src/cloud-client.ts`) already speaks to the
service with the rules a token travels by: one origin, no redirects, `https:` or loopback,
timeouts and body limits. Today it covers session, projects, files, push, blobs, binaries,
versions and publish. The credentials come from `credentials.ts` (`--host`, `MELTEMI_HOST`,
`MELTEMI_TOKEN`, `credentials.json`).

`@modelcontextprotocol/server` 2.3.1 exports `./stdio` (`StdioServerTransport`).
`@modelcontextprotocol/client` 2.3.1 is already a dev dependency of `packages/cloud`, for the
tests and the acceptance suite.

## Goals / Non-Goals

**Goals:**
- One definition of the catalogue and one engine, so the two servers cannot drift.
- Zero renderer-object CPU on the local path. Only HTTP API routes that already run on the
  Free plan for the web app and the command line are used.
- Pictures that are byte-equal between the local server, the renderer object and `mdg export`.

**Non-Goals:**
- No change to how the endpoint does its work, apart from the `renderer.unavailable` refusal.
- No new routes in the HTTP API.
- No local cache of drawings, project files or binaries on disk.

## Decisions

### 1. The local server answers through the HTTP API, not by forwarding to `/mcp`

The local server has its own backend over the HTTP API, and draws, validates and builds
catalogs in its process.

- **Rejected: forwarding every call to the endpoint and overriding `preview` only.** It is the
  least code and keeps the semantics by construction. But `write_files` and `validate` would
  still reach the renderer object, the very CPU this change avoids. Every forwarded call would
  also build the twenty-seven tool server in the Worker per request, which is not measured on
  the Free plan.
- **Rejected: forwarding everything except the four renderer tools.** It still pays the
  per-request server build. It also splits one session between two answerers, with
  rate-limit windows counted only for half the calls.
- **Recommended: a backend over the HTTP API.** It uses only routes the web app and
  `mdg push`/`pull` already exercise on the Free plan.

### 2. The shared code is a new public package, `@meltemi/diagrams-mcp`

The package lives in `packages/mcp`, MIT, with `@modelcontextprotocol/server`, `zod` and
`@resvg/resvg-wasm` as dependencies. Its public interface:

- `CATALOGUE: readonly ToolDefinition[]`: name, title, description, scope, input and output
  schemas, annotations and `preview?`. The definitions are moved verbatim from the four
  `tools-*.ts` files, without `run`.
- `FOLDER_CATALOGUE`: `validate` and `preview` with the folder's schemas (decision 6).
- `type Handlers<C>`: one function per tool name,
  `(context, args: z.output<input>) => Promise<ToolAnswer<z.output<output>>>`.
- `serve(server: McpServer, catalogue, handlers, hooks)`: registers every tool with the wrapper.
  `hooks.beforeCall(definition)` (the Worker counts calls and checks the scope there) and
  `hooks.log(line)` default to nothing and `console.error`.
- `errorResult`, `ApiError`-shaped refusals (`{ code, message, details }`), and the shapes
  (`projectArg`, `pathArg`, `diagnosticSchema`, …).
- `@meltemi/diagrams-mcp/preview`: `PreviewEngine`, `rasterise`, `startRaster`, `RASTER_FACES`,
  `MEASURED_FAMILIES`, `MAX_PNG_WIDTH`, `MIN_PNG_WIDTH`, `MAX_PNG_PIXELS`. It is a subpath, so
  that the Worker keeps importing it only in the renderer object.

The Worker keeps its error codes in `errors.ts` and maps them to statuses. The package's refusal
carries only `{ code, message, details }`, and each side brings its own message table.

Alternatives:
- **The code in `packages/cli`, imported by the cloud.** It avoids a package, but the private
  Worker would then depend on the command line, and the command line on the MCP server SDK for
  a single command.
- **Duplicating the definitions in the CLI.** They would drift, and the "same catalogue" test
  would be the only guard.

**Recommended: the package.** The release scripts go from nineteen packages to twenty.

### 3. Handlers on each side

- **The Worker.** `packages/cloud/src/mcp/handlers.ts` holds today's `run` bodies, keyed by name,
  with `McpSession` as the context. `server.ts` calls `serve(server, CATALOGUE, workerHandlers,
  { beforeCall })`. No behaviour changes beyond decision 9.
- **The command line.**
  - `packages/cli/src/mcp-cloud.ts` holds `cloudHandlers(client: CloudClient, engine:
    LocalEngine)`, and `mcp-folder.ts` holds `folderHandlers(root: string, engine)`.
  - `CloudClient` gains `renameProject`, `restoreVersion`, `createVersion`, `sharing`,
    `setLinkAccess`, `invite`, `invitations`, `revokeInvitation`, `setMemberRole`,
    `removeMember`, `live`, `startLive`, `endLive` and `unpublish`, each a documented route,
    with the client's existing rules.
  - `open_url` builds the app's address with the function the Worker uses, moved to the package.

### 4. Loading the engine in Node

`packages/cli/src/mcp-engine.ts` holds `LocalEngine`, made once per process on the first drawing
call:
- `PreviewEngine` from the package;
- the measured fonts read from `@meltemi/diagrams-fonts` files through its `FontFileReader`;
- the four raster faces;
- resvg's WebAssembly read from `@resvg/resvg-wasm/index_bg.wasm` and given to `startRaster`;
- ELK's main-thread engine.

A `validate` call loads no rasteriser. One promise queue serialises drawing calls (ELK and resvg
are synchronous); the other tools run concurrently.

Binaries are fetched by hash and kept in a 64 MiB in-memory LRU. They are content-addressed, so
an entry is never stale.

### 5. `write_files` from the machine

The sequence:
1. Read the files and the revision (`GET /api/projects/<id>/files`).
2. If the revision equals `ifRevision`, merge the change and validate the written `.meltemi`
   files with `PreviewEngine.validate` (`layout: false`, as the Worker does). Refuse the whole
   call with `diagram.invalid` on an error.
3. Push with `ifRevision` and `Idempotency-Key: <idempotencyKey>`.

If the revision read differs, skip validation and push anyway. The service replays the answer it
kept for the key (a retry after success), or refuses with `409 revision.mismatch`. A push can
never land on another revision, because `ifRevision` is checked by the room.

The key and the route are the ones the endpoint's `write_files` uses
(`PUT /api/projects/<id>/files`, `idempotency.ts`). A key's first answer is therefore replayed
whichever server sent it, provided the body is the same.

Alternative: refusing locally with `revision.mismatch` when the revision moved. That would break
the retry-after-success case, criterion 12.

### 6. The folder mode is a separate catalogue, exclusive with the cloud one

`--folder <dir>` serves `FOLDER_CATALOGUE`: `validate { path? }` and `preview { path, … }`,
without `project`.

- **Rejected: serving both catalogues at once.** The tools would need other names (`validate`
  and `preview` collide). An agent in a repository already has its own file tools for reading
  and writing.
- **Rejected: no folder mode.** It costs two handlers over the same engine, and gives an agent
  in a repository pictures as tool results, without saving and opening files.

**Recommended: the separate catalogue.** Paths are resolved with `isCleanPath` and must stay
under the real path of `<dir>`.

### 7. Start without a sign-in

Without a token, the server starts and each cloud tool answers `auth.required`, naming
`mdg login`.

- **Rejected: exiting at start.** MCP clients show a failed server as a red mark with no reason.

**Recommended: start and answer.** `whoami` says the same. The token is read again at each call,
so `mdg login` in another terminal takes effect without restarting the client.

### 8. No narrowing of what the token can do

An `mdg_` token has every scope on the endpoint too (`mcp-authorization`, "The service's own
tokens on the endpoint"). The client's own approvals follow each tool's annotations, which are
the same.

- **Rejected: `--read-only`.** It would add a second catalogue variant to keep equal.

**Recommended: none.**

### 9. `renderer.unavailable` on the endpoint

Today the Worker turns the object's own outcomes `{ ok: false, code }` into their codes, and any
other throw becomes `internal`. An exception from a renderer stub call (CPU limit exceeded, the
object overloaded or reset) now becomes `renderer.unavailable`, with HTTP status 503 in
`errors.ts` and the message "The server cannot draw or check diagrams right now; `mdg mcp` does
this work on your machine." `write_files` throws it before the push, and the idempotency layer
keeps no answer for a 5xx (`kept()`), so a retry works once the object can answer.

Alternative: falling back to Browser Run. It would make previews work for remote-only clients,
but `validate` and `write_files` do not draw. Ten minutes a day on the Free plan is about three
hundred previews for the whole service, and this would add a second drawing engine. Kept as the
answer if remote-only clients matter before the plan changes.

### 10. Acceptance through stdio

`packages/acceptance/src/mcp/transport.ts` chooses `StreamableHTTPClientTransport` or
`StdioClientTransport` (from `@modelcontextprotocol/client/stdio`).

`--local` spawns `node packages/cli/dist/bin.js mcp` twice. Each process gets its own token in
its environment, `MELTEMI_HOST` set to the URL's origin, and an empty configuration folder, so
no credentials file is read.

A stub-recording proxy is not needed: the "no `/mcp`" check reads the service's own request log
under `wrangler dev`. Against staging, it relies on the unit test with a stub service.

### 11. How agents start it

The docs give:
- `codex mcp add meltemi -- npx -y @meltemi/diagrams-cli@latest mcp`;
- `claude mcp add meltemi -- npx -y @meltemi/diagrams-cli@latest mcp`;
- Cursor's `.cursor/mcp.json` with `command: "npx"` and the same args;
- a global `mdg mcp` for people who installed the command line.

`@latest` follows releases, and `initialize` reports the version that answered. Windows needs
`cmd /c` in front of `npx` for some clients. The task that verifies the commands on the owner's
Windows machine writes what works there.

## Risks / Trade-offs

- **The two servers drift.** The catalogue test compares both `tools/list`. The acceptance
  suite runs the same steps through both. The handlers differ by design, and the steps are what
  holds them to the same behaviour.
- **Node 22.12 or later is needed on the person's machine.** The command line needs it already.
  Without it, the client fails to start the server, and `docs/agents.md` says so and points to
  the URL.
- **A first preview costs seconds.** ELK, the fonts and resvg are loaded once per process. The
  3-second target is benchmarked, and later previews are warm.
- **A new package's first publish.** If the release's npm token cannot create
  `@meltemi/diagrams-mcp`, the npm job fails before any other package is published (the publish
  script checks all twenty first). The owner then creates the package once, or widens the token.
- **The endpoint still depends on the renderer object.** Remote-only clients still get
  `renderer.unavailable` on the Free plan, now with a clear reason. The owner's choice of plan
  stands until it is needed.
- **MPL-2.0 in a public package.** `@resvg/resvg-wasm` ships unmodified as a dependency of
  `@meltemi/diagrams-mcp`. The licence inventory and `THIRD_PARTY_LICENSES.md` name it, as they do
  for the Worker.
