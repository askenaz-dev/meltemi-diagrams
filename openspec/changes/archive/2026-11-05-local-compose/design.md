# Design

## Context

The exploration used Diagrams `56f0c6c`; implementation started on refreshed main `dc0a495` and integrated Gantt main `0113ef3` before final validation. Its Worker already serves editor assets, API, rooms and MCP, with local D1/R2/Durable Objects under Wrangler. Its MCP browser suite exercises create/write/validate and SVG/PNG rendering locally. `packages/mcp` supplies shared tool definitions and renderer assets.

Constraints:

- Frontend session parsing currently recognizes cookie/token-shaped responses; room handshakes authenticate cookies. Both need to recognize local mode explicitly.
- `DEV=true` accepts request-derived origins. This product mode needs a configured origin and no development endpoints.
- `/agent-setup/prompt.md` currently installs only a skill through the host CLI. No agent plugin package exists here; diagram-language plugins are unrelated. This prompt does not install MCP.
- The canonical skill starts with host CLI commands. The local plugin must be MCP-first while reusing language references/examples.
- The documentation portal imports this repository's released docs and derives navigation from `docs/README.md`.

The implementation follows the owner's tokenless direction; the local actor replaces browser sessions and agent API tokens.

## Goals / Non-Goals

**Goals:** `docker compose up`; immediate local editing; a prompt that installs the real plugin and MCP; one workspace for person and agents; no authentication overhead or external identity round trips; preserved source and storage.

**Non-Goals:** the hosted capabilities named in the proposal. Backend projects are not automatically bind-mounted Git directories. Browser import/export provides explicit transfers. The user's agent/model runs separately; the image does not contain an LLM or start Claude Code/Codex.

## Decisions

### 1. One command starts the complete local app

The released source includes `compose.yaml` with a build definition, default configuration, persistent volume and one application service. The complete initial command is:

```text
docker compose up
```

Compose builds the image when absent. The application initializes missing state, creates one stable local owner/default project exactly once, then starts web/backend/MCP. No `.env`, credentials, manual schema command, host Node or identity repository is needed. Ready startup output gives the editor address and copyable setup prompt; the editor also offers the prompt.

Build assets, pinned dependencies, fonts/icons and plugin bundles into the image. Starting an existing image does not install packages or fetch remote resources. Ctrl+C or `docker compose down` retains storage; another `up` returns to it.

```text
docker compose up
      |
      +-- Editor: http://127.0.0.1:8879/
      +-- Setup prompt + plugins: /agent-setup/local/
      +-- MCP: http://127.0.0.1:8879/mcp (no authentication)
                       |
            same project / room / persistent state
                       |
           person <----+----> Claude Code or Codex
```

Reuse the Worker runtime and local D1/R2/room/renderer implementations. A Node backend would duplicate adapters; a `mdg mcp` sidecar adds another connection path. The Worker renderer executes locally without consuming a hosted Cloudflare CPU allowance; retain application caps and verify the actual container.

### 2. One explicit local actor; no authentication layer

A separate local entry point/configuration supplies `{ via: "local", sub, profile }`. Its stable `sub` owns local projects. It has no cookie, bearer, JWT, session ID or provider identity. Do not fabricate a cookie principal. Existing access operations can continue to resolve permissions by `sub`.

Every accepted local request, including rooms and MCP, uses that actor. Do not construct a remote verifier, require issuer/JWKS, perform revocation checks or create browser session records. `/api/session` is a UI capability/actor description: `mode: "local-single-user"`, the local owner in `user`, no token/expiry/provider links.

The page recognizes this mode and opens the default project without sign-in. Show “Local workspace” and “Set up my agent”. Hide accounts, API tokens, session/disconnect controls, sponsorship and unsupported sharing/publishing features. Identity, API-token management, CLI-login approval and OAuth routes are unavailable. The plugin/MCP connection requires no `Authorization`, cookie, `MELTEMI_TOKEN` or `MELTEMI_MCP_KEY`.

For `/mcp`, construct a local Caller and invoke the shared handler after transport checks, bypassing `serveProvider` and `apiTokenCaller`. Disable OAuth registration/consent/token/discovery and external metadata fetching. Missing credentials cause no `401`, OAuth redirect or bearer challenge.

Production keeps its existing verifier/authorization. Tests prove a request flag or local-looking Host cannot activate the local actor there. Automatic cookies/hidden bearer tokens were rejected: issuance, expiry and revocation add machinery the selected trust model does not need.

### 3. Loopback and Origin rules define the boundary

Publish only `127.0.0.1:8879:8788`; the listener binds the container interface. Use a fixed `http://127.0.0.1:<port>` origin and validate exact Host before resolving the actor. A supported port override updates URLs, bundles and prompt together. Reject public/LAN/wildcard origins; do not inherit DEV's request-derived origin.

Browser state-changing API requests and room WebSocket handshakes require exact Origin; missing, foreign and `null` Origins are refused. Native MCP may omit Origin; a present Origin must match. Keep content negotiation, JSON/body/protocol/rendering limits and no cross-origin browser access.

Any native process/user able to reach this host's loopback can operate the workspace. That is the chosen boundary, not per-agent isolation. LAN/Internet exposure is outside this configuration.

### 4. The prompt installs the plugin and MCP connection

Ship thin Claude Code and Codex plugin variants generated from canonical Meltemi content. Each includes the supported plugin manifest/local installation metadata, an MCP-first diagramming skill with shared references/examples, and a native Streamable HTTP MCP entry for this instance with no authentication. Do not start another MCP process.

Copying a skill folder alone is not plugin installation. Registering only an MCP URL is also incomplete. Generate/sync from `skills/` so the language reference does not become another manually maintained copy.

| Local path | Contents |
| --- | --- |
| `/agent-setup/local/prompt.md` | Installation instructions for the agent, using the configured origin. |
| `/agent-setup/local/manifest.json` | Product version/revision, origin, MCP URL, default project/open URL, client bundle URLs and hashes. Meltemi-specific metadata, not standard MCP discovery. |
| `/agent-setup/local/claude-plugin.zip` | Complete Claude Code plugin plus supported local installation metadata. |
| `/agent-setup/local/codex-plugin.zip` | Complete Codex plugin plus supported local installation metadata. |

The prompt detects the client, fetches/verifies its bundle and installs/registers it through the supported local mechanism. Prefer workspace-local scope, preserve unrelated configuration and keep existing approval policies. The user's setup request authorizes Meltemi's plugin/MCP entries; retain any client-required native trust/install interaction without adding a Meltemi login.

Repeated setup reuses an identical version/endpoint without duplicates. Conflicting Meltemi registrations are reported without silently replacing another instance. Archive paths stay inside the installation destination. No npm `@latest`, host package manager or remote registry is needed after image build.

Verify installed/enabled state and then actual MCP tool availability. If the client requires reload/new session or native installation interaction, preserve the selected project and give the exact continuation. Do not report active diagramming before tools are available or substitute ad-hoc HTTP calls and call them plugin installation.

Current official documentation supports skill+MCP plugins, with client-specific activation. Codex's documented plugin workflow uses a new session; Claude Code supports plugin loading/reloading. Record tested versions and exercise their supported paths. A zero-reload promise is not assumed.

Proposed user-facing prompt:

```text
Instala el plugin de Meltemi Diagrams y configura su MCP local siguiendo http://127.0.0.1:8879/agent-setup/local/prompt.md. La instancia ya corre en mi equipo y no usa autenticación. Verifica que el plugin y sus herramientas estén activos y después comienza a diagramar conmigo en el proyecto indicado por Meltemi.
```

The editor copy action includes the selected project; startup uses the default project. Metadata/prompt reads are side-effect-free. Two agents discover the same workspace rather than creating separate projects.

### 5. Agentic diagramming uses the open project

The activated plugin opens the indicated project, reads files/revision, makes small changes using `ifRevision` and an idempotency key, validates, checks the preview and returns `open_url`. The browser updates without reload; canvas edits become source the agent reads next. No duplicate host files or separate preview server substitute for this flow.

Keep shared tool schemas and stateless Streamable HTTP, no issued MCP session ID, existing method/version/body refusals, atomic validation and revision conflicts. Tokenless native calls use the same local actor.

Keep the 27-tool catalogue: fourteen core project/file/version/whoami/open/preview tools operate locally; thirteen sharing/live-guest/publication tools and equivalent HTTP actions fail `local.feature-unavailable` before effects. Explain this in initialization and the skill. Ordinary room synchronization between person and agents remains enabled; guest-session restrictions do not disable their joint editing.

### 6. Keep storage and operations simple

API pushes/restores commit the candidate document and next revision to room storage before
acknowledgement or broadcast; storage failure rolls back the candidate and permits retry at
the prior revision. The local entry point exports a separate room subclass whose constructor
opts WebSocket updates into that same durable boundary, preserving the latest accepted human
edit across a rapid stop. Hosted WebSocket traffic retains its existing one-second throttle.
Version/materialisation boundaries also checkpoint pending room state before success. This
uses explicit storage transactions, rather than a shutdown delay or public flush route.

One volume holds all D1/R2/DO state, owner, default project and source/schema metadata. A shared-volume kernel flock serializes the launcher and offline operations across container PID namespaces; it is released when the launcher exits. Serialize initialization, fail readiness on errors and never reset data on startup. A health check reports readiness/version. Preserve maintenance through a pure maintainState function and launcher-owned DB/R2 platform proxy on the same state/v3 resource root; expose no scheduling HTTP trigger, including Wrangler's test-scheduled endpoint. The pinned Wrangler startWorker scheduled wrapper targets its proxy Worker rather than the application, so the launcher does not use that broken dispatch path. No user-managed maintenance credential is needed.

Document stop/restart and complete quiesced backup/restore. The caller stops the application before invoking the helper; the shared-volume lock refuses backup or restore while writers are active. The helper captures the whole state and restores to a fresh target. Verify sources, versions, room state and image hashes; refuse malformed backups/nonempty targets. Label volume deletion as destructive reset.

Initial build/downloads require network. Afterwards block egress and prove startup, plugin-bundle download, editing, synchronization, validation and SVG/PNG previews. Disable runtime telemetry/update traffic and use bundled fonts/icons and project images. The separate agent/model may require its own network.

### 7. Document and test the user journey

Add `docs/local-compose.md` and `docs/es/local-compose.md`, indexed and linked from cloud/agents. The portal publishes `/diagrams/local-compose/` and `/es/diagrams/local-compose/` from the product release; do not edit generated portal files. Cover obtaining Compose, exact `up`, editor, install prompt, activation, joint diagramming, persistence and operations.

Acceptance starts from clean Claude Code and Codex configuration. Prove plugin installation, credential-free MCP, actual activation, a first diagram and a subsequent human edit. Repeat setup with no duplicates. If activation requires another session, test/document the minimal transition rather than claiming transparency.

## Interfaces and affected modules

| Area | Planned changes |
| --- | --- |
| Compose/container launcher | Automatic build/init/default project, one app, persistent state and readiness. |
| Cloud entry point/config/principal/access | Explicit local actor, no verifier/issuer requirement, exact origin and feature policy. |
| Session response, room routes, frontend session | Local mode end to end; immediate editing without cookies/tokens. |
| MCP route/caller | Local Caller into shared handler, bypassing OAuth/token middleware locally. |
| Agent-plugin packaging and `skills/` | Client manifests, MCP-first skill, canonical references, sync/package tests. |
| Playground agent-setup UI/build | Local prompt/manifest/bundles and selected-project copy action. |
| Docs/integration harness | Bilingual guide, clean-client installation, native activation and shared-edit checks. |

## Risks / Trade-offs

- Local trust must not reach production: separate dependencies/configuration and regression tests enforce this.
- Client installation/activation differs by version: test each supported path and preserve continuation through any required reload.
- The existing skill assumes host CLI tools: generate an MCP-first entry that retains canonical references without requiring Node.
- Container/offline support needs actual verification: test Linux amd64 and Docker Desktop Windows/Linux containers; advertise other architectures only after testing.
- Rooms/files/blobs form one instance: capture complete quiesced state and prove fresh restore.

## Evidence and references

Repository sources: [local MCP decision](../../../docs/decisions/0073-local-mcp-server.md), [cloud guide](../../../docs/cloud.md), [agent guide](../../../docs/agents.md), [CLI setup prompt](../../../packages/cli/agent-setup/prompt.md).

Official sources read on 5 November 2026:

- [Cloudflare local development](https://developers.cloudflare.com/workers/local-development/).
- [MCP Streamable HTTP](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports).
- [OpenAI plugin packaging](https://developers.openai.com/plugins/build/plugins) and [Codex plugin activation](https://learn.chatgpt.com/docs/plugins).
- [Claude Code plugins](https://code.claude.com/docs/en/plugins) and [installation](https://code.claude.com/docs/en/discover-plugins).

Implementation and executed checks are recorded in validation.md. No production publication is implied.
