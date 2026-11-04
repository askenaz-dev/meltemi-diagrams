# Spec Delta

## ADDED Requirements

### Requirement: The MCP in the skill and the agents guide
The skill SHALL carry a reference `mcp.md` that says how an agent connects to the endpoint
(`codex mcp add`, `codex mcp login`, or a `mdg_` token through `bearer_token_env_var`), lists
the tools and states the workflow: read, write with `ifRevision`, validate, preview, then
`open_url`; an `idempotencyKey` per change; never saying an email was sent; never printing a
token or a link that grants access. `docs/agents.md` SHALL say the same for people.

#### Scenario: The reference is synced
- **WHEN** `pnpm skills:sync` runs
- **THEN** `.claude/skills/meltemi-diagrams/references/mcp.md` and `.agents/skills/meltemi-diagrams/references/mcp.md` equal `skills/meltemi-diagrams/references/mcp.md`

#### Scenario: The size rule still holds
- **WHEN** the skill's front matter and size test runs
- **THEN** `SKILL.md` stays under its limit and names the new reference

#### Scenario: A tool missing from the reference
- **WHEN** the endpoint's catalogue has a tool the reference does not name
- **THEN** the skill test fails naming the tool
