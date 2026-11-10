# story-language Specification

## Purpose
The `story` block of the Meltemi language: scenes, views, transitions, actions, compiled timing and the rules that keep stories valid.

## Requirements

### Requirement: Story blocks
`story <id> for <diagram> { … }` SHALL compile into `Document.stories` with its target, `title`,
`description` and ordered scenes; `<diagram>` SHALL name a diagram of the file or an imported one
(member or namespace import), of any profile, and anything else SHALL be `story.unknown-diagram`.
Story ids SHALL share the file namespace. `block.unsupported` SHALL no longer be reported for
stories.

#### Scenario: The purchase story
- **WHEN** the proposal's purchase story compiles with its `checkout` diagram
- **THEN** it has scenes `overview` and `processing` and lasts 7400 ms

#### Scenario: Unknown diagram
- **WHEN** a story is `story tour for missing { … }`
- **THEN** `story.unknown-diagram` lists the diagrams of the file and the imports

### Requirement: Scenes and actions
A scene SHALL be `scene <id> ["Title"] { … }` with unique ids per story. It MAY start with
`view <diagram>` and `transition cut|fade|morph [over <time>]`. Actions SHALL be `reveal`, `hide`,
`highlight`, `focus` and `camera` with comma-separated targets (`focus all` and `camera all`
clear), `trace <relation>` (in a gantt chart also `trace <task>`, the chain of dependencies that drives the task), `draw <target>[, <target>…]` (pens, free lines and named relations, drawn from their first point to their last and left drawn, and gantt tasks, whose bars grow from their start to their end), each with an optional `over <time>`, `hold <time>`, and `parallel { …
}` holding actions. Targets SHALL be element ids, named relation ids and named note and fragment
ids of the scene's view (entity paths in C4 views; in gantt charts sections, tasks, milestones and markers); unknown ones SHALL be `ref.unknown-element` with
close ids as hints. `trace` on anything but a relation or a gantt task or milestone with dependencies SHALL be `story.invalid-target`, and so SHALL `draw` on anything but a pen, a free line, a named relation or a gantt task. Times SHALL use `ms` or `s` from 0 to 10 minutes; a
scene without actions SHALL be `story.empty-scene` (warning).

#### Scenario: Trace on a box
- **WHEN** a scene has `trace api` where `api` is a node
- **THEN** `story.invalid-target` says trace follows a relation

#### Scenario: Draw the strokes of a whiteboard
- **WHEN** a scene of a story for a free diagram has `draw title, arrow over 2s` where both are pens
- **THEN** it compiles without diagnostics and the timeline holds a `draw` action of 2000 ms with the two targets in order

#### Scenario: Draw on a box
- **WHEN** a scene has `draw api` where `api` is a box
- **THEN** `story.invalid-target` says draw takes pens, lines and relations

#### Scenario: A plan told section by section
- **WHEN** a story for the owner's chart has `reveal tecnologia` and `draw tec0, tec1, tec2 over 3s`
- **THEN** it compiles without diagnostics and the timeline holds a `reveal` and a `draw` of 3000 ms with the three tasks in order

#### Scenario: Trace the chain into a task
- **WHEN** a scene has `trace flu3`
- **THEN** it compiles without diagnostics and the action's targets are the arrows flu0 to flu1, flu1 to flu2 and flu2 to flu3, in that order

#### Scenario: Draw on a section
- **WHEN** a scene has `draw tecnologia` where `tecnologia` is a section
- **THEN** `story.invalid-target` says draw takes pens, lines, relations and gantt tasks

### Requirement: Timing
Sequential actions SHALL add up, a scene's transition SHALL come before its actions, a `parallel`
block SHALL last as long as its longest action, and scenes SHALL follow each other. Default times
SHALL be 600 ms for reveal, hide and focus, 800 ms for camera, fade and morph, 1000 ms for
highlight, 1200 ms for trace and 0 for cut; `hold` SHALL require a time. Every compiled action SHALL
carry its absolute start and duration.

#### Scenario: Parallel duration
- **WHEN** a scene has `parallel { trace save over 1200ms; highlight db over 800ms }` then
  `hold 2s`
- **THEN** the scene lasts 3200 ms and `hold` starts at 1200 ms into it

### Requirement: Story rules
A scene whose view differs from the previous scene's view without a `transition` SHALL be
`story.missing-transition` (error). Two actions of the same channel (visibility, highlight or trace
of one target; focus or camera of one view) whose times overlap SHALL be `story.conflict` (error)
on the later one.

#### Scenario: Reveal and hide together
- **WHEN** a `parallel` block has `reveal db` and `hide db`
- **THEN** `story.conflict` points at `hide db`

#### Scenario: New view without transition
- **WHEN** the second scene starts with `view containers` and no `transition`
- **THEN** `story.missing-transition` is reported on the `view` statement

### Requirement: Optional relative scene overlap

A scene MAY declare `overlap <time>` before its actions. Positive overlap SHALL start it before
the preceding scene ends by exactly that amount, bounded by both scene durations. Zero/omission
SHALL preserve sequential behavior. Invalid times, first-scene positive overlap and malformed or
late declarations SHALL be diagnosed without modifying source. Existing valid files SHALL retain
their timing and meaning.

#### Scenario: Three concurrent scenes

- **WHEN** three ten-second scenes use eight-second incoming overlaps after the first
- **THEN** their starts are zero, two and four seconds and the story ends at fourteen seconds

#### Scenario: Invalid overlap

- **WHEN** overlap exceeds either adjacent duration or is positive in the first scene
- **THEN** a stable diagnostic identifies the invalid amount and no negative schedule is accepted
