## ADDED Requirements

### Requirement: The account in the page
At start the page SHALL ask `GET /api/session` once; any answer other than a `200` JSON SHALL
mean anonymous, silently, and so SHALL an answer with `user` null and no `signIn`. Anonymous,
the header SHALL show "Sign in", a link to the identity service's `/login` with the page's
address as `return_to`: the answer's `signIn` when present, else one the page builds from the
identity origin it was built with (`PLAYGROUND_IDENTITY`). Signed in, it SHALL show the avatar
and name with a menu: "Account" (the identity service's account page), "API tokens" (a dialog
that lists, creates and revokes), and "Sign out" (a form posting to the identity service's
`/logout` with `return_to` the page). The policy SHALL allow that form (`form-action 'self'`
plus the identity origin the page was built with) and the providers' avatar hosts in
`img-src`; `connect-src` SHALL stay `'self'`. The page SHALL use the answer's `signIn`,
`account` and `signOut` only when they are `http:` or `https:` addresses without credentials,
and SHALL draw a picture only from an `https:` address or its own origin. On a static server the
page SHALL behave exactly as before.

#### Scenario: Served by a static server
- **WHEN** the page is served by the playground suite's static server
- **THEN** `/api/session` answers the static `{ "user": null }` the build wrote, the header shows "Sign in" linking to the identity service the page was built with, no console error is logged, and everything else is as before

#### Scenario: Signed in
- **WHEN** the browser carries a session minted for `Ana`
- **THEN** the header shows `Ana` with her avatar from the host her token's `picture` names and the menu's three entries

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
shapes: `{ "user": { "sub", "name", "picture", "handle" }, "account", "signOut" }` for a cookie
principal, `{ "user": { "sub", "name", "picture", "handle" }, "token": { "id", "name" } }` for
a bearer principal (no `account`, no `signOut`), and `{ "user": null, "signIn" }` for anyone
else; `handle` SHALL be `null` in this change.

#### Scenario: A renamed person
- **WHEN** a request arrives with a token whose `name` differs from the cached one
- **THEN** the user row takes the new name and `GET /api/session` returns it

#### Scenario: A bearer token asks
- **WHEN** `GET /api/session` carries `Authorization: Bearer mdg_…` of a valid token
- **THEN** the answer holds `user` and `token: { id, name }` and has neither `account` nor `signOut`

#### Scenario: Not JSON for a browser error
- **WHEN** `GET /api/session` is requested with a cookie whose signature is invalid
- **THEN** the answer is `200` with `"user": null` and no error is shown in the page

### Requirement: Deletion events
`POST /_identity/events` SHALL read at most 8 KiB (`400 request.invalid` beyond that), verify
`Meltemi-Signature` with the identity service's events secret for the product `diagrams` (its
`EVENTS_SECRET_DIAGRAMS`, held here as `IDENTITY_EVENTS_SECRET`; `401 signature.invalid`
otherwise), be idempotent by event id, delete everything held for the `sub` of a `user.deleted`
event (the user, its tokens, its approval codes, and whatever the other changes add), and
answer `200 { "status": "applied" | "duplicate" | "ignored" }`; unknown event types SHALL
answer `200` and change nothing. The verifier trusts a live session for an hour, so a session
cookie issued before a deletion handled for its `sub` SHALL count as anonymous and make no user
row, while one issued in a later second SHALL be accepted; the record SHALL be kept 31 days.

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
