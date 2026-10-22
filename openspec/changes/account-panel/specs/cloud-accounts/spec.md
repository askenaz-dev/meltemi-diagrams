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

## ADDED Requirements

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
