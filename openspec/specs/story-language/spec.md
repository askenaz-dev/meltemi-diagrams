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
clear), `trace <relation>`, each with an optional `over <time>`, `hold <time>`, and `parallel { …
}` holding actions. Targets SHALL be element ids, named relation ids and named note and fragment
ids of the scene's view (entity paths in C4 views); unknown ones SHALL be `ref.unknown-element` with
close ids as hints. `trace` on anything but a relation SHALL be `story.invalid-target`. Times SHALL use `ms` or `s` from 0 to 10 minutes; a
scene without actions SHALL be `story.empty-scene` (warning).

#### Scenario: Trace on a box
- **WHEN** a scene has `trace api` where `api` is a node
- **THEN** `story.invalid-target` says trace follows a relation

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

