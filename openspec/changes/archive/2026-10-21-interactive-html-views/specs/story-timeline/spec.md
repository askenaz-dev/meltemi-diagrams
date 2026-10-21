## ADDED Requirements

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
