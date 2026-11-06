## ADDED Requirements

### Requirement: Connection preview source point

A connection preview started from a side handle SHALL begin at that side's midpoint on the
element's rendered outline, including rotation and viewport transforms. An exact border-start
attachment SHALL retain its selected point. The change SHALL preserve existing route persistence,
Gantt link starts and cancellation behavior.

#### Scenario: Side handle

- **WHEN** a user drags a connection from any side handle
- **THEN** the temporary line begins on that side's outline point rather than the element centre

#### Scenario: Transformed shape

- **WHEN** the source is nonrectangular or rotated and the viewport is zoomed or panned
- **THEN** the temporary line still begins at the visible selected side's outline point

#### Scenario: Exact border point

- **WHEN** a connection starts at an arbitrary border percentage
- **THEN** its preview retains that point without replacing it with a side midpoint

#### Scenario: Cancel or automatic target

- **WHEN** a user cancels the gesture or drops a handle connection onto an automatic target
- **THEN** cancellation writes no edit and committed routing follows the existing behavior
