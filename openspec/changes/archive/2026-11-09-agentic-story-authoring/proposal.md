# Proposal

## Why

Agents can already author stories by editing source and preview individual instants, but cannot inspect the compiled scene timeline through MCP. The skill also lacks a complete revision-safe story-editing recipe and the hosted acceptance suite does not exercise that journey. A plausible final frame alone does not prove correct timing or preservation of a person's edits.

This is a post-1.0 authoring improvement outside `docs/roadmap-1.0.md`.

## What Changes

- Add read-only `inspect_story` to hosted, local-account and folder MCP servers, returning the compiled story timeline and diagnostics at the inspected snapshot.
- Return ordered scenes, their views and start/end/duration, transition and nested action intervals, and useful scene-preview times using the existing deterministic timing engine.
- Teach safe creation, insertion, reordering, deletion and timing edits, whole-project validation and previews at multiple compiled instants.
- Add an end-to-end acceptance journey for authoring, concurrent human edits, timing inspection, boundary previews and scoped deletion.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-skill`: a complete source-first story-authoring and verification workflow.
- `mcp-previews`: read-only inspection of compiled story timing across all MCP hosts.
- `mcp-acceptance`: agentic story lifecycle coverage with conflict and preservation checks.
- `mcp-server`: catalogue grows to twenty-eight tools with read-only story inspection.
- `local-installation`: fifteen core local tools, including story inspection.
- `user-ai-guides`: folder tools inspect compiled story timelines alongside validation/previews.

## Impact

Changes touch `packages/mcp`, cloud renderer RPC and MCP handlers, local CLI MCP handlers, the acceptance suite and canonical skill references/copies. No new dependency, account authority or scene grammar is introduced.

## Non-goals

- Story UI navigation, deletion and numeric controls belong to `story-editing-lifecycle`.
- Creation catalogue and connector selection belong to `unified-diagram-creation` and `reliable-connector-selection`.
- Publication, deployment and production verification belong to `delivery`.
