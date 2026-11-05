# Spec Delta

## ADDED Requirements

### Requirement: Installable local diagramming plugins
The local distribution SHALL include genuine Claude Code and Codex plugin bundles containing supported client manifests, an MCP-first Meltemi skill with canonical references/examples and native Streamable HTTP configuration for the local endpoint without authentication. Installing only a skill or only an MCP URL SHALL NOT count as complete plugin setup.

#### Scenario: Complete package
- **WHEN** each client bundle is inspected and installed
- **THEN** it has the plugin identity, diagramming instructions/references and native local MCP entry, with no host Node, token or separate MCP process required

#### Scenario: Incomplete or drifting package
- **WHEN** a bundle lacks a manifest, MCP entry, skill/reference or differs from its canonical generated content
- **THEN** package validation fails before distribution

### Requirement: Local setup material matches the instance
The local app SHALL serve its install prompt, metadata and complete client plugin bundles under `/agent-setup/local/`. Metadata SHALL identify product version/revision, configured origin/MCP URL, default project/open URL, bundle URLs and hashes. Setup downloads SHALL require no external registry after image build.

#### Scenario: Read and install offline
- **WHEN** the agent fetches local setup metadata and its matching bundle with external egress blocked
- **THEN** the files are complete, match the running version/hash and point to this instance's host-visible endpoint

#### Scenario: Invalid bundle
- **WHEN** a bundle hash mismatches or an archive path escapes the installation destination
- **THEN** installation refuses it without altering existing client configuration

### Requirement: Setup prompt installs plugin and MCP
The local setup prompt SHALL detect the client, retrieve its bundle, use the supported local installation/registration mechanism and preserve unrelated configuration/approvals. It SHALL install both plugin and MCP rather than asking the person to assemble config. Repeating identical setup SHALL reuse it without duplicates; conflicting registrations SHALL be reported without silent replacement.

#### Scenario: Clean client setup
- **WHEN** the person gives the local prompt to an installed Claude Code or Codex client without Meltemi configured
- **THEN** the agent performs the supported plugin/MCP setup from local material without login, credential creation or manual token/config copying

#### Scenario: Repeat or conflict
- **WHEN** setup finds an identical plugin/endpoint or a conflicting Meltemi registration
- **THEN** it reuses the identical setup without duplicates or reports the conflict while preserving it and unrelated configuration

### Requirement: Verify activation before diagramming
Setup SHALL verify installed/enabled plugin state and actual native MCP tool availability before declaring success. If the client requires native trust, reload or a new session, instructions SHALL preserve the selected project and provide the exact continuation. Ad-hoc HTTP calls SHALL NOT be reported as plugin activation.

#### Scenario: Tools active
- **WHEN** the installed plugin's MCP is loaded in the supported client
- **THEN** setup verifies native initialization/tool discovery without credentials and starts the shared-project workflow

#### Scenario: Activation still pending
- **WHEN** installation succeeds but tools are unavailable until a client interaction/reload
- **THEN** it reports the required action and continuation accurately, without claiming active diagramming or repeating installation

### Requirement: Agentic diagramming in the local editor
The local plugin SHALL use the indicated project through MCP: read source/revision, write with revision/idempotency protection, validate, inspect a preview and return the editor URL. It SHALL treat subsequent canvas changes as source to read and preserve. It SHALL NOT substitute host-only diagram files or another preview/MCP server for joint editing.

#### Scenario: First joint diagram
- **WHEN** the plugin is active after the install prompt
- **THEN** it creates or edits a valid diagram in the indicated project, previews it and returns its local URL; a human canvas edit is visible in its next read

#### Scenario: Invalid source or moved revision
- **WHEN** validation fails or another participant changed the source revision
- **THEN** the plugin follows the shared diagnostic/conflict workflow before another write and preserves newer human changes
