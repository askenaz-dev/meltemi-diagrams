# Finish agent setup with a useful default

## Why

The installation prompt asks which agents the project uses even when the current agent can
install its own skill. This interrupts setup before the promised validation and SVG export.

## What changes

Use the current agent unless the person names others, keep installation within the selected
project, and choose a small example without asking about routine decisions. Keep existing skill
copies and files, and ask only when a real blocker needs the person's decision. Update the hosted
prompt, both setup pages and both documentation copies together.

This is a post-1.0 documentation change outside the numbered roadmap.

## Non-goals

The separate local-mcp-server change owns local MCP server behavior.

## Impact

The CLI's packaged prompt and the playground's setup pages change. The installer command, flags
and its default of all folders when invoked without `--agent` remain the same.
