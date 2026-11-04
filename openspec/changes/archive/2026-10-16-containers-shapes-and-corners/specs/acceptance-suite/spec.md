## MODIFIED Requirements

### Requirement: Acceptance corpus
`corpus/acceptance/` SHALL hold sheets for `flow`, `sequence`, `c4` and `free` covering long labels,
cycles, nested containers, parallel relations and views of 30 elements; for `flow` and `free` also
a `stacked` sheet (nested untitled groups with fills and `radius 0`, a stack of sibling boxes with
empty labels, a band on a back layer behind arranged boxes) and a `shapes` sheet (every `shape`
value, connected, with ends pinned to a diamond and an ellipse); sheets with syntax errors
for each profile in `errors/`; and edit scenarios in `edits/` (a sheet, a list of edit operations
and what must hold after each), among them a reparenting scenario (`moveElement` into and out of
a group). Every valid sheet SHALL compile without errors and lay out with no
warning, and SHALL keep a reviewed SVG snapshot.

#### Scenario: Valid sheets are clean
- **WHEN** the acceptance suite lays out every valid acceptance sheet
- **THEN** each has no error and no warning, and its SVG equals its snapshot

#### Scenario: Stacked sheet
- **WHEN** `corpus/acceptance/free/stacked.meltemi` is laid out
- **THEN** no `layout.overlap`, `layout.connector-crossing`, `layout.container-margin` or label finding is reported, and the untitled groups draw no title

#### Scenario: Reparent scenario
- **WHEN** the `free-reparent` edit scenario moves a box into a group and back
- **THEN** after each step the box is drawn where the scenario says and the text compiles without errors

#### Scenario: Syntax errors
- **WHEN** a sheet of `errors/` is analysed
- **THEN** its errors point at the faulty statement, every language service answers without throwing, and the canvas session shows the last drawable state as stale
