# Spec Delta

## MODIFIED Requirements

### Requirement: Permissions
A permission SHALL be an entry of `PERMISSIONS` in `packages/cloud/src/permissions.ts` with an `id`
and how it reads, sets and lists its holders; the first SHALL be `unbranded-exports`, kept in the
`unbranded_exports`, `unbranded_exports_by` and `unbranded_exports_at` columns of `users`. Owners
and administrators SHALL hold every permission implicitly; their rows SHALL say only what was set.
`GET /api/admin/permissions/<id>` SHALL answer `200 { "id", "holders": [ { "sub", "handle",
"name", "email", "by", "at" } ] }` with the accounts whose row holds it, the earliest grant first;
`GET /api/admin/accounts/<account>/permissions/<id>` SHALL answer `200 { "sub", "handle", "name",
"email", "permission": { "id", "granted", "by", "at" } }` from the row; `PUT` on the same path with
`{ "granted": true | false }` SHALL set it, recording the caller and the time, and answer the same
shape. `by` SHALL be the granting person, or `{ "sub": "github-sponsors", "name": "GitHub
Sponsors" }` for a grant made by a sponsorship claim. An unknown `<id>` SHALL be `404 not-found`
and another body `400 request.invalid`. Owners and administrators SHALL use these routes alike.

#### Scenario: Grant by email
- **WHEN** an administrator sends `PUT /api/admin/accounts/ana%40example.com/permissions/unbranded-exports` with `{ "granted": true }`
- **THEN** the answer is `200` with `"permission": { "id": "unbranded-exports", "granted": true, "by": <the administrator>, "at": … }`, and Ana's next session answer says `"entitlements": { "unbranded": true }`

#### Scenario: The holders
- **WHEN** `u1` was granted, then `u2`, and `u3` was granted and revoked
- **THEN** `GET /api/admin/permissions/unbranded-exports` lists `u1` then `u2`, without `u3`

#### Scenario: An unknown permission or body
- **WHEN** an administrator sends `PUT …/permissions/quota` or `PUT …/permissions/unbranded-exports` with `{ "granted": "yes" }`
- **THEN** the answers are `404 not-found` and `400 request.invalid`, and nothing changes

#### Scenario: A holder by sponsorship
- **WHEN** `u4` was granted by a claim and `GET /api/admin/permissions/unbranded-exports` is asked
- **THEN** `u4`'s entry has `"by": { "sub": "github-sponsors", "name": "GitHub Sponsors" }`

### Requirement: The administration log
Every invitation, revoked invitation, acceptance, decline, removal, leave, grant, revoked
permission and takedown SHALL append a row to `admin_log (id, at, by_sub, action, target_sub,
target_email, detail)` in the same atomic step as the change itself; `action` SHALL be one of
`invite`, `revoke-invitation`, `accept`, `decline`, `remove`, `leave`, `grant`, `revoke` and
`takedown`, and `detail` the permission id (followed by the sponsor's login in parentheses for a
grant made by a sponsorship claim, whose `by_sub` is `github-sponsors`), or `<handle>/<slug>` and
the reason. Rows SHALL never be changed, SHALL stay when the people they name are deleted, and
SHALL be swept 365 days after `at`. A refused request SHALL append nothing.

#### Scenario: A grant is logged
- **WHEN** an administrator grants `unbranded-exports` to `u1`
- **THEN** `admin_log` gains one row with `action: "grant"`, `by_sub` the administrator, `target_sub: "u1"` and `detail: "unbranded-exports"`

#### Scenario: A refusal leaves no trace
- **WHEN** an invitation is refused with `409 admin.limit`
- **THEN** `admin_log` gains no row

#### Scenario: Swept after a year
- **WHEN** the sweep runs 366 days after a row's `at`
- **THEN** that row is gone and newer rows stay

#### Scenario: A claim is logged
- **WHEN** Ana's sign-in `ana` claims a sponsorship
- **THEN** `admin_log` gains one row with `action: "grant"`, `by_sub: "github-sponsors"`, `target_sub` Ana's and `detail: "unbranded-exports (ana)"`

### Requirement: The administration answer
`GET /api/admin` SHALL answer, to an owner or an administrator, `200 { "role", "owners",
"administrators", "invitations", "permissions", "log", "publishHost", "sponsorships" }` with `Cache-Control: no-store`: `owners`
and `administrators` as people (`{ "sub", "name", "handle", "email" }`, an owner with no row
showing its `sub` and empty strings), administrators with `invitedBy` and `since`; `invitations`
the pending, unexpired ones, the earliest first, for an owner and `[]` for an administrator;
`permissions` every catalog entry with its holders; `log` the latest fifty rows, the newest first,
each with `at`, `by`, `action`, `target` and `detail`, names resolved when answered (`by` reads
"GitHub Sponsors" for `github-sponsors`) and a deleted
account shown by its `sub` with `"deleted": true`; `publishHost` SHALL be the configured `PUBLISH_HOST` or `null`, for
the section's check of a takedown's address; `sponsorships` SHALL be the latest fifty sponsorships,
the newest first, each with `login`, `type`, `oneTime`, `amountCents`, `status`, `createdAt`,
`privacy` and `claimedBy` (a person, or `null`), and `[]` when `SPONSORS_ACCOUNT` is unset.

#### Scenario: What an administrator sees
- **WHEN** an administrator asks `GET /api/admin` while two invitations are pending
- **THEN** the answer has `"role": "administrator"` and `"invitations": []`, and lists the owners, the administrators, the holders and the log

#### Scenario: A deleted account in the log
- **WHEN** the log names `u1`, whose account was deleted
- **THEN** that entry shows `u1` with `"deleted": true` and no name

#### Scenario: The sponsorships listed
- **WHEN** two sponsorships exist, one claimed by Ana, and an owner asks `GET /api/admin`
- **THEN** `sponsorships` lists both, the newest first, Ana's with `claimedBy` naming her and the other with `claimedBy: null`
