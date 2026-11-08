# Spec Delta

## ADDED Requirements

### Requirement: Effects and direction in the context menu
On a canvas that edits, the context menu SHALL list one checkable item per effect the selection
takes, named as the inspector names them, checked when every selected target has it on; choosing
one SHALL turn the effect on where it is missing, or off everywhere when all have it, in one edit.
One selected flow relation, sequence message or free line SHALL also get **Reverse direction**.
A read-only canvas SHALL offer none of these.

#### Scenario: Flow particles from the menu
- **WHEN** the named relation `pay` is selected on a flow canvas and **Flow particles** is chosen in its context menu
- **THEN** the text gains `animate pay { effect flow }`, the menu closes, and opening it again shows **Flow particles** checked

#### Scenario: Where the items sit
- **WHEN** the context menu opens on a selected relation
- **THEN** the effect items come after the relation's own items (route kind, line) and before the clipboard items, in their own group, labelled Flow particles, Moving dash, Pulse and Trace

#### Scenario: Only the effects the target takes
- **WHEN** the context menu opens on a selected box without an outline, such as an `icon`
- **THEN** it lists **Pulse** and no other effect

#### Scenario: Turn off for every selected target
- **WHEN** `pay` and `ship` both have a pulse, both are selected and **Pulse** is chosen
- **THEN** both `animate` statements are removed in one undo step

#### Scenario: Turn on where it is missing
- **WHEN** `pay` has a pulse, `ship` has none, both are selected and **Pulse** is chosen
- **THEN** `ship` gains `animate ship { effect pulse }` and `pay` keeps its statement

#### Scenario: Reverse a relation from the menu
- **WHEN** `api -> db as save` is selected and **Reverse direction** is chosen
- **THEN** the text reads `db -> api as save` and the connector is drawn from `db` to `api`

#### Scenario: Reverse is for one relation
- **WHEN** two relations, or a box, or a relation of a C4 view are selected and the context menu opens
- **THEN** it has no **Reverse direction** item

#### Scenario: Nothing of it on a read-only canvas
- **WHEN** a relation is selected on a canvas that only shows and its context menu opens
- **THEN** the menu has no effect items and no **Reverse direction**

### Requirement: Layout badge menu
On a canvas that edits a diagram whose toolbar badge names a layout mode, the badge SHALL be a
menu button: it keeps naming the mode, and opens a menu with the three modes as radio items,
the current one checked (**Automatic**, **Assisted**, **Manual**), then **Arrange unplaced
elements** and **Recompute layout**. Choosing a mode SHALL write the diagram's `layout`; the
story, scenario, sequence and gantt badges and the badge of a read-only canvas SHALL stay plain
labels.

#### Scenario: The badge names the mode and opens the menu
- **WHEN** a diagram with `layout assisted` is shown on a canvas that edits and its badge is pressed
- **THEN** the badge reads `layout assisted`, the menu opens with **Assisted** checked, and it lists **Arrange unplaced elements** and **Recompute layout**

#### Scenario: Assisted from the menu
- **WHEN** **Assisted** is chosen on a diagram without a `layout` statement
- **THEN** the text gains `layout assisted` and nothing else changes

#### Scenario: Manual writes the missing positions first
- **WHEN** **Manual** is chosen on an `assisted` diagram where `db` has no `place`
- **THEN** one undo step writes `place db at (…)` where it was drawn and `layout manual`, and the diagram compiles without `layout.missing-placement`

#### Scenario: Recompute from the badge
- **WHEN** **Recompute layout** is chosen in the badge menu
- **THEN** the same edit as the Arrange button's **Recompute layout** is written

#### Scenario: Plain badges stay plain
- **WHEN** a sequence diagram, a gantt chart, a story or a read-only canvas is shown and its badge is pressed
- **THEN** no menu opens and the badge is not a button

#### Scenario: Keyboard
- **WHEN** the badge has focus and Enter or Space is pressed
- **THEN** the menu opens with the current mode focused, the arrows move between items and Escape closes it, returning focus to the badge

### Requirement: Confirmed switch to automatic layout
When `layout auto` is chosen, from the badge menu or the inspector, on a diagram with positions or
waypoints that `auto` would ignore, the canvas SHALL first show a dialog in the interface
language, with **Cancel** and **Arrange**, saying how many positions and routes will be lost.
**Arrange** SHALL write the mode and remove them as one undo step; **Cancel** and Escape SHALL
write nothing. Without anything to lose the mode SHALL change directly.

#### Scenario: Confirm from the badge
- **WHEN** **Automatic** is chosen on an `assisted` diagram with three `place` statements and one route with `via`
- **THEN** a dialog names 3 positions and 1 route, and **Arrange** leaves the text with `layout auto`, no `place` and no `via`, undone in one step

#### Scenario: Confirm from the inspector
- **WHEN** nothing is selected, the Layout field is set to `auto` on a diagram with placed boxes
- **THEN** the same dialog opens, and **Cancel** keeps the text and the field at `assisted`

#### Scenario: Nothing to lose
- **WHEN** **Automatic** is chosen on an `assisted` diagram without `place` statements or routes with waypoints
- **THEN** no dialog opens and the text gains `layout auto`

#### Scenario: Escape cancels
- **WHEN** the dialog is open and Escape is pressed
- **THEN** the dialog closes, nothing is written, and focus returns to the control that opened it

#### Scenario: In Spanish
- **WHEN** the interface language is Spanish and the dialog opens
- **THEN** its title, sentence and buttons are in Spanish, with **Cancelar** and **Reordenar**
