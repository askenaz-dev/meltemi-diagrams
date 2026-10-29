# story-timeline Specification

## Purpose
Turning a compiled story into plain timeline data and drawing any instant of it, with the same deterministic clock as motion effects.
## Requirements
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

### Requirement: Drill-down frames
`drillTimeline(spec)` in `@meltemi/diagrams-motion` SHALL return a plain two-scene timeline for a
`DrillSpec { from, to, element, transition, direction, cameraMs, transitionMs }`: a scene on the
view that draws the element with a `camera` action on it over `cameraMs`, then a scene on the view
it opens with the `morph` or `fade` transition over `transitionMs`. `drillFrame(spec, views, t)`
SHALL return the scene `storyFrame` draws for that timeline with the view box always set (during
the transition interpolated linearly from the element's camera box, its bounds plus 40 px at the
scene's aspect ratio, to the whole child view) and, for every `t`, the width and height of the
larger of both scenes; going up it SHALL draw the way down played backwards. It SHALL return null
when a view is missing or the element has no element group with bounds. `transitionFor(parent,
child, element)` SHALL return `morph` when both scenes hold an element group with that id and
bounds, else `fade`. `boundsOf` and `frameBox` SHALL be exported. The same spec, views and time
SHALL give the same scene, and the semantics of `storyFrame` for stories SHALL not change: a camera
set before a view change still resets.

#### Scenario: Camera, then morph
- **WHEN** a spec from the `context` view to the `containers` view of commerce for `shop` with 320
  and 480 ms is drawn at 320, 560 and 800 ms
- **THEN** at 320 ms the view box holds the `shop` box with 40 px of margin, at 560 ms a `shop#morph`
  wrapper exists and the view box is halfway between that camera box and the whole `containers`
  scene, and at 800 ms the view box is the whole `containers` scene and no morph wrapper remains

#### Scenario: Different ids cross-fade
- **WHEN** `transitionFor` is asked for a free box `api` and a flow diagram whose linked element is
  `gateway`
- **THEN** it returns `fade`, and the drill frame at the transition's midpoint holds `before` and
  `after` wrappers at opacity 0.5

#### Scenario: A target without bounds
- **WHEN** the spec's element is the key of a relation
- **THEN** `drillFrame` returns null

#### Scenario: A cut
- **WHEN** both durations are 0 and `t` is 0
- **THEN** the scene is the child view's static scene

#### Scenario: Stories keep their camera rule
- **WHEN** a story moves the camera in one scene and changes view in the next without a camera
- **THEN** `storyFrame` draws the second scene's view whole, as before

### Requirement: Draw frames
`storyFrame` SHALL draw a `draw a, b [over <time>]` action (800 ms by default) as a replay of the strokes: a target whose first visibility action is `draw` starts hidden; the targets are drawn one after another in the listed order, each over a share of the time proportional to the length of its track, from its first point to its last, in its own colour and width (heads appear when the stroke completes), and each stays drawn afterwards. While a target is being drawn its own `animate` effects SHALL be suspended, as a trace suspends them. The same timeline, views and time SHALL give the same frame, and the animated SVG and video exports SHALL show the same replay.

#### Scenario: Halfway through a draw
- **WHEN** `draw a, b over 1s` names two pens of equal length and t is 250 ms into the action
- **THEN** the frame shows the first half of `a`'s path and nothing of `b`

#### Scenario: Drawn targets stay
- **WHEN** t is after `draw a, b over 1s`
- **THEN** both strokes are drawn whole at their own opacity and nothing of the action remains

#### Scenario: A target drawn before being revealed
- **WHEN** a pen is the target of `draw` in the second scene and t falls in the first
- **THEN** its group has opacity 0

#### Scenario: A draw in the exported video
- **WHEN** a story with `draw title over 1s` is exported as a video
- **THEN** the frame at 500 ms shows half of `title`'s stroke and the frame at 1500 ms the whole of it

