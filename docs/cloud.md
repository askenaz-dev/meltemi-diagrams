# The cloud service

[Español](es/cloud.md)

Use the cloud service to keep projects across devices, collaborate with other people and publish
read-only catalogs. Local browser projects, CLI files and the Docker workspace also work without a
Meltemi account. Uploading a project or joining a shared one is an explicit choice.

The hosted editor and API are at `https://diagrams.meltemi.dev`; sign-in uses the Meltemi family
account at `https://id.meltemi.dev`. Published catalogs use the separate `meltemi.page` domain.
This reference covers credentials, HTTP routes, revisions, collaboration, permissions, publishing,
quotas and MCP. For step-by-step use, start with [the web app](web-app.md),
[the cloud CLI commands](cli.md#the-cloud-commands) or [agents and MCP](agents.md).

## The account is a layer

Use **Sign in** in the hosted editor for cloud projects, API tokens and connected agents. Sign-in
uses GitHub or Google through the Meltemi account service. The **Meltemi account** menu entry
opens your family profile; **Diagrams settings** holds product settings such as the publishing
handle, tokens, connected apps and usage.

A browser-only project remains separate. Signing in does not upload it: create a cloud project or
choose to save your local project to the cloud. Opening a shared project or live session connects
to the service even when you join as a guest without an account.

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

## Who is asking

The API accepts the signed-in browser session or an API token. Project roles still decide which
operations that identity may perform.

### Bearer tokens

Use `Authorization: Bearer mdg_<token>` for CLI and script access. A valid API token takes
precedence over a cookie. Unknown or revoked API tokens answer `401 token.invalid`; a token
continues working after its creating session ends, until revoked or the account is deleted.
Bearer API requests do not require an `Origin` header.

MCP OAuth access tokens are a different credential: they are bound to `/mcp` and do not authorize
other API routes. See [Authorization](#authorization).

### The session cookie

The hosted editor uses the `meltemi_session` cookie issued by the Meltemi account service. An
invalid, expired or deleted-account session is treated as anonymous; a route requiring sign-in
then answers `401 auth.required`. Session revocation can take up to one hour to reach a product
that cached the session check. Cookie-based changes must also pass the [Origin rule](#the-origin-rule).

### Users

`GET /api/session` identifies the signed-in account and its product permissions. Use the account
id shown in **Diagrams settings → Profile** when an administrator asks which account to grant a
permission. The publishing handle is separate from that id; see [Handles](#handles).

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
from a host under `meltemi.dev`: published content has its own domain, and the
service refuses to build a public address on a host that would break the rule
([The publish host](#the-publish-host)).

## Errors

Every error is JSON, `{ "code": "…", "message": "…" }`, with `Cache-Control: no-store`. The code is
stable; the message is English and never holds a token, a cookie, a secret or a stack. A few
answers carry one more field the caller can act on: a stale push holds the room's current
`revision`. Use the stable code for programmatic handling.

The room's own refusals reach a person two ways: as the JSON of a route (`PUT /files`, a create), or
on the socket, as a kind 4 message and a close code ([The room's protocol](#the-rooms-protocol)).
The same code names both.

| Code                        | Status | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `not-found`                 | 404    | No matching public route, missing referenced resource, or a caller not allowed to discover it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `project.not-found`         | 404    | A project that does not exist or that the asker may not open at all, such as a private one that is not theirs (one answer for both, so nobody learns which exist), and `/p/<id>` with an id that cannot be a project id; on a socket, the room of a project that was deleted                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `request.invalid`           | 400    | The body is not what the route reads: not a JSON object, a token name that is empty, over 60 characters or holds control characters, a project name that is empty, over 100 characters or holds control characters, a description over 500, a label over 80; a template that does not exist or is given with files; files, binaries or a push that are not objects of text by path; a binary hash that is not 64 lowercase hexadecimal characters; a link level that is not `private`, `view` or `edit`, a role that is not `viewer` or `editor`, an email that is empty, over 254 characters or without a dotted domain, the owner's own email as an invitation; a takedown reason over 500 characters or with control characters |
| `auth.required`             | 401    | The route needs a person and the request carries none (no credentials, or a cookie that is invalid or expired), on a project whose link admits anonymous callers, a request that signing in would allow (a push when the link is `edit`) or that needs an account anyway (a copy, leaving); a socket upgrade without a valid cookie, because a bearer token is not taken on a socket                                                                                                                                                                                                                                                                                                                                               |
| `token.invalid`             | 401    | A bearer token that is unknown, revoked or not an API token                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `request.forbidden`         | 403    | A change made with the cookie from a page that is not the service's (the `Origin` rule), or a socket upgrade whose `Origin` is not the service's; a bearer token asking for what only the page may do (creating a token); on the approval page, a form without the right `csrf`                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `quota.tokens`              | 413    | The account already holds 20 API tokens                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `cli.invalid`               | 400    | The command line's request cannot be used: a port or `state` the approval page does not accept, a code that is unknown, used or expired, a `state` that does not match, or an exchange that cannot be read                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `cli.rate`                  | 429    | A caller that has made 10 failed code exchanges in the last minute; `Retry-After: 60`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `path.invalid`              | 400    | A file path that breaks [the path rule](#the-path-rule): in a create, a push, an upload or a delete of a binary; on a socket, a transaction that sets such a path (rolled back, close code `4400`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `blob.unknown`              | 400    | An image or font that names a hash the project never uploaded (`project_blobs`), or in a create one that none of the person's projects holds; on a socket, a transaction that sets such a hash (`4400`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `doc.invalid`               | 400    | A change the document cannot keep: a path that is both a text and a binary in one change, a value of another shape, a root type of its own, a text frame or a message of a kind a client may not send; on a socket, `4400`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `doc.too-large`             | 413    | A text over 2 Mi characters, a document whose encoded state is over 16 MiB, or a body over a whole document's size; on a socket, the transaction is rolled back (`4413`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `quota.files`               | 413    | A project that would hold more than 2000 files; on a socket, rolled back (`4413`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `quota.projects`            | 413    | The account already holds 100 projects                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `quota.storage`             | 413    | An upload that would take the account over 200 MiB (bytes it already references do not count again)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `quota.binary`              | 413    | An image or font over 10 MiB                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `binary.invalid`            | 400    | An upload that is not a PNG, JPEG, GIF, WebP, SVG, woff2, ttf or otf by its bytes, whatever its `Content-Type` says                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `quota.versions`            | 413    | A project that already holds 200 versions after the policy has thinned what it may, asked for another version or a restore                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `versions.rate`             | 429    | More than six versions made for one project within a minute (a restore counts); `Retry-After: 60`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `version.not-found`         | 404    | A version number the project does not hold: never made, thinned, or not a number                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `thumbnail.too-large`       | 413    | A thumbnail over 200 KiB                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `thumbnail.invalid`         | 400    | A thumbnail that is not sent as `image/svg+xml`, or whose body is not a well-formed SVG                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `thumbnail.rate`            | 429    | A second thumbnail for one project within 30 seconds; `Retry-After` says how many seconds are left                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `revision.mismatch`         | 409    | A push whose `ifRevision` is not the room's current revision; the answer carries that `revision` and nothing changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `access.denied`             | 403    | Someone who sees the project but may not do this: a viewer, or an anonymous caller on a `view` link, changing it; an editor, or anyone the link admits, doing what only the owner may (change sharing, invite, publish, rename or delete); the owner leaving their own project; on a socket, an update from a viewer (`4403`)                                                                                                                                                                                                                                                                                                                                                                                                      |
| `invite.invalid`            | 404    | An invitation link that is unknown, was already used or is older than thirty days (a token that is not 32 lowercase hexadecimal characters is the same answer); nothing is accepted                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `quota.members`             | 413    | A project that already holds 50 members and pending invitations together (the owner is not counted, nor is an invitation older than thirty days); nothing is recorded                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `handle.invalid`            | 400    | A handle that is not 3 to 30 lowercase letters, digits or hyphens: nothing is trimmed or lower-cased for the person                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `handle.taken`              | 409    | A handle that another account holds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `handle.locked`             | 409    | A change of handle while a publication is addressed by the current one; choosing the same handle again is always fine                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `handle.required`           | 409    | A publication by a person who has not chosen a handle yet, answered before the body is read                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `publish.invalid`           | 400    | A page name (slug) that is not 1 to 60 lowercase letters, digits or hyphens, or an `html` that is not text or is empty                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `publish.too-large`         | 413    | A page of more than 16 MiB (UTF-8), or a publish request too large to hold one (over 24 MiB); nothing changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `publish.rate`              | 429    | More than ten publish requests for one project in the last hour; `Retry-After` says how many seconds until the earliest of them stops counting                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `publish.taken`             | 409    | A slug that another project of the same person already publishes under their handle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `message.too-large`         | 413    | A message on a socket over 512 KiB, or an awareness message over 16 KiB ([Awareness](#awareness)); the socket closes with `4413`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `room.full`                 | 409    | A room that already holds 20 clients, guests and visitors included: the 21st is told and its socket closes with `4409`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `awareness.rate`            | 429    | A client that sent more than 100 awareness messages within a second: it is told on the socket and the socket closes with `4429` ([Awareness](#awareness)); no route answers it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `connections.limit`         | 429    | The eleventh open connection without an account from one client address: it is told on the socket and the socket closes with `4428` ([Live sessions](#live-sessions)); no route answers it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `session.ended`             | 410    | The live session that admitted a connection ended (its owner ended it, its 24 hours passed, or its room was empty for an hour): the socket closes with `4410` ([Live sessions](#live-sessions)); no route answers it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `admin.already`             | 409    | An invitation to administer for the email of an owner or an administrator ([Administration](#administration))                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `admin.limit`               | 409    | An eleventh pending invitation to administer, or an acceptance when the service has twenty administrators ([Administration](#administration))                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `account.ambiguous`         | 409    | An administration route named an account by an email that more than one account signed in with verified: name it by its id ([Administration](#administration))                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `identity.last`             | 409    | The identity service keeps a person's only way of signing in: an unlink of the last provider from the account panel; nothing changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `provider.unknown`          | 400    | A provider the identity service does not sign people in with (`github` and `google` only)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `session.current`           | 409    | The session the request comes with, asked to be signed out from the account panel: it ends with Sign out instead                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `session.not-found`         | 404    | A session that is not the person's, or none at all                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `rate.limited`              | 429    | The identity service's bound on this service's account calls for one person: sixty a minute                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `identity.unavailable`      | 502    | The identity service did not answer within five seconds, or answered something this service cannot read (a refused signature among them, which is a configuration problem); logged with the route and the status, never a body                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `diagram.invalid`           | 400    | A `.meltemi` file of a push through the MCP endpoint (`write_files`), or of a preview, that does not compile: nothing is written or drawn; `diagnostics` lists the errors and warnings                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `scope.insufficient`        | 403    | An MCP call with a token whose scopes do not include the tool's; `scope` names the one it needs (an `mdg_` token holds every scope)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `idempotency.mismatch`      | 409    | An `Idempotency-Key` the account used, within the last day, for another route or another body; nothing changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `idempotency.pending`       | 409    | An `Idempotency-Key` whose first request is still being answered; ask again in a moment                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `publish.unverified`        | 502    | The MCP tool `publish` stored the page, but its public address did not answer `200` when read back once; `url` names it, and the publication exists                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `local.feature-unavailable` | 409    | The local workspace does not provide this identity, sharing, guest-session or publishing action; no state is changed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `renderer.unavailable`      | 503    | The renderer object cannot draw or check diagrams now (its CPU limit, an overload, a reset); the MCP tools `preview`, `validate`, `write_files` and `publish` answer it, having changed nothing, and its message names `mdg mcp`, which does the same work on the person's machine                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `internal`                  | 500    | Anything unexpected, or a configuration the service cannot run with; the answer holds no detail; on a socket, a message the room could not handle (`4500`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

The approval page at `/cli-auth` answers `cli.invalid` and `request.forbidden` as pages that show
the code, in English or Spanish, instead of JSON.

## Routes

| Route                                                | Who may call                                                                | Answer                                                            |
| ---------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `GET /api/session`                                   | anyone                                                                      | `200`, who the page is for                                        |
| `POST /api/tokens`                                   | a person signed in on the page                                              | `201 { id, name, token }`                                         |
| `GET /api/tokens`                                    | a person, with the cookie or a token                                        | `200 { tokens }`                                                  |
| `DELETE /api/tokens/<id>`                            | a person, with the cookie or a token                                        | `204`                                                             |
| `GET /cli-auth`                                      | anyone; a person signed in approves                                         | the approval page, or a redirect to sign in                       |
| `POST /cli-auth`                                     | a person signed in on the page                                              | `303` to the command line's listener                              |
| `POST /cli-auth/token`                               | the command line                                                            | `200 { id, name, token }`                                         |
| `GET /cli-auth/style.css`                            | anyone                                                                      | the approval page's style sheet                                   |
| `GET /p/<id>`                                        | anyone                                                                      | `302` to `/?project=<id>`                                         |
| `GET /rooms/<id>`                                    | anyone the project admits, or a live session's token                        | `101`, a socket to the project's room                             |
| `PATCH /api/account`                                 | a person, with the cookie or a token                                        | `200 { handle }`                                                  |
| `GET /api/account/identity`                          | a person signed in on the page                                              | `200`, the identity service's sign-ins and sessions of the person |
| `POST /api/account/identity/unlink`                  | a person signed in on the page                                              | `200`, the same without the provider                              |
| `POST /api/account/identity/sessions/revoke-others`  | a person signed in on the page                                              | `200`, the same with this session alone                           |
| `POST /api/account/identity/sessions/<sid>/revoke`   | a person signed in on the page                                              | `200`, the same without that session                              |
| `POST /api/invitations/<token>/accept`               | a person, with the cookie or a token                                        | `200`, the project, with the role the person now has              |
| `GET /api/admin`                                     | an owner or an administrator, with the cookie; anyone else gets `404`       | `200`, what the central administration console shows              |
| `DELETE /api/admin/publications/<handle>/<slug>`     | an owner or an administrator, with the cookie; anyone else gets `404`       | `204`                                                             |
| `POST /api/admin/invitations`                        | an owner, with the cookie; anyone else gets `404`                           | `201`, the invitation (`200`, the one already pending)            |
| `DELETE /api/admin/invitations/<id>`                 | an owner, with the cookie; anyone else gets `404`                           | `204`                                                             |
| `POST /api/admin/invitations/<id>/accept`            | the invitee, with the cookie and the verified email; anyone else gets `404` | `204`                                                             |
| `POST /api/admin/invitations/<id>/decline`           | the invitee, with the cookie and the verified email; anyone else gets `404` | `204`                                                             |
| `DELETE /api/admin/administrators/<sub>`             | an owner, or that administrator, with the cookie; anyone else gets `404`    | `204`                                                             |
| `GET /api/admin/permissions/<id>`                    | an owner or an administrator, with the cookie; anyone else gets `404`       | `200`, the permission's holders                                   |
| `GET /api/admin/accounts/<account>/permissions/<id>` | an owner or an administrator, with the cookie; anyone else gets `404`       | `200`, the account's permission                                   |
| `PUT /api/admin/accounts/<account>/permissions/<id>` | an owner or an administrator, with the cookie; anyone else gets `404`       | `200`, the account's permission                                   |
| `POST /mcp`                                          | an agent, with an OAuth access token or an API token                        | the JSON-RPC answer ([The MCP endpoint](#the-mcp-endpoint))       |
| `GET /.well-known/oauth-authorization-server`        | anyone                                                                      | `200`, the authorization server's metadata                        |
| `GET /.well-known/oauth-protected-resource/mcp`      | anyone                                                                      | `200`, the endpoint's metadata (also at the path without `/mcp`)  |
| `POST /oauth/register`                               | an OAuth client; ten an hour per address                                    | `201`, the client                                                 |
| `GET /oauth/authorize`                               | anyone; a person signed in approves                                         | the consent page, a redirect to sign in, or one to the client     |
| `POST /oauth/authorize`                              | a person signed in on the page                                              | `303` to the client's redirect URI                                |
| `POST /oauth/token`                                  | an OAuth client                                                             | `200`, the tokens                                                 |
| `GET /api/account/apps`                              | a person signed in on the page                                              | `200 { grants }`                                                  |
| `DELETE /api/account/apps/<id>`                      | a person signed in on the page                                              | `204`                                                             |

The projects' routes each name the role they need: the owner's, an editor's or, for what only
reads, a viewer's, which the project's link may give to anyone, signed in or not
([Sharing and permissions](#sharing-and-permissions) has the table and the order of the refusals).
A route that needs more than the link gives needs a person, with the cookie or a token; a project
the person may not open at all is `404 project.not-found`. [The projects API](#the-projects-api),
[Sharing and permissions](#sharing-and-permissions) and [Publishing](#publishing) have their
shapes.

| Route                                          | Answer                                                                                                    |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `GET /api/projects`                            | `200 { projects }`                                                                                        |
| `POST /api/projects`                           | `201`, the project                                                                                        |
| `GET /api/projects/<id>`                       | `200`, the project                                                                                        |
| `PATCH /api/projects/<id>`                     | `200`, the project                                                                                        |
| `DELETE /api/projects/<id>`                    | `204`                                                                                                     |
| `POST /api/projects/<id>/duplicate`            | `201`, the copy (and `skipped`, when files were left)                                                     |
| `GET /api/projects/<id>/files`                 | `200 { revision, files, binaries, collisions }`                                                           |
| `PUT /api/projects/<id>/files`                 | `200 { revision }`                                                                                        |
| `PUT /api/projects/<id>/binaries/<path>`       | `200 { hash }`                                                                                            |
| `DELETE /api/projects/<id>/binaries/<path>`    | `204`                                                                                                     |
| `GET /api/projects/<id>/blobs/<hash>`          | `200`, the bytes, sandboxed                                                                               |
| `HEAD /api/projects/<id>/blobs/<hash>`         | `200`, the headers of the `GET`                                                                           |
| `POST /api/projects/<id>/versions`             | `201`, the version                                                                                        |
| `GET /api/projects/<id>/versions`              | `200 { versions }`                                                                                        |
| `GET /api/projects/<id>/versions/<n>`          | `200`, the version with its files                                                                         |
| `POST /api/projects/<id>/versions/<n>/restore` | `200 { revision, restored, saved, skipped? }`                                                             |
| `PUT /api/projects/<id>/thumbnail`             | `204`                                                                                                     |
| `GET /api/projects/<id>/thumbnail`             | `200`, the SVG, sandboxed                                                                                 |
| `GET /api/projects/<id>/sharing`               | `200`, the link level, the asker's role and, as far as they may see them, the people                      |
| `PATCH /api/projects/<id>/sharing`             | `200`, the whole state of the sharing                                                                     |
| `POST /api/projects/<id>/members`              | `201`, the invitation with its link (`200` when the email already had one pending)                        |
| `PATCH /api/projects/<id>/members/<sub>`       | `200`, the member                                                                                         |
| `DELETE /api/projects/<id>/members/<sub>`      | `204`                                                                                                     |
| `DELETE /api/projects/<id>/members/me`         | `204`                                                                                                     |
| `GET /api/projects/<id>/invitations`           | `200 { invitations }`                                                                                     |
| `DELETE /api/projects/<id>/invitations/<id>`   | `204`                                                                                                     |
| `GET /api/projects/<id>/publish`               | `200 { handle, publications, takedowns }`                                                                 |
| `PUT /api/projects/<id>/publish`               | `200 { url, handle, slug, bytes, published_at }`                                                          |
| `DELETE /api/projects/<id>/publish/<slug>`     | `204`                                                                                                     |
| `PUT /api/projects/<id>/live`                  | `200 { id, link, guestsEdit, startedAt, until, guests }`                                                  |
| `GET /api/projects/<id>/live`                  | `200`, the live session as `PUT` answers it, or `null`                                                    |
| `DELETE /api/projects/<id>/live`               | `204`                                                                                                     |
| `GET /api/account/usage`                       | `200 { projects, storageBytes, limits }`                                                                  |
| `GET /api/account/publications`                | `200 { handle, publications }`: every publication of the projects the asker owns, each with its `project` |

Times are ISO 8601 in UTC with milliseconds.

Client request bodies have explicit caps: ordinary account/project metadata and sharing/takedown JSON
are limited to 8 KiB; the CLI token exchange to 4 KiB; a project create/push to 17 MiB
(`doc.too-large`); an asset upload to 10 MiB (`quota.binary`); a thumbnail to 200 KiB
(`thumbnail.too-large`); and a publication request to 24 MiB, including at most 16 MiB of page
content (`publish.too-large`). An oversized ordinary JSON body is `400 request.invalid`.

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
    "entitlements": { "unbranded": false, "unbrandedBy": null },
    "administration": null,
    "administrationInvitation": null
  },
  "account": "https://id.meltemi.dev/account",
  "signOut": "https://id.meltemi.dev/logout",
  "support": { "url": "https://github.com/sponsors/askenaz" }
}
```

`handle` is the name the person publishes under, or `null` until they choose one
([Handles](#handles)). `entitlements.unbranded` says whether the account may export without the
Meltemi branding: `true` when an owner or an administrator granted it, and for every owner and
administrator ([Entitlements](#entitlements)); `entitlements.unbrandedBy` says who set the row's
flag: `"github-sponsors"` for a donation's claim, `"administrator"` for a person, and `null` when
the row does not hold it (an owner's or an administrator's own right included). `support`, in every
shape, is the page to donate on, `https://github.com/sponsors/<SPONSORS_ACCOUNT>`, when the service
has a sponsored account, and absent otherwise ([Sponsorships](#sponsorships)). `administration` is `{ "role": "owner" }` or
`{ "role": "administrator" }` for the people who administer the service, and `null` for everybody
else ([Administration](#administration)). `administrationInvitation` is the pending invitation to
administer addressed to the email of the session's own token, when the identity service verified
it, as `{ "id", "invitedBy": { "name" }, "expiresAt" }`, and `null` otherwise, always for an owner
or an administrator; the person accepts or declines it in the account panel. Before it answers, a
cookie whose email the identity service verified has every pending invitation for that email turned
into a membership ([Invitations](#invitations)); an email that is not verified resolves nothing.
Signing in makes nobody an administrator. `account` is the
identity service's page and `signOut` the address a form posts to, with the field `return_to`, to
end the session. A bearer token, so that the command line learns which token it holds, with
neither `account` nor `signOut`, nor the two administration fields, since a program does not
administer; it carries the handle too, but resolves no invitation, because only the cookie holds a
verified email. It carries the account's own `email` as the service holds it (an empty string
when it holds none), which the local MCP server's `whoami` answers:

```json
{
  "user": {
    "sub": "u_7d3f",
    "name": "Ana",
    "picture": "https://avatars.githubusercontent.com/u/1",
    "handle": "ana",
    "entitlements": { "unbranded": false, "unbrandedBy": null },
    "email": "ana@example.com"
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

The account panel can read linked providers and active sessions through these cookie-authenticated
routes. API bearer tokens cannot manage sign-ins or sessions (`403 request.forbidden`); a caller
without a browser session receives `401 auth.required`. The Origin rule applies to changes.

- `GET /api/account/identity` returns `{ "user", "identities": [{ "provider", "email", "emailVerified", "handle", "linkedAt" }], "sessions": [{ "sid", "label", "createdAt", "lastSeen", "expiresAt", "current" }], "canUnlink" }`.
  It may also return `"claimed": true` when a linked GitHub account claimed a sponsorship benefit.
- `POST /api/account/identity/unlink` takes `{ "provider" }`.
- `POST /api/account/identity/sessions/revoke-others` signs out other devices.
- `POST /api/account/identity/sessions/<sid>/revoke` signs out that session.

The `POST` routes return the updated view. Refusals retain the codes `identity.last`,
`provider.unknown`, `session.current`, `session.not-found` and `rate.limited`. An ended session is
`401 auth.required`; an unavailable account service is `502 identity.unavailable`.
Linking a provider and deleting the account use the Meltemi account service's own confirmation
pages rather than these API routes.

### Deletion events

Delete your family account from **Meltemi account**, where the confirmation explains the scope.
Diagrams removes the account's owned projects, versions, uploads, publications, API tokens,
pending CLI approvals and memberships. Connected-app grants are revoked. A later sign-in creates
new work; it does not restore the deleted projects.

An opaque account id and deletion timestamp are retained for 31 days to reject old sessions.
Takedown and administration audit records remain service records, and shared content-addressed
bytes are eligible for [cleanup](#the-collection-of-blobs) when no longer referenced.
The signed identity-event endpoint is reserved for the account service; scripts must not use it
to delete an account.

### The command line's sign-in

Use `mdg login` and approve the request in your browser; see the
[CLI guide](cli.md#signing-in-login-logout-and-whoami) for the user workflow. The public handshake is:

1. The client starts a callback listener on `127.0.0.1` and opens
   `https://diagrams.meltemi.dev/cli-auth?port=<n>&state=<s>`. The port is a plain decimal integer
   from 1024 to 65535; `state` is 16 to 128 base64url characters. Invalid input is `400 cli.invalid`.
2. The page requires a browser session and shows a six-character check. Compare it with the
   terminal before **Approve**. The check is the first six base32 characters (RFC 4648, uppercase,
   no padding) of the SHA-256 of `state`.
3. The generated approval form posts to `POST /cli-auth` with its CSRF value and the correct
   Origin. The callback goes only to `http://127.0.0.1:<port>/?code=<code>&state=<state>`; no API
   token appears in that address.
4. The client checks `state` and exchanges `{ "code": "…", "state": "…" }` at
   `POST /cli-auth/token`, without a cookie or Origin. A code lasts five minutes and is single-use.
   Success returns `200 { "id", "name", "token" }` once. Invalid, expired or used codes answer
   `400 cli.invalid`; an account with 20 tokens answers `413 quota.tokens`.
5. The CLI saves the credential and closes its callback listener. Without a local browser, use
   `mdg login --token` to read a token from standard input; do not put a token in a command option.

Ten failed exchanges in a minute make the next one `429 cli.rate` with `Retry-After: 60`.
The CLI waits at most five minutes for the callback and rejects requests to another host/port or
with a different state.

## A cloud project

A cloud project merges concurrent edits in a Yjs document and exposes revisioned file operations.
HTTP and WebSocket updates share validation and permissions; a viewer receives changes but may
not write them. See [Sharing and permissions](#sharing-and-permissions).

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
`binaries` and a path in `paths`, and its bytes are retrieved separately through the project-scoped asset API, never stored in the
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
`@meltemi/diagrams-project`, which the web app re-exports and
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

The role is fixed when the socket opens. A viewer receives everything an editor writes, as
everyone does, and the first update a viewer sends is refused: the room tells it with
`access.denied` and closes the socket with `4403`, and the document and its revision stay as they
were. Awareness is not an update: a viewer sends and receives it like anyone
([Awareness](#awareness)). A change of access cuts the sockets it may have outdated, so that the role is resolved again
([When access changes](#when-access-changes)).

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
| 4000       | none                                                | The connection closed without a refusal, for example after a change of access ([When access changes](#when-access-changes))                                                                  |

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
changes neither the document nor its revision. [The web app](web-app.md#working-together)
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
with the states of the other clients, in the same shape: those
heard from within the last thirty seconds, and no message at all when there are none. The newcomer
is announced to the others with its first state, not when it connects. The room does not keep the
canvas selection or the pointer, so a newcomer learns them from the sender's next state; a page
sends its state again every fifteen seconds.

**Removal.** `{ "<id>": null }` from the room says that connection has no state any more.
The room sends it when a client sends `null` (if it had a state), when its socket closes
(if it had one) and when thirty seconds pass without a state from it. The other clients receive
the removal; the socket whose state timed out stays open and can send a state again.
A page sends a state when it changes, at most four times a second, and again every fifteen
seconds as a heartbeat.

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

### Reads and pushes

The files endpoint returns the current project revision. List metadata and thumbnails can lag
behind edits, so clients should read the files endpoint before making a revision-checked change.

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
  characters; the description at most 500. `template` is one of `flow`, `c4`, `sequence`, `roadmap`,
  `free` and `purchase`, and gives the files of the web app's own build with their `project.json`,
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

### Idempotency keys

`POST /api/projects` and `PUT /api/projects/<id>/files` take an `Idempotency-Key` header: 1 to 64
visible ASCII characters, one per logical change, chosen by the client. The first request with a
key is answered and its answer kept for a day with the SHA-256 of its body; a repeat with the same
key and the same body is answered with that first answer again and `Idempotent-Replayed: true`, and
changes nothing (one project, one push). The same key with another body, or on another route, is
`409 idempotency.mismatch`; a repeat while the first request is still running is `409
idempotency.pending`. Keys are per account. An answer is kept when it is the request's own (a
success or a `4xx`, a stale push's `409 revision.mismatch` among them); a failure of the service
(`5xx`) or a rate (`429`) lets go of the key, so that a retry runs again. The key is claimed before the
change and answered after it , and a claim nobody
answered for a minute is taken over. Migration 0008 keeps them (`idempotency`); the account's next
key sweeps its expired ones and the scheduled cron everyone's. The MCP tools `create_project` and
`write_files` take the same key as `idempotencyKey`: the same key and body through either door are one
request.

## Sharing and permissions

A project has a link level and members besides its owner. The link level is `private` (the
default: only the owner and the members open the project), `view` (anyone with the link can view)
or `edit` (anyone signed in with the link can edit, and anyone else views). Members are people the
owner named by email, each with a role, `viewer` or `editor`. The effective role combines that
membership with link access, as shown below. A new project is `private`, and only its owner
changes who may open it.

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
route reads that header. `PATCH /api/account { handle }` needs a person, with the cookie or a token,
and the administration routes the cookie of an owner or an administrator
([Administration](#administration)). The routes about the asker's own account (`GET` and
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
the owner can copy the link again from the list, and it is returned to the owner
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
[the web app](web-app.md#viewing-a-shared-project).

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

A live session lets anyone with its link into a project for a while, with or without an account. There is at most one per project, and it lives
in the project's room, in the room's own storage, as `{ id, token, guestsEdit, startedAt, until }`:
it goes with the room when the project is deleted. The token is
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
`meltemi.dev`. In production
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

Published catalogs are served from `meltemi.page`, a separate domain that receives no Meltemi
session cookie and exposes no project API. The published address is `https://meltemi.page/<handle>/<slug>/`.

It serves `GET` and `HEAD` for `/<handle>/<slug>/` and `/<handle>/<slug>/index.html` when a
publication exists. Other paths or methods, an unpublished page and an address without its final
slash return `404`; the address has one spelling, without decoded percent-escapes.

| Header                                   | Meaning                                                                       |
| ---------------------------------------- | ----------------------------------------------------------------------------- |
| `Content-Type: text/html; charset=utf-8` | A published HTML page                                                         |
| `Cache-Control: public, max-age=300`     | An update or unpublish can take up to five minutes to reach an existing cache |
| `X-Content-Type-Options: nosniff`        | The content is not interpreted as another type                                |
| `Referrer-Policy: no-referrer`           | Following a link does not disclose the published page as the referrer         |

The page uses the catalog's [offline content policy](catalog.md#offline-by-construction).
A `404` has the plain-text body `Not found` and `Cache-Control: no-store`; a service-storage
failure is `500` with `Something went wrong`. The published host sets no cookie and never serves
an API route.

### Takedown

An owner or an administrator of the service ([Administration](#administration)) removes any
publication, through the central administration console or with
`DELETE /api/admin/publications/<handle>/<slug>`, with an optional `{ "reason" }` (at most 500
characters, line breaks and tabs allowed, no other control character). The caller must be one of
them with the cookie, so the `Origin` rule applies: an API token is not accepted even from an owner,
because a token is for programs and is stolen more easily. Everybody else, signed in or not, gets
`404 not-found`, the answer of a route that does not exist, and not `403`, which would tell a
stranger the route is there. The section asks for the publication's address and a reason, and
confirms; the same call from the browser's console on the page, signed in, sends the cookie and the
`Origin`:

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
published from, and the entry `takedown` of the administration log with `<handle>/<slug>` and the
reason ([The administration log](#the-administration-log)). A failure of the bucket leaves
everything as it was and the administrator tries again; a failure after it leaves a row with no
page, which the publish host
does not serve and a second try completes. The address then answers `404`, and the project's owner
sees the page, in `GET …/publish`, as removed by the service. Takedowns are the service's record
and stay when an account is deleted.

### Publications and deletion

Deleting a project deletes its pages (the objects first, then the rows with the project); deleting
the account does so for every project of the person ([Deletion events](#deletion-events)).
Unpublishing and deleting are the owner's: an editor cannot publish, and neither can a viewer.

## Administration

An owner or administrator opens the central console from **Administration** in the account menu.
It contains access and invitations, permissions, sponsorships, publications and recent activity.
An invitee uses **Invitation to administer** to accept or decline there. The product settings
panel has no Administration tab.

Owners and administrators have the different powers listed below. Service ownership is configured
by the service operator; an administrator is invited by an owner and must accept. The following
HTTP contracts describe authenticated clients on the Diagrams origin; the central console keeps
its own navigation and uses the same role checks.

| Act                                          | Owner | Administrator |
| -------------------------------------------- | ----- | ------------- |
| Read the section, its lists and the log      | yes   | yes           |
| Grant and revoke a permission                | yes   | yes           |
| Take a publication down                      | yes   | yes           |
| Invite an email, revoke a pending invitation | yes   | no            |
| Remove an administrator                      | yes   | no            |
| Leave (remove their own row)                 | no    | yes           |

Every administration route takes the session cookie on the page's own origin, so the `Origin` rule
applies before it runs. An anonymous caller, any other person and any API token, an owner's
included, get `404 not-found`, the answer of a route that does not exist, and not `403`, which would
tell a stranger the routes are there; an act that is the owners' answers an administrator the same.
The role is read on every request, so a removed administrator's next request is answered `404`.

### Invitations to administer

An owner invites an email with `POST /api/admin/invitations { "email" }`. The email is trimmed and
lower-cased, has at most 254 characters and a dotted domain, as a project's invitation does
([Invitations](#invitations)), else `400 request.invalid`. The email of an owner or an administrator
(the owner's own, or the verified email of their row) is `409 admin.already`; an email that has a
pending invitation already answers that one with `200`; with ten invitations pending, the eleventh
is `409 admin.limit`. Otherwise the invitation is recorded, with who invited and when, and answered
with `201`:

```json
{
  "id": "3f9a0c1d2e4b5a6978c0d1e2f3a4b5c6",
  "email": "beto@example.com",
  "invitedBy": { "sub": "u_owner", "name": "Olga" },
  "createdAt": "2026-10-29T12:00:00.000Z",
  "expiresAt": "2026-11-05T12:00:00.000Z"
}
```

**No mail is sent**, and there is no link or token: the invitee is whoever signs in with that email
verified, and signing in alone makes nobody an administrator. The session answer gives the invitee
the invitation as `user.administrationInvitation` ([The session answer](#the-session-answer)), and
they choose in the central access page: `POST /api/admin/invitations/<id>/accept` makes them an
administrator, unless the service has twenty already (`409 admin.limit`), and
`POST /api/admin/invitations/<id>/decline` declines it; both answer `204`. Either acts only on a
pending invitation, made less than seven days before, addressed to the email of the session's own
token when the identity service verified it; anything else (another email, an email that is not
verified, an invitation accepted, declined, revoked or seven days old, an API token) is
`404 not-found`, so an invitation is confirmed to nobody but its addressee. An invitation works
once. An owner revokes a pending one with `DELETE /api/admin/invitations/<id>`: `204`, or
`404 not-found` when it is not pending.

### Removing and leaving

`DELETE /api/admin/administrators/<sub>` removes an administrator's row and answers `204`: an owner
removes any administrator, and an administrator their own row alone, which is leaving. An owner's
`sub`, a `sub` with no row and another administrator's `sub` asked by an administrator are
`404 not-found`, and nothing is removed. The owner role cannot be removed through this route.

### An account, without a list of users

No route lists, searches or counts the accounts of the service: the section lists only the owners,
the administrators, the pending invitations and the holders of each permission. Where an
administration route names an account (`<account>`) it is one of three: an account id (one to two
hundred characters, no control character), which every person reads in the account panel's Profile;
`@` and a handle, for the person who holds it; or an email, told by an `@` after its first
character, for the one account whose row holds it verified, compared in lower case. No account is
`404 not-found`; an email that two or more accounts signed in with verified is
`409 account.ambiguous`, and the account id names one of them. A lookup creates nothing. It tells an
owner or an administrator whether an email has an account, and nobody else.

### Entitlements

The `unbranded-exports` permission lets an account export without Meltemi branding. Its export
dialog offers **Export without the Meltemi branding** ([web app](web-app.md#exports-in-the-browser)). Owners and administrators hold every
permission without a grant, as the session answer says; their own row says only what was set on it.
Three routes, for an owner or an administrator alike: `GET /api/admin/permissions/<id>` lists the
accounts whose row holds the permission, the earliest grant first, as `{ "id", "holders": [...] }`,
each with `sub`, `handle`, `name`, `email`, who granted it (`by`, as `{ "sub", "name" }`) and when
(`at`); `GET /api/admin/accounts/<account>/permissions/<id>` reads one account's, and `PUT` the same
path with `{ "granted": true }` or `{ "granted": false }` sets it, recording who (`by`) and when
(`at`), in one step with its entry in the log ([The administration log](#the-administration-log)).
A donation's claim sets the same columns with the grantor `github-sponsors`
([Sponsorships](#sponsorships)), and the holders show it as
`"by": { "sub": "github-sponsors", "name": "GitHub Sponsors" }`; an administrator revokes it as any
other grant. Both answer the account:

```json
{
  "sub": "u_7d3f",
  "handle": "ana",
  "name": "Ana",
  "email": "ana@example.com",
  "permission": {
    "id": "unbranded-exports",
    "granted": true,
    "by": "u_admin",
    "at": "2026-10-28T12:00:00.000Z"
  }
}
```

`<account>` is an account id, `@<handle>` or an email
([An account, without a list of users](#an-account-without-a-list-of-users)); an unknown permission
is `404 not-found`, and another body `400 request.invalid`. The person sees a grant or a revocation
at the next load of the page, which reads the session once, and a deleted account takes its
permissions with it. The section's **Permissions** grants and revokes; the same calls from the
browser's console on the page, signed in, are the holders, a grant by email and a revocation by
handle:

```js
await fetch("/api/admin/permissions/unbranded-exports", { credentials: "same-origin" }).then((r) =>
  r.json(),
);
```

```js
await fetch("/api/admin/accounts/ana%40example.com/permissions/unbranded-exports", {
  method: "PUT",
  credentials: "same-origin",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ granted: true }),
}).then((r) => r.json());
```

```js
await fetch("/api/admin/accounts/@ana/permissions/unbranded-exports", {
  method: "PUT",
  credentials: "same-origin",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ granted: false }),
}).then((r) => r.json());
```

### The administration log

Every invitation, revoked invitation, acceptance, decline, removal, leave, grant, revoked permission
and takedown appends a row to `admin_log`, in the same atomic step as the act and only when the act
happened: a refused request appends nothing. A row holds who (`by_sub`), when (`at`), what
(`invite`, `revoke-invitation`, `accept`, `decline`, `remove`, `leave`, `grant`, `revoke` or
`takedown`), to whom (`target_sub`, or the invited `target_email`) and a `detail`: the permission's
id, or the publication's `<handle>/<slug>` and the reason. A donation's claim is a `grant` whose
`by_sub` is `github-sponsors` and whose detail adds the sponsor's login, `unbranded-exports (ana)`. Rows are never changed, stay when the
people they name are deleted, and are swept 365 days after they were written.

### The administration answer

`GET /api/admin` answers an owner or an administrator, with `Cache-Control: no-store`, everything
the central administration console shows:

```json
{
  "role": "owner",
  "owners": [{ "sub": "u_owner", "name": "Olga", "handle": null, "email": "olga@example.com" }],
  "administrators": [
    {
      "sub": "u_9a1c",
      "name": "Beto",
      "handle": "beto",
      "email": "beto@example.com",
      "invitedBy": { "sub": "u_owner", "name": "Olga" },
      "since": "2026-10-29T12:30:00.000Z"
    }
  ],
  "invitations": [],
  "permissions": [{ "id": "unbranded-exports", "holders": [] }],
  "log": [
    {
      "at": "2026-10-29T12:30:00.000Z",
      "by": { "sub": "u_9a1c", "name": "Beto" },
      "action": "accept",
      "target": { "sub": "u_9a1c", "name": "Beto" },
      "detail": ""
    }
  ],
  "publishHost": "meltemi.page",
  "sponsorships": [
    {
      "login": "ana",
      "type": "User",
      "oneTime": false,
      "amountCents": 1000,
      "status": "active",
      "createdAt": "2026-11-04T09:30:00.000Z",
      "privacy": "public",
      "claimedBy": { "sub": "u_7d3f", "name": "Ana", "handle": "ana", "email": "ana@example.com" }
    }
  ]
}
```

`owners` and `administrators` are people, with their `sub`, `name`, `handle` and `email` (an owner
who never made a request has empty strings), the administrators with who invited them and since
when; `invitations` are the pending ones, the earliest first, as `POST /api/admin/invitations`
answers them, for an owner, and `[]` for an administrator; `permissions` are the catalog's, each
with its holders; `log` is the latest fifty entries, the newest first, with `by` and `target` as
`{ "sub", "name" }`, an account deleted since as `{ "sub", "name": "", "deleted": true }` and an
invited email as `{ "email" }`, and `github-sponsors` as `{ "sub": "github-sponsors", "name":
"GitHub Sponsors" }`; `publishHost` is `PUBLISH_HOST`, or `null` when it is unset, which the
section's takedown form checks a publication's address against; and `sponsorships` is the latest
fifty sponsorships, the newest first, each with `login`, `type`, `oneTime`, `amountCents`, `status`,
`createdAt`, `privacy` and `claimedBy` (a person, or `null`), and `[]` without a sponsored account.
A sponsor's login and a private sponsorship are shown to the people who administer the service and
to nobody else.

### Sponsorships

Where the service offers **Support Meltemi Diagrams**, it links to GitHub Sponsors. Use the GitHub
account linked to your Meltemi account so the service can recognize the benefit. Open
**Diagrams settings → Profile** after donating; when a claim is recognized it shows that your
account may export without Meltemi branding. Link a GitHub sign-in first if none is linked.

Owners and administrators review sponsorships and their claims in **Administration → Sponsorships**.
The resulting permission is the same `unbranded-exports` entitlement documented above; administrators
can grant or revoke it through **Permissions**. GitHub handles the payment and its receipts.

## The MCP endpoint

`POST /mcp` provides stateless Streamable HTTP for an agent working on account projects. The 2025
protocol revisions use an event stream with one answer; revision 2026-07-28 uses JSON. No session
id is issued, and `GET`/`DELETE` return `405`.

A different `Origin` is `403 request.forbidden`; an unsupported `MCP-Protocol-Version` is `400`.
A request without a valid OAuth or API bearer token is `401` with
`WWW-Authenticate: Bearer realm="OAuth", resource_metadata="<origin>/.well-known/oauth-protected-resource"`.
The session cookie does not authenticate MCP. A body over 24 MiB is `413`.
See [Authorization](#authorization) for sign-in and scopes.

An OAuth access token opens the endpoint as the account that approved it, with the scopes it was
granted; an `mdg_` API token, as its account, with every scope (`projects:read`, `projects:write`,
`sharing`, `live`, `publish`). Every tool checks its scope (`scope.insufficient`, naming it) and then
the role the project gives the account, as its route does: a wide scope never adds a role. A call is counted (300 a minute per account, `rate.limited` with `retryAfter`) and
logged as `mcp: <tool> <ms> ms <code>`, never with its arguments.

The twenty-eight tools: `whoami`; `list_projects`, `create_project`, `get_project`,
`rename_project`; `read_files`, `write_files`, `validate`, `upload_image`; `list_versions`,
`create_version`, `restore_version`; `open_url`; `preview`, `inspect_story`; `get_sharing`, `set_link_access`,
`invite`, `list_invitations`, `revoke_invitation`, `set_member_role`, `remove_member`; `get_live`,
`start_live`, `end_live`; `list_publications`, `publish`, `unpublish`. Each calls the operation its
route calls and answers `structuredContent` and the same JSON as text; a refusal
is an `isError` result `{ code, message, … }` with the codes of [Errors](#errors) (`project.not-found`
says nothing more, a quota names its `limit`). `write_files` takes `ifRevision` and has the renderer
object compile every `.meltemi` file it writes with the project's files first, refusing a push with an
error whole (`diagram.invalid`); `validate` gives a file's or the project's diagnostics the same way.
`preview` draws a PNG (1280 wide by default, 16 to 2048) or an SVG in the renderer object, at most 30
a minute per account, with a report beside it; a gantt chart that writes `today` without a date draws
its line at the server's UTC date. `invite` answers the invitation's link and
`emailSent: false`. `publish` has the renderer object build the catalog the page publishes, stores
it, and reads the public address back once (`HEAD`): an address that does not answer `200` is
`502 publish.unverified` with its `url`, and the publication exists.

`inspect_story` takes `project`, `path` and `story`, with the same `projects:read` scope and
project visibility as `preview`. It reports the current snapshot's revision, story duration,
ordered scenes and active views, transitions and nested action start/end/duration in milliseconds,
and each scene's `stillAtMs` for a final-state preview. Times come from the player's compiled
timeline, including defaults and parallel actions. It changes no source and reads no image bytes.
Each later preview reads its own current snapshot: compare revisions before claiming to have
reviewed the inspected timeline. Missing stories are `request.invalid`; compilation errors are
`diagram.invalid` with diagnostics; more than 10000 scenes/actions are refused.

When a call to the renderer object fails (its CPU limit exceeded, the object overloaded or reset),
`preview`, `inspect_story`, `validate`, `write_files` and `publish` answer `503 renderer.unavailable`, whose message
names `mdg mcp`; `write_files` and `publish` then have changed nothing, and the idempotency key keeps
no answer, so a retry works once the object answers.

### The local server

`mdg mcp` serves the same catalogue on the person's machine ([the command line](cli.md#the-local-mcp-server-mcp),
decision 0073): the definitions, the call wrapper, the stateless handler and the renderer's engine are
the public package `@meltemi/diagrams-mcp`, which the endpoint is built from too, and a test compares
the two `tools/list`. Its tools act through the routes above with the command line's API token, and
never call `/mcp` or the renderer object:

| Tool                                  | On the person's machine                                   | Through the API                                                     |
| ------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------- |
| `preview`                             | the picture and its report, with the renderer's engine    | `GET …/files`, and `GET …/blobs/<hash>` for its images and fonts    |
| `validate`                            | the diagnostics                                           | `GET …/files`                                                       |
| `inspect_story`                       | the compiled timeline, without drawing                    | `GET …/files`                                                       |
| `write_files`                         | the check of every `.meltemi` file written                | `GET …/files`, then `PUT …/files` with `Idempotency-Key`            |
| `publish`                             | the catalog, with the command line's script and generator | `GET …/publish`, `GET …/files`, `PUT …/publish`, a `HEAD` read-back |
| `whoami`                              |                                                           | `GET /api/session` (its `email`), `GET /api/account/usage`          |
| `list_publications` without a project |                                                           | `GET /api/account/publications`                                     |
| every other tool                      |                                                           | the route its operation is                                          |

### Authorization

The MCP endpoint supports OAuth 2.1 authorization-code sign-in with PKCE `S256` and optional
refresh-token access through `offline_access`. Clients discover the endpoints and supported
scopes from the metadata below:

| Address                                         | Is                                                                                                                                                                                                                    |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /.well-known/oauth-authorization-server`   | The server's metadata (RFC 8414): the endpoints, `S256`, `none` among the client authentications, `authorization_code` and `refresh_token`, `client_id_metadata_document_supported` and the six scopes                |
| `GET /.well-known/oauth-protected-resource/mcp` | The endpoint's metadata (RFC 9728): the resource `<origin>/mcp`, the server, the five scopes and `header`; the origin's `/.well-known/oauth-protected-resource`, which the challenge names, answers the same document |
| `POST /oauth/register`                          | Dynamic client registration (RFC 7591): ten an hour per address, every attempt counted under the keyed hash of the address (as the command line's failed exchanges), the eleventh `429 rate.limited`                  |
| `GET /oauth/authorize`                          | The consent page                                                                                                                                                                                                      |
| `POST /oauth/authorize`                         | Approve or Deny: `303` to the client's redirect URI, with `state` and `iss`                                                                                                                                           |
| `POST /oauth/token`                             | Codes exchanged with their PKCE verifier, refresh tokens rotated, tokens revoked (RFC 7009)                                                                                                                           |

A client registers by dynamic registration or names a client-id metadata document: an `https:`
address whose JSON names the client and its redirect URIs, fetched under the compatibility flag
`global_fetch_strictly_public`, so never from this zone's own origins. `GET /oauth/authorize` checks
the request first, whoever asks: an unknown client or a redirect URI it did not register is a page
with `request.invalid`, never a redirect; a `resource` other than `<origin>/mcp` is `invalid_target`;
PKCE must be `S256` for every client (`invalid_request`). A person not signed in on the page goes to
the identity service's sign-in and comes back to the same address. The consent page names the client
(and the domain of a metadata document; a registered client's name is said to be unverified), the
host the access is sent to, with a warning when that is this computer, and each scope in words, in
the interface language. Its form carries the library's handle, which works once, for ten minutes, in
the browser whose `__Host-` cookie it is bound to, and a `csrf` of the session over it, keyed with
`FORMS_SECRET`. Approve stores a grant with the person's `sub` and the client's name; Deny gives the
client `error=access_denied`.

The scopes are `projects:read` (reads, checks, previews), `projects:write` (writes, images,
versions), `sharing`, `live`, `publish`, and `offline_access` for a refresh token. A client that asks
for none of the five is offered the five; a scope the server does not know is dropped. The scope and
the project's role are two checks: a tool refuses what the token was not granted with
`scope.insufficient`, and the role refuses the rest (`access.denied`), so an editor with every scope
still cannot share.

An access token lives an hour (`expires_in: 3600`) and is bound to `<origin>/mcp` alone. With
`offline_access` a refresh token comes with it, valid thirty days from the exchange and rotated on
every use; the previous one goes on working until its replacement is first used, so a client that
lost an answer can retry. A code works once: a second exchange is `invalid_grant` and revokes the
grant, its tokens included. An expired token, one of a revoked grant and one of an account deleted
since its approval are `401`. An OAuth token never opens `/api/*` (`401 token.invalid`), and the
server never issues an `mdg_` token nor takes one on `/oauth/token`. The library's refusals are
answered, not logged (a failure of its own is logged by its code alone), and no address of the flow
carries a token; the code does, once.

### Connected apps

`GET /api/account/apps` answers
`{ grants: [{ id, client: { name, uri }, scopes, createdAt, lastUsedAt }] }`, the latest first. `uri`
is a metadata document's address, or the origin the access goes to for a registered client, whose
own claims are not shown as fact; `lastUsedAt` is the last time the grant's token reached the
endpoint, written at most hourly , `null` while never.
`DELETE /api/account/apps/<id>` revokes the grant and its tokens at once and answers `204`, or
`404 not-found` for a grant that is not the person's. Both are for a person signed in on the page:
an API token is `403 request.forbidden`, an OAuth token `401 token.invalid` and nobody
`401 auth.required`, and the `DELETE` is under [the Origin rule](#the-origin-rule). A client that
authorizes again replaces its earlier grant, and a `user.deleted` event revokes every grant the
person approved before the deletion ([Deletion events](#deletion-events)). The account panel's
Connected apps section reads and revokes them ([the web app](web-app.md#the-account-panel)).

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

Content is shared by hash and remains while a project, upload or version references it.
Unreferenced content is eligible for cleanup once its stored record is more than seven days old.
Cleanup runs twice a month in bounded batches, so a backlog or a failed cleanup can retain it
longer;
this is not a recovery or version-history feature.

An image or font removed while offline, without a successful asset deletion, can remain counted
in your storage until the project is deleted. Check **Diagrams settings → Usage** for the account's
current usage. Deleting a project also removes its versions and asset references.
