# Proposal

## Why

New project exposes richer starting points than New diagram. The explorer and shared canvas both hard-code only flow, free, sequence and Gantt, so a person cannot discover C4, whiteboards or Kanban inside an existing project even though the project can contain all of them. This was observed during a generic architecture workshop on 9 November 2026.

This is a post-1.0 authoring improvement outside `docs/roadmap-1.0.md`, building on the existing project explorer and diagram-creation capabilities.

## What Changes

- Offer one ordered catalogue in every New diagram entry point: Flow, Sequence, C4 architecture, Gantt, Whiteboard, Kanban and Free composition.
- Make the catalogue independent of the project's initial template, the active diagram and whether the workspace is local or cloud-backed. Read-only workspaces keep their existing editing restrictions.
- Describe the intended result in English and Spanish instead of exposing a bare grammar-kind selector. Whiteboard and Kanban remain free diagrams; C4 creates a model and an initial context view.
- Use shared starter definitions and a structured, atomic source edit for both adding a new file in the explorer and adding a diagram to the active file from the canvas.
- Preserve the existing project's files, settings, permissions, source comments and diagrams. A starter is added to the current workspace; it never replaces the project or its manifest.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `project-explorer`: the same seven starting points are available from New diagram in every project and folder, creating one new `.meltemi` file.
- `diagram-canvas`: the shared canvas uses the same catalogue for an empty file and its New diagram menu, including the VS Code host.
- `source-editing`: atomic, validated creation from a named starter with collision-free ids and exact undo.

## Impact

`packages/edit` will own the starter identities and structured generation; `packages/editor` will expose them through the canvas protocol and session; `packages/canvas` and `packages/playground` will render the common catalogue and translated descriptions. The change needs focused source-editing, protocol and explorer tests plus webview and browser acceptance in both languages. It adds no dependency, service, cloud permission or diagram-language profile.

## Non-goals

- Story navigation, deletion and scene-duration controls belong to `story-editing-lifecycle`.
- Connector hit testing, animated strokes and area selection belong to `reliable-connector-selection`.
- Merging, publishing and production verification belong to the delivery change.
