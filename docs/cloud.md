# The cloud service

[Español](es/cloud.md)

The cloud service is the optional online half of Meltemi Diagrams: one Cloudflare Worker
(`packages/cloud`) that serves the [playground](playground.md) and an API from one origin,
`diagrams.meltemi.dev`, and signs people in through the Meltemi family's identity service at
`id.meltemi.dev`. The reasons are in decisions [0041](decisions/0041-hosted-service.md) and
[0042](decisions/0042-sharing-and-publishing.md). This page describes what the service does today:
accounts, API tokens, the sign-in of the command line and projects kept in the cloud: their
document and its room, their storage, versions, thumbnails and quotas, and the API that reads and
writes them; who may open a project and as what ([sharing and permissions](#sharing-and-permissions):
the link level, members and invitations, viewing by link); and publishing a project as a web page on
a host of its own ([publishing](#publishing)). The room also relays who else has a project open
and where they are, and keeps none of it ([awareness](#awareness)). The command line's own commands,
which push a folder to a project, pull one and publish its catalog, are in
[the command line](cli.md#the-cloud-commands); this page has the service's half.

## The account is a layer

The page works with no account. Served by any static server it is what
[decision 0031](decisions/0031-web-playground.md) describes: work stays in the browser, share links
carry the project after `#`, and nothing leaves the page's own origin. Served by this Worker it
offers an account on top of that and takes nothing away:

- Signed out, the page asks its own origin once, when it starts, who is signed in, and shows a
  **Sign in** link. A static server has no API, so the build writes the answer into the site:
  `api/session` holds `{"user":null}`. A network error, a status other than `200` and a body that
  is not JSON all mean that nobody is signed in, silently.
- Signing in and out are navigations to `id.meltemi.dev` (a link and a form post), never requests
  the page makes, so the page's `connect-src` stays `'self'`. Neither the page nor the Worker ever
  handles a password or a provider token: the Worker only verifies the family's session cookie.
- Everything the account adds is in the header and in the API. The editor, the canvas, the exports
  and the share links work as they always have.
- The one thing the account adds that holds your work is a cloud project
  ([A cloud project](#a-cloud-project)). A person makes one, or saves the project of the browser
  to one; nothing is uploaded otherwise, and the project in the browser is never replaced by it.

## One Worker, one origin

`packages/cloud/wrangler.jsonc` gives the Worker the playground's build, `packages/playground/dist`,
as its static assets (the `ASSETS` binding, with no fallback page), and makes it run first for the
paths it answers itself (`run_worker_first`: `/api/*`, `/_identity/*`, `/_published/*`, `/cli-auth`,
`/cli-auth/*`, `/p/*` and `/rooms/*`). Every other path is served by the assets platform without
running the Worker. The page and the API are one origin: no CORS, and the page's policy keeps
`connect-src 'self'`.

### The paths and the Host

`cloud()` dispatches on the request's `Host`, which must be the host of `ORIGIN`:

| The request                                                                                                                        | The answer                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| A path that a route answers (see [Routes](#routes))                                                                                | The route                                                                    |
| A path under `/api`, `/_identity`, `/_published`, `/cli-auth`, `/p` or `/rooms` with no route, or a known path with another method | JSON `404 not-found`, never an asset, in any spelling (`/%61pi/session` too) |
| Any other path                                                                                                                     | The static asset (the page, its scripts, its fonts), or the platform's `404` |
| Any other host, the publish host included                                                                                          | JSON `404 not-found`: no asset and no API                                    |

In development (`DEV`) the origin is the request's own, so a local request always passes. The
publish host never reaches this Worker: it is another Worker ([The publish host](#the-publish-host)).
`/_published/` is the prefix of the one development route that serves a publication from this
origin; without `DEV` every path under it is the JSON `404`.

The page's own files leave with two headers that the playground's build writes into `_headers`,
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

### Project links

`GET /p/<id>` is the address of a project. The page is always served at `/` (its asset
addresses are relative and its policy forbids `<base>`), so the Worker answers `302` to
`/?project=<id>`, keeping the rest of the query (`?invite=` included) and dropping any `project`
the query itself carries. An id is 20 lowercase letters and digits; anything else is
`404 project.not-found`, with no redirect. The page reads `project` and `invite` from
`location.search`, accepts the invitation if there is one ([Invitations](#invitations)), opens that
project in the mode the person's role gives ([Viewing by link](#viewing-by-link)) and keeps the
address, so a reload reopens it; the link a person copies is `<origin>/p/<id>`. `/rooms/<id>` is
the socket of a project's room ([The socket](#the-socket)); any other method on it, and any request
that is not a WebSocket upgrade, is `404 not-found`.

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
   anonymous callers to the routes that only read ([Sharing and permissions](#sharing-and-permissions)).
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
only the routes of [the identity data](#the-identity-data) read it, to present it to the identity
service on the person's behalf.

A session issued before its person was deleted does not count either. The verifier trusts a live
session for an hour, and in that hour the deleted person's own open tab would otherwise create
their row again and make tokens. So for a verified cookie the Worker asks whether a deletion of
that `sub` was handled at or after the moment the session was issued (see
[Deletion events](#deletion-events)); if so the request goes on as anonymous and no row is made.
A person who signs in again has a later session and is not affected.

### Users

From the first authenticated request with the cookie the Worker keeps a user row by `sub`, caching
the token's `name`, `picture`, `email` and `email_verified`. Every request compares them with the
row and refreshes it when they differ, so a new sign-in with another name or picture updates it.
The row also holds what the token does not carry: the person's handle, once they chose one
([Handles](#handles)), and whether an administrator entitled the account to export without the
Meltemi branding, with who did it and when ([Entitlements](#entitlements)). A deleted person's row
is removed, not marked.

## The Origin rule

Every host under `meltemi.dev` receives the session cookie and is the same site for `SameSite`: a
form on another host can post to this service with the cookie attached. The cookie alone is
therefore never consent. A request made with the cookie, with any method other than `GET`, `HEAD`
or `OPTIONS`, must carry an `Origin` equal to the service's own origin (`ORIGIN`, or the request's
own origin in development), or it is `403 request.forbidden` before the route runs. A missing
`Origin`, `null` and anything that is not an address do not count as the page's. `Referer` and
`Sec-Fetch-Site` are not consulted: the first can be absent and older browsers lack the second.

A bearer token is exempt, because a browser never adds one on its own. The events and the code
exchange resolve no person and have their own checks. A WebSocket upgrade is a `GET`, so this rule
does not cover it; the route of the socket checks the upgrade's `Origin` itself
([The socket](#the-socket)).

The other rule that comes with the cookie is that nothing a person wrote or uploaded is ever served
from a host under `meltemi.dev`: published content has its own domain (decision 0042), and the
service refuses to build a public address on a host that would break the rule
([The publish host](#the-publish-host)).

## Errors

Every error is JSON, `{ "code": "…", "message": "…" }`, with `Cache-Control: no-store`. The code is
stable; the message is English and never holds a token, a cookie, a secret or a stack. A few
answers carry one more field the caller can act on: a stale push holds the room's current
`revision`. The codes are the keys of `ERROR_STATUS` in `src/errors.ts`, where a new one is added
first; a test checks that this table lists every one of them with its status, and no other.

The room's own refusals reach a person two ways: as the JSON of a route (`PUT /files`, a create), or
on the socket, as a kind 4 message and a close code ([The room's protocol](#the-rooms-protocol)).
The same code names both.

| Code                   | Status | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `not-found`            | 404    | No route answers: an unknown path under a reserved prefix, a known path with another method, a request to a socket that is not an upgrade, any path on another host, a token id that is not yours, a blob the project does not hold, a thumbnail it does not have, an image or font that is not at the path a delete names, a member, an invitation or a publication that a route names and that is not there, the administrators' route asked by anyone who is not an administrator, and a publication that the development route does not find (without `DEV`, every path under `/_published/`)                                                                                                                                                                                                   |
| `project.not-found`    | 404    | A project that does not exist or that the asker may not open at all, such as a private one that is not theirs (one answer for both, so nobody learns which exist), and `/p/<id>` with an id that cannot be a project id; on a socket, the room of a project that was deleted                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `request.invalid`      | 400    | The body is not what the route reads: not a JSON object, a token name that is empty, over 60 characters or holds control characters, an event over 8 KiB or without its `id`, `type`, `sub` and `at`; a project name that is empty, over 100 characters or holds control characters, a description over 500, a label over 80; a template that does not exist or is given with files; files, binaries or a push that are not objects of text by path; a binary hash that is not 64 lowercase hexadecimal characters; a link level that is not `private`, `view` or `edit`, a role that is not `viewer` or `editor`, an email that is empty, over 254 characters or without a dotted domain, the owner's own email as an invitation; a takedown reason over 500 characters or with control characters |
| `auth.required`        | 401    | The route needs a person and the request carries none (no credentials, or a cookie that is invalid or expired), on a project whose link admits anonymous callers, a request that signing in would allow (a push when the link is `edit`) or that needs an account anyway (a copy, leaving); a socket upgrade without a valid cookie, because a bearer token is not taken on a socket                                                                                                                                                                                                                                                                                                                                                                                                                |
| `token.invalid`        | 401    | A bearer token that is unknown, revoked or not an API token                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `signature.invalid`    | 401    | A deletion event whose `Meltemi-Signature` does not match its body                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `request.forbidden`    | 403    | A change made with the cookie from a page that is not the service's (the `Origin` rule), or a socket upgrade whose `Origin` is not the service's; a bearer token asking for what only the page may do (creating a token); on the approval page, a form without the right `csrf`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `quota.tokens`         | 413    | The account already holds 20 API tokens                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `cli.invalid`          | 400    | The command line's request cannot be used: a port or `state` the approval page does not accept, a code that is unknown, used or expired, a `state` that does not match, or an exchange that cannot be read                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `cli.rate`             | 429    | A caller that has made 10 failed code exchanges in the last minute; `Retry-After: 60`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `path.invalid`         | 400    | A file path that breaks [the path rule](#the-path-rule): in a create, a push, an upload or a delete of a binary; on a socket, a transaction that sets such a path (rolled back, close code `4400`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `blob.unknown`         | 400    | An image or font that names a hash the project never uploaded (`project_blobs`), or in a create one that none of the person's projects holds; on a socket, a transaction that sets such a hash (`4400`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `doc.invalid`          | 400    | A change the document cannot keep: a path that is both a text and a binary in one change, a value of another shape, a root type of its own, a text frame or a message of a kind a client may not send; on a socket, `4400`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `doc.too-large`        | 413    | A text over 2 Mi characters, a document whose encoded state is over 16 MiB, or a body over a whole document's size; on a socket, the transaction is rolled back (`4413`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `quota.files`          | 413    | A project that would hold more than 2000 files; on a socket, rolled back (`4413`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `quota.projects`       | 413    | The account already holds 100 projects                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `quota.storage`        | 413    | An upload that would take the account over 200 MiB (bytes it already references do not count again)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `quota.binary`         | 413    | An image or font over 10 MiB                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `binary.invalid`       | 400    | An upload that is not a PNG, JPEG, GIF, WebP, SVG, woff2, ttf or otf by its bytes, whatever its `Content-Type` says                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `quota.versions`       | 413    | A project that already holds 200 versions after the policy has thinned what it may, asked for another version or a restore                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `versions.rate`        | 429    | More than six versions made for one project within a minute (a restore counts); `Retry-After: 60`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `version.not-found`    | 404    | A version number the project does not hold: never made, thinned, or not a number                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `thumbnail.too-large`  | 413    | A thumbnail over 200 KiB                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `thumbnail.invalid`    | 400    | A thumbnail that is not sent as `image/svg+xml`, or whose body is not a well-formed SVG                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `thumbnail.rate`       | 429    | A second thumbnail for one project within 30 seconds; `Retry-After` says how many seconds are left                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `revision.mismatch`    | 409    | A push whose `ifRevision` is not the room's current revision; the answer carries that `revision` and nothing changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `access.denied`        | 403    | Someone who sees the project but may not do this: a viewer, or an anonymous caller on a `view` link, changing it; an editor, or anyone the link admits, doing what only the owner may (change sharing, invite, publish, rename or delete); the owner leaving their own project; on a socket, an update from a viewer (`4403`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `invite.invalid`       | 404    | An invitation link that is unknown, was already used or is older than thirty days (a token that is not 32 lowercase hexadecimal characters is the same answer); nothing is accepted                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `quota.members`        | 413    | A project that already holds 50 members and pending invitations together (the owner is not counted, nor is an invitation older than thirty days); nothing is recorded                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `handle.invalid`       | 400    | A handle that is not 3 to 30 lowercase letters, digits or hyphens: nothing is trimmed or lower-cased for the person                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `handle.taken`         | 409    | A handle that another account holds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `handle.locked`        | 409    | A change of handle while a publication is addressed by the current one; choosing the same handle again is always fine                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `handle.required`      | 409    | A publication by a person who has not chosen a handle yet, answered before the body is read                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `publish.invalid`      | 400    | A page name (slug) that is not 1 to 60 lowercase letters, digits or hyphens, or an `html` that is not text or is empty                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `publish.too-large`    | 413    | A page of more than 16 MiB (UTF-8), or a publish request too large to hold one (over 24 MiB); nothing changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `publish.rate`         | 429    | More than ten publish requests for one project in the last hour; `Retry-After` says how many seconds until the earliest of them stops counting                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `publish.taken`        | 409    | A slug that another project of the same person already publishes under their handle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `message.too-large`    | 413    | A message on a socket over 512 KiB, or an awareness message over 16 KiB ([Awareness](#awareness)); the socket closes with `4413`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `room.full`            | 409    | A room that already holds 20 clients, guests and visitors included: the 21st is told and its socket closes with `4409`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `awareness.rate`       | 429    | A client that sent more than 100 awareness messages within a second: it is told on the socket and the socket closes with `4429` ([Awareness](#awareness)); no route answers it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `connections.limit`    | 429    | The eleventh open connection without an account from one client address: it is told on the socket and the socket closes with `4428` ([Live sessions](#live-sessions)); no route answers it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `session.ended`        | 410    | The live session that admitted a connection ended (its owner ended it, its 24 hours passed, or its room was empty for an hour): the socket closes with `4410` ([Live sessions](#live-sessions)); no route answers it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `identity.last`        | 409    | The identity service keeps a person's only way of signing in: an unlink of the last provider from the account panel; nothing changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `provider.unknown`     | 400    | A provider the identity service does not sign people in with (`github` and `google` only)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `session.current`      | 409    | The session the request comes with, asked to be signed out from the account panel: it ends with Sign out instead                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `session.not-found`    | 404    | A session that is not the person's, or none at all                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `rate.limited`         | 429    | The identity service's bound on this service's account calls for one person: sixty a minute                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `identity.unavailable` | 502    | The identity service did not answer within five seconds, or answered something this service cannot read (a refused signature among them, which is a configuration problem); logged with the route and the status, never a body                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `internal`             | 500    | Anything unexpected, or a configuration the service cannot run with; the answer holds no detail; on a socket, a message the room could not handle (`4500`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

The approval page at `/cli-auth` answers `cli.invalid` and `request.forbidden` as pages that show
the code, in English or Spanish, instead of JSON.

## Routes

| Route                                               | Who may call                                              | Answer                                                            |
| --------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------- |
| `GET /api/session`                                  | anyone                                                    | `200`, who the page is for                                        |
| `POST /api/tokens`                                  | a person signed in on the page                            | `201 { id, name, token }`                                         |
| `GET /api/tokens`                                   | a person, with the cookie or a token                      | `200 { tokens }`                                                  |
| `DELETE /api/tokens/<id>`                           | a person, with the cookie or a token                      | `204`                                                             |
| `POST /_identity/events`                            | the identity service                                      | `200 { status }`                                                  |
| `GET /cli-auth`                                     | anyone; a person signed in approves                       | the approval page, or a redirect to sign in                       |
| `POST /cli-auth`                                    | a person signed in on the page                            | `303` to the command line's listener                              |
| `POST /cli-auth/token`                              | the command line                                          | `200 { id, name, token }`                                         |
| `GET /cli-auth/style.css`                           | anyone                                                    | the approval page's style sheet                                   |
| `GET /p/<id>`                                       | anyone                                                    | `302` to `/?project=<id>`                                         |
| `GET /rooms/<id>`                                   | anyone the project admits, or a live session's token      | `101`, a socket to the project's room                             |
| `PATCH /api/account`                                | a person, with the cookie or a token                      | `200 { handle }`                                                  |
| `GET /api/account/identity`                         | a person signed in on the page                            | `200`, the identity service's sign-ins and sessions of the person |
| `POST /api/account/identity/unlink`                 | a person signed in on the page                            | `200`, the same without the provider                              |
| `POST /api/account/identity/sessions/revoke-others` | a person signed in on the page                            | `200`, the same with this session alone                           |
| `POST /api/account/identity/sessions/<sid>/revoke`  | a person signed in on the page                            | `200`, the same without that session                              |
| `POST /api/invitations/<token>/accept`              | a person, with the cookie or a token                      | `200`, the project, with the role the person now has              |
| `DELETE /api/admin/publications/<handle>/<slug>`    | an administrator, with the cookie; anyone else gets `404` | `204`                                                             |
| `GET /api/admin/accounts/<account>/entitlements`    | an administrator, with the cookie; anyone else gets `404` | `200`, the account's entitlement                                  |
| `PUT /api/admin/accounts/<account>/entitlements`    | an administrator, with the cookie; anyone else gets `404` | `200`, the account's entitlement                                  |
| `GET /api/admin/entitlements`                       | an administrator, with the cookie; anyone else gets `404` | `200`, the entitled accounts                                      |
| `GET` and `HEAD /_published/<handle>/<slug>/`       | anyone; development only                                  | `200`, the published page                                         |

The projects' routes each name the role they need: the owner's, an editor's or, for what only
reads, a viewer's, which the project's link may give to anyone, signed in or not
([Sharing and permissions](#sharing-and-permissions) has the table and the order of the refusals).
A route that needs more than the link gives needs a person, with the cookie or a token; a project
the person may not open at all is `404 project.not-found`. [The projects API](#the-projects-api),
[Sharing and permissions](#sharing-and-permissions) and [Publishing](#publishing) have their
shapes.

| Route                                          | Answer                                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------------------------ |
| `GET /api/projects`                            | `200 { projects }`                                                                   |
| `POST /api/projects`                           | `201`, the project                                                                   |
| `GET /api/projects/<id>`                       | `200`, the project                                                                   |
| `PATCH /api/projects/<id>`                     | `200`, the project                                                                   |
| `DELETE /api/projects/<id>`                    | `204`                                                                                |
| `POST /api/projects/<id>/duplicate`            | `201`, the copy (and `skipped`, when files were left)                                |
| `GET /api/projects/<id>/files`                 | `200 { revision, files, binaries, collisions }`                                      |
| `PUT /api/projects/<id>/files`                 | `200 { revision }`                                                                   |
| `PUT /api/projects/<id>/binaries/<path>`       | `200 { hash }`                                                                       |
| `DELETE /api/projects/<id>/binaries/<path>`    | `204`                                                                                |
| `GET /api/projects/<id>/blobs/<hash>`          | `200`, the bytes, sandboxed                                                          |
| `HEAD /api/projects/<id>/blobs/<hash>`         | `200`, the headers of the `GET`                                                      |
| `POST /api/projects/<id>/versions`             | `201`, the version                                                                   |
| `GET /api/projects/<id>/versions`              | `200 { versions }`                                                                   |
| `GET /api/projects/<id>/versions/<n>`          | `200`, the version with its files                                                    |
| `POST /api/projects/<id>/versions/<n>/restore` | `200 { revision, restored, saved, skipped? }`                                        |
| `PUT /api/projects/<id>/thumbnail`             | `204`                                                                                |
| `GET /api/projects/<id>/thumbnail`             | `200`, the SVG, sandboxed                                                            |
| `GET /api/projects/<id>/sharing`               | `200`, the link level, the asker's role and, as far as they may see them, the people |
| `PATCH /api/projects/<id>/sharing`             | `200`, the whole state of the sharing                                                |
| `POST /api/projects/<id>/members`              | `201`, the invitation with its link (`200` when the email already had one pending)   |
| `PATCH /api/projects/<id>/members/<sub>`       | `200`, the member                                                                    |
| `DELETE /api/projects/<id>/members/<sub>`      | `204`                                                                                |
| `DELETE /api/projects/<id>/members/me`         | `204`                                                                                |
| `GET /api/projects/<id>/invitations`           | `200 { invitations }`                                                                |
| `DELETE /api/projects/<id>/invitations/<id>`   | `204`                                                                                |
| `GET /api/projects/<id>/publish`               | `200 { handle, publications, takedowns }`                                            |
| `PUT /api/projects/<id>/publish`               | `200 { url, handle, slug, bytes, published_at }`                                     |
| `DELETE /api/projects/<id>/publish/<slug>`     | `204`                                                                                |
| `PUT /api/projects/<id>/live`                  | `200 { id, link, guestsEdit, startedAt, until, guests }`                             |
| `GET /api/projects/<id>/live`                  | `200`, the live session as `PUT` answers it, or `null`                               |
| `DELETE /api/projects/<id>/live`               | `204`                                                                                |
| `GET /api/account/usage`                       | `200 { projects, storageBytes, limits }`                                             |
| `GET /api/dev/rooms/<id>/stats`                | development only: `200`, the room's counters                                         |
| `POST /api/dev/rooms/<id>/disconnect`          | development only: `200 { closed }`                                                   |
| `POST /api/dev/rooms/<id>/limits`              | development only: `200 { clients }`                                                  |
| `POST /api/dev/collect`                        | development only: `200`, what the collection did                                     |

Times are ISO 8601 in UTC with milliseconds.

Every body is read through a cap, whoever sends it, so that nobody makes the Worker hold what it did
not ask for: a deletion event and the approval form up to 8 KiB, the JSON of the page (a token's
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

### The session answer

`GET /api/session` is the page's one request when it starts. It answers `200` with
`Cache-Control: no-store`, in one of three shapes. A person with the cookie:

```json
{
  "user": {
    "sub": "u_7d3f",
    "name": "Ana",
    "picture": "https://avatars.githubusercontent.com/u/1",
    "handle": "ana",
    "entitlements": { "unbranded": false }
  },
  "account": "https://id.meltemi.dev/account",
  "signOut": "https://id.meltemi.dev/logout"
}
```

`handle` is the name the person publishes under, or `null` until they choose one
([Handles](#handles)). `entitlements.unbranded` says whether the account may export without the
Meltemi branding: `true` when an administrator entitled it, and for every administrator
([Entitlements](#entitlements)). Before it answers, a cookie whose email the identity service verified has
every pending invitation for that email turned into a membership
([Invitations](#invitations)); an email that is not verified resolves nothing. `account` is the
identity service's page and `signOut` the address a form posts to, with the field `return_to`, to
end the session. A bearer token, so that the command line learns which token it holds, with
neither `account` nor `signOut`; it carries the handle too, but resolves no invitation, because
only the cookie holds a verified email:

```json
{
  "user": {
    "sub": "u_7d3f",
    "name": "Ana",
    "picture": "https://avatars.githubusercontent.com/u/1",
    "handle": "ana",
    "entitlements": { "unbranded": false }
  },
  "token": { "id": "5f0c2a9e", "name": "laptop" }
}
```

Anybody else, a cookie that does not verify included:

```json
{
  "user": null,
  "signIn": "https://id.meltemi.dev/login?return_to=https%3A%2F%2Fdiagrams.meltemi.dev%2F"
}
```

The `return_to` is the page's own address: the service's origin plus the path and query of the
request's `Referer` when that is under the origin, else `/`. It is built from the origin, so
credentials or a fragment in a `Referer` never reach it, and an address over 2048 characters, which
the identity service refuses, falls back to `/`.

### API tokens

A token is `mdg_` followed by 32 random bytes in base64url. It is shown once, in the answer that
creates it; only its SHA-256 is stored. Tokens never expire: a lost one is revoked.

The command line sends a token as `Authorization: Bearer` and keeps its own in the user's
configuration folder: `mdg login` makes one ([below](#the-command-lines-sign-in)), `mdg logout`
revokes it with `DELETE /api/tokens/<id>`, and `MELTEMI_TOKEN` in the environment replaces it, which
is how CI signs in. It sends a token only to the host it resolved (never the host a `project.json`
names), never over `http:` except to the loopback, and never follows a redirect with it; and it
never prints one: `mdg_…` is redacted from everything the command line writes
([the command line](cli.md#the-host-and-the-token), [safety](security.md#the-command-line-and-the-cloud)).

- `POST /api/tokens` with `{ "name": "laptop" }` answers `201` with `{ "id", "name", "token" }`.
  Only a person signed in on the page may ask (the `Origin` rule applies): a token cannot make
  another token, so a stolen one cannot mint copies that outlive its revocation. The name is
  trimmed and has 1 to 60 characters, without control characters. An account holds at most 20
  tokens, then `413 quota.tokens`.
- `GET /api/tokens` answers `{ "tokens": [{ "id", "name", "created_at", "last_used_at" }] }`, the
  newest first; `last_used_at` is `null` until the token is first used. Neither a token nor its
  hash is ever part of it.
- `DELETE /api/tokens/<id>` revokes one of the asker's tokens, the one making the request included,
  and answers `204`. An id that is someone else's or does not exist answers `404 not-found` alike.
  From then on the token is `401 token.invalid`.

### The identity data

The account panel shows what only the identity service holds about a person, their sign-ins and
their sessions, and the page never talks to the identity service: it asks this Worker, which calls
the identity service's account API on the person's behalf
([decision 0049](decisions/0049-account-panel.md)).

- `GET /api/account/identity` answers the identity service's view as it is:
  `{ "user", "identities": [{ "provider", "email", "emailVerified", "handle", "linkedAt" }],
"sessions": [{ "sid", "label", "createdAt", "lastSeen", "expiresAt", "current" }], "canUnlink" }`.
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

### Deletion events

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
  the person's memberships in the projects of others, whose open sockets there are cut; and the
  invitations addressed to the email
  of their user row when the identity service had verified it) and records the event: its id, the
  `sub` and its time. Then it answers `200` with the status `applied`. The `blobs` rows are shared
  by content and stay; the weekly [collection](#the-collection-of-blobs) takes the ones nothing
  else references. The takedowns stay too: they are the service's record
  ([Takedown](#takedown)). Delivery is at least once, so a repeat of the same event id changes
  nothing and answers `200` with the status `duplicate`; and a repeat of an event that was already
  handled does not touch the rooms nor the pages of a person who signed in again and made projects
  since. Every step is safe to repeat, so a delivery that follows a failure finishes the job.
- Any other signed type is acknowledged with `200` and the status `ignored`, and changes nothing.
- The answer is `200` only after the data is gone. If the store fails the answer is `500`, and the
  identity service tries again (the README of `@meltemi/identity` has its schedule). With no
  `IDENTITY_EVENTS_SECRET` configured every event is `500 internal`, logged.

The record of the event is what refuses the deleted person's old sessions (see
[The session cookie](#the-session-cookie)): a session issued at or before the second of the
deletion counts as nobody, and one issued in a later second is a person signing in again. The
record is kept 31 days, because a session lasts thirty and the identity service retries an event
for seven; the sweep removes older ones. What stays of a deleted person is their opaque `sub` and
the time of the deletion and, when the service took a page of theirs down, the record of that
takedown; nothing else.

### The command line's sign-in

`mdg login` signs the command line in by asking a person to approve it in the browser. The steps are
these; [the command line](cli.md#signing-in-login-logout-and-whoami) describes the terminal's side:

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
and owner from `GET /api/session` with that token ([The session answer](#the-session-answer)).

The exchange is rate-limited by caller, a keyed hash of `CF-Connecting-IP` (the address itself is
never stored, and callers with no address share one bucket). Ten failures within the last minute
make the next request `429 cli.rate` with `Retry-After: 60`, checked before the body is read; the
code it carried is left alone. An unreadable body, an unknown or expired code and a wrong `state`
are failures; a success and a quota refusal are not. A caller's failures older than an hour are
removed when it fails again. Besides that, every failed exchange and every approval first sweeps
what nobody comes back for, whoever it belongs to: the failures of any caller more than an hour old,
the approval codes that have expired, the deletion records more than 31 days old and, since
publishing sweeps first as well, the publish requests more than an hour old. A code nobody
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

## A cloud project

A cloud project is a Yjs document held by one Durable Object, its room. The room merges the edits
of every device, checks them, persists them and answers readers, so there is one write path
whoever writes: the page, another device or a push through the API. The files are also
materialised from the document to content-addressed blobs, which is what versions, copies and the
weekly collection work on. The room tells owners, editors and viewers apart: a viewer connects and
receives every change, and may not write ([Sharing and permissions](#sharing-and-permissions)).

A project's id is 20 characters of lowercase base32 (`a` to `z` and `2` to `7`) from 12 random
bytes, chosen by the Worker: it is the project's address (`/p/<id>`) and the name of its room. A
file's id is 16 characters of base32 from 10 random bytes, chosen by whoever adds the file, and it
never changes.

### The document

```text
Y.Doc
├── files:    Y.Map<fileId, Y.Text>   // the text files the page edits
├── paths:    Y.Map<fileId, string>   // every file's path, text and binary alike
└── binaries: Y.Map<fileId, string>   // images and fonts: SHA-256 (hex) of the bytes
```

A text file is a `Y.Text` in `files` and a path in `paths`; an image or a font is a hash in
`binaries` and a path in `paths`, and its bytes live in R2 ([Storage](#storage)), never in the
document. Those are the only three root types: a client that creates another is refused
(`doc.invalid`).

Files have ids so that a rename is one small change: `paths.set(id, newPath)`. The text's `Y.Text`
is the same instance, so its history and the concurrent edits of other devices go on, and the
update a rename sends is under 1 KiB whatever the size of the file. Everything outside the document
speaks paths: `GET` and `PUT …/files`, the page's binding and the command line translate between
path and id.

Two ids can end up with one path (two devices add or rename a file to the same name while
offline). The result is deterministic and never silent: the lexically smaller id keeps the path,
the other is shown as `<path>~<id>`, and both are listed as `collisions`, each
`{ path, keeper, id, shown }`, in `hello` and in `GET …/files`, so the page can tell the person.
`<path>~<id>` is a display name that [the path rule](#the-path-rule) refuses, so a copy of the
project and a restore leave such a file out and name it in `skipped`. Renaming one of the two ends
the collision.

### The path rule

One rule names every file of a cloud project: `cleanPath` and `isCleanPath` of
`@meltemi/diagrams-project` (`packages/project/src/files.ts`), which the playground re-exports and
the Worker, the room and the command line import. A path is valid when it is already in canonical
form: relative, `/`-separated, with 1 to 12 segments, each of 1 to 100 characters that are ASCII
letters, digits, `_`, space, `.`, `(`, `)`, `+`, `@` or `-`, none of them `..` and none starting
with a dot. `diagrams/flow.meltemi` passes; `../secrets.meltemi`, `.git/hooks/post-checkout`,
`a\b.meltemi`, `a//b`, `./a`, `a:b`, a path with a control character, an accented letter or 13
segments do not.

`cleanPath` turns backslashes into slashes and drops empty and `.` segments; `isCleanPath(path)`
asks whether `cleanPath` would change nothing, and that is what the cloud enforces: it never
repairs a path. The room applies it to every transaction whatever its origin (socket, push,
restore) and every route that takes a path applies it too (create, push, upload and delete of an
image or font): `400 path.invalid`. On a socket the transaction is rolled back and the socket
closes with `4400`.

What else the room checks on every transaction, whatever its origin, in this order: the shape
(every key of `files` and `binaries` has a path in `paths`, `files` values are plain `Y.Text`,
`binaries` values are 64 lowercase hexadecimal characters, no id is both, nothing but the three
root types: `doc.invalid`); the paths (`path.invalid`); at most 2000 entries in `paths`
(`quota.files`); at most 2 Mi characters in a text (`doc.too-large`); every hash present in
`project_blobs` for this project (`blob.unknown`); at most 250 000 structs in the document, the
unit Yjs keeps in memory, which the encoded size does not bound (`doc.too-large`); and at most
16 MiB of encoded document (`doc.too-large`). It looks only at what the transaction changed, so a keystroke costs a
keystroke, and it encodes the document to measure it only when it is near the limit. A transaction
that breaks a rule is rolled back (the room rebuilds the document from its last good state and the
updates committed since) and its sender is told.

### The socket

The page connects to `wss://<origin>/rooms/<project id>` (`ws:` when the page is served over
`http:`, as in development). The Worker answers `GET /rooms/<id>` only for a WebSocket upgrade; any
other method, or a request without the upgrade, is `404 not-found`, whoever asks. Then, in this
order:

1. Who is asking, from the cookie alone: a bearer token is not taken on a socket (a request with
   one and no cookie is anonymous).
2. Where the upgrade comes from: its `Origin` must be the service's own, or it is
   `403 request.forbidden`, with a token as without one.
3. What the person is to the project ([Roles](#roles)): `owner`, `editor`, `viewer`, or nothing.
   Nothing, without a live session's token (`?live=<token>`), is `404 project.not-found`, as are a
   project that does not exist and an id that cannot be one. With a token the project must exist
   (a room is never made for an id the store does not hold), and the room checks the token itself
   ([Live sessions](#live-sessions)).
4. Who the connection is. A person signed in is their account: `sub`, name and picture. A person
   without an account is a guest: `?guest=` must be the 32 lowercase hexadecimal characters their
   browser made once and keeps (`400 request.invalid` otherwise), their `sub` is `guest:<id>`,
   their name is `?name=` trimmed when it has 1 to 40 characters and no control character (else
   "Guest NN", NN two digits from the id), and they have no picture. Without a token a guest is a
   `viewer`, which is what any link that admits an anonymous person gives: an anonymous visitor of
   a `view` or `edit` link follows the room live.

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

The role is fixed when the socket opens. A viewer receives everything an editor writes, as
everyone does, and the first update a viewer sends is refused: the room tells it with
`access.denied` and closes the socket with `4403`, and the document and its revision stay as they
were. Awareness is not an update: a viewer sends and receives it like anyone
([Awareness](#awareness)). A change of access cuts the sockets it may have outdated, so that the role is resolved again
([When access changes](#when-access-changes)).

The room's own routes (`/files`, `/restore`, `/materialise`, `/destroy`, `/stats`,
`/disconnect` and `/live`) answer only requests that the Worker constructs:
`POST /rooms/<id>/destroy` or `POST /rooms/<id>/live` from a browser, with the owner's cookie, is
`404 not-found`, and the room keeps its document, revision and session.

### The room's protocol

Messages are binary; the first byte is the kind.

| Kind | Name        | Direction      | Payload                                                                                                                                                                                                                                                                                                |
| ---- | ----------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0    | `sync`      | both ways      | A state vector. From a client: the room answers with a kind 1 of what the client lacks (always, even when it has nothing to send). From the room: its own vector, sent once after `hello` and whenever an update waits for what it depends on; the client answers with a kind 1 of what the room lacks |
| 1    | `update`    | both ways      | A Yjs update. From a client the room applies it as one transaction, raises the revision, schedules a write and a materialisation, and sends it to every other client; from the room it is a change the client applies as coming from elsewhere                                                         |
| 2    | `awareness` | both ways      | Presence ([Awareness](#awareness)). From a client: its own state. From the room: the states of other clients, each with the identity the room knows for the sender, or `null` for a client that is gone. The room only relays it                                                                       |
| 3    | `hello`     | room to client | JSON, once on connect: `{ role, revision, limits, collisions, you, live }`                                                                                                                                                                                                                             |
| 4    | `error`     | room to client | JSON `{ code }`, then the socket closes                                                                                                                                                                                                                                                                |

`hello` says what the person is to the project, the revision the room is at, the limits it
enforces, the collisions of the document, which connection this is (`guest` for a person without
an account), and, for a connection a live session admitted, the session's end and whether guests
edit (`null` for any other):

```json
{
  "role": "owner",
  "revision": 41,
  "limits": {
    "files": 2000,
    "documentBytes": 16777216,
    "textCharacters": 2097152,
    "message": 524288,
    "clients": 20
  },
  "collisions": [],
  "you": {
    "id": "9f3c2a71d04be856",
    "sub": "u_7d3f",
    "name": "Ana",
    "picture": "https://…",
    "guest": false
  },
  "live": null
}
```

After `hello` the room sends its state vector. The client sends its own, receives what it lacks and
sends what the room lacks, and both documents are the same: that is also how edits made offline
reach the room, with nothing special on reconnect.

An update that changes nothing, because the room has it already (whole or in part), is accepted
without a trace: no revision, no broadcast, no write. A client may therefore send its whole
document at every connection. An update that waits for what it depends on (the room lost its last
second, or the client sent too little) is not kept, and the room answers with its state vector so
that the client sends what is missing, that update included (the room asks once, until an update of
that client is whole). An update that names a root type of its own, even one that waits, is
`doc.invalid`. A text frame, an empty message and a kind a client may not send
(`hello`, `error` or an unknown one) close the socket with `doc.invalid`.

A refusal is a kind 4 message, `{ "code": "…" }`, and then the socket closes with a code that says
which family the refusal is of:

| Close code | Error code                                          | When                                                                                                                                                                                         |
| ---------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4400       | `path.invalid`, `blob.unknown`, `doc.invalid`       | A transaction, or a frame, that breaks a rule of the document; the transaction is rolled back                                                                                                |
| 4403       | `access.denied`                                     | A viewer sent an update                                                                                                                                                                      |
| 4404       | `project.not-found`                                 | The project was deleted while the client was connected                                                                                                                                       |
| 4409       | `room.full`                                         | The 21st client: it gets no `hello`                                                                                                                                                          |
| 4410       | `session.ended`                                     | The live session that admitted the connection ended                                                                                                                                          |
| 4413       | `doc.too-large`, `quota.files`, `message.too-large` | A text over 2 Mi characters or a document over 16 MiB, more than 2000 files, a message over 512 KiB (below the platform's 1 MiB, so that the room sees it), an awareness message over 16 KiB |
| 4428       | `connections.limit`                                 | The eleventh open connection without an account from one client address: it gets no `hello`                                                                                                  |
| 4429       | `awareness.rate`                                    | A client sent more than 100 awareness messages within a second                                                                                                                               |
| 4500       | `internal`                                          | The room could not handle a message                                                                                                                                                          |
| 4000       | none                                                | The development tool ([The development routes](#the-development-routes)), or a change of access ([When access changes](#when-access-changes)), cut the connection; not a refusal             |

The page tells a dropped connection from a refusal: a close with no kind 4 message and no code from
4400 to 4429 is a drop, and it reconnects after one second, doubling up to thirty; a refusal is
shown to the person and the socket reopens after half a second, doubling on repeats. `4404` is
neither: the project no longer exists, so the page stops reconnecting, says so and keeps what it
has. Nor are `4410` and `4428`: the page stops reconnecting with that address, says why, and goes on
as [Live sessions](#live-sessions) describes.

A room that already holds 20 clients turns the 21st away with `room.full`, with one exception: the
owner and the editors with an account are let in as long as a viewer or a guest holds a place.
That one gives up its place and is told `room.full` as if it had come last; it is the newest socket
of the person who holds the most of those sockets, so that an account, or a guest's browser, that
opened many sockets to keep the room full loses its own first. A viewer or a guest (of any role)
is never let in over anybody, and the owner and the editors are refused when the 20 are all people
with an account who can write.

### Awareness

Awareness is what each page tells the others about its person: the file they have open, where their
caret or selection is in it, what they have selected on the canvas and where their pointer is over
it, and the points of a Pointer stroke. It travels in kind 2
messages, and the room only relays it: nothing of it is written to the room's storage, and it
changes neither the document nor its revision. [The playground](playground.md#working-together)
shows it. The format is small and the page's own: an object keyed by connection, as Yjs's awareness
protocol does it, without the `y-protocols` package.

**From a client.** After the kind byte the payload is UTF-8 JSON: an object with exactly one entry,
the client's own state, or `null` when it has none any more. Every part of a state is optional (a
person with no file open sends `{}`):

```json
{
  "9f3c2a71d04be856": {
    "file": "k7h2m4n9p3q5r8s2",
    "caret": { "anchor": "AQID", "head": "AQIE" },
    "canvas": {
      "selection": ["api", "db"],
      "pointer": { "x": 312, "y": 148, "diagram": "flow" },
      "laser": {
        "diagram": "flow",
        "points": [
          { "x": 312.4, "y": 148, "t": 0 },
          { "x": 320, "y": 151.5, "t": 24 }
        ]
      }
    }
  }
}
```

- `file` is the id of the file the person has open (`paths` gives its name), so presence survives a
  rename.
- `caret` holds two Yjs relative positions in that file's text, encoded by the page; each is at most
  256 characters and the room does not read them. Being positions in the text and not offsets, they
  stay on the same characters while others edit.
- `canvas.selection` lists the ids selected on the canvas, each at most 256 characters.
- `canvas.pointer` is where the person's pointer is over their canvas, while it moves there: two
  numbers in diagram units, finite and within a million of the origin, which the room rounds to
  integers, and the id of the diagram it is over.
- `canvas.laser` is the trail of the Pointer tool (K on the canvas): the points a stroke made since
  the client's last state, at most 64, each `x` and `y` in diagram units (finite, within a million of
  the origin, kept to a tenth) and `t` an integer number of milliseconds since the first point, 0 to
  1000, and the id of the diagram the points are over. A batch over those bounds, or a point of the
  wrong shape, makes the whole message invalid. A laser rides in the same message as the pointer
  and is relayed once: the room never keeps it, and a state it relays later has none.
- `canvas.laser.pen`, when present, says the batch is a stroke being drawn with the pen or the
  highlighter, not the Pointer's trail: `{ "width", "colour", "opacity", "stroke", "cancel"? }`,
  the width an integer from 1 to 64, the colour a string of at most 32 characters, the opacity a
  number from 0 to 1, `stroke` an integer from 0 to 2,147,483,647 that the person's page increases
  with each stroke (every batch of one stroke carries the same number), and `cancel`, when present,
  `true`: the batch, whose points may be none, ends a stroke cancelled with Escape. Other canvases
  draw the batches of one number as one stroke that grows and does not fade, never joined to the
  stroke before, until the drawing that holds the written `pen` arrives; a cancel drops it at once.
  A part over those bounds makes the whole message invalid.

A canvas part holds a selection, a pointer, a laser or any of them.

The key of the entry is ignored (the page uses its connection id), and the room reads nothing else
of the state: a `user`, a name or any other field is never relayed. A message of another shape (not
JSON, with no entry or with more than one, a `file` that is not a file id, a caret with one end, a
selection that is not a list of text) is dropped and counted; it does not close the connection and
does not renew the client's state.

**To the clients.** The room sends each state to every other client, never back to its sender, as
an object keyed by the sender's connection id (the `you.id` of its `hello`), with the identity in
`user`:

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

The `user` is the room's and never the client's: the `sub`, name and picture the Worker gave the
socket when it opened ([The socket](#the-socket)), whatever the message said, with at most 200
characters of the `sub`, 100 of the name and 500 of the picture address. The `colour` comes from the
`sub`: one of twelve, chosen by an FNV-1a hash of it (`presenceColour` in
`@meltemi/diagrams-project`, which the page uses too), so the room and every page agree and no
client sends a colour. `guest` is true for a person without an account, from the connection and
never from the message, so that every page badges a guest and never takes one for an account.
Because the key is the sender's own, a client cannot speak for another's entry either. A page takes
a person's identity from this `user` alone.

**On connect.** After `hello` and its state vector the room sends the newcomer one kind 2 message
with the states of the other clients, in the same shape, read from the sockets' attachments: those
heard from within the last thirty seconds, and no message at all when there are none. The newcomer
is announced to the others with its first state, not when it connects. The room does not keep the
canvas selection or the pointer, so a newcomer learns them from the sender's next state; a page
sends its state again every fifteen seconds.

**Removal.** `{ "<id>": null }` from the room says that connection has no state any more. The room
sends it when a client sends `null` (if it had a state), when its socket closes (if it had one) and
when thirty seconds pass without a state from it. That timeout is an alarm: the room sets it for the
earliest last-heard time plus thirty seconds, and when it fires drops every state at least that old,
tells each client that remains (about the others, never about itself) and sets the next alarm. The
room has one alarm, and it serves a live session too ([Live sessions](#live-sessions)): it is set
for the earliest of the next awareness timeout, the session's end and the idle hour after the last
client left, and each time it fires it does what is due and sets the next. The sockets stay open, and a client that sends a state again is back. A
page sends a state when it changes, at most four times a second, and again every fifteen seconds as
a heartbeat, so a state thirty seconds old belongs to a page that went away.

**Hibernation.** The room keeps no awareness in memory that it cannot rebuild. Each socket's
attachment holds, beside the identity, the client's last state as a compact record: the colour, the
`file`, the encoded `caret` and when it was last heard. The platform caps an attachment at 2 KiB, so
when a record would not fit the caret is dropped first and then the file. An object that was evicted
and built again therefore still sends the states on connect and still knows when to drop them: the
alarm outlives the object and fires in the new one. The one thing not kept is the count of messages
in the last second: a room built again counts from nothing.

**Limits.**

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
  editor, and only a viewer's updates are refused ([The socket](#the-socket)).

Each state is one incoming message for the room, and the platform counts incoming WebSocket
messages twenty to one against the request budget of a Durable Object on the free plan. The page's
throttle and the cap of twenty clients bound it: a full room in which every caret moves sends at
most 80 states a second, and a client that only sits sends four a minute. The development counters
tell how many arrived ([The development routes](#the-development-routes)).

### Persistence

The room keeps the document in the SQLite of its Durable Object, in two tables: `meta` (the
revision, the number of chunks and the project's id) and `doc_chunks` (`n`, `bytes`). When the
object is constructed it reads `meta` and reassembles the encoded state from the chunks; storage
that is incomplete throws instead of starting empty, because the next write would make the loss
permanent. The room does one thing at a time (a message, a push, a read, a timer), so a reader
never sees a change before it was checked.

Writes are a throttle, not a debounce: the first change after a quiet second is written at once,
then at most once per second while changes keep arriving, with one more write after the last; and
in any case no later than ten seconds after the first change that is not yet written, so a client
that never pauses cannot postpone it. When the last client leaves, the room writes at once. A
write stores the whole encoded state in chunks of at most 1 MiB (a Durable Object SQLite value is
capped at 2 MB) and the revision, in one storage transaction. When storage refuses a write, the
document stays in memory and the room tries again a second later.

The revision rises by one for each update the room keeps (a message of a client, a push, a
restore), and is persisted with the document, so it counts on across restarts. A pending write or
materialisation keeps the object in memory with its timer; with nothing pending the object may
hibernate between messages, with its sockets still open, and the next message reloads the document
from storage.

The window of eviction. If the platform evicted an object that held an unwritten change, the room
could lose at most one second of edits, and ten for a client that never pauses. The loss is
transient: the page keeps the same updates in memory and in IndexedDB, the sockets reconnect, and
the room sends its state vector to every client that connects, so the page answers with what the
room lacks, whether the page stayed open or was reloaded in between. The alternative, appending
every update as a row, would be safer in that window and costs thousands of rows per typing
session against a daily budget of a hundred thousand.

### Reads and pushes

Readers read from the room, never from D1: the room has the latest state, and D1 can be thirty
seconds behind it.

- `GET /api/projects/<id>/files` answers the latest files, the ids translated to paths (a
  collision loser appears as `<path>~<id>`):

  ```json
  {
    "revision": 41,
    "files": { "diagrams/flow.meltemi": "diagram flow …" },
    "binaries": {
      "assets/logo.png": "9c56cc51b374c3ba189210d5b6d4bf57790d351c96c47c02190ecf1e430635ab"
    },
    "collisions": []
  }
  ```

  It needs the role `read`, which the project's link can give to anyone, signed in or not: it is the
  snapshot an anonymous viewer reads ([Viewing by link](#viewing-by-link)).

- `PUT /api/projects/<id>/files` takes a push (each part optional) and applies it as one
  transaction with origin `push`. It needs the role `write`: the owner, an editor, or a person
  signed in on a project whose link is `edit`:

  ```json
  {
    "files": { "diagrams/flow.meltemi": "diagram flow …", "old.meltemi": null },
    "binaries": { "assets/logo.png": null },
    "ifRevision": 41
  }
  ```

  An existing path keeps its id (a text keeps its `Y.Text` and is edited by the smallest change, so
  a connected client sees a small update and not a new file), a new path gets a new id, and `null`
  deletes the file at that path. It answers `{ revision }`, the room's revision after the push,
  which is the current one when the push changed nothing.

- With `ifRevision` the push applies only if the room is at exactly that revision; otherwise it is
  `409 revision.mismatch` with the current `revision`, and nothing changes.

The checks run in this order, and a push that fails any of them applies nothing: the shape of the
body (`400 request.invalid`; a body over 17 MiB is `413 doc.too-large`), every path by the rule
(`400 path.invalid`), a path that is a text and a binary at once (`400 doc.invalid`),
`ifRevision` (`409`), every hash against `project_blobs` (`400 blob.unknown`), and then the limits
of any transaction. A connected client receives a push like any update, and its page shows the
pushed text.

### Materialisation

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
before D1 is touched. Bytes put to R2 in vain wait for [the collection](#the-collection-of-blobs).
A failure never reaches the document: the room keeps it and its revision, logs "the files could
not be materialised" with no content, and tries again at its next trigger. Typing is never held up
either, because the room waits only for the snapshot and the writes go on beside it. A
materialisation that finds its project gone writes nothing but blob rows.

After the rows are written, the first materialisation of a UTC day that finds the files different
from the latest version records the daily version ([Versions](#versions)); a failure there is
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
and an approval code are different: only their hashes are kept ([API tokens](#api-tokens)).

Usage per account is the sum of `blobs.size` over the distinct hashes that its `project_files`,
`project_blobs` and `version_files` reference: a blob shared by two projects, or by a project and
its versions, counts once. It is kept in `users.storage_bytes` and refreshed at materialisation
(when files changed), version creation and restore, upload and delete of an image or font and
deleting a project; `GET /api/account/usage` returns it with the counts.

## The projects API

The routes that list, make or count a person's projects need a person, with the cookie or a token.
Every route on one project states the role it needs, and the owner has them all; what the others
may do, and the answers when it falls short, are in
[Sharing and permissions](#sharing-and-permissions). A person the project does not admit at all, a
project that does not exist and an id that cannot be one all answer `404 project.not-found`, so
nobody learns which projects exist; a change made with the cookie also passes the `Origin` rule. A
project, as every answer shows it:

```json
{
  "id": "k4c2w7x5q3y6m2n5r7d4",
  "name": "Purchase",
  "description": "",
  "updated_at": "2026-10-15T09:41:02.118Z",
  "thumbnail": "/api/projects/k4c2w7x5q3y6m2n5r7d4/thumbnail",
  "role": "owner"
}
```

`thumbnail` is `null` until the project has one, and `updated_at` follows the last
materialisation, rename or description change. `role` is what the person asking is to the project:
`owner`, `editor` or `viewer`, where a member's role is raised by the project's link when the link
gives more. The page opens the project in view mode when it is `viewer`.

### Projects

- `GET /api/projects` answers `{ projects }`, the most recently updated first: the person's own
  projects and the ones they are a member of, each with their `role`.
- `POST /api/projects` takes `{ name, description?, template? | files?, binaries? }` and answers
  `201` with the project. The name has 1 to 100 characters once trimmed, with no control
  characters; the description at most 500. `template` is one of `flow`, `c4`, `sequence`, `free`
  and `purchase`, and gives the files of the playground's own build with their `project.json`,
  read from its `templates.json`, so the page and the service offer the same bytes. `files` is
  `{ path: text }` and `binaries` is `{ path: hash }` of images and fonts that the person's
  projects already hold (another hash is `blob.unknown`: a hash is not a capability). A template
  and files are exclusive. Every path and every limit is checked before anything is made, so
  nothing is created for a request that would be refused. The project row is inserted in a
  statement that checks the quota, the files go into the room as one push and the first
  materialisation runs; one the room refuses (a document over 16 MiB) takes the project back, and a
  first materialisation that fails does not fail the create, because the room tries again.
- `GET /api/projects/<id>` answers the project, with the asker's `role`, to anyone the project's
  link admits, anonymous callers included.
- `PATCH /api/projects/<id>` takes `{ name?, description? }` and answers the project; a field left
  out keeps its value. It is the owner's: an editor changes the files, not what the project is
  called.
- `DELETE /api/projects/<id>` destroys the room's storage (its clients are told and closed with
  `4404`), deletes the thumbnail object and the pages the project published, and then removes the
  rows (the project, its files, `project_blobs`, its versions and their files, its members,
  invitations, publications and publish requests) in one atomic step and refreshes the usage. The
  blobs wait for the collection. Every step is safe to repeat, so a failure partway is an error and
  the person deletes again. A room that was destroyed refuses what comes after (a socket is closed
  with `4404`, a push or a restore is `404 project.not-found`) for as long as the object lives, so a
  caller that was let in before the rows went, a script that reconnects or a token that was valid,
  cannot write the project into the storage that was just emptied, where nothing would name it.
  It is the owner's, and answers `204`.
- `POST /api/projects/<id>/duplicate` takes `{ name? }` (it defaults to `<name> (copy)`) and answers
  `201` with a new project that holds the room's latest files, the description and a copy of the
  `project_blobs` rows. Versions are not copied. A file the path rule refuses (a collision loser)
  cannot go in a document and is left out, and the answer lists it as `skipped`. The copy is made
  in the account of whoever asks, and counts against their quota, not the owner's: anyone who may
  read a project may keep a copy of it. It needs a person: an anonymous caller on a project the link
  admits is `401 auth.required`.

### Images and fonts

`PUT /api/projects/<id>/binaries/<path>` takes the bytes as the body, whatever its `Content-Type`
says, at most 10 MiB (`413 quota.binary`; the body is not read past the cap), and answers
`{ "hash": "…" }`. The path follows [the path rule](#the-path-rule), each segment URL-encoded. It
needs the role `write`, and the bytes count against the storage of the project's owner, whoever
uploads them.

The type is read from the bytes and from nothing else. The magic bytes name PNG, JPEG, GIF, WebP
(`RIFF` and `WEBP`), woff2, ttf and otf. SVG has none, so `image/svg+xml` is accepted only when the
body is a well-formed XML document with an `svg` root: UTF-8 with no forbidden control character,
one root, tags that nest and close, quoted attributes that are not repeated, comments without
`--`, no entity but the five predefined and numeric references, and a DOCTYPE with no internal
subset, because that is the only way to declare an entity. Anything else is `400 binary.invalid`:
a `text/html` body that claims to be `image/png` is refused. An SVG with a `<script>` is a valid
upload; it is made harmless on the way out, below.

Then the bytes are hashed (SHA-256), and the account's storage is checked (`413 quota.storage`;
bytes the account already references do not count again). R2 comes first, then the `blobs` row,
then the `project_blobs` row, then the room sets the file's path and hash (`paths` and `binaries`
under one id), and has the last word on the document (`quota.files`, `doc.too-large`). When the
room refuses the change, the `project_blobs` row stays only if the project held the hash before.
The storage is checked a second time once the row is in, which counts in the usage: uploads that
run together all pass the first check, and the second is the one that holds, so the account never
ends over its bytes (an upload that is over takes its row back and is `413 quota.storage`; of two
that race, both may be refused). An upload that replaces the file at the path lets go of the hash
it replaced, unless another file of the project names it; a version that holds the bytes is served
from its own rows.
`DELETE /api/projects/<id>/binaries/<path>` removes the file from the room and the hash from
`project_blobs`, unless another file of the project uses the same bytes, and answers `204`; it is
`404 not-found` when no image or font is at that path. The bytes stay in R2 and in any version that
holds them until the collection finds nothing referencing them.

`GET /api/projects/<id>/blobs/<hash>` streams the bytes and `HEAD` answers the headers. They are
served only when `project_blobs` or a version of this project holds the hash, never the live map
and never another project's: `404 not-found` otherwise. They need the role `read`, so a project
whose link is `view` or `edit` serves its images and fonts to anonymous callers too, with the same
headers. Every answer carries:

| Header                                                | Why                                                                                                                |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `Content-Type`                                        | The type stored for the blob (`text/plain; charset=utf-8` for a text); anything else is `application/octet-stream` |
| `Cache-Control: private, max-age=31536000, immutable` | A hash names its bytes, so they never change; `private`, because access is the project's                           |
| `Content-Security-Policy: sandbox`                    | The document gets an opaque origin and no scripts                                                                  |
| `X-Content-Type-Options: nosniff`                     | The browser does not take the bytes for another type                                                               |
| `Content-Disposition: attachment; filename="<hash>"`  | Visiting the address downloads the file, it does not open it                                                       |

The reason is that a person's SVG can hold a script and the bytes come from the service's own
origin, which holds the session cookie. With the sandbox and the attachment, an SVG with a script
opened at its address executes nothing on the page's origin, while an `<img>` and the page's own
`fetch` still get the bytes (an SVG in an `<img>` never runs scripts anyway). The address is scoped
to a project so that access is the project's: the same bytes in two projects are two addresses, each
with its own access.

### Versions

A version is a copy of the project's `project_files` rows as of the last materialisation, so a
version costs rows, not bytes (the blobs are shared by content), and making one first materialises
the room. A version, as every answer shows it:

```json
{
  "number": 12,
  "label": "before review",
  "auto": false,
  "created_at": "2026-10-15T09:41:02.118Z",
  "created_by": "u_7d3f",
  "changed": ["diagrams/flow.meltemi", "project.json"]
}
```

`changed` lists the paths whose hash differs from the previous version still held (added, changed
or removed, in binary order); the first version lists all its paths.

- `POST /api/projects/<id>/versions` takes `{ label? }` and answers `201` with the version. A label
  is trimmed, at most 80 characters, with no control characters; none, or an empty one, makes an
  unlabelled version. If materialising fails, the answer is `500 internal` and nothing is recorded.
  It needs the role `write`: an editor makes versions as the owner does.
- `GET /api/projects/<id>/versions` answers `{ versions }`, the newest first. It needs `read`.
- `GET /api/projects/<id>/versions/<n>` answers the version with `files` (path to text, read from
  R2) and `binaries` (path to hash); `404 version.not-found` for a number the project does not hold,
  and for anything that is not a positive integer. It needs `read`.
- `POST /api/projects/<id>/versions/<n>/restore` answers
  `200 { revision, restored, saved, skipped? }`: the room's revision, the number restored, the
  automatic version that holds the state before (`saved`, shaped like any version) and the paths
  the path rule kept out. It needs `write`, so an editor restores a version as the owner does.

The policy, which the Worker applies at every creation:

- A project holds at most 200 versions, labelled ones counted. At the limit, the policy thins
  first; if the project is still full, a new version or a restore is `413 quota.versions` and
  records nothing.
- Unlabelled versions (the daily ones, the ones kept before a restore and the ones a person made
  with no name) are kept to at most 100: the oldest go first when a new one is made.
- Of the unlabelled versions older than thirty days, only the newest of each ISO week (UTC, weeks
  from Monday) stays.
- Labelled versions never go.
- A version that is refused deletes nothing.
- More than six versions made for one project within a minute are `429 versions.rate`, with
  `Retry-After: 60`. The count is part of the statement that inserts the version, so two devices
  cannot both pass. A restore counts as a version. The daily version is not rated.
- The daily version is the first materialisation of a UTC day that finds the files different from
  the latest version: one unlabelled version with `auto` set, made for the owner. It is skipped
  when a version of today exists already (by anybody), when the project holds no files and no
  version, when the files are the latest version's, and when the project is full of versions the
  policy keeps. A project with no version gets its first one on a day after the day it was
  created: creating it is not a change to keep. It holds the project as that materialisation wrote
  it, that is, after the first changes of the day, not the state at midnight.

A restore does this, in order: it reads the version's files (a version that is gone, or bytes that
are missing, change nothing); the room materialises; the state before is recorded as an automatic
version made by the person (so `413 quota.versions` and `429 versions.rate` apply, and change
nothing); a hash the version holds that the project's uploads no longer do is added back to
`project_blobs`; and the room puts the files in place as one transaction with origin `restore`,
but only if it is still at the revision it materialised: what people typed since is in the room
and not in the version that was recorded, and the restore would delete it. If the room moved on,
the state is materialised and recorded again (up to three times), and a room that keeps moving
answers `409 revision.mismatch` with its revision, to ask again.
Every file of the version is set (an existing path keeps its id and its `Y.Text`, edited by the
smallest change) and every other file goes. Connected clients receive it as an update from
elsewhere: the page treats it as a remote change, which is not in the person's undo, and forgets
what the person could undo before it, so the way back is to restore the automatic version that
holds the state before. A path the path rule refuses (`<path>~<id>`) cannot go in a document and is
left out as `skipped`.

### Thumbnails

`PUT /api/projects/<id>/thumbnail` takes an `image/svg+xml` body of at most 200 KiB and answers
`204`. The checks run in this order: the type (`400 thumbnail.invalid`), the rate
(`429 thumbnail.rate`: one thumbnail per 30 seconds per project, with `Retry-After` giving the
seconds left; the claim is one statement, so two devices cannot both pass), the size
(`413 thumbnail.too-large`) and that the body is a well-formed SVG, by the rule above
(`400 thumbnail.invalid`). It stores `thumbs/<project id>.svg` and sets `thumbnail_at`. A refused
thumbnail leaves the one there is, and a write that fails gives the 30 seconds back.

`GET /api/projects/<id>/thumbnail` answers the SVG as `image/svg+xml` with
`Content-Security-Policy: sandbox`, `X-Content-Type-Options: nosniff`,
`Content-Disposition: attachment; filename="thumbnail.svg"` and `Cache-Control: private, max-age=60`,
so that the panel opening again within a minute costs no request; it is `404 not-found` while the
project has none. The panel's list shows it in an `<img>`. The Worker never renders anything:
the page renders its diagram and sends the picture. The `PUT` needs the role `write` and the `GET`
the role `read`.

### Usage

`GET /api/account/usage` answers the account's projects and bytes, and the limits, so that a page
can show a quota without knowing the numbers:

```json
{
  "projects": 3,
  "storageBytes": 1048576,
  "limits": {
    "projects": 100,
    "storageBytes": 209715200,
    "files": 2000,
    "documentBytes": 16777216,
    "binaryBytes": 10485760,
    "versions": 200
  }
}
```

`storageBytes` is as of the last materialisation, version, upload or deletion. The page shows the
numbers in the account menu.

## Sharing and permissions

A project has a link level and members besides its owner. The link level is `private` (the
default: only the owner and the members open the project), `view` (anyone with the link can view)
or `edit` (anyone signed in with the link can edit, and anyone else views). Members are people the
owner named by email, each with a role, `viewer` or `editor`. One function, `access()` in
`src/access.ts`, turns a project, who is asking and the role a member was given into what that
person is to the project. Every route and the socket ask it, and nothing else decides. Nothing is
shared by accident: a new project is `private`, and only its owner changes who may open it.

### Roles

A person is `owner`, `editor` or `viewer` of a project, or nothing at all:

| The project's link | Anonymous | Signed in, not a member | A member                           |
| ------------------ | --------- | ----------------------- | ---------------------------------- |
| `private`          | nothing   | nothing                 | `viewer` or `editor`, as given     |
| `view`             | `viewer`  | `viewer`                | as given, never less than `viewer` |
| `edit`             | `viewer`  | `editor`                | as given, never less than `editor` |

The owner is always `owner`. Editing needs an account, so the `edit` link gives `editor` only to a
person signed in; an anonymous caller is never more than a `viewer`. A link raises what a member may
do and never lowers it, so a member keeps their role whatever the level. For this, the cookie and a
bearer token are the same person. `access(project, principal, member)` reads nothing: its answer is
a function of what it is given, so every cell of the table is a test (`test/access.test.ts`).

### What each route needs

A route states the role it needs: `read` is a viewer, `write` an editor and `manage` the owner.

| Needs                                                            | Routes                                                                                                                                                                                                                      |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `manage` (the owner)                                             | `PATCH` and `DELETE /api/projects/<id>`; `PATCH …/sharing`; `POST …/members`; `PATCH` and `DELETE …/members/<sub>`; `GET` and `DELETE …/invitations`; `GET`, `PUT` and `DELETE …/publish`; `PUT`, `GET` and `DELETE …/live` |
| `write` (an editor)                                              | `PUT …/files`; `PUT` and `DELETE …/binaries/<path>`; `PUT …/thumbnail`; `POST …/versions`; `POST …/versions/<n>/restore`                                                                                                    |
| `read` (a viewer; anonymous callers too when a link admits them) | `GET /api/projects/<id>`; `GET …/files`; `GET` and `HEAD …/blobs/<hash>`; `GET …/versions` and `…/versions/<n>`; `GET …/thumbnail`; `GET …/sharing`                                                                         |

Some routes name something else. `POST …/duplicate` needs `read` and a person, and makes the copy in
the caller's account. `DELETE …/members/me` needs a membership. `POST /api/invitations/<token>/accept`
needs a person and the token, which is the proof. The socket needs any role the project admits, or
a live session's token ([The socket](#the-socket)). `GET /api/projects/<id>` and `GET` and `HEAD
…/blobs/<hash>` also take `read` from a live session's current token in `X-Meltemi-Live`; no other
route reads that header. `PATCH /api/account { handle }` needs a person, with the cookie or a token, and the
administrators' routes a cookie that `ADMIN_SUBS` lists. The routes about the asker's own account (`GET` and
`POST /api/projects`, `GET /api/account/usage`) need a person.

When the role falls short, the answer is, in this order:

1. No access at all is `404 project.not-found`, so a private project does not reveal that it
   exists; an id that cannot be a project's and a project that does not exist look the same.
2. An anonymous caller on a route that needs more than the link gives them, when the link would
   give a signed-in person enough (a `write` route on an `edit` link), is `401 auth.required`, so
   that the page can offer to sign in.
3. Any other insufficient role is `403 access.denied`: a viewer who writes, an editor who deletes,
   an anonymous caller on a `manage` route (signing in would not help) or on a `write` route of a
   `view` link.

So an editor who deletes the project is `403`; an anonymous push to a `private` project is `404`,
to a `view` project `403` and to an `edit` project `401`; and a signed-in person who is not a
member can push to an `edit` project, as an editor.

### The sharing state

`GET /api/projects/<id>/sharing` answers each person only what they are allowed to see. The owner
gets everything, the members with the email they signed in with and the pending invitations with
their links:

```json
{
  "linkAccess": "view",
  "role": "owner",
  "members": [
    {
      "sub": "u_91ac",
      "name": "Luis",
      "picture": "https://avatars.githubusercontent.com/u/2",
      "email": "luis@example.com",
      "role": "editor",
      "added_at": "2026-10-15T10:02:11.402Z"
    }
  ],
  "invitations": [
    {
      "id": "0f3a1c5e9b7d4a2c8e6f1b3d5a7c9e0f",
      "email": "ana@example.com",
      "role": "viewer",
      "created_at": "2026-10-15T10:05:40.118Z",
      "expires_at": "2026-11-14T10:05:40.118Z",
      "link": "https://diagrams.meltemi.dev/p/k4c2w7x5q3y6m2n5r7d4?invite=5b1e0d7c9a3f4e2b8c6d1a0f3e5b7c9d"
    }
  ]
}
```

A member gets the link level, their role (what the link raises it to, if it does) and the members
with their names and pictures, never their emails, and no invitation:

```json
{
  "linkAccess": "view",
  "role": "editor",
  "members": [
    {
      "sub": "u_91ac",
      "name": "Luis",
      "picture": "https://avatars.githubusercontent.com/u/2",
      "role": "editor"
    }
  ]
}
```

Anyone else the link admits, signed in or not, gets `{ "linkAccess": "view", "role": "viewer" }` and
nothing of the people. That is on purpose: a `view` link must never yield an invitation from which
an editor could be made, nor the emails of people who did not share them.

`PATCH /api/projects/<id>/sharing` takes `{ "linkAccess": "private" | "view" | "edit" }`, is the
owner's, and answers the whole state as the `GET` does for the owner. Changing the level does not
change the project's `updated_at`: who may open a project is not a change of its content. It does
cut the sockets of everyone but the owner, who meet the new level when their pages reconnect
([When access changes](#when-access-changes)).

### Members

A member is a person the owner gave a role in the project; the owner is not a member. The project
appears in the member's `GET /api/projects` with their role. The owner changes a role with
`PATCH /api/projects/<id>/members/<sub> { "role": "viewer" | "editor" }`, which answers the member,
and removes a member with `DELETE …/members/<sub>` (`204`); both are `404 not-found` for a person who
is not a member. A member leaves with `DELETE …/members/me` (`204`). The owner cannot leave: that is
`403 access.denied`, and the way out is to delete the project. A person the link admits and who is
not a member has nothing to leave (`404 not-found`), and an anonymous caller is `401`. Whoever
leaves or is removed keeps what the link gives, if it gives anything. A role changed, a member
removed and a member who leaves cut that person's sockets, so that the new role counts as soon as
their page reconnects ([When access changes](#when-access-changes)).

A project holds at most 50 members and pending invitations together, and the 51st invitation is
`413 quota.members`; the owner is not counted, and neither is an invitation that has expired.

### Invitations

The owner invites by email with `POST /api/projects/<id>/members { "email", "role" }`. The email is
trimmed and lower-cased, has at most 254 characters and a dotted domain, and is not the owner's own;
the role is `viewer` or `editor`. An invitation records that email, that role and a random token of
128 bits (32 lowercase hexadecimal characters), and the answer is the invitation as the owner sees it
in the list above, with its link, `<origin>/p/<id>?invite=<token>`, with `201`. **No mail is sent**:
the owner passes the link on, or the person simply signs in with that email. Inviting an email that
already has a pending invitation sets its role again and answers the same invitation with `200`;
inviting a member is an invitation like any other. The token is kept in clear on purpose, so that
the owner can copy the link again from the list ([Storage](#storage)), and it is returned to the owner
alone (`POST …/members`, `GET …/invitations`, `GET …/sharing`).

A pending invitation becomes a membership, with its role, in one of two ways:

- **By email.** `GET /api/session` with a cookie whose email the identity service verified turns
  every pending invitation for that email into a membership before it answers, in one atomic
  step. The email is the session token's own claim, compared in lower case. An email that is not
  verified resolves nothing: anyone can claim an address they do not own.
- **By link.** `POST /api/invitations/<token>/accept`, by any signed-in person, whatever their
  email: the link is the proof. It answers the project as `GET /api/projects/<id>` does, with the
  role the person now has. The owner opening their own link gets their project and leaves the
  invitation pending.

An invitation works once: the person who accepts it is the member, and the link is then
`404 invite.invalid` for anyone else. It also stops working thirty days after it was made
(`expires_at`). Expiry is a filter, not a sweep: an expired invitation is not listed, not counted
against the 50, not accepted, and goes with its project. A person who is already a member keeps the
higher of the two roles: an invitation raises a role and never lowers it, and the owner lowers one
with `PATCH …/members/<sub>`. A token that is unknown, used, expired or of another shape is
`404 invite.invalid`, whatever the reason.

`GET /api/projects/<id>/invitations` answers `{ "invitations": […] }` with the pending ones, the
earliest first, each as in the list above; anyone but the owner gets `403 access.denied`.
`DELETE …/invitations/<id>` revokes one, by the invitation's own `id` and not its token (`204`;
`404 not-found` when there is none).

### Viewing by link

A project whose link is `view` or `edit` serves its `read` routes to anybody: the metadata, with
the asker's `role`, the files as a snapshot, the blobs, the versions and the thumbnail. A viewer,
signed in or not, connects to the room as one, receives every change and may not write
([The socket](#the-socket)); an anonymous one connects with a guest identity, is in the presence as
anybody, and reads the snapshot (`GET …/files`) only when the room does not answer. A project the
link does not admit is `404 project.not-found` for anonymous callers as for anyone else, which the
page words as "not found" and nothing more. How the page uses all this is in
[the playground](playground.md#viewing-a-shared-project).

### When access changes

Access is resolved on every request, so a change counts from the next one. A socket is different:
the room resolves what a connection may do once, when it opens, and keeps it. So the routes that
change access cut the sockets that change may have outdated, once the change is made:
`PATCH …/sharing`, when the level really changes, cuts every socket of the project but the owner's;
`PATCH` and `DELETE …/members/<sub>` and `DELETE …/members/me` cut the sockets of that person.
Accepting an invitation cuts nothing, because it only ever raises a role.

The close code is `4000`, the one of the development cut, which is not a refusal: the page
reconnects after a second and the Worker resolves the role again. A promoted person connects as an
editor and a demoted one as a viewer, and the `hello` of the room names the role, on which the page
opens the project again in the mode it gives; it does the same when the room refuses a change with
`access.denied`. A removed person whom the link does not admit is refused at the upgrade
(`404 project.not-found`), and the page, which asks the service whether the project is still there
after its second failed reconnection, says the project is no longer available to that person. If the
room cannot be reached when the
change is made, the cut is tried three times; if it still cannot, the change stands, the answer is
not an error, and the sockets of that person stay until their connection ends (the next change of
access cuts them again). An upgrade that was in flight when the change was made is covered too:
once the room has accepted a socket the Worker resolves the role again, and cuts the person's
sockets if it differs; if that cut fails the upgrade is `500 internal`, not a socket with the old
role. Deleting an account cuts the person's sockets in the projects of others in the same way,
before and after the event is applied.

### Live sessions

A live session lets anyone with its link into a project for a while, with or without an account
([decision 0050](decisions/0050-live-sessions.md)). There is at most one per project, and it lives
in the project's room, in the room's own storage, as `{ id, token, guestsEdit, startedAt, until }`:
no row of D1 is written for it, and it goes with the room when the project is deleted. The token is
128 random bits in lowercase hexadecimal, kept in clear so that the owner can copy the link again;
it is answered to the owner alone and never logged.

- `PUT /api/projects/<id>/live { guestsEdit? }` (the owner's) starts the session, with guests who
  may edit unless `guestsEdit` is `false`, for twenty-four hours; on a session that is on it
  answers that one, applying `guestsEdit` when given. A change of `guestsEdit` cuts the connections
  the session admitted with `4000`, as a change of access does, and they reconnect with the role it
  gives now. The answer:

  ```json
  {
    "id": "8c1f02b9e45a7d36",
    "link": "https://diagrams.meltemi.dev/p/k7h2m4n9p3q5r8s2t6v1?live=0f4b…",
    "guestsEdit": true,
    "startedAt": "2026-10-21T18:02:11.000Z",
    "until": "2026-10-22T18:02:11.000Z",
    "guests": 2
  }
  ```

  `guests` counts the connections the session admitted that are open now.

- `GET …/live` (the owner's) answers the same, or `null`.
- `DELETE …/live` (the owner's) ends the session, and answers `204` whether or not one was on.

A session also ends by itself at `until` and after an hour with no client in the room. The room's
one alarm sees to both, after a hibernation too. However it ends, the record goes and every
connection the session admitted is told `session.ended` and closed with `4410`; a connection that
came without the token stays. A page closed with `4410` stops reconnecting with the token.

**Joining.** A socket with `?live=<token>` reaches the room with the token in `X-Meltemi-Live`
([The socket](#the-socket)). The room compares it with its record: a token that differs, or a
session that is over, is `404 project.not-found` on the upgrade, revealing nothing. A current one
admits the connection with the higher of the person's own role and the session's (`editor` when
`guestsEdit`, else `viewer`), so a signed-in member keeps more when they have it, and the owner is
the owner. `hello` then names the session (`live: { until, guestsEdit }`).

**Guests and places.** A guest, and an anonymous visitor, take one of the room's twenty places and
give it up as a viewer does ([The room's protocol](#the-rooms-protocol)). Among connections without
an account the room admits at most ten open ones per client address and refuses the eleventh with
`connections.limit` (`4428`), so that one network cannot fill a room while a classroom or an office
behind one address still fits; account connections are not counted by address. A guest's update
counts against the project's limits as an editor's does.

**What a token reaches.** The room, and two reads: `GET /api/projects/<id>` (with
`live: { until, guestsEdit }`, or `null` when the token is not current, so that a page holding an
old link drops it) and `GET` and `HEAD …/blobs/<hash>` (the images and fonts the diagrams use),
which take the token in `X-Meltemi-Live` when the caller's own access falls short and ask the room
whether it is current. Every other route ignores the header: a guest cannot upload, version,
publish, change the thumbnail or read the sharing; those need an account.

## Publishing

A project publishes as a web page: the HTML catalog of its diagrams and stories, which the page
builds (the same build as the catalog download and `meltemi-diagrams build catalog`,
[catalog](catalog.md)) and sends to the service. The service stores it and a second Worker serves
it at `https://<PUBLISH_HOST>/<handle>/<slug>/`, on a domain of its own. The service never renders
anything, and the pages it serves cannot reach the session cookie, because the host is not under
`meltemi.dev` ([decision 0042](decisions/0042-sharing-and-publishing.md)). In production
`PUBLISH_HOST` is `meltemi.page`; in development publications are served from `/_published/` on the
Worker's own origin.

### Handles

A person chooses a handle before their first publication: `PATCH /api/account { "handle": "ana" }`.
It is the first segment of every public address they publish, so it is public by design. It is
`[a-z0-9-]{3,30}` exactly (nothing is trimmed or lower-cased for the
person) and unique among accounts. A person signed in on the page may choose one, and so may their
API token, because the command line publishes with a token and a first publication needs a handle
(it is the only thing a token may set about the account); the `Origin` rule applies to the
cookie.

- `200 { "handle" }` when it is theirs now; the same handle again is always fine.
- `400 handle.invalid` for another shape, `409 handle.taken` while another account holds it, and
  `409 handle.locked` while a publication of theirs is addressed by the handle they have, because
  the address would move from under it: unpublish first.
- A person who publishes without one gets `409 handle.required`, answered before the body is read.
  The handle is read again after the body, which is the one the page goes under; and if it changed
  in the last moment, between that read and the row, the answer is `409 handle.required` too and
  nothing is left under the old address.

`GET /api/session` returns the handle (or `null`) in `user.handle`.

### Publishing and unpublishing

All three routes are the owner's (`manage`), with the cookie or an API token, so the command line can
publish too. A project may publish several pages, one for each slug, and the same slug may not be
held twice under one handle.

- `GET /api/projects/<id>/publish` answers what the owner needs to draw the publish dialog:

  ```json
  {
    "handle": "ana",
    "publications": [
      {
        "slug": "purchase",
        "url": "https://meltemi.page/ana/purchase/",
        "published_at": "2026-10-15T09:41:02.118Z",
        "bytes": 482113
      }
    ],
    "takedowns": [
      { "slug": "old-draft", "at": "2026-10-14T16:20:00.000Z", "reason": "Abuse report" }
    ]
  }
  ```

  `handle` is `null` until the person chooses one. `publications` are this project's, the earliest
  first, each with the address it is served at. `takedowns` are the ones the service made of this
  project's pages, under the owner's handle (a page that someone else published under the same
  handle before is not theirs, whenever the account was made), the latest first; one that the owner
  has published again since is not listed. `meltemi.page` stands for the domain of `PUBLISH_HOST`.

- `PUT /api/projects/<id>/publish { "slug", "html" }` stores the page and answers
  `200 { "url", "handle", "slug", "bytes", "published_at" }`. The slug is `[a-z0-9-]{1,60}` and the
  HTML is text, at most 16 MiB in UTF-8. Publishing a slug the project already publishes replaces
  that page. The checks run in this order, and a request that fails one writes nothing:
  `handle.required` (`409`), a body over 24 MiB (`413 publish.too-large`), a body that is not a JSON
  object (`400 request.invalid`), a slug or an `html` that is not usable (`400 publish.invalid`),
  HTML over 16 MiB (`413 publish.too-large`), a slug that another project of the same person
  publishes (`409 publish.taken`) and the rate (`429 publish.rate` with `Retry-After`). The rate is
  ten publish requests for one project in an hour. It counts requests, in `publish_log`, because
  publishing a slug again moves the time of its row and counting rows could not see the repeats, so
  a request refused by an earlier check does not count, and the sweep removes the log's rows an hour
  old. Where there is no usable publish host the request is `500 internal` and the log names the
  variable (never its value), before anything is written.
- `DELETE /api/projects/<id>/publish/<slug>` removes the page and then the row, and answers `204`;
  it is `404 not-found` when the project publishes nothing under that slug. The object goes first, so
  that a failure of the bucket leaves the publication as it was and the owner tries again.

A new address is claimed by its row first and then filled, and a failure of the bucket takes the row
back: of two projects that race for one address, the one that does not get the row never writes the
page, so nobody's page is overwritten. A replacement writes the page first and then renews the row,
because the address is already the project's. The publish host serves a page only while its row
exists, whatever the bucket holds.

The address is `https://<PUBLISH_HOST>/<handle>/<slug>/`, and in development
`<origin>/_published/<handle>/<slug>/`. Pages are objects in the bucket, under
`published/<handle>/<slug>/index.html`, which the collection of blobs never touches. They do not
count in the account's storage usage: the limits that bound them are the size of a page and the rate
of publishing.

### The publish host

The publish host is a second, minimal Worker. `src/publish.ts` is its logic, a function of a request,
a bucket and a database, and `src/publish-worker.ts` is its entry; `wrangler.publish.jsonc`
configures it with two bindings, the D1 database `DB` and the R2 bucket `BLOBS` (the same ones as the
main Worker's), and nothing else: no assets, no Durable Object, no variable and no secret. It can
only read. `pnpm --filter @meltemi/diagrams-cloud exec wrangler dev -c wrangler.publish.jsonc` runs
it on port 8789, over the same persisted state as `pnpm cloud:dev` (give both the same
`--persist-to` folder). Its address is the Custom Domain `meltemi.page`, which the family's
Terraform attaches ([Deploying](#deploying)); its configuration holds no route and no `workers.dev`
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

The page's own policy is the `meta` tag the catalog build wrote ([catalog](catalog.md#offline-by-construction));
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

### Takedown

An administrator of the service removes any publication with
`DELETE /api/admin/publications/<handle>/<slug>`, with an optional `{ "reason" }` (at most 500
characters, line breaks and tabs allowed, no other control character). Administrators are the
`sub`s listed in `ADMIN_SUBS`, a comma-separated variable; unset, nobody is. The caller must be a
listed person with the cookie, so the `Origin` rule applies: an API token is not accepted even from
an administrator, because a token is for programs and is stolen more easily. Everybody else, signed
in or not, gets `404 not-found`, the answer of a route that does not exist, and not `403`, which would
tell a stranger the route is there. On the page, signed in, an administrator calls it from the
browser's console, which sends the cookie and the `Origin`:

```js
await fetch("/api/admin/publications/ana/purchase", {
  method: "DELETE",
  credentials: "same-origin",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ reason: "Not what this site is for" }),
});
```

The page is deleted first and the takedown written second, in one step with the row's removal:
`takedowns (handle, slug, by_sub, reason, at, project_id)`, the project being the one the page was
published from. A failure of the bucket leaves everything as it was and
the administrator tries again; a failure after it leaves a row with no page, which the publish host
does not serve and a second try completes. The address then answers `404`, and the project's owner
sees the page, in `GET …/publish`, as removed by the service. Takedowns are the service's record
and stay when an account is deleted.

### Entitlements

An administrator entitles an account to export without the Meltemi branding, and revokes it: the
export dialog of an entitled person offers **Export without the Meltemi branding**
([the playground](playground.md#exports-in-the-browser)). Three routes, under the takedown's rules
(a listed person with the cookie, the `Origin` rule first, `404 not-found` to everybody else and
to an API token): `GET /api/admin/entitlements` lists the entitled accounts, the earliest grant
first, as `{ "accounts": [...] }`; `GET /api/admin/accounts/<account>/entitlements` reads one
account's, and `PUT` the same path with `{ "unbranded": true }` or `{ "unbranded": false }` sets it,
recording the administrator (`by`) and the time (`at`). Both answer the account:

```json
{
  "sub": "u_7d3f",
  "handle": "ana",
  "name": "Ana",
  "entitlements": { "unbranded": true, "by": "u_admin", "at": "2026-10-28T12:00:00.000Z" }
}
```

`<account>` is the account id, which every person reads in the account panel's Profile, or
`@<handle>` for a person who chose a handle; an account with no row (nobody signed in with it yet)
or a handle nobody holds is `404`, and nothing is created. Another body is `400 request.invalid`.
Administrators are entitled in the session answer without a grant; their own row says only what was
set on it. The person sees a grant or a revocation at the next load of the page, which reads the
session once, and a deleted account takes its entitlement with it. From the browser's console on
the page, signed in, the list, a grant and a revocation:

```js
await fetch("/api/admin/entitlements", { credentials: "same-origin" }).then((r) => r.json());
```

```js
await fetch("/api/admin/accounts/@ana/entitlements", {
  method: "PUT",
  credentials: "same-origin",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ unbranded: true }),
}).then((r) => r.json());
```

```js
await fetch("/api/admin/accounts/@ana/entitlements", {
  method: "PUT",
  credentials: "same-origin",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ unbranded: false }),
}).then((r) => r.json());
```

### Publications and deletion

Deleting a project deletes its pages (the objects first, then the rows with the project); deleting
the account does so for every project of the person ([Deletion events](#deletion-events)).
Unpublishing and deleting are the owner's: an editor cannot publish, and neither can a viewer.

## Quotas and limits

The limits are `CLOUD_LIMITS` in `@meltemi/diagrams-project`, which the page uses to refuse before
it sends, the Worker to refuse anyway and the command line, whose `push` refuses before the first
request ([the command line](cli.md#mirroring-a-folder-push)). Each is refused with a stable
code: a `413` for a size or a count, a `429` for a rate and a `400` for the length of a name
([Errors](#errors)). The one limit that is not in `CLOUD_LIMITS` is the members of a project, which
only the Worker enforces.

| What                                 | Limit                                                           | Refused as                            |
| ------------------------------------ | --------------------------------------------------------------- | ------------------------------------- |
| Projects per account                 | 100                                                             | `quota.projects`                      |
| Storage per account                  | 200 MiB: the distinct blobs its projects and versions reference | `quota.storage`                       |
| Files in a project                   | 2000                                                            | `quota.files`                         |
| A project's document                 | 16 MiB encoded                                                  | `doc.too-large`                       |
| A text file                          | 2 Mi characters                                                 | `doc.too-large`                       |
| An image or a font                   | 10 MiB                                                          | `quota.binary`                        |
| Versions in a project                | 200, labelled ones counted; 100 unlabelled are kept             | `quota.versions`                      |
| Versions made in a minute            | 6 for one project                                               | `versions.rate`                       |
| Clients in a room                    | 20                                                              | `room.full`                           |
| Connections without an account       | 10 open ones from one client address                            | `connections.limit`                   |
| A live session                       | 24 hours, and one hour with nobody in its room                  | `session.ended`                       |
| A message on a socket                | 512 KiB                                                         | `message.too-large`                   |
| An awareness message                 | 16 KiB; 20 a second are relayed, over 100 a second close it     | `message.too-large`, `awareness.rate` |
| A thumbnail                          | 200 KiB                                                         | `thumbnail.too-large`                 |
| Thumbnails of one project            | one per 30 seconds                                              | `thumbnail.rate`                      |
| Members and pending invitations      | 50 for one project (the owner is not counted)                   | `quota.members`                       |
| A published page                     | 16 MiB of UTF-8                                                 | `publish.too-large`                   |
| Publish requests                     | 10 for one project in an hour                                   | `publish.rate`                        |
| A handle, a page name (slug)         | 3 to 30 and 1 to 60 lowercase letters, digits and hyphens       | `handle.invalid`, `publish.invalid`   |
| A project's name, description, label | 100, 500 and 80 characters                                      | `request.invalid`                     |

The storage quota is checked where bytes come in that a person chose: an upload of an image or a
font. Text and versions count in the usage but are not refused for it; they are bounded by the
limits per project and per account of the rows above. A project and its copies share blobs, and a
blob a hundred versions share counts once.

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

## Configuration

`packages/cloud/wrangler.jsonc` holds the variables and the bindings. The secrets are the family's
Secrets Store's, bound as `<NAME>_STORE` (`secrets_store_secrets`) and read into `<NAME>` once per
isolate at the Worker's entry (`src/secrets.ts`), so the handlers read strings. `.dev.vars` (see
`.dev.vars.example`) supplies every one of them in development, as strings, which always win over a
binding.

### Variables and secrets

| Name                     | Kind               | Meaning                                                                                                                                                                                                                                              |
| ------------------------ | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ORIGIN`                 | variable           | The service's own origin, `https://diagrams.meltemi.dev`: the host it serves, the `Origin` it accepts and the base of the addresses it builds. Ignored in development                                                                                |
| `IDENTITY_ISSUER`        | variable           | The identity service, `https://id.meltemi.dev`: the session token's `iss`, and the home of `/login`, `/logout`, `/account` and `/sessions/<sid>`                                                                                                     |
| `IDENTITY_JWKS_URL`      | variable           | Where the identity service publishes its public keys                                                                                                                                                                                                 |
| `IDENTITY_EVENTS_SECRET` | secret (Store)     | This product's secret with the identity service, its `EVENTS_SECRET_DIAGRAMS`: verifies the deletion events and signs the calls of [the identity data](#the-identity-data)                                                                           |
| `FORMS_SECRET`           | secret (Store)     | Signs the approval page's `csrf` and keys the hash of an address in the rate limit                                                                                                                                                                   |
| `PUBLISH_HOST`           | variable, optional | The host that serves publications, such as `meltemi.page`: a lowercase host name of a domain of its own, never the service's host nor one under the cookie's domain. `meltemi.page` in `wrangler.jsonc`; unset, publishing works in development only |
| `ADMIN_SUBS`             | secret (Store)     | The `sub`s of the administrators of the service, comma separated: who may take a publication down and entitle accounts to export without the branding, as they are themselves. Unset or empty, nobody                                                |
| `DEV`                    | `.dev.vars` only   | `"true"` turns on development mode, below                                                                                                                                                                                                            |
| `IDENTITY_JWKS`          | `.dev.vars` only   | An inline key set, `{"keys":[…]}`, for development and tests                                                                                                                                                                                         |

The bindings are:

| Binding  | Is                                                                                                                                                       |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DB`     | The D1 database, with its migrations in `packages/cloud/migrations`                                                                                      |
| `ASSETS` | The page's build                                                                                                                                         |
| `BLOBS`  | The R2 bucket `meltemi-diagrams-blobs`: `blobs/<sha-256>`, `thumbs/<project id>.svg` and `published/<handle>/<slug>/index.html`                          |
| `ROOMS`  | The Durable Object namespace of the class `ProjectRoom`, which the Worker's entry exports; the migration `v1` of `wrangler.jsonc` makes it SQLite-backed |

`wrangler.jsonc` also holds the cron trigger of the weekly collection, `0 3 * * SUN`, and an `alias`
that makes the Worker bundle the workspace packages it imports from their sources. The ids in the
file are placeholders (all zeros): the family's Terraform creates the database, the bucket and the
Secrets Store and writes their ids as variables of this repository's `production` environment, and
the deploy workflow writes them in before uploading ([Deploying](#deploying)). The
Worker's runtime dependencies are the identity package, this repository's project package and
`yjs` (MIT). Outside development `ORIGIN`, `IDENTITY_ISSUER` and `IDENTITY_JWKS_URL` must be
`https:` addresses; otherwise every request is `500 internal` and the log names the variable.
`PUBLISH_HOST` and `ADMIN_SUBS` are different: neither stops the service, and each costs only its own
feature when it is missing or unusable (publishing, and takedowns).

The publish host has its own configuration, `packages/cloud/wrangler.publish.jsonc`, and binds only
`DB` and `BLOBS`, the same database and bucket as above, to read them: no assets, no variable, no
secret and no Durable Object ([The publish host](#the-publish-host)). It does not apply migrations;
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
  a second from a client, or not a state ([Awareness](#awareness)). The browser suite types for a
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
  default), runs [the collection](#the-collection-of-blobs) now and answers what it did:
  `{ rows, objects, orphans, failures, truncated }`. The cron trigger does not fire under
  `wrangler dev`.

A fifth route belongs here, though it needs no person: `GET` and `HEAD /_published/<handle>/<slug>/`
serve a publication from the Worker's own origin, with the page and the headers the publish host
gives it ([The publish host](#the-publish-host)). It answers `404 not-found` unless `DEV` is
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

Nothing is deployed or configured from a machine ([decision 0046](decisions/0046-delivery.md)).

- **What exists** is declared in `packages/infra` of the Meltemi Web repository and applied by its
  pipeline: the zones, the Workers `meltemi-diagrams-cloud` and `meltemi-diagrams-publish` as
  entities, their Custom Domains, the D1 database `meltemi-diagrams`, the R2 bucket, the Secrets
  Store with `FORMS_SECRET`, `IDENTITY_EVENTS_SECRET` (the identity service's
  `EVENTS_SECRET_DIAGRAMS`, the same value by construction) and `ADMIN_SUBS`, and this repository's
  `production` environment: a deploy token that can only upload Workers and migrate D1, and the
  variables `CLOUDFLARE_ACCOUNT_ID`, `D1_DATABASE_ID` and `SECRETS_STORE_ID`.
- **What runs** is uploaded by `.github/workflows/deploy.yml` on every push to `main`:
  `scripts/deploy-config.mjs` writes `wrangler.deploy.json` and `wrangler.publish.deploy.json` with
  the ids, then the playground is built, the migrations are applied (`wrangler d1 migrations apply
DB --remote`), and the main Worker and the publish Worker are uploaded with `wrangler deploy`. A
  failed migration uploads nothing.
- **Rolling back** is the same workflow dispatched with a version id (and the Worker), which runs
  `wrangler rollback`; or a revert pushed to `main`.
- **A secret** changes in the family's Terraform; the Workers read the new value when their
  isolates restart. `wrangler secret put` is never run.

## Running locally

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

3. Create the local database once, as [The database](#the-database) explains. The rooms and the R2
   bucket need no setup ([Rooms and bytes locally](#rooms-and-bytes-locally)).

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
provider verified; an invitation link works for any signed-in person. To try a takedown, put your
`sub` in `ADMIN_SUBS` of `.dev.vars` and call the administrators' route from the page's own origin,
since the `Origin` rule applies to it.

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
`0002_projects.sql` adds the six tables of [Storage](#storage) and the `storage_bytes` column of
`users`. `0003_sharing.sql` adds the two columns and five tables of sharing and publishing, which
[Storage](#storage) also describes; the one secret it keeps in clear is the token of a pending
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
([The development routes](#the-development-routes)).

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
  with the headers of [The publish host](#the-publish-host) and no cookie), a page name another of
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
