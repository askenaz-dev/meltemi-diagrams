## MODIFIED Requirements

### Requirement: Messages
`a -> b` SHALL be a call and `a --> b` a reply; `a <-> b` and `a <--> b` SHALL be the same with a head at both ends; `kind async` in the message block SHALL make it asynchronous; `a -> a` SHALL be a self-call. Messages SHALL take labels, `as <id>`, `description`, `class` and `link`-free blocks as relations do. `autonumber [n]` SHALL number messages from `n`, 1 by default.

#### Scenario: Async message
- **WHEN** `api -> queue: "Publish" as publish { kind async }` is compiled
- **THEN** relation `publish` is a call with `async` true

#### Scenario: Two-way message
- **WHEN** `api <-> cache: "Sync"` is compiled
- **THEN** the message is a call from `api` to `cache` with `twoWay` true
