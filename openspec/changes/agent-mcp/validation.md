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

## Stage 2

Tasks 2.1 to 2.4, run on 5 November 2026 on the same machine and worktree, from `0b8a6cd`.

### Gates

| Check                                    | Result                                     |
| ---------------------------------------- | ------------------------------------------ |
| `pnpm install --frozen-lockfile`         | green                                      |
| `pnpm typecheck`                         | green                                      |
| `pnpm lint`                              | green (ESLint and Prettier)                |
| `pnpm test`                              | 350 files, 10319 passed, 1 skipped, 1 failed (below) |
| `pnpm licenses:inventory --check`        | current (45 packages)                      |
| `pnpm cloud:test-browser`                | 104 passed, 1 failed (known flaky, below)  |
| `pnpm playground:test-browser`           | 118 passed                                 |
| `openspec validate "agent-mcp" --strict` | valid                                      |

The one failure of `pnpm test` is `packages/acceptance/test/delivery-scripts.test.ts`, "deploy-config
writes Terraform's ids into both Workers and refuses a placeholder": the `OAUTH_KV` placeholder of
`wrangler.jsonc` (32 zeros) is refused by this branch's `scripts/deploy-config.mjs`, as intended until
stage 3's version of the script (branch `agent-mcp-suite`, which fills it from `OAUTH_KV_ID`) is
merged; that script and its test are stage 3's. The failure of the cloud suite is "collaboration: a
socket the Worker cuts reconnects…", one of the suite's known flaky scenarios; alone it passed three
runs of four, and its room and socket are untouched by this stage. Its check that the Worker logged
nothing but its requests passed with the OAuth scenarios in the run.

A trial merge of `agent-mcp-suite` at `fbc162f` (not committed, aborted after): only this file
conflicts; with its `scripts/deploy-config.mjs` the placeholder is filled, and its delivery test then
fails on one line only, its expectation of `invocation_logs: true`, which this stage turns off (the
logs, below); its MCP suite's own tests pass (32), and its steps of criterion 27 expect what this
server answers (the challenge naming the origin's metadata, registration `201` with a `client_id`,
a wrong `resource` refused without a code).

### Evidence by task

- 2.1: `packages/cloud/package.json` pins `@cloudflare/workers-oauth-provider` 1.2.3 (MIT, no
  dependencies of its own); `THIRD_PARTY_LICENSES.md` lists it. `wrangler.jsonc` gains
  `compatibility_flags: ["global_fetch_strictly_public"]`, `kv_namespaces` with `OAUTH_KV` and its
  placeholder id, `PRODUCT_NAME: "diagrams"`, `/.well-known/*` and `/oauth/*` in `run_worker_first`,
  and `invocation_logs: false` (with `wrangler.publish.jsonc`). `test/oauth.test.ts` (22 tests, an
  in-memory KV, `test/support/kv.ts`): the server's metadata (issuer, endpoints, `S256`,
  `none`, `client_id_metadata_document_supported`, `authorization_code` and `refresh_token` and not
  `client_credentials`, the six scopes) and the endpoint's at both paths; `401` with
  `resource_metadata` of the origin for no token, a malformed one, a JWT of the identity service and
  a token of the library's shape it does not hold; an unknown client a page, a wrong `resource` no
  consent and no code, a signed-out person sent to sign in and back; an OAuth token `401
  token.invalid` on `/api/projects`, `/api/session`, `/api/tokens` and `/api/account/apps`; an `mdg_`
  token with the five scopes and refused by the token endpoint. `test/config.test.ts` checks the flag,
  the binding's shape, `PRODUCT_NAME`, the logs of both Workers and `run_worker_first`;
  `test/account-identity.test.ts` signs as `diagrams-staging` when `PRODUCT_NAME` says so.
- 2.2: in `test/oauth.test.ts`: the consent page in English (the client, "its name is not verified",
  `127.0.0.1` with the warning for this computer, the six scopes in words, Approve and Deny, the
  binding cookie, `form-action 'self' http://127.0.0.1:1455`, `frame-ancestors 'none'`,
  `X-Frame-Options: DENY`) and in Spanish; a client's `<script>` name escaped and unknown scopes
  dropped; a client-id metadata document's domain named (its fetch stubbed); PKCE `plain` or none
  `invalid_request`; a form without its `csrf`, with another session's or from another site `403`,
  the page still good; Deny `access_denied` with `state` and `iss` and no grant or token in KV; a
  page used, opened in another browser or older than ten minutes refused; the whole flow with DCR
  and PKCE (a wrong verifier refused without spending the code, `expires_in: 3600`, a refresh token,
  `whoami` and `create_project` as the person, the code replayed `invalid_grant` and the grant
  revoked); refresh tokens rotated; no refresh token without `offline_access`; an expired token
  `401`; a read-only token's `write_files` `scope.insufficient` naming `projects:write` with nothing
  written; an editor with every scope refused `set_link_access` (`access.denied`); the ten
  registrations of an address and the eleventh `429` with `Retry-After: 3600` and nothing registered,
  another address and the next hour served; nothing of a code, verifier, token or handle in the log
  or in clear in KV. `test/browser/scenarios-oauth.ts` in the real runtime: discovery from the
  challenge, a client registered from Node with a loopback listener, the consent page in Edge
  (policy, headers, the title, the six scopes, its motion), Approve landing on the listener with the
  code, the exchange, the SDK's client `whoami` with the five scopes, the token refused on the API and
  refused on `/mcp` once the app is revoked from Connected apps; the page in Spanish and Denegar
  giving `access_denied`. Pictures, with `CLOUD_TEST_SHOTS`: `oauth-consent-en.png` and
  `oauth-consent-es.png` in the temporary folder's `meltemi-cloud-browser-shots`.
- 2.3: `test/apps.test.ts` (8 tests): the list with the client, the scopes, the approval and the last
  use a call records (at most hourly, moved after a refresh past the hour), no token in the answer;
  one grant for a client that authorized twice and the clients of another person not seen; an
  `mdg_` token `403 request.forbidden` and nobody `401 auth.required`; a revocation `204` with its
  access and refresh tokens refused and its row forgotten; `404 not-found` for a grant of someone
  else's, an unknown one and ids of another shape; a `DELETE` from another site `403`; `user.deleted`
  revoking both grants of a person and leaving one approved after the deletion; a grant approved
  before a deletion refused while it is still in KV. `test/store/conformance-calls.ts` (3 more tests
  over memory and D1), `test/migration-connected-apps.test.ts` (8 tests) and the deletion batch of
  `test/store/d1.test.ts`. In the web app: `test/account-panel-apps.test.ts` (11 tests: the calls,
  the words of scopes and hosts, the model) and three browser scenarios (the section with Codex,
  Revoke after a question naming it, the empty state with the endpoint, Copy and the guide; Spanish;
  nothing connected in Spanish); pictures `account-apps.png` and `account-apps-empty.png` in
  `packages/playground/.test-output`.
- 2.4: `docs/cloud.md` and its twin: the bearer tokens, the routes, the endpoint's challenge, the
  sections Authorization and Connected apps, the deletion's revocation, `PRODUCT_NAME`, `OAUTH_KV`,
  the compatibility flag, the logs and staging; `docs/security.md` and its twin: "Agents and the MCP
  endpoint" and the logs. `packages/acceptance/test/docs.test.ts` green (links, anchors, twins).
- The logs: `test/logs.test.ts` drives an invitation made, accepted and refused, a live session, the
  page opened with both links, the OAuth flow with a wrong verifier, a replay and an invented refresh
  token, an identity service that cannot be reached on a route with a session id, and an `mdg_`
  token the service does not hold, and finds no `mdg_`, `Bearer`, `?invite=`, `?live=`, address,
  token, code, verifier, handle or session id in any line.

### Bundle and startup

`wrangler deploy --dry-run` and the median busy time of five `wrangler check startup` profiles, on
this machine, at `0b8a6cd` (stage 1) and with stage 2:

| Cloud Worker | Upload (KiB) | gzip (KiB) | worker.js (bytes) | Startup (ms) |
| ------------ | -----------: | ---------: | ----------------: | -----------: |
| stage 1      |     23984.64 |    7731.48 |         7 038 984 |         30.6 |
| stage 2      |     24269.71 |    7793.33 |         7 330 897 |         32.9 |

The library adds 285 KiB (62 KiB gzip); an isolate evaluates it only when it first serves an
address of the authorization server or the endpoint. The startup's medians were 29.4 to 31.8 and
31.8 to 37.1 ms over the five runs: within the noise of the machine, and far from the 1 s limit.

### Not verified

- On Cloudflare: nothing of this stage is deployed. KV's eventual consistency (a grant approved in
  one place listed elsewhere a moment later), the CPU of a token check on the Free plan, and the
  Free plan's KV limits (1,000 writes a day: a flow writes about five, a refresh three) are not
  measured.
- A real Codex: whether it asks for `offline_access` (without it a person approves again every hour),
  whether it uses a client-id metadata document or registration, and how it shows the consent's
  loopback warning; the stage 3 procedure records it.
- The OAuth token of another resource: the server knows one resource, so the test covers the
  authorization request that names another and the library's audience check is not driven by a
  token minted elsewhere.
- `docs/web-app.md` does not list Connected apps among the account panel's sections yet (outside the
  files of this stage).

## Stage 3

Tasks 4.1, 4.2, 4.3, 5.1 and 5.2, run on 5 November 2026 on Windows 11 in the worktree of branch
`agent-mcp-suite`, made from `agent-mcp` at `0b8a6cd`. Node 24.15. The authorization server (tasks
2.x) is another branch's: here the host has none, and the suite's steps that need one are skipped
with that reason.

### Gates

| Check                                                    | Result                                                        |
| -------------------------------------------------------- | ------------------------------------------------------------- |
| `pnpm install`                                           | green; the lockfile adds the client to `packages/acceptance`  |
| `pnpm typecheck`                                         | green                                                         |
| `pnpm lint`                                              | green (ESLint and Prettier)                                   |
| `pnpm test`                                              | 348 files, 10298 passed, 1 skipped (a first run, with `wrangler dev` also running, lost one worker to a native crash in `packages/cli/test/login.test.ts`, which passed alone, 25 of 25; the run again was green)                                                   |
| `pnpm licenses:inventory --check`                        | current (44 packages)                                         |
| `pnpm acceptance:mcp`, `wrangler dev`, two tokens        | 29 passed, 0 failed, 5 skipped; exit 0; no project left       |
| the same with `MELTEMI_SERVER_LOG` (the Worker's output) | 29 passed, 5 skipped; one finding (below)                     |
| `pnpm acceptance:mcp`, `wrangler dev`, first token only  | 24 passed, 10 skipped (the second account's steps); exit 0    |
| `pnpm acceptance:mcp`, `wrangler dev`, no token          | 3 passed, 31 skipped, each with its reason; exit 0            |
| `pnpm acceptance:mcp`, a port nothing listens on         | exit 1 naming the host, before any step                       |
| `pnpm acceptance:mcp --probe`, a name that does not resolve | `answers=false` (`ENOTFOUND`) after six tries; exit 0      |
| `openspec validate "agent-mcp" --strict`                 | valid                                                         |

### Evidence by task

- 4.1: `pnpm acceptance:mcp` (`packages/acceptance/src/mcp/run.ts`) over `harness.ts` (the steps,
  their needs and order, the scan and redaction of every line), `host.ts` (the target, plain HTTP,
  the probe), `agent.ts` (the SDK's client, `@modelcontextprotocol/client` 2.3.1 pinned in
  `packages/acceptance`) and `steps.ts` (34 steps: the 25 criteria, some in more than one step, two
  connections and the cleanup). The run against `wrangler dev` (`pnpm cloud:dev-session`, two API
  tokens made with the development sessions of Ana and Ben, `pnpm cloud:migrate --local`) passed
  every step that needs no authorization server, connected over `2025-11-25` to `meltemi-diagrams`
  1.11.0 with 27 tools, deleted its five projects, and left none for either account (`GET
  /api/projects` with each token: 0). `results.json` and `log.txt` hold neither token, nor `mdg_`,
  `?invite=`, `?live=` or a bearer credential. The first run without tokens showed the scan at work:
  a log line of the suite's own that read "a Bearer challenge" failed its step and criterion 29's,
  was printed redacted, and was reworded. `test/mcp-suite.test.ts` (22 tests): the patterns found
  and redacted, and the lines left alone; a step that logs a secret fails, is named and never prints
  it; a failure's message redacted; steps skipped for a need or an earlier step, with the reason; the
  steps cover exactly 2 to 6, 10 to 23 and 24 to 29, are named by their criterion and build on
  earlier ones only, with the cleanup and criterion 29 last; a run without tokens against a host that
  answers `401` passes three steps and skips every other with a reason; a host that answers without
  a token fails it; a name that does not resolve, and Cloudflare's 530, are a host that does not
  answer.
- 4.2: `.github/workflows/deploy.yml`: `authorize`, then `staging` (environment `staging`), then
  `deploy` (production, `needs: [authorize, staging]`). Staging: the same approved source and
  checks, `scripts/deploy-config.mjs --environment staging`, the superseded-source check before any
  mutation, the migrations on the staging database, both staging Workers, `pnpm acceptance:mcp
  --probe` (six tries five seconds apart) and, when the host answers, the suite against
  `https://staging.diagrams.meltemi.dev` with the environment's `MELTEMI_TOKEN` and
  `MELTEMI_TOKEN_2`, the artifact `mcp-acceptance-staging`, a summary and, for a host that does not
  answer, a notice. Production: as before with `OAUTH_KV_ID` and `R2_BUCKET_NAME`, then the suite
  against `https://diagrams.meltemi.dev` and the artifact `mcp-acceptance-production`. The suite's
  steps run with `CLOUDFLARE_API_TOKEN` emptied. `scripts/deploy-config.mjs`: production's output
  for the committed files is byte-identical to the previous script's (compared with `cmp`, both
  files, the same ids); staging writes `meltemi-diagrams-staging` and
  `meltemi-diagrams-publish-staging`, the database `meltemi-diagrams-staging` (Meltemi Web's
  `cloudflare_d1_database.diagrams_staging`), the bucket and the `OAUTH_KV` id from the variables,
  `FORMS_SECRET_STAGING` and `IDENTITY_EVENTS_SECRET_STAGING` with `ADMIN_SUBS` and
  `SPONSORS_WEBHOOK_SECRET` shared, and `ORIGIN`, `PUBLISH_HOST` and `PRODUCT_NAME`
  `diagrams-staging`; checked as well against the `wrangler.jsonc` of branch `agent-mcp` as it is
  today, with `OAUTH_KV` and `PRODUCT_NAME`. `test/workflows.test.ts` (14 tests, five new): the
  jobs' order and needs, no `continue-on-error` and no `always()` or `failure()` in production, the
  steps' order in each job, each environment's variables, the tokens read only as
  `${{ secrets.… }}` in the suite's step env and never echoed, the probe and the notice.
  `test/delivery-scripts.test.ts` (7 tests, four new): production unchanged but for the ids (with
  and without `OAUTH_KV`), its refusal of a suffix, a staging bucket or a missing `OAUTH_KV_ID`;
  staging's names, hosts, product, secrets and everything else equal to production's; the refusals
  that keep staging off production's resources; the option.
- 4.3: `docs/quality/mcp-acceptance.md`: the thirty criteria and what proves each, the suite, the
  staging gate, the procedure with Codex (the OAuth and the token configurations, the steps and the
  evidence for criteria 1, 7, 8, 9 and 16's voice half, the evidence folder
  `docs/quality/mcp-acceptance/<date>-<host>/`), the status by criterion (all `not run`) and the
  recorded runs (none). `src/mcp/procedure.ts` and `test/mcp-acceptance-docs.test.ts` (5 tests):
  the page lists the five criteria and holds to its rules; a criterion marked passed without a
  recorded run fails naming the page; a run without a Codex version or an evidence folder fails; a
  claim that the voice flow works is found and a "not verified yet" is not; none of eight documents
  (the changelog, both READMEs, both agents guides, both cloud pages, the skill's reference) claims
  it.
- 5.1: `skills/meltemi-diagrams/reference/mcp.md` (the connection, the 27 tools, the workflow, the
  errors to act on, sharing, live sessions and publishing only on request, no email claimed, no
  token or link printed), named twice in `SKILL.md` (232 to 237 lines; the token rule stays on line
  21), copied by `pnpm skills:sync` to `.claude/skills`, `.agents/skills` and
  `packages/cli/skills`; `docs/agents.md` and `docs/es/agents.md` gain "Through the MCP endpoint" and
  "A través del endpoint MCP" with the same code. `test/mcp-skill.test.ts` (5 tests) imports
  `CATALOGUE` of `packages/cloud/src/mcp/server.ts`: every tool named in the reference's tool
  section and nothing else, the connection and the rules, the workflow's order, `SKILL.md`'s mention
  and size rule, and both agents guides. The skills test of `packages/render` checks the copies.
- 5.2: `CHANGELOG.md`'s `## Next` gains the staging gate, the suite and the skill's reference;
  `docs/decisions/0072-agent-mcp.md` (context, decision, alternatives, consequences) links decisions
  0041, 0042, 0046, 0050 and 0063, the acceptance page, `docs/cloud.md`'s endpoint, the skill's
  reference and the agents guide, all resolved by the docs link test.

### Not verified

- The workflow on GitHub: the new `deploy.yml` has not run. The staging hosts are not attached
  (Meltemi Web's `staging_deployed`), and the test accounts and their tokens do not exist (task
  4.4), so the first runs will skip the staging suite with a notice and then run without tokens.
- The authorization server's steps (the metadata documents, the challenge naming them, a wrong
  `resource` refused before consent, a code and a refresh token never issued) ran only against
  stand-ins in the unit tests; with the OAuth stage merged they run against `wrangler dev`. The
  tokens a person approves (expired, revoked, narrower) are skipped by design.
- Finding for criterion 29: the Worker's own lines held nothing, but `wrangler dev`'s request lines
  carried the invitation's token in `POST /api/invitations/<token>/accept` (seven lines over four
  runs). Cloudflare's invocation logs (`invocation_logs: true`) record addresses the same way, as
  they would `/p/<id>?invite=…` and `?live=…` when opened. Not changed here: the route's shape and
  the logging are `packages/cloud`'s.
- The Codex procedure: no run is recorded.

## The store in D1 (task 2.5)

Design decision 11, run on 5 November 2026 on Windows 11 in the worktree of branch
`oauth-store-d1`, made from `main` at `dec8692`. Node 24.15.

### Gates

| Check                                                         | Result                                                                                                |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`                                              | green                                                                                                 |
| `pnpm lint`                                                   | green (ESLint and Prettier)                                                                           |
| `pnpm test`                                                   | 355 files, 10405 passed, 1 skipped                                                                    |
| `pnpm cloud:test-browser`                                     | 94 passed, 0 failed, then the runner died natively (`0xC0000409`) before the live and CLI scenarios; those, with `CLOUD_TEST_FILTER`: 8 passed, 1 failed ("live: the owner starts a live session…", the guest's drag timed out), which passed alone twice; the Worker's log check passed |
| `wrangler d1 migrations apply DB --local`                     | 0001 to 0010 applied                                                                                  |
| `pnpm acceptance:mcp`, `wrangler dev`, two tokens, server log | 32 passed, 0 failed, 2 skipped (the two that need a person's consent); exit 0; no project left        |
| the OAuth flow by hand against `wrangler dev` (below)         | 13 of 13                                                                                              |
| `openspec validate "agent-mcp" --strict`                      | valid                                                                                                 |

### Evidence

- The library's calls, read in `dist/oauth-provider.js` of 1.2.3 (installed) and 1.2.4 (the same
  41 calls on `env.OAUTH_KV`, and three more on it as the `kv` of the consent transactions): `get`
  as text (a replay marker, a grant's existence, a transaction) or `{ type: "json" }`; `put` with
  `expirationTtl` (access tokens, the ten-minute grant of a code, transactions, replay markers, a
  registration with a TTL), with `expiration` (`saveGrantWithTTL`, a grant that ends) or with
  neither (a client without a TTL, a grant without an end), every grant through `grantPutOptions`,
  which adds its `metadata` (`clientId`, `resource`, `redirectUri`); `delete`; and `list`, with
  `{ prefix, limit?, cursor? }`, reading `keys[].name`, `keys[].metadata`, `list_complete` and
  `cursor`. No `getWithMetadata`, no other `get` type, no value but text.
- `test/oauth-store.test.ts` (36 tests): the contract over both stores (13 each) (text and JSON, a put
  replacing value, expiry and metadata, deletes, expiry by TTL and by absolute time at the second,
  an expired key written again, metadata in listings, prefixes, UTF-8 byte order with `é`, `€`,
  U+FFEE and an emoji, pages of 10 and their cursor, every key deleted between pages with none
  skipped, 1000 by default and at most, expired keys not counted to the limit); the D1 store's rows,
  that a read never writes, the statement of a page (`key >= ? AND key < ?`, the limit plus one)
  and its plan (`SEARCH oauth_store USING PRIMARY KEY`), the opaque cursor and a foreign one
  refused, the refusals (empty or 513-byte key, a value not text, metadata over 1024 bytes, a NaN
  expiry, another `get` type, a limit under one or not whole), the sweep by its index, the clock;
  and the Worker's entry registering a client into its own `DB` and sweeping with the cron.
  `test/migration-oauth-store.test.ts` (9 tests): the file, the columns, the refusals.
- The harness gives the Worker the D1 store over node:sqlite, so `oauth`, `apps`, `events`, `logs`,
  `mcp*` and the cascades run the library over it: the deletion's revocation leaves no `grant:` or
  `token:` row, Connected apps lists and revokes as before, and nothing written to the table holds
  a code or a token in clear. The same suites pass over the in-memory store, the fallback where Node
  has no node:sqlite (run once by hand).
- Against `wrangler dev` (workerd and a local D1 with 0010 applied), by a script that printed
  nothing secret: a client registered; the consent page; Approve's code; the exchange for an access
  and a refresh token; the code used twice refused, and the token of its grant refused after; a
  second grant's token opening `/mcp`; a refresh rotating the pair and its token opening `/mcp`;
  Connected apps listing one grant, Revoke `204`, the token refused, none listed. The table then
  held the two clients only (the script's and the suite's wrong-resource one), with integer
  expiries: the grants, tokens and consents were all removed by the library through the store.
- Removed: the `kv_namespaces` entry of `wrangler.jsonc`, `OAUTH_KV_ID` in both jobs of
  `deploy.yml` and in `scripts/deploy-config.mjs`, which now refuses a configuration that binds a
  KV namespace; `test/delivery-scripts.test.ts` and `test/workflows.test.ts` say so.

### Not verified

- A deploy: staging and production still wait for Meltemi Web's Terraform, which no longer needs to
  create KV namespaces; its `diagrams-staging` change may still declare them and should drop them.
- The weekly cron on Cloudflare: its sweep ran in the tests over node:sqlite only.
