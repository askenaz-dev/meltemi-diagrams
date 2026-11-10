# Design

## Visual thesis and content

Treat the story panel as a compact editing workspace: a clear selected scene, restrained blue
selection, separate playback indications, grouped text-labelled actions and a reachable resize
edge. Keep the diagram as the main working surface. The scene selector names the editing target;
its timing/name fields edit that target even when several scenes share a timestamp or are active.

## Interaction

Selecting a scene pauses and seeks to its start, but its stable id remains selected independently
of the clock. Playback marks every active scene and identifies the dominant one without changing
the editing target. Selecting a clip selects its parent scene. Empty scenes remain selectable.

A horizontal separator resizes the panel with pointer or arrow keys, has an accessible name and
value, clamps to available space and persists only in host-local view state. Escape/pointer cancel
restores the previous height. Existing reduced-motion styling applies; no new decorative motion.

Both Add to scene and New scene show icon and text at ordinary widths and follow the same compact
policy on narrow widths. Replace the lower story-delete control with Delete scene. Confirm scene
removal and keep the story, including when its last scene is removed; an empty workspace offers
New scene. Story deletion is available in the explorer and beside the upper story selector,
including the shared editor host without a browser explorer. Reject stale confirmations.

Use `setStoryTitle {story,title}` and `setSceneTitle {story,scene,title}` to edit display names,
preserving identifiers and export references. `null` removes a custom title. The explorer offers
F2/Rename on stories; scene name editing is available next to the selected-scene control and on
its label. `removeScene {story,scene}` removes only its CST statement/comments. Normal inverse
plans provide exact undo. Parsed-error and stale revision/document guards prevent unsafe edits.

Every panel write requires playback revision/document to match the host. Block duplicate writes
until acknowledgement/rejection; unchanged same-revision refreshes keep pending state. Source
updates immediately disable stale controls before the matching playback arrives. Renames avoid
no-op writes. Selection follows ids after update and chooses a predictable neighbour on deletion.

Clamp end playhead and final tick geometry to the track. Selecting the final/empty scene must not
manufacture horizontal overflow or move source-caret focus to an unrelated target.

## Verification

Source/inverse fixtures cover rename/remove and comments. Browser tests cover consecutive empty
scenes, explicit selection during overlap, resize/cancel/keyboard and restoration, English/Spanish
labels, narrow layouts, stale playback between render and story messages, duplicate/late deletion,
upper-selector and explorer story removal and naming with undo. Shared hosts use the same controls.

See [decision 0077](../../../../docs/decisions/0077-concurrent-story-authoring.md).
