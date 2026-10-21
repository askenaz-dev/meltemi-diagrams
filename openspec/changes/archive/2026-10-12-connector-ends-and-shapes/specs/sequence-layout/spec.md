## MODIFIED Requirements

### Requirement: Sequence drawing
The scene SHALL draw:

- heads (actors as figures, the UML kinds with their symbols, databases as cylinders) and dashed lifelines;
- activation bars, nested 5 units apart;
- calls with a filled head, replies dashed with an open head, async calls with an open head, and the same head at the source for two-way messages; `arrowhead` and `arrowtail` styles replace them with any head;
- `create` heads at their row and `destroy` crosses;
- notes; fragment frames with the operator tab, the condition in brackets and dashed branch separators;
- dividers and delays;
- the message number in a disc when `autonumber` is set.

`LayoutResult` SHALL report `boxes` for heads, notes and fragments, `connectors` and `labels` for messages, and `events` with each event's row band.

#### Scenario: Payment sequence
- **WHEN** the payment corpus file is exported
- **THEN** the SVG has a frame with the tab `alt`, the conditions `[Aprobado]` and `[Rechazado]`, one activation bar on `api`, the replies dashed, and it matches the stored snapshot

#### Scenario: Activation bar
- **WHEN** `activate api` follows `customer -> api: "Pagar"` and `deactivate api` comes later
- **THEN** the bar on `api` starts at the arrow of `Pagar` and ends at the last event before `deactivate`
