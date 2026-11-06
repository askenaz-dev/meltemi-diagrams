# Proposal: Preserve the chosen connection point in the preview

## Why

Dragging a connection from a side handle draws its temporary line from the element's centre.
The gesture records the chosen side, but the preview ignores it. The owner supplied a screenshot
of this defect. This is a post-1.0 correction outside `docs/roadmap-1.0.md`.

## What Changes

- Start a handle-drag preview at the chosen side's midpoint on the actual rendered outline.
- Respect rotation, zoom and pan using the existing shared geometry helpers.
- Preserve exact border-start attachments and existing committed-route behavior.
- Add real browser regressions that inspect the temporary line before pointer release.

## Capabilities

- Modify `diagram-canvas`: a connection gesture previews its selected source point.

## Non-goals

- Persistent routing-policy changes belong to `connector-routing`.

## Impact

`packages/canvas/src/app.ts` and the shared canvas browser harness under
`packages/vscode/test/webview/`. The same canvas serves the browser and VS Code.
