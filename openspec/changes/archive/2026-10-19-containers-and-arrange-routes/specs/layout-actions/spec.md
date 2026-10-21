## MODIFIED Requirements

### Requirement: Arrange operation
`planEdit` SHALL support `{ kind: "arrange", diagram, positions, sizes?, routes?, scope }`, where `positions` maps element ids to centres, `sizes` maps group ids to sizes, `routes` maps relation keys to the points of their drawn connectors in diagram coordinates, ends included, and `scope` is `unplaced` or `all`. The plan SHALL:

- write `place <id> at (x, y)` with coordinates rounded to whole units: for the elements of `positions` that have no `place` (`unplaced`), or for all of them, replacing existing places (`all`);
- with `all`, also update the `place` and `size` of groups that have them, from `positions` and `sizes`; groups that fit their children are left alone, and a group with `place` and `size` and no children keeps both;
- add new statements, one per line, to the last `placement` block, or create one; when the routes removed below include the block's last statements, the new statements SHALL take their place;
- turn `layout auto`, written or implied by its absence, into `layout assisted`;
- with `all`, remove the `via` lists of `route` statements and their compass sides and points, keeping named ports, so the layout chooses where connectors meet the boxes; then, for every relation of `routes` whose points have bends between their ends, write `route <id> from <from> to <to> via [(x, y), …]` with the bends rounded to whole units and the ends free (named ports kept), replacing the relation's route or adding one; a relation without an id that needs a route SHALL first be named `<from>_<to>` in the same plan; a route left with nothing SHALL be removed.

It SHALL keep comments and formatting like every other edit. An unknown diagram or element SHALL be `edit.unsafe-target`.

#### Scenario: Materialise an automatic layout
- **WHEN** `arrange` with scope `unplaced` runs on a diagram without a `layout` statement whose three elements are unplaced
- **THEN** the text gains `layout assisted` and three `place` statements in a new `placement` block, and compiles without errors

#### Scenario: Recompute everything
- **WHEN** `arrange` with scope `all` runs on an `assisted` diagram with a placed element, a route `from api.east 25% to bus.in via [(300, 40)]` where `in` is a named port of `bus`, and a route `from api.south to db.north 50%`, and `routes` gives both relations straight connectors
- **THEN** the place is replaced by the new position, the first route becomes `from api to bus.in`, and the second route is removed

#### Scenario: Recompute writes the bends
- **WHEN** `arrange` with scope `all` runs with `routes` giving `store` the points (860, 300), (860, 120), (1040, 120) and `request` two points
- **THEN** the placement block holds `route store from api to db via [(860, 120)]`, no route for `request`, and the plan applies and compiles without errors

#### Scenario: An anonymous relation gets a route
- **WHEN** `arrange` with scope `all` runs with bends for the relation `api -> db` that has no `as` id
- **THEN** the relation gains `as api_db` and the block holds `route api_db from api to db via [...]`

#### Scenario: Arranging the unplaced keeps routes
- **WHEN** `arrange` with scope `unplaced` runs on a diagram with `route save from api.east 50% to db.west`
- **THEN** the route is unchanged

#### Scenario: Every route goes
- **WHEN** `arrange` with scope `all` runs on a diagram without places whose only `placement` block holds `route request from client.south to api.south` and `route api_client from api.north 31% to client.west 50%`, and `routes` gives both straight connectors
- **THEN** both routes are removed, the block holds one `place` per element, and the plan applies and compiles without errors

### Requirement: Layout command
`meltemi-diagrams layout <file.meltemi>` SHALL compile the file in its project and arrange its flow diagrams with the ELK engine, measuring text with the bundled and project fonts. Without `--all` it SHALL lay out each diagram as `layout assisted` and write the result of `arrange` with scope `unplaced`; with `--all` it SHALL lay out each diagram as `layout auto` and write `arrange` with scope `all`, routes included. It SHALL print `Arranged "<diagram>" in <path>`, or that every position is already written. Options:

- `--diagram <id>` restricts it to one diagram;
- `--check` writes nothing, prints the diagrams that would change, and exits 1 when any would;
- `--stdout` prints the arranged text instead of writing it, with diagnostics on stderr.

A `manual` diagram keeps its mode: the command writes its missing places, and `--all` rewrites them. Layout errors SHALL be printed and give exit code 1; usage errors SHALL exit 2. The written positions SHALL be the ones the export draws, so exporting before and after gives the same SVG; with `--all`, the connectors of the export after SHALL have the same bends as the export before, each point within 1 px.

#### Scenario: Write positions
- **WHEN** `meltemi-diagrams layout sheet.meltemi` runs on a file with one `auto` diagram
- **THEN** the file gains `layout assisted` and a `place` for every element, and a second run reports nothing to change

#### Scenario: Check
- **WHEN** `meltemi-diagrams layout sheet.meltemi --check` runs on the same original file
- **THEN** the file is unchanged, the diagram is listed, and the exit code is 1

#### Scenario: Same picture
- **WHEN** `corpus/valid/checkout.meltemi` is exported, arranged with `meltemi-diagrams layout` and exported again
- **THEN** both SVG files are identical

#### Scenario: Placed groups follow with --all
- **WHEN** `meltemi-diagrams layout sheet.meltemi --all` runs on a `manual` diagram with a placed and sized group
- **THEN** the group's `place` and `size` are rewritten to the box the engine gives it, which holds its arranged children and is at least its written size, the diagram stays `manual`, and it lays out without warnings

#### Scenario: Same connectors with --all
- **WHEN** an `auto` diagram with a back edge and a labelled relation is exported, arranged with `meltemi-diagrams layout --all` and exported again
- **THEN** the file holds a `route … via […]` for every connector the engine bent, and every connector of the second export has the same number of bends as in the first, each point within 1 px
