# Spec Delta

## MODIFIED Requirements

### Requirement: Request authentication
For the hosted entry point, every request SHALL resolve to a principal: a bearer token `mdg_…` whose SHA-256 matches a
token row (`via: "token"`), else a `meltemi_session` cookie the reference verifier accepts
(signature against the configured JWKS, `iss`, `aud`, `exp`, and the session check at the
issuer at most once an hour per session per verifier instance; `via: "cookie"`), else
anonymous. An unknown bearer token SHALL answer `401 token.invalid`; an invalid or expired
cookie SHALL count as anonymous; routes that need a person SHALL answer `401 auth.required`.
The inline `IDENTITY_JWKS` and the skipped session check SHALL be honoured only when `DEV` is
`"true"`; `DEV` and `IDENTITY_JWKS` SHALL come only from `.dev.vars`, and a test SHALL fail
when `wrangler.jsonc` defines either.


The separate local entry point SHALL instead resolve every accepted request to one
stable local actor, without reading or issuing a browser session, JWT, API token or provider
credential. It SHALL NOT construct or consult a remote identity verifier. Local API, rooms
and MCP SHALL resolve the same actor without authentication exchanges. The hosted entry
point SHALL NOT select that actor from any request flag, header or local-looking Host.

#### Scenario: A minted session
- **WHEN** a request carries a cookie signed with the test keys for `sub` `u1` and `DEV` is `"true"` with those keys in `IDENTITY_JWKS`
- **THEN** the route sees a cookie principal `u1` and a user row `u1` exists afterwards

#### Scenario: An inline JWKS outside development
- **WHEN** `IDENTITY_JWKS` holds the test keys but `DEV` is not `"true"`
- **THEN** a cookie signed with those keys counts as anonymous and the keys come from `IDENTITY_JWKS_URL` only

#### Scenario: Development keys in the deployed configuration
- **WHEN** `wrangler.jsonc` defines `DEV` or `IDENTITY_JWKS`
- **THEN** `pnpm cloud:test` fails naming the key

#### Scenario: An expired cookie
- **WHEN** the cookie's `exp` is in the past
- **THEN** `GET /api/session` answers `{ "user": null, … }`

#### Scenario: An unknown token
- **WHEN** `Authorization: Bearer mdg_unknown` is sent
- **THEN** the answer is `401` with `token.invalid`

#### Scenario: Credential-free local interfaces
- **WHEN** the local browser, room connection and MCP client make valid requests without cookies or Authorization
- **THEN** all resolve the same local owner and no credential, login or external identity call is required

#### Scenario: Hosted mode stays authenticated
- **WHEN** a hosted request has no credentials but supplies a local-looking Host or local-mode header
- **THEN** it does not gain a principal and the existing hosted authentication and Host refusals still apply

### Requirement: The Origin rule
A request that changes state (any method other than `GET`, `HEAD` or `OPTIONS`) authenticated
by a cookie SHALL carry an `Origin` header equal to the Worker's own origin (`ORIGIN`, or the
request's own origin `new URL(request.url).origin` when `DEV` is `"true"`); otherwise the
answer SHALL be `403 request.forbidden` before the route runs. Requests authenticated by a
bearer token SHALL not need it.


In local mode, browser state-changing API requests and WebSocket handshakes SHALL require
the exact configured Origin even though no cookie is used, refusing missing, foreign and
`null` Origins. Native MCP requests SHALL allow a missing Origin but refuse a present Origin
that differs from the configured origin. Host checks SHALL occur before local actor selection;
local mode SHALL never use the request-derived DEV origin.

#### Scenario: A form from another family host
- **WHEN** `POST /api/tokens` arrives with a valid cookie and `Origin: https://id.meltemi.dev`
- **THEN** the answer is `403 request.forbidden` and no token is created

#### Scenario: The page itself
- **WHEN** the same request arrives with `Origin: https://diagrams.meltemi.dev`
- **THEN** the route runs

#### Scenario: Browser request without acceptable local Origin
- **WHEN** a local state-changing browser API request or WebSocket handshake has no Origin, a foreign Origin or Origin null
- **THEN** it is refused before any state change or editable connection

#### Scenario: Native tokenless MCP client
- **WHEN** a native MCP client sends no Origin or credential to the configured local Host
- **THEN** the call can proceed as the local actor after transport checks

#### Scenario: Foreign browser calls MCP
- **WHEN** a local MCP request has a foreign or null Origin
- **THEN** it is refused before executing a tool
