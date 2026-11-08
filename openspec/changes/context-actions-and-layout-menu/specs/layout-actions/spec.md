# Spec Delta

## ADDED Requirements

### Requirement: Clear placement operation
`planEdit` SHALL support `{ kind: "clearPlacement", diagram }`, which removes exactly what `layout
auto` ignores: every `place` of arranged elements and groups, and the `via` lists of `route`
statements, removing a route or a `placement` block left with nothing. Bands, group `size`, and
the ports, sides and points of routes SHALL stay. It SHALL keep comments and formatting.

#### Scenario: Positions and waypoints go
- **WHEN** `clearPlacement` runs on a diagram with `place api at (200, 120)`, `place db at (400, 120)`, `size api (160, 60)` and `route save from api.east to db.west via [(300, 40)]`
- **THEN** both places and the `via` list are removed, `size api` stays, and the route reads `route save from api.east to db.west`

#### Scenario: A band stays
- **WHEN** `clearPlacement` runs on a diagram whose top-level group `lane` has `place`, `size` and no children
- **THEN** `lane` keeps its `place` and `size`

#### Scenario: An emptied block goes
- **WHEN** `clearPlacement` runs on a diagram whose only `placement` block holds two `place` statements and a route that is only `via`
- **THEN** the whole block is removed and the text compiles without errors

#### Scenario: Free group children
- **WHEN** `clearPlacement` runs on a free composition whose group `team` holds `place a at (20, 20)` and `place b at (120, 20)`
- **THEN** both children's places are removed and the group's `size` stays

#### Scenario: Nothing to clear
- **WHEN** `clearPlacement` runs on a diagram without `place` statements or waypoints
- **THEN** the plan has no edits and is not an error

#### Scenario: Unknown diagram
- **WHEN** `clearPlacement` names a diagram the file does not have
- **THEN** the plan is refused with `edit.unsafe-target`

### Requirement: Switching the mode from the canvas
Writing `layout auto` on a diagram with anything `clearPlacement` would remove SHALL be refused
by the editor with `edit.loses-placement`, a reason naming how many positions and routes would
go, and a `retry` that, once the canvas confirms, writes the mode and `clearPlacement` in one
plan. Writing `layout manual` SHALL first write the missing positions as `arrange` with scope
`unplaced` does, in the same plan. Writing `layout assisted` SHALL write the statement alone.

#### Scenario: Automatic refused until confirmed
- **WHEN** the canvas asks for `layout auto` on an `assisted` diagram with two placed boxes
- **THEN** the answer is `edit.loses-placement` naming 2 positions, nothing is written, and the retry sent back writes `layout auto` and removes both places in one undo step

#### Scenario: Automatic without anything to lose
- **WHEN** the canvas asks for `layout auto` on a diagram with no places and no waypoints
- **THEN** the text gains `layout auto` at once

#### Scenario: Manual materialises first
- **WHEN** the canvas asks for `layout manual` on an `auto` diagram with three unplaced boxes
- **THEN** one plan writes the three `place` statements where the engine drew them and `layout manual`

#### Scenario: Assisted alone
- **WHEN** the canvas asks for `layout assisted` on an `auto` diagram
- **THEN** only `layout assisted` is written
