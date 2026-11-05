# Proposal: Local agentic diagramming with Docker Compose

## Why

A person should run `docker compose up`, open Meltemi and give Claude Code or Codex a setup prompt that installs the Meltemi plugin and connects its MCP. They then diagram together in the same local project, without an IDP, account, login, browser session setup or API token.

This is a post-1.0 change outside `docs/roadmap-1.0.md`. On 5 November 2026 the owner confirmed **one person and their agents on one computer**, and explicitly requested tokenless local operation with a prompt that installs **both the plugin and MCP connection**.

## What Changes

- Deliver a Compose application whose complete first-start command is `docker compose up`. It builds automatically when needed, initializes persistent storage and a default workspace, and prints the editor address and setup prompt. No host Node, environment-file editing or manual initialization is required.
- Serve editor, backend, WebSockets and Streamable HTTP MCP from one origin, defaulting to `http://127.0.0.1:8879`. Browser and agents use one stable local owner without credentials or authentication exchanges.
- Include a genuine installable Meltemi agent plugin: the diagramming skill/references and native MCP configuration for Claude Code and Codex. The local instance serves the matching bundles and instructions.
- Make the setup prompt install the plugin/MCP, preserve unrelated configuration, avoid duplicate registrations, verify activation and enter **agentic diagramming**. The user does not assemble client configuration or copy a token.
- Keep web and agents on the same source: agent edits update the open editor and visual edits are readable through MCP. Validation, revisions, idempotency and minimal edits remain intact.
- Persist projects, versions, binary assets and room state; document stop/restart and coherent backup/restore. After image build, Meltemi and plugin bundles operate without external services.
- Add an English/Spanish guide and copyable setup prompt to the docs and local app. The portal imports the guides from this repository's release.

## Capabilities

### New Capabilities

- `local-installation`: zero-configuration Compose lifecycle, loopback trust boundary, persistent single-owner workspace, shared web/MCP editing and bilingual operating guide.

### Modified Capabilities

- `cloud-service`: a separately selected local actor and exact origin policy; hosted authentication remains its own entry point.
- `cloud-accounts`: an immediately usable local workspace response/UI without account, session or token flows.
- `cloud-document`: durable API checkpoints and immediate local room updates, preserving the hosted WebSocket write budget.
- `agent-skill`: an actual local agent plugin bundling the skill and MCP, installed and verified through a setup prompt.

The shared MCP schemas and transport are reused. The local entry point supplies its owner directly rather than using hosted MCP authorization. Existing CLI-only skill installation remains a separate workflow.

## Non-goals

- Internet/LAN multiuser hosting, identity federation and invitations belong to hosted `cloud-accounts`, `sharing-and-permissions`, `live-collaboration` and Meltemi Web's `identity-service`.
- Public catalog hosting and public plugin/OCI marketplace distribution belong to `publishing` and `delivery`.

## Impact

- `packages/cloud`: local entry point/configuration, explicit local actor, default project, local MCP dispatch and feature policy; reuse storage, rooms and renderer.
- `packages/playground`: local workspace presentation, immediate editing and a “Set up my agent” prompt including the selected project.
- Agent-plugin packaging generated from canonical `skills/`, with client-specific manifests and local no-auth MCP configuration; setup instructions and bundles included in the image.
- Compose/container tooling, persistent state, integration tests, bilingual guides and documentation links.
- No IDP deployment, local session database, token management, production secrets or Terraform change.

## Review status

Implementation and local acceptance are recorded in [tasks.md](tasks.md) and [validation.md](validation.md). [design.md](design.md) defines installation and client-required activation. No production merge or deployment is implied by local validation.
