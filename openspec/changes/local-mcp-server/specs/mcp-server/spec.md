## MODIFIED Requirements

### Requirement: The catalogue
`tools/list` SHALL answer twenty-seven tools, each with `name`, `title`, `description`,
`inputSchema`, `outputSchema` and `annotations`: `whoami`; four project tools; four file
tools; three version tools; `open_url`; `preview`; seven sharing tools; three live tools; three
publishing tools, named in the scenarios. Read tools SHALL carry `readOnlyHint`; the tools that
remove, restore, end or unpublish SHALL carry `destructiveHint`. The catalogue SHALL be defined
once, in `@meltemi/diagrams-mcp`, and served from that definition by the hosted endpoint and by
the command line's local server (`mdg mcp`), so that both list the same tools with the same words,
schemas and annotations.

#### Scenario: The names
- **WHEN** `tools/list` is called
- **THEN** it answers `whoami`, `list_projects`, `create_project`, `get_project`, `rename_project`, `read_files`, `write_files`, `validate`, `upload_image`, `list_versions`, `create_version`, `restore_version`, `open_url`, `preview`, `get_sharing`, `set_link_access`, `invite`, `list_invitations`, `revoke_invitation`, `set_member_role`, `remove_member`, `get_live`, `start_live`, `end_live`, `list_publications`, `publish` and `unpublish`

#### Scenario: The annotations
- **WHEN** the catalogue is read
- **THEN** `read_files` has `readOnlyHint: true`, `unpublish`, `restore_version`, `remove_member`, `revoke_invitation` and `end_live` have `destructiveHint: true`, and `create_project` has `idempotentHint: true`

#### Scenario: An unknown tool
- **WHEN** `tools/call` names `delete_project`
- **THEN** the answer is the JSON-RPC error `-32602` naming the tool

#### Scenario: Both servers list the same tools
- **WHEN** the catalogue test lists the tools of the endpoint's server and of `mdg mcp`, built from the same commit
- **THEN** the two lists are deeply equal, and the test names the first tool that differs when they are not
