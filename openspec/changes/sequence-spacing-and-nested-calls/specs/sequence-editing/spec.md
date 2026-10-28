## ADDED Requirements

### Requirement: Nesting calls
`nestInCall { diagram, call, events }` SHALL move the event statements named by `events`, which MUST be consecutive siblings directly following the call in its block, into the call's block: creating the block when the call has none, appending after its last statement otherwise, re-indented one level, with the comments inside the moved text. `unnestCall { diagram, call }` SHALL move the event statements of the call's block out after the call statement at its indentation, rewriting every `return` that answers the call, at any fragment depth, into `<callee> --> <caller>[: "Label"] [as <id>] [{ … }]` in place, and SHALL remove the block when nothing else was in it. A call that is not a message, events that are not consecutive siblings right after the call, a `return` among the events, and an unnest of a call without a block SHALL be refused with `edit.unsafe-target` naming the rule. Every result SHALL compile without new errors.

#### Scenario: Nest two events
- **WHEN** `nestInCall { call: "pay", events: ["authorize", "api->customer#1"] }` runs on `customer -> api: "Pay" as pay\n  api -> bank: "Authorize" as authorize // auth\n  api --> customer: "Receipt"`
- **THEN** the text becomes `customer -> api: "Pay" as pay {\n    api -> bank: "Authorize" as authorize // auth\n    api --> customer: "Receipt"\n  }`, the comment included, and the keys `pay`, `authorize` and `api->customer#1` are unchanged

#### Scenario: Unnest rewrites the return
- **WHEN** `unnestCall { call: "pay" }` runs on `customer -> api: "Pay" as pay {\n    api -> bank: "Authorize" as authorize\n    return "Receipt" as receipt\n  }`
- **THEN** the text becomes `customer -> api: "Pay" as pay\n  api -> bank: "Authorize" as authorize\n  api --> customer: "Receipt" as receipt`, and `receipt` is still the reply's key

#### Scenario: Nesting keeps the properties
- **WHEN** `nestInCall` runs on a call whose block is `{ kind async }`
- **THEN** the moved events follow `kind async` inside the same block

#### Scenario: Not right after the call
- **WHEN** `nestInCall { call: "pay", events: ["later"] }` runs and `note over api "N"` sits between `pay` and `later`
- **THEN** the operation is refused with `edit.unsafe-target` saying the events must directly follow the call, and the text is unchanged

## MODIFIED Requirements

### Requirement: Explicit event moves
`moveEvent { diagram, event, direction }` SHALL move an event statement up or down past its neighbour in the same block, or into the nearest branch of an adjacent fragment or the block of an adjacent call (moving up into a call's block puts the event before a trailing `return`), or out of the fragment or the call at its edge. A move whose result breaks the order-checked rules, or puts a `return` outside its call or after another `return`, SHALL be refused with `edit.invalid-value` naming the rule.

#### Scenario: Refused move
- **WHEN** `deactivate api` would move above `activate api`
- **THEN** the move is refused with `edit.invalid-value`, and the text is unchanged

#### Scenario: Into and out of a call block
- **WHEN** `moveEvent { event: "log", direction: "up" }` runs on `a -> b as call { b -> c as inner; return }; a -> log: "Log" as log`
- **THEN** `log` is inside `call`'s block after `inner` and before the `return`; moved up twice more it is first in the block, then before `call`

#### Scenario: A return cannot leave its call
- **WHEN** `moveEvent { event: "api->customer#1", direction: "down" }` runs on the `return` that is the last event of a call's block
- **THEN** the move is refused with `edit.invalid-value` naming `sequence.return`, and the text is unchanged

### Requirement: Spacing keeps order
`setSpacing { diagram, target, targetKind: "event", amount, side? }` and `setSpacing { diagram, target, targetKind: "participant", amount, side? }` SHALL write, replace or (with 0 or null) remove `space` or `gap` on the given side (`before` when none, written without the word; `after` written as the word), naming an anonymous message first. A negative amount SHALL be written for a `gap` except before the first participant of its block and after the last, and SHALL be refused with `edit.invalid-value` for a `space` and on those edges. They SHALL never change the order of statements.

#### Scenario: Space before a message
- **WHEN** `setSpacing { target: "authorize", targetKind: "event", amount: 28 }` runs on the payment sequence
- **THEN** the text gains `placement { space authorize 28 }`, and the events keep their order

#### Scenario: Gap after the last participant
- **WHEN** `setSpacing { target: "bank", targetKind: "participant", amount: 50, side: "after" }` runs on the payment sequence
- **THEN** the text gains `gap bank 50 after`, and a second call with `amount: 0` removes it

#### Scenario: A negative gap
- **WHEN** `setSpacing { target: "bank", targetKind: "participant", amount: -16 }` runs on the payment sequence
- **THEN** the text gains `gap bank -16`

#### Scenario: A negative space
- **WHEN** `setSpacing { target: "authorize", targetKind: "event", amount: -8 }` runs
- **THEN** the operation is refused with `edit.invalid-value` saying a space is 0 or more, and the text is unchanged

#### Scenario: A negative gap on the first participant
- **WHEN** `setSpacing { target: "customer", targetKind: "participant", amount: -8 }` runs on the payment sequence, where `customer` is first
- **THEN** the operation is refused with `edit.invalid-value` saying there is nothing left of `customer` to tighten

### Requirement: Inserting events and fragments
- `insertEvent { diagram, after?, inside?, statement }` SHALL insert the text of an event statement after a given event (nested ones included), or first in a fragment branch (`inside: { fragment, branch }`), or last in a call's block (`inside: { message }`, creating the block when the call has none), or at the end, re-indented.
- `wrapInFragment { diagram, events, operator, condition, id? }` SHALL wrap consecutive sibling events, inside a call's block too.
- `unwrapFragment` SHALL replace a fragment with its first branch's events, and SHALL be refused while other branches hold events.
- `addBranch` and `setFragmentCondition` SHALL edit branches.
- `setElementProperty { property: "kind", value: "async" | null }` SHALL set or remove `kind async` on a message.

Every result SHALL compile without new errors.

#### Scenario: Wrap in an option
- **WHEN** `approved` and `success` are wrapped in `opt "Con cupón"`
- **THEN** the two statements are inside `opt "Con cupón" { … }` at their old position, re-indented

#### Scenario: Append a return to a call
- **WHEN** `insertEvent { inside: { message: "pay" }, statement: "return \"OK\"" }` runs on `customer -> api: "Pay" as pay` and again on a `pay` whose block already holds `api -> bank`
- **THEN** the first text becomes `customer -> api: "Pay" as pay {\n    return "OK"\n  }` and the second gains `return "OK"` after `api -> bank`

#### Scenario: Inside a message that is not a call of the diagram
- **WHEN** `insertEvent { inside: { message: "nope" }, statement: "return" }` runs
- **THEN** the operation is refused with `edit.unsafe-target` naming `nope`

### Requirement: Editing events
- `removeEvent { diagram, event }` SHALL remove an activation, lifecycle event, note, divider, delay or fragment (with its events), together with the `space`, styles, animations and scenario choices that name what it removes.
- `renameEvent { diagram, event, newId }` SHALL name or rename a note or fragment and every reference to it; ids are shared with elements and relations.
- `toggleActivation { diagram, participant, after }` SHALL write `activate` after the message and `deactivate` after the participant's first later message back to the sender in the same block (or after the block's last event), or remove that pair when the participant is activated right after the message; on a call that has a block it SHALL be refused with `edit.invalid-value` saying the block already activates the callee.
- `setEventText`, `setNotePlacement` and `setFragmentOperator` SHALL change a note's text or a divider's or delay's label, a note's position and participants, and a fragment's operator with its branch keywords.
- `setFragmentCondition` SHALL carry a changed condition into the scenarios that choose that branch by it; `unwrapFragment` SHALL remove the scenario choices of the fragment.
- `setStyleProperty` SHALL accept named notes and fragments (`targetKind: "event"`), and `reorderParticipant` SHALL accept participant groups.

#### Scenario: Remove a decided fragment
- **WHEN** the fragment `check`, styled and chosen by a scenario, is removed
- **THEN** its messages, its `space`, its style target and the scenario's `choose check` are removed, and the text compiles without errors

#### Scenario: Toggle an activation
- **WHEN** `toggleActivation { participant: "b", after: "ask" }` runs on `a -> b as ask; b -> c; b --> a as reply`
- **THEN** `activate b` follows `ask` and `deactivate b` follows `reply`; running it again restores the text

#### Scenario: Toggle on a call with a block
- **WHEN** `toggleActivation { participant: "b", after: "ask" }` runs on `a -> b as ask { return }`
- **THEN** the operation is refused with `edit.invalid-value` saying the block of `ask` already activates `b`, and the text is unchanged

### Requirement: Shared operations in sequence diagrams
`createElement` SHALL accept the participant kinds and `group` in sequence diagrams. `removeElement` SHALL list messages, activations, lifecycle events, notes and `gap` statements of both sides of the participant as dependents, and cascade into them. `removeRelation` of a call with a block SHALL remove the statement with its block and SHALL list, as `removeEvent` does for a fragment, the dependents of the nested events and relations (their `space`, styles, animations, scenario choices and stories); `setRelationLine` and `reconnectRelation` SHALL refuse a `return` with `edit.invalid-value` naming `unnestCall`. `setPosition`, `setSize`, `setRoute` and `arrange` SHALL be refused with `edit.invalid-value` naming the sequence operations.

#### Scenario: Remove a participant with cascade
- **WHEN** `bank` is removed with cascade from the payment sequence
- **THEN** its declaration and the four messages to or from it are removed, and the text compiles without errors

#### Scenario: Remove a call with a block
- **WHEN** `removeRelation { relation: "pay" }` runs on a `pay` whose block holds `authorize` with `space authorize 20` and a `return` styled by `style receipt { stroke accent }`
- **THEN** the whole statement, `space authorize 20` and `style receipt` are removed, and the text compiles without errors

#### Scenario: A return cannot change its line
- **WHEN** `setRelationLine { relation: "receipt", line: "solid" }` runs on a `return`
- **THEN** the operation is refused with `edit.invalid-value` saying a `return` answers its call and naming `unnestCall`, and the text is unchanged
