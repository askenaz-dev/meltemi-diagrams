# story-editing Specification

## Purpose
Editing stories from the text, the language services and the canvas timeline: timing, actions and scenes as text edits, renames and removals that reach story targets across files, and the read-only story mode of the canvas.

## Requirements

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

`removeStory { story, cascade }` SHALL remove exactly the named story and its internal statements.
It SHALL leave its source file, diagrams, other stories and unrelated comments intact and return an
inverse that restores the original source exactly. A missing story SHALL be `edit.unsafe-target`.
An export profile targeting the story SHALL be listed as a dependent with `edit.has-dependents`
when `cascade` is false; with `cascade` true the same edit SHALL remove exactly those profiles
with the story and restore them in its inverse.

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

#### Scenario: One story removed and restored
- **WHEN** `removeStory { story: "tour", cascade: false }` runs on a file with a diagram and two
  stories, with no export profile targeting `tour`
- **THEN** only `tour` and its internal content are removed, and applying the inverse restores the
  source byte for byte

#### Scenario: A story with an export profile
- **WHEN** `removeStory` names `tour`, `export film for tour` exists and `cascade` is false
- **THEN** the edit is refused with `edit.has-dependents`, the dependent profile is listed and the
  source does not change

#### Scenario: Explicit cascade
- **WHEN** the caller confirms removing `tour` and its dependent profile and sets `cascade` true
- **THEN** the story and that profile are removed in one reversible edit, while other profiles stay

#### Scenario: A missing story
- **WHEN** `removeStory` names a story absent from the file
- **THEN** the operation is refused with `edit.unsafe-target` and no source changes

### Requirement: References in stories
Renaming an element SHALL rename it in the stories of the file and, in a project, in stories of
other files that import its diagram. Removing an element SHALL list its story references among its
dependents and remove them, removing an action whose last target goes. References and definition
SHALL lead from a story target to the element.

#### Scenario: Rename reaches the story
- **WHEN** `db` is renamed to `store` in `checkout`
- **THEN** the story reads `reveal client, api, orders, store over 800ms`

### Requirement: Story language services
Completion SHALL offer story statements, actions, transition kinds and the ids of the scene's view;
hover SHALL document every statement; the outline SHALL list stories and their scenes.

#### Scenario: Targets
- **WHEN** completion runs after `reveal ` in a scene of a story for `checkout`
- **THEN** it offers the elements and named relations of `checkout`

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

The timeline SHALL expose the selected scene's total duration and minimum content duration, and
numeric duration fields for a selected timed action or non-cut transition. Scene-total edits SHALL
use `setSceneDuration`; action and transition edits SHALL use `setStoryTiming`. Fields SHALL be
labelled in the interface language, keyboard accessible, show seconds and submit milliseconds.
Enter or blur SHALL commit a valid draft once; Escape SHALL cancel it. Invalid input SHALL retain
the draft with a reason and change no source. Drag handles SHALL remain available; pointer cancel
SHALL restore the duration preview and write nothing. A parallel block's duration SHALL remain
derived from its children, and a cut transition SHALL remain zero-duration.

A writable timeline SHALL offer **Delete story** with confirmation naming that story and any
dependent export profiles before removal; cancel SHALL change nothing. Read-only canvases SHALL
permit playback, scrubbing and exports but SHALL offer no story deletion or timing writes.

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
- **THEN** there is no **New story** or **Delete story** button and no timing write control, and
  **Export scenes** is still offered

#### Scenario: Export scenes in VS Code
- **WHEN** **Export scenes** is pressed in the timeline of `purchase` and PNG is picked
- **THEN** `purchase.purchase.overview.png` and `purchase.purchase.processing.png` are written
  beside the file

#### Scenario: Numerical action timing
- **WHEN** a selected camera action is changed from 0.8 seconds to 1.25 seconds and Enter is pressed
- **THEN** exactly one reversible edit sets its duration to 1250 ms and the timeline and total update

#### Scenario: Invalid numerical timing
- **WHEN** a duration draft is negative or not a finite number and the user commits it
- **THEN** the field keeps the draft with a reason and neither source nor history changes

#### Scenario: A cancelled drag
- **WHEN** a duration handle is dragged and the pointer operation is cancelled
- **THEN** the original bar width returns and no duration edit is submitted

#### Scenario: Cancel deletion
- **WHEN** Delete story is chosen for `tour` and the confirmation is cancelled
- **THEN** `tour`, its profiles, playback and source remain unchanged

### Requirement: Explicit story playback lifecycle
Canvas-session state SHALL report an empty story choice list and null playback for a document
without stories. A missing active story SHALL end playback, including deletion through undo or a
remote edit. Exiting SHALL clear the timeline, story selection and story badge and show the current
document's diagram or ordinary empty state.

#### Scenario: A destination without stories
- **WHEN** the shared canvas is displaying a story and the next document has one diagram and no stories
- **THEN** the host sends null playback and an empty choices list and the canvas displays the new diagram

#### Scenario: The last story disappears
- **WHEN** the active story is the last story of its file and disappears through deletion, undo or a remote edit
- **THEN** playback stops and the canvas shows the remaining local diagram or the file's empty state

### Requirement: Playback refresh belongs to its document
Normal recompilation SHALL preserve a selected story that still exists. Temporarily invalid
source SHALL retain its last valid frame with stale feedback. A delayed message from a previous
document SHALL NOT replace the current document's playback state, even when ids and revision numbers
match.

#### Scenario: A present story has invalid source
- **WHEN** typing makes the selected story temporarily undrawable but the story still exists
- **THEN** its last valid frame stays with stale feedback and no navigation or source rewrite occurs

#### Scenario: A late message from the previous document
- **WHEN** another file is open and a playback message from the previous file arrives with matching story id and revision
- **THEN** the current file and playback state remain unchanged

### Requirement: Scene duration through its ending pause
`setSceneDuration { story, scene, durationMs }` SHALL set the scene's total, including transition,
by changing its final top-level `hold` or appending one. The content minimum SHALL use compiled
sequential and parallel timing. A total equal to that minimum SHALL zero an existing ending hold
or be a no-op without one. It SHALL NOT rescale, reorder or remove timed content. The ordinary
compiler SHALL update later scene starts, playback and exported frame timing.

#### Scenario: Increase a final pause
- **WHEN** a scene has 2 seconds of timed content followed by `hold 1s` and its total is set to 4 seconds
- **THEN** only the ending hold changes to 2000 ms, the total is 4 seconds and undo restores the original text

#### Scenario: Parallel content is preserved
- **WHEN** a scene has a 500 ms transition, a parallel block lasting 1500 ms and no ending hold,
  and its total is set to 3 seconds
- **THEN** an ending hold of 1000 ms is appended and the transition and parallel block are unchanged

#### Scenario: An existing ending hold becomes zero
- **WHEN** a total equal to the content minimum is requested for a scene with a commented final hold
- **THEN** that hold becomes `hold 0ms`, its comments remain and the inverse restores it exactly

### Requirement: Safe and reversible scene-duration requests
A scene-duration edit SHALL preserve all untargeted source and comments and provide an exact
inverse. A total below the content minimum, non-finite, negative or requiring an ending hold beyond
the per-statement limit SHALL be `edit.invalid-value`, with its minimum and reason. A missing story
or scene SHALL be `edit.unsafe-target`. Rejection SHALL preserve source and history and keep the
input editable for correction.

#### Scenario: A total shorter than the content
- **WHEN** a scene with 2 seconds of timed content and an ending hold has its total set to 1 second
- **THEN** the edit is refused with a 2-second minimum, the draft stays editable and source and history do not change

#### Scenario: Invalid total input
- **WHEN** the requested duration is non-finite, negative or requires a hold beyond ten minutes
- **THEN** the edit is refused with `edit.invalid-value` and nothing changes

#### Scenario: The scene is absent
- **WHEN** `setSceneDuration` names a story or scene that is no longer present
- **THEN** the edit is refused with `edit.unsafe-target` and nothing changes

### Requirement: Story removal requires unambiguous syntax
`removeStory` SHALL refuse source with parser errors using `edit.unsafe-target` and localized
feedback. The refusal SHALL produce no edit or source mutation in either cascade mode. Semantic
errors alone SHALL NOT prevent removal from syntactically valid source.

#### Scenario: Missing closing brace before unrelated content
- **WHEN** a story lacks a closing brace and another diagram follows its recovered parser range
- **THEN** removal with either cascade value is refused and every byte, including line endings and the later diagram, remains unchanged

#### Scenario: Removal repairs a semantic error
- **WHEN** the source parses correctly and the named story contains an invalid reference
- **THEN** the story can be removed without changing unrelated content
