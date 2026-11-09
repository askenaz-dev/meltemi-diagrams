# Concurrent story scenes

## Why

The owner explicitly requested two scenes active at the same time, configurable as sequential or
overlapping, with a configurable transition. The current compiler schedules every scene after
the preceding one and the evaluator assumes a single active scene.

## What changes

Add opt-in relative scene overlap, compose simultaneous actions with deterministic precedence,
and expose overlap/sequential and transition controls in the workspace. Preserve every existing
non-overlapping file and its rendering. Teach source edits, inspection, still exports and agent
guidance the same temporal model.

## Capabilities

- Modified: `story-language` — optional overlap header and timing validation.
- Modified: `story-timeline` — concurrent evaluation, transitions and directed scene stills.
- Modified: `story-editing` — reversible overlap and transition edits with timing constraints.

## Impact

Model, motion, editor, canvas, player navigation, scene export/inspection and bilingual references.
Additive language 0.2 syntax; no migration of existing files or changes to project configuration.
