# sequence-editing Specification

## Purpose
The editing rules of sequence diagrams as structured operations: participants reorder without touching messages, spacing never changes the order, crossing events is an explicit validated move, and events go with what names them.
## Requirements
### Requirement: Reordering participants
`reorderParticipant { diagram, participant, index }` SHALL move the participant's declaration so that it becomes the `index`-th participant (0-based) of its block, declaring an implicit participant there first. No message, activation or note SHALL change.

#### Scenario: Move the bank first
- **WHEN** `bank` is moved to index 0 in the payment sequence
- **THEN** `participant bank "Banco"` is the first declaration, and every message statement is unchanged

### Requirement: Explicit event moves
`moveEvent { diagram, event, direction }` SHALL move an event statement up or down past its neighbour in the same block, or into the nearest branch of an adjacent fragment, or out of the fragment at its edge. A move whose result breaks the order-checked rules SHALL be refused with `edit.invalid-value` naming the rule.

#### Scenario: Refused move
- **WHEN** `deactivate api` would move above `activate api`
- **THEN** the move is refused with `edit.invalid-value`, and the text is unchanged

### Requirement: Spacing keeps order
`setSpacing { diagram, event, space }` and `setSpacing { diagram, participant, gap }` SHALL write, replace or (with 0 or null) remove `space` or `gap`, naming an anonymous message first. They SHALL never change the order of statements.

#### Scenario: Space before a message
- **WHEN** `setSpacing { event: "authorize", space: 28 }` runs on the payment sequence
- **THEN** the text gains `placement { space authorize 28 }`, and the events keep their order

### Requirement: Inserting events and fragments
- `insertEvent { diagram, after?, inside?, statement }` SHALL insert the text of an event statement after a given event, or first in a fragment branch, or at the end, re-indented.
- `wrapInFragment { diagram, events, operator, condition, id? }` SHALL wrap consecutive sibling events.
- `unwrapFragment` SHALL replace a fragment with its first branch's events, and SHALL be refused while other branches hold events.
- `addBranch` and `setFragmentCondition` SHALL edit branches.
- `setElementProperty { property: "kind", value: "async" | null }` SHALL set or remove `kind async` on a message.

Every result SHALL compile without new errors.

#### Scenario: Wrap in an option
- **WHEN** `approved` and `success` are wrapped in `opt "Con cupón"`
- **THEN** the two statements are inside `opt "Con cupón" { … }` at their old position, re-indented

### Requirement: Editing events
- `removeEvent { diagram, event }` SHALL remove an activation, lifecycle event, note, divider, delay or fragment (with its events), together with the `space`, styles, animations and scenario choices that name what it removes.
- `renameEvent { diagram, event, newId }` SHALL name or rename a note or fragment and every reference to it; ids are shared with elements and relations.
- `toggleActivation { diagram, participant, after }` SHALL write `activate` after the message and `deactivate` after the participant's first later message back to the sender in the same block (or after the block's last event), or remove that pair when the participant is activated right after the message.
- `setEventText`, `setNotePlacement` and `setFragmentOperator` SHALL change a note's text or a divider's or delay's label, a note's position and participants, and a fragment's operator with its branch keywords.
- `setFragmentCondition` SHALL carry a changed condition into the scenarios that choose that branch by it; `unwrapFragment` SHALL remove the scenario choices of the fragment.
- `setStyleProperty` SHALL accept named notes and fragments (`targetKind: "event"`), and `reorderParticipant` SHALL accept participant groups.

#### Scenario: Remove a decided fragment
- **WHEN** the fragment `check`, styled and chosen by a scenario, is removed
- **THEN** its messages, its `space`, its style target and the scenario's `choose check` are removed, and the text compiles without errors

#### Scenario: Toggle an activation
- **WHEN** `toggleActivation { participant: "b", after: "ask" }` runs on `a -> b as ask; b -> c; b --> a as reply`
- **THEN** `activate b` follows `ask` and `deactivate b` follows `reply`; running it again restores the text

### Requirement: Shared operations in sequence diagrams
`createElement` SHALL accept the participant kinds and `group` in sequence diagrams. `removeElement` SHALL list messages, activations, lifecycle events, notes and `gap` statements of the participant as dependents, and cascade into them. `setPosition`, `setSize`, `setRoute` and `arrange` SHALL be refused with `edit.invalid-value` naming the sequence operations.

#### Scenario: Remove a participant with cascade
- **WHEN** `bank` is removed with cascade from the payment sequence
- **THEN** its declaration and the four messages to or from it are removed, and the text compiles without errors

