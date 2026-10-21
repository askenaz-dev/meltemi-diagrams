## ADDED Requirements

### Requirement: One Worker, one origin
`packages/cloud` SHALL be a Cloudflare Worker that runs first on every request
(`run_worker_first: true`), answers `/api/*`, `/_identity/*`, `/cli-auth`, `/p/*` and
`/rooms/*` itself, in whatever spelling of the path, and serves `packages/playground/dist` as
static assets for every other path on its own origin, so the page and its API share one origin
and the page's policy keeps `connect-src 'self'`; for a request whose `Host` is not the Worker's
own origin it SHALL serve no asset and answer `404`. The assets it serves SHALL carry
`Content-Security-Policy: frame-ancestors 'self'` and `X-Content-Type-Options: nosniff`, for the
page's own policy is a `meta` tag, which cannot say who may frame it. `/p/<id>`, with an id of 20
lowercase letters and digits, SHALL answer a `302` to `/?project=<id>` keeping the query.
`pnpm cloud:dev` SHALL build the page and run the Worker locally on port 8788 with a local D1;
`pnpm cloud:migrate` SHALL apply the migrations locally or remotely.

#### Scenario: The page from the Worker
- **WHEN** `wrangler dev` serves the Worker and `/` is requested
- **THEN** the playground's `index.html` is served, and `/api/session` is answered by the Worker, not by the static file of the same path

#### Scenario: A project link
- **WHEN** `GET /p/01h2x5z8kq3m7n9p2r4t?invite=t` is requested on the Worker's origin
- **THEN** the answer is `302` with `Location: /?project=01h2x5z8kq3m7n9p2r4t&invite=t`

#### Scenario: A malformed project address
- **WHEN** `GET /p/not-an-id` is requested on the Worker's origin
- **THEN** the answer is `404 project.not-found` and no redirect is sent

#### Scenario: Another host
- **WHEN** `GET /playground.js` arrives with a `Host` that is not the Worker's own origin, such as the publish host
- **THEN** the answer is `404` and no asset is served

#### Scenario: Unknown API route
- **WHEN** `GET /api/nothing` is requested
- **THEN** the answer is `404` with the JSON `{ "code": "not-found", "message": … }`

#### Scenario: A reserved path spelled with escapes
- **WHEN** `GET /%61pi/session` or `GET /api%2Fsession` is requested
- **THEN** the answer is the Worker's `404` JSON and the static `api/session` file is not served

#### Scenario: The page cannot be framed
- **WHEN** any file of the page is requested, such as `/` or `/playground.js`, or one that is not there
- **THEN** the answer carries `Content-Security-Policy: frame-ancestors 'self'` and `X-Content-Type-Options: nosniff` and keeps the status, type and body the assets binding gave

### Requirement: A handler of plain functions
The Worker's logic SHALL be `cloud(request, env, deps)` with the store, the verifier, the
assets, the clock, randomness and `fetch` injected; `CloudStore` SHALL have an in-memory
implementation and a D1 implementation over a minimal `D1Like` interface, both passing one
conformance suite; every test SHALL run in Node without a network connection.

#### Scenario: The same suite over both stores
- **WHEN** the store conformance tests run
- **THEN** they pass over `memoryStore()` and over the D1 implementation on `node:sqlite` (skipped when Node lacks it)

#### Scenario: No network in tests
- **WHEN** `pnpm cloud:test` runs
- **THEN** no test opens a socket: the identity service, the assets and the clock are fakes

### Requirement: Request authentication
Every request SHALL resolve to a principal: a bearer token `mdg_…` whose SHA-256 matches a
token row (`via: "token"`), else a `meltemi_session` cookie the reference verifier accepts
(signature against the configured JWKS, `iss`, `aud`, `exp`, and the session check at the
issuer at most once an hour per session per verifier instance; `via: "cookie"`), else
anonymous. An unknown bearer token SHALL answer `401 token.invalid`; an invalid or expired
cookie SHALL count as anonymous; routes that need a person SHALL answer `401 auth.required`.
The inline `IDENTITY_JWKS` and the skipped session check SHALL be honoured only when `DEV` is
`"true"`; `DEV` and `IDENTITY_JWKS` SHALL come only from `.dev.vars`, and a test SHALL fail
when `wrangler.jsonc` defines either.

#### Scenario: A minted session
- **WHEN** a request carries a cookie signed with the test keys for `sub` `u1` and `DEV` is `"true"` with those keys in `IDENTITY_JWKS`
- **THEN** the route sees a cookie principal `u1` and a user row `u1` exists afterwards

#### Scenario: An inline JWKS outside development
- **WHEN** `IDENTITY_JWKS` holds the test keys but `DEV` is not `"true"`
- **THEN** a cookie signed with those keys counts as anonymous and the keys come from `IDENTITY_JWKS_URL` only

#### Scenario: Development keys in the deployed configuration
- **WHEN** `wrangler.jsonc` defines `DEV` or `IDENTITY_JWKS`
- **THEN** `pnpm cloud:test` fails naming the key

#### Scenario: An expired cookie
- **WHEN** the cookie's `exp` is in the past
- **THEN** `GET /api/session` answers `{ "user": null, … }`

#### Scenario: An unknown token
- **WHEN** `Authorization: Bearer mdg_unknown` is sent
- **THEN** the answer is `401` with `token.invalid`

### Requirement: The Origin rule
A request that changes state (any method other than `GET`, `HEAD` or `OPTIONS`) authenticated
by a cookie SHALL carry an `Origin` header equal to the Worker's own origin (`ORIGIN`, or the
request's own origin `new URL(request.url).origin` when `DEV` is `"true"`); otherwise the
answer SHALL be `403 request.forbidden` before the route runs. Requests authenticated by a
bearer token SHALL not need it.

#### Scenario: A form from another family host
- **WHEN** `POST /api/tokens` arrives with a valid cookie and `Origin: https://id.meltemi.dev`
- **THEN** the answer is `403 request.forbidden` and no token is created

#### Scenario: The page itself
- **WHEN** the same request arrives with `Origin: https://diagrams.meltemi.dev`
- **THEN** the route runs

### Requirement: Errors as JSON with stable codes
Every error SHALL be `{ "code", "message" }` with the status of its kind (`400` invalid
request, `401` authentication, `403` forbidden, `404` not found, `413` quota, `429` rate
limited, `500` internal; later changes add the kinds they need, such as `409` conflict); the
message SHALL carry no token, cookie, secret or stack; `docs/cloud.md` SHALL list the codes.

#### Scenario: An unexpected failure
- **WHEN** a route throws an unknown error
- **THEN** the answer is `500` with `{ "code": "internal", "message": "Something went wrong." }` and the error is logged without the request's headers

### Requirement: Browser suite against the Worker
`pnpm cloud:test-browser` SHALL build the page, write its test configuration (`DEV=true`, an
inline test JWKS) to a temporary folder, start `wrangler dev --config` with it on a free port,
and drive a headless Edge or Chrome through: the anonymous page unchanged, the sign-in link, a
session minted with the test keys whose `picture` is under the Worker's own origin, the
account menu, tokens, the `Origin` refusal, deletion events on the real local database, the
`/cli-auth` approval landing on a test listener on `127.0.0.1` with a code it exchanges, the
refusals and the rate limit, and that every request the page made went to its own origin. The
suite SHALL stand in for the identity service's session check on port 8787, and the Worker
SHALL print nothing but its request lines.

#### Scenario: Own origin only, still
- **WHEN** the suite runs its session and tokens checks
- **THEN** every request the page made, the avatar included, went to the Worker's origin

#### Scenario: Approval in the browser
- **WHEN** the suite approves `/cli-auth` for its test listener in Edge or Chrome
- **THEN** the listener receives `code` and `state`, exchanges the code once, and a token named `CLI (…)` exists from that exchange

#### Scenario: Missing browser
- **WHEN** neither Edge nor Chrome is installed
- **THEN** the suite fails naming the browsers it looked for, as the playground suite does

#### Scenario: The identity port is taken
- **WHEN** something else, such as `pnpm identity:dev`, listens on port 8787
- **THEN** the suite fails at once saying so, for that service would not know the sessions the suite mints

#### Scenario: A quiet Worker
- **WHEN** the suite has run all its scenarios
- **THEN** the Worker printed nothing but its request lines
