## ADDED Requirements

### Requirement: Default connectors around boxes
In `assisted` and `manual` mode, an `auto` or `orthogonal` connector with no waypoints, no written
ports and no parallel lane whose default route runs through another shape SHALL take, among the L
and Z routes between the middles of any two sides that leave and enter square with a 20 px stub,
the one that crosses the fewest shapes, then the shortest, then the one with the fewest bends —
only when it crosses fewer shapes than the default. A connector that crosses nothing SHALL keep its
default route.

#### Scenario: Around a box in the way
- **WHEN** an assisted view places `api` above `db`, with `bank` below `db`, and `api -> bank` would run straight through `db`
- **THEN** the connector of `api -> bank` goes around `db` and crosses no box

### Requirement: Labels placed clear
A relation label without a `label` statement SHALL sit at the first of 50 %, 42 %, 58 %, 34 %, 66 %,
26 %, 74 %, 18 % and 82 % of its connector where its pill covers no shape, no group title band, no
other label and no other connector, or at the stop that covers the fewest. A label placed with
`label` SHALL stay where it is written.

#### Scenario: Label off a box
- **WHEN** the middle of a connector lies over another box
- **THEN** its label sits at the nearest clear stop along the connector

### Requirement: Connectors under group titles
A straight connector that crosses the title or description of a group it does not join SHALL be
drawn with a gap of 3 px around them, as passing under the title; the relation's track, which
motion follows, SHALL stay whole.

#### Scenario: Entering a group from above
- **WHEN** a connector enters a group through its title
- **THEN** the connector is drawn in two pieces that stop 3 px from the title, and no label overlap is reported
