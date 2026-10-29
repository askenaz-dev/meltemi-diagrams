## ADDED Requirements

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
