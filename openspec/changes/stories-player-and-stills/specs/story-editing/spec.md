# Spec Delta

## MODIFIED Requirements

### Requirement: Story edit operations
`setStoryTiming { story, path, durationMs }` SHALL set the time of the action at `path` (scene
index, then action indexes through `parallel` blocks), writing or replacing `over <n>ms`, the time of
`hold`, or the transition's `over`; `insertStoryAction { story, scene, action, targets,
durationMs? }` SHALL append an action to a scene; `removeStoryAction { story, path }` SHALL remove
one; `insertScene { story, id, title?, after? }` SHALL add a scene; `createStory { diagram, id?,
title?, scene? }` SHALL append `story <id> for <diagram> { scene <scene> { } }` after the last
top-level statement of the file, separated by a blank line, with `title "<title>"` inside when
given, `id` defaulting to the first of `story1`, `story2`… that no diagram, model, theme, story or
export profile of the file uses and `scene` to `scene1`; `diagram` SHALL be a diagram of the
file, of any profile, else `edit.unsafe-target`, and a given id that is not an identifier or is
taken SHALL be refused. Each SHALL keep comments and formatting and refuse results with new errors.

#### Scenario: Longer reveal
- **WHEN** `setStoryTiming` sets the first action of `overview` to 1200
- **THEN** the text reads `reveal client, api, orders, db over 1200ms`

#### Scenario: A story created
- **WHEN** `createStory { diagram: "checkout" }` runs on a file whose last statement is the
  `checkout` diagram and that has no story
- **THEN** the text ends with a blank line, `story story1 for checkout {`, an indented
  `scene scene1 {` and `}`, and `}`, and the result compiles with `story.empty-scene` as its only
  new diagnostic

#### Scenario: The next free id
- **WHEN** `createStory { diagram: "checkout" }` runs on a file with the story `story1` and the
  export profile `story2`
- **THEN** the new story is `story3`

#### Scenario: A diagram that is not in the file
- **WHEN** `createStory { diagram: "views.containers" }` names an imported diagram
- **THEN** the edit is refused with `edit.unsafe-target`, saying the story's diagram must be one
  of the file's

### Requirement: Story timeline in the editor
The canvas SHALL offer a story picker when the file has stories and, beside it, a **New story**
button whenever a diagram is shown or a story plays: it SHALL create a story for the diagram the
canvas shows (in story mode, the playing story's diagram) through `createStory`, enter story mode
on it with its empty scene and say in the status line that the story was created and that
selecting on the frame and **Add to scene** fill its scene; a read-only canvas SHALL not offer it.
In story mode it SHALL draw frames locally, read-only, with a timeline of scenes and actions,
play, pause and scrubbing; dragging the end of an action SHALL call `setStoryTiming`; **Add to
scene** SHALL insert the chosen action for the canvas selection into the current scene;
**Export scenes** SHALL ask the host for a picture of every scene of the story it plays (VS Code
asks SVG, PNG or PDF and writes beside the file; the web app opens its export dialog on the story
with **One picture per scene** checked); every change SHALL be a text edit, undone like any other.

#### Scenario: Drag a duration
- **WHEN** the end of the `hold 2s` bar is dragged to 3 s
- **THEN** the text reads `hold 3000ms`

#### Scenario: A new story from the canvas
- **WHEN** the canvas shows `checkout` and **New story** is pressed
- **THEN** the text gains `story story1 for checkout { scene scene1 { } }`, the canvas enters
  story mode on `story1` with one empty scene on the timeline, the picker shows it, and the status
  line says `story1` was created and what to add

#### Scenario: A second story while one plays
- **WHEN** `purchase` plays and **New story** is pressed
- **THEN** `story1` is created for `purchase`'s diagram and the canvas switches to it

#### Scenario: Read-only canvases do not offer it
- **WHEN** the canvas is read-only
- **THEN** there is no **New story** button, and **Export scenes** is still offered

#### Scenario: Export scenes in VS Code
- **WHEN** **Export scenes** is pressed in the timeline of `purchase` and PNG is picked
- **THEN** `purchase.purchase.overview.png` and `purchase.purchase.processing.png` are written
  beside the file
