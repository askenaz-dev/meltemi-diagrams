# Spec Delta

## MODIFIED Requirements

### Requirement: Documentation for agents
`docs/agents.md` and `docs/es/agents.md` SHALL hold the one-line prompt in a fenced block, the address `https://diagrams.meltemi.dev/agent-setup/prompt.md` and the page `https://diagrams.meltemi.dev/agent-setup/`, `skill prompt` for an agent without web access, what the skill teaches, how to install it with `skill install` (the agents table: name, agent, folder; the list; `--user`; `--force`; `npm install --global @meltemi/diagrams-cli`; and `npx @meltemi/diagrams-cli@latest skill install --agent <names>` where the command is not installed), by hand from the package's `skills/` folder, what the agent proves and must never do, and how to ask an agent to draw; `docs/cli.md` and its Spanish copy SHALL document `skill install` with the agents and `skill prompt`; `docs/web-app.md` and its Spanish copy SHALL list `agent-setup/` among what the build writes and the About dialog's link; the README's "For agents" section in both languages and the documentation index SHALL link the page and the hosted address; `docs/agents.md` SHALL be in the docs test's translated list; a test SHALL fail when the one-line prompt of the docs differs from the agent-setup page's.

#### Scenario: The page is reachable
- **WHEN** the documentation's link check runs
- **THEN** `docs/agents.md` is linked from `docs/README.md` and the README, and every link and anchor in it resolves

#### Scenario: A missing Spanish page
- **WHEN** `docs/agents.md` exists without `docs/es/agents.md`
- **THEN** the localized documentation test fails naming `docs/es/agents.md`

#### Scenario: The one-liner drifts
- **WHEN** a word of the one-line prompt changes in `docs/agents.md` and not in `packages/playground/agent-setup/en.html`
- **THEN** the agent-setup test fails naming the two files
