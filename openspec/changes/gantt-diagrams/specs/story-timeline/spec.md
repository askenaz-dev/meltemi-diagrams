## ADDED Requirements

### Requirement: Gantt frames
`storyFrame` SHALL draw `draw <task>[, …]` in a gantt chart by growing each task's bar, label and
icon from the bar's start to its end (a clip of the task's group widening from left to right), the
tasks one after another in the listed order, each over a share of the time proportional to its bar's
width, and leaving them drawn; a task whose first visibility action is `draw` SHALL start hidden.
`trace <task>` SHALL draw the arrows of the chain that drives the task (from the task, the predecessor
with the latest end, recursively), earliest first, one after another on the dash channel, each over a
share proportional to its length. The `axis` group SHALL never be faded or hidden by an action. The
same timeline, views and time SHALL give the same frame, and the animated SVG and video exports SHALL
show the same frames. A frame at a time outside the story SHALL be the first or the last frame.

#### Scenario: Halfway through two bars
- **WHEN** `draw a, b over 1s` names two tasks with bars of equal width and t is 250 ms into the action
- **THEN** the frame shows the left half of `a`'s bar and nothing of `b`

#### Scenario: Tracing the chain into flu3
- **WHEN** t is two thirds into `trace flu3 over 3s` on the owner's chart with arrows of equal length
- **THEN** the arrows flu0 to flu1 and flu1 to flu2 are drawn whole and nothing of flu2 to flu3

#### Scenario: The axis stays
- **WHEN** the first scene hides every section
- **THEN** the frame still shows the axis, its grid and its labels

#### Scenario: A time before the story
- **WHEN** a frame is asked for at -100 ms
- **THEN** it equals the frame at 0 ms
