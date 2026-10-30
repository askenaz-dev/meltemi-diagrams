# service-administration Specification

## Purpose
The administration of the hosted service: owners configured in `ADMIN_SUBS` and administrators they invite by email, who accept in the account panel; removal and leaving; one account found by id, handle or verified email with no list of users; the catalog of permissions granted to accounts; the log of every administration act; and the answer that serves the account panel's Administration section.
## Requirements
### Requirement: Owners and administrators
The service SHALL have two roles. The **owners** SHALL be the account ids listed in `ADMIN_SUBS`, a
comma separated list read by `readConfig` into `config.owners` (unset or empty: no owner); the
**administrators** SHALL be the rows of the table `administrators (sub, invited_by, since)` of
migration `0006_administrators.sql`. One gate, `administration(ctx)`, SHALL decide every
administration route: a cookie principal whose `sub` is an owner SHALL be `{ sub, role: "owner" }`,
else one with an `administrators` row `{ sub, role: "administrator" }`; an anonymous caller, any
other person and any API token, of an owner or an administrator included, SHALL get `404
not-found`, the answer of a route that does not exist. A `sub` that is both SHALL be an owner. Every
change made through these routes SHALL pass the `Origin` rule before it runs. The role SHALL be read
on every request, so that a removal takes effect at the next request.

#### Scenario: The owner by default
- **WHEN** `ADMIN_SUBS` is `bf8b255d-9228-4088-bbd1-6d9d42d41a94`, the `administrators` table is empty, and that account asks `GET /api/admin` with its session cookie
- **THEN** the answer is `200` with `"role": "owner"`

#### Scenario: An invited administrator
- **WHEN** `u2` has an `administrators` row and asks `GET /api/admin` with its cookie
- **THEN** the answer is `200` with `"role": "administrator"`

#### Scenario: Nobody else
- **WHEN** a signed-in person with no role, an anonymous caller, or the owner with `Authorization: Bearer mdg_…` asks `GET /api/admin`
- **THEN** each answer is `404 not-found`

#### Scenario: No owner configured
- **WHEN** `ADMIN_SUBS` is unset and the table is empty
- **THEN** every administration route answers `404 not-found` to everybody

### Requirement: Invitations to administer
An owner SHALL invite an email with `POST /api/admin/invitations { "email" }`. The email SHALL be
trimmed and lower-cased, at most 254 characters with a dotted domain and no control character
(the rules of project invitations), else `400 request.invalid`; an email that a current owner's or
administrator's row holds verified SHALL be `409 admin.already`; when a pending, unexpired
invitation for that email exists the route SHALL answer it with `200` and make no second one;
otherwise it SHALL record `admin_invitations (id, email, invited_by, created_at, expires_at,
accepted_at, declined_at, revoked_at)` with `expires_at` seven days after `created_at` and answer
`201 { "id", "email", "invitedBy", "createdAt", "expiresAt" }`; an eleventh pending invitation SHALL
be `409 admin.limit`. No mail SHALL be sent and no token or link SHALL exist. An administrator SHALL
get `404 not-found` from this route. `DELETE /api/admin/invitations/<id>` (an owner) SHALL revoke a
pending invitation (`204`; `404 not-found` for one that is not pending).

`POST /api/admin/invitations/<id>/accept` and `…/decline`, with a session cookie, SHALL act only
when the invitation is pending, unexpired and its email equals the session token's own email claim,
lower-cased, and that claim is verified; anything else SHALL be `404 not-found`. Accepting SHALL
insert the `administrators` row (`invited_by` the inviter, `since` now) and mark the invitation
accepted in one atomic step, and SHALL be `409 admin.limit` when twenty administrators exist;
declining SHALL mark it declined. Both SHALL answer `204`. An invitation SHALL work once.

#### Scenario: Invite and accept
- **WHEN** the owner sends `POST /api/admin/invitations { "email": "Ana@Example.com " }`, and Ana later signs in with the verified email `ana@example.com` and sends `POST /api/admin/invitations/<id>/accept`
- **THEN** the first answer is `201` with `"email": "ana@example.com"` and an `expiresAt` seven days later, the accept answers `204`, and Ana's next `GET /api/admin` answers `"role": "administrator"`

#### Scenario: Signing in alone makes nobody an administrator
- **WHEN** Ana has a pending invitation and only asks `GET /api/session`
- **THEN** she has no `administrators` row and `GET /api/admin` answers her `404 not-found`

#### Scenario: Another email
- **WHEN** a person whose verified email is `bob@example.com` sends the accept for Ana's invitation
- **THEN** the answer is `404 not-found` and nothing changes

#### Scenario: An unverified email
- **WHEN** a session whose email claim is `ana@example.com` but not verified sends the accept
- **THEN** the answer is `404 not-found`

#### Scenario: Expired, used or declined
- **WHEN** the invitation is eight days old, already accepted, declined or revoked, and its addressee sends the accept
- **THEN** the answer is `404 not-found`

#### Scenario: Invited twice
- **WHEN** the owner invites `ana@example.com` while an invitation for it is pending
- **THEN** the answer is `200` with the same `id`, and one invitation is pending

#### Scenario: A bad email
- **WHEN** the owner invites `ana`, `ana@localhost`, an address of 300 characters, or sends `{}`
- **THEN** each answer is `400 request.invalid` and nothing is recorded

#### Scenario: Already an administrator
- **WHEN** the owner invites the verified email of an administrator, or the owner's own
- **THEN** the answer is `409 admin.already`

#### Scenario: Administrators do not invite
- **WHEN** an administrator sends `POST /api/admin/invitations`
- **THEN** the answer is `404 not-found` and nothing is recorded

#### Scenario: The limits
- **WHEN** ten invitations are pending and the owner invites an eleventh email, or twenty administrators exist and an invitee accepts
- **THEN** the answer is `409 admin.limit` and nothing changes

#### Scenario: Revoked
- **WHEN** the owner sends `DELETE /api/admin/invitations/<id>` for a pending invitation, and then its addressee sends the accept
- **THEN** the first answer is `204` and the accept answers `404 not-found`

### Requirement: Removing and leaving
`DELETE /api/admin/administrators/<sub>` SHALL remove that `administrators` row and answer `204`
when the caller is an owner, or when the caller is the administrator named by `<sub>` (leaving);
an owner's `sub`, a `sub` with no row, and an administrator naming another administrator SHALL be
`404 not-found` and remove nothing. An owner SHALL only stop being one by a change of `ADMIN_SUBS`.

#### Scenario: The owner removes an administrator
- **WHEN** the owner sends `DELETE /api/admin/administrators/u2`
- **THEN** the answer is `204` and `u2`'s next `GET /api/admin` is `404 not-found`

#### Scenario: An administrator leaves
- **WHEN** `u2` sends `DELETE /api/admin/administrators/u2`
- **THEN** the answer is `204` and `u2` is no longer an administrator

#### Scenario: Not theirs to remove
- **WHEN** administrator `u2` sends `DELETE /api/admin/administrators/u3`, or anyone sends it for the owner's `sub`
- **THEN** the answer is `404 not-found` and both rows stay

### Requirement: An account without a list of users
No route SHALL list, search or count the accounts of the service. Wherever an administration route
names an account (`<account>`), it SHALL take an account id (one to two hundred characters without
control characters), `@` followed by a handle (`[a-z0-9-]{3,30}`), or an email, recognised by an
`@` after its first character and lower-cased, matched against the `users` rows whose `email` equals
it with `email_verified = 1` (`store.usersByEmail`). No row SHALL be `404 not-found`; two or more
rows for one email SHALL be `409 account.ambiguous`; nothing SHALL be created by a lookup.

#### Scenario: By email
- **WHEN** exactly one row holds the verified email `ana@example.com` and an administrator names `ana@example.com`
- **THEN** that row is the account

#### Scenario: Unknown or ambiguous
- **WHEN** an administrator names `nobody@example.com`, which no row holds, or `shared@example.com`, which two rows hold verified
- **THEN** the answers are `404 not-found` and `409 account.ambiguous`, and no row is created

#### Scenario: An unverified email
- **WHEN** the only row holding `ana@example.com` has `email_verified = 0`
- **THEN** naming `ana@example.com` answers `404 not-found`

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
shape. An unknown `<id>` SHALL be `404 not-found` and another body `400 request.invalid`. Owners
and administrators SHALL use these routes alike.

#### Scenario: Grant by email
- **WHEN** an administrator sends `PUT /api/admin/accounts/ana%40example.com/permissions/unbranded-exports` with `{ "granted": true }`
- **THEN** the answer is `200` with `"permission": { "id": "unbranded-exports", "granted": true, "by": <the administrator>, "at": … }`, and Ana's next session answer says `"entitlements": { "unbranded": true }`

#### Scenario: The holders
- **WHEN** `u1` was granted, then `u2`, and `u3` was granted and revoked
- **THEN** `GET /api/admin/permissions/unbranded-exports` lists `u1` then `u2`, without `u3`

#### Scenario: An unknown permission or body
- **WHEN** an administrator sends `PUT …/permissions/quota` or `PUT …/permissions/unbranded-exports` with `{ "granted": "yes" }`
- **THEN** the answers are `404 not-found` and `400 request.invalid`, and nothing changes

### Requirement: The administration log
Every invitation, revoked invitation, acceptance, decline, removal, leave, grant, revoked
permission and takedown SHALL append a row to `admin_log (id, at, by_sub, action, target_sub,
target_email, detail)` in the same atomic step as the change itself; `action` SHALL be one of
`invite`, `revoke-invitation`, `accept`, `decline`, `remove`, `leave`, `grant`, `revoke` and
`takedown`, and `detail` the permission id, or `<handle>/<slug>` and the reason. Rows SHALL never be
changed, SHALL stay when the people they name are deleted, and SHALL be swept 365 days after `at`.
A refused request SHALL append nothing.

#### Scenario: A grant is logged
- **WHEN** an administrator grants `unbranded-exports` to `u1`
- **THEN** `admin_log` gains one row with `action: "grant"`, `by_sub` the administrator, `target_sub: "u1"` and `detail: "unbranded-exports"`

#### Scenario: A refusal leaves no trace
- **WHEN** an invitation is refused with `409 admin.limit`
- **THEN** `admin_log` gains no row

#### Scenario: Swept after a year
- **WHEN** the sweep runs 366 days after a row's `at`
- **THEN** that row is gone and newer rows stay

### Requirement: The administration answer
`GET /api/admin` SHALL answer, to an owner or an administrator, `200 { "role", "owners",
"administrators", "invitations", "permissions", "log", "publishHost" }` with `Cache-Control: no-store`: `owners`
and `administrators` as people (`{ "sub", "name", "handle", "email" }`, an owner with no row
showing its `sub` and empty strings), administrators with `invitedBy` and `since`; `invitations`
the pending, unexpired ones, the earliest first, for an owner and `[]` for an administrator;
`permissions` every catalog entry with its holders; `log` the latest fifty rows, the newest first,
each with `at`, `by`, `action`, `target` and `detail`, names resolved when answered and a deleted
account shown by its `sub` with `"deleted": true`; `publishHost` SHALL be the configured `PUBLISH_HOST` or `null`, for
the section's check of a takedown's address.

#### Scenario: What an administrator sees
- **WHEN** an administrator asks `GET /api/admin` while two invitations are pending
- **THEN** the answer has `"role": "administrator"` and `"invitations": []`, and lists the owners, the administrators, the holders and the log

#### Scenario: A deleted account in the log
- **WHEN** the log names `u1`, whose account was deleted
- **THEN** that entry shows `u1` with `"deleted": true` and no name

