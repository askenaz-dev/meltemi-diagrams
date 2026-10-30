# 0068. Owners invite administrators, and administrators grant permissions from the account panel

Status: accepted (administrators-and-permissions change, 29 October 2026). Extends decisions 0042
and 0061.

## Context

The owner asked on 29 October 2026 for an administration module in the account panel: a place to
configure the other administrators and the permissions of accounts, without a page that lists every
user, with administrators added by invitation and one administrator by default, the owner's own
account. The service had administrators but no module. They were the account ids of the
`ADMIN_SUBS` secret, so adding or removing one meant editing a secret and deploying, and their two
powers, the takedown of a publication (decision 0042) and the entitlement to export without the
Meltemi branding (decision 0061), were routes the page never linked, typed as `fetch` calls into the
browser's console. A person who received a permission handed their account id over by some other
means, and the session answer said what a person may do but not whether they administer the
service, so the page could offer nothing to an administrator. The project invitations already had
the shape the owner asked for: an email, no mail sent, resolved when a person signs in with that
email verified.

## Decision

- **Two roles.** The **owners** are the account ids of `ADMIN_SUBS`, read on every request:
  always administrators, never removed from the page, and the only ones who invite and remove
  administrators. The owner is the administrator by default because the secret already lists the
  owner's account: nothing is seeded. The **administrators** are the rows of a new table
  `administrators (sub, invited_by, since)` (migration 0006). One gate decides every route: a cookie
  on the page's own origin of an owner or an administrator; anybody else, an owner's API token
  included, gets `404 not-found`, and the role is read on every request.
- **Invitations by email, accepted by the invitee.** An owner invites an email; the invitation
  records who invited and when, lasts seven days, works once, sends no mail and has no token. It
  makes an administrator only of the person who signs in with that email verified and chooses
  **Accept** (or **Decline**); signing in alone makes nobody an administrator. At most ten pending
  invitations and twenty administrators. An owner revokes a pending invitation and removes an
  administrator; an administrator leaves.
- **No list of users.** The section lists the owners, the administrators, the pending invitations
  and the holders of each permission, and nothing else. Any other account is reached by exact
  lookup: an account id, `@<handle>`, or an email exactly one account signed in with verified
  (`409 account.ambiguous` for several). No route lists, searches or counts accounts.
- **Permissions as a catalog.** A permission is an entry of a catalog in code over its own columns
  of `users`; the first is `unbranded-exports`, over the columns of migration 0005. Owners and
  administrators hold every permission implicitly. The routes go by permission id
  (`GET /api/admin/permissions/<id>`, `GET` and `PUT /api/admin/accounts/<account>/permissions/<id>`
  with `{ "granted": boolean }`) and replace the three `…/entitlements` routes.
- **A log.** Every invitation, acceptance, decline, revocation, removal, leave, grant, revoked
  permission and takedown is appended to `admin_log` in the same atomic step as the act, and only
  when it happened; the section shows the latest fifty, and the sweep drops entries after 365 days.
- **The session and the page.** The cookie shape of `GET /api/session` gains
  `user.administration` (the role, or `null`) and `user.administrationInvitation` (the pending
  invitation for the session's verified email, or `null`). The account panel gains an
  **Administration** tab between Usage and the Danger zone, shown only to owners, administrators and
  a person with a pending invitation, who sees only the invitation; it loads `GET /api/admin` and
  holds **Administrators**, **Invitations** (owners only), **Permissions**, **Take down a
  publication** and **Recent changes**.

## Alternatives considered

- **Everything in the store, the owner seeded by a migration**: a personal account id in a migration
  of a public repository, and a value per environment that a migration cannot vary.
- **Owners by verified email** (`OWNER_EMAILS`): the email of an identity can change and be verified
  again, the account id cannot, and a list of emails would also bless a second account that
  verifies the same address.
- **One role only**: every administrator able to remove every other, the owner included, with
  nothing left to restore it from but the secret.
- **Renaming the secret `OWNER_SUBS`**: a secret, a binding and a pipeline step changed for one
  word; its meaning still holds.
- **Invitations accepted at sign-in**, as project invitations are: whoever signs in with the address
  would become an administrator, with the power to take down any publication, without choosing it.
- **A link with a token**, as project invitations have: the link alone would be the proof, and a
  forwarded link would make an administrator of a stranger.
- **Promoting an account by id with no consent**: the owner thinks in emails, and the person is never
  asked.
- **A searchable directory of accounts**: the list the owner rejected, and a way to enumerate who
  uses the service.
- **Permissions granted to an email before its first sign-in**: a second pending mechanism for a
  case Profile's account id already covers.
- **A generic `grants` table, or roles that bundle permissions**: one table, or one name, for one
  flag, and the existing flag's rows would have to move.
- **Keeping the `…/entitlements` routes beside the new ones**: two ways to set one flag.
- **No log, only the `by` and `at` of each row**: a revoked invitation or a removed administrator
  would leave no trace. **Logging to Workers Logs**: invisible to the administrators, and gone after
  the plan's retention.
- **A separate page at `/admin`**: a second surface to style, route and test, where the owner asked
  for the account panel. **The tab for everybody**: a section that says "nothing here" to every
  person.

## Consequences

- New public surface of the Worker: `GET /api/admin`, the invitation, acceptance, decline, removal
  and permission routes, the session answer's `user.administration` and
  `user.administrationInvitation`, the error codes `admin.already`, `admin.limit` and
  `account.ambiguous`, and the store's administrators, invitations, log and `usersByEmail`. The
  three `…/entitlements` routes are gone.
- The deploy applies migration 0006: three tables (`administrators`, `admin_invitations`,
  `admin_log`) and three indexes, with no data.
- `ADMIN_SUBS` keeps its name and now lists the owners; an empty secret leaves the invited
  administrators able to grant and take down, but nobody to invite or remove them.
- Deleting an account removes its administrator row and the invitations it made that nobody
  answered; the log keeps the entries that name it, and the emails of invitations, for a year.
- The page gains the Administration tab and its menu entries; every other signed-in person sees the
  panel as before.
