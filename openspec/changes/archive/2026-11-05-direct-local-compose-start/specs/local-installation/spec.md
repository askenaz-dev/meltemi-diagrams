## MODIFIED Requirements

### Requirement: Bilingual one-command guide

`docs/local-compose.md` and `docs/es/local-compose.md` SHALL give copyable commands to clone a
published release, enter its folder and run `docker compose up`, with prerequisites and editor
URL. They SHALL explain plugin/MCP setup, client activation and joint editing. Indexes, cloud
and agents guides SHALL link them. The portal SHALL publish both guides from release sources at
`/diagrams/local-compose/` and `/es/diagrams/local-compose/` without generated-file edits.

#### Scenario: Follow either guide

- **WHEN** a person with Git and Docker follows either guide outside a source checkout
- **THEN** its commands obtain a published release and start the editor, and the guide explains
  how to install/activate the agent plugin and MCP without credentials or manual configuration

#### Scenario: Documentation drift

- **WHEN** a guide lacks its translation, has broken links/code or omits the plugin installation step
- **THEN** documentation validation fails
