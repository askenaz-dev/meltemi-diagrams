## Why

The public documentation still mixes installation and usage with repository-maintenance commands,
implementation notes and dated release claims. Users need current instructions and equivalent
English and Spanish guidance across every published page.

## What Changes

- Audit all 40 bilingual Diagrams documentation pairs against the current implementation.
- Use installed CLI commands and current installation, account, settings and administration paths.
- Keep normative language, public API, error and limit contracts while extracting private
  implementation, deployment and test material into internal documentation.
- Remove benchmark/report navigation from user guidance and describe useful limitations directly.
- Record a page-by-page source audit and meaningful verification, without claiming unperformed
  end-to-end checks.

This is a post-1.0 documentation change outside `docs/roadmap-1.0.md`.

## Non-goals

- Runtime feature changes belong to their product changes, including `central-admin-interface`,
  `local-mcp-server` and `ai-assistance`.
- Portal indexing/search and publication policy belong to Meltemi Web's documentation portal.

## Capabilities

### New Capabilities

- `current-user-documentation`: audited bilingual product guidance with executable installed-tool
  examples and a clear separation from maintainer documentation.

## Impact

Published Markdown and its Spanish counterparts, internal extracted documentation, documentation
checks and OpenSpec/QA evidence. No new dependency or runtime/API change.
