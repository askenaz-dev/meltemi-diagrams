# player-runtime Specification

## Purpose
The embeddable HTML player of stories and effects: its controls, keyboard, static view, reduced motion and text alternatives.

## Requirements

### Requirement: Embeddable player
`@meltemi/diagrams-player` SHALL provide a `<meltemi-player>` element and `mountPlayer(element,
document, options)` that play a player document offline, drawing each frame with the same
functions as the command line and the canvas, so the frame at a time is identical everywhere. The
element SHALL keep its controls and styles in a shadow root and SHALL accept `autoplay`, `loop`,
`static`, `controls` and `interactive` options. With `interactive` (the default) the player SHALL
offer zoom and pan, hover cards, selection with a detail panel and drill-down as `viewer-interaction`
specifies, all drawn outside the frame's SVG, so the frame string is the same with and without
interaction; `interactive="false"` SHALL draw the frame and the playback controls only. The
player's shadow root SHALL declare the motion tokens `--meltemi-motion-fast` (120 ms),
`--meltemi-motion` (160 ms), `--meltemi-motion-slow` (220 ms), `--meltemi-ease` and
`--meltemi-ease-in`, overridable by the page, and SHALL zero them under
`prefers-reduced-motion: reduce`.

#### Scenario: Same frame everywhere
- **WHEN** the player shows the purchase story at 2.4 s
- **THEN** its SVG equals the one `meltemi-diagrams export --story purchase --at 2.4s --fonts system` writes

#### Scenario: Interaction never changes the frame
- **WHEN** the viewer zooms in, hovers `api`, selects it and opens the panel
- **THEN** `handle.svg` still equals the exporter's SVG for the same instant

#### Scenario: Not interactive
- **WHEN** a page holds `<meltemi-player interactive="false">`
- **THEN** no card, panel, ring or badge exists in its shadow root, the wheel and a drag change
  nothing, and the control bar has no zoom cluster

### Requirement: Controls
The player SHALL offer play and pause, a progress slider with the current and total time, previous
and next scene, a scene picker and a static view, each with an accessible name and a visible
focus, and keyboard control: Space or K to play and pause, Left and Right to step one second, `,`
and `.` to step 100 ms, Home and End, Page Up and Page Down (or P and N) for scenes, and S for the
static view. Playback SHALL stop at the end unless `loop` is set. When interactive the player SHALL
also offer a zoom cluster (zoom out, the zoom level, zoom in, fit) at the end of the control bar and
the keys `+`/`=`, `-`, `0`, `1`, Shift with an arrow (pan), ArrowUp and ArrowDown (walk the
items), Enter (select or open), Backspace (up) and Escape (close or clear). The control bar SHALL
be shown for every document; the playback controls SHALL be hidden when the document has nothing
to play. Keys typed inside the scene picker, the slider or a button SHALL stay theirs.

#### Scenario: Scene picker
- **WHEN** the user picks the scene `processing`
- **THEN** the player shows the story at 1.8 s and announces "Scene 2 of 2: processing"

#### Scenario: The fine step moved
- **WHEN** `.` is pressed while paused at 1.0 s, then Shift+Right
- **THEN** the time is 1.1 s after `.`, and Shift+Right pans the drawing without moving the time

#### Scenario: A static diagram shows the zoom cluster only
- **WHEN** a diagram without effects is mounted
- **THEN** the control bar shows zoom out, the level, zoom in and fit, and no play button or slider

#### Scenario: Keys inside a control stay its own
- **WHEN** `+` is typed while the scene picker has the focus
- **THEN** the picker handles the key and the zoom is unchanged

### Requirement: Reduced motion and static view
The static view SHALL show each scene's final state without animation (for effects documents, the
drawing without effects). With `prefers-reduced-motion: reduce` the player SHALL start in the
static view and SHALL NOT autoplay; the user MAY switch to the animated view. Under reduced motion
every viewer transition (cards, rings, badges, the panel, the trail and zoom changes) SHALL have
zero duration and a drill-down SHALL be a cut to the child view's frame.

#### Scenario: Reduced motion
- **WHEN** a page with `autoplay` opens with reduced motion requested
- **THEN** the player shows the first scene's final state, paused, with the static view pressed

#### Scenario: A drill-down is a cut
- **WHEN** reduced motion is requested and `shop` is opened in the `context` view of commerce
- **THEN** the `containers` view is drawn at once and the computed transition duration of the
  content layer is 0 s

### Requirement: Text alternative
The player SHALL announce scene changes in a polite live region, name its frame with the story's
title and the current scene, and include a text summary that lists the scenes and their actions
with element labels. When interactive it SHALL also announce the selected item ("Selected: API"), a
cleared selection, the focused item with its type word, "Opened <view>" and "Back in <view>" after
a drill-down and its reverse, and the zoom level after a key or button zoom, never after a wheel or
drag; the frame's name SHALL say that the drawing is interactive; the summary SHALL add an
**Elements** list whose entries select each element and say what it opens.

#### Scenario: Summary
- **WHEN** the purchase story's summary is read
- **THEN** it lists "Reveal Cliente, API Gateway, Pedidos and PostgreSQL over 800 ms"

#### Scenario: Elements list
- **WHEN** the summary of the `context` view of commerce is opened and "Commerce" is pressed
- **THEN** the entry reads "Commerce, opens containers", `shop` is selected and the panel opens

#### Scenario: The wheel is silent
- **WHEN** the drawing is zoomed with Ctrl and the wheel
- **THEN** the live region's text is unchanged

### Requirement: The Story picker
A story document with more than one story SHALL give the player a **Story** picker in its
control bar, before the scene picker, listing the stories by title (their id without one) in the
document's order; with one story there SHALL be no picker. Picking a story SHALL show its first
frame at time 0 (in the static view, its first scene's final state), stopped, keep the static view
and the viewport, fill the scene picker with its scenes and announce "Story: <title>" politely.

#### Scenario: Picking a flow
- **WHEN** a page holds a document with the stories `purchase` and `refund` and the viewer picks
  `refund` while `purchase` is playing at 2 s
- **THEN** the frame is `refund`'s at 0 ms, paused, the scene picker lists `refund`'s scenes, the
  live region says "Story: Refund" and the frame's name says the story and its first scene

#### Scenario: Keys inside the picker stay its own
- **WHEN** `+` is typed while the Story picker has the focus
- **THEN** the picker handles the key and the zoom is unchanged

#### Scenario: One story, no picker
- **WHEN** a page holds a document with one story
- **THEN** the control bar has no Story picker and the scene picker is as before

#### Scenario: In Spanish
- **WHEN** the same page has `lang="es"` and the viewer picks `refund`
- **THEN** the picker's name is "Historia" and the live region says "Historia: Refund"

### Requirement: The story shown first
The element attribute `story="<id>"` SHALL choose the story a document of several shows first,
and `ElementOptions.story` SHALL write it; an id that names no story of the document SHALL give
the first story, and the attribute SHALL change nothing on a document of one story.

#### Scenario: The attribute picks first
- **WHEN** a page holds `<meltemi-player story="refund">` with the purchase and refund document
- **THEN** the picker shows `refund` selected and the first frame is `refund`'s

#### Scenario: An unknown id
- **WHEN** a page holds `<meltemi-player story="tour">` with the same document
- **THEN** the player shows `purchase`, the first story, and the picker shows it selected

### Requirement: The summary of several stories
The text summary of a document with several stories SHALL list every story in the document's
order, each headed by its title (or id) and followed by its scenes and their actions as the
summary of one story lists them, and SHALL mark the story the player shows; the static view
SHALL show the chosen story's scenes.

#### Scenario: Summary of two stories
- **WHEN** the summary of the purchase and refund document is read while `refund` is shown
- **THEN** it has two headings, "A purchase" then "Refund", each with its scenes' lines, and the
  second carries `aria-current`

#### Scenario: Static view of the chosen story
- **WHEN** the static view is pressed while `refund` is shown
- **THEN** the frame is the final state of `refund`'s first scene and the scene picker still
  lists `refund`'s scenes

### Requirement: Focused fullscreen story presentation

The player SHALL expose an accessible fullscreen control for its own presentation surface,
restore layout/focus on exit and handle unsupported or denied requests gracefully. Optional
summary/detail content SHALL be independently configurable without disabling zoom/pan.

#### Scenario: Enter and leave fullscreen

- **WHEN** the fullscreen control is activated and Escape later exits
- **THEN** the player alone fills the viewport, enabled controls remain reachable and normal layout/focus returns

#### Scenario: Clean interactive presentation

- **WHEN** summary and details are disabled
- **THEN** their UI is absent while diagram navigation and fullscreen remain available
