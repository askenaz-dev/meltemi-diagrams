## MODIFIED Requirements

### Requirement: Quick fixes and refactors
`codeActions(analysis, range, diagnostics)` SHALL offer one edit plan per action:

| Diagnostic or selection | Actions |
|---|---|
| `layout.missing-placement`, `layout.mode-unsupported` | Arrange the unplaced elements with ELK |
| `layout.placement-ignored` | Switch to `layout assisted`; switch to `layout manual` |
| `ref.unknown-element` | Declare the element as a node |
| `placement.unknown-port` | Declare the port on the facing side; use each existing port |
| `layout.text-overflow` | Set the size to the width in the hint |
| `prop.unknown`, `layout.unknown-theme`, `theme.unknown-class`, `asset.unknown-icon` | Replace with the closest accepted alternative |
| a relation without an id | Name this relation |
| a flow diagram | Arrange diagram (recompute every position) |

Each plan SHALL be verified like any other edit. Fixes SHALL take the ids, alternatives and values they need from the diagnostic's `data`, never from its words, and their titles SHALL be in the interface language.

#### Scenario: Unknown port
- **WHEN** `route publish from api.east to bus.inbox` reports `placement.unknown-port` and `bus` declares `in`
- **THEN** the actions are "Declare port `inbox` on `bus`", which adds `port inbox west` to the block of `bus`, and "Use `bus.in`"

#### Scenario: Ignored placement
- **WHEN** a `layout auto` diagram reports `layout.placement-ignored`
- **THEN** "Switch to `layout assisted`" replaces `layout auto` with `layout assisted` and the diagnostic disappears after the edit

#### Scenario: Fixes in Spanish
- **WHEN** the interface language is Spanish and a diagram writes the unknown property `colour`
- **THEN** the fix is offered with a Spanish title and writes the same replacement as in English

## ADDED Requirements

### Requirement: Services in the interface language
Hover descriptions and keyword documentation, completion details and documentation, rename refusals and the reasons an edit is refused SHALL be in the interface language. Code in them (keywords, values, ids, samples) SHALL stay as written.

#### Scenario: Spanish hover
- **WHEN** the interface language is Spanish and the cursor is on the keyword `place`
- **THEN** the hover describes it in Spanish and keeps `place <id> at (<x>, <y>)` as written

#### Scenario: Spanish refusal
- **WHEN** the interface language is Spanish and a rename to an id already in use is refused
- **THEN** the reason is in Spanish and names both ids in backticks
