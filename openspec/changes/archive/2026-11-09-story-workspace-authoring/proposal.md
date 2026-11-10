# A controllable story workspace

## Why

The owner reported ambiguous scene selection, a fixed-height panel, mismatched add buttons,
an incorrectly placed story-delete action, stale-story errors and missing human-readable names.
Empty scenes share a timestamp, so selection cannot be inferred from the playhead.

## What changes

Give the author an explicit selected scene, a labelled selector and distinct selected/playing
states. Allow resizing the panel with pointer and keyboard. Make both add controls consistently
labelled. The panel removes its selected scene; story deletion belongs to the upper story selector
and the explorer. Both the story panel and explorer support story display names.
Allow editing story/scene display titles with undo. Guard all panel writes against stale playback,
navigation and pending edits. Keep end ticks and playhead inside their track bounds.

## Capabilities

- Modified: `story-editing` — scene removal and display-title operations.
- Modified: `diagram-canvas` — selected scene, panel size and stable authoring controls.
- Modified: `project-explorer` — story title editing and safe story deletion.

## Impact

Shared canvas/editor/edit packages, browser explorer, bilingual controls and guidance, unit and
real browser/VS Code regressions. No private project, account, dependency or project-settings edit.
The previous clip-reorder implementation is retained; its baseline is saved in local artifacts.
