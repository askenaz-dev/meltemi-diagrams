# Tasks

Implementation follows the checked items below; validation evidence is recorded in validation.md. Keep each item under approximately two hours;
split it if necessary. Include tests and EN/ES documentation with each behavior.

## 1. Immediate local workspace

- [x] 1.1 Add source-build Compose defaults, pinned image/runtime and readiness so exactly `docker compose up` serves the editor without host Node or configuration; verify a clean first start and clear failure for an occupied port. Add the initial bilingual guide.
- [x] 1.2 Add the separate local entry point, explicit local actor and default-project initialization; verify API/session/rooms/MCP use the same owner without credentials, no verifier/JWKS/session store is used, startup is idempotent and production cannot select local mode.
- [x] 1.3 Add frontend local-mode recognition and immediate default-project editing with no account/token/session UI; verify a clean browser can edit without cookies/login and the local label appears in both languages. Document the first usable workspace.

## 2. Tokenless MCP and shared editing

- [x] 2.1 Route local MCP directly through its local Caller, bypass hosted authorization and disable identity/token/CLI-login/OAuth routes and unsupported tools/actions; verify no challenge or external identity fetch and the 14 enabled/13 unavailable tool policy. Document availability.
- [x] 2.2 Verify exact Host/Origin boundaries, including absent Origin for native MCP, refusal of missing Origin on browser API/WS and foreign/null Origin, unsafe configuration, content/body/protocol limits and unavailable dev/scheduling triggers.
- [x] 2.3 Exercise a native Streamable HTTP client without credentials against the image: create/open/write, browser update, visual edit/read-back, invalid-write atomicity, stale revisions, idempotent retry and two agents on one project. Add the joint-edit guide section.

## 3. Prompt installs the actual plugin and MCP

- [x] 3.1 Generate Claude Code/Codex plugin variants from canonical content with MCP-first skills/references and native no-auth MCP entries; verify package/sync tests catch missing manifests, MCP config and reference drift, with no host CLI requirement.
- [x] 3.2 Serve the local prompt/manifest/versioned bundles and add the editor copy action with selected-project context; verify URLs/ports/hashes and default-project discovery, with side-effect-free repeated reads. Document the copy/paste setup flow.
- [x] 3.3 Implement/test the prompt's Claude Code installation path against a recorded supported version, using local bundle/native registration, minimal supported scope and real plugin/MCP activation; verify repeat setup, conflicts and preservation of unrelated configuration. Document any native reload/trust transition.
- [x] 3.4 Implement/test the corresponding Codex plugin/MCP installation and activation path against a recorded supported version; verify repeated/conflicting setup and exact continuation after any required interaction/new session. Document the tested path without claiming activation before tools exist.
- [x] 3.5 Run each activated plugin's first agentic diagramming flow: source/revision/write/validate/preview/open URL, human canvas edit and next agent read; verify no token request, host-only substitute or separate server, and update both guides from the result.

## 4. Persistence and delivery checks

- [x] 4.1 Complete persistent-volume/init/maintenance behavior; verify recreation preserves owner/default project, files, versions, room state and binaries, initialization failures preserve data and internal maintenance needs no exposed HTTP trigger. Document stop/restart.
- [x] 4.2 Add quiesced whole-instance backup/fresh-target restore helpers; verify matching sources/versions/room state/image hashes and refusal of malformed backups/nonempty targets. Document backup/restore and explicitly destructive reset.
- [x] 4.3 Add the Linux amd64 Compose CI smoke and record Docker Desktop Windows/Linux-containers acceptance; block egress after build and verify local startup, plugin downloads and edit/render flows. Register both guides/links and render the portal against the implementation worktree.
- [ ] 4.4 Run required typecheck/lint/test/build and cloud/playground browser suites plus the clean-client Compose/plugin scenarios; record evidence per spec scenario and tested client/platform versions. Advertise only verified install/activation paths and architectures.

## Workflow follow-up

- Review implementation evidence before merge; local validation does not publish the product or guide.
- Coordinate the integrated `local-mcp-server` archive without overwriting its artifacts.
- Archive through OpenSpec once implementation and checks complete, then verify both guide routes after release-based portal delivery.
