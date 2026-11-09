## Why

The owner cannot reliably select a connector by its body, particularly while moving dashes are enabled, and cannot use a selection rectangle to collect connectors crossing an area. Selecting a label or arrowhead works, but that is an accidental workaround for ordinary canvas interaction.

## What Changes

- Make the whole visible connector stroke selectable with a constant screen-space tolerance, including the gaps between moving dashes, without making decorative motion overlays capture input.
- Keep left-to-right rectangle selection as full containment and add an explicitly differentiated right-to-left crossing selection for the visible drawing. This is a proposed interaction improvement, separate from the reproduced moving-dash defect.
- Keep labels, endpoints, route handles, hidden layers, nested groups and transformed viewports working with the same selection, editing and undo model.
- Add browser regressions for body selection at the reported 49% zoom, animated connectors and both selection-rectangle directions, and document the two gestures in English and Spanish.

This is a post-1.0 usability correction outside `docs/roadmap-1.0.md`.

## Non-goals

- The creation catalogue belongs to `unified-diagram-creation`.
- Story navigation, deletion and timing controls belong to `story-editing-lifecycle`.
- Publishing, release activation and deployment belong to `delivery`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `diagram-canvas`: stable connector hit surfaces and explicit containment/crossing rectangle selection across the shared canvas hosts.

## Impact

`packages/canvas` owns the canvas-only hit surfaces, their screen-space reach, gesture feedback and input precedence. `packages/editor` owns the pure selection geometry and its internal selector interface. `packages/motion` supplies decorative classes whose noninteractive behavior must remain effective; globally enabling pointer events on motion is not an acceptable fix. Regression coverage belongs in the shared webview and playground browser suites, with pure geometry tests in the editor package and the editor guides in both languages. No source grammar, cloud permissions or account data changes are required.
