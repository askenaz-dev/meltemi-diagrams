# Local Compose validation

Date: 5 November 2026, America/Santiago. Implementation base: `dc0a495`.

The distribution's default editor/MCP origin is `http://127.0.0.1:8879`; the container's private
listener is separate. No Meltemi identity service, browser session or agent API token is used.

## Executed checks

| Contract / task area | Check and result |
| --- | --- |
| One-command startup and default workspace | Actual Docker Desktop Linux/amd64 image built from source and started with Compose, with automatic schema initialization and a stable owner/default project. First use and restart need no `.env`, host Node or manual setup. |
| Local actor and production isolation | Cloud local/audit tests cover fixed Host/Origin, direct local principal, no verifier/auth exchange, unavailable identity/OAuth/token/debug routes and refusal of local setup on the hosted entry point. Cloud typecheck and 111 focused local/collection/audit tests passed. |
| Shared browser/MCP editing and transport | `pnpm local:test-browser` against Docker: all 27 tools exercised (14 core and 13 explicit feature refusals); native SDK without Cookie/Authorization; stateless headers; invalid writes, stale revisions, idempotency and version restore. Human text and canvas drag were read back through MCP; agent edits reached the browser. Uploaded image hash and SVG/PNG previews passed. |
| Plugin bundle/source integrity | Four package/setup tests passed: canonical references, native manifests, ZIP/CRC, per-instance addresses/hashes, selected project, local-only route and unsafe extraction rejection. No dependency or lockfile additions. |
| Claude Code installation/activation | Claude Code 2.1.312 installed/enabled the actual served plugin in disposable configuration, loaded its skill and connected its native MCP with 27 tools. Repeated setup is idempotent; unrelated settings, disabled entries and conflicts are preserved. |
| Codex installation/activation | Codex CLI 0.156.1 installed/enabled the served plugin. Native app-server verified its loaded skill, 27 MCP tools and actual create/read/write/validate/SVG/open-URL calls without a model. Disposable configuration only. |
| Real Claude agentic diagramming | An opt-in, bounded invocation with existing Claude CLI authentication and only the local plugin's MCP tools created a dedicated project, wrote a valid diagram, validated, previewed and returned its URL. The test project was removed. No credentials were read/copied and no normal client configuration was modified. Total model cost for the two bounded attempts was approximately USD 0.525. |
| Persistent state and quiesced backup | `node scripts/local/check-compose.mjs` passed real container restart and whole-instance backup/fresh-volume restore: default project, sources, versions, room state and binary hashes matched. A second container attempting backup while the app was running was refused by the shared kernel lock. Only dedicated test projects/restore volumes were removed. |
| Invalid operations and initialization | Eight operational tests passed, including a running-instance lock, nonempty restore target, malformed archive preservation and complete source/binary round trip. Valid-hash archives with incomplete metadata, a LAN origin or invalid version are refused before target writes. A native launch with unsupported instance metadata failed and preserved the metadata. |
| Local maintenance | Shared `maintainState` extraction retained hosted semantics. The local launcher dispatched it through DB/R2 bindings on the same `state/v3` resource root, with no public scheduling endpoint; actual native and container startup cleanup passed. |
| Offline after image build | A fresh image booted with Docker `--network none`, created/edited a project, validated it, rendered SVG/PNG and served both complete plugin bundles. This includes initial local schema/bootstrap and maintenance, not just a warmed instance. |
| Interface and docs | Playground browser suite: 126/126 passed. Docker EN/ES at 1280px and 412px: default project, local-only controls, nonempty selected-project prompt and clipboard passed with no horizontal overflow. The documentation portal imported the implementation worktree and built 392 pages, including both local guides. |
| General quality | `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm licenses:inventory --check` passed. Full unit run: 367 files, 10,537 tests passed and one skipped. `openspec validate local-compose --strict` passed. |

The local interface and documentation tests found and corrected a textarea initialization bug and a
mobile-header overflow before this record. The first complete unit run caught a test-only project
ID fixture length; the subsequent full run above passed. Final review also corrected selected-project
handoff links and rejected malformed backup metadata before restoring it.

## Hosted browser regression

The hosted suite was run independently with its own temporary D1/R2/rooms, identity stand-in and
copied assets. Two existing timing assumptions were observed: counting account rows while loading
skeletons were still visible, and starting to observe disconnection after the sockets had already
reconnected. Their failure screenshots were retained. The full run passed 103 checks; after fixing
those two test observations, a focused repeat passed both scenarios and the Worker-log check (3/3).
All 105 distinct checks were covered successfully. No product timeout or authorization rule was relaxed.

## Reproducible commands

From a clean checkout:

```text
docker compose up
pnpm local:test-browser
node scripts/local/check-compose.mjs
```

The browser/verification commands require the development toolchain; users need only Docker and
their already installed coding agent. The container-only offline proof is:

```text
docker run --rm --network none --entrypoint node <built-image-id> --conditions=@meltemi/diagrams-source scripts/local/check-offline.mjs
```

Optional native-client checks (no model for the first two):

```text
pnpm exec tsx --conditions=@meltemi/diagrams-source scripts/check-local-agent-plugins.ts
python scripts/check-local-agent-activation.py --origin http://127.0.0.1:8879
python scripts/check-local-claude-diagram.py --origin http://127.0.0.1:8879
```

The last command explicitly uses the installed Claude CLI's existing authentication and a bounded
model call. It never starts a Meltemi login.

## Evidence locations and limits

The real-runtime runner writes `.test-output/local-compose/acceptance.json`, its editor screenshot
and SVG/PNG. Lifecycle checks write `.test-output/local-compose-lifecycle/summary.json` and a
complete backup archive. Native client probes write temporary directories whose names begin
`meltemi-native-plugin-`, `meltemi-native-activation-` and `meltemi-claude-diagram-`. UI review
screenshots and the portal siblings mapping are retained under the workspace's external artifacts
directory. Generated evidence/archives are ignored by Git and contain no provider credentials.

Only Linux amd64 containers were advertised. Docker Desktop on Windows was exercised; native
arm64/macOS operation and hosted/remote agents accessing loopback were not claimed. Client-native
installation/trust/reload requirements remain explicit. Local validation does not publish a
release, alter Terraform or deploy the hosted service.
