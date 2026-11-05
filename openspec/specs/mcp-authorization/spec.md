# mcp-authorization Specification

## Purpose
How a client is authorized on the MCP endpoint: the authorization server, its metadata, scopes, consent, tokens and their revocation, and the acceptance of the service's own API tokens.

## Requirements

### Requirement: Metadata
`GET /.well-known/oauth-protected-resource` and its path `/mcp` SHALL answer `{ resource:
"<origin>/mcp", authorization_servers: ["<origin>"], scopes_supported, bearer_methods_supported:
["header"] }`,
and `GET /.well-known/oauth-authorization-server` the server's metadata with
`code_challenge_methods_supported: ["S256"]`, `registration_endpoint`,
`client_id_metadata_document_supported: true` and `token_endpoint_auth_methods_supported`
including `none`.

#### Scenario: Discovery
- **WHEN** a client reads both documents
- **THEN** the resource is `https://diagrams.meltemi.dev/mcp`, the server is the origin and S256 is listed

#### Scenario: A method the server does not offer
- **WHEN** the metadata is read
- **THEN** `grant_types_supported` holds `authorization_code` and `refresh_token` and not `client_credentials`

### Requirement: The challenge
A call to `/mcp` without a valid token SHALL answer `401` with `WWW-Authenticate: Bearer
resource_metadata="<origin>/.well-known/oauth-protected-resource"`, and nothing SHALL run.

#### Scenario: No token
- **WHEN** `/mcp` is posted without `Authorization`
- **THEN** the answer is `401` with the `WWW-Authenticate` header naming the metadata address

#### Scenario: A malformed token
- **WHEN** `Authorization: Bearer not-a-token` is sent
- **THEN** the answer is `401` with the same header

### Requirement: Clients and consent
Clients SHALL register by dynamic registration or a client-id metadata document, ten
registrations an hour per address (`429` beyond); `GET /oauth/authorize` SHALL validate the
request (PKCE S256, an exact redirect URI of the client, a `resource` equal to the endpoint),
send a signed-out person to the identity service's sign-in with `return_to` the same address,
and show a signed-in person a consent page naming the client, its id's host and each scope in
words, with Approve and Deny.

#### Scenario: Consent shown
- **WHEN** a registered client starts the flow and the person is signed in
- **THEN** the page names the client, its host and "Read your projects" for `projects:read`, in the interface language

#### Scenario: A wrong resource
- **WHEN** the authorization request names `resource=https://other.example/mcp`
- **THEN** the request is refused before the consent page and no code is issued

#### Scenario: Denied
- **WHEN** the person presses Deny
- **THEN** the client receives `error=access_denied` and no token exists

#### Scenario: Registration flooded
- **WHEN** an address registers an eleventh client within an hour
- **THEN** the answer is `429` and no client is registered

### Requirement: Tokens
Approval SHALL issue a code bound to the person, the client, the scopes and the resource, and
`/oauth/token` SHALL exchange it, with the PKCE verifier, for an access token of one hour and,
with `offline_access`, a rotating refresh token; a used code (whose grant is then revoked), a
wrong verifier and a refresh token whose replacement was used SHALL be refused.

#### Scenario: The whole flow
- **WHEN** a registered client completes the flow with `scope=projects:read projects:write offline_access` and the person approves
- **THEN** the token answer has `access_token`, `expires_in: 3600` and `refresh_token`, and the access token opens `/mcp`

#### Scenario: A code used twice
- **WHEN** the same code is exchanged again
- **THEN** the answer is `400 invalid_grant`, and the grant is revoked with the token it gave

#### Scenario: A refresh token rotated
- **WHEN** a refresh token is used, its replacement is used, and the first is used again
- **THEN** each of the first two uses answers a new pair and the third is refused

### Requirement: Scopes and audience
Reads SHALL need `projects:read`, writes `projects:write`, the sharing tools `sharing`, the live
tools `live` and the publishing tools `publish`; a token short of a tool's scope SHALL get the
`isError` result `scope.insufficient` naming the scope; an expired token, a token of another
resource or a revoked grant SHALL answer `401`; an OAuth token SHALL never open `/api/*`, and
scopes SHALL never exceed the account's project roles.

#### Scenario: A read-only token
- **WHEN** a token with `projects:read` alone calls `write_files`
- **THEN** the result is `isError` with `code: "scope.insufficient"` and `scope: "projects:write"`, and nothing changes

#### Scenario: An editor with every scope
- **WHEN** a token with every scope of an account that is an editor of a project calls `set_link_access`
- **THEN** the result is the role's refusal, since sharing is the owner's

#### Scenario: Expired and revoked
- **WHEN** an access token past its hour, and one of a revoked grant, post to `/mcp`
- **THEN** both answers are `401`

#### Scenario: An OAuth token on the API
- **WHEN** an OAuth access token is sent to `GET /api/projects`
- **THEN** the answer is `401 token.invalid`

### Requirement: The service's own tokens on the endpoint
A `mdg_` API token SHALL open `/mcp` with every scope, as the account it belongs to, and the
endpoint SHALL never issue, list or print one; the OAuth server SHALL never accept a token it
did not issue on `/oauth/token`.

#### Scenario: Bearer token from the environment
- **WHEN** Codex sends `Authorization: Bearer mdg_…` of a valid token to `/mcp`
- **THEN** `whoami` answers that account and `write_files` works for its projects

#### Scenario: A foreign token
- **WHEN** a JWT of the identity service is sent as the bearer to `/mcp`
- **THEN** the answer is `401`

### Requirement: Connected apps
`GET /api/account/apps` SHALL list the account's grants (`{ id, client: { name, uri }, scopes,
createdAt, lastUsedAt }`) and `DELETE /api/account/apps/<id>` SHALL revoke one, its tokens
refused from then on; both for a person signed in on the page only, under the `Origin` rule.

#### Scenario: Revoked from the panel
- **WHEN** the person revokes the grant of `Codex` and its access token posts to `/mcp`
- **THEN** the answer is `401` and the list no longer holds it

#### Scenario: A token cannot manage apps
- **WHEN** `GET /api/account/apps` is called with a `mdg_` token
- **THEN** the answer is `403 request.forbidden`
