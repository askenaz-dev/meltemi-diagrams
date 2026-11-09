# Proposal

## Why

Choosing another diagram can leave the previous story on the shared canvas, so the file tree and the drawing disagree. Stories can be created but not deleted through the interface, and the timeline exposes duration changes only through small drag handles rather than an explicit scene-duration control.

This is a post-1.0 authoring correction outside `docs/roadmap-1.0.md`. It completes the existing story-editing workflow without changing the story language.

## What Changes

- Make navigation to a diagram or ordinary file end the story being displayed, including destination files without any stories, and clear playback when the active story disappears.
- Add deletion of one story from its explorer entry and the timeline, with confirmation, dependent-export handling and ordinary undo/redo; retain the file, its diagrams and its other stories.
- Add keyboard-accessible numeric timing controls for actions, transitions and the current scene. A scene's total duration changes through a final `hold`; timed content is never silently rescaled or removed.
- Show the minimum scene duration when an attempted total is shorter than its transition and timed actions; preserve source and input for correction.
- Preserve the distinction between viewing a story frame and editing its story source, with the same permission, revision and history rules in the browser and shared VS Code canvas.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `story-editing`: explicit playback clearing, story removal, safe scene timing and discoverable timeline editing controls.
- `project-explorer`: story-aware navigation and deletion of story entries without deleting their source files.

## Impact

`packages/edit` gains structured `removeStory` and `setSceneDuration` operations; `packages/editor` gains corresponding canvas actions and consistent empty-playback messages; `packages/canvas` gains deletion and numeric timing controls; `packages/playground` applies explicit navigation intent in the explorer. Browser and VS Code use the same timeline and edit operations. English and Spanish UI text, story guides and source-preservation tests change together. No dependency or mandatory cloud service is added.

## Non-goals

- The seven-entry creation catalogue belongs to `unified-diagram-creation`.
- Pointer and marquee selection of connectors belongs to `reliable-connector-selection`.
- Publication, deployment and infrastructure changes belong to `delivery`.
