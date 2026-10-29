## MODIFIED Requirements

### Requirement: Users and the session answer
The Worker SHALL keep a user per `sub` from the first authenticated request, caching `name`,
`picture`, `email` and `email_verified` from the token and refreshing them when a request's
claims differ. `GET /api/session` SHALL answer, with `Cache-Control: no-store`, one of three
shapes: `{ "user": { "sub", "name", "picture", "handle", "entitlements": { "unbranded" } },
"account", "signOut" }` for a cookie principal, `{ "user": { "sub", "name", "picture", "handle",
"entitlements": { "unbranded" } }, "token": { "id", "name" } }` for a bearer principal (no
`account`, no `signOut`), and `{ "user": null, "signIn" }` for anyone else; `handle` SHALL be the
person's publishing handle or `null`, and `user.entitlements.unbranded` SHALL be `true` when the
person's row has the `unbranded_exports` flag or the `sub` is listed in `ADMIN_SUBS`, and `false`
otherwise ("Entitlements of an account"). The `user` object SHALL have the same shape in both
signed-in answers; for a bearer principal `entitlements` is informational, since no program reads
it.

#### Scenario: A renamed person
- **WHEN** a request arrives with a token whose `name` differs from the cached one
- **THEN** the user row takes the new name and `GET /api/session` returns it

#### Scenario: A bearer token asks
- **WHEN** `GET /api/session` carries `Authorization: Bearer mdg_…` of a valid token
- **THEN** the answer holds `user` (with `entitlements`) and `token: { id, name }` and has neither `account` nor `signOut`

#### Scenario: Not JSON for a browser error
- **WHEN** `GET /api/session` is requested with a cookie whose signature is invalid
- **THEN** the answer is `200` with `"user": null` and no error is shown in the page

#### Scenario: The entitlement in the answer
- **WHEN** `GET /api/session` is asked with the cookie of a person whose flag is set, with the cookie of a person listed in `ADMIN_SUBS` whose flag is not, and with the cookie of a plain person
- **THEN** the first two answers carry `"user": { …, "entitlements": { "unbranded": true } }` and the third `"entitlements": { "unbranded": false }` inside `user`, and the anonymous shape carries no `entitlements`

## ADDED Requirements

### Requirement: Entitlements of an account
The `users` table SHALL hold `unbranded_exports`, `0` or `1`, `0` for every row until an
administrator sets it, and `unbranded_exports_by` and `unbranded_exports_at`, `NULL` until then
(migration `0005_unbranded_exports.sql`, three `ALTER TABLE … ADD COLUMN` with defaults); `User`
SHALL carry them as `unbrandedExports`, `unbrandedExportsBy` and `unbrandedExportsAt`, and the
store SHALL set the three with `setUnbrandedExports(sub, on, by, at)`, answering `"set"` or
`"missing"` for a `sub` with no row, list the entitled rows with `entitledUsers()` (the earliest
`at` first) and find a person with `userByHandle(handle)`, in both the in-memory and the D1 store.
A cookie principal whose `sub` is listed in `ADMIN_SUBS` SHALL list, read and set the flag:
`GET /api/admin/entitlements` SHALL answer `200 { "accounts": [ { "sub", "handle", "name",
"entitlements": { "unbranded": true, "by", "at" } } ] }` with the rows whose flag is `1`;
`GET /api/admin/accounts/<account>/entitlements` SHALL answer `200 { "sub", "handle", "name",
"entitlements": { "unbranded", "by", "at" } }` with the row's values (not the implicit entitlement
of an administrator), and `PUT` the same path with `{ "unbranded": true | false }` SHALL set the
flag, record the caller's `sub` and the time, and answer the same shape; `<account>` SHALL be a
`sub` of one to two hundred characters without control characters, or `@` followed by a handle
(`[a-z0-9-]{3,30}`) resolved to the row that holds it. The three routes SHALL answer `404 not-found`
to anyone else (an anonymous caller, a person not listed, an API token even of a listed person), as
the takedown route does, and the two of one account SHALL answer `404 not-found` for an `<account>`
of another shape, for a `sub` that has no row and for a handle nobody holds; the `PUT` SHALL be
subject to the `Origin` rule before it runs and SHALL answer `400 request.invalid` to a body that is
not `{ "unbranded": boolean }`. Deleting the account (`user.deleted`) SHALL remove the flag with
the row. The routes SHALL not be linked from the page; the docs SHALL show how an administrator
calls them from the browser's console on the page.

#### Scenario: A grant and its effect
- **WHEN** the administrator `u-admin` sends `PUT /api/admin/accounts/u1/entitlements` with `{ "unbranded": true }` from the page's origin at `2026-10-28T10:00:00.000Z`, and `u1` then asks `GET /api/session`
- **THEN** the `PUT` answers `200 { "sub": "u1", "handle": null, "name": "Ana", "entitlements": { "unbranded": true, "by": "u-admin", "at": "2026-10-28T10:00:00.000Z" } }` and the session answer's `user.entitlements` is `{ "unbranded": true }`

#### Scenario: A grant by handle
- **WHEN** `u2` holds the handle `tienda` and the administrator sends `PUT /api/admin/accounts/@tienda/entitlements` with `{ "unbranded": true }`
- **THEN** the answer is `200` with `"sub": "u2"` and `"handle": "tienda"`, and `u2`'s next session answer says `true`

#### Scenario: The list
- **WHEN** `u1` was granted first and `u2` second, `u3` was granted and then revoked, and the administrator asks `GET /api/admin/entitlements`
- **THEN** the answer is `200 { "accounts": [ { u1 … }, { u2 … } ] }` in that order, each with `sub`, `handle`, `name` and `entitlements: { unbranded: true, by, at }`, and `u3` is not in it

#### Scenario: A revocation
- **WHEN** the administrator sends `{ "unbranded": false }` for `u1`
- **THEN** the answer is `200` with `"unbranded": false` and the revocation's `by` and `at`, the next session answer of `u1` says `false`, and a `GET` of the entitlements says `false`

#### Scenario: An administrator's own row
- **WHEN** the administrator reads `GET /api/admin/accounts/<own sub>/entitlements` without ever setting the flag
- **THEN** the answer says `"unbranded": false` with `"by": null` and `"at": null`, while the administrator's own session answer says `true`

#### Scenario: Not an administrator
- **WHEN** a signed-in person outside `ADMIN_SUBS` sends the list `GET`, the `GET` or the `PUT`, or an anonymous caller does
- **THEN** the answer is `404 not-found` and nothing changes

#### Scenario: An administrator's token
- **WHEN** a listed person sends the `PUT` or the list `GET` with `Authorization: Bearer mdg_…` instead of the cookie
- **THEN** the answer is `404 not-found` and nothing changes

#### Scenario: Another origin
- **WHEN** the administrator's `PUT` arrives with `Origin: https://id.meltemi.dev`
- **THEN** the answer is `403 request.forbidden` and the flag is unchanged

#### Scenario: An unknown account
- **WHEN** the administrator sends the `PUT` for a `sub` that has made no request, for a `sub` of three hundred characters, for `@nobody-here` when no row holds that handle, or for `@Tienda`
- **THEN** each answer is `404 not-found` and no row is created

#### Scenario: A bad body
- **WHEN** the administrator sends `{ "unbranded": "yes" }`, `{}` or `[]`
- **THEN** the answer is `400 request.invalid` and the flag, `by` and `at` are unchanged

#### Scenario: Deleted with the account
- **WHEN** a signed `user.deleted` event arrives for an entitled `u1`
- **THEN** `users` has no `u1`, a `GET` of its entitlements answers `404 not-found`, and the list no longer holds it

#### Scenario: The migration file
- **WHEN** the migration tests read `packages/cloud/migrations`
- **THEN** `0005_unbranded_exports.sql` is the fifth numbered file, adds the three columns with their defaults and the check, holds no transaction control, pragma, data or drop, and is plain ASCII
