# sponsorship-entitlement Specification

## Purpose
Receiving GitHub Sponsors' deliveries for the sponsored account, keeping the sponsorships, and granting the permission to export without the Meltemi branding to the account that linked the sponsor's GitHub sign-in.

## Requirements

### Requirement: Sponsorship deliveries
When `SPONSORS_ACCOUNT` is a GitHub login, `POST /_sponsors/github` SHALL verify
`X-Hub-Signature-256` (`sha256=` and the HMAC-SHA-256 hex of the exact bytes of the body with
`SPONSORS_WEBHOOK_SECRET`, compared in constant time) before parsing the body, refuse a missing or
wrong signature with `401`, and handle each `X-GitHub-Delivery` id once. Without the variable, or
with one that is not a login, the path SHALL answer `404`; `wrangler.jsonc` SHALL ship it empty.

#### Scenario: A signed delivery
- **WHEN** GitHub posts a `sponsorship` `created` event with a valid signature
- **THEN** the answer is `200` and a row is kept for it

#### Scenario: A wrong signature
- **WHEN** the body is changed after it was signed
- **THEN** the answer is `401`, no row is kept and the body is not parsed

#### Scenario: A repeated delivery
- **WHEN** the same delivery id is posted twice
- **THEN** the second answer is `200 { "repeated": true }` and one row exists

#### Scenario: Not configured
- **WHEN** `SPONSORS_ACCOUNT` is empty, as `wrangler.jsonc` ships it
- **THEN** a signed delivery is answered `404 not-found` and no row exists

### Requirement: What a delivery may be
The route SHALL refuse a body not declared `application/json` with `415 request.unsupported` before
reading it, read at most 64 KiB (`400` over it), refuse a signed body that is not a JSON object
with `400`, refuse every delivery with `500` while the secret is blank, and log neither a body, a
signature nor the secret, whatever it answers.

#### Scenario: Not JSON
- **WHEN** a delivery arrives as `application/x-www-form-urlencoded`
- **THEN** the answer is `415 request.unsupported` and no row exists

#### Scenario: Too long
- **WHEN** a signed delivery holds one byte over 64 KiB
- **THEN** the answer is `400 request.invalid` and no row exists

#### Scenario: Nothing logged
- **WHEN** deliveries are kept, refused for their signature, missing a field and of another type, and the store fails
- **THEN** no line of the log holds a sponsor's login, a body or the secret

### Requirement: What a sponsorship keeps
A `created` event for the configured sponsorable (its login compared ignoring case) SHALL keep the
sponsor's login, id and type, whether the tier is one-time, its amount in cents, the privacy level
and the creation time, as an unclaimed `active` sponsorship, answered `200 { "recorded": true }`;
another sponsorable, a `ping` or another event SHALL be answered `200 { "ignored": true }` and
change nothing; a body missing a field SHALL be `400`.

#### Scenario: One-time and monthly alike
- **WHEN** a one-time sponsorship of 500 cents and a monthly one of 1000 cents are created
- **THEN** both rows are unclaimed, the first with `one_time` set

#### Scenario: Another sponsorable
- **WHEN** the event's `sponsorable.login` is not `SPONSORS_ACCOUNT`
- **THEN** the answer is `200 { "ignored": true }` and no row exists

#### Scenario: A field missing
- **WHEN** the event has no `sponsorship.sponsor.login`
- **THEN** the answer is `400` and nothing changes

### Requirement: The later actions
The other `sponsorship` actions SHALL set the status and the privacy of the newest sponsorship of
the sponsor's login and the tier's kind (`active` for `edited`, `tier_changed` and
`pending_tier_change`, `pending-cancellation`, and `cancelled`, which no later action undoes),
answered `200 { "updated": … }`, and change no entitlement; another action SHALL be
`200 { "ignored": true }`.

#### Scenario: A cancellation
- **WHEN** `ana`'s monthly sponsorship is `cancelled`
- **THEN** the answer is `200 { "updated": true }` and the row's status is `cancelled`

#### Scenario: A cancellation stays
- **WHEN** a monthly sponsorship is `cancelled` and an `edited` delivery for it arrives later
- **THEN** its status is still `cancelled`

### Requirement: The claim
When a signed-in person's sign-ins are read through the Worker (`GET /api/account/identity`),
while the service has a sponsored account, and one is a GitHub identity whose login equals an
unclaimed sponsorship's of a `User`, ignoring case, the Worker SHALL grant `unbranded-exports` to
that account with the grantor `github-sponsors` and the login in the log's detail, and claim every
unclaimed sponsorship of that login with the account and the time, in one atomic step.

#### Scenario: A sponsor opens Profile
- **WHEN** Ana, whose GitHub sign-in is `ana`, opens the account panel after a sponsorship by `ana`
  was created
- **THEN** her next session answer says `"unbranded": true`, the row is claimed by her, and the
  log holds a `grant` by `github-sponsors` with the detail `unbranded-exports (ana)`

#### Scenario: Google only
- **WHEN** a person signed in with Google alone opens the account panel, and later links the GitHub account `ana`
- **THEN** the first opening claims nothing and the next one claims the sponsorship

### Requirement: A claim is for good
A claimed sponsorship SHALL never be claimed again, an organisation's never; a cancelled
sponsorship SHALL keep its grant; a failure of the claim SHALL leave the sign-ins answered; and
`user.deleted` SHALL clear the account's claims in the same step as the account's removal.

#### Scenario: Already claimed
- **WHEN** Ben links the GitHub account `ana` after Ana claimed it
- **THEN** nothing is granted to Ben and the row still names Ana

#### Scenario: Cancelled, still granted
- **WHEN** `ana`'s monthly sponsorship is cancelled after the claim
- **THEN** the row's status is `cancelled` and Ana's entitlement is unchanged

#### Scenario: A deleted account
- **WHEN** Ana's account is deleted
- **THEN** the row is unclaimed again and a new account that links `ana` is granted on its next
  Profile
