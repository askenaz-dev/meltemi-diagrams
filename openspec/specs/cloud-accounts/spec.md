# cloud-accounts Specification

## Purpose
The optional account of the hosted service: the account in the playground's header (sign in, account menu, API tokens, sign out), the user rows and the session answer, API tokens, the signed deletion events of the identity service, and the command line's approval page and code exchange. The page works without any of it.
## Requirements
### Requirement: The account in the page
At start the page SHALL ask `GET /api/session` once; any answer other than a `200` JSON SHALL
mean anonymous, silently, and so SHALL an answer with `user` null and no `signIn`. Anonymous,
the header SHALL show "Sign in", a link to the identity service's `/login` with the page's
address as `return_to`: the answer's `signIn` when present, else one the page builds from the
identity origin it was built with (`PLAYGROUND_IDENTITY`). Signed in, it SHALL show the avatar
and name with a menu: "Account" and "API tokens", which open the account panel
(`account-panel`) at Profile and at API tokens, the usage block, which opens it at Usage, and
"Sign out" (a form posting to the identity service's `/logout` with `return_to` the page). The
policy SHALL allow that form (`form-action 'self'` plus the identity origin the page was built
with) and the providers' avatar hosts in `img-src`; `connect-src` and `frame-src` SHALL stay
`'self'`, and nothing of the account SHALL open a frame, a popup or a new tab: the two flows that
leave the page (linking a provider, deleting the account) are navigations in the same tab that
come back. The page SHALL use the answer's `signIn`, `account` and `signOut` only when they are
`http:` or `https:` addresses without credentials, and SHALL draw a picture only from an `https:`
address or its own origin. On a static server the page SHALL behave exactly as before.

#### Scenario: Served by a static server
- **WHEN** the page is served by the playground suite's static server
- **THEN** `/api/session` answers the static `{ "user": null }` the build wrote, the header shows "Sign in" linking to the identity service the page was built with, no console error is logged, and everything else is as before

#### Scenario: Signed in
- **WHEN** the browser carries a session minted for `Ana`
- **THEN** the header shows `Ana` with her avatar from the host her token's `picture` names, and the menu's Account opens the panel at Profile in the same page

#### Scenario: Not JSON
- **WHEN** `/api/session` answers `200` with a body that is not JSON
- **THEN** the header shows "Sign in" and nothing is logged

#### Scenario: A hostile address
- **WHEN** `/api/session` answers a person whose `signOut` is `javascript:alert(1)`
- **THEN** the header shows "Sign in" and no form carries that address

### Requirement: Users and the session answer
The Worker SHALL keep a user per `sub` from the first authenticated request, caching `name`,
`picture`, `email` and `email_verified` from the token and refreshing them when a request's
claims differ. `GET /api/session` SHALL answer, with `Cache-Control: no-store`, one of three
shapes: `{ "user": { "sub", "name", "picture", "handle", "entitlements": { "unbranded" },
"administration", "administrationInvitation" }, "account", "signOut" }` for a cookie principal,
`{ "user": { "sub", "name", "picture", "handle", "entitlements": { "unbranded" } }, "token":
{ "id", "name" } }` for a bearer principal (no `account`, no `signOut`, no administration), and
`{ "user": null, "signIn" }` for anyone else; `handle` SHALL be the person's publishing handle or
`null`, and `user.entitlements.unbranded` SHALL be `true` when the person's row has the
`unbranded_exports` flag or the person is an owner or an administrator (`service-administration`,
"Owners and administrators"), and `false` otherwise ("Entitlements of an account"). In the cookie
shape, `user.administration` SHALL be `{ "role": "owner" | "administrator" }` or `null`, and
`user.administrationInvitation` SHALL be `{ "id", "invitedBy": { "name" }, "expiresAt" }` for the
pending, unexpired administrator invitation addressed to the session token's own email claim when
that claim is verified, and `null` otherwise (never for an owner or an administrator). The `user`
object SHALL have the same fields in both signed-in answers but the two administration fields; for
a bearer principal `entitlements` is informational, since no program reads it.

#### Scenario: A renamed person
- **WHEN** a request arrives with a token whose `name` differs from the cached one
- **THEN** the user row takes the new name and `GET /api/session` returns it

#### Scenario: A bearer token asks
- **WHEN** `GET /api/session` carries `Authorization: Bearer mdg_…` of a valid token
- **THEN** the answer holds `user` (with `entitlements`, without `administration` and `administrationInvitation`) and `token: { id, name }` and has neither `account` nor `signOut`

#### Scenario: Not JSON for a browser error
- **WHEN** `GET /api/session` is requested with a cookie whose signature is invalid
- **THEN** the answer is `200` with `"user": null` and no error is shown in the page

#### Scenario: The entitlement in the answer
- **WHEN** `GET /api/session` is asked with the cookie of a person whose flag is set, with the cookie of an owner whose flag is not, with the cookie of an administrator whose flag is not, and with the cookie of a plain person
- **THEN** the first three answers carry `"user": { …, "entitlements": { "unbranded": true } }` and the fourth `"entitlements": { "unbranded": false }` inside `user`, and the anonymous shape carries no `entitlements`

#### Scenario: The role in the answer
- **WHEN** `GET /api/session` is asked with the cookie of the owner, of an administrator and of a plain person
- **THEN** `user.administration` is `{ "role": "owner" }`, `{ "role": "administrator" }` and `null`

#### Scenario: A pending invitation in the answer
- **WHEN** the owner Guillmar invited `ana@example.com` and Ana asks `GET /api/session` with a cookie whose verified email is `ana@example.com`, and later with one whose email is not verified
- **THEN** the first answer's `user.administrationInvitation` is `{ "id": <id>, "invitedBy": { "name": "Guillmar Ortiz" }, "expiresAt": <seven days after the invitation> }` and the second's is `null`

### Requirement: Deletion events
`POST /_identity/events` SHALL read at most 8 KiB (`400 request.invalid` beyond that), verify
`Meltemi-Signature` with the identity service's events secret for the product `diagrams` (its
`EVENTS_SECRET_DIAGRAMS`, held here as `IDENTITY_EVENTS_SECRET`; `401 signature.invalid`
otherwise), be idempotent by event id, delete everything held for the `sub` of a `user.deleted`
event (the user, its tokens, its approval codes, its `administrators` row, the pending administrator
invitations it made, and whatever the other changes add), and answer `200 { "status": "applied" |
"duplicate" | "ignored" }`; unknown event types SHALL answer `200` and change nothing. The rows of
`admin_log` that name the `sub` SHALL stay. The verifier trusts a live session for an hour, so a
session cookie issued before a deletion handled for its `sub` SHALL count as anonymous and make no
user row, while one issued in a later second SHALL be accepted; the record SHALL be kept 31 days.

#### Scenario: A person is deleted
- **WHEN** a signed `user.deleted` event for `u1` arrives
- **THEN** `users` has no `u1`, its tokens are gone, and a second delivery of the same event answers `200` without error

#### Scenario: A forged event
- **WHEN** the signature was made with another secret
- **THEN** the answer is `401 signature.invalid` and nothing changes

#### Scenario: A session from before the deletion
- **WHEN** a signed `user.deleted` event for `u1` was handled and a request arrives, inside the verifier's hour, with a cookie for `u1` issued before it
- **THEN** the request is anonymous, `GET /api/session` answers `{ "user": null, … }`, and no user row `u1` exists afterwards

#### Scenario: A person who signs in again
- **WHEN** the deleted person signs in again, so that the new session is issued in a later second than the event's time
- **THEN** the request is that person's and a new user row is made

#### Scenario: An administrator is deleted
- **WHEN** signed `user.deleted` events arrive for the administrator `u2` and for the owner `u-owner`, who has one pending invitation, while the log names both
- **THEN** `u2` has no `administrators` row and is not listed by `GET /api/admin`, the owner's pending invitation is gone, and the log rows that name them stay

### Requirement: API tokens
A person SHALL create tokens (`POST /api/tokens { name }`, answering the token once as
`mdg_` plus 32 random bytes in base64url), list them (`GET /api/tokens`: id, name, created,
last used) and revoke them (`DELETE /api/tokens/:id`); only the SHA-256 of a token SHALL be
stored; a bearer token SHALL authenticate `/api/*` and bump its last-used time at most once an
hour; at most 20 tokens per account (`413 quota.tokens`). Creating a token SHALL require a
cookie principal: a bearer principal gets `403 request.forbidden` and an anonymous request
`401 auth.required`. Every request body SHALL be read through a cap (8 KiB for the JSON of
`POST /api/tokens`, `400 request.invalid` beyond it).

#### Scenario: Create and use
- **WHEN** a signed-in person creates a token and a later request carries it as a bearer
- **THEN** the request is that person's and the stored row holds a hash, not the token

#### Scenario: A revoked token
- **WHEN** the token is revoked and used again
- **THEN** the answer is `401 token.invalid`

#### Scenario: Too many
- **WHEN** a person with 20 tokens creates another
- **THEN** the answer is `413 quota.tokens`

#### Scenario: A token cannot make a token
- **WHEN** `POST /api/tokens` carries `Authorization: Bearer mdg_…` of a valid token
- **THEN** the answer is `403 request.forbidden` and no token is created

### Requirement: The command line's approval page
`GET /cli-auth?port=<n>&state=<s>` SHALL redirect a signed-out person to sign-in with itself as
the return address, and show a signed-in person an approval page, in English or Spanish, naming
the port and a six-character check (the first six characters of the base32 of
SHA-256(`state`)) that `mdg login` prints. `port` SHALL be an integer from 1024 to 65535 and
`state` 16 to 128 base64url characters; anything else SHALL answer `400 cli.invalid`.
`POST /cli-auth` (a cookie principal, the page's `csrf` and the `Origin` rule) SHALL store a
one-time code (32 random bytes, five minutes, bound to `state` and the person) and redirect
(`303`) to `http://127.0.0.1:<n>/?code=<code>&state=<s>`; the host SHALL always be `127.0.0.1`
and no token SHALL exist yet nor appear in a URL. `POST /cli-auth/token { code, state }` (no
cookie, no `Origin`) SHALL delete the code, create a token named `CLI (<date>)` for that person
and answer `{ id, name, token }` once, or `413 quota.tokens` when the person holds 20 (which is
not a failure); an unknown, used or expired code, a `state` that does not match, or a body that
is too long or not of that shape SHALL answer `400 cli.invalid` and count as a failure, and more
than 10 failures per minute from one IP SHALL answer `429 cli.rate` with `Retry-After: 60`. The
bodies SHALL be read through caps (8 KiB for the approval form, 4 KiB for the exchange). Every
approval and every failed exchange SHALL first remove the codes that expired and the failures
more than an hour old, so that a flood leaves the tables small. The page SHALL answer with
`form-action 'self' http://127.0.0.1:*` in its policy and `Referrer-Policy: same-origin`.

#### Scenario: Approved
- **WHEN** a signed-in person approves with port `43123` and a valid `state`
- **THEN** the redirect is to `http://127.0.0.1:43123/?code=…&state=<that state>`, a one-time code exists for five minutes, no token exists yet, and no token value is in the address

#### Scenario: Exchanged once
- **WHEN** `POST /cli-auth/token` carries that code and state within five minutes
- **THEN** the answer is `{ id, name, token }`, a token named `CLI (…)` now exists with only its hash stored, and the token authenticates `/api/*`

#### Scenario: Exchanged at the quota
- **WHEN** the person holds 20 tokens and the exchange arrives
- **THEN** the answer is `413 quota.tokens`, the code is consumed and no token is created

#### Scenario: A state that does not match
- **WHEN** the exchange carries a valid code with another `state`
- **THEN** the answer is `400 cli.invalid`, no token is created, and the failure counts toward the rate limit

#### Scenario: Too many failures
- **WHEN** one IP sends ten failed exchanges within a minute and then an eleventh
- **THEN** the eleventh answers `429 cli.rate` even if its code is valid, and a valid exchange succeeds again once the minute has passed

#### Scenario: A second exchange
- **WHEN** the same code is sent again
- **THEN** the answer is `400 cli.invalid` and no second token is handed out

#### Scenario: A bad port
- **WHEN** `port` is `80` or `localhost:4000`
- **THEN** the answer is `400 cli.invalid` and no token is created

#### Scenario: A bad state
- **WHEN** `state` has 8 characters or 129 characters
- **THEN** the answer is `400 cli.invalid` and no token is created

#### Scenario: What nobody comes back for
- **WHEN** a code is approved and never exchanged, five minutes pass, and another approval is made
- **THEN** the expired code is gone from the store, and so are the failures more than an hour old

#### Scenario: A form that is too long
- **WHEN** `POST /cli-auth` carries a body of more than 8 KiB
- **THEN** it is read no further, no code is stored, and a signed-in person gets the refused page

### Requirement: Invitations resolved at sign-in
`GET /api/session` with a cookie principal whose email the provider verified SHALL turn every
pending invitation for that email into a membership before answering, and SHALL include the
person's `handle` (or null) in the answer; an unverified email SHALL resolve nothing.

#### Scenario: Pending invitations become memberships
- **WHEN** two projects invited `ana@example.com` and Ana's verified session calls `GET /api/session`
- **THEN** both memberships exist and both invitations are accepted

#### Scenario: Nothing for an unverified email
- **WHEN** the session's `email_verified` is false
- **THEN** the invitations stay pending

### Requirement: The identity data through the Worker
The Worker SHALL answer `GET /api/account/identity`, `POST /api/account/identity/unlink
{ provider }`, `POST /api/account/identity/sessions/revoke-others` and `POST
/api/account/identity/sessions/:sid/revoke` for a cookie principal only (a bearer API token `403
request.forbidden`, anonymous `401 auth.required`), the `POST`s under the Origin rule, by making
the identity service's account call with the person's session token as a bearer and the product's
signature (`signProductRequest` of `@meltemi/identity` with `IDENTITY_EVENTS_SECRET`), with a
five-second timeout. It SHALL pass through the service's JSON and status for `identity.last`,
`session.current`, `session.not-found`, `provider.unknown` and `rate.limited`, SHALL answer `401
auth.required` when the service says `session.invalid`, and `502 identity.unavailable` when the
service does not answer, times out or answers something it cannot read, logging no body. The
cookie principal SHALL carry the session token it was verified from, and nothing but these routes
SHALL read it. The browser suite's stand-in for the identity service SHALL answer the account API
and verify the signature.

#### Scenario: Read on the person's behalf
- **WHEN** a signed-in person's page asks `GET /api/account/identity`
- **THEN** the Worker's call to the identity service carries `Authorization: Bearer <her session token>`, `Meltemi-Product: diagrams` and a signature the suite's stand-in verifies, and the page receives the identities and sessions

#### Scenario: A token cannot manage the account
- **WHEN** `GET /api/account/identity` carries `Authorization: Bearer mdg_…`
- **THEN** the answer is `403 request.forbidden` and the identity service is not called

#### Scenario: Another origin
- **WHEN** `POST /api/account/identity/sessions/revoke-others` arrives with the cookie and `Origin: https://id.meltemi.dev`
- **THEN** the answer is `403 request.forbidden` and nothing is revoked

#### Scenario: The service is down
- **WHEN** the identity service does not answer within five seconds
- **THEN** the answer is `502 identity.unavailable` and the log names the route and the status, never a body

#### Scenario: The session died
- **WHEN** the identity service answers `401 session.invalid`
- **THEN** the Worker answers `401 auth.required`

### Requirement: Entitlements of an account
The `users` table SHALL hold `unbranded_exports`, `0` or `1`, `0` for every row until an
administrator sets it, and `unbranded_exports_by` and `unbranded_exports_at`, `NULL` until then
(migration `0005_unbranded_exports.sql`, three `ALTER TABLE … ADD COLUMN` with defaults); `User`
SHALL carry them as `unbrandedExports`, `unbrandedExportsBy` and `unbrandedExportsAt`, and the
store SHALL set the three with `setUnbrandedExports(sub, on, by, at)`, answering `"set"` or
`"missing"` for a `sub` with no row, list the entitled rows with `entitledUsers()` (the earliest
`at` first), find a person with `userByHandle(handle)` and the rows of a verified email with
`usersByEmail(email)`, in both the in-memory and the D1 store. The flag SHALL be the permission
`unbranded-exports` of the catalog (`service-administration`, "Permissions"): an owner or an
administrator SHALL list its holders with `GET /api/admin/permissions/unbranded-exports`, read one
account's with `GET /api/admin/accounts/<account>/permissions/unbranded-exports` and set it with
`PUT` on the same path and `{ "granted": true | false }`, recording the caller's `sub` and the
time, from the routes or from the account panel's Administration section; `<account>` SHALL be an
account id, `@<handle>` or an email ("An account without a list of users"). Each change SHALL be
logged ("The administration log"). The routes SHALL answer `404 not-found` to anyone else (an
anonymous caller, a person with no role, an API token even of an owner), and the `PUT` SHALL be
subject to the `Origin` rule before it runs and SHALL answer `400 request.invalid` to a body that is
not `{ "granted": boolean }`. Deleting the account (`user.deleted`) SHALL remove the flag with the
row.

#### Scenario: A grant and its effect
- **WHEN** the administrator `u-admin` sends `PUT /api/admin/accounts/u1/permissions/unbranded-exports` with `{ "granted": true }` from the page's origin at `2026-10-28T10:00:00.000Z`, and `u1` then asks `GET /api/session`
- **THEN** the `PUT` answers `200 { "sub": "u1", "handle": null, "name": "Ana", "email": "ana@example.com", "permission": { "id": "unbranded-exports", "granted": true, "by": "u-admin", "at": "2026-10-28T10:00:00.000Z" } }` and the session answer's `user.entitlements` is `{ "unbranded": true }`

#### Scenario: A grant by handle
- **WHEN** `u2` holds the handle `tienda` and the administrator sends `PUT /api/admin/accounts/@tienda/permissions/unbranded-exports` with `{ "granted": true }`
- **THEN** the answer is `200` with `"sub": "u2"` and `"handle": "tienda"`, and `u2`'s next session answer says `true`

#### Scenario: The list
- **WHEN** `u1` was granted first and `u2` second, `u3` was granted and then revoked, and the administrator asks `GET /api/admin/permissions/unbranded-exports`
- **THEN** the answer is `200 { "id": "unbranded-exports", "holders": [ { u1 … }, { u2 … } ] }` in that order, each with `sub`, `handle`, `name`, `email`, `by` and `at`, and `u3` is not in it

#### Scenario: A revocation
- **WHEN** the administrator sends `{ "granted": false }` for `u1`
- **THEN** the answer is `200` with `"granted": false` and the revocation's `by` and `at`, the next session answer of `u1` says `false`, and a `GET` of the permission says `false`

#### Scenario: An administrator's own row
- **WHEN** the administrator reads `GET /api/admin/accounts/<own sub>/permissions/unbranded-exports` without ever setting the flag
- **THEN** the answer says `"granted": false` with `"by": null` and `"at": null`, while the administrator's own session answer says `true`

#### Scenario: Not an administrator
- **WHEN** a signed-in person with no role sends the list `GET`, the `GET` or the `PUT`, or an anonymous caller does
- **THEN** the answer is `404 not-found` and nothing changes

#### Scenario: An administrator's token
- **WHEN** an owner sends the `PUT` or the list `GET` with `Authorization: Bearer mdg_…` instead of the cookie
- **THEN** the answer is `404 not-found` and nothing changes

#### Scenario: Another origin
- **WHEN** the administrator's `PUT` arrives with `Origin: https://id.meltemi.dev`
- **THEN** the answer is `403 request.forbidden` and the flag is unchanged

#### Scenario: An unknown account
- **WHEN** the administrator sends the `PUT` for a `sub` that has made no request, for a `sub` of three hundred characters, for `@nobody-here` when no row holds that handle, for `@Tienda`, or for an email no row holds verified
- **THEN** each answer is `404 not-found` and no row is created

#### Scenario: A bad body
- **WHEN** the administrator sends `{ "granted": "yes" }`, `{}`, `[]` or the former `{ "unbranded": true }`
- **THEN** the answer is `400 request.invalid` and the flag, `by` and `at` are unchanged

#### Scenario: Deleted with the account
- **WHEN** a signed `user.deleted` event arrives for an entitled `u1`
- **THEN** `users` has no `u1`, a `GET` of its permission answers `404 not-found`, and the holders no longer include it

#### Scenario: The migration file
- **WHEN** the migration tests read `packages/cloud/migrations`
- **THEN** `0005_unbranded_exports.sql` is the fifth numbered file, adds the three columns with their defaults and the check, holds no transaction control, pragma, data or drop, and is plain ASCII

