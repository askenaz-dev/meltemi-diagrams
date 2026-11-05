# mcp-server Specification

## Purpose
The Model Context Protocol endpoint of the hosted service: its transport, the catalogue of tools over the service's operations, their inputs, results, errors, scopes and limits.

## Requirements

### Requirement: The endpoint
The Worker SHALL serve `POST /mcp` as a stateless Streamable HTTP endpoint: a JSON-RPC message
per request, `Accept` with `application/json` and `text/event-stream`, the
`MCP-Protocol-Version` header honoured (`400` for an unsupported one), no session id issued,
`GET /mcp` answered `405`, an `Origin` that is not the service's refused `403`, and every call
authenticated (`mcp-authorization`).

#### Scenario: Initialize
- **WHEN** a client posts `initialize` with a valid token and `Accept: application/json, text/event-stream`
- **THEN** the answer carries `protocolVersion`, `capabilities.tools`, `serverInfo.name` `meltemi-diagrams` and three sentences of `instructions`, and no `Mcp-Session-Id`

#### Scenario: A foreign origin
- **WHEN** the request carries `Origin: https://evil.example`
- **THEN** the answer is `403` and nothing runs

#### Scenario: An unsupported version
- **WHEN** `MCP-Protocol-Version: 1999-01-01` is sent
- **THEN** the answer is `400`

### Requirement: The catalogue
`tools/list` SHALL answer twenty-seven tools, each with `name`, `title`, `description`,
`inputSchema`, `outputSchema` and `annotations`: `whoami`; four project tools; four file
tools; three version tools; `open_url`; `preview`; seven sharing tools; three live tools; three
publishing tools, named in the scenarios. Read tools SHALL carry `readOnlyHint`; the tools that
remove, restore, end or unpublish SHALL carry `destructiveHint`.

#### Scenario: The names
- **WHEN** `tools/list` is called
- **THEN** it answers `whoami`, `list_projects`, `create_project`, `get_project`, `rename_project`, `read_files`, `write_files`, `validate`, `upload_image`, `list_versions`, `create_version`, `restore_version`, `open_url`, `preview`, `get_sharing`, `set_link_access`, `invite`, `list_invitations`, `revoke_invitation`, `set_member_role`, `remove_member`, `get_live`, `start_live`, `end_live`, `list_publications`, `publish` and `unpublish`

#### Scenario: The annotations
- **WHEN** the catalogue is read
- **THEN** `read_files` has `readOnlyHint: true`, `unpublish`, `restore_version`, `remove_member`, `revoke_invitation` and `end_live` have `destructiveHint: true`, and `create_project` has `idempotentHint: true`

#### Scenario: An unknown tool
- **WHEN** `tools/call` names `delete_project`
- **THEN** the answer is the JSON-RPC error `-32602` naming the tool

### Requirement: Results and errors
Every tool result SHALL carry `structuredContent` conforming to its `outputSchema` and the same
JSON as a text content item; a refused call SHALL be an `isError` result whose
`structuredContent` is `{ code, message, … }` with the service's stable error code and its
fields, never a token, a link that grants access or a stack.

#### Scenario: A conflict
- **WHEN** `write_files` is called with `ifRevision: 41` and the room is at 43
- **THEN** the result is `isError` with `code: "revision.mismatch"` and `revision: 43`, and nothing changed

#### Scenario: Someone else's project
- **WHEN** a tool names a project the account may not open
- **THEN** the result is `isError` with `code: "project.not-found"` and no other field

#### Scenario: A quota
- **WHEN** `create_project` is the account's 101st
- **THEN** the result is `isError` with `code: "quota.projects"` and `limit: 100`

### Requirement: Projects through the tools
`create_project { name, template? | files?, idempotencyKey? }` SHALL answer the project with
its `url`; `get_project` its metadata, `revision`, file paths and `url`; `rename_project` the
project; `open_url` the address that opens it in the app; `list_versions`, `create_version`
and `restore_version` SHALL act as the versions routes do.

#### Scenario: A project with its address
- **WHEN** `create_project` is called with `name: "Checkout"`
- **THEN** the result's `url` is `https://diagrams.meltemi.dev/?project=<id>` and `list_projects` lists it

#### Scenario: Retried with the same key
- **WHEN** `create_project` is called twice with `idempotencyKey: "k1"` and the same input
- **THEN** both answers name the same project and one project exists

#### Scenario: A second project leaves the first
- **WHEN** a second project is created and files are pushed to it
- **THEN** the first project's files and sharing are unchanged

### Requirement: Files through the tools
`read_files { project, paths? }` SHALL answer `{ revision, files, binaries }` from the room;
`write_files { project, files, binaries?, ifRevision, idempotencyKey? }` SHALL compile every
`.meltemi` of the push with the project's files and refuse a push whose files have errors whole
(`diagram.invalid` with the diagnostics), else push and answer `{ revision }`; `validate` SHALL
answer the diagnostics of a path or the project; `upload_image` SHALL answer `{ hash }`.

#### Scenario: Two diagrams in one project
- **WHEN** `write_files` adds `flow.meltemi` and `sequence.meltemi` with `ifRevision` from `get_project`
- **THEN** `get_project` lists both paths, `read_files` returns their text and a page open on the project shows them without a reload

#### Scenario: A push with an error
- **WHEN** `write_files` pushes a file with `diagram x: flow { element a -> }`
- **THEN** the result is `isError` with `code: "diagram.invalid"` and the diagnostic's line, and the room's revision is unchanged

#### Scenario: A human's change is read
- **WHEN** a page changes a file and `read_files` is called
- **THEN** the answer holds the changed text and the new revision

#### Scenario: An image uploaded
- **WHEN** `upload_image` sends a PNG as `assets/logo.png`
- **THEN** the result's `hash` is the file's SHA-256, `read_files` lists it under `binaries` and the page shows it

### Requirement: Sharing through the tools
`set_link_access { project, level }` SHALL answer the sharing state; `invite { project, email,
role }` SHALL answer `{ invitation, link, emailSent: false }`; `get_sharing`,
`set_member_role`, `remove_member`, `list_invitations` and `revoke_invitation` SHALL act as the
sharing routes do; each SHALL need the project role its route needs and the `sharing` scope.

#### Scenario: A read link
- **WHEN** `set_link_access` sets `view` and the answered `link` is opened anonymously
- **THEN** the project's files are readable there and `write_files` from an anonymous client is refused

#### Scenario: An invitation says no email
- **WHEN** `invite` is called for `ana@example.com` as `editor`
- **THEN** the result holds the invitation's `link` and `emailSent: false`, and `list_invitations` lists it

#### Scenario: A viewer cannot share
- **WHEN** a token of an account that is a viewer of the project calls `set_link_access` or `invite`
- **THEN** the result is `isError` with the role's refusal and nothing changes

### Requirement: Live sessions and publishing through the tools
`start_live { project, guestsEdit }`, `get_live` and `end_live` SHALL answer the session with
`link` and `until` as the live routes do; `publish { project, slug }` SHALL answer the public
`url` after reading it back once, `unpublish` SHALL remove that slug only and
`list_publications` SHALL list the account's; each SHALL need its route's role and the `live`
or `publish` scope.

#### Scenario: A live session with its term
- **WHEN** `start_live` is called with `guestsEdit: true`
- **THEN** the result holds `link` and `until`, and `end_live` makes `get_live` answer `live: null`

#### Scenario: Published and read back
- **WHEN** `publish` is called with the slug `precios`
- **THEN** the result's `url` answers `200` to an anonymous `GET`, and `unpublish` makes it `404` while another publication of the account stays

#### Scenario: A read-back that fails
- **WHEN** the publish host does not answer the new address
- **THEN** the result is `isError` with `code: "publish.unverified"` naming the address, and the publication exists

### Requirement: Limits of the endpoint
The endpoint SHALL cap a request's body at 24 MiB (`413`), SHALL apply the service's quotas and
caps unchanged, SHALL limit an account to 300 calls a minute (`429 rate.limited`), and SHALL
log a call's tool name, duration and error code only.

#### Scenario: Over the rate
- **WHEN** an account makes its 301st call within a minute
- **THEN** the result is `isError` with `code: "rate.limited"` and a `retryAfter`

#### Scenario: Nothing secret in the log
- **WHEN** `invite` and `start_live` run with a spying `console`
- **THEN** no logged line holds the invitation's or the session's link
