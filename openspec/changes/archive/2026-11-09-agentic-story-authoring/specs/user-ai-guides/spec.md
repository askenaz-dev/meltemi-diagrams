## MODIFIED Requirements

### Requirement: Choose AI workflow by task and project location

The English and Spanish documentation indexes SHALL expose a dedicated AI and agents section
near the getting-started links. The agents guide SHALL explain that the skill provides
instructions and MCP provides tools, that they can work together, and that neither supplies an AI
model. It SHALL distinguish repository files, folder-mode tools, account projects and the local
Docker workspace, with a useful outcome and setup path for each.

#### Scenario: A reader keeps diagrams in Git

- **WHEN** a reader follows the AI and agents guide to document repository code
- **THEN** the guide identifies skill plus CLI as sufficient without a Meltemi account and explains
  that optional folder MCP validates, inspects compiled story timelines and previews files edited by the agent's own tools

#### Scenario: A reader needs shared browser editing

- **WHEN** a reader wants the agent to edit the project open in the browser
- **THEN** the guide directs account projects to project MCP and Docker projects to the local
  plugin setup, without presenting a disk-folder server as a shared backend
