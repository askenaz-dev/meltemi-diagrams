## ADDED Requirements

### Requirement: Story timeline
`storyTimeline(story)` in `@meltemi/diagrams-motion` SHALL return the scenes and actions with
absolute times, the views used and the total length, as plain data that can be sent to a webview.

#### Scenario: Scene starts
- **WHEN** the purchase story is timed
- **THEN** `processing` starts at 1800 ms

### Requirement: Story frames
`storyFrame(timeline, views, t)` SHALL return the scene at `t` milliseconds: revealed targets start
hidden and fade in over their action; hidden targets fade out; highlights fade in and out over
`min(200 ms, d/4)` and leave the base style afterwards; a trace draws its relation's track up to its
progress in the accent with a dot at the head and suspends the relation's `animate` effects
meanwhile; focus fades everything outside its targets and the relations between them to opacity
0.25 until the end of its scene or the next focus; the camera sets a view box around its targets
plus 40 px at the scene's aspect ratio until changed; transitions cut, cross-fade or morph elements
matched by id between two views; local effects run on the same clock. No action other than a morph
SHALL move or resize a box. The same timeline, views and time SHALL give the same scene.

#### Scenario: Revealed later
- **WHEN** a story reveals `db` in its second scene and t falls in the first
- **THEN** the `db` group has opacity 0

#### Scenario: Trace halfway
- **WHEN** t is halfway through `trace save over 1200ms`
- **THEN** the trace overlay covers half of the track and `save`'s flow effect is not drawn

#### Scenario: Camera
- **WHEN** t is after `camera db over 800ms`
- **THEN** the scene's view box contains `db`'s box with 40 px of margin
