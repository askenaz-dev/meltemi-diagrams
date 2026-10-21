## MODIFIED Requirements

### Requirement: Default connectors around boxes
In every layout mode, an `auto` or `orthogonal` connector with no waypoints and no parallel lane
whose route — the engine's in `auto` mode, else the anchor rules' — runs through another shape
SHALL go around when it can:

- with both ends free (no written port), it SHALL first take, among the L and Z routes between the
  middles of any two sides that leave and enter square with a 20 px stub, the one that crosses the
  fewest shapes, then the shortest, then the one with the fewest bends;
- when it still crosses a shape, or an end is pinned (a compass side, a point of a side or a named
  port), it SHALL take the shortest orthogonal detour that leaves and enters at the route's own
  first and last points, square to their sides with a 20 px stub, passing through no shape and
  neither end box, where each change of direction counts as 40 px.

A route SHALL change only when the new one crosses fewer shapes. A connector that crosses nothing
SHALL keep its route.

#### Scenario: Around a box in the way
- **WHEN** an assisted view places `api` above `db`, with `bank` below `db`, and `api -> bank` would run straight through `db`
- **THEN** the connector of `api -> bank` goes around `db` and crosses no box

#### Scenario: Around a box with pinned ends
- **WHEN** a diagram in `auto` mode draws `client` above `db`, `api` to their left, and `client -> api` with `route request from client.south to api.south`
- **THEN** the connector leaves `client`'s south side and enters `api`'s south side, crosses no box, and `layout.connector-crossing` is not reported
