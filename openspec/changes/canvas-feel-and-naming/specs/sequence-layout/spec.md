## MODIFIED Requirements

### Requirement: Sequence drawing
The scene SHALL draw:

- heads (actors as figures, the UML kinds with their symbols, databases as cylinders, participants, collections and queues as boxes of 40 units at the bottom of the head row) and dashed lifelines;
- activation bars, nested 5 units apart;
- calls with a filled head, replies dashed with an open head, async calls with an open head, and the same head at the source for two-way messages; `arrowhead` and `arrowtail` styles replace them with any head;
- `create` heads at their row and `destroy` crosses;
- notes; fragment frames with the operator tab, the condition in brackets and dashed branch separators;
- dividers and delays;
- the message number in a disc when `autonumber` is set.

Heads, activation bars, notes, fragment frames and lifelines SHALL be stroked with the theme's `muted` token at `strokeWidth` (lifelines dashed), with `surface` as the fill of heads, bars and notes; messages SHALL keep `connector` at `connectorWidth`; a written `stroke` style on a participant SHALL replace `muted` on its head and lifeline.

`LayoutResult` SHALL report `boxes` for heads, notes and fragments, `connectors` and `labels` for messages, and `events` with each event's row band. The box of a box-kind head SHALL be the box as drawn (the bottom 40 units of the head row; collections include their stack offset), and the box of a figure its cell; each head's scene group SHALL carry that same box as `bounds`. `LayoutResult` SHALL report `shapes` and `radii` for heads: `rounded` with the theme's `radius` for participants, collections, queues and the UML kinds drawn as boxes, `cylinder` for databases.

#### Scenario: Payment sequence
- **WHEN** the payment corpus file is exported
- **THEN** the SVG has a frame with the tab `alt`, the conditions `[Aprobado]` and `[Rechazado]`, one activation bar on `api`, the replies dashed, and it matches the stored snapshot

#### Scenario: Activation bar
- **WHEN** `activate api` follows `customer -> api: "Pagar"` and `deactivate api` comes later
- **THEN** the bar on `api` starts at the arrow of `Pagar` and ends at the last event before `deactivate`

#### Scenario: A box beside an actor
- **WHEN** a diagram declares `actor customer` and `participant api` and is laid out under `technical.light`
- **THEN** the box of `api` in `boxes` and the `bounds` of its scene group are 40 units tall and start 20 units below the top of the head row, equal to the rectangle drawn for it, `shapes` gives `api` `rounded` and `radii` gives it 8, while the box of `customer` is the whole row

#### Scenario: Tokens of the drawing
- **WHEN** the same diagram is laid out
- **THEN** the head of `api`, its lifeline and the activation bars are stroked `#526579`, the lifeline is dashed, and the message connectors are stroked `#526579` at 1.3

#### Scenario: A participant the diagram does not declare
- **WHEN** a message names `billing` and no participant `billing` is declared
- **THEN** `ref.unknown-element` is reported on the message and no layout is produced for the diagram
