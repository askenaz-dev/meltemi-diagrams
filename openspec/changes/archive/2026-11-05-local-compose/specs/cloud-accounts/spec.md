# Spec Delta

## MODIFIED Requirements

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


For the supported local installation, the page SHALL immediately show a local workspace
and its default project instead of account/session controls. It SHALL show the agent-plugin
setup action and SHALL NOT show sign-in, account creation, API tokens, disconnect/sign-out,
provider, sponsorship or unsupported sharing/publishing controls. It SHALL make no external
identity request, and the local interface SHALL exist in English and Spanish.

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

#### Scenario: Open the local editor
- **WHEN** the person opens the ready local editor for the first time in either language
- **THEN** they can edit the default project immediately and copy the plugin/MCP installation prompt without a session or token step

### Requirement: Users and the session answer
The Worker SHALL keep a user per `sub` from the first authenticated request, caching `name`,
`picture`, `email` and `email_verified` from the token and refreshing them when a request's
claims differ. `GET /api/session` SHALL answer, with `Cache-Control: no-store`, one of three
shapes: `{ "user": { "sub", "name", "picture", "handle", "entitlements": { "unbranded",
"unbrandedBy" }, "administration", "administrationInvitation" }, "account", "signOut" }` for a
cookie principal, `{ "user": { "sub", "name", "picture", "handle", "entitlements":
{ "unbranded", "unbrandedBy" } }, "token": { "id", "name" } }` for a bearer principal (no
`account`, no `signOut`, no administration), and `{ "user": null, "signIn" }` for anyone else;
every shape SHALL add `"support": { "url" }` (the sponsors page) when `SPONSORS_ACCOUNT` is set
and omit it otherwise; `handle` SHALL be the person's publishing handle or `null`, and
`user.entitlements.unbranded` SHALL be `true` when the person's row has the `unbranded_exports`
flag or the person is an owner or an administrator (`service-administration`, "Owners and
administrators"), and `false` otherwise ("Entitlements of an account"), with `unbrandedBy`
`"github-sponsors"` when the row was granted by a sponsorship, `"administrator"` when set by a
person, and `null` otherwise. In the cookie shape, `user.administration` SHALL be `{ "role":
"owner" | "administrator" }` or `null`, and `user.administrationInvitation` SHALL be `{ "id",
"invitedBy": { "name" }, "expiresAt" }` for the pending, unexpired administrator invitation
addressed to the session token's own email claim when that claim is verified, and `null`
otherwise (never for an owner or an administrator). The `user` object SHALL have the same fields
in both signed-in answers but the two administration fields; for a bearer principal
`entitlements` is informational, since no program reads it.


The local entry point SHALL answer `GET /api/session` with `mode: "local-single-user"`
and its stable local owner in `user`, without credentials or an authentication exchange.
This describes local workspace capabilities, not a browser session. It SHALL issue no cookie
and omit `token`, `localSession`, expiry and provider navigation fields (`signIn`, `account`,
`signOut`, `support`). Local identity SHALL NOT imply hosted-service administrator rights.

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

#### Scenario: The support link and the grantor
- **WHEN** `SPONSORS_ACCOUNT` is `askenaz` and `GET /api/session` is asked anonymously, with the
  cookie of a sponsor who claimed, and with the cookie of a person an administrator granted
- **THEN** every answer carries `"support": { "url": "https://github.com/sponsors/askenaz" }`,
  the second's `entitlements` is `{ "unbranded": true, "unbrandedBy": "github-sponsors" }` and
  the third's `{ "unbranded": true, "unbrandedBy": "administrator" }`

#### Scenario: Not configured
- **WHEN** `SPONSORS_ACCOUNT` is unset
- **THEN** no answer carries `support` and a plain person's `unbrandedBy` is `null`

#### Scenario: Local workspace description without a session
- **WHEN** the local editor requests `/api/session` without cookies or Authorization
- **THEN** it receives the local owner/mode, creates no session record, sets no cookie and is recognized by the frontend as an editable local workspace

## ADDED Requirements

### Requirement: No local credential management
Local mode SHALL require no sign-in or credential creation for browser, rooms or MCP. Identity, API-token management, CLI-login approval and OAuth routes SHALL be unavailable locally and SHALL never issue credentials or contact an IDP. Existing hosted credential management SHALL remain unchanged.

#### Scenario: A local identity or token action
- **WHEN** a caller requests local sign-in, token creation, OAuth consent/registration/exchange or CLI-login approval
- **THEN** the route is unavailable, no credential/grant is created and no external identity request is made
