# Spec Delta

## Purpose

A persistent single-owner Diagrams workspace started with one Docker Compose command, shared by the local browser and agents without identity services or authentication setup.

## ADDED Requirements

### Requirement: One-command startup
The distribution SHALL start with `docker compose up`, building automatically if needed and initializing persistent state. It SHALL require no host Node, environment-file edits, manual schema command, IDP, account or credentials. Readiness SHALL become healthy only when the editor, backend and MCP are usable, and startup SHALL print the editor address and agent-install prompt.

#### Scenario: Clean first start
- **WHEN** the person runs exactly `docker compose up` in a clean supported distribution
- **THEN** it builds/starts as needed and offers an editable local workspace and plugin/MCP setup prompt without further setup commands

#### Scenario: Startup failure
- **WHEN** initialization fails or the configured port cannot bind
- **THEN** it reports an actionable error, never reports healthy and preserves existing data

### Requirement: One stable default workspace
Initialization SHALL create one stable local owner and default project exactly once. The browser SHALL open that project immediately, and startup metadata SHALL identify it for agents. Reading setup instructions or metadata SHALL NOT create projects. A copied prompt from an open project SHALL identify that selected project instead.

#### Scenario: Browser and two agents start
- **WHEN** a browser and two agents use a new ready instance and fetch its setup metadata concurrently
- **THEN** they discover the same default project and no duplicate owner/project is created

#### Scenario: Selected project
- **WHEN** the person copies the setup prompt while another project is open
- **THEN** the installing agent receives that project's identifier and local open URL

### Requirement: Tokenless local access
Browser, API, WebSocket and MCP SHALL use the same stable local actor without login, session cookies, API keys or bearer tokens. MCP SHALL NOT issue an authentication challenge, invoke OAuth or require a session credential. Hosted authentication SHALL remain isolated from this behavior.

#### Scenario: Local tools without credentials
- **WHEN** a native MCP client initializes, lists tools and edits its project with no Authorization or Cookie
- **THEN** the operations succeed under the local actor, without token prompts, login, `401` or authentication redirects

#### Scenario: Unsupported local authorization route
- **WHEN** a caller requests local OAuth authorization/registration/token/discovery
- **THEN** it receives JSON `409 local.feature-unavailable`, no grant/credential is created and no external metadata request occurs

### Requirement: Host and browser boundaries
The app SHALL publish only on host loopback, use a fixed configured origin, and refuse unknown Hosts before resolving the local actor. Browser mutations and room handshakes SHALL require exact Origin; native MCP SHALL allow Origin to be absent and reject foreign/null Origins. Local test/debug and scheduling HTTP triggers SHALL be unavailable.

#### Scenario: Valid local clients
- **WHEN** the editor uses its exact origin and native MCP omits Origin on the configured Host
- **THEN** both use the same workspace and project URLs are usable from the host browser

#### Scenario: Foreign or missing browser Origin
- **WHEN** a browser mutation/room handshake has absent, foreign or null Origin, or MCP has a present foreign/null Origin
- **THEN** it is refused before effects

#### Scenario: Unsafe configuration or Host
- **WHEN** configuration exposes a public/LAN/wildcard origin or a request supplies an unknown Host
- **THEN** startup or the request fails before workspace access; DEV request-derived origin behavior is never used

### Requirement: Shared editing and validation
Local MCP SHALL reuse the shared tools and authoritative room/project source used by the editor. It SHALL preserve validation, revisions, idempotency and minimal text edits. Agent changes SHALL appear in the open editor without reload, and human visual edits SHALL be available to agents through `read_files`.

#### Scenario: Diagram together
- **WHEN** the activated agent plugin writes a valid diagram, the person edits its canvas and the agent reads again
- **THEN** both see the same source and diagram, with comments/formatting outside changes preserved

#### Scenario: Invalid or conflicting write
- **WHEN** an agent writes invalid source or uses a stale revision
- **THEN** the existing diagnostic/conflict is returned without partial modification or silent overwrite

#### Scenario: Idempotent retry
- **WHEN** a successful operation is repeated with the original idempotency key
- **THEN** the existing replay contract applies without duplicate edits

### Requirement: Shared MCP transport and local feature policy
Local MCP SHALL keep stateless Streamable HTTP, shared schemas, protocol negotiation, no issued MCP session ID and existing method/body/render/rate limits. Fourteen core tools SHALL operate locally. The thirteen sharing/live-guest/publishing tools SHALL return `local.feature-unavailable` before effects; equivalent HTTP/UI actions SHALL be unavailable.

#### Scenario: Discover capabilities
- **WHEN** the plugin initializes and lists tools
- **THEN** it receives shared schemas and instructions naming enabled local features, with ordinary person-agent room synchronization available

#### Scenario: Unsupported tool or transport input
- **WHEN** a caller invokes a disabled feature, unsupported protocol/method or excessive payload
- **THEN** it receives the corresponding local-feature or shared transport refusal and no project changes

### Requirement: Persistent and local operation
Restarting/recreating containers SHALL preserve owner, default project, files, versions, binary assets and room state. After image build, startup, plugin-bundle retrieval, editing, synchronization and SVG/PNG preview SHALL work with external egress blocked. Initialization SHALL be serialized and fail readiness rather than resetting data.

#### Scenario: Restart without external services
- **WHEN** a populated instance is recreated with external egress blocked
- **THEN** it returns to the same workspace, serves plugin bundles and edits/previews with bundled fonts/icons and local images

#### Scenario: Interrupted initialization
- **WHEN** interrupted initialization is retried
- **THEN** it creates no duplicate owner/default project and preserves previous source/assets

### Requirement: Coherent instance operations
The distribution SHALL preserve data on ordinary stop, run required maintenance through internal dispatch and provide a documented quiesced whole-instance backup/restore. Restore SHALL verify metadata, work only into a fresh target and preserve its source archive. Invalid backups or nonempty targets SHALL fail without overwriting data.

#### Scenario: Proven restore
- **WHEN** a complete backup is restored into a fresh instance
- **THEN** owner/default project, sources, versions, room state and binary hashes match

#### Scenario: Refused restore
- **WHEN** the backup is malformed/incompatible or the target contains data
- **THEN** restore reports the reason and leaves source/target intact

### Requirement: Bilingual one-command guide
`docs/local-compose.md` and `docs/es/local-compose.md` SHALL document `docker compose up`, editor access, the prompt installing plugin/MCP, client activation and joint diagramming. Both indexes/cloud/agents guides SHALL link them. The existing portal SHALL publish `/diagrams/local-compose/` and `/es/diagrams/local-compose/` from release sources without generated-file edits.

#### Scenario: Follow either guide
- **WHEN** a person follows either language's guide on a supported platform
- **THEN** they can start Meltemi and install/activate their agent plugin and local MCP without credentials or manually constructing configuration

#### Scenario: Documentation drift
- **WHEN** a guide lacks its translation, has broken links/code or omits the plugin installation step
- **THEN** documentation validation fails

### Requirement: Operating boundaries explained
Both guides SHALL explain local trust, initial downloads versus offline runtime, the separate agent/model, explicit import/export rather than automatic Git-folder synchronization, stop/restart, backup/restore and destructive reset. Any native client reload/install interaction SHALL be documented without implying transparent activation.

#### Scenario: Stop or reset
- **WHEN** the person reads the operations guide
- **THEN** ordinary stop preserves storage and volume deletion is labeled as destructive before its command

#### Scenario: Understand the workspace
- **WHEN** the person reads the local workflow
- **THEN** it states that the plugin/MCP edits backend projects, local processes share access and hosted guest/publication features are unavailable
