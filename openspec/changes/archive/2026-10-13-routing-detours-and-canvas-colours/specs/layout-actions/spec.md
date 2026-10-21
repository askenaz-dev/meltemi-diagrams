## MODIFIED Requirements

### Requirement: Arrange operation
`planEdit` SHALL support `{ kind: "arrange", diagram, positions, sizes?, scope }`, where `positions` maps element ids to centres, `sizes` maps group ids to sizes and `scope` is `unplaced` or `all`. The plan SHALL:

- write `place <id> at (x, y)` with coordinates rounded to whole units: for the elements of `positions` that have no `place` (`unplaced`), or for all of them, replacing existing places (`all`);
- with `all`, also update the `place` and `size` of groups that have them, from `positions` and `sizes`; groups that fit their children are left alone;
- add new statements, one per line, to the last `placement` block, or create one; when the routes removed below include the block's last statements, the new statements SHALL take their place;
- turn `layout auto`, written or implied by its absence, into `layout assisted`;
- with `all`, remove the `via` lists of `route` statements and their compass sides and points, keeping named ports, so the layout chooses where connectors meet the boxes; a route left with nothing SHALL be removed.

It SHALL keep comments and formatting like every other edit. An unknown diagram or element SHALL be `edit.unsafe-target`.

#### Scenario: Materialise an automatic layout
- **WHEN** `arrange` with scope `unplaced` runs on a diagram without a `layout` statement whose three elements are unplaced
- **THEN** the text gains `layout assisted` and three `place` statements in a new `placement` block, and compiles without errors

#### Scenario: Recompute everything
- **WHEN** `arrange` with scope `all` runs on an `assisted` diagram with a placed element, a route `from api.east 25% to bus.in via [(300, 40)]` where `in` is a named port of `bus`, and a route `from api.south to db.north 50%`
- **THEN** the place is replaced by the new position, the first route becomes `from api to bus.in`, and the second route is removed

#### Scenario: Arranging the unplaced keeps routes
- **WHEN** `arrange` with scope `unplaced` runs on a diagram with `route save from api.east 50% to db.west`
- **THEN** the route is unchanged

#### Scenario: Every route goes
- **WHEN** `arrange` with scope `all` runs on a diagram without places whose only `placement` block holds `route request from client.south to api.south` and `route api_client from api.north 31% to client.west 50%`
- **THEN** both routes are removed, the block holds one `place` per element, and the plan applies and compiles without errors
