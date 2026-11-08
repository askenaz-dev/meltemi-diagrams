# Copy the One prompt block

## Why

The hosted agent setup page asks people to paste its one-line prompt but offers only text
selection. The owner requested a copy icon at the top-right of that specific block. This is a
post-1.0 web-playground change outside the roadmap.

## What changes

- Add an accessible copy button to the One prompt block in English and Spanish.
- Copy only the prompt text, confirm success and offer selection when the clipboard is unavailable.
- Keep the page readable without JavaScript; enhance it with one small same-origin module.
- Permit that module in the setup page's CSP while retaining blocked inline scripts and connections.

## Capabilities

- Modified: `web-playground` (setup page assets and copy behavior), `playground-sea` (the page's
  sole copy enhancement alongside its unchanged still image).

## Impact

The build writes one additional asset. Existing prompt contents, CLI commands, agent setup
instructions and authentication stay as they are. No dependency or service is added.

## Non-goals

Changing the skill/MCP setup flow belongs to the agent-skill and agent-mcp changes. The owner
asked about that distinction; this UI change copies the existing prompt.
