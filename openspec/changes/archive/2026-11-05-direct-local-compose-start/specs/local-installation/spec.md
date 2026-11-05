## MODIFIED Requirements

### Requirement: Bilingual one-command guide

`docs/local-compose.md` and `docs/es/local-compose.md` SHALL provide a complete copyable command
sequence to obtain a published local distribution, enter its folder and run `docker compose up`.
They SHALL state prerequisites and the editor address without requiring a visit to another page
to discover installation steps. They SHALL document the prompt installing plugin/MCP, client
activation and joint diagramming. Both indexes/cloud/agents guides SHALL link them. The existing
portal SHALL publish `/diagrams/local-compose/` and `/es/diagrams/local-compose/` from release
sources without generated-file edits.

#### Scenario: Follow either guide

- **WHEN** a person with Git and Docker follows either guide outside a source checkout
- **THEN** its commands obtain a published release and start the editor, and the guide explains
  how to install/activate the agent plugin and MCP without credentials or manual configuration

#### Scenario: Documentation drift

- **WHEN** a guide lacks its translation, has broken links/code or omits the plugin installation step
- **THEN** documentation validation fails
