## ADDED Requirements

### Requirement: Tag operations
`addTag { diagram, target, targetKind: "element" | "relation", text, index? }` SHALL write `tag "<text>"` in the block of a participant (`element`) or a message (`relation`, a `return` included) of a sequence diagram: before the tag at `index` when it is given, else after the owner's last `tag`, else after the last property statement of the block, before its events, else first in the block; a statement without a block SHALL gain ` { tag "<text>" }`, and an implicit participant SHALL be declared with that block first. `setTag { diagram, target, targetKind, index, text }` SHALL rewrite the string of the tag at `index`, and `removeTag { diagram, target, targetKind, index }` SHALL delete its statement, and the block too when it held nothing else. They SHALL never touch the owner's other statements, comments or events. Refused:

- a diagram that is not a sequence diagram, a target that is neither a participant nor a message of the diagram, and an `index` that names no tag of the owner (an `index` of `addTag` past the last tag is the end): `edit.unsafe-target` naming the rule;
- an empty text, a text with a line break, and a text the owner already has: `edit.invalid-value` naming the rule.

Every result SHALL compile without new errors.

#### Scenario: A tag on a message without a block
- **WHEN** `addTag { target: "a->b#1", targetKind: "relation", text: "PKCE" }` runs on `a -> b: "Ask"`
- **THEN** the text becomes `a -> b: "Ask" { tag "PKCE" }`

#### Scenario: A tag on a call with events
- **WHEN** `addTag { target: "pay", targetKind: "relation", text: "v2" }` runs on `customer -> api: "Pay" as pay {\n    kind async\n    api -> bank: "Authorize"\n    return "OK"\n  }`
- **THEN** `tag "v2"` is written on its own line after `kind async` and before `api -> bank: "Authorize"`, and the events of `pay` are unchanged

#### Scenario: A tag on an implicit participant
- **WHEN** `addTag { target: "bank", targetKind: "element", text: "external" }` runs on a diagram where `bank` is only named by messages
- **THEN** the text gains `participant bank { tag "external" }` among the participants, and the messages are unchanged

#### Scenario: A tag at an index
- **WHEN** `addTag { target: "pay", targetKind: "relation", text: "v1", index: 0 }` runs on a `pay` whose block holds `tag "v2"`
- **THEN** `tag "v1"` is written before `tag "v2"`

#### Scenario: Edit and remove
- **WHEN** `setTag { target: "a->b#1", targetKind: "relation", index: 0, text: "OAuth" }` and then `removeTag { target: "a->b#1", targetKind: "relation", index: 0 }` run on `a -> b: "Ask" { tag "PKCE" }`
- **THEN** the text is `a -> b: "Ask" { tag "OAuth" }`, then `a -> b: "Ask"`

#### Scenario: An empty or repeated tag
- **WHEN** `addTag` runs with the text `""`, and again with `PKCE` on a message that has the tag `PKCE`
- **THEN** both are refused with `edit.invalid-value`, the first saying a tag is one line of text and the second naming the tag the message already has, and the text is unchanged

#### Scenario: A tag outside a sequence diagram
- **WHEN** `addTag { target: "api", targetKind: "element", text: "v2" }` runs on a flow diagram, or `removeTag` names an index the owner has no tag at
- **THEN** both are refused with `edit.unsafe-target` naming the rule, and the text is unchanged

## MODIFIED Requirements

### Requirement: Explicit event moves
`moveEvent { diagram, event, direction }` SHALL move an event statement up or down past its neighbour in the same block, or into the nearest branch of an adjacent fragment or the block of an adjacent call (moving up into a call's block puts the event before a trailing `return`), or out of the fragment or the call at its edge. `moveEvent { diagram, event, to: { after: <event> } | { before: <event> } }` SHALL instead move the statement right after or right before the statement of the named event, in the block that holds it (the diagram's, a fragment branch's or a call's), at its indentation and with its comments, in one relocation checked once on its result. Exactly one of `direction` and `to` SHALL be given; both or neither SHALL be refused with `edit.invalid-value`. A destination that names no event of the diagram, the moved event itself, or an event inside the moved fragment or call SHALL be refused with `edit.unsafe-target`. A move whose result breaks the order-checked rules, or puts a `return` outside its call or after another `return`, SHALL be refused with `edit.invalid-value` naming the rule.

#### Scenario: Refused move
- **WHEN** `deactivate api` would move above `activate api`
- **THEN** the move is refused with `edit.invalid-value`, and the text is unchanged

#### Scenario: Into and out of a call block
- **WHEN** `moveEvent { event: "log", direction: "up" }` runs on `a -> b as call { b -> c as inner; return }; a -> log: "Log" as log`
- **THEN** `log` is inside `call`'s block after `inner` and before the `return`; moved up twice more it is first in the block, then before `call`

#### Scenario: A return cannot leave its call
- **WHEN** `moveEvent { event: "api->customer#1", direction: "down" }` runs on the `return` that is the last event of a call's block
- **THEN** the move is refused with `edit.invalid-value` naming `sequence.return`, and the text is unchanged

#### Scenario: A move to a destination
- **WHEN** `moveEvent { event: "deactivate#1", to: { after: "fetch" } }` runs on `a -> b as ask; activate b; b -> c as fetch; b -> c as store; b --> a as reply; deactivate b`
- **THEN** `deactivate b` follows `fetch`, every other statement keeps its place and text, and the text compiles without errors

#### Scenario: A destination in a fragment branch
- **WHEN** `moveEvent { event: "note#1", to: { before: "approved" } }` runs on the payment sequence with a `note over api "Checking"` after the fragment
- **THEN** the note is the first statement of the fragment's first branch, re-indented to it

#### Scenario: A destination that breaks the order
- **WHEN** `moveEvent { event: "activate#1", to: { after: "reply" } }` runs on `a -> b as ask; activate b; b -> c as fetch; deactivate b; b --> a as reply`
- **THEN** the move is refused with `edit.invalid-value` naming `sequence.activation`, and the text is unchanged

#### Scenario: Two forms or a destination inside the event
- **WHEN** `moveEvent` is given both `direction` and `to`, and then a fragment is moved `to: { after: <an event of its own branch> }`
- **THEN** the first is refused with `edit.invalid-value` and the second with `edit.unsafe-target`, and the text is unchanged

### Requirement: Editing events
- `removeEvent { diagram, event }` SHALL remove an activation, lifecycle event, note, divider, delay or fragment (with its events), together with the `space`, styles, animations and scenario choices that name what it removes. An `activate` SHALL be removed with its matching `deactivate` (the participant's first `deactivate` at the same depth after it, in order) and a `deactivate` with its `activate`, in the same edit; an `activate` open to the end SHALL be removed alone. `removeEvent { diagram, event, alone: true }` SHALL remove an `activate` or a `deactivate` without its other end, still refused when the result has new errors: the canvas's removal reads every pair on the text before any removal and removes each end by its key, skipping the ends a removed fragment or call already removes and removing the other end of an activation that a removed fragment or call cuts in two, so that removing several things never pairs an end with another activation's.
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

#### Scenario: Remove an activation
- **WHEN** `removeEvent { event: "activate#1" }` runs on `a -> b as ask; activate b; b -> c; deactivate b; b --> a as reply`
- **THEN** both `activate b` and `deactivate b` are removed in one edit, and the text compiles without errors

#### Scenario: Remove by the deactivation
- **WHEN** `removeEvent { event: "deactivate#2" }` runs on a diagram where `b` is activated twice, nested, and `deactivate#2` closes the outer activation
- **THEN** the outer `activate b` and `deactivate#2` are removed, the inner pair stays, and the text compiles without errors

#### Scenario: Remove an open activation
- **WHEN** `removeEvent { event: "activate#1" }` runs on `a -> b as ask; activate b; b -> c` with no `deactivate`
- **THEN** only `activate b` is removed

#### Scenario: Remove an end alone
- **WHEN** a batch reads the pairs of two nested activations of `b`, removes a fragment holding the inner `deactivate`, then runs `removeEvent { event: <the inner activate>, alone: true }`
- **THEN** only the inner `activate b` and the fragment are removed, the outer pair stays, and the text compiles without errors

#### Scenario: A removed call cuts an activation in two
- **WHEN** the canvas removes the call `m` whose block holds `activate c`, closed by a `deactivate c` after the block
- **THEN** the call with its block and that `deactivate c` are removed in one edit, and the text compiles without errors
