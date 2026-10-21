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
`a -> b` SHALL be a call and `a --> b` a reply; `a <-> b` and `a <--> b` SHALL be the same with a head at both ends; `kind async` in the message block SHALL make it asynchronous; `a -> a` SHALL be a self-call. Messages SHALL take labels, `as <id>`, `description`, `class` and `link`-free blocks as relations do. `autonumber [n]` SHALL number messages from `n`, 1 by default.

#### Scenario: Async message
- **WHEN** `api -> queue: "Publish" as publish { kind async }` is compiled
- **THEN** relation `publish` is a call with `async` true

#### Scenario: Two-way message
- **WHEN** `api <-> cache: "Sync"` is compiled
- **THEN** the message is a call from `api` to `cache` with `twoWay` true

### Requirement: Ordered events
The diagram SHALL expose `events`, the ordered tree of its events, and `eventsByKey`. Events SHALL be messages, `activate`, `deactivate`, `create`, `destroy`, notes, fragments, `divider` and `delay`. Fragments SHALL be `alt`/`else`, `opt`, `loop`, `par`/`and`, `break`, `critical`/`option` and `region`, with an optional id before the condition, and SHALL nest. Notes SHALL be `note [id] over p[, q] "T"`, `note [id] left of p "T"` and `note [id] right of p "T"`. Message events SHALL use their relation key; other events their id, or `<kind>#<n>` in order of appearance.

#### Scenario: Nested fragments
- **WHEN** a `loop retries "Hasta 3"` holds an `alt check "OK"` with an `else` branch
- **THEN** `eventsByKey` holds `retries` with one branch whose events include `check`, which has two branches

### Requirement: Order-checked rules
Events SHALL be checked in order:

- `deactivate` of a participant that is not active SHALL be `sequence.activation`;
- an event involving a destroyed participant, `create` after the participant appeared or twice, and `destroy` twice SHALL be `sequence.lifecycle`;
- an unknown participant in an event SHALL be `ref.unknown-element`.

The branches of `alt`, `par` and `critical` SHALL each start from the state before the fragment, and the state after it SHALL be the first branch's. Open activations at the end SHALL be allowed.

#### Scenario: Each branch deactivates
- **WHEN** `activate api` is followed by `alt` whose two branches each `deactivate api`
- **THEN** nothing is reported

#### Scenario: Message after destroy
- **WHEN** `destroy session` is followed by `api -> session: "Ping"`
- **THEN** `sequence.lifecycle` is reported on the message

### Requirement: Sequence placement
In sequence diagrams, `placement` SHALL accept `space <event> <n>` (extra space above a named event, n ≥ 0), `gap <participant> <n>` (extra space before a participant) and `label <message> at <n>% offset (dx, dy)`. `place`, `size`, `route` and the constraints SHALL be `prop.unknown` with a hint naming `space` and `gap`.

#### Scenario: Place in a sequence
- **WHEN** a sequence diagram writes `place api at (100, 100)`
- **THEN** `prop.unknown` is reported with the hint naming `space` and `gap`

### Requirement: Sequence diagrams in JSON
Sequence diagrams SHALL be serialised with `type` `sequence`, the participants as elements, the messages as relations with `async`, `properties.autonumber`, an `events` tree (each event with `key`, `kind`, its fields and `range`), and `scenarios`.

#### Scenario: Payment JSON
- **WHEN** the payment corpus file is serialised
- **THEN** the JSON has `type` `sequence`, five messages, and an `events` array whose fourth entry is a fragment with operator `alt` and two branches, matching the stored snapshot

