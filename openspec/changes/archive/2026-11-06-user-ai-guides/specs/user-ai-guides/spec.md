## ADDED Requirements

### Requirement: Choose AI workflow by task and project location

The English and Spanish documentation indexes SHALL expose a dedicated AI and agents section
near the getting-started links. The agents guide SHALL explain that the skill provides
instructions and MCP provides tools, that they can work together, and that neither supplies an AI
model. It SHALL distinguish repository files, folder-mode tools, account projects and the local
Docker workspace, with a useful outcome and setup path for each.

#### Scenario: A reader keeps diagrams in Git

- **WHEN** a reader follows the AI and agents guide to document repository code
- **THEN** the guide identifies skill plus CLI as sufficient without a Meltemi account and explains
  that optional folder MCP only validates and previews files edited by the agent's own tools

#### Scenario: A reader needs shared browser editing

- **WHEN** a reader wants the agent to edit the project open in the browser
- **THEN** the guide directs account projects to project MCP and Docker projects to the local
  plugin setup, without presenting a disk-folder server as a shared backend

### Requirement: Explain built-in assistance as reviewable user tasks

The English and Spanish assistance guides SHALL lead with concrete generate, modify, relations
and explain tasks, identify CLI and VS Code support, explain the separate provider setup and
link to the external-agent guide. They SHALL show a first request and review/apply flow using
installed CLI commands and retain data disclosure, partial acceptance and validation behaviour.

#### Scenario: A reader wants a small diagram change

- **WHEN** the reader follows the first modification example with a configured provider
- **THEN** the guide describes a saved proposal, review and explicit selection of items to apply

#### Scenario: A proposed edit adds errors

- **WHEN** assistance proposes a result with errors the current source does not have
- **THEN** the guide states that no source is written

### Requirement: User entry points contain user material

The AI guides and documentation index SHALL omit contributor-only synchronization instructions,
decision indexes, release procedures, pilot protocols and acceptance-run references. Existing
decision records SHALL remain in the source repository.

#### Scenario: A reader opens the index

- **WHEN** the reader browses user topics and updates
- **THEN** links explain use, compatibility, performance and changelog without a contributor
  section directing them to architecture decision records
