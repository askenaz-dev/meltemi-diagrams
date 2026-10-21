## ADDED Requirements

### Requirement: Arrange operation
`planEdit` SHALL support `{ kind: "arrange", diagram, positions, sizes?, scope }`, where `positions` maps element ids to centres, `sizes` maps group ids to sizes and `scope` is `unplaced` or `all`. The plan SHALL:

- write `place <id> at (x, y)` with coordinates rounded to whole units: for the elements of `positions` that have no `place` (`unplaced`), or for all of them, replacing existing places (`all`);
- with `all`, also update the `place` and `size` of groups that have them, from `positions` and `sizes`; groups that fit their children are left alone;
- add new statements, one per line, to the last `placement` block, or create one;
- turn `layout auto`, written or implied by its absence, into `layout assisted`;
- with `all`, remove the `via` lists of `route` statements.

It SHALL keep comments and formatting like every other edit. An unknown diagram or element SHALL be `edit.unsafe-target`.

#### Scenario: Materialise an automatic layout
- **WHEN** `arrange` with scope `unplaced` runs on a diagram without a `layout` statement whose three elements are unplaced
- **THEN** the text gains `layout assisted` and three `place` statements in a new `placement` block, and compiles without errors

#### Scenario: Recompute everything
- **WHEN** `arrange` with scope `all` runs on an `assisted` diagram with a placed element and a route with waypoints
- **THEN** the place is replaced by the new position and the route keeps its ports without `via`

### Requirement: Dragging switches to assisted
`setPosition` on a diagram whose layout is `auto`, written or implied, SHALL also write `layout assisted`, replacing `layout auto` or inserting it as the first statement of the diagram body.

#### Scenario: Drag in an automatic diagram
- **WHEN** `setPosition` moves `api` in a diagram without a `layout` statement
- **THEN** the result contains `layout assisted` and `place api at (…)`, and nothing else changes

### Requirement: Layout command
`meltemi-diagrams layout <file.meltemi>` SHALL compile the file in its project and arrange its flow diagrams with the ELK engine, measuring text with the bundled and project fonts. Without `--all` it SHALL lay out each diagram as `layout assisted` and write the result of `arrange` with scope `unplaced`; with `--all` it SHALL lay out each diagram as `layout auto` and write `arrange` with scope `all`. It SHALL print `Arranged "<diagram>" in <path>`, or that every position is already written. Options:

- `--diagram <id>` restricts it to one diagram;
- `--check` writes nothing, prints the diagrams that would change, and exits 1 when any would;
- `--stdout` prints the arranged text instead of writing it, with diagnostics on stderr.

A `manual` diagram keeps its mode: the command writes its missing places, and `--all` rewrites them. Layout errors SHALL be printed and give exit code 1; usage errors SHALL exit 2. The written positions SHALL be the ones the export draws, so exporting before and after gives the same SVG.

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
- **THEN** the group's `place` and `size` are rewritten to fit its arranged children, the diagram stays `manual`, and it lays out without warnings
