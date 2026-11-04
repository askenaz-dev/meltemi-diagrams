## Context

The playground is a static site in `packages/playground/dist` with a policy of `default-src
'none'` and `connect-src 'self'`; its browser suite serves the folder on the loopback interface
and fails on any request to another origin. Identity is the family's: the `identity-session`
specification of Meltemi Web defines the cookie `meltemi_session` (an ES256 JWT, `iss
https://id.meltemi.dev`, `aud meltemi`, `sub`, `sid`, profile claims, thirty days), the JWKS, the
hourly session check, `POST /logout` from any host under `meltemi.dev`, signed `user.deleted`
events, a reference verifier with no Cloudflare dependency, and a testing module that mints
sessions with test keys. Two rules come with that cookie: check `Origin` on every state change,
and never serve user-authored content under `meltemi.dev`.

## Goals / Non-Goals

**Goals:**

- The page and the API on one origin, so the policy and the "own origin only" test stand.
- Sign in and out without the page ever handling a credential; the Worker never sees a
  provider token.
- Everything runs locally: `wrangler dev` with a local D1, tests in Node with memory stores and
  sessions signed with test keys.
- The foundation the other cloud changes extend: the store, the principal, the errors, the
  suite.

**Non-Goals:**

- Projects, sharing, collaboration, the CLI commands (their own changes).

## Decisions

### One Worker serves the page and the API

`packages/cloud/wrangler.jsonc`: `main: src/worker.ts`; `assets: { directory:
"../playground/dist", binding: "ASSETS", not_found_handling: "none", run_worker_first: true }`;
`dev: { port: 8788 }`; bindings `DB` (D1; `cloud-projects` adds R2 and the Durable Object); vars
`ORIGIN` (`https://diagrams.meltemi.dev`), `IDENTITY_ISSUER` (`https://id.meltemi.dev`),
`IDENTITY_JWKS_URL`; secrets `IDENTITY_EVENTS_SECRET`, `FORMS_SECRET`. `DEV` and
`IDENTITY_JWKS` (an inline JWKS for development and tests) come only from `.dev.vars`, never
from `wrangler.jsonc`: a test fails when `wrangler.jsonc` defines either.

The Worker runs first on every request and `cloud()` dispatches on `Host`. On the page origin
it answers `/api/*`, `/_identity/*`, `/cli-auth`, `/p/*` and `/rooms/*` itself and sends every
other path to `deps.assets.fetch(request)`; for any other `Host` it serves no asset and answers
`404`. A path under those prefixes is the Worker's however it is spelled (the assets binding
decodes escapes, so `/%61pi/session` would otherwise reach the static `api/session`): the check
reads the decoded path too, and a path that cannot be decoded counts as reserved. The page's own
files leave with `Content-Security-Policy: frame-ancestors 'self'` and `X-Content-Type-Options:
nosniff`: the page's policy is a `meta` tag, which cannot say `frame-ancestors`, and without the
header any site could frame a signed-in page and trick a person into pressing Revoke, Create or
Sign out (the binding's answers have immutable headers, so the Worker returns a copy).
`/p/<id>` (an id of 20 lowercase letters and digits, `[0-9a-z]{20}`; anything else answers `404
project.not-found`) answers a `302` to `/?project=<id>` keeping the query (`?invite=` included):
the page is always served at `/`, so its relative asset addresses hold (`base-uri 'none'`
forbids a `<base>`); the page reads `project` and `invite` from `location.search`, keeps the
address as is, and a project's link stays `<origin>/p/<id>` (`sharing-and-permissions` gives it
meaning). `/rooms/<id>` is reserved here and answers `404`; `cloud-projects` defines the
WebSocket route, and the Worker calls the room with a request it constructs itself, never the
client's. The publish host is served by a second, minimal Worker of this package with no
assets, defined by `sharing-and-permissions`. With `run_worker_first: true` every asset request
counts as a Worker request against the free plan's 100 000 a day; the browser suite's "own
origin only" assertion stays the page's. `pnpm cloud:dev` runs `pnpm playground:build` and
`wrangler dev` (port 8788, so the local origin is `http://localhost:8788`).

Alternative: the page on one host and the API on another. It would need `connect-src` to name
the API and CORS; one origin needs neither. Alternative for the assets: `run_worker_first` as
a list of paths, which costs no Worker request for assets but matches paths whatever the
`Host`, so the publish host would serve the page. Recommended: one Worker, running first.

### A handler of plain functions

`src/handler.ts` exports `cloud(request, env, deps): Promise<Response>`; `src/worker.ts`
builds `deps` from the bindings and exports `fetch`. Tests call `cloud` with
`memoryStore()`, a verifier over `testJwks`, a fake clock and a stub `fetch`.

```ts
interface Deps {
  readonly store: CloudStore;
  readonly verifier: SessionVerifier;    // @meltemi/identity's sessionVerifier
  readonly assets: { fetch(request: Request): Promise<Response> };
  now(): Date;
  randomBytes(length: number): Uint8Array;
  readonly fetch: typeof fetch;
}
```

Routes live in `src/routes/*.ts`, each a function of `(context, request)` where `context`
carries the principal, the store, the clock and the origin. Errors are thrown as `ApiError(code,
status, message)` and answered as `{ "code": "…", "message": "…" }` with the status; unknown
errors become `internal` with no detail, and the message never carries a secret.

### Who is asking

`src/principal.ts` resolves a request to a `Principal | undefined`:

1. `Authorization: Bearer mdg_<token>`: the SHA-256 of the token is looked up in `tokens`; a
   match gives `{ sub, via: "token", tokenId }` and bumps `last_used_at` (at most once an hour);
   no match answers `401 token.invalid`.
2. Otherwise the `meltemi_session` cookie: `verifier.verifySession(token, now)`; the verifier
   checks the signature against the JWKS (`IDENTITY_JWKS_URL` fetched and cached an hour per
   verifier instance; the inline `IDENTITY_JWKS` is honoured only when `DEV` is `"true"`),
   `iss` equal to `IDENTITY_ISSUER`, `aud`, `exp`, and the session at
   `<IDENTITY_ISSUER>/sessions/<sid>` at most once an hour per `sid` per verifier instance
   (the Worker passes a `checkSession` that skips the check when the issuer is unreachable,
   only when `DEV` is `"true"`); a valid session gives `{ sub, sid, name, picture, email,
   email_verified, via: "cookie" }` and the user row is created or its cached profile
   refreshed when it differs. A session issued before the person was deleted counts as nobody:
   a `user.deleted` event for its `sub` handled at or after its `iat` makes the cookie
   anonymous and creates no row (see Deletion events).
3. Neither: anonymous. Routes that need a person answer `401 auth.required`.

The Worker's own origin is `ORIGIN` outside `DEV` and `new URL(request.url).origin` when `DEV`
is `"true"`; the `Origin` rule, `return_to` and every link the Worker builds use it. A cookie
principal on any method other than `GET`, `HEAD` or `OPTIONS` requires `Origin` equal to that
origin, else `403 request.forbidden`, before the route runs.
Token principals skip it: a bearer token is never sent by a browser on its own. `Sec-Fetch-Site`
is not required (older browsers), only `Origin`.

### Users

`users(sub TEXT PRIMARY KEY, name, picture, email, email_verified, created_at)` in
`migrations/0001_accounts.sql` (a deleted person's row is removed, not marked); `users.handle` is created by `0003_sharing.sql` of
`sharing-and-permissions`. The row exists from the first authenticated request; `name`,
`picture`, `email` and `email_verified` are the token's at that moment and are refreshed when
a request's claims differ. `GET /api/session` has three shapes, all with `Cache-Control:
no-store`: a cookie principal gets `{ "user": { "sub", "name", "picture", "handle" },
"account": "<issuer>/account", "signOut": "<issuer>/logout" }`; a bearer principal gets
`{ "user": { "sub", "name", "picture", "handle" }, "token": { "id", "name" } }` with no
`account` and no `signOut` (so the command line learns the token's id); anonymous gets
`{ "user": null, "signIn": "<issuer>/login?return_to=<page>" }`. `handle` is `null` in this
change (`sharing-and-permissions` gives it a value). The `return_to` is the page's own address:
the Worker's own origin plus the path and query of the request's `Referer` when it is under that
origin (rebuilt from the origin, so credentials and a fragment never reach it), else `/`; an
address over 2048 characters, which the identity service refuses, also falls back to `/`.

### Deletion events

`POST /_identity/events`: the body is read up to 8 KiB (`400 request.invalid` beyond that) and
its `Meltemi-Signature` is verified over the exact text with `IDENTITY_EVENTS_SECRET` through
`verifyEventSignature`; a bad signature answers `401 signature.invalid` and nothing is read as
JSON. The identity service knows this Worker as the product `diagrams`:
`PRODUCTS=[{"name":"diagrams","events":"https://diagrams.meltemi.dev/_identity/events"}]`
(`http://localhost:8788/_identity/events` in development) with the secret
`EVENTS_SECRET_DIAGRAMS`, and `IDENTITY_EVENTS_SECRET` holds that same value. The event is a
JSON object with the text fields `id`, `type` and `sub` and an ISO time `at` (`400
request.invalid` otherwise) and the answer is `200 { "status": "applied" | "duplicate" |
"ignored" }`. `processed_events(id, sub, at)` makes delivery idempotent (`200 duplicate` on a
repeat) and remembers who was deleted and when. `user.deleted` calls
`store.applyUserDeleted(id, sub, at)`, one atomic step that removes the user, its tokens and its
approval codes (and, as the other changes add them, its projects, memberships, invitations,
publications and thumbnails; each change extends the cascade and its test) and records the
event. Unknown event types answer `200 ignored`.

A session issued before the deletion must not bring the person back. The verifier checks a live
session at the issuer once an hour per instance, so for up to an hour after the event the deleted
person's open tab still presents a cookie the verifier trusts, and the next request would create
their row again and let them make tokens. For a verified cookie `resolvePrincipal` therefore asks
`store.deletedSince(sub, iat)`: a deletion of that `sub` handled at or after the moment the
session was issued (a session of the very second of the deletion counts as before) makes the
cookie count as nobody, and no row is made. A person who signs in again has a later `iat` and is
unaffected. The record is kept 31 days (a session lasts thirty, and the identity service retries
for seven) and the sweep removes older ones: what stays of a deleted person is their opaque `sub`
and the time.

### API tokens and the approval page

`tokens(id, sub, name, hash, created_at, last_used_at)`; a token is `mdg_` plus 32 random
bytes in base64url, shown once. `POST /api/tokens { name }` (cookie principal only) answers
`{ id, name, token }`; `GET /api/tokens` lists `{ id, name, created_at, last_used_at }`;
`DELETE /api/tokens/:id` revokes (`404` for an id that is not the person's, whether it exists or
not). At most 20 tokens per account (`quota.tokens`), counted and added in one atomic statement.
Creating needs a cookie principal: a bearer token cannot make another one (`403
request.forbidden`), so a stolen token cannot mint copies that outlive its revocation, and
anonymous gets `401 auth.required`. Every body is read through a cap, signed-out callers
included (the declared length first, then the stream, which is cancelled past the cap): 8 KiB for
the JSON of `POST /api/tokens` (`400 request.invalid`).

`GET /cli-auth?port=<n>&state=<s>`: `port` is an integer from `1024` to `65535` and `state`
is 16 to 128 base64url characters; anything else answers `400 cli.invalid`. Signed out, it
redirects to sign-in with itself as the return address; signed in, it shows "Allow the command
line on this computer?" with the port, a six-character check (the first six characters of the
base32 of SHA-256(`state`), which `mdg login` prints, so a person recognises their own
terminal's request) and an Approve form (`csrf` from the session as the identity service does:
the HMAC of `sid` with the Worker secret `FORMS_SECRET`). `POST /cli-auth` (cookie principal
only, the `csrf`, the `Origin` rule) stores a one-time code (32 random bytes in base64url;
`cli_codes(hash, sub, state, expires_at)` holds its SHA-256 for five minutes, bound to `state`
and the person) and redirects (`303`) to `http://127.0.0.1:<n>/?code=<code>&state=<s>`; the host
is always `127.0.0.1`, and the form is read up to 8 KiB (a longer form is not a form: a person
not signed in is sent to sign in, a signed-in one gets the `request.forbidden` page).
`POST /cli-auth/token { code, state }` (no cookie, no `Origin`; a body over 4 KiB, or not JSON
of that shape, is `400 cli.invalid`; at most 10 failures per minute per IP, keyed by a keyed
hash of `CF-Connecting-IP`, then `429 cli.rate` with `Retry-After: 60`) deletes the code and
creates the token named `CLI (<date>)` for that person (`413 quota.tokens` at 20, which is not a
failure), answering `{ id, name, token }` once; an unknown, used or expired code, or a `state`
that does not match, answers `400 cli.invalid` and counts as a failure. Every approval and every
failed exchange first runs `store.sweep(now)`, which removes the codes that expired, the failures
more than an hour old and the deletion records more than 31 days old, of everybody, so a flood
of approvals nobody exchanges, or of failures from rotating addresses, leaves the tables the size
of the last few minutes and the last hour. The token is created at the exchange, not at the approval, because only its
SHA-256 is ever stored: no token in clear rests anywhere, not even for five minutes, and it
never appears in a URL. A person at the quota who approves therefore learns it at the
exchange, revokes a token and runs `mdg login` again. The page sends its own headers: the identity pages' policy
with `form-action 'self' http://127.0.0.1:*` (Chromium applies `form-action` to the redirect
that follows a form submission) and `Referrer-Policy: same-origin` (`no-referrer` would make
the POST carry `Origin: null`, which the `Origin` rule refuses). The command line's side is
`cli-cloud`.

Alternative: the device-code flow (the person types a code), or the token itself in the
redirect. The loopback redirect with a one-time code is what `wrangler login` does: nothing to
copy, and the token never reaches the browser's history. Recommended: loopback with a code.

### The account in the page

`packages/playground/src/cloud/session.ts`: `loadSession(page)` fetches `/api/session` once at
start; any status other than `200`, a network error or a body that does not parse as JSON
means anonymous, silently, and so does an answer with `user` null and no `signIn`. The build
writes `dist/api/session` holding `{ "user": null }`, so a static server answers that file
(the Worker runs first and never serves it) and the suite logs no 404. Anonymous, the header
shows "Sign in", a link to `signIn` when the answer carries it, else one the page builds itself
as `${PLAYGROUND_IDENTITY}/login?return_to=<page address>`. Signed in, it shows the account
button (avatar, name) whose menu offers "Account" (the identity service's page), "API tokens"
(a dialog listing, creating and revoking), and "Sign out" (a form posting to `signOut` with
`return_to` = the page, which the policy's `form-action` allows). The `Playground` receives the
session as an option; nothing else in the page changes in this change.

The page keeps to some rules the contract leaves open. It takes the answer's `signIn`, `account`
and `signOut` only when they are `http:` or `https:` addresses without credentials; anything
else is nobody, so a `javascript:` `signOut` never reaches a form. An answer for a bearer token
is shown as signed out, with the page's own link (a page has no bearer token). The wait for the
session is bounded (8 s). The return address drops the fragment (a share link's project must not
reach the identity service) and falls back to the path, then to the origin's root, above 2048
characters. A picture is drawn only from `https:` or from the page's own origin, with an outline
when it is missing or fails to load. The identity origin the page was built with must be the
origin of the Worker's `IDENTITY_ISSUER`: `signOut` is the issuer's address and the policy
allows forms to the built origin only.

### Policy

`build.mjs`: `form-action 'self' <origin of PLAYGROUND_IDENTITY>`, derived at build time from
the identity constant (`PLAYGROUND_IDENTITY`, default `https://id.meltemi.dev`, so the default
policy reads `form-action 'self' https://id.meltemi.dev`; the browser suite builds with
`http://localhost:8787`); `img-src 'self' data: blob: https://avatars.githubusercontent.com
https://*.googleusercontent.com`. The same constant gives the page the sign-in link it builds
when `/api/session` carries none. `connect-src 'self'` is unchanged: the sign-in is a
top-level navigation, not a request the page makes.

### Running and testing locally

`.dev.vars.example` lists `IDENTITY_ISSUER=http://localhost:8787`,
`IDENTITY_JWKS_URL=http://localhost:8787/.well-known/jwks.json`, `IDENTITY_EVENTS_SECRET`
(the value of the identity service's `EVENTS_SECRET_DIAGRAMS`), `FORMS_SECRET` and `DEV=true`;
a `.dev.vars` may add `IDENTITY_JWKS` (an inline JWKS) to develop with a minted cookie and no
identity service. The identity service runs locally with `pnpm identity:dev` in Meltemi Web on
port 8787 (its `DEV_ORIGINS` names `http://localhost:8788`; cookies on `localhost` are shared
across ports) and this Worker on port 8788. `pnpm cloud:test` runs the Node tests.
`pnpm cloud:test-browser` builds the page with `PLAYGROUND_IDENTITY=http://localhost:8787`,
writes a test `wrangler.test.jsonc` and its `.dev.vars` (`DEV=true`, an inline JWKS from
`@meltemi/identity/testing`) to a temporary folder, starts `wrangler dev --config <that file>`
on a free port as a child process, waits for it, and drives Edge or Chrome with
`playwright-core` as the playground suite does: anonymous page unchanged, sign-in link, a
session cookie minted with the test keys (`iss http://localhost:8787`, a `picture` under the
Worker's own origin) set in the browser context, the account menu, tokens, the `Origin`
refusal, deletion events on the real local D1, the `/cli-auth` approval landing on a test
listener on `127.0.0.1` that exchanges the code, the refusals and the rate limit, and the "own
origin only" check; the Worker must print nothing but its request lines. The suite stands in for
the identity service on port 8787 (it answers `GET /sessions/<sid>`, which the Worker's session
check asks), so that port must be free: stop `pnpm identity:dev` first, which would not know the
sessions the suite mints. In development the session check waits half a second for the identity
service before it takes it for absent (workerd does not fail fast on a closed local port), so
the first request of a session costs that much when none runs.

### Open decisions

1. **Token expiry.** Alternatives: none, revocable from the page; ninety days. Recommended:
   none; a lost laptop is handled by revoking, and CI tokens should not expire silently.
2. **Profile refresh.** Alternatives: on every request when claims differ; only at sign-in.
   Recommended: on every request; it is one compare and keeps names current.
3. **The hourly session check in development.** Alternatives: require the identity service to
   run; skip when unreachable and `DEV` is set. Recommended: skip in development only, so the
   page can be developed with a minted cookie and no identity service.

## Risks / Trade-offs

- **`wrangler dev` in the browser suite.** Slower to start than the static server; the suite
  starts it once and reuses it; the static suite stays as it is for the anonymous page.
- **Cookies on `localhost` across ports** make local sign-in work and also mean a local
  identity cookie reaches every local server; development only.
- **The verifier is linked, not published.** Until the delivery change publishes
  `@meltemi/identity`, the link (`link:../../../../meltemi/packages/identity`, four levels up
  from `packages/cloud`) requires the Meltemi Web checkout at `C:\meltemi`, installed and built
  there first (`pnpm install` and `pnpm build`): the package's `exports` point at its `dist/`.
  `pnpm install` says so when it is missing.
