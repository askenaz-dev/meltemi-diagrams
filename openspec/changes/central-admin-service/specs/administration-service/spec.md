# Spec Delta

## Purpose

Provide the private authenticated boundary through which the central Meltemi administration
operates Diagrams while preserving the product's existing permissions, storage and audit behavior.

## ADDED Requirements

### Requirement: Private administration boundary
The hosted service SHALL expose a named `Administration` service entrypoint with `fetch(Request)`.
Only explicit service bindings SHALL reach this adapter. The default public HTTP handler and the
local Docker Worker SHALL NOT expose it, and no public header SHALL select it.

#### Scenario: Explicit hosted service binding
- **WHEN** the identity Worker invokes its binding to the hosted `Administration` entrypoint
- **THEN** the request reaches the private administration contract

#### Scenario: Public or local access
- **WHEN** a public caller asks for `/context`, spoofs a bridge header, or uses the local Docker Worker
- **THEN** it cannot reach the adapter or obtain its administrative context

### Requirement: Fresh session authentication
Every private request SHALL authenticate only a bounded bearer identity-session JWT of at most
4096 characters. The signature, issuer, audience, expiry and live session SHALL be verified without
a session-status cache or development fail-open behavior. Caller cookies, API tokens, user ids and
role headers SHALL NOT authenticate the request. Invalid authentication SHALL return `401 auth.required`.

#### Scenario: Valid owner session
- **WHEN** an owner sends a valid live session JWT as its bearer
- **THEN** its existing identity is used for the administration operation

#### Scenario: Forged, revoked or unavailable session
- **WHEN** a JWT is forged or revoked, exceeds the bound, or the identity service cannot confirm it
- **THEN** the adapter returns `401 auth.required` and changes nothing

#### Scenario: Cookie or API token alone
- **WHEN** a request carries only an owner cookie, an `mdg_` API token, or a caller-supplied owner id
- **THEN** the adapter returns `401 auth.required`

### Requirement: Closed destination contract
The private adapter SHALL accept only its configured origin without URL credentials, query or
fragment, and only `GET /context`, `POST /account-permission` or the existing administration method/path pairs. Encoded separators,
controls and dot path segments SHALL be refused. Unknown methods or destinations SHALL return
`404 not-found`. It SHALL reconstruct its own destination and never operate as an arbitrary proxy.

#### Scenario: Existing administration routes
- **WHEN** a caller asks an admitted method/path pair under `/api/admin`
- **THEN** the request can proceed only to that existing administration operation

#### Scenario: Other destinations
- **WHEN** a caller names another host, a query, a project route, an unknown method or an encoded path escape
- **THEN** the adapter returns `404 not-found` without an administration action

### Requirement: Bounded JSON requests
The adapter SHALL read every request body through an 8192-byte limit. A nonempty body SHALL be a
JSON object with a JSON content type; malformed, oversized or other body shapes SHALL return
`400 request.invalid`. Empty bodies SHALL retain the existing operation's validation behavior.

#### Scenario: Valid JSON body
- **WHEN** a permitted operation carries a JSON object within the limit
- **THEN** its unchanged object is passed to the existing handler for field validation

#### Scenario: Invalid or oversized body
- **WHEN** a request carries invalid JSON, an array, another content type or more than 8192 bytes
- **THEN** it returns `400 request.invalid` and no business action runs

### Requirement: Minimal administration context
`GET /context` SHALL return only `role` (`owner`, `admin`, `invitee` or `none`) and `invitation`
(`null` or `{ id, invitedBy: { name }, expiresAt }`) with `Cache-Control: no-store`. It SHALL derive
the context from the existing authenticated session operation, expose no other user/session data,
and fail closed if that operation cannot provide an authenticated answer.

#### Scenario: Owner and administrator
- **WHEN** an owner or invited administrator reads the context
- **THEN** the role is respectively `owner` or `admin` and the invitation is null

#### Scenario: Invitee
- **WHEN** a person has a pending invitation for the session's verified email
- **THEN** its role is `invitee` and only that invitation's minimal fields are returned

#### Scenario: No administrative role
- **WHEN** a live session has neither role nor eligible invitation
- **THEN** the context is `{ "role": "none", "invitation": null }`

#### Scenario: Failed session answer
- **WHEN** the underlying session operation fails or does not identify an authenticated user
- **THEN** no context granting administrative access is returned

### Requirement: Private account lookup
`POST /account-permission` SHALL accept exactly `{ account, permission }` as nonempty strings in
its bounded JSON body and delegate to the existing account-permission GET with encoded path
segments. It SHALL return the existing response and role failures without putting the lookup
in its service invocation URL. Missing, extra, invalid or unsafe fields SHALL be `400 request.invalid`.

#### Scenario: Look up an account by email
- **WHEN** an authorized administrator posts a verified account email and `unbranded-exports`
- **THEN** the existing account-permission response is returned through the constant lookup URL

#### Scenario: Invalid lookup fields
- **WHEN** the body omits either field, adds a field, uses a non-string, or names an unsafe path segment
- **THEN** the adapter returns `400 request.invalid` without a business action

### Requirement: Existing authorization and audit
The private transport SHALL preserve every `service-administration` operation's role, account,
invitation, validation, limit, response and audit behavior. It SHALL rebuild the service's own
cookie and Origin from its validated session rather than trust caller headers. The central browser
interface SHALL enforce its own Origin and scoped CSRF before invoking a mutation.

#### Scenario: Delegated actions retain permissions
- **WHEN** an administrator attempts an owner-only invitation or removal of another administrator
- **THEN** the existing `404 not-found` response occurs and nothing is changed or logged

#### Scenario: Successful grant
- **WHEN** an authorized administrator grants an existing permission through the binding
- **THEN** the account changes and the existing audit entry records that administrator atomically

#### Scenario: Spoofed caller headers
- **WHEN** a caller sends another user's cookie, Origin or role headers with a valid nonowner bearer
- **THEN** only the bearer session's existing permissions apply

### Requirement: Environment isolation
Each hosted binding SHALL act only on the bound Worker's configured origin and data. Staging SHALL
use its own database and configuration. The local tokenless Worker SHALL keep administration
unavailable and SHALL NOT gain an identity or service-binding dependency.

#### Scenario: Staging request
- **WHEN** a staging binding receives a request for its staging origin
- **THEN** only staging administration data can be read or changed

#### Scenario: Production origin on staging
- **WHEN** a staging binding receives a request for the production origin
- **THEN** it returns `404 not-found` and no operation runs
