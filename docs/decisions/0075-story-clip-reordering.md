# 0075 — Story clips reorder by insertion

## Context

Story authors can resize timeline actions but must change source to reorder them. The owner
requested dragging actions like video clips. Story semantics are sequential actions with
simultaneous parallel blocks, rather than an absolute multi-track scheduler.

## Decision

Dragging a top-level body inserts its action before/after a sibling in the same scene. Durations
and scene total remain unchanged, while sequential starts follow the new order. A labelled
parallel header moves its complete block; children retain simultaneous starts and independent
duration controls. View statements and transitions remain anchored. Keyboard/buttons use the
same reversible `reorderStoryAction` operation. The right duration handle remains distinct.

Preview without source writes and commit once against the captured document/revision. Preserve
comments and line endings, exact undo and selection identity after acknowledgement.

## Alternatives considered

Free `at` offsets require new language timing, lane packing, conflict and scene-duration rules.
Rewriting source into implicit holds/nested blocks would obscure authorship. This change offers
insertion-style ripple ordering explicitly; neither alternative is implied by the gesture.

## Consequences

The operation works identically in both editor hosts and leaves existing files and language
semantics intact. Arbitrary timestamp placement, cross-scene moves and extracting parallel
children remain separate design work. Tests cover lossless source edits and actual gestures,
including abandoned, rejected and stale operations.
