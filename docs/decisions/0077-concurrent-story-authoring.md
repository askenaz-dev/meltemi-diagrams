# 0077 — Explicit scene authoring and concurrent presentation

## Context

The owner needs identifiable scenes, resizable settings, editable names and predictable deletion.
Deriving selection from the clock fails for empty and overlapping scenes. Sequential scheduling
also prevents the requested simultaneous scenes, while direct HTML download bypasses content choices.

## Decision

Keep editing selection by stable scene id independently of playback. Expose local panel resizing,
display-title edits and lower-panel scene removal; keep story removal by the upper selector and
in the explorer. All panel writes require matching source/playback revisions and documents.

Add opt-in `overlap <time>` before scene actions, bounded by adjacent durations. New concurrent
claims use later-scene priority and start-anchored interpolation; overlapping transitions blend
while actions run. Preserve the legacy evaluator for histories without overlap. Directed stills
exclude later scenes, and all consumers use the same schedule. This is additive in language 0.2.

Open the HTML export chooser for the selected story, with independent presentation extras and
fullscreen on the player's surface. Keep programmatic defaults compatible and navigation
independent of optional details. Browser presentation defaults to a clean diagram with controls.

## Alternatives considered

Absolute scene offsets add an arbitrary scheduler beyond the requested adjacent overlap control.
Inferring selection from time cannot disambiguate zero-duration scenes. Renaming identifiers would
unnecessarily change references. Merely hiding export panels leaves unused detail payloads and
does not provide export choices. Disabling all interaction would also disable useful zoom/pan.

## Consequences

The source remains authoritative, reversible edits preserve comments/references, and old valid
files keep their output. Concurrent claims need explicit precedence and causal interpolation,
with tests shared by the canvas, player, exports and inspection. Panel size is local view state;
no account, private project or project configuration change is needed.
