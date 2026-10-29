# sequence-diagram-model Specification

## Purpose
Sequence diagrams compile into the shared model: participants of eight kinds and their groups, messages with `kind async`, and the ordered tree of events (activations, lifecycle, notes, fragments, dividers, delays), checked in order by the activation and lifecycle rules.
## Requirements
### Requirement: Sequence diagrams compile
`diagram <id>: sequence { }` SHALL compile into the shared diagram model with `type` set to `sequence`. Participants SHALL be elements of the kinds `participant`, `actor`, `boundary`, `control`, `entity`, `database`, `collections` and `queue`, and `group <id> ["Label"] { … }` SHALL group participants. An undeclared message end SHALL be an implicit `participant`. Flow and free kinds SHALL be `prop.unknown` with a hint listing the sequence vocabulary.

#### Scenario: The proposal's payment sequence
- **WHEN** the proposal's payment sequence is compiled
- **THEN** it compiles without errors, `customer` is an actor, `api` and `bank` are participants, and the events are `pay`, `activate api`, `authorize`, an `alt` fragment of two branches with two messages each, and `deactivate api`

### Requirement: Messages
`a -> b` SHALL be a call and `a --> b` a reply; `a <-> b` and `a <--> b` SHALL be the same with a head at both ends; `kind async` in the message block SHALL make it asynchronous; `a -> a` SHALL be a self-call. Messages SHALL take labels, `as <id>`, `description`, `class` and `link`-free blocks as relations do, and, in sequence diagrams, a message's block SHALL also hold event statements ("Call blocks and returns"); a statement in the block that is neither a relation property nor an event SHALL be `prop.unknown` with the hint naming the properties and the events. `autonumber [n]` SHALL number messages from `n`, 1 by default, returns included.

#### Scenario: Async message
- **WHEN** `api -> queue: "Publish" as publish { kind async }` is compiled
- **THEN** relation `publish` is a call with `async` true

#### Scenario: Two-way message
- **WHEN** `api <-> cache: "Sync"` is compiled
- **THEN** the message is a call from `api` to `cache` with `twoWay` true

#### Scenario: A call with a block
- **WHEN** `customer -> api: "Pay" as pay { api -> bank: "Authorize" }` is compiled
- **THEN** `pay` is a call whose event holds the message `api->bank#1`, and the relations are `pay` and `api->bank#1` in that order

#### Scenario: An unknown statement in a message block
- **WHEN** `customer -> api: "Pay" { place api at (1, 2) }` is compiled
- **THEN** `prop.unknown` is reported on `place` with a hint that names `kind`, `description`, `assumption`, `class` and the events a call's block takes

### Requirement: Ordered events
The diagram SHALL expose `events`, the ordered tree of its events, and `eventsByKey`. Events SHALL be messages, `activate`, `deactivate`, `create`, `destroy`, notes, fragments, `divider` and `delay`. Fragments SHALL be `alt`/`else`, `opt`, `loop`, `par`/`and`, `break`, `critical`/`option` and `region`, with an optional id before the condition, and SHALL nest. Notes SHALL be `note [id] over p[, q] "T"`, `note [id] left of p "T"` and `note [id] right of p "T"`. Message events SHALL use their relation key; other events their id, or `<kind>#<n>` in order of appearance across the whole tree. A message event SHALL hold `events`, the ordered events of its block (empty without one), and every event SHALL carry its `path`: outermost first, `{ fragment, branch }` for a fragment branch and `{ message }` for a call's block.

#### Scenario: Nested fragments
- **WHEN** a `loop retries "Hasta 3"` holds an `alt check "OK"` with an `else` branch
- **THEN** `eventsByKey` holds `retries` with one branch whose events include `check`, which has two branches

#### Scenario: Events of a call
- **WHEN** `loop retries { customer -> api: "Pay" as pay { note over api "Checking"; return "OK" } }` is compiled
- **THEN** `pay` holds the events `note#1` and `api->customer#1`, whose `path` is `[{ fragment: "retries", branch: 0 }, { message: "pay" }]`, and `eventsByKey` resolves all four keys

#### Scenario: A participant declared inside a call
- **WHEN** a call's block holds `participant audit "Audit"`
- **THEN** `prop.unknown` is reported saying participants are declared at the diagram level

### Requirement: Order-checked rules
Events SHALL be checked in order:

- `deactivate` of a participant that is not active SHALL be `sequence.activation`;
- an event involving a destroyed participant, `create` after the participant appeared or twice, and `destroy` twice SHALL be `sequence.lifecycle`;
- an unknown participant in an event SHALL be `ref.unknown-element`;
- inside a call's block the callee SHALL count as active one level deeper; a `deactivate` of the callee that would end that implicit level SHALL be `sequence.activation` naming the call, while an `activate` of the callee inside the block and its `deactivate` SHALL be checked as a deeper level;
- a `return` outside a call's block and an event after a `return` in its list SHALL be `sequence.return` ("Call blocks and returns").

The branches of `alt`, `par` and `critical` SHALL each start from the state before the fragment, and the state after it SHALL be the first branch's. Open activations at the end SHALL be allowed.

#### Scenario: Each branch deactivates
- **WHEN** `activate api` is followed by `alt` whose two branches each `deactivate api`
- **THEN** nothing is reported

#### Scenario: Message after destroy
- **WHEN** `destroy session` is followed by `api -> session: "Ping"`
- **THEN** `sequence.lifecycle` is reported on the message

#### Scenario: Deactivate inside a call block
- **WHEN** `customer -> api: "Pay" as pay { deactivate api }` is compiled
- **THEN** `sequence.activation` is reported on `deactivate api`, saying `api` is active for the call `pay` and its bar ends with the block

#### Scenario: An explicit activation inside a call block
- **WHEN** `customer -> api: "Pay" as pay { activate api; api -> api: "Check"; deactivate api; return "OK" }` is compiled
- **THEN** nothing is reported

### Requirement: Sequence placement
In sequence diagrams, `placement` SHALL accept `space <event> <n> [before|after]` (extra space above or below a named event, n ≥ 0), `gap <participant> <n> [before|after]` (extra space left or right of a participant; n may be negative, except before the first participant and after the last, where a negative n SHALL be `prop.invalid-value` with a hint saying there is nothing to tighten) and `label <message> at <n>% offset (dx, dy)`. `before` SHALL be the default side, a third argument that is neither word SHALL be `prop.invalid-value` naming the form, and `placement.duplicate` SHALL be per target and side. The diagram property `spacing <n>` (0 to 400) SHALL set the base distance between adjacent heads. `place`, `size`, `route` and the constraints SHALL be `prop.unknown` with a hint naming `space` and `gap`.

#### Scenario: Place in a sequence
- **WHEN** a sequence diagram writes `place api at (100, 100)`
- **THEN** `prop.unknown` is reported with the hint naming `space` and `gap`

#### Scenario: Spacing, sides and a negative gap
- **WHEN** a sequence diagram writes `spacing 56` and `placement { gap bank 40 after; gap api -12; space pay 20 after }`
- **THEN** it compiles without diagnostics, `properties.spacing` is 56, the entries are `gap bank 40 after`, `gap api -12 before` and `space pay 20 after`

#### Scenario: A negative gap on the edge
- **WHEN** `customer` is the first participant and `placement { gap customer -10 }` is written
- **THEN** `prop.invalid-value` is reported on `-10` with the hint saying there is nothing left of `customer` to tighten

#### Scenario: A side that is not a side
- **WHEN** `placement { gap bank 40 beside }` is written
- **THEN** `prop.invalid-value` is reported on `beside` naming the form `gap <participant> <n> [before|after]`

#### Scenario: Both sides of one pair
- **WHEN** `placement { gap api 20 after; gap bank 20 }` is written and `bank` follows `api`
- **THEN** both entries are kept and nothing is reported

### Requirement: Sequence diagrams in JSON
Sequence diagrams SHALL be serialised with `type` `sequence`, the participants as elements, the messages as relations with `async` and `returns` (the key of the call a `return` answers, null otherwise), `properties.autonumber` and `properties.spacing`, `placement` entries of `space` and `gap` with their `side`, an `events` tree (each event with `key`, `kind`, its fields and `range`; a message event with its `events`), and `scenarios`.

#### Scenario: Payment JSON
- **WHEN** the payment corpus file is serialised
- **THEN** the JSON has `type` `sequence`, five messages, and an `events` array whose fourth entry is a fragment with operator `alt` and two branches, matching the stored snapshot

#### Scenario: Calls JSON
- **WHEN** `corpus/valid/sequence/calls.meltemi` is serialised
- **THEN** `properties.spacing` is 56, the `gap` entries carry `side`, the relation of the `return` has `returns` set to its call's key, the call's event holds its nested `events`, and the JSON matches the stored snapshot

#### Scenario: Defaults in JSON
- **WHEN** the payment corpus file is serialised
- **THEN** every relation has `returns` null, `properties.spacing` is null, every `space` and `gap` entry has `side` `before`, and every message event has an empty `events`

### Requirement: Call blocks and returns
In a sequence diagram the block of a message SHALL hold, besides its properties, event statements: messages, `return`, `activate`, `deactivate`, `create`, `destroy`, notes, fragments, `divider` and `delay`. The events of a call's block SHALL happen inside the call: after its arrow and before whatever follows the statement, and the callee (`to`) SHALL be active for the block, from the call's arrow to the block's last event, without an `activate` being written. `return ["Label"] [as <id>] [{ properties }]` inside a call's block SHALL be a reply from the callee to the caller of the innermost enclosing call: a relation with `line` `dashed`, `heads` `end`, `async` false, the label, id and block properties written, and `returns` set to the call's key; its key SHALL be `id ?? <callee>-><caller>#<n>`, counted in source order with every other relation of that pair. A `return` outside any call's block, and any event after a `return` in the same statement list, SHALL be `sequence.return` with a hint naming the form; a `return` inside a fragment branch of a call SHALL end that branch's list only. A block SHALL be accepted on a self-call, an async call, a two-way message and a written reply, and fragments and calls with blocks SHALL nest in each other.

#### Scenario: A call inside a call
- **WHEN** `customer -> api: "Pay" as pay { api -> bank: "Authorize" as authorize { return "OK" as ok }; return "Receipt" }` is compiled
- **THEN** it compiles without diagnostics, `pay` holds the events `authorize` and `api->customer#1`, `authorize` holds `ok`, `ok` is a relation from `bank` to `api` with `line` `dashed` and `returns` `authorize`, and `api->customer#1` has `returns` `pay`

#### Scenario: A return outside a call
- **WHEN** a sequence diagram writes `return "OK"` at the diagram level, or inside a fragment that is not inside a call's block
- **THEN** `sequence.return` is reported on the statement with the hint naming `a -> b { … return }`, and no relation is made for it

#### Scenario: An event after a return
- **WHEN** a call's block holds `return "OK"` followed by `api -> bank: "Log"`
- **THEN** `sequence.return` is reported on `api -> bank: "Log"`, naming the call that already returned

#### Scenario: A return in one branch
- **WHEN** a call's block holds `alt "OK" { return "Yes" } else "No" { return "No" }` followed by `api -> log: "Done"`
- **THEN** nothing is reported: each `return` ends its branch, and `api -> log: "Done"` is the block's last event

#### Scenario: Properties keep working in a call block
- **WHEN** `api -> queue: "Publish" as publish { kind async; description "Fire and forget"; queue -> worker: "Work" }` is compiled
- **THEN** `publish` is async with the description, and `queue -> worker: "Work"` is an event of its block

