## MODIFIED Requirements

### Requirement: Bilingual one-command guide

`docs/local-compose.md` and `docs/es/local-compose.md` SHALL resolve GitHub `latest`, clone its
published tag and run `docker compose up`, with prerequisites, working directory and editor URL.
They SHALL explain plugin/MCP setup, activation and joint editing. Indexes, cloud and agents
guides SHALL link them. The portal SHALL publish both guides at `/diagrams/local-compose/` and
`/es/diagrams/local-compose/` from release sources without generated-file edits.

#### Scenario: Follow either guide

- **WHEN** a person with the listed prerequisites follows either guide outside a source checkout
- **THEN** its commands resolve the latest published full release, clone that tag and start the editor,
  without a fixed version, drafts, prereleases or a fallback to main, and the guide explains
  how to install/activate the agent plugin and MCP without credentials or manual configuration

#### Scenario: Documentation drift

- **WHEN** a guide lacks its translation, has broken links/code or omits the plugin installation step
- **THEN** documentation validation fails
