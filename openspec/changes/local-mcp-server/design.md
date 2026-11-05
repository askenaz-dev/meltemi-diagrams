# Design

## Context

The hosted endpoint (`packages/cloud/src/mcp/`) defines each tool with `tool({ name, title,
description, scope, input, output, annotations, preview?, run })` (`tool.ts`). `register()` wraps
each `run` the same way:
- it counts the call per account in D1 (`countCall`);
- it checks the scope and the arguments (a lenient schema, so refusals keep their codes);
- it answers `isError` results `{ code, message, … }`;
- it logs `mcp: <name> <ms> ms <code>`.

`endpoint.ts` serves it over Streamable HTTP, stateless, with `createMcpHandler` of
`@modelcontextprotocol/server` 2.3.1 (`legacy: "stateless"`, `responseMode: "auto"`): a server is
built for each request, the 2025 revisions are answered as an event stream and the 2026-07-28
revision as JSON. The door (`routes/mcp.ts`) answers `403` to a foreign `Origin` and `405` to any
method but `POST`, and `endpoint.ts` answers `400` to a protocol version the SDK does not serve
and `413` to a body over 24 MiB.

Every `run(session, args)` acts on the Worker's own dependencies: `op.deps.store`,
`op.deps.rooms` and `op.deps.renderers`. Four tools call the renderer object:
- `preview` → `renderers.render`;
- `validate` and `write_files` (when it writes a `.meltemi` file) → `renderers.validate`;
- `publish` → `renderers.catalog`.

The object's work is platform-free. `renderer-core.ts` (`RendererCore`, the cache rules),
`renderer-engine.ts` (`PreviewEngine`, from the public packages `editor`, `assets`, `fonts`,
`language`, `layout-elk` and `project`), `renderer-protocol.ts`, `renderer-raster.ts` (resvg-wasm
2.6.2, fitted to four megapixels) and `renderer-fonts.ts` import nothing of Cloudflare, apart from
the SQLite cache's type. Only `renderer-runtime.ts` and `renderer-bundle.js` load the
WebAssembly, fonts and icon packs lazily from the Worker's bundle. The Node tests already draw
with the same engine over the installed packages (`test/support/renderer.ts`).

The HTTP API covers almost every tool's operation (`docs/cloud.md`):
- projects and files: `PUT /api/projects/<id>/files` with `ifRevision` and `Idempotency-Key`;
- blobs and binaries;
- versions, sharing, members, invitations, live sessions and publish.

Two answers are missing: a token's session answers no email (`whoami` gives it), and no route
lists the account's publications (`list_publications` without a project).

The command line's `CloudClient` (`packages/cli/src/cloud-client.ts`) already speaks to the
service with the rules a token travels by: one origin, no redirects, `https:` or loopback,
timeouts and body limits. Today it covers session, projects, files, push, blobs, binaries,
versions and publish. The credentials come from `credentials.ts` (`--host`, `MELTEMI_HOST`,
`MELTEMI_TOKEN`, `credentials.json`).

`@modelcontextprotocol/server` 2.3.1 also exports `hostHeaderValidationResponse` and
`localhostAllowedHostnames`, the DNS-rebinding guard the SDK recommends in front of a bare
handler. `@modelcontextprotocol/client` 2.3.1 is already a dev dependency of `packages/cloud`
and `packages/acceptance`, for the tests and the acceptance suite.

## Goals / Non-Goals

**Goals:**
- One definition of the catalogue, one call wrapper, one HTTP handler and one engine, so the two
  servers cannot drift.
- Zero renderer-object CPU on the local path. Only HTTP API routes that already run on the
  Free plan for the web app and the command line are used, plus the two answers added here.
- Pictures that are byte-equal between the local server, the renderer object and `mdg export`.

**Non-Goals:**
- No change to how the endpoint does its work, apart from the `renderer.unavailable` refusal.
- No local cache of drawings, project files or binaries on disk.
- No stdio transport, and no listener on another interface than the loopback.

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

### 2. Streamable HTTP on the loopback, as the endpoint serves it

`mdg mcp` is a long-running server: Node's `node:http` listens on `127.0.0.1` at a port
(`--port`, 7373 by default; `0` picks a free one). Each request is turned into a web `Request`,
answered by the same stateless handler the Worker uses, and its `Response` streamed back. The
server's first line on standard output is its address, `http://127.0.0.1:<port>/mcp`; its logs go
to standard error. It stops on `SIGINT` or `SIGTERM` with exit code 0, and a port in use is exit
code 2 with `mcp.port-in-use`.

- **Rejected: stdio.** The agent would start the server itself, which saves the person a
  terminal. But the owner chose Streamable HTTP, the hosted endpoint's transport: one transport
  to test, the same client configuration by URL in every agent, and one server that several
  agents of the machine share.
- **Rejected: both transports.** Two transports to keep equal, for the same tools.

**Recommended: Streamable HTTP only**, stateless, `POST` only. The person starts the server
(`npx -y @meltemi/diagrams-cli@latest mcp`) and keeps it running while the agent works; the docs
say so, and an agent whose server is not running sees its client's own connection error.

### 3. Only this machine reaches it

A server on the loopback is still reachable by every web page the person opens (through
DNS rebinding, or a form posted to `127.0.0.1`) and by every account of the machine. In this
order, before the SDK reads anything:

1. The listener binds `127.0.0.1` only; nothing else is offered.
2. A request whose `Host` is not a loopback name (`127.0.0.1`, `localhost`, `[::1]`, any port) is
   `403`, with the SDK's `hostHeaderValidationResponse`. A rebinding page names its own host.
3. A request with an `Origin` other than the server's own address (`http://127.0.0.1:<port>` or
   `http://localhost:<port>`) is `403`. This is stricter than the SDK's
   `localhostAllowedOrigins`, which admits a page served from any port of the machine.
4. When `MELTEMI_MCP_KEY` is set (16 characters or more), a request without
   `Authorization: Bearer <key>` is `401`, compared in constant time.
5. A path other than `/mcp` is `404`, a method other than `POST` is `405` with `Allow: POST`, a
   protocol version the SDK does not serve is `400` and a body over 24 MiB is `413`, as the
   endpoint answers them.

Without the key, any account of the machine can call the tools as the signed-in person. That
holds for the credentials file too, which the command line protects by its folder's permissions
only; the key closes it for a machine people share, and the docs say when to set it.

Alternative: a key always, generated on first start. Every agent's configuration would then
need it, and a personal machine gains nothing from it.

### 4. The shared code is a new public package, `@meltemi/diagrams-mcp`

The package lives in `packages/mcp`, MIT. Its dependencies are `@modelcontextprotocol/server`,
`zod`, `@resvg/resvg-wasm` and the public packages the engine uses. Its interface:

- `.`:
  - `TOOLS`, the twenty-seven definitions by name (title, description, scope, input and output
    schemas, annotations, `preview?`), moved verbatim from the four `tools-*.ts` files without
    `run`, and `CATALOGUE`, the same in the catalogue's order;
  - `FOLDER_TOOLS` (decision 9), `SERVER_NAME`, `instructions(origin)` and
    `folderInstructions()`;
  - `buildServer(info, catalogue, handlers, hooks)`, which registers every tool with the wrapper
    on a new `McpServer`. `hooks.beforeCheck(definition)` (the Worker counts the call and checks
    the scope there), `hooks.beforeRun(definition)` (the Worker counts a preview there),
    `hooks.refusal(error)` (each side turns its own errors into refusals), `hooks.log(line)` and
    `hooks.checkOutput`;
  - `statelessHandler(factory)`, the endpoint's `createMcpHandler` call, and `refusedVersion`,
    `rpcError` and `MAX_MCP_BYTES`;
  - `Refusal` (`{ code, message, details }`), `errorResult` and the shapes (`projectArg`,
    `pathArg`, `diagnosticSchema`, …), `appUrl(origin, id)`, `toBase64` and `fromBase64`.
- `./preview`: `RendererCore`, `memoryPreviewCache`, `PreviewEngine`, `rasterise`, `startRaster`,
  `RASTER_FACES`, `MEASURED_FAMILIES`, the protocol's types and bounds. It is a subpath, so that
  the Worker keeps importing the engine only in the renderer object.
- `./node`: `nodeRenderer()`, the core over the engine whose fonts, assets and raster faces are
  read from the installed packages (`createNodeFontReader`, `createNodeAssetReader`, resvg's
  `index_bg.wasm`), only the four measured families' files given to it, as the bundle gives them.

The Worker keeps its error codes in `errors.ts` and maps them to statuses. A refusal of the
package carries only `{ code, message, details }`.

The `idempotencyKey` argument's pattern is the Worker's `IDEMPOTENCY_KEY`. The package holds its
own copy, and a test compares the two: importing the package from `idempotency.ts` would evaluate
the SDK in every isolate, which the endpoint's door avoids today.

Alternatives:
- **The code in `packages/cli`, imported by the cloud.** It avoids a package, but the private
  Worker would then depend on the command line, and the command line on the MCP server SDK for
  a single command.
- **Duplicating the definitions in the CLI.** They would drift, and the "same catalogue" test
  would be the only guard.

**Recommended: the package.** The release scripts go from nineteen packages to twenty.

### 5. Handlers on each side

- **The Worker.** Each `tools-*.ts` file keeps its `run` bodies, each attached to the package's
  definition with `implement(TOOLS.<name>, run)`. `server.ts` builds the handlers for the
  request's session and calls `buildServer(…, CATALOGUE, handlers, { beforeCheck, beforeRun,
  refusal })`. No behaviour changes beyond decision 11.
- **The command line.**
  - `packages/cli/src/mcp-cloud.ts` holds `cloudHandlers(api, engine)`, typed by the
    definitions, so a tool without a handler does not compile; `mcp-folder.ts` holds
    `folderHandlers(root, engine)`.
  - `CloudClient` gains `call(method, path, { json?, idempotencyKey? })`, which answers the
    status and the JSON of any documented route with the client's existing rules; blobs are read
    with its existing `blob`, which checks their hash.
    Each handler shapes the route's answer into the tool's output, and the wrapper checks it
    against the output schema (`checkOutput`), so a route that answers another shape is
    `internal` rather than a wrong result.
  - `open_url` builds the app's address with `appUrl`, the function the Worker uses.

### 6. Loading the engine in Node

`packages/cli/src/mcp-engine.ts` holds `LocalEngine`, made once per process on the first drawing
call from `nodeRenderer()` of the package, with the core's in-memory cache of twenty answers. A
`validate` call loads no rasteriser.

One promise queue serialises the drawing calls (ELK and resvg are synchronous); the other tools
run concurrently.

Binaries are fetched by hash and kept in a 64 MiB in-memory LRU. They are content-addressed, so
an entry is never stale. The same choice of binaries as the Worker's `drawingBinaries` (every
font under `assets/fonts/`, and every other file whose name a text mentions, 24 MiB in all)
keeps the pictures equal.

### 7. `write_files` from the machine

The sequence:
1. Read the files and the revision (`GET /api/projects/<id>/files`).
2. Merge the change and validate the written `.meltemi` files with the engine (`layout: false`,
   as the Worker does). If the revision equals `ifRevision` and there is an error, refuse the
   whole call with `diagram.invalid`.
3. Push with `ifRevision` and `Idempotency-Key: <idempotencyKey>`, and answer the revision and
   the warnings.

If the revision read differs, a refusal is not decided locally: the push goes, and the service
replays the answer it kept for the key (a retry after success), or refuses with
`409 revision.mismatch`. A push can never land on another revision, because `ifRevision` is
checked by the room.

The key and the route are the ones the endpoint's `write_files` stands for
(`PUT /api/projects/<id>/files`, `idempotency.ts`).

Alternative: refusing locally with `revision.mismatch` when the revision moved. That would break
the retry-after-success case, criterion 12.

### 8. The two additions to the HTTP API

- `GET /api/session` with a token answers `user.email`, the account's own address from the store,
  as `whoami` answers it on the endpoint. A cookie's answer is unchanged.
- `GET /api/account/publications` answers `accountPublications`: the handle and every
  publication of the account's projects, each with its project. It needs a principal, like every
  `/api/account/*` route.

Alternative for the second: asking `GET /api/projects/<id>/publish` for each owned project. It is
one request a project, and the account's projects can be many.

### 9. The folder mode is a separate catalogue, exclusive with the cloud one

`--folder <dir>` serves `FOLDER_TOOLS`: `validate { path? }` and `preview { path, … }`, without
`project`.

- **Rejected: serving both catalogues at once.** The tools would need other names (`validate`
  and `preview` collide). An agent in a repository already has its own file tools for reading
  and writing.
- **Rejected: no folder mode.** It costs two handlers over the same engine, and gives an agent
  in a repository pictures as tool results, without saving and opening files.

**Recommended: the separate catalogue.** Paths are resolved with `isCleanPath` and must stay
under the real path of `<dir>`.

### 10. Start without a sign-in

Without a token, the server starts and each cloud tool answers `auth.required`, naming
`mdg login`.

- **Rejected: exiting at start.** An agent would see a server that is not there, with no reason.

**Recommended: start and answer.** The token is read again at each call, so `mdg login` in
another terminal takes effect without a restart. An `mdg_` token has every scope on the endpoint
too, so the local server narrows nothing; the client's approvals follow each tool's
annotations, which are the same.

### 11. `renderer.unavailable` on the endpoint

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

### 12. Acceptance through the local server

`--local` starts `node packages/cli/dist/bin.js mcp --port 0` twice, reads each address from its
first line, and points the suite's two agents at them over the same `StreamableHTTPClientTransport`
it uses for the endpoint, with no bearer. Each process gets its own token in its environment,
`MELTEMI_HOST` set to the target's origin, and an empty configuration folder, so no credentials
file is read. The OAuth steps are skipped with their reasons.

The "no `/mcp`" check reads the service's own request log under `wrangler dev`. Against staging,
it relies on the unit test with a stub service.

### 13. How agents connect

The docs give, after `npx -y @meltemi/diagrams-cli@latest mcp` (or a global `mdg mcp`) is
running:
- `codex mcp add meltemi --url http://127.0.0.1:7373/mcp`;
- `claude mcp add --transport http meltemi http://127.0.0.1:7373/mcp`;
- Cursor's `.cursor/mcp.json` with `"url": "http://127.0.0.1:7373/mcp"`;
- with `MELTEMI_MCP_KEY`, the bearer each client sends (`--bearer-token-env-var` for Codex,
  `--header` for Claude Code).

`@latest` follows releases, and `initialize` reports the version that answered. The address is
`127.0.0.1`, not `localhost`, because the server does not listen on `::1`.

## Risks / Trade-offs

- **The two servers drift.** The catalogue test compares both `tools/list`. The acceptance
  suite runs the same steps through both. The handlers differ by design, and the steps are what
  holds them to the same behaviour.
- **The person has to start the server.** An agent cannot start it over HTTP. The docs put the
  command first, and the error an agent reports names the address it could not reach.
- **Another program holds port 7373.** The server exits 2 naming the port and `--port`; the
  agent's configuration then names the other port.
- **Node 22.12 or later is needed on the person's machine.** The command line needs it already.
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
