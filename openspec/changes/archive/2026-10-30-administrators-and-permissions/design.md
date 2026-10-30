## Context

**Administrators today.** `readConfig` turns the `ADMIN_SUBS` secret (a Secrets Store binding,
`packages/cloud/wrangler.jsonc:48-50`; `src/env.ts:63`, `85`) into `config.admins: ReadonlySet<string>`
(`src/config.ts:72-79`, `92`): a comma separated list of account ids, unset or empty meaning nobody.
Three readers use it. `takedownRoute` (`src/routes/admin.ts:51-75`) and the `administrator(ctx)` gate
of the three entitlement routes (`admin.ts:78-82`, `132-173`) accept a cookie principal whose `sub` is
listed and answer `404 not-found` to everybody else, API tokens of a listed person included; the
`Origin` rule runs first for every change made with the cookie. `userShape` (`src/routes/session.ts:36-50`)
entitles a listed `sub` to export without the branding. Nothing else in the Worker or the page knows
about administrators: the session answer carries no role, and the page has no administration UI. The
owner's account (`guillmarortiz@gmail.com`, account id `bf8b255d-…`) is the one listed today, which is
why its Profile says it may export without the branding.

**Accounts and lookup.** `users` holds `sub`, `name`, `picture`, `email`, `email_verified`, `created_at`,
`handle` and the three `unbranded_exports*` columns (`migrations/0001_accounts.sql:13-20`,
`0003_sharing.sql`, `0005_unbranded_exports.sql`); `email` and `email_verified` are cached from the
session token and refreshed when the claims differ. The store finds a person by `sub` (`user`), by
handle (`userByHandle`) and lists the entitled rows (`entitledUsers`, `src/store/types.ts:256`,
and the `unbranded-exports` additions); `accountOf(ctx)` resolves `<account>` as a `sub` or `@<handle>`
(`admin.ts:96-110`).

**Invitations today.** Project invitations (`sharing-and-permissions`; `docs/cloud.md`, "Invitations")
record a lower-cased email (at most 254 characters, a dotted domain, `readEmail` in
`src/routes/sharing.ts:71-90`), a role and a token, send no mail, expire after thirty days, work once,
and become a membership either by link or, at `GET /api/session`, for a cookie whose email the
identity service verified (`routes/session.ts:62-72`, `acceptInvitationsFor`). The token is the proof
for the link; the verified email for the session.

**The account panel.** `ACCOUNT_SECTIONS` (`packages/playground/src/cloud/account-panel-model.ts:15-22`)
lists Profile, Sign-ins, Devices, API tokens, Usage and the Danger zone; `account-panel.ts` draws the
tabs and one panel per section, `?account=<section>` opens one, and the words live in
`src/messages/account-panel-en.ts` and `-es.ts`. The page's `SessionUser`
(`src/cloud/session.ts`) reads `sub`, `name`, `picture`, `handle` and `entitlements.unbranded`.

**Deletion.** `POST /_identity/events` applies `user.deleted` once per event id
(`src/routes/events.ts:66`, `store.applyUserDeleted`), removing everything held for the `sub`.

## Goals / Non-Goals

**Goals:**

- The owner adds and removes administrators from the page, by email, and an administrator becomes
  one only by choosing to.
- One administrator by default, the owner, with no data written and nothing to set up beyond the
  secret that already holds the owner's account.
- Administrators grant and revoke permissions and take publications down from the page, never from
  the browser's console.
- No page, route or answer lists or searches the accounts of the service; only accounts already
  holding a role or a permission are listed.
- Every administration act is recorded with who did it and when, and visible to the administrators.

**Non-Goals:**

- Mail delivery, roles in the identity contract, the production rollout (the proposal's Non-goals).
- Quotas, plans or billing as permissions: the catalog starts with the one permission that exists.
- Moderating projects or accounts (suspending a person, reading their projects): the takedown of a
  publication stays the one moderation act.

## Decisions

### Owners come from configuration, administrators from the store

`config.admins` becomes `config.owners` (same parsing of `ADMIN_SUBS`); a new table `administrators
(sub PRIMARY KEY, invited_by, since)` holds the invited ones. The gate is one function,
`administration(ctx): { sub, role: "owner" | "administrator" }`, in `src/routes/admin.ts`: a cookie
principal whose `sub` is an owner, else one with an `administrators` row; anything else throws
`not-found`. The session answer reads the same function's logic without throwing. An owner who also
has a row is an owner. The owner is the administrator by default because the secret already lists
the owner's account id: nothing is seeded, and an empty secret means a service with no administrator
at all, as today.

Alternatives: (a) everything in the store, the owner seeded by a migration that inserts the owner's
account id (a personal id in a migration file of a public repository, and a value per environment
that a migration cannot vary); (b) owners by verified email, a secret `OWNER_EMAILS` matched against
the session's email claim (the email of an identity can change and be verified again, the account id
cannot; an email list would also bless a second account that verifies the same address); (c) one
role only, every administrator able to invite and remove every other (an invited administrator could
remove the owner, and nothing would be left to restore it from but the secret). Recommendation: owners
by account id in the existing secret, administrators in D1.

The secret keeps its name `ADMIN_SUBS`: it is declared in the Secrets Store and in the `delivery`
change's pipelines, and its meaning ("the accounts that administer the service") still holds; the
docs call its accounts the owners. Alternative: rename it `OWNER_SUBS` (a secret, a binding and a
pipeline step changed for one word). Recommendation: keep the name; an open question.

### Invitation by email, accepted by the invitee

`admin_invitations (id, email, invited_by, created_at, expires_at, accepted_at, declined_at,
revoked_at)`; `POST /api/admin/invitations { "email" }` (an owner) validates the email with the
sharing route's rules (`readEmail` moves to `src/email.ts` and both routes use it), refuses an
owner's or an administrator's own verified email as `409 admin.already` (nothing to invite), answers
the pending invitation already addressed to that email with `200` instead of making a second one, and
otherwise `201` with the invitation; it expires seven days after it was made. There is no token and no
link: the invitee is whoever signs in with that verified email. `GET /api/session` finds the pending,
unexpired invitation addressed to the session token's verified email claim (never the cached row's,
never an unverified one) and answers it as `user.administrationInvitation: { "id", "invitedBy":
{ "name" }, "expiresAt" }`. `POST /api/admin/invitations/<id>/accept` and `…/decline`, with the cookie,
succeed only when the invitation is pending, unexpired and addressed to the session's verified email;
accept inserts the `administrators` row and marks the invitation in one atomic step, refusing with
`409 admin.limit` when twenty administrators exist; anything else is `404 not-found`, so an invitation
is never confirmed to anybody but its addressee. `DELETE /api/admin/invitations/<id>` (an owner)
revokes a pending one.

Alternatives: (a) accepted automatically at sign-in, as project invitations are (whoever signs in
with the address becomes an administrator without choosing to, with the power to take down any
publication; a role with that weight is accepted, not received); (b) a link with a token, as project
invitations have (the link alone is the proof there, whatever email opens it; a forwarded link would
make an administrator of a stranger); (c) promoting an existing account by id or handle with no
consent (the owner thinks in emails, and the person is never asked). Recommendation: the email,
matched to the verified claim, and an explicit Accept.

### No list of users: exact lookup only

The section lists the owners, the administrators, the pending invitations, the holders of each
permission and the log; nothing lists or counts the other accounts. An account outside those lists is
reached by exact lookup only, wherever an account is named (`<account>` of the permission routes, the
section's **Grant to** field): an account id, `@<handle>`, or an email that exactly one row of `users`
holds with `email_verified = 1` (`store.usersByEmail(email)`, compared in lower case). No match is
`404 not-found` ("No account signed in with this email yet: ask the person to sign in once"); two or
more is `409 account.ambiguous` ("Several accounts signed in with this email: ask for the account
id, which Profile shows"). The lookup tells an administrator whether an email has an account; it is
behind the administrators' gate, which already reads accounts by id.

Alternatives: (a) a searchable directory of accounts by name or email prefix (the list the owner
rejected, and a way to enumerate who uses the service); (b) permissions granted to an email before the
person ever signs in, resolved at sign-in as project invitations are (a second pending mechanism and
table for a case Profile's "an administrator may ask you for it" already covers); (c) account ids
only, as the console routes take today (the owner has to obtain an id for every grant).
Recommendation: id, handle or a verified email, exact; (b) is an open question.

### Permissions are a catalog in code over their own columns

`packages/cloud/src/permissions.ts` exports `PERMISSIONS`, a list of `{ id, holds(user), set(store,
sub, granted, by, at), holders(store) }`; the first and only entry is `unbranded-exports` over the
`unbranded_exports`, `unbranded_exports_by` and `unbranded_exports_at` columns and the store's
`setUnbrandedExports` and `entitledUsers`. The page has the same ids with their names and descriptions
in `account-panel-en.ts` and `-es.ts` (a test checks both lists hold the same ids). The routes become
`GET /api/admin/permissions/<id>` (the holders), `GET` and `PUT /api/admin/accounts/<account>/permissions/<id>`
(`{ "granted": boolean }`), replacing the three `…/entitlements` routes; an unknown `<id>` is
`404 not-found`. Owners and administrators hold every permission implicitly, as the session answer
says today; their rows say only what was set on them. `GET /api/session` keeps
`user.entitlements.unbranded`, which the export dialog reads.

Alternatives: (a) a generic `grants (sub, permission, by, at)` table (one table for one permission,
and the existing flag's rows would have to move); (b) roles that bundle permissions ("partner") (a
name for one flag until a second permission exists); (c) keeping the three `…/entitlements` routes
beside the new ones (two ways to set one flag). Recommendation: the catalog over columns, the routes
by permission id.

### What each role may do

| Act                                            | Owner | Administrator |
| ---------------------------------------------- | ----- | ------------- |
| See the section, the lists and the log         | yes   | yes           |
| Grant and revoke a permission                  | yes   | yes           |
| Take down a publication                        | yes   | yes           |
| Invite an email, revoke a pending invitation   | yes   | no            |
| Remove an administrator                        | yes   | no            |
| Leave (remove their own row)                   | no    | yes           |

`DELETE /api/admin/administrators/<sub>` is an owner's for any administrator and an administrator's
for their own `sub` only; an owner's `sub` is `404 not-found` there (owners leave by editing the
secret). The page shows each act only to the role that may do it, and the routes check it again.

Alternative: administrators invite too (more hands, and an invitation chain the owner did not
approve). Recommendation: owners only; an open question.

### The log

`admin_log (id, at, by_sub, action, target_sub, target_email, detail)`, append-only: `invite`,
`revoke-invitation`, `accept`, `decline`, `remove`, `leave`, `grant`, `revoke`, `takedown`, with the
permission id or `<handle>/<slug>` and the reason in `detail`. Each route appends in the same atomic
step as its change (`store.batch` in D1, one critical section in memory). `GET /api/admin` returns the
latest fifty, the newest first, names resolved at read time; a deleted account shows its id and
"deleted account". `store.sweep` drops entries older than 365 days. `takedowns` keeps its own rows,
which the publish dialog reads.

Alternatives: (a) no log, the `by`/`at` of each row (a revoked invitation or a removed administrator
leaves no trace); (b) logging to Workers Logs only (not visible to the administrators, and gone after
the plan's retention). Recommendation: the table.

### The section and the session answer

`GET /api/session`, cookie shape only, gains `user.administration: { "role" } | null` and
`user.administrationInvitation: { "id", "invitedBy": { "name" }, "expiresAt" } | null`; the bearer
shape gains neither (a program does not administer). `SessionUser` reads them strictly (anything else
is `null`). `ACCOUNT_SECTIONS` gains `administration` between `usage` and `danger`; the panel builds
the tab only when `administration` or `administrationInvitation` is set; `?account=administration`
for anyone else opens Profile, as an unknown section does. The avatar's menu lists **Administration**
for owners and administrators and **Invitation to administer** for an invitee, both opening the
section. The section's model (`account-panel-model.ts`) loads `GET /api/admin` when the section is
shown and after every change; the drawing lives in a new `src/cloud/administration-section.ts`.

`GET /api/admin` answers `{ "role", "owners": [person], "administrators": [person + "invitedBy",
"since"], "invitations": [ { "id", "email", "invitedBy", "createdAt", "expiresAt" } ] (owners only;
`[]` for an administrator), "permissions": [ { "id", "holders": [person + "by", "at"] } ], "log":
[…] }`, where a person is `{ "sub", "name", "handle", "email" }`. Administrators see each other's
emails: they administer together, and the emails are the ones they signed in with.

The invitee sees one block: who invited them, what administrators can do (grant permissions, take
down any publication), when the invitation expires, **Accept** and **Decline**. Accepting reloads the
session answer and shows the full section; declining removes the tab.

Alternatives: (a) a separate admin page at `/admin` (a second surface to style, route and test, where
the owner asked for the account panel); (b) the section for everybody, empty for most (a tab that
says "nothing here" to every person). Recommendation: the conditional tab.

### Takedown from the section

**Take down a publication** takes the publication's address (`https://<PUBLISH_HOST>/<handle>/<slug>`
or `<handle>/<slug>`) and a reason, asks for confirmation naming the address, and calls the existing
`DELETE /api/admin/publications/<handle>/<slug>`, now gated by `administration(ctx)` and logged. An
address of another host or shape is refused in the page before any request.

### Deletion

`applyUserDeleted` also removes the person's `administrators` row and the pending invitations they
made, in the same atomic step; invitations addressed to their email stay until they expire, since an
email is not an account. Log rows stay, as takedowns do: they are the service's record.

### Interfaces touched

- `@meltemi/diagrams-cloud` (private): `Config.owners`; `Store` gains `administrators()`,
  `administrator(sub)`, `removeAdministrator(sub)`, `createAdminInvitation(invitation)`,
  `adminInvitations(now)`, `adminInvitationFor(email, now)`, `acceptAdminInvitation(id, sub, email,
  now, limit)`, `declineAdminInvitation(id, email, now)`, `revokeAdminInvitation(id, now)`,
  `appendAdminLog(entry)`, `adminLog(limit)`, `usersByEmail(email)`, in the D1 and the in-memory
  stores; `src/permissions.ts`; `src/email.ts`; the routes above in `src/handler.ts`.
- `packages/playground`: `SessionUser.administration`, `SessionUser.administrationInvitation`;
  `AccountSection` gains `"administration"`; `administrationSection(...)`; the words
  `accountPanel.administration.*` in both languages.

## Risks / Trade-offs

- [The owner removes the secret's value by mistake and nobody administers] → the invited
  administrators keep their rows but cannot invite; the docs say how to set the secret again, and the
  `delivery` pipeline declares it.
- [An administrator takes down publications they should not] → every takedown is logged with its
  reason, the owner removes the administrator, and the publication's owner publishes again.
- [The email lookup reveals whether an address has an account] → only to administrators, who can
  already read any account by id; nothing is answered to anybody else.
- [An invitation sits pending for an email that later belongs to someone else] → seven days of
  validity, the owner sees and revokes pending invitations, and accepting needs the verified claim.
- [The log keeps invited emails for a year] → only the invitations' emails, swept after 365 days,
  and documented in `docs/security.md` with the other records the service keeps.
- [A removed administrator's open page still shows the section] → every route checks the role on
  each request; the next action answers `404`, and the page reloads the session and drops the tab.

## Open Questions

- Should administrators also invite administrators? Default: no, owners only.
- Should the secret be renamed `OWNER_SUBS`? Default: no, `ADMIN_SUBS` keeps its name.
- Should a permission be grantable to an email before the person's first sign-in, resolved at sign-in
  as project invitations are? Default: no; the person signs in once and the email lookup finds them.
- Should invitations last longer than seven days? Default: seven.
