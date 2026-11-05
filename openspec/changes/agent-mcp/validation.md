# Validation

Stage 1 of the change (tasks 1.1 to 1.5 and 3.2), run on 5 November 2026 on Windows 11 in the
worktree of branch `agent-mcp`, from `agent-mcp-renderer` at `4c413e1` with `origin/main` merged at
`80ccdb9`. Browsers: the suites' headless Microsoft Edge 156. Node 24.15.

## Gates

| Check                                | Result                                         |
| ------------------------------------ | ---------------------------------------------- |
| `pnpm install --frozen-lockfile`     | green                                          |
| `pnpm typecheck`                     | green                                          |
| `pnpm lint`                          | green (ESLint and Prettier)                    |
| `pnpm test`                          | 343 files, 10244 passed, 1 skipped             |
| `pnpm licenses:inventory --check`    | current (44 packages)                          |
| `pnpm cloud:test-browser`            | BROWSER_RESULT                                 |
| `openspec validate "agent-mcp" --strict` | valid                                      |

`pnpm test` was run before `test/migration-idempotency.test.ts` was added (12 tests, green on their
own); the cloud package's tests were run again with it.

## Evidence by task

- 1.1: `packages/cloud/package.json` pins `@modelcontextprotocol/server` 2.3.1 and `zod` 4.6.7
  (published 2026-10-12, the latest 4.6 patch older than two weeks), and `@modelcontextprotocol/client`
  2.3.1 as a dev dependency; the lockfile resolves every `zod` of the SDK to 4.6.7. Licences:
  `THIRD_PARTY_LICENSES.md` lists `@modelcontextprotocol/core` and `@modelcontextprotocol/server`
  2.3.1 (Apache-2.0, with a note) and `zod` 4.6.7 (MIT); `@resvg/resvg-wasm` stays MPL-2.0. The
  Worker's bundle (`wrangler deploy --dry-run`) takes the SDK's workerd shim (no `ajv`, no
  `node:process`).
- 1.2: the routes of projects, files, binaries, versions, sharing, live sessions and publishing read
  the request and call `src/operations/` (`projects.ts`, `files.ts`, `versions.ts`, `sharing.ts`,
  `live.ts`, `publish.ts`), which take the operation's context (with its principal) and an input
  whose fields they check. The existing route tests ran unchanged and green after the refactor
  (3642 then, before the merge of `origin/main`); the tests that changed are audits of facts the
  change moves: the deletion's batch and the every-statement audit of `d1.test.ts` (two more
  tables), the migrations' numbering (0007 is another change's, 0008 this one's), the development
  flag now read in `operations/publish.ts`, the routes without a principal (`POST` and `DELETE
  /mcp`), `run_worker_first` (`/mcp`, `/mcp/*`) and the error tables of `docs/cloud.md` and its
  Spanish twin (five new codes).
- 1.3: `test/mcp.test.ts` (30 tests): `initialize` (name, the tools capability, three sentences of
  instructions, no `Mcp-Session-Id`); a foreign, a `null` and the identity service's `Origin` refused
  403 with the token untouched; `MCP-Protocol-Version: 1999-01-01` refused 400 for `initialize` and
  `tools/list`; `GET` and `DELETE` 405; 401 with `WWW-Authenticate` for no token, a token the service
  does not hold, a JWT of the identity service and the cookie alone; a body over 24 MiB 413; a client
  of the 2026-07-28 revision; the 27 names in order with titles, descriptions, both schemas and
  annotations (read-only, destructive, idempotent as `mcp-server` says); an unknown tool `-32602`
  naming it; arguments of another shape `request.invalid` naming the field and not the value; a
  project with its address listed; two diagrams written, listed, read and shown by a page holding
  the room (`clientOf`); a second project leaving the first's files and sharing; a push with an
  error refused whole with its line and the revision unchanged; a stale push `revision.mismatch`
  with the revision; a person's change read with the new revision; someone else's, an unknown and a
  malformed project `project.not-found` with no other field (four tools); the 101st project
  `quota.projects` with `limit: 100`; an image uploaded with its SHA-256 and listed; `validate` of a
  file and of the project; versions made, listed and restored; a rename; `whoami` with the scopes.
  `test/config.test.ts` checks `/mcp` in `run_worker_first`.
- 1.4: `test/idempotency.test.ts` (14 tests): a creation replayed with `Idempotent-Replayed: true`
  and one project; another body `409 idempotency.mismatch`; per account; a key of 65 characters, with
  a space, a control character or beyond ASCII `400 request.invalid` (those a `Request` header
  cannot carry never reach the Worker); a refusal kept and answered again; a key forgotten after a
  day; a failure of the service letting go of the key; a push replayed with the room changed once;
  another push under the key refused with the room unchanged; the key of one project a mismatch on
  another; a stale push's refusal kept. `test/store/conformance-calls.ts` (11 tests over the
  in-memory store and D1 on node:sqlite, bare and with a round trip before every statement): a
  claim, its answer kept once, per account, a claim let go of, an abandoned claim taken over after a
  minute, a day kept and the account's older keys swept by its next claim, the cron's sweep, what a
  deletion clears, the windows counted by account, kind and minute and twenty racing calls counted
  without one lost. `test/migration-idempotency.test.ts` (12 tests) checks 0008's statements, ASCII,
  columns and checks. In `test/mcp.test.ts`: a retried `create_project` (one project, the same id),
  another body under the key, the same key and body through the HTTP header replayed, and a retried
  `write_files` applied once with a kept `revision.mismatch` answered again.
- 1.5: `test/mcp-sharing.test.ts` (11 tests): `set_link_access` to `view` with the project's link,
  which redirects and lets an anonymous caller read the files while an anonymous MCP client is 401;
  an invitation with its link and `emailSent: false`, listed and revoked; a member joining, made an
  editor and removed; a viewer's `set_link_access` and `invite` refused `access.denied` with nothing
  changed; an editor with every scope writing but refused `set_link_access`; a live session with its
  link and term, `get_live` `null` after `end_live`; a spying console (every level) that never holds
  the invitation's or the session's link; `handle.required` before anything is built; a publication
  built by the renderer object, read back with one `HEAD` of the publish host, served at
  `https://meltemi.page/ana/precios/`, a second one kept when the first is unpublished (404);
  `publish.unverified` naming the address with the publication kept when the publish host does not
  answer; a project with nothing to draw refused `diagram.invalid`. The scopes of each tool:
  `test/mcp.test.ts` builds a server for a caller granted `projects:read` alone (what an OAuth token
  will be) and sees `scope.insufficient` naming `projects:write`, `sharing`, `live` and `publish` with
  nothing changed; the 301st call of a minute `rate.limited` with `retryAfter` and the next minute
  served; the log of two calls `mcp: <tool> <ms> ms <code>` without their arguments.
- 3.2: `test/mcp-preview.test.ts` (10 tests): the SVG of `flow/cycles` equal to `meltemi-diagrams
  export … --fonts system --stdout`; the default PNG 1280 pixels wide with its report (revision,
  elements, relations, no error); the story frame of `corpus/valid/stories/purchase` at 2.4 s equal
  to `export --story purchase --at 2.4s`; a file with an error `diagram.invalid` with its diagnostics,
  no image and no drawing; a sticky's `layout.text-overflow` reported with the picture drawn;
  `Caveat` named in `estimatedFonts`; a repeat answered from the object's cache byte-equal with no
  drawing; `width: 4096` refused `request.invalid` with `limit: 2048` and nothing drawn; a file that is
  not one of the project's `.meltemi` files refused; the 31st preview of a minute `rate.limited` with
  no drawing, other tools served.
- The real runtime: `test/browser/scenarios-mcp.ts`, in `pnpm cloud:test-browser` (alone on 5
  November: passed): the SDK's client of 2.3.1 with an API token against `wrangler dev`, D1 with
  migration 0008, R2 and the renderer object over RPC: 401 without a token and 403 for a foreign
  `Origin`, 27 tools, `create_project` with a key replayed (one project), a push with an error refused
  by the object's check, a push, `validate`, an SVG (`relations: 1`) and a PNG 640 pixels wide drawn
  by the object (ELK and resvg in workerd) and answered again from its cache, a catalog built,
  published at `/_published/ana-mcp/agentic/`, read back by the Worker from its own origin, served
  200 and 404 once unpublished; the Worker's log held its request lines and the `mcp:` lines only.

## Bundle and startup

Measured on this machine on 5 November with `wrangler deploy --dry-run` and `wrangler check startup`
(the busy time of the profile, idle samples left out, the median of five runs), with the handler's
import of `/mcp` removed and with it, on the same commit:

| Cloud Worker                           | Upload (KiB) | gzip (KiB) | worker.js (bytes) | Startup (ms) |
| -------------------------------------- | -----------: | ---------: | ----------------: | -----------: |
| without the endpoint                   |     23156.55 |    7573.58 |         6 191 079 |         31.0 |
| with the endpoint, imported lazily     |     23984.59 |    7731.47 |         7 038 985 |         35.6 |
| with the endpoint, imported statically |     23846.20 |    7711.90 |         6 897 273 |         64.3 |

The last row is the first build (before the merge of `origin/main`), whose startup led to the lazy
import of `mcp/endpoint.ts`; its "without" was 30.8 ms. `docs/performance.md` measured 36.4 ms on 4
November by its own count; the figures here are the profile's busy time and compare among
themselves.

## Not verified

- On Cloudflare: nothing of this stage is deployed. The Free plan's 10 ms of CPU per Worker request
  is not measured for a `tools/list` (twenty-seven schemas), a `write_files` or a PNG's base64; the
  renderer object's limit is design's open risk, as before.
- Codex itself (criteria 1, 7 to 9): no real Codex session was run against the endpoint; the SDK's
  client of 2.3.1 stands for it, in both revisions.
- The OAuth server, its `401` challenge with `resource_metadata` and narrower scopes from real tokens
  (tasks 2.x): the scopes are exercised by a caller built in the test.
- `Accept` without `text/event-stream` (the SDK answers 406) is not tested by this stage.
- A publish read-back from the production Worker to `meltemi.page`: in development it reads its own
  `/_published/` address, and in the Node tests the publish host function.
