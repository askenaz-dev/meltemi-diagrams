## ADDED Requirements

### Requirement: Embeddable player
`@meltemi/diagrams-player` SHALL provide a `<meltemi-player>` element and `mountPlayer(element,
document, options)` that play a player document offline, drawing each frame with the same
functions as the command line and the canvas, so the frame at a time is identical everywhere. The
element SHALL keep its controls and styles in a shadow root and SHALL accept `autoplay`, `loop`,
`static` and `controls` options.

#### Scenario: Same frame everywhere
- **WHEN** the player shows the purchase story at 2.4 s
- **THEN** its SVG equals the one `meltemi-diagrams export --story purchase --at 2.4s --fonts system` writes

### Requirement: Controls
The player SHALL offer play and pause, a progress slider with the current and total time, previous
and next scene, a scene picker and a static view, each with an accessible name and a visible
focus, and keyboard control: Space or K to play and pause, Left and Right to step one second
(100 ms with Shift), Home and End, Page Up and Page Down (or P and N) for scenes, and S for the
static view. Playback SHALL stop at the end unless `loop` is set.

#### Scenario: Scene picker
- **WHEN** the user picks the scene `processing`
- **THEN** the player shows the story at 1.8 s and announces "Scene 2 of 2: processing"

### Requirement: Reduced motion and static view
The static view SHALL show each scene's final state without animation (for effects documents, the
drawing without effects). With `prefers-reduced-motion: reduce` the player SHALL start in the
static view and SHALL NOT autoplay; the user MAY switch to the animated view.

#### Scenario: Reduced motion
- **WHEN** a page with `autoplay` opens with reduced motion requested
- **THEN** the player shows the first scene's final state, paused, with the static view pressed

### Requirement: Text alternative
The player SHALL announce scene changes in a polite live region, name its frame with the story's
title and the current scene, and include a text summary that lists the scenes and their actions
with element labels.

#### Scenario: Summary
- **WHEN** the purchase story's summary is read
- **THEN** it lists "Reveal Cliente, API Gateway, Pedidos and PostgreSQL over 800 ms"
