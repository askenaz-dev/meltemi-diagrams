## MODIFIED Requirements

### Requirement: The MCP in the skill and the agents guide
The skill SHALL carry a reference `mcp.md` that says how an agent connects to the endpoint
(`codex mcp add`, `codex mcp login`, or a `mdg_` token through `bearer_token_env_var`), lists
the tools and states the workflow: read, write with `ifRevision`, validate, preview, then
`open_url`; an `idempotencyKey` per change; never saying an email was sent; never printing a
token or a link that grants access. The reference SHALL also say how to use the local server:
the person starts it with `npx -y @meltemi/diagrams-cli@latest mcp` (or `--folder` for a folder
with no account) and keeps it running, and the agent connects to `http://127.0.0.1:7373/mcp`
(`codex mcp add meltemi --url`, `claude mcp add --transport http`, Cursor's `mcp.json`). It SHALL
say that the local server serves the same tools and draws on the person's machine after
`mdg login`, and when to choose it: an agent that runs on the person's machine uses the local
server, a client that only reaches a URL on the internet uses the endpoint. `docs/agents.md`
SHALL say the same for people.

#### Scenario: The reference is synced
- **WHEN** `pnpm skills:sync` runs
- **THEN** `.claude/skills/meltemi-diagrams/reference/mcp.md` and `.agents/skills/meltemi-diagrams/reference/mcp.md` equal `skills/meltemi-diagrams/reference/mcp.md`

#### Scenario: The size rule still holds
- **WHEN** the skill's front matter and size test runs
- **THEN** `SKILL.md` stays under its limit and names the new reference

#### Scenario: A tool missing from the reference
- **WHEN** the endpoint's catalogue has a tool the reference does not name
- **THEN** the skill test fails naming the tool

#### Scenario: The local server's commands
- **WHEN** the skill test reads `reference/mcp.md` and `docs/agents.md`
- **THEN** both contain `npx -y @meltemi/diagrams-cli@latest mcp`, `http://127.0.0.1:7373/mcp` and `--folder`, and the test fails naming the file that lacks one
