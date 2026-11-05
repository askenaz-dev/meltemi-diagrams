# 0072. An MCP endpoint in the cloud Worker, proved on a staging twin before production

Status: accepted (agent-mcp change, 5 November 2026). Builds on decisions
[0041](0041-hosted-service.md), [0042](0042-sharing-and-publishing.md), [0046](0046-delivery.md),
[0050](0050-live-sessions.md) and [0063](0063-agent-setup-prompt.md).

## Context

On 4 November 2026 the owner handed over the tail of a specification, "MCP for agentic
diagramming": an agent such as Codex, in a voice or text conversation, creates projects in the
person's account, adds several diagrams, edits one, uploads an image, looks at rendered previews,
shares the result by link or invitation, runs live sessions and publishes catalogs, with OAuth
sign-in and scopes, revisions that refuse to overwrite a person's change, retries that never
duplicate and no secret in a log; thirty acceptance criteria prove it on staging and on production.
The hosted service already held everything the criteria act on (projects, files with revisions and
`ifRevision` conflicts, binaries, versions, sharing, invitations, live sessions, publishing) behind
`mdg_` API tokens and the identity cookie, with the command line as its first automated client and
a skill that teaches agents the language. What it lacked was a door an agent opens by itself, an
authorization server for that door, pictures drawn on the server, and a way to prove the criteria
somewhere other than production: the family had no staging environment, and the deploy took
CI-approved `main` straight to production.

## Decision

- **The endpoint lives in the cloud Worker.** `POST /mcp` is a stateless Streamable HTTP endpoint,
  built with `createMcpHandler` of the official `@modelcontextprotocol/server` and `zod`, whose
  twenty-seven tools call the same operations as the HTTP routes with the caller's principal: the
  roles, quotas, caps and stable error codes are the service's own, and a wide scope never adds a
  role. The door refuses a foreign `Origin` and any method but `POST` before anything is read, and
  imports the SDK the first time an isolate serves it. `write_files` compiles every `.meltemi` file
  of a push with the project first and refuses one with an error whole; `invite` answers the link and
  `emailSent: false`; `publish` reads the public address back before it answers.
- **The authorization server is a library over a KV namespace.** `@cloudflare/workers-oauth-provider`
  wraps the Worker: OAuth 2.1 with PKCE, dynamic registration and client-id metadata documents, the
  protected resource metadata, tokens bound to `<origin>/mcp`, scopes `projects:read`,
  `projects:write`, `sharing`, `live` and `publish`, a consent page served with the identity cookie,
  and Connected apps in the account panel. Its state is in `OAUTH_KV`, one namespace per
  environment, declared by Meltemi Web's Terraform. An `mdg_` token opens the endpoint with every
  scope; an OAuth token never opens `/api/*`.
- **Pictures are drawn by a renderer Durable Object.** `ProjectRenderer`, one per project, runs the
  command line's engine (the project's imports, ELK, the fonts) and rasterises with `resvg` compiled
  to WebAssembly; its SVG is the command line's `--fonts system` output byte for byte, and it keeps
  the last twenty pictures. The Worker's request path and the project's room never draw.
- **Idempotency is the API's.** `POST /api/projects` and `PUT /api/projects/<id>/files` take an
  `Idempotency-Key` kept for a day in D1 (migration 0008), and the tools' `idempotencyKey` goes
  through the same table, so every client gets retries that change nothing twice.
- **A staging twin, and the suite as the deploy's gate.** Meltemi Web's Terraform declares
  `meltemi-diagrams-staging` at `staging.diagrams.meltemi.dev` and
  `meltemi-diagrams-publish-staging` at `staging.meltemi.page`, with their own database, bucket,
  namespace and generated secrets, and this repository's `staging` environment. One script,
  `scripts/deploy-config.mjs`, writes either environment's configuration from that environment's
  variables (production's is the committed file with the ids in place, unchanged otherwise), and it
  refuses a configuration whose variables belong to the other environment. The deploy uploads the
  approved source to staging, runs `pnpm acceptance:mcp` against it with two test accounts' tokens,
  and deploys production only when it passes; then it runs the suite against production. A staging
  host that does not answer yet, and a run without the tokens, do not hold production back: the
  first is a notice, the second runs what needs no account and reports the rest skipped.
- **Codex is proved by hand.** The criteria that need the real Codex and a voice (1, 7, 8, 9 and the
  voice half of 16) are a written procedure in [MCP acceptance](../quality/mcp-acceptance.md), whose
  page records each run with its date, versions and evidence; a test refuses a criterion marked
  passed without one, and a document that says the voice flow works while the page has no run.

## Alternatives considered

- **A Worker of its own for the endpoint**: a second script with the same bindings, the same
  operations and a second deploy, for a door that is a few lines in front of them.
- **Cloudflare's `agents` package, or `McpAgent` over Durable Objects**: its handler wraps the same
  SDK with an `Origin` check, and brings dependencies the Worker does not need; sessions on Durable
  Objects are state no tool needs.
- **An authorization server of our own in D1**: the whole of OAuth 2.1 to write and keep, where the
  library is what the specification's references prescribe.
- **Rendering in a browser (Browser Run)**: ten minutes a day on the Free plan and a browser per
  picture; kept as the fallback should a Durable Object's CPU be held to the Free plan's 10 ms.
  Rendering in the request path or in the room: the request path has 10 ms of CPU, and the room's
  event loop serves collaborators.
- **Idempotency in the tools alone**: the command line and other clients would not have it, for the
  same table.
- **Wrangler environments in `wrangler.jsonc`**: staging's names and ids would be written in this
  repository, where none is; the deploy configuration writes them from the environment instead.
- **Testing on production alone**: a suite that creates and shares projects would run on the
  people's service first, and a red run would find the fault after it shipped.
- **Driving Codex from the suite**: the criteria ask for the real client, with its versions,
  permissions and handling of pictures, which an SDK's client or an inspector does not prove.

## Consequences

- New public surface: `POST /mcp` and its tools, the authorization server's endpoints and metadata,
  `GET` and `DELETE /api/account/apps`, the `Idempotency-Key` header, migration 0008, the
  `RENDERERS` Durable Object, the `OAUTH_KV` binding, the error codes `diagram.invalid`,
  `scope.insufficient`, `idempotency.mismatch`, `idempotency.pending` and `publish.unverified`
  ([the MCP endpoint](../cloud.md#the-mcp-endpoint)), and `pnpm acceptance:mcp`.
- Every deploy builds twice and uploads two pairs of Workers; staging's data is only what the suite
  makes and deletes. The suite's two test accounts and their tokens are the owner's to create and
  give to Meltemi Web's Terraform, on each host.
- Until the staging hosts are attached and the tokens given, the gate checks only what anybody
  sees; the deploy says so in a notice and in each run's `results.json`.
- Criteria 27 and 28 are proved in part by the suite: a script cannot approve a consent page, so a
  token past its hour, one of a revoked grant and a narrower scope are the cloud package's tests and
  the procedure's.
- Addresses that carry an invitation's token (`POST /api/invitations/<token>/accept`, an opened
  `?invite=` link) or a live session's are recorded by the platform's request logs; the suite scans
  the Worker's own log and reports those lines as a finding.
- The skill gains [its MCP reference](../../skills/meltemi-diagrams/reference/mcp.md), and the
  agents guide [the connection](../agents.md#through-the-mcp-endpoint).
