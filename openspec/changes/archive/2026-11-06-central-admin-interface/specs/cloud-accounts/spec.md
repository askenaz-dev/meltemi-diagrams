## MODIFIED Requirements

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
time, from the routes or through the central administration console; `<account>` SHALL be an
account id, `@<handle>` or an email ("An account without a list of users"). A sponsorship claim
(`sponsorship-entitlement`, "The claim") SHALL set the same three columns with the grantor
`github-sponsors`. Each change SHALL be logged ("The administration log"). The routes SHALL
answer `404 not-found` to anyone else (an anonymous caller, a person with no role, an API token
even of an owner), and the `PUT` SHALL be subject to the `Origin` rule before it runs and SHALL
answer `400 request.invalid` to a body that is not `{ "granted": boolean }`. Deleting the account
(`user.deleted`) SHALL remove the flag with the row and clear the account's sponsorship claims.

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

#### Scenario: Granted by a sponsorship, revoked by hand
- **WHEN** Ana's claim granted the flag and an administrator sends `PUT …/accounts/@ana/permissions/unbranded-exports` with `{ "granted": false }`
- **THEN** the row's flag is `0` with the administrator's `sub` and time, and the log holds the revocation

#### Scenario: Deleted with the claim
- **WHEN** a `user.deleted` event arrives for a sponsor who claimed
- **THEN** the user row is gone and the sponsorship row is unclaimed

