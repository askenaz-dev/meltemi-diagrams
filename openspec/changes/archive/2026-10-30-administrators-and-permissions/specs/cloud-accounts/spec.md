## MODIFIED Requirements

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
