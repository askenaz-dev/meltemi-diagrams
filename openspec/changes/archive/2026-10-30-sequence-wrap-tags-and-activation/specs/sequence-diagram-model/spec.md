## ADDED Requirements

### Requirement: Tags
In a sequence diagram, `tag "Text"` SHALL be accepted in the block of a message (calls, replies, async and two-way messages, self-calls and `return`) and in the block of a participant, any number of times, among the block's other properties; in a call's block it SHALL be a property of the call, not an event. `Element.tags` and `Relation.tags` SHALL list the tags in source order as `{ text, range, textRange }`, and SHALL be empty when none are written and on every element and relation of the other profiles. Tags SHALL take no id and SHALL NOT be targets of `style`, `class`, `rule`, `animate`, `link` or stories. Refusals:

- an empty text, or a text holding a line break, SHALL be `prop.invalid-value` on the string, saying a tag is one line of text;
- an id before the text, a value that is not one string, a second string, a block or a chain SHALL be `prop.invalid-value` naming the form `tag "Text"`;
- the same text twice on one owner SHALL be `prop.duplicate` on the second, with the first as related information;
- `tag` in a group block, in a fragment, or at the diagram level of a sequence diagram SHALL be `prop.unknown` with the hint that a tag goes in the block of a message or a participant.

`tag <id> "Text"` keeps its meaning in flow diagrams, and `tag "Text"` in a block of a flow, free or C4 diagram stays `prop.unknown`.

#### Scenario: Tags on a message and a participant
- **WHEN** a sequence diagram has `participant bank "Bank" { tag "external" }` and `api -> bank: "Authorize" as authorize { tag "PKCE"; tag "v2"; kind async }`
- **THEN** it compiles without diagnostics, `bank` has the tags `external`, `authorize` has the tags `PKCE` and `v2` in that order with their ranges and is async, and every other element and relation has an empty `tags`

#### Scenario: A tag in a call's block
- **WHEN** `customer -> api: "Pay" as pay { tag "idempotent"; api -> bank: "Authorize" as authorize; return "OK" }` is compiled
- **THEN** `pay` has the tag `idempotent`, its event holds `authorize` and the `return` and no event for the tag, and nothing is reported

#### Scenario: A tag on a return
- **WHEN** a call's block holds `return "Receipt" as receipt { tag "cached" }`
- **THEN** the relation `receipt` has the tag `cached`

#### Scenario: An empty tag
- **WHEN** a message block holds `tag ""`
- **THEN** `prop.invalid-value` is reported on `""` saying a tag is one line of text, and the message has no tag

#### Scenario: A tag with an id
- **WHEN** a participant block holds `tag t1 "external"`
- **THEN** `prop.invalid-value` is reported naming the form `tag "Text"`

#### Scenario: The same tag twice
- **WHEN** a message block holds `tag "PKCE"` twice
- **THEN** `prop.duplicate` is reported on the second, related to the first, and the message has one tag

#### Scenario: A tag at the diagram level
- **WHEN** a sequence diagram writes `tag "PKCE"` among its events
- **THEN** `prop.unknown` is reported on `tag` with the hint that a tag goes in the block of a message or a participant

#### Scenario: A tag in a group block
- **WHEN** a sequence diagram writes `group core "Core" { tag "internal"; participant api }`
- **THEN** `prop.unknown` is reported on `tag` with the same hint, and `api` is a participant of `core`

#### Scenario: A tag in a flow node's block
- **WHEN** a flow diagram writes `api["API"] { tag "v2" }`
- **THEN** `prop.unknown` is reported on `tag`, as before this change

## MODIFIED Requirements

### Requirement: Messages
`a -> b` SHALL be a call and `a --> b` a reply; `a <-> b` and `a <--> b` SHALL be the same with a head at both ends; `kind async` in the message block SHALL make it asynchronous; `a -> a` SHALL be a self-call. Messages SHALL take labels, `as <id>`, `description`, `class` and `link`-free blocks as relations do, and, in sequence diagrams, a message's block SHALL also hold `tag` statements ("Tags") and event statements ("Call blocks and returns"); a statement in the block that is neither a relation property, a `tag` nor an event SHALL be `prop.unknown` with the hint naming the properties, `tag` and the events. A label SHALL keep a written `\n`, which the layout draws as a line break. `autonumber [n]` SHALL number messages from `n`, 1 by default, returns included.

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
- **THEN** `prop.unknown` is reported on `place` with a hint that names `kind`, `description`, `assumption`, `class`, `tag` and the events a call's block takes

#### Scenario: Tags and properties in one block
- **WHEN** `api -> bank: "Authorize" as authorize { tag "PKCE"; description "Card check" }` is compiled
- **THEN** `authorize` has the tag `PKCE` and the description, and its event holds no events

#### Scenario: A label with a line break
- **WHEN** `api -> bank: "Authorize\nthe card" as authorize` is compiled
- **THEN** the label of `authorize` is the two lines joined by a line break, and nothing is reported
