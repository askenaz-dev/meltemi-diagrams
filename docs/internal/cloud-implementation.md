# Cloud implementation and operations

[Español](es/cloud-implementation.md)

Maintainer implementation and operations notes, extracted from the mixed user guide. Product usage is documented in [the public guide](../cloud.md).

## One Worker, one origin

`packages/cloud/wrangler.jsonc` gives the Worker the web app's build, `packages/playground/dist`,
as its static assets (the `ASSETS` binding, with no fallback page), and makes it run first for the
paths it answers itself (`run_worker_first`: `/api/*`, `/_identity/*`, `/_published/*`,
`/_sponsors/*`, `/cli-auth`, `/cli-auth/*`, `/p/*` and `/rooms/*`). Every other path is served by the assets platform without
running the Worker. The page and the API are one origin: no CORS, and the page's policy keeps
`connect-src 'self'`.

### The paths and the Host

`cloud()` dispatches on the request's `Host`, which must be the host of `ORIGIN`:

| The request                                                                                                                                      | The answer                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| A path that a route answers (see [Routes](../cloud.md#routes))                                                                                   | The route                                                                    |
| A path under `/api`, `/_identity`, `/_published`, `/_sponsors`, `/cli-auth`, `/p` or `/rooms` with no route, or a known path with another method | JSON `404 not-found`, never an asset, in any spelling (`/%61pi/session` too) |
| Any other path                                                                                                                                   | The static asset (the page, its scripts, its fonts), or the platform's `404` |
| Any other host, the publish host included                                                                                                        | JSON `404 not-found`: no asset and no API                                    |

In development (`DEV`) the origin is the request's own, so a local request always passes. The
publish host never reaches this Worker: it is another Worker ([The publish host](../cloud.md#the-publish-host)).
`/_published/` is the prefix of the one development route that serves a publication from this
origin; without `DEV` every path under it is the JSON `404`.

The page's own files leave with two headers that the web app's build writes into `_headers`,
which the assets platform applies: `Content-Security-Policy: frame-ancestors 'self'` and
`X-Content-Type-Options: nosniff`. The page's policy is a `meta` tag, which cannot say who may frame
it; without the header any site could frame a signed-in page and trick a person into pressing
Revoke, Create or Sign out. A file that is not there is the platform's `404`, which holds nothing to
frame. An asset that `cloud()` itself serves (the Node tests, or a configuration that runs the Worker
first on everything) carries the same two headers.

Assets served by the platform do not count as Worker requests on the free plan; only the API, the
rooms, the project links and the sign-in of the command line do. Decision 0041 had the Worker run
first on everything because a list of paths matches whatever the host is, and the publish host would
then have served the page. That reason is gone (decision 0046): the publish host is a Worker of its
own, and neither Worker has an address but its Custom Domain (no `workers.dev`, no previews), so no
other host reaches these assets. A reserved path spelled with escapes (`/%61pi/session`) is the
Worker's `404`, or the one static file under a reserved name, `api/session`, whose `{"user":null}` is
the answer the Worker gives nobody; never another file.

## The handler

`src/worker.ts` is the Cloudflare entry: it exports the Worker's handler (`src/worker-handler.ts`)
and the Durable Object class `ProjectRoom` (`src/room.ts`), and nothing else knows Cloudflare. The
handler builds the dependencies from the bindings (the `DB` database through `d1Store`, the `ROOMS`
namespace through `durableRooms`, `ASSETS`, the clock, `crypto.getRandomValues`, `fetch` and one
verifier per isolate) and hands every request to `cloud(request, env, deps)` of `src/handler.ts`.
The routes that serve bytes (blobs and thumbnails) read the `BLOBS` bucket from `env`. Everything
else is a plain function of what it is given:

```ts
interface Deps {
  readonly store: CloudStore;
  readonly rooms: RoomsApi; // the projects' rooms: Durable Objects here, in-memory rooms in tests
  readonly verifier: SessionVerifier; // the reference verifier of @meltemi/identity
  readonly assets: { fetch(request: Request): Promise<Response> };
  now(): Date;
  randomBytes(length: number): Uint8Array;
  readonly fetch: typeof fetch; // the identity service: its keys, its session check, its account API
}
```

`cloud()` does, in order:

1. Reads the configuration. One it cannot use is `500 internal`, logged with the name of the
   variable and never its value.
2. Checks the `Host`, as above.
3. Finds the route by method and path. An unmatched path under a reserved prefix is `404`; any
   other path goes to the assets.
4. For a route that needs to know who is asking (everything but the events, the code exchange, the
   style sheet, the project links, the development route that serves a publication and the socket,
   which looks at the cookie itself), resolves who is asking and applies the `Origin` rule. A route
   that resolves who is asking may still be answered to nobody: the link of a project can admit
   anonymous callers to the routes that only read ([Sharing and permissions](../cloud.md#sharing-and-permissions)).
5. Runs the route. An `ApiError` becomes its JSON answer; any other error becomes `500 internal`
   and is logged without detail.

A route is a function of one context: the request, the environment, the dependencies, the
configuration, the principal and the captured parts of the path.

`CloudStore` is all the service keeps: users, API tokens, the deletion events already handled, the
codes of the command line's approval and the failures that rate-limit their exchange, projects
with their files, blobs, versions and the bytes each account uses, and what sharing and publishing
add: the link level, members, invitations, handles, publications, takedowns and the log that rates
publishing. It has two implementations,
`memoryStore()` and `d1Store(db)` over the minimal `D1Like` interface, and both pass one
conformance suite.

`RoomsApi` is what the Worker asks of a project's room: connect a socket, read the files, push,
restore, materialise, destroy, cut sockets (when access changes) and, in development, count.
`durableRooms()` (`src/room-client.ts`) implements it over the Durable Object binding, building every request it
sends. The room's rules are not in the Durable Object class, which only wires the platform (SQLite
storage, timers, the WebSocket Hibernation API) to `RoomCore` (`src/room-core.ts`); `RoomCore`
works over ports (storage, clock, timers, sockets), so the tests run every rule in Node over a fake
socket pair, a fake storage and a fake clock. Every test runs in Node with no network: the
identity service, the assets, the clock, the rooms and the R2 bucket are fakes.

## Persistence

The room keeps the document in the SQLite of its Durable Object, in two tables: `meta` (the
revision, the number of chunks and the project's id) and `doc_chunks` (`n`, `bytes`). When the
object is constructed it reads `meta` and reassembles the encoded state from the chunks; storage
that is incomplete throws instead of starting empty, because the next write would make the loss
permanent. The room does one thing at a time (a message, a push, a read, a timer), so a reader
never sees a change before it was checked.

Hosted WebSocket writes are a throttle, not a debounce: the first change after a quiet second is
written at once, then at most once per second while changes keep arriving, with one more write
after the last; and
in any case no later than ten seconds after the first change that is not yet written, so a client
that never pauses cannot postpone it. When the last client leaves, the room writes at once. A
write stores the whole encoded state in chunks of at most 1 MiB (a Durable Object SQLite value is
capped at 2 MB) and the revision, in one storage transaction. When storage refuses a throttled
write, the document stays in memory and the room tries again a second later.

HTTP pushes and restores persist the candidate document and revision before success or relay to
clients. A failed write rejects that update and preserves the preceding document and revision.
Explicit materialisation, including version creation, also persists pending room state before
success. The
[local distribution](../local-compose.md) configures its room to commit WebSocket updates before
acknowledging or relaying them too; the hosted WebSocket throttle stays unchanged.

The revision rises by one for each update the room keeps (a message of a client, a push, a
restore), and is persisted with the document, so it counts on across restarts. A pending write or
materialisation keeps the object in memory with its timer; with nothing pending the object may
hibernate between messages, with its sockets still open, and the next message reloads the document
from storage.

The window of eviction for hosted WebSocket edits. If the platform evicted an object that held an
unwritten change, the room could lose at most one second of edits, and ten for a client that never pauses. The loss is
transient: the page keeps the same updates in memory and in IndexedDB, the sockets reconnect, and
the room sends its state vector to every client that connects, so the page answers with what the
room lacks, whether the page stayed open or was reloaded in between. The alternative, appending
every update as a row, would be safer in that window and costs thousands of rows per typing
session against a daily budget of a hundred thousand.

## Materialisation

Materialisation turns the document into the rows and bytes the rest of the service reads:
`project_files` (path to hash), `blobs` rows and R2 objects. It runs thirty seconds after the last
change (the wait starts again with each change), when the last client leaves, when the Worker asks
before it makes or restores a version, and right after a project is created or copied. A room
nobody has changed (revision 0) materialises nothing, so the room of a deleted project can never
write an empty project back.

The room runs `materialise()` itself, with its own `env`: a Durable Object class lives in the same
Worker script, so it reaches `env.DB` and `env.BLOBS` directly, and no service binding or public
route exists for it. It hashes the UTF-8 bytes of every text file with SHA-256, reads the current
`project_files` and writes only the difference. R2 comes first (the new blobs under
`blobs/<hash>`; a put is idempotent and heals an object that went missing), then D1 in one atomic
step: the `blobs` rows of the texts the changed paths bring (a row that is already there has its
time renewed, in the batch that gives a path its hash, so that the weekly collection cannot take
it in between), the deleted paths, the paths whose hash changed, and the project's
`revision` and `updated_at` (only when the revision is one the project does not have yet: a room
built again over a document it had materialised, opened by a person who only looked, writes
nothing and does not move the project up the list), in statements of at most 100 bound parameters (D1's limit) chunked
inside one `batch()`. Images and fonts were stored by hash when they were uploaded. The same
content always has the same hash: two files with one text, or a text edited back to what it was,
share one blob, and editing one file of five writes one new blob and one row. Then the account's
usage is refreshed, when files changed.

The order is the guarantee: a row never names bytes that are not there, and a failure of R2 throws
before D1 is touched. Bytes put to R2 in vain wait for [the collection](../cloud.md#the-collection-of-blobs).
A failure never reaches the document: the room keeps it and its revision, logs "the files could
not be materialised" with no content, and tries again at its next trigger. Typing is never held up
either, because the room waits only for the snapshot and the writes go on beside it. A
materialisation that finds its project gone writes nothing but blob rows.

After the rows are written, the first materialisation of a UTC day that finds the files different
from the latest version records the daily version ([Versions](../cloud.md#versions)); a failure there is
logged and never fails the materialisation.

## Storage

D1 holds the metadata, R2 the bytes, and each room its document.

| Where                                      | Holds                                                                                                                                                                                                                       |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `projects` (D1)                            | `id`, `owner_sub`, `name`, `description`, `created_at`, `updated_at`, `revision` (the room's at the last materialisation), `thumbnail_at`, and `deleted_at`, which is reserved and never set: a project is deleted for good |
| `project_files`                            | The project's files as of the last materialisation: `(project_id, path)` to `hash`                                                                                                                                          |
| `project_blobs`                            | `(project_id, hash)` for every image or font uploaded to a project, copied by a duplicate and removed with the project; the room's hash check and the blob routes consult it, never the live map                            |
| `blobs`                                    | `hash` to `size`, `media_type` and `created_at`: one row per distinct content, shared by every project and account                                                                                                          |
| `versions`                                 | `id`, `project_id`, `number`, `label`, `auto`, `created_by`, `created_at`                                                                                                                                                   |
| `version_files`                            | A copy of `project_files` when the version was made                                                                                                                                                                         |
| `users.storage_bytes` (D1)                 | The bytes an account uses, kept up to date                                                                                                                                                                                  |
| `projects.link_access` (D1)                | What the project's link gives: `private` (the default), `view` or `edit`                                                                                                                                                    |
| `users.handle` (D1)                        | The name the person publishes under, `[a-z0-9-]{3,30}` and unique; null until they choose one                                                                                                                               |
| `members`                                  | `(project_id, sub)` to `role` (`viewer` or `editor`) and `added_at`: a person the owner gave a role in a project. The owner is not a row                                                                                    |
| `invitations`                              | `id`, `project_id`, `email` (lower-case), `role`, `token`, `created_by`, `created_at` and `accepted_at`, null while the invitation is pending                                                                               |
| `publications`                             | `(project_id, slug)` to `handle`, `published_at` and `bytes`, with `(handle, slug)` unique: the address of each page a project publishes                                                                                    |
| `takedowns`                                | `handle`, `slug`, `by_sub`, `reason`, `at` and `project_id`: what an administrator removed, and why                                                                                                                         |
| `administrators`                           | `sub` to `invited_by` and `since`: a person who accepted an owner's invitation to administer the service. The owners are not rows                                                                                           |
| `admin_invitations`                        | `id`, `email` (lower-case), `invited_by`, `created_at`, `expires_at` (seven days later), and `accepted_at`, `declined_at` and `revoked_at`, at most one of them set: an owner's invitation to administer                    |
| `admin_log`                                | `id`, `at`, `by_sub`, `action`, `target_sub`, `target_email` and `detail`: every administration act, appended with it and never changed                                                                                     |
| `sponsorships`                             | `id`, `delivery_id` (unique), `sponsor_login`, `sponsor_id`, `sponsor_type`, `one_time`, `amount_cents`, `privacy`, `status`, `created_at`, and `claimed_by_sub` and `claimed_at`, both null until an account claims it     |
| `publish_log`                              | `project_id` and `at`, one row for each publish request of the last hour: what rates publishing                                                                                                                             |
| `meta`, `doc_chunks` (a room)              | The room's revision and its encoded document in chunks, in the SQLite of its Durable Object                                                                                                                                 |
| R2, `blobs/<sha-256>`                      | The bytes of every blob: texts, images and fonts, by the lowercase hexadecimal SHA-256 of their content                                                                                                                     |
| R2, `thumbs/<project id>.svg`              | The project's thumbnail, one per project                                                                                                                                                                                    |
| R2, `published/<handle>/<slug>/index.html` | The HTML of each publication; the weekly collection lists `blobs/` alone and never touches it                                                                                                                               |

The schema of projects is `packages/cloud/migrations/0002_projects.sql`: six tables and one column,
all `STRICT`, with no foreign keys, so that deleting a project or a person is explicit and atomic.
Rows written are a budget (D1 counts every index entry as a row): the tables with a row per file are
`WITHOUT ROWID`, and the only index beyond the keys is `projects_owner`. A hash is a SHA-256 in
lowercase hexadecimal and the database refuses anything else.

`0003_sharing.sql` adds what sharing and publishing keep, with the same conventions: two columns
(`projects.link_access` and `users.handle`, the second with a unique index over the people who have
one), five tables (`members`, `invitations`, `publications`, `takedowns` and `publish_log`), all
`STRICT`, and no foreign keys. The database refuses what a column may not hold: a link level, a
role, a handle or a slug of another shape, an email that is not lower-case, a token that is not 32
lowercase hexadecimal characters. Its indexes serve one lookup each: a person's memberships, a
project's invitations, the invitations for an email, a project's publish requests and the sweep.
An invitation's `token` is the one secret the service keeps in clear, on purpose: the owner copies
the link of a pending invitation again from the list, so the token has to be recoverable. It is a
capability of the same kind as the link of a project that is `edit`, it is shown to the owner alone,
it is never logged, it works once and for thirty days, and it goes with its project. An API token
and an approval code are different: only their hashes are kept ([API tokens](../cloud.md#api-tokens)).

`0007_sponsorships.sql` adds `sponsorships`, `STRICT` and without foreign keys: the donations
GitHub Sponsors told the service of ([Sponsorships](../cloud.md#sponsorships)). `sponsor_login` compares
ignoring case (`COLLATE NOCASE`) and is indexed for the claim, `claimed_by_sub` for a deletion's,
and `delivery_id` is unique, which makes a repeated delivery a no-op. The database refuses a status,
a privacy level or a kind it does not know, a negative amount, a login over 39 characters and a
claim without its time.

`0006_administrators.sql` adds what the administration of the service keeps, with the same
conventions: three tables (`administrators`, `admin_invitations` and `admin_log`), all `STRICT`,
and no foreign keys. The owners are not stored: they are the `ADMIN_SUBS` secret, read on every
request. The database refuses an invitation's email that is not lower-case, an id that is not 32
lowercase hexadecimal characters, an invitation ended in two ways and an action of the log it does
not know. Its three indexes serve one lookup each: the pending invitation of an email
(`admin_invitations_email`), the invitations a deleted person made (`admin_invitations_invited_by`)
and the latest entries of the log and its sweep (`admin_log_at`). An invitation to administer has
no token: its addressee is whoever signs in with its email verified.

Usage per account is the sum of `blobs.size` over the distinct hashes that its `project_files`,
`project_blobs` and `version_files` reference: a blob shared by two projects, or by a project and
its versions, counts once. It is kept in `users.storage_bytes` and refreshed at materialisation
(when files changed), version creation and restore, upload and delete of an image or font and
deleting a project; `GET /api/account/usage` returns it with the counts.

## Configuration

`packages/cloud/wrangler.jsonc` holds the variables and the bindings. The secrets are the family's
Secrets Store's, bound as `<NAME>_STORE` (`secrets_store_secrets`) and read into `<NAME>` once per
isolate at the Worker's entry (`src/secrets.ts`), so the handlers read strings. `.dev.vars` (see
`.dev.vars.example`) supplies every one of them in development, as strings, which always win over a
binding.

### Variables and secrets

| Name                      | Kind               | Meaning                                                                                                                                                                                                                                                                          |
| ------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ORIGIN`                  | variable           | The service's own origin, `https://diagrams.meltemi.dev`: the host it serves, the `Origin` it accepts and the base of the addresses it builds. Ignored in development                                                                                                            |
| `IDENTITY_ISSUER`         | variable           | The identity service, `https://id.meltemi.dev`: the session token's `iss`, and the home of `/login`, `/logout`, `/account` and `/sessions/<sid>`                                                                                                                                 |
| `IDENTITY_JWKS_URL`       | variable           | Where the identity service publishes its public keys                                                                                                                                                                                                                             |
| `IDENTITY_EVENTS_SECRET`  | secret (Store)     | This product's secret with the identity service, its `EVENTS_SECRET_DIAGRAMS`: verifies the deletion events and signs the calls of [the identity data](../cloud.md#the-identity-data)                                                                                            |
| `FORMS_SECRET`            | secret (Store)     | Signs the approval page's `csrf` and keys the hash of an address in the rate limit                                                                                                                                                                                               |
| `PUBLISH_HOST`            | variable, optional | The host that serves publications, such as `meltemi.page`: a lowercase host name of a domain of its own, never the service's host nor one under the cookie's domain. `meltemi.page` in `wrangler.jsonc`; unset, publishing works in development only                             |
| `ADMIN_SUBS`              | secret (Store)     | The `sub`s of the owners of the service, comma separated: always administrators, and the only ones who invite and remove administrators ([Administration](../cloud.md#administration)). Unset or empty, nobody administers the service                                           |
| `SPONSORS_ACCOUNT`        | variable, optional | The GitHub login of the sponsored account (`askenaz`): the session answer's `support` is its Sponsors page and `/_sponsors/github` takes its deliveries ([Sponsorships](../cloud.md#sponsorships)). Empty in `wrangler.jsonc` until the owner's steps are done: no donation path |
| `SPONSORS_WEBHOOK_SECRET` | secret (Store)     | The secret of the Sponsors webhook, the one typed into GitHub's form: verifies each delivery's `X-Hub-Signature-256`. Meltemi Web's Terraform receives it as `sponsors_webhook_secret`; blank, every delivery is refused                                                         |
| `PRODUCT_NAME`            | variable           | What the calls of [the identity data](../cloud.md#the-identity-data) are signed as, this Worker's entry in the identity service's products: `diagrams` in `wrangler.jsonc` (and when unset), `diagrams-staging` for the staging Worker                                           |
| `DEV`                     | `.dev.vars` only   | `"true"` turns on development mode, below                                                                                                                                                                                                                                        |
| `IDENTITY_JWKS`           | `.dev.vars` only   | An inline key set, `{"keys":[…]}`, for development and tests                                                                                                                                                                                                                     |

The bindings are:

| Binding  | Is                                                                                                                                                                                                   |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DB`     | The D1 database, with its migrations in `packages/cloud/migrations`; the MCP endpoint's authorization server keeps its state in its table `oauth_store` ([Authorization](../cloud.md#authorization)) |
| `ASSETS` | The page's build                                                                                                                                                                                     |
| `BLOBS`  | The R2 bucket `meltemi-diagrams-blobs`: `blobs/<sha-256>`, `thumbs/<project id>.svg` and `published/<handle>/<slug>/index.html`                                                                      |
| `ROOMS`  | The Durable Object namespace of the class `ProjectRoom`, which the Worker's entry exports; the migration `v1` of `wrangler.jsonc` makes it SQLite-backed                                             |

`wrangler.jsonc` also holds the cron trigger of the weekly collection, `0 3 * * SUN`, and an `alias`
that makes the Worker bundle the workspace packages it imports from their sources. The ids in the
file are placeholders (all zeros): the family's Terraform creates the database, the bucket and the
Secrets Store and writes their ids as variables of this repository's `production` environment, and
the deploy workflow writes them in before uploading ([Deploying](cloud-implementation.md#deploying)). There is no KV
namespace, and the deploy refuses a configuration that binds one. `compatibility_flags` holds
`global_fetch_strictly_public`, which the authorization server needs before it fetches a client-id
metadata document. The
Worker's runtime dependencies are the identity package, this repository's project package and
`yjs` (MIT). Outside development `ORIGIN`, `IDENTITY_ISSUER` and `IDENTITY_JWKS_URL` must be
`https:` addresses; otherwise every request is `500 internal` and the log names the variable.
`PUBLISH_HOST`, `ADMIN_SUBS` and `SPONSORS_ACCOUNT` are different: none stops the service, and each
costs only its own feature when it is missing or unusable (publishing, the administration of the
service, and the donation path).

Both Workers keep their own log lines (`observability.logs.enabled`) and no invocation logs
(`invocation_logs: false`): an invocation log records each request's address, and some addresses
grant access (`/api/invitations/<token>/accept`, a page opened with `?invite=` or `?live=`). No line
the Worker logs holds an address, a token, a session id, an invitation's or a live session's link or
an OAuth code; `test/logs.test.ts` drives the routes that carry them and reads every line.

The publish host has its own configuration, `packages/cloud/wrangler.publish.jsonc`, and binds only
`DB` and `BLOBS`, the same database and bucket as above, to read them: no assets, no variable, no
secret and no Durable Object ([The publish host](../cloud.md#the-publish-host)). It does not apply migrations;
the main Worker's configuration does.

### Development settings

`DEV` and `IDENTITY_JWKS` come only from `.dev.vars`, never from `wrangler.jsonc`, and a test fails
if `wrangler.jsonc` defines either. `DEV` is development only when it is exactly `"true"`. Then:

- the service's origin is the request's own (`http://localhost:8788`), so any host passes the `Host`
  check, and the identity addresses may be `http:`;
- the inline `IDENTITY_JWKS` is honoured, so a cookie signed with test keys verifies with no
  identity service; outside development it is not even read, and a cookie signed with those keys
  counts as anonymous. One that is not a key set makes every request `500 internal`, instead of
  leaving every cookie anonymous without a word;
- the hourly session check asks the identity service with a half-second limit and passes when the
  service cannot be reached at all, so a minted cookie works with none running. A service that
  answers is not absent: `204` is a live session, `404` a gone one, and any other status is an
  invalid session that is not remembered;
- publications have no publish host: their addresses are `<origin>/_published/<handle>/<slug>/`
  and the Worker serves them there, so `PUBLISH_HOST` is not needed;
- the development routes below exist.

### The development routes

Four routes exist for the browser suite and for a person developing. Anywhere but in development
they answer `404 not-found`, before anything else is looked at (`config.ts` is the one place that
reads `DEV`). Each needs a person, and the three of a room need the project's owner; the `Origin`
rule applies to the `POST`s.

- `GET /api/dev/rooms/<id>/stats` answers what the room has counted since its object was
  constructed (a room that hibernated starts counting again):

  ```json
  {
    "revision": 41,
    "clients": 1,
    "storageWrites": 31,
    "materialisations": 2,
    "materialiseFailures": 0,
    "d1RowsWritten": 14,
    "messages": 212,
    "awareness": 140,
    "awarenessDropped": 0
  }
  ```

  `d1RowsWritten` is what `materialise()` reports, and `messages` the messages received from
  clients. `awareness` is how many of those were awareness (kind 2) messages, the dropped and the
  invalid ones included, and `awarenessDropped` how many of them the room did not relay: beyond 20
  a second from a client, or not a state ([Awareness](../cloud.md#awareness)). The browser suite types for a
  minute and asserts these numbers.

- `POST /api/dev/rooms/<id>/disconnect` takes an optional `{ id?, sub? }` and closes the sockets it
  names (all of the room's, with no body) with code `4000`, which is not a refusal, so the page
  reconnects. It answers `{ closed }`. The suite uses it to cut a device and bring it back.
- `POST /api/dev/rooms/<id>/limits` takes an optional `{ clients? }`, a whole number from 1 to 20
  (anything else is `400 request.invalid`), and lowers how many clients the room admits from then
  on; with no body, or `null`, the real limit comes back. It answers `{ clients }`, the limit now in
  force. Nobody connected is cut, the next client over the limit is refused with `room.full`, and
  the `hello` of the room names the lowered limit. The limit is kept in the room's storage, so it
  outlives a hibernation. The suite uses it to see the twenty-first client turned away with two
  browsers.
- `POST /api/dev/collect` takes an optional `{ olderThanDays? }` (a number from 0; seven by
  default), runs [the collection](../cloud.md#the-collection-of-blobs) now and answers what it did:
  `{ rows, objects, orphans, failures, truncated }`. The cron trigger does not fire under
  `wrangler dev`.

A fifth route belongs here, though it needs no person: `GET` and `HEAD /_published/<handle>/<slug>/`
serve a publication from the Worker's own origin, with the page and the headers the publish host
gives it ([The publish host](../cloud.md#the-publish-host)). It answers `404 not-found` unless `DEV` is
exactly `"true"`, before it looks at anything else.

### Custom Domains

`diagrams.meltemi.dev` and the publish host `meltemi.page` are Workers Custom Domains, never
Routes. The Worker fetches the identity service's keys and checks `GET /sessions/<sid>` at
`id.meltemi.dev`, which is a Worker on the same Cloudflare zone, and Workers of one zone reach each
other by `fetch` only through Custom Domains (error 1042 otherwise); with a Route, no session could be
verified. The domains are declared by the family's Terraform, with the Workers they serve; neither
`wrangler.jsonc` nor `wrangler.publish.jsonc` has `routes`, and both keep `workers_dev` and
`preview_urls` off, so a deploy never adds an address.

### Deploying

Nothing is deployed or configured from a machine ([decision 0046](../decisions/0046-delivery.md)).

- **What exists** is declared in `packages/infra` of the Meltemi Web repository and applied by its
  pipeline: the zones, the Workers `meltemi-diagrams-cloud` and `meltemi-diagrams-publish` as
  entities, their Custom Domains, the D1 database `meltemi-diagrams`, the R2 bucket, the Secrets
  Store with `FORMS_SECRET`, `IDENTITY_EVENTS_SECRET` (the identity service's
  `EVENTS_SECRET_DIAGRAMS`, the same value by construction) and `ADMIN_SUBS`, and this repository's
  `production` environment: a deploy token that can only upload Workers and migrate D1, and the
  variables `CLOUDFLARE_ACCOUNT_ID`, `D1_DATABASE_ID` and `SECRETS_STORE_ID`.
- **What runs** is uploaded by `.github/workflows/deploy.yml` after successful push CI on `main`,
  from that exact SHA with its automatic product version. Superseded sources are skipped before
  migrations and uploads:
  `scripts/deploy-config.mjs` writes `wrangler.deploy.json` and `wrangler.publish.deploy.json` with
  the ids, then the web app is built, the migrations are applied (`wrangler d1 migrations apply
DB --remote`), and the main Worker and the publish Worker are uploaded with `wrangler deploy`. A
  failed migration uploads nothing.
- **Rolling back** is a revert pushed to `main` that passes CI, or an explicit Cloudflare
  `wrangler rollback` with the owner. Recovery takes a successful CI run id; it never bypasses CI
  or undoes database migrations ([releasing](../../RELEASING.md)).
- **A secret** changes in the family's Terraform; the Workers read the new value when their
  isolates restart. `wrangler secret put` is never run.

**Staging.** The deploy uploads the staging twins first, `meltemi-diagrams-staging`
(`https://staging.diagrams.meltemi.dev`) and `meltemi-diagrams-publish-staging`
(`staging.meltemi.page`), with the `staging` environment's ids and `PRODUCT_NAME`
`diagrams-staging`, runs `pnpm acceptance:mcp` against them, and deploys production only if it
passes. Without the owner's test tokens (`MELTEMI_TOKEN`, `MELTEMI_TOKEN_2`) only the checks that
need no account run: the metadata, the challenge and the refusals.

## Running locally

For an installable workspace with no IDP, test cookie or token setup, use [Docker Compose](../local-compose.md).
The instructions below are the manual development workflow for the hosted implementation.

The Worker listens on `http://localhost:8788`, the identity service on `http://localhost:8787`.
Cookies on `localhost` are shared across ports, so a session the identity service sets reaches the
Worker; that holds in development only. `.dev.vars` is required: without it `DEV` is not set, the
Worker's origin is `ORIGIN`, and every request on `localhost` is `404`.

### With the identity service

1. Run the identity service from the Meltemi Web repository (`C:\meltemi\web` on the owner's machine).
   Its README, under "Signing in with GitHub and Google on this machine", has the full setup: the
   development OAuth apps, `pnpm identity:keys` and `pnpm identity:migrate --local`. Then:

   ```bash
   pnpm identity:dev
   ```

   Its `.dev.vars` must name this Worker: `DEV_ORIGINS` holds `http://localhost:8788`, `PRODUCTS`
   holds `{"name":"diagrams","events":"http://localhost:8788/_identity/events"}` and
   `EVENTS_SECRET_DIAGRAMS` holds a long random text. Its `.dev.vars.example` already has the
   first two.

2. Copy `packages/cloud/.dev.vars.example` to `packages/cloud/.dev.vars` (ignored by Git) and fill
   in the two secrets: `IDENTITY_EVENTS_SECRET` takes the value of `EVENTS_SECRET_DIAGRAMS` and
   `FORMS_SECRET` any long random text.

   ```ini
   DEV=true
   IDENTITY_ISSUER=http://localhost:8787
   IDENTITY_JWKS_URL=http://localhost:8787/.well-known/jwks.json
   IDENTITY_EVENTS_SECRET=
   FORMS_SECRET=
   ```

3. Create the local database once, as [The database](cloud-implementation.md#the-database) explains. The rooms and the R2
   bucket need no setup ([Rooms and bytes locally](cloud-implementation.md#rooms-and-bytes-locally)).

4. Build the page for the local identity service and start the Worker. `pnpm cloud:dev` runs
   `pnpm playground:build` and then `wrangler dev`. The build takes the identity service from
   `PLAYGROUND_IDENTITY` (default `https://id.meltemi.dev`) for the page's sign-in link and for the
   `form-action` of its policy; at the default, the policy would stop the **Sign out** form from
   posting to `localhost`.

   ```bash
   PLAYGROUND_IDENTITY=http://localhost:8787 pnpm cloud:dev
   ```

   In PowerShell:

   ```powershell
   $env:PLAYGROUND_IDENTITY = "http://localhost:8787"; pnpm cloud:dev
   ```

5. Open `http://localhost:8788`, press **Sign in**, choose a provider and come back signed in. To
   see a deletion event arrive, delete the account at the identity service and run its scheduled
   delivery as its README describes.

Sharing and publishing need nothing more. A publication made from the page is served under
`http://localhost:8788/_published/<handle>/<slug>/`, where the page shows its address. To try
invitations by email, sign in with a second account (another browser profile) whose email the
provider verified; an invitation link works for any signed-in person. To try the administration,
put your `sub` in `ADMIN_SUBS` of `.dev.vars`: the menu then offers the central Administration
link. Configure the Identity development console's private binding for this Worker to exercise
its forms; the [service protocol](../central-administration-service.md) documents the named entrypoint
and the environment boundary. Direct API calls still use the product's own-Origin rule.

### Without it: a minted session

A cookie signed with test keys is enough to develop the page and the API. `pnpm cloud:dev-session`
does it all for you: it makes `packages/cloud/.dev.vars` (development mode, an inline key set and the
two secrets; ignored by Git), keeps its keys in `.dev.vars.keys.json` so that a second run still
signs sessions the Worker accepts, and prints, for Ana and Ben, the console line that signs the
browser in as them. Use two browser profiles to be both at once, then build the page for the local
identity address and start the Worker:

```bash
pnpm cloud:dev-session
PLAYGROUND_IDENTITY=http://localhost:8787 pnpm playground:build
pnpm cloud:migrate --local
pnpm --filter @meltemi/diagrams-cloud run dev
```

To see what the command does, or to make a session by hand, save this in `packages/cloud` as
`mint-session.mjs` (do not commit it) and run `node mint-session.mjs`:

```js
import { signSessionToken, testJwks, testKeys } from "@meltemi/identity/testing";

const keys = await testKeys();
// A session of Ana for the local identity service, with an avatar from this Worker's origin.
const token = await signSessionToken(
  {
    sub: "dev-ana",
    name: "Ana",
    picture: "http://localhost:8788/favicon.svg",
    iss: "http://localhost:8787",
  },
  keys,
  new Date(),
);
// The first line goes to .dev.vars; the second is the cookie to set in the browser.
console.log(`IDENTITY_JWKS=${JSON.stringify(testJwks(keys))}`);
console.log(`meltemi_session=${token}`);
```

Add the `IDENTITY_JWKS=…` line it prints to `.dev.vars`, next to the settings above, and stop the
identity service if it is running: it would answer `404` for a session it never made, and the
Worker would refuse the cookie. Start the Worker as before and, on `http://localhost:8788`, set the
cookie from the browser console with `document.cookie = "meltemi_session=<token>; path=/"`. Reload:
the header shows Ana. The page's policy allows an avatar from its own origin or from the providers'
hosts, which is why the `picture` is on the Worker's origin. **Sign in**, **Account** and
**Sign out** all go to the identity service, which is not running: the minted cookie is what signs
you in, and deleting it is how you sign out.

### The identity package

The Worker verifies sessions with `@meltemi/identity`, published on npm with provenance by the
Meltemi Web repository's release workflow; `packages/cloud/package.json` depends on `^0.1.0`, and
`pnpm install` fetches it like any other package. While its verifier changes, work against a
checkout of the Meltemi Web repository instead, without committing the link:

```bash
pnpm --filter @meltemi/diagrams-cloud link ../../meltemi-web/packages/identity
```

Build it there first (`pnpm build`), and again after each change: the package's `exports` point at
`dist/`.

### The database

The schema is three migrations. `packages/cloud/migrations/0001_accounts.sql` makes five tables, all
`STRICT` (`users`, `tokens`, `processed_events`, `cli_codes` and `cli_failures`). The database holds
no API token and no approval code in clear (their hashes are SHA-256 in hexadecimal and it refuses
anything else) and no address of a person. For each deletion event handled `processed_events`
keeps the event id, the person's opaque `sub` and the event's time, for 31 days.
`0002_projects.sql` adds the six tables of [Storage](cloud-implementation.md#storage) and the `storage_bytes` column of
`users`. `0003_sharing.sql` adds the two columns and five tables of sharing and publishing, which
[Storage](cloud-implementation.md#storage) also describes; the one secret it keeps in clear is the token of a pending
invitation. `0004_takedown_project.sql` adds `takedowns.project_id`, so that a removal is the
notice of the project it was made of and not of whoever holds the handle later. `pnpm cloud:migrate` applies the migrations that are missing; it lists them and asks to
confirm. It works on the local database that `wrangler dev` uses. Flags go straight after the
command, with no `--` before them: `pnpm cloud:migrate --remote` applies them to the Cloudflare
database, and `pnpm cloud:migrate --local` says the default out loud.

```bash
pnpm cloud:migrate
```

### Rooms and bytes locally

`wrangler dev` runs D1, R2 and the Durable Objects on your machine, with nothing to create in
Cloudflare and no account to log in to: the R2 bucket and the rooms' SQLite appear when they are
first used, and the migration `v1` of `wrangler.jsonc` is enough for the class `ProjectRoom`. Their
state is kept in `packages/cloud/.wrangler/state`, which Git ignores. The rooms and the D1 rows
describe the same projects, so to start again from nothing delete that folder as a whole: a room
whose project has no row is unreachable, because who may open a project is resolved from D1. The weekly cron does
not fire locally; `POST /api/dev/collect` runs the collection on demand
([The development routes](cloud-implementation.md#the-development-routes)).

## Tests

```bash
pnpm cloud:test
```

runs the Worker's tests in Node: the handlers with the in-memory store, in-memory rooms, a fake R2
bucket and sessions signed with the test keys of `@meltemi/identity/testing`; the store suite over
both stores (D1 on `node:sqlite`, skipped when Node lacks it), which covers projects, files, blobs,
versions, usage and the collection too; the migrations and the configuration, `wrangler.jsonc`
included; and the audit, which reads this page, among others, and fails when its table of errors
and the code's differ. What cloud projects, sharing, publishing and awareness add to it, by file in
`packages/cloud/test`:

| Suite                                                | What it covers                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `document`                                           | File ids, `snapshot` and collisions, `applyFiles` and `restoreFiles`, and the validation of a transaction                                                                                                                                                                                                                                     |
| `room-core`                                          | The room over a fake socket pair, a fake storage and a fake clock: the throttle, chunks, a 3 MiB document reloaded, the protocol, no-op updates, every refusal and its close code                                                                                                                                                             |
| `room-hostile`                                       | What an editor can do to a room with an update no honest page sends: a struct that waits for one that never comes, a root type of another shape, a document small encoded and heavy in memory                                                                                                                                                 |
| `room-ops`, `room-storage`, `room-client`            | Reads, pushes, restores, materialisation triggers, destroying a room, the development counters, the cut; the room's SQLite storage; the requests the Worker constructs                                                                                                                                                                        |
| `rooms-routes`                                       | The socket route (foreign `Origin`, no cookie, a token, no upgrade, a spoofed role, the internal routes), `GET` and `PUT …/files`, the development routes                                                                                                                                                                                     |
| `room-awareness`, `room-awareness-room`              | Awareness: the parser of a state, the record an attachment holds and the sliding rate; then the room over fake sockets: the relay with the sender's identity (a spoofed `user` included), states on connect, hibernation, removal on close and after thirty seconds, also after a wake, the 16 KiB cap, the rate and the lowered client limit |
| `materialise`                                        | Only what changed is written, R2 before D1, a refused R2 write leaves the room intact, the room's triggers                                                                                                                                                                                                                                    |
| `projects`, `binaries`, `binary`                     | Projects (templates, files, quota, duplicate, delete), uploads typed from their bytes, the SVG rule, the blob headers, the storage quota                                                                                                                                                                                                      |
| `versions`, `versions-policy`, `thumbnails`, `usage` | Versions (cap, rate, restore, the daily version), the policy walked over thirty-five days, thumbnails, usage                                                                                                                                                                                                                                  |
| `collect`, `cascade`, `migration-projects`           | The weekly collection and its bounds, the cascade of a deleted account, the migration's constraints                                                                                                                                                                                                                                           |
| `projects-d1`, `versions-d1`                         | The project and version routes over D1 on `node:sqlite`, where only SQL can go wrong (the atomic quota, cap and rate, the batches)                                                                                                                                                                                                            |
| `access`, `sharing-access`                           | The permission matrix cell by cell, and every route of a project for every person (the owner, an editor, a viewer, a signed-in stranger, nobody) at every link level, in the order of the refusals, with the viewer in the room and the sockets a change of access cuts                                                                       |
| `sharing`                                            | The state as each person sees it, the link level, invitations and their links, accepting, members, leaving, the limit of 50, the thirty days, the email resolved at sign-in (verified and not), the cascade of a deleted account                                                                                                              |
| `publish-routes`, `publish-host`                     | Handles, publishing and unpublishing, the limits and the rate, who may, the takedown; the publish host over a fake bucket and over the real SQL, its headers and its `404`, the development route, and what keeps the Worker minimal (what it imports and binds)                                                                              |
| `publishing-cascade`, `migration-sharing`            | A deleted account's publications (objects and rows) and everything else of sharing it leaves or removes; the third migration's constraints                                                                                                                                                                                                    |
| `store/conformance-sharing`, `store/d1-sharing`      | The sharing half of the store's contract over both stores, and what only SQL can get wrong in it (statements, constraints, indexes, races)                                                                                                                                                                                                    |

No test of this suite opens a socket: the rooms are driven over fake socket pairs. The page's side
of cloud projects is tested in Node too, with fakes (`packages/playground/test`: the document, the
binding of two documents to a Studio, undo, the room's client, IndexedDB, the models of the panel
and the versions panel, thumbnails; and for sharing, view mode and each guard of it, opening by
link, the snapshot, the copies, the share dialog's model for each role and the publish dialog's),
and so is the path rule (`packages/project/test/files.test.ts`). For collaboration, the same
folder tests presence: its format, the peers, the people listed in the header, the geometry of the
carets over the code, the throttle and the heartbeat, and the state of a room that is full. The
read-only canvas and the layer that draws other people's selections are tested in the webview
suite (`pnpm vscode:test-webview`). The Durable Object class itself is wiring only; it runs under
`wrangler dev` in the browser suite.

```bash
pnpm cloud:test-browser
```

builds the page for `http://localhost:8787` as its identity service, writes a test configuration
(`DEV=true` and an inline key set from the test keys) to a temporary folder, starts `wrangler dev`
on a free port and drives the installed Edge or Chrome with `playwright-core`: the anonymous page
unchanged, the sign-in link, a session minted with the test keys whose picture is on the Worker's
origin, the account menu, creating and revoking a token, the `Origin` refusal, deletion events on
the real local database, the command line's approval landing on a listener on `127.0.0.1` that
exchanges the code, the refusals and the rate limit, and that every request the page made went to
its own origin. The Worker must print nothing but its request lines.

For cloud projects the suite goes through the real room, D1 and R2 that `wrangler dev` runs, with a
second device of the same person (another browser context) where a scenario needs one:

- the Projects panel, in English and in Spanish (the list with a thumbnail, a project made from a
  template, rename, duplicate and delete after a confirmation); saving the edited local project to
  the cloud; opening a project by its link and by an address that names one that cannot be opened;
  and the status line when the 101st project is refused;
- editing: a canvas edit that reaches the room's text; two devices that converge; a remote change
  that keeps the caret and stays out of undo; undo of one's own edits (typing, a drag and then
  typing within 700 ms, Enter, a rename across files); and a file renamed on one device while the
  other types in it;
- the connection: the room cut through the development route and the page's sockets kept out of
  reach while each device edits a file, both edits in both documents when the connection returns; a
  reload that opens the project from IndexedDB at once; a project opened with no connection; and a
  project deleted from another device, which stops the page reconnecting;
- versions (a label of 81 characters refused, a named version, a restore that keeps the state before
  as an automatic version and leaves nothing to undo) and the thumbnail (sent about five seconds
  after the analysis settles, none for a file with only a `model`);
- images and fonts uploaded by hash, served with their headers and shown on the other device, and an
  SVG with a script that executes nothing when it is opened at its blob address, while an `<img>`
  still shows it;
- a refused transaction (a text over 2 Mi characters is named in the status line, the text returns
  to the room's and the socket reopens) and a minute of typing, whose counters, read through the
  development route, stay between 20 and 90 storage writes, at most 3 materialisations, at most 60
  D1 rows written and at most 300 messages.

For sharing, viewing and publishing it goes through the same real Worker, D1, R2 and room, with a
person for each browser context and the owner's calls made from Node to see where things landed:

- viewing by link: a `view` project opened where nobody is signed in draws, plays a story and
  exports an SVG, the code and the canvas refuse every edit, nothing reaches the room and nothing is
  kept in the browser; the snapshot that says after five minutes that the project may have changed
  and shows what the owner changed when it is read again; a `private` link that says only that the
  project was not found, to nobody and to a stranger alike; **Make a copy** after a confirmation,
  keeping what it replaces as the previous project; **Save a copy to my projects**; an `edit` link,
  which is the normal page for a person signed in and a view for nobody, and a push without an
  account refused with `401`; a signed-in viewer that follows the room live, cannot write, and
  whose socket is closed with `4403` when it sends an update, whatever role it claims; and access
  that changes while a page is open: a viewer made an editor edits, an editor made a viewer can no
  longer write, and a person removed loses the project;
- the share dialog as the owner (changing the level, with what nobody signed in, a stranger and the
  members can then do observed over plain HTTP; an invitation made, copied and revoked, an invalid
  address refused, a role changed, a person removed after a confirmation, the limit of fifty) and as
  a member or a viewer by link (the link, the role, the people by name and **Leave** for a member,
  never an invitation, an email or a control that changes anything); an invitation accepted in
  another browser, one that keeps the address until the person signs in, an invalid one, and the
  invitations that resolve at sign-in for the email the provider verified and for no other;
- publishing: the dialog that asks for a handle the first time (a taken one refused in words), the
  catalog the export builds, the address under `/_published/`, what a visitor is served (the catalog
  with the headers of [The publish host](../cloud.md#the-publish-host) and no cookie), a page name another of
  the person's projects holds, unpublishing, and a page the administrators took down, shown as
  removed by the service; and, asked as a program asks it, the handle and its lock in D1, the page
  in R2 with its exact headers, replaced and unpublished, the limit of 16 MiB, the rate, and the
  takedown, a route that is `404` for everybody else. The publish host itself, the second Worker, is
  not started by this suite: the development route serves the same page with the same headers
  through the same function, and the Worker's isolation is tested in Node.

Collaboration goes through the same real Worker and room too, with two browser contexts, a person
in each, in one project.

The suite stands in for the identity service's session check: a small server on port 8787 answers
`GET /sessions/<sid>` for the sessions it mints. That port must therefore be free. If it is taken,
for example by `pnpm identity:dev`, the suite stops at once and says so: that service would not
know the sessions the suite mints. It needs no network, and it leaves the page built for
`http://localhost:8787` in `packages/playground/dist`; every command that serves the page builds
it first.

```bash
pnpm playground:test-browser
```

serves the build on a static server instead: the anonymous page, `api/session` answering the
static `{"user":null}`, no console error and no request outside the origin.

## Who is asking

A route that needs to know who is asking resolves a principal, a person with the cookie or a
token, in this order.

### Bearer tokens

`Authorization: Bearer mdg_<token>` is an API token. Its SHA-256 is looked up among the stored
hashes; a match is the person who made the token, and the token's last use is recorded on its first
use and then at most once an hour. A bearer token that is unknown, revoked or not an API token is
`401 token.invalid`, whatever cookie comes with it, and a valid one wins over the cookie (which is
not even read). Other `Authorization` schemes, and a `Bearer` with no token, are ignored.

A token is its own credential: it keeps working after the session that made it ends, until it is
revoked or the account is deleted. It needs no `Origin`.

An access token of the MCP endpoint's authorization server ([Authorization](../cloud.md#authorization)) is not
an API token: it is bound to `/mcp` and opens nothing else, so on any other route it is
`401 token.invalid`, like any bearer the service does not hold.

### The session cookie

Otherwise the `meltemi_session` cookie goes to the reference verifier of `@meltemi/identity`. It
accepts a token that is signed (ES256) with a key of the identity service's key set, issued by
`IDENTITY_ISSUER` for the audience `meltemi`, and not expired, and whose session is still live:
`GET <IDENTITY_ISSUER>/sessions/<sid>` answers `204`. The key set is kept for an hour and the
session check for an hour per session, per verifier instance, so a revocation at the identity
service counts from the next hour. A check that fails counts as an invalid session and is not
remembered. The package's README has the rest.

A cookie that does not verify is not an error: the request goes on as anonymous. A route that needs
a person then answers `401 auth.required`. A cookie that verifies keeps its token on the principal;
only the routes of [the identity data](../cloud.md#the-identity-data) read it, to present it to the identity
service on the person's behalf.

A session issued before its person was deleted does not count either. The verifier trusts a live
session for an hour, and in that hour the deleted person's own open tab would otherwise create
their row again and make tokens. So for a verified cookie the Worker asks whether a deletion of
that `sub` was handled at or after the moment the session was issued (see
[Deletion events](../cloud.md#deletion-events)); if so the request goes on as anonymous and no row is made.
A person who signs in again has a later session and is not affected.

### Users

From the first authenticated request with the cookie the Worker keeps a user row by `sub`, caching
the token's `name`, `picture`, `email` and `email_verified`. Every request compares them with the
row and refreshes it when they differ, so a new sign-in with another name or picture updates it.
The row also holds what the token does not carry: the person's handle, once they chose one
([Handles](../cloud.md#handles)), and the permissions an owner or an administrator granted the account, such as
exporting without the Meltemi branding, with who did it and when ([Entitlements](../cloud.md#entitlements)).
A deleted person's row is removed, not marked.

## The identity data

The account panel shows what only the identity service holds about a person, their sign-ins and
their sessions, and the page never talks to the identity service: it asks this Worker, which calls
the identity service's account API on the person's behalf
([decision 0049](../decisions/0049-account-panel.md)).

- `GET /api/account/identity` answers the identity service's view as it is:
  `{ "user", "identities": [{ "provider", "email", "emailVerified", "handle", "linkedAt" }],
"sessions": [{ "sid", "label", "createdAt", "lastSeen", "expiresAt", "current" }], "canUnlink" }`,
  with `"claimed": true` beside it when a GitHub sign-in of the view claimed a donation
  ([Sponsorships](../cloud.md#sponsorships)), after which the page reads the session answer again.
- `POST /api/account/identity/unlink` with `{ "provider" }`,
  `POST /api/account/identity/sessions/revoke-others` and
  `POST /api/account/identity/sessions/<sid>/revoke` answer the same view after the change.

Only a person signed in on the page may call them: a bearer API token is `403 request.forbidden`
(an automation does not manage the account) and nobody is `401 auth.required`; the Origin rule
applies to the three `POST`s. Each call to the identity service carries the person's session token,
the cookie's value, as `Authorization: Bearer`, and this product's signature: `Meltemi-Product:
diagrams`, `Meltemi-Timestamp` and `Meltemi-Signature`, made by `signProductRequest` of
`@meltemi/identity` with `IDENTITY_EVENTS_SECRET`, the secret this product shares with the identity
service, which already verifies its deletion events. The identity service's refusals that the
panel acts on keep their codes (`identity.last`, `provider.unknown`, `session.current`,
`session.not-found`, `rate.limited`); a session that ended at the identity service is `401
auth.required`; no answer within five seconds, an answer that is not the view, or a refused
signature is `502 identity.unavailable`, logged with the route and the status, never a body.
Linking a provider and deleting the account are not here: the panel sends the person to the
identity service's own pages, which bring them back.

## Deletion events

When a person deletes their account the identity service tells every product it lists. It knows
this Worker as the product `diagrams`: its `PRODUCTS` setting holds
`[{"name":"diagrams","events":"https://diagrams.meltemi.dev/_identity/events"}]`
(`http://localhost:8788/_identity/events` in development) and its secret `EVENTS_SECRET_DIAGRAMS`.
The `IDENTITY_EVENTS_SECRET` of this Worker must hold that same value.

```http
POST /_identity/events
Content-Type: application/json
Meltemi-Event-Id: evt_9f2c
Meltemi-Signature: v1=ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12

{"id":"evt_9f2c","type":"user.deleted","sub":"u_7d3f","at":"2026-10-14T12:00:00.000Z"}
```

The signature is `v1=` and the hexadecimal HMAC-SHA256 of the body, keyed with the events secret.
There is no person and no `Origin` here: the signature over the exact text of the body is the whole
authentication, and it is checked before the body is read as JSON (`401 signature.invalid`). The
body is read up to 8 KiB; it must be a JSON object with the text fields `id`, `type`, `sub` and
`at` (an ISO 8601 time), else `400 request.invalid`. The event's identity is the body's `id`.

- `user.deleted` first destroys the room and deletes the thumbnail of each of the person's
  projects and the pages they published, then removes, in one atomic step, everything held for the
  `sub` (the user, its tokens and its pending approval codes, its projects with their file rows,
  uploads, versions and version files, members, invitations, publications and publish requests;
  the person's memberships in the projects of others, whose open sockets there are cut; the
  invitations addressed to the email
  of their user row when the identity service had verified it; their administrator row and the
  invitations to administer they made that nobody answered; and their claims of sponsorships, which
  are unclaimed again) and records the event: its id, the
  `sub` and its time. It then revokes the OAuth grants the person approved before the deletion
  ([Connected apps](../cloud.md#connected-apps)), whose tokens are refused from then on, and answers `200`
  with the status `applied`. The `blobs` rows are shared
  by content and stay; the weekly [collection](../cloud.md#the-collection-of-blobs) takes the ones nothing
  else references. The takedowns and the administration log stay too: they are the service's
  record ([Takedown](../cloud.md#takedown), [The administration log](../cloud.md#the-administration-log)). An invitation
  to administer addressed to the person's email stays until it expires: an email is not an account.
  Delivery is at least once, so a repeat of the same event id changes
  nothing and answers `200` with the status `duplicate`; and a repeat of an event that was already
  handled does not touch the rooms nor the pages of a person who signed in again and made projects
  since. Every step is safe to repeat, so a delivery that follows a failure finishes the job.
- Any other signed type is acknowledged with `200` and the status `ignored`, and changes nothing.
- The answer is `200` only after the data is gone. If the store fails the answer is `500`, and the
  identity service tries again (the README of `@meltemi/identity` has its schedule). With no
  `IDENTITY_EVENTS_SECRET` configured every event is `500 internal`, logged.

The record of the event is what refuses the deleted person's old sessions (see
[The session cookie](../cloud.md#the-session-cookie)): a session issued at or before the second of the
deletion counts as nobody, and one issued in a later second is a person signing in again. The
record is kept 31 days, because a session lasts thirty and the identity service retries an event
for seven; the sweep removes older ones. What stays of a deleted person is their opaque `sub` and
the time of the deletion, the record of a takedown of a page of theirs, and the entries of the
administration log that name them; nothing else.

## The command line's sign-in

`mdg login` signs the command line in by asking a person to approve it in the browser. The steps are
these; [the command line](../cli.md#signing-in-login-logout-and-whoami) describes the terminal's side:

1. The command line listens on `127.0.0.1` at a free port, makes a random `state` (16 to 128
   base64url characters), prints a six-character check and opens
   `https://diagrams.meltemi.dev/cli-auth?port=<n>&state=<s>`.
2. `GET /cli-auth` checks the request first, whoever asks. The port is an integer from 1024 to
   65535 in plain decimal digits (`80`, `localhost:4000` and `08080` are not ports) and the `state`
   is 16 to 128 base64url characters, each given once; anything else is a `400` page with
   `cli.invalid`. A person who is signed out, or who only has a token (a token does not approve
   another), is sent to sign in and comes back to this same address. A person signed in sees
   "Allow the command line on this computer?" in English or Spanish (`?lang=en|es`, else the
   browser's language), with their name, the port, the check and an **Approve** button.
3. The check is the first six characters of the RFC 4648 base32 (upper case, no padding) of the
   SHA-256 of the `state`. The terminal prints the same six, so a person can tell their own request
   from somebody else's.
4. **Approve** posts the form to `POST /cli-auth`. It needs the cookie, the `Origin` rule and the
   page's `csrf` (the hex HMAC-SHA256 of `cli-auth:<sid>` keyed with `FORMS_SECRET`, so it belongs
   to one session). The Worker stores a one-time code, 32 random bytes in base64url of which only
   the SHA-256 is kept, bound to the person and the `state` for five minutes, and answers `303` to
   `http://127.0.0.1:<port>/?code=<code>&state=<state>`. The host is always `127.0.0.1`, whatever
   the request says. No token exists yet, and none ever appears in an address.
5. The listener receives `code` and `state`, checks that the `state` is its own and posts
   `{ "code": "…", "state": "…" }` to `POST /cli-auth/token`, with no cookie and no `Origin`.
6. The exchange takes the code (it is gone whatever follows). A code that is unknown, used or older
   than five minutes, a `state` that does not match, or a body that cannot be read, is
   `400 cli.invalid`. Otherwise it creates a token named `CLI (<date>)`, with the UTC date of the
   exchange, for the person the code is bound to and answers `200 { "id", "name", "token" }` once.
   A person who already holds 20 tokens gets `413 quota.tokens` and no token, and the code is
   gone: they revoke one and run `mdg login` again.

The token is made at the exchange, not at the approval, because only the SHA-256 of an API token is
ever stored: no API token in clear rests anywhere, not even for five minutes, and none reaches the
browser's address or history.

The listener is strict about what it takes. It answers only a `GET /` addressed to `127.0.0.1` and
its own port (a name that resolves to this machine is turned away), with one `code` and one `state`
equal to its own, and it stops listening at the first such request. It waits five minutes, as long
as a code lives. The exchange carries no token, and the token it answers is kept in the credentials
file before the browser is told that signing in finished. `mdg login --token` is the way in for a
machine without a browser: it reads a token made in the page from standard input and learns its id
and owner from `GET /api/session` with that token ([The session answer](../cloud.md#the-session-answer)).

The exchange is rate-limited by caller, a keyed hash of `CF-Connecting-IP` (the address itself is
never stored, and callers with no address share one bucket). Ten failures within the last minute
make the next request `429 cli.rate` with `Retry-After: 60`, checked before the body is read; the
code it carried is left alone. An unreadable body, an unknown or expired code and a wrong `state`
are failures; a success and a quota refusal are not. A caller's failures older than an hour are
removed when it fails again. Besides that, every failed exchange and every approval first sweeps
what nobody comes back for, whoever it belongs to: the failures of any caller more than an hour old,
the approval codes that have expired, the deletion records more than 31 days old, the entries of
the administration log more than 365 days old and, since publishing sweeps first as well, the
publish requests more than an hour old. A code nobody
exchanges and a caller who never returns would otherwise stay for ever, and a flood of either would
grow the tables without end; with the sweep they hold the last few minutes and the last hour. The
weekly cron sweeps as well, so that a deployment nobody approves, fails or publishes on does not keep
the records of a deletion longer than 31 days.

The approval page sends its own headers. Its policy is `default-src 'none'`, `style-src 'self'`,
`img-src 'self'`, `base-uri 'none'`, `frame-ancestors 'none'` and
`form-action 'self' http://127.0.0.1:*`: Chromium applies `form-action` to the redirect that
follows a form post, so the loopback address must be in it. `Referrer-Policy` is `same-origin`,
because `no-referrer` would make the browser post the form with `Origin: null`, which the `Origin`
rule refuses. The page is never cached; its style sheet is `GET /cli-auth/style.css`.

## The publish host

The publish host is a second, minimal Worker. `src/publish.ts` is its logic, a function of a request,
a bucket and a database, and `src/publish-worker.ts` is its entry; `wrangler.publish.jsonc`
configures it with two bindings, the D1 database `DB` and the R2 bucket `BLOBS` (the same ones as the
main Worker's), and nothing else: no assets, no Durable Object, no variable and no secret. It can
only read. `pnpm --filter @meltemi/diagrams-cloud exec wrangler dev -c wrangler.publish.jsonc` runs
it on port 8789, over the same persisted state as `pnpm cloud:dev` (give both the same
`--persist-to` folder). Its address is the Custom Domain `meltemi.page`, which the family's
Terraform attaches ([Deploying](cloud-implementation.md#deploying)); its configuration holds no route and no `workers.dev`
address.

It answers `GET` and `HEAD` of `/<handle>/<slug>/` and of `/<handle>/<slug>/index.html`, for a
publication whose row exists, and `404` to everything else: `/`, `/playground.js`, `/api/…`, a
handle or a slug that does not have the shape the service makes, a path of another shape, another
method, and `/<handle>/<slug>` without its final slash (a redirect would be an answer other than
`404`, and the address a person is given has the slash). A path is read as it came, with no
percent-escape decoded: an address has one spelling. A page is served with:

| Header                                   | Why                                                                                                        |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `Content-Type: text/html; charset=utf-8` | It is a page, whatever the stored bytes are                                                                |
| `Cache-Control: public, max-age=300`     | Five minutes: an update shows soon, and a page that is unpublished may still show for as long from a cache |
| `X-Content-Type-Options: nosniff`        | The browser does not take it for another type                                                              |
| `Referrer-Policy: no-referrer`           | A link in a published page tells nobody where the reader came from                                         |

The page's own policy is the `meta` tag the catalog build wrote ([catalog](../catalog.md#offline-by-construction));
no header adds to it. Every `404` has the same body, `Not found` as `text/plain`, with
`Cache-Control: no-store` and the same `nosniff` and `no-referrer`, so a page published a moment
later is not hidden behind a cached `404` and nothing tells a stranger why an address is empty. A
failure of the bucket or the database is `500` with the body `Something went wrong`, and a row
whose page is missing from the bucket is `404` and a line in the log. The Worker reads no header of
the request, sets no cookie, and never answers an API route.

`PUBLISH_HOST` is read where an address is built, and is refused there (`500 internal`, the log
naming the variable) unless it is a lowercase host name with a dot and no scheme, port or path, is not
the host of the service, and is neither the domain the session cookie is shared across (the identity
service's host without its first label, `meltemi.dev`) nor under it. That is the rule of decision
0042 made mechanical: the one configuration mistake that would serve what people published from a
host that receives the cookie cannot be made quietly. A value the service cannot use costs publishing
and nothing else.

The main Worker never serves the publish host (its `Host` check answers `404` to any other host). In
development (`DEV`) it serves the same page, with the same headers, under
`/_published/<handle>/<slug>/` on its own origin, so that the suites and a person running
`pnpm cloud:dev` can see what a visitor would: `GET` and `HEAD`, the address with or without
`index.html`, and nothing else; `/_published` is a reserved prefix, so any other path under it is the
Worker's JSON `404` in any spelling, and without `DEV` every path under it is. In production the
route never serves anything, because a page a person wrote on the origin that holds the cookie and
the API is the very thing the publish host exists to prevent.

## The collection of blobs

A blob goes when nothing has referenced it for seven days. A weekly cron trigger (`0 3 * * SUN`:
Sundays at 03:00 UTC, in `wrangler.jsonc`) runs `scheduled` in `src/worker-handler.ts`, which calls
`collectBlobs` (`src/collect.ts`). It has two steps, in this order:

1. Rows. The `blobs` rows that no `project_files`, `project_blobs` or `version_files` row
   references and that are more than seven days old, oldest first, 500 at a time and at most 20
   rounds. The row goes first, in one atomic step that checks again that it is unreferenced and
   old (a blob registered or referenced since the list was read stays), and the bytes second: a
   failure between the two leaves an object that no row names, never a row without bytes. An
   object written since the cutoff is not deleted: the same bytes were put again after the row
   went (an upload, a materialisation), and their writer registers them next.
2. Orphans. The objects under `blobs/` that no row names and that are more than seven days old,
   found by listing the bucket (1000 a page, at most 20 pages): what a materialisation put to R2
   before its batch failed, and what step 1 could not delete.

A row that is registered again (the same bytes uploaded again) is made as new as that moment, so a
blob that was just wanted again is not taken. The run logs one line (blobs removed, objects
deleted, orphans, failed deletes, and whether more is left for the next run), and a failure of the
store ends the run with an error that the next one, a week on, finishes.

The known gaps: only `blobs/` is listed, so a thumbnail whose project is gone but whose object was
never deleted stays; a run is bounded, so a large backlog takes more than one week; a blob younger than seven
days waits even when nothing references it; and an image removed from a project's document without
a successful `DELETE …/binaries` (the page calls it first when it is online, and skips it offline)
keeps its `project_blobs` row, so its bytes stay and count in the usage until the project is
deleted.

## Authorization

The endpoint is the one protected resource of an OAuth 2.1 authorization server in the same Worker,
`@cloudflare/workers-oauth-provider` 1.2.3 (MIT). Its state (clients, grants, codes, tokens and
consents) is the D1 table `oauth_store` (migration 0010), where codes, tokens and client secrets are
kept as hashes and a grant's props encrypted. The library reads and writes a KV namespace, so
`src/oauth/store.ts` gives it the table with the part of that interface it uses (`get` as text or
JSON, `put` with an expiry and metadata, `delete`, `list` by prefix in key order with a cursor), with
KV's semantics: an expired entry is absent from every read, and the weekly cron removes it. The
Worker binds no KV namespace: the family's Terraform token cannot create one, and the Free plan's
1,000 KV writes a day for the whole account would not last a dozen connected agents (a sign-in
writes about five entries, an hourly refresh about three), where D1 allows 100,000 rows written a
day. Its addresses:

## Administration

Two roles administer the service. The **owners** are the `sub`s listed in the `ADMIN_SUBS` secret,
read on every request ([Variables and secrets](cloud-implementation.md#variables-and-secrets)): always administrators, never
removed from the page, and the only ones who invite and remove administrators; unset or empty, the
service has no owner. The **administrators** are the people an owner invited
who accepted, rows of `administrators` ([Storage](cloud-implementation.md#storage)); a `sub` listed in `ADMIN_SUBS` that
also has a row is an owner. They use Identity's central console, reached from [the account menu](../web-app.md#the-account-panel).
It invokes the routes below through the [private administration service](../central-administration-service.md),
which verifies a live session and retains these per-action roles. Diagrams has no administration
forms or browser administration client.

The room gets a request that the Worker constructs: the fixed internal address
`https://room/connect` and only the headers the Worker sets, `X-Meltemi-Project`,
`X-Meltemi-Sub`, `X-Meltemi-Role` (the role the Worker resolved: `owner`, `editor` or `viewer`, or
`viewer` for a person the project admits only by a token), `X-Meltemi-Name` and `X-Meltemi-Picture`
(the last three URL-encoded), `X-Meltemi-Guest: 1` for a person without an account,
`X-Meltemi-Address` (the client's address, `CF-Connecting-IP`) and `X-Meltemi-Live`, the token,
only when the socket's query carried one. Nothing of the browser's request is forwarded, neither
its path nor any header, so a spoofed `X-Meltemi-Role` or `X-Meltemi-Live` never reaches the room.
The room reads the role from the Worker's header alone, treats an unknown role as the least a
person can be (`viewer`), refuses a connection with no `sub`, and refuses as an internal error a
`guest:` sub without the guest header or the guest header with another sub, so that the prefix
names a guest and nothing else. The identity, the guest flag, the address, the session that
admitted the connection and a random connection id are kept in the socket's attachment, which
survives hibernation.

The room's own routes (`/files`, `/restore`, `/materialise`, `/destroy`, `/stats`,
`/disconnect` and `/live`) answer only requests that the Worker constructs:
`POST /rooms/<id>/destroy` or `POST /rooms/<id>/live` from a browser, with the owner's cookie, is
`404 not-found`, and the room keeps its document, revision and session.

```json
{
  "5d0e7a1c9b24f3a8": {
    "user": {
      "sub": "u_8a21",
      "name": "Ben",
      "picture": "https://…",
      "colour": "#1c7ed6",
      "guest": false
    },
    "file": "k7h2m4n9p3q5r8s2",
    "caret": { "anchor": "AQID", "head": "AQIE" },
    "canvas": { "selection": ["api"], "pointer": { "x": 120, "y": 80, "diagram": "flow" } }
  }
}
```

**On connect.** After `hello` and its state vector the room sends the newcomer one kind 2 message
with the states of the other clients, in the same shape, read from the sockets' attachments: those
heard from within the last thirty seconds, and no message at all when there are none. The newcomer
is announced to the others with its first state, not when it connects. The room does not keep the
canvas selection or the pointer, so a newcomer learns them from the sender's next state; a page
sends its state again every fifteen seconds.

**Hibernation.** The room keeps no awareness in memory that it cannot rebuild. Each socket's
attachment holds, beside the identity, the client's last state as a compact record: the colour, the
`file`, the encoded `caret` and when it was last heard. The platform caps an attachment at 2 KiB, so
when a record would not fit the caret is dropped first and then the file. An object that was evicted
and built again therefore still sends the states on connect and still knows when to drop them: the
alarm outlives the object and fires in the new one. The one thing not kept is the count of messages
in the last second: a room built again counts from nothing.

- An awareness message over 16 KiB, the kind byte included, closes its sender with
  `message.too-large` (`4413`), and the others stop seeing its state, as for any socket that
  closes. The room's own cap of 512 KiB for any message applies first.
- Up to 20 awareness messages in a second from one client (a sliding window) are relayed. The 21st
  and those after it are dropped: not relayed, not renewing the state and counted in
  `awarenessDropped`. A dropped message still counts in the window, so the 101st within a second
  closes the socket with `awareness.rate` (`4429`). The window is per connection: a person's two
  tabs count apart.
- A page sends at most four states a second and cuts a canvas selection to 200 ids and 12,000 bytes,
  so only a client that is not the page reaches any of these limits. A moving pointer, and the
  points of a Pointer stroke, ride in the same message as the caret and the selection: they add no
  message of their own (64 points at four batches a second are under 2 KiB a second, far inside the
  16 KiB a message may take).
- Awareness is the same for everyone who may connect: a viewer sends and receives it like an
  editor, and only a viewer's updates are refused ([The socket](../cloud.md#the-socket)).

Each state is one incoming message for the room, and the platform counts incoming WebSocket
messages twenty to one against the request budget of a Durable Object on the free plan. The page's
throttle and the cap of twenty clients bound it: a full room in which every caret moves sends at
most 80 states a second, and a client that only sits sends four a minute. The development counters
tell how many arrived ([The development routes](cloud-implementation.md#the-development-routes)).

### Sponsorships

A donation is how a person who is not entitled becomes so without anyone's hand. GitHub Sponsors takes the money, issues
the receipts and pays out; this service only learns that a sponsorship exists, from the Sponsors
webhook of the sponsored account, and matches it to the account that linked the same GitHub sign-in.
The sponsored account is `SPONSORS_ACCOUNT`, a GitHub login (`askenaz`); unset or empty, as
`wrangler.jsonc` ships it until the owner's steps below are done, the service has no donation path:
`POST /_sponsors/github` answers `404 not-found`, the session answer carries no `support`, the
administration answer's `sponsorships` is `[]` and nothing is claimed.

`POST /_sponsors/github` is GitHub's call: no cookie, no person and no `Origin` rule. GitHub sends:

```http
POST /_sponsors/github
Content-Type: application/json
X-GitHub-Event: sponsorship
X-GitHub-Delivery: 72d3162e-cc78-11e3-81ab-4c9367dc0958
X-Hub-Signature-256: sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17

{"action":"created","sponsorship":{"created_at":"2026-11-04T09:30:00+00:00","sponsorable":{"login":"askenaz"},"sponsor":{"login":"ana","id":4242,"type":"User"},"privacy_level":"public","tier":{"monthly_price_in_cents":1000,"is_one_time":false}}}
```

The route checks, in this order, and changes nothing before the signature is verified:

1. The body is declared `application/json` (a charset is fine), else `415 request.unsupported`; the
   webhook's form chooses the content type.
2. The body is read up to 64 KiB, else `400 request.invalid`, and its stream is let go.
3. `X-Hub-Signature-256` is `sha256=` and the hexadecimal HMAC-SHA-256 of the exact bytes of the body,
   keyed with `SPONSORS_WEBHOOK_SECRET`, compared in constant time (WebCrypto's `verify`), else
   `401 signature.invalid`, with the body never parsed. A blank secret refuses every delivery with
   `500 internal`, logged by name.
4. The body is a JSON object, else `400 request.invalid`. A `ping`, and any event but `sponsorship`,
   is `200 { "ignored": true }`.
5. A sponsorship event carries `X-GitHub-Delivery`, `sponsorship.sponsor.login`, `.id` and `.type`,
   `sponsorship.tier.is_one_time` and `.monthly_price_in_cents`, `sponsorship.privacy_level`
   (`public` or `private`), `sponsorship.created_at` and `sponsorship.sponsorable.login`, each of its
   shape, else `400 request.invalid`. A sponsorable that is not `SPONSORS_ACCOUNT` (ignoring case) is
   `200 { "ignored": true }`.
6. `created`, a payment GitHub processed, one-time or monthly and of any amount, keeps a row in
   `sponsorships`: the delivery's id, the sponsor's login, numeric id and type, whether the tier is
   one-time, its amount in cents, the privacy level, the creation time and the status `active`,
   unclaimed: `200 { "recorded": true }`. The same delivery id again is `200 { "repeated": true }` and
   changes nothing, so GitHub's retries and the dashboard's Redeliver are safe.
7. `edited`, `tier_changed` and `pending_tier_change` set the status `active`,
   `pending_cancellation` sets `pending-cancellation`, and `cancelled` sets `cancelled`, for good, on
   the newest sponsorship of that login and kind: `200 { "updated": true }`, or `false` when there is
   none to change. No entitlement changes: a donation was made. Another action is
   `200 { "ignored": true }`.

Nothing of a delivery is logged, neither its body nor its signature nor the secret. A failure of the
store is a `500`, which GitHub's dashboard shows as a failed delivery to redeliver.

**The claim.** `GET /api/account/identity` reads the person's sign-ins from the identity service
([the identity data](../cloud.md#the-identity-data)); while the service has a sponsored account, each GitHub
sign-in whose login (`handle`) is an unclaimed sponsorship's of a `User`, ignoring case, claims every
unclaimed sponsorship of that login for the account and grants it `unbranded-exports`, recording the
grantor `github-sponsors` and the time in the user's row and appending a `grant` to the log with the
detail `unbranded-exports (<login>)`, all in one atomic step: the log entry goes in only while a
claimable row and the person's row exist, and the grant and the claim follow only that entry, so a
second claim, even in the same instant, writes nothing. The answer is the view with `"claimed": true`
beside it, and the page reads the session answer again. A claimed sponsorship is never claimed
again: another account that links the same login later is granted nothing. A cancellation keeps the
grant. An administrator may still revoke it, or grant by hand to whom an organisation names or to a
sponsor who signs in with Google only (who may also link GitHub, and the next opening of the panel
claims). A failure of the claim is logged and the sign-ins are answered anyway. Deleting the account
(`user.deleted`) clears its claims in the same step as the rest, so the sponsorship may be claimed
again by whoever links that login. The claim matches the login, not GitHub's numeric id, which the
sign-ins do not carry; the row keeps the id for the day they do.

**The owner's steps on GitHub.** Until they are done, `SPONSORS_ACCOUNT` stays empty:

- [ ] Enrol the sponsored account (`askenaz`) in GitHub Sponsors, from a supported region (Chile is
      one), with its payout and tax details.
- [ ] Publish a one-time tier and monthly tiers whose reward text says "Export without the Meltemi
      branding in the web app; the file's theme can do the same with `frame none`".
- [ ] In the Sponsors dashboard, create the webhook: payload URL
      `https://diagrams.meltemi.dev/_sponsors/github`, content type `application/json`, a long random
      secret, and the `sponsorship` event.
- [ ] Give the same secret to the family's infrastructure: the secret `SPONSORS_WEBHOOK_SECRET` of
      Meltemi Web's `infrastructure` environment, which its Terraform reads as
      `sponsors_webhook_secret` and stores as `SPONSORS_WEBHOOK_SECRET` in the Secrets Store (a
      single space until then), and set `"SPONSORS_ACCOUNT": "askenaz"` in `wrangler.jsonc`.
- [ ] After the deploy, check that GitHub's dashboard shows the webhook's `ping` answered `200`.
- [ ] Add **Support the project** to meltemi.dev/diagrams/ and /es/diagrams/ in Meltemi Web,
      linking `https://github.com/sponsors/askenaz`: that page only redirects to the profile until
      the account is enrolled, so the link waits for these steps.

The two sides of the secret drift only by hand: a delivery answered `401` in the dashboard says so,
and the owner enters the same secret on both again.

## Reserved service and development HTTP contracts

| Route                                         | Who may call                                                       | Answer                                        |
| --------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------- |
| `POST /_identity/events`                      | the identity service                                               | `200 { status }`                              |
| `POST /_sponsors/github`                      | GitHub Sponsors, signed; nobody without `SPONSORS_ACCOUNT` (`404`) | `200`, recorded, repeated, updated or ignored |
| `GET` and `HEAD /_published/<handle>/<slug>/` | anyone; development only                                           | `200`, the published page                     |
| `GET /api/dev/rooms/<id>/stats`               | development only: `200`, the room's counters                       |
| `POST /api/dev/rooms/<id>/disconnect`         | development only: `200 { closed }`                                 |
| `POST /api/dev/rooms/<id>/limits`             | development only: `200 { clients }`                                |
| `POST /api/dev/collect`                       | development only: `200`, what the collection did                   |

| Code                  | Status | Meaning                                                                                                                                           |
| --------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `signature.invalid`   | 401    | A deletion event whose `Meltemi-Signature` does not match its body, or a sponsorship delivery whose `X-Hub-Signature-256` does not match its body |
| `request.unsupported` | 415    | A sponsorship delivery whose body is not declared `application/json`                                                                              |

Every body is read through a cap, whoever sends it, so that nobody makes the Worker hold what it did
not ask for: a deletion event and the approval form up to 8 KiB, a
sponsorship delivery up to 64 KiB, the JSON of the page (a token's
name, a project's name, a label) up to 8 KiB, the command line's exchange up to 4 KiB. A body that
is longer, or says it is, is read no further and its stream is let go. For the JSON and the events
that is `400 request.invalid`; the approval form is posted by people who are signed out as well,
and a form that is too long is a body that is not a form, so they are sent to sign in and a person
signed in gets the refused page. The projects' routes that carry content have caps of their own,
each answered with the code of its limit: a create or a push up to a whole document and a megabyte
(17 MiB, `doc.too-large`), an upload 10 MiB (`quota.binary`), a thumbnail 200 KiB
(`thumbnail.too-large`) and a publish request 24 MiB, the page's 16 MiB and 8 MiB for the JSON around
it (`publish.too-large`). The JSON of sharing (an invitation, a role, a link level) and of a takedown
is read up to 8 KiB like the rest.

## The MCP endpoint

`POST /mcp` is a Model Context Protocol server (Streamable HTTP, stateless) through which an agent
acts on the account's projects (change `agent-mcp`). It is built with `createMcpHandler` of
`@modelcontextprotocol/server` 2.3.1 (Apache-2.0) and `zod` 4.6.7 (MIT): the 2025 revisions of the
protocol are answered through its stateless leg (an event stream with the one answer), the
2026-07-28 revision as JSON. No session id is issued; `GET` and `DELETE` are `405`. In this order,
before the SDK reads anything: an `Origin` that is not the page's is `403 request.forbidden`, a
`MCP-Protocol-Version` the SDK does not serve is `400`, a request without a token the authorization
server or the service holds is `401` with
`WWW-Authenticate: Bearer realm="OAuth", resource_metadata="<origin>/.well-known/oauth-protected-resource"`
([Authorization](#authorization); the cookie is never taken here), and a body over 24 MiB is `413`.
The authorization server's library, the SDK and the tools are imported the first time an isolate
serves `/mcp`.
