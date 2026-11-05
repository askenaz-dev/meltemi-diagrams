# An MCP server for agentic diagramming

## Why

On 2026-11-04 the owner handed over a specification of "MCP for agentic diagramming": a remote
Model Context Protocol server through which Codex, in a voice or text conversation, creates
projects in the person's account, adds several diagrams, edits one, uploads an image, looks at
rendered previews, shares the result by link or invitation, runs live sessions and publishes
catalogs, with OAuth sign-in and scopes, revisions that refuse to overwrite a human's change,
retries that never duplicate, no secret in a log, and the whole thing proven on staging and in
production with a controlled test project (its sections 13 to 17: thirty acceptance criteria,
three milestones, the delivery material, the definition of done and its references). The
sections before them, the tool catalogue, the scopes and the transport, did not reach this
repository; this proposal writes them from the criteria and from the service as it is. The
hosted service already has everything the criteria act on: projects, files with revisions and
`ifRevision` conflicts, binaries, versions, sharing, invitations, live sessions and publishing,
behind `mdg_` API tokens and the identity cookie, with the command line as its first automated
client and a skill that teaches agents the language. What it lacks is the door an agent opens
by itself: an MCP endpoint, an authorization server for it, previews drawn on the server, and
the acceptance suite that proves the thirty criteria on a staging host before production.

This is a post-1.0 change outside `docs/roadmap-1.0.md`.

## What changes

- **An MCP endpoint in the Worker.** `https://diagrams.meltemi.dev/mcp`, Streamable HTTP
  (stateless, JSON or SSE answers, `Origin` validated, protocol version negotiated), with a
  catalogue of twenty-seven tools over the existing operations: `whoami`, projects (`list_projects`,
  `create_project`, `get_project`, `rename_project`), files (`read_files`, `write_files` with
  `ifRevision`, `validate`, `upload_image`), versions (`list_versions`, `create_version`,
  `restore_version`), the app (`open_url`), previews (`preview`), sharing (`get_sharing`,
  `set_link_access`, `invite`, `list_invitations`, `revoke_invitation`, `set_member_role`,
  `remove_member`), live sessions (`get_live`, `start_live`, `end_live`) and publishing
  (`list_publications`, `publish`, `unpublish`), each with its input and output schemas, its
  annotations (read-only, destructive, idempotent) and errors as `isError` results with the
  service's stable codes. `write_files` validates every `.meltemi` file against the project
  before pushing and refuses a push with errors whole; `invite` answers the invitation's link and
  says no email was sent. `create_project` and `write_files` take an `idempotencyKey`, which the
  HTTP API gains as the `Idempotency-Key` header: the same key with the same body replays the
  first answer for a day. Every push reaches the open pages through the room, as pushes do today.
- **An authorization server for the endpoint.** OAuth 2.1 with PKCE, dynamic client registration
  and client-id metadata documents, protected resource metadata at
  `/.well-known/oauth-protected-resource`, the `resource` parameter bound to the token's
  audience, scopes `projects:read`, `projects:write`, `sharing`, `live` and `publish` (and
  `offline_access` for refresh), one-hour access tokens with rotating refresh tokens, a consent
  page served with the identity cookie that names the client and the scopes in words, and
  **Connected apps** in the account panel to see and revoke grants. A `mdg_` API token also
  opens the endpoint, with every scope, so `bearer_token_env_var` works from the first day. An
  OAuth token never opens `/api/*` and an `mdg_` token is never minted by the server.
- **Previews drawn on the server.** `preview` returns a PNG (or SVG) of a diagram or a story
  frame at the project's current revision, drawn by a Durable Object with the same engine as the
  command line (the project's imports, the layout, the fonts) and a text report beside it (size,
  elements and relations, diagnostics, what was estimated); cached per revision and limited per
  account. The Worker never rendered before; it does so in the renderer object only.
- **The acceptance suite and the staging gate.** `packages/acceptance` gains an MCP client run of
  every automatable criterion of the specification's section 13 against a host and a test
  account, run by the deploy workflow against `staging.diagrams.meltemi.dev` before production
  is touched and against production after, with evidence written per run; the criteria that need
  Codex and a voice (1, 7 to 9) are a written procedure with recorded evidence in
  `docs/quality/mcp-acceptance.md`.
- **Agents told.** The skill and `docs/agents.md` gain the connection (`codex mcp add`,
  `codex mcp login`, the token alternative), the tool catalogue and the workflow of write, validate,
  preview; `docs/cloud.md` gains the endpoint, the authorization server and the renderer;
  `docs/security.md` the token and scope rules; decision note 0072; the changelog's open section.
- **Configuration.** Two KV namespaces (production and staging) for the authorization server's
  state, the staging Worker's bindings and a `staging` environment of this repository with its
  test token, declared in `meltemi-web`'s Terraform by its change `diagrams-staging`.

New dependencies, to be approved by the owner: `@modelcontextprotocol/server` and
`@modelcontextprotocol/client` (Apache-2.0; the server's `createMcpHandler` is the handler, and
Cloudflare's `agents` package is not used), `zod` (MIT),
`@cloudflare/workers-oauth-provider` (MIT), `@resvg/resvg-wasm` (MPL-2.0, the PNG rasteriser,
approved by the owner on 2026-11-04 and pinned at 2.6.2) and the main-thread build of `elkjs` the
workspace already depends on.

## Capabilities

### New Capabilities

- `mcp-server`: the endpoint, its transport, the tool catalogue, their results, errors and
  limits.
- `mcp-authorization`: the authorization server, the metadata, the scopes, the consent, the
  tokens, their revocation and the acceptance of `mdg_` tokens.
- `mcp-previews`: the renderer object, what a preview returns, its cache and limits.
- `mcp-acceptance`: the suite of the specification's criteria, the staging gate and the
  evidence.

### Modified Capabilities

- `cloud-projects`: added, idempotent creation and pushes through `Idempotency-Key`.
- `cloud-accounts`: added, Connected apps in the session answer and the account panel's data.
- `account-panel`: added, the Connected apps section.
- `agent-skill`: added, the MCP in the skill and the agents guide.

## Impact

`packages/cloud` (the MCP route and tools, the authorization server and consent page, the
renderer Durable Object, the idempotency table (migration 0008), `wrangler.jsonc`'s bindings,
`run_worker_first` and the compatibility flag), `packages/playground` (Connected apps),
`packages/acceptance` (the MCP suite), `skills/meltemi-diagrams` (synced to the agent folders),
`.github/workflows/deploy.yml` (staging, the gates), the docs in both languages, CHANGELOG and
one decision note; in `meltemi-web`, the change `diagrams-staging` (the staging twin, the KV
namespaces, the identity service's product entry and the environment's variables). No change to
the language, the exports or the identity contract.

## Non-goals

The staging environment's infrastructure and the identity service's product entry for it,
which are `meltemi-web`'s change `diagrams-staging`. Receiving a human's changes without a
conversational request (the specification leaves it after milestone 3; a `resources/subscribe`
is another change). Minimal edits through the `edit` package's operations as tools: the agent
writes files, as the command line does. Deleting projects from the server (the app does it).
Billing and quotas beyond the service's own.
