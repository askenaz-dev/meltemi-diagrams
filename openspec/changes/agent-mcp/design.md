# Design

## Context

The Worker (`packages/cloud`) is one script, one origin: a handler of plain functions over
`(request, env, deps)` (`worker-handler.ts`, `routes/*`), a principal per request (`principal.ts`:
`via: "token"` for `mdg_` tokens, `via: "cookie"` for the identity cookie), role checks per
project (`access.ts`, `project-sharing` "The role each route needs"), the `ProjectRoom` Durable
Object holding each project's latest state (readers read from it; a push is a transaction with
origin `push` that every connected page receives), D1, R2, the Secrets Store bindings, and the
assets of the page with `run_worker_first` for the paths the code answers. Pushes already carry
`ifRevision` (`409 revision.mismatch`), bodies are capped, errors are JSON with stable codes, and
nothing logs a token. The command line is the first client of all of it, with `mdg login`
through `/cli-auth`, a consent page served with the cookie and signed with `FORMS_SECRET`. The
engine that draws is pure TypeScript: `project` resolves imports, `model` compiles, `layout-elk`
lays out with `elkjs`, `render` writes SVG with the fonts of `fonts` (four bundled families
measured and embeddable; thirteen Fontsource families; others estimated with
`layout.unmeasured-font`); the command line captures PNG and PDF in a browser, the page draws on
a canvas. The MCP specification (2025-06-18, with 2025-11-25 cited by OpenAI): one endpoint,
POST with `Accept: application/json, text/event-stream`, `MCP-Protocol-Version`, `Origin`
validated, authorization optional but, when present, OAuth 2.1 with PKCE, RFC 9728 resource
metadata, RFC 8414 server metadata, RFC 7591 registration SHOULD, the `resource` parameter
MUST and bound to the token's audience, `401` with `WWW-Authenticate` naming the metadata, `403`
for scopes, no token passthrough. Codex adds a remote server with `codex mcp add <name> --url`,
defaults to OAuth (CIMD or DCR, loopback callback `http://127.0.0.1/callback`), takes
`bearer_token_env_var`, and documents nothing about image results. Cloudflare's `agents`
package gives `createMcpHandler(factory, { route, corsOptions, allowedOriginHostnames })`, a
stateless Streamable HTTP handler over `@modelcontextprotocol/server`;
`@cloudflare/workers-oauth-provider` gives `OAuthProvider({ apiRoute, apiHandler,
defaultHandler, authorizeEndpoint, tokenEndpoint, clientRegistrationEndpoint, scopesSupported,
resourceMetadata })` over a KV namespace `OAUTH_KV`, with `parseAuthRequest`,
`completeAuthorization({ request, userId, metadata, scope, props })`, encrypted props handed to
the API handler as `ctx.props`, PKCE and `resource` validated, CIMD behind the
`global_fetch_strictly_public` flag. Workers Free: 10 ms of CPU per request; Durable Objects:
30 s per request on every plan (to be confirmed on the first deploy, the risk below); Browser
Run free: 10 minutes a day. See proposal.md for the motivation.

## Goals / Non-Goals

**Goals:**

- One door for agents, with the service's own rules behind it: roles per project, quotas,
  caps, stable error codes, nothing logged that grants access.
- Previews that are the command line's pictures, drawn where the project lives.
- Every criterion of the specification's section 13 either run by a script or written as a
  procedure with evidence, on staging before production.

**Non-Goals:**

- Sessions on the endpoint (`Mcp-Session-Id`): every call stands alone and is authenticated.
- A second authorization server for the page or the command line: the cookie and `mdg_`
  tokens stay as they are.
- Rendering in the Worker's request path or in the room object.

## Decisions

1. **The handler and the routes.** `routes/mcp.ts` builds the server with
   `createMcpHandler(createServer, { route: "/mcp", corsOptions: false,
   allowedOriginHostnames: [the service's host] })`; `createServer(ctx)` registers the tools
   with `zod` schemas, `serverInfo { name: "meltemi-diagrams", version }` and `instructions`
   (three sentences: what the tools do, write then validate then preview, the skill's address).
   Each tool calls the same functions the HTTP routes call (`routes/projects.ts`,
   `routes/sharing.ts`, `routes/live.ts`, `routes/publish.ts`, refactored where needed so a
   route is a thin reader of the request over an operation that takes a principal and typed
   input) with a principal `{ via: "oauth", sub, scopes, clientId }` or the `mdg_` principal
   (`via: "token"`, every scope). `/mcp`, `/oauth/*` and `/.well-known/*` join
   `run_worker_first`. Alternatives: `McpAgent` over Durable Objects (deprecated by Cloudflare,
   stateful for nothing we need); the SDK's transport by hand (the handler is the documented
   way and validates `Origin` and versions for us).

2. **The catalogue.** Twenty-six tools, snake_case, inputs and outputs as the HTTP shapes with
   the same names (`revision`, `files`, `binaries`, `role`, `link`, `until`), ids never guessed:
   every project tool takes `project` (the id), file tools take paths, `open_url` answers
   `https://diagrams.meltemi.dev/?project=<id>` (and `#file=<path>` when the app's address
   takes it, `web-playground`), `whoami` answers the account, its usage and limits. Annotations:
   `readOnlyHint` on `whoami`, `list_*`, `get_*`, `read_files`, `validate`, `preview`,
   `open_url`; `destructiveHint` on `restore_version`, `remove_member`, `revoke_invitation`,
   `end_live`, `unpublish`, `set_link_access` to `none`; `idempotentHint` on `create_project`
   and `write_files` (with a key) and every setter. Results carry `structuredContent` and the
   same JSON as text; errors are `isError` results with `{ code, message, …fields }` using the
   service's codes (`revision.mismatch` carries the current `revision`; `quota.*` the limit;
   `project.not-found` says nothing more). `write_files` compiles every `.meltemi` of the push
   with the project's other files through `project` and refuses errors with the diagnostics
   (`diagram.invalid`), warnings allowed; the HTTP push keeps accepting any text, since the page
   pushes while a person types. `invite` answers `{ invitation, link, emailSent: false }` in so
   many words. `publish` answers the public address and reads it back once (`HEAD`) before
   answering, so the tool's answer is a URL that served.

3. **Idempotency in the API.** Migration `0008_idempotency.sql` adds `idempotency (sub, key,
   route, request_hash, status, body, created_at)` with the primary key `(sub, key)`;
   `POST /api/projects` and `PUT /api/projects/<id>/files` read `Idempotency-Key` (1 to 64
   visible ASCII characters) and, in the same D1 batch as the change, store `(status, body)`;
   a repeat with the same key and the same request hash answers the stored answer with
   `Idempotent-Replayed: true`, a repeat with another hash `409 idempotency.mismatch`; rows are
   swept after 24 hours by the weekly collection's hourly sibling. The MCP tools forward
   `idempotencyKey` as the header. Alternative: idempotency in the tools alone (the command line
   and other clients would not have it; the table is the same work).

4. **The authorization server.** `OAuthProvider` from `@cloudflare/workers-oauth-provider`
   wraps the Worker's `fetch`: `apiRoute: "/mcp"`, `apiHandler` the MCP handler, `defaultHandler`
   the existing handler, `authorizeEndpoint: "/oauth/authorize"`, `tokenEndpoint:
   "/oauth/token"`, `clientRegistrationEndpoint: "/oauth/register"`,
   `clientIdMetadataDocumentEnabled: true` (flag `global_fetch_strictly_public`),
   `scopesSupported: ["projects:read", "projects:write", "sharing", "live", "publish",
   "offline_access"]`, `resourceMetadata: { resource: "<origin>/mcp" }`, `accessTokenTTL`
   3600 s, refresh tokens rotated, state in `OAUTH_KV` (a KV namespace Terraform declares, one
   per environment). `GET /oauth/authorize` is ours: `parseAuthRequest`, then the identity
   cookie (a signed-out person is sent to `IDENTITY_ISSUER/login` with `return_to` the same
   address) and a consent page like `/cli-auth`'s (the client's name and its id's host, each
   scope in words, Approve and Deny, `csrf` signed with `FORMS_SECRET`, in the interface
   language); `POST` calls `completeAuthorization({ userId: sub, metadata: { client name,
   approved at }, scope, props: { sub } })` and redirects. `/.well-known/oauth-protected-resource`
   answers `{ resource, authorization_servers: [origin], scopes_supported, bearer_methods_supported:
   ["header"] }`; a request to `/mcp` without a valid token answers `401` with `WWW-Authenticate:
   Bearer resource_metadata="<origin>/.well-known/oauth-protected-resource"`, a token short of a
   tool's scope answers the tool's `403 scope.insufficient` naming the scope. An `mdg_` token on
   `/mcp` resolves as today (`principal.ts`) with every scope; an OAuth token on `/api/*` is
   `401 token.invalid` (the provider validates only `apiRoute`). Scope per tool: reads
   `projects:read`, writes `projects:write`, sharing tools `sharing`, live tools `live`, publish
   tools `publish`. Alternatives: an authorization server of our own in D1 (the whole of OAuth
   2.1 to write and test; the library is what the specification's references prescribe);
   tokens with audience `/api` as well (the specification binds a token to one resource).

5. **Connected apps.** `GET /api/session` adds, in the cookie shape, nothing; the account panel's
   new section **Connected apps** reads `GET /api/account/apps` (`{ grants: [{ id, client:
   { name, uri }, scopes, createdAt, lastUsedAt }] }`, from `OAUTH_PROVIDER.listUserGrants`) and
   revokes with `DELETE /api/account/apps/<id>` (`revokeGrant`; its tokens die at once), cookie
   and `Origin` rule only, as the identity data routes. Nothing lists a token or a code.

6. **The renderer object.** A second Durable Object class of the cloud Worker, `ProjectRenderer`
   (`src/renderer.ts`), keyed by project id (`RENDERERS` binding, SQLite-backed, its own migration
   `v2`). The Worker calls it through RPC (`renderer-client.ts`):
   `render(projectId, { revision, files, binaries?, file, diagram? | story?, at?, format, width?,
   theme? })`, with the files of the room's snapshot at `revision` (as `GET …/files` reads them)
   and the bytes of the images and fonts they use, fetched from R2 by the caller; it answers
   `{ ok: true, contentType, bytes, report, cached }` or `{ ok: false, code: "request.invalid" |
   "diagram.invalid", message, diagnostics? }`, never an exception (a file with an error is
   `diagram.invalid` with its diagnostics). `report` is `{ revision, format, width, height,
   elements, relations, diagnostics, estimatedFonts, truncated, fitted? }`: `truncated` when the
   diagnostics were more than fifty, `fitted` when a PNG was drawn narrower. The rules live in
   `renderer-core.ts` and `renderer-engine.ts`, with nothing of the platform: the engine builds
   `ProjectSessions` of `@meltemi/diagrams-editor` over `createMemoryHost` and calls
   `produceExport` with the command line's own request for `export <file> --fonts system`, so the
   SVG is the command line's byte for byte (`test/renderer.test.ts` compares 34 diagrams of the
   acceptance corpus's four profiles and a story frame). ELK is `elk-worker.min.js`'s
   main-thread dispatcher, evaluated with a `document` present so that it does not start as a web
   worker on the Worker's `self`. The font library, the icon packs and ELK are made once per object
   (a project with fonts of its own gets a library for each drawing). Measurement uses the files
   the command line's library reads for Inter, IBM Plex Sans, Cascadia Mono and Patrick Hand; the
   thirteen Fontsource families are measured with the bundled fallback (their SVG differs from the
   command line's, which measures them) and named in `estimatedFonts`. A PNG is rasterised by
   `@resvg/resvg-wasm` 2.6.2 (MPL-2.0, unmodified) at `width` (1280 by default, 16 to 2048) within
   four megapixels, with four faces bundled as data modules: the Latin WOFF of Inter 400 and 600,
   Cascadia Mono 400 and Patrick Hand 400, made TrueType in memory with their typographic family
   written so that `Inter` at 600 finds its face (Fontsource names it `Inter SemiBold`); IBM Plex
   Sans, measured exactly, is drawn with Inter and named in a PNG's `estimatedFonts`; a project's
   own TrueType, OpenType or WOFF fonts are drawn with. The icon packs (Tabler, the five provider
   packs) and the built-in library are text modules. The bundled files and resvg are imported when
   the object first draws (`renderer-bundle.js`, generated by `pnpm cloud:renderer-bundle`), so an
   isolate that never draws never instantiates them. The cache keeps the last twenty answers by
   `(revision, file, diagram, story, at, format, width, theme)` in the object's SQLite, the least
   recently used dropped first, the bytes in chunks of 1 MiB; a hit answers the same bytes and
   draws nothing. The Worker enforces 30 previews a minute per account (`429 rate.limited`) and the
   engine's safety limits apply as in the command line (task 3.2). The tool returns `image` content
   (`image/png`, base64) plus the report as text and `structuredContent`; `format: "svg"` returns
   the SVG as text. Measured on 2026-11-04 (`docs/performance.md`, "The hosted renderer"): the
   Worker goes from 0.75 to 22.51 MiB (7.37 MiB gzip) against the 64 MiB uncompressed the Free plan
   allows, its local startup from 27 to 36 ms against 1 s; under `wrangler dev` an object's cold
   start (its first SVG) takes 546 ms, the corpus's costliest diagram 68 ms to SVG, 86 ms to a PNG
   of 1280 and 102 ms of 2048, the costliest PNG (four megapixels) 174 ms, a cache hit 14 ms, all
   within the 30 s of CPU Cloudflare documents for a Durable Object's request. Alternatives:
   Browser Run (ten minutes a day on the Free plan, a browser per preview; kept as the fallback for
   PDF, which no tool offers, and for previews if the Free plan holds a Durable Object to 10 ms);
   rendering in the request path (10 ms of CPU on the Free plan); the room object (its event loop
   serves collaborators); SVG only (Codex's handling of SVG as an image is undocumented; PNG is the
   common denominator); a Worker of its own for the class, reached with a Durable Object binding
   with `script_name` (the bundle fits, so it is the step to take only if the bundle or an
   isolate's memory presses; Meltemi Web's Terraform would then declare one more entry of
   `local.workers`, without a domain, deployed before the cloud Worker); `POST /render` over
   `fetch` (RPC carries the bytes and the typed answer without an encoding of its own).

7. **The acceptance suite.** `packages/acceptance/src/mcp/run.ts` connects with
   `@modelcontextprotocol/client` to `MELTEMI_MCP_URL` with `MELTEMI_TOKEN` (an `mdg_` token of
   a test account) and runs the criteria 2 to 6, 10 to 23 and 24 to 29 as named steps (a second
   token of a second test account for 24 to 26; 27 and 28 against the authorization server with a
   registered client of the suite's own, DCR and PKCE, a token with a wrong `resource`, an
   expired one, a revoked grant), each step creating what it needs under a name prefixed
   `mcp-acceptance-` and deleting it at the end (`DELETE /api/projects/<id>` over HTTP, since no
   tool deletes), writing `results.json` with the step, the criterion, the outcome, the
   durations and the versions, never a token or a link; criterion 29 greps the run's log for
   `mdg_`, `Bearer `, `?invite=`, `?live=` and the authorization code. Criteria 1, 7, 8, 9 and the
   voice half of 16 are a procedure in `docs/quality/mcp-acceptance.md` with the Codex version,
   the configuration used and screenshots of the evidence folder. The deploy workflow runs the
   suite against staging after its deploy and before production's, with the `staging`
   environment's `MELTEMI_TOKEN` and `MELTEMI_TOKEN_2`, and against production after, with
   `production`'s, uploading `results.json` as an artifact; a red staging run stops the
   production deploy (the previous version stays), a red production run fails the workflow and
   the reversal is `workflow_dispatch` with the previous approved `ci_run_id`.

8. **Staging.** The deploy writes `wrangler.staging.deploy.json` from `wrangler.jsonc` with the
   staging ids (`deploy-config.mjs` with the `staging` environment's variables: D1, R2, KV, the
   Secrets Store names suffixed `_STAGING`, `ORIGIN` `https://staging.diagrams.meltemi.dev`,
   `PUBLISH_HOST` `staging.meltemi.page`), applies migrations and uploads `meltemi-diagrams-staging`
   and `meltemi-diagrams-publish-staging` first; the resources themselves are `meltemi-web`'s
   change `diagrams-staging`.

9. **What the skill and the docs say.** `skills/meltemi-diagrams/references/mcp.md` (copied
   into the agent folders by `pnpm skills:sync`): the connection (`codex mcp add meltemi --url
   https://diagrams.meltemi.dev/mcp`, `codex mcp login meltemi`, or `bearer_token_env_var =
   "MELTEMI_TOKEN"`), the tools, the workflow write then validate then preview then open_url,
   `ifRevision` on every write after a read, an `idempotencyKey` per logical change, never
   claiming an email was sent, never printing a token or a link that grants access;
   `docs/agents.md` the same for people; `docs/cloud.md` the endpoint, the authorization
   server, the renderer, Connected apps and the staging host; `docs/security.md` the rule that
   an OAuth token is bound to `/mcp` and a `mdg_` token opens both.

10. **The decision note.** `docs/decisions/0072-agent-mcp.md`: the endpoint in the same Worker,
    the library for the authorization server and its KV, the renderer object and why not the
    browser, idempotency in the API, the suite as the gate, what stays out.

## Risks / Trade-offs

- [A Durable Object's CPU limit on the Free plan is 10 ms, not 30 s] → Cloudflare's limits page
  (updated 2026-10-29) gives 30 s a request, configurable to 5 minutes, with no figure for the
  Free plan apart, and its FAQ says Durable Objects have the CPU limits of any Worker. Measured
  under `wrangler dev` on 2026-11-04 with the corpus's costliest diagram (`flow/thirty`): a cold
  start of 546 ms, 68 ms to SVG, 102 ms to a PNG of 2048, 174 ms for a PNG of four megapixels;
  within 30 s with room, far over 10 ms (even a warm SVG). Confirmed on the first staging deploy
  with the same diagram; if 10 ms applies, the renderer moves to Browser Run (the fallback, ten
  minutes a day, some 300 previews) and the plan is revisited; the preview tool's contract is the
  same.
- [The Worker's bundle grows (elkjs, resvg's wasm, the fonts and icons)] → measured: 0.75 to
  22.51 MiB uncompressed (7.37 MiB gzip) against the Free plan's 64 MiB, with no compressed limit;
  a local startup of 27 to 36 ms against 1 s. The fonts, icons and resvg are imported by the object
  only, when it first draws; the renderer's JavaScript (5.80 MiB of the Worker's) is parsed by
  every isolate. If the bundle or an isolate's memory (128 MB) ever presses, the class moves to a
  Worker of its own reached with `script_name`, one more entry of Meltemi Web's `local.workers`.
- [Codex does not display PNG results] → the report beside the image is complete enough to act
  on; criterion 9 is verified in the real Codex, as the specification demands, and the
  procedure records what it shows.
- [`@cloudflare/workers-oauth-provider` changes its storage schema] → pinned; its KV is per
  environment and nothing else reads it.
- [A client registered by DCR floods the KV] → registration rate limited per address (ten an
  hour) with `FORMS_SECRET`'s keyed hash as the live sessions' places are.
- [The test accounts' tokens in the environments] → two `mdg_` tokens of two dedicated accounts,
  stored as environment secrets by the owner, revocable from the page; the suite never prints
  them.
- [Pushes with errors from other clients] → unchanged; only the tool validates, as the proposal
  says.
