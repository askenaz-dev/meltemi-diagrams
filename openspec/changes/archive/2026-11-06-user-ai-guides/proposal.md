## Why

The user documentation hides AI workflows among tool references and does not explain why a person
would install the skill, connect MCP or configure built-in assistance. People need to choose by
where their diagrams live and the outcome they want.

## What Changes

- Promote AI and agents to a dedicated section near the start of the English and Spanish index.
- Explain the distinct roles of the skill, MCP and built-in assistance with practical examples.
- Guide local repository, account-project and Docker workflows without confusing their storage,
  authentication or available tools.
- Remove contributor-only material from these user entry points while preserving source records
  in the repository.

This is a post-1.0 documentation change outside `docs/roadmap-1.0.md`.

## Non-goals

- Changes to agent tools, provider adapters and the hosted API belong to `agent-mcp`,
  `local-mcp-server` and `ai-assistance`.
- Portal route selection and deployment belong to Meltemi Web's documentation portal and delivery.

## Capabilities

### New Capabilities

- `user-ai-guides`: task-oriented bilingual entry points for skills, MCP and built-in assistance.

## Impact

Only `docs/README.md`, `docs/agents.md`, `docs/assist.md` and their Spanish copies change. No
dependency, runtime, model, account or public API change.
