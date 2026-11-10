# Reorder story actions by dragging their clips

## Why

The timeline can resize an action but dragging its body only selects it. Authors must edit
source to change a scene's sequence. The owner requested a proposal followed by implementation
of moving and reordering actions within a scene, like clips in a video editor.

## What changes

Add insertion-style, ripple reordering: drag a clip body before or after another action in its
scene, preserving every duration and recalculating sequential starts. Show the destination and
new start before a single reversible source edit. Keep the right duration handle distinct.

Represent a top-level `parallel` block as a labelled movable group; its children remain
simultaneous and individually resizable. Keep view changes and transitions anchored. Offer
keyboard and button alternatives, cancellation and current-document/revision guards.

This is discrete sequence editing, not arbitrary timestamp placement or overlapping clips.
Those require a separate language contract. No language, account, sharing or project-settings
change is needed. Do not use the owner's private DEV/PROD project as a test fixture.

## Capabilities

- Modified: `story-editing` — lossless source reorder operation and shared timeline gestures.

## Impact

Shared edit planner, canvas protocol/session, canvas timeline, English/Spanish labels, story
guides and real browser/extension regressions. Both editor hosts use the same implementation.
