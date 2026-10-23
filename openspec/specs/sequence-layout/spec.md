# sequence-layout Specification

## Purpose
Sequence diagrams are laid out without an engine: columns from the measured heads and `gap`, rows from the events in order and `space`, with lifelines, activation bars, messages, notes, fragment frames, dividers, delays and numbering, and the geometry editors need.
## Requirements
### Requirement: Columns
`layoutDiagram` SHALL lay out sequence diagrams without an engine. Participants SHALL be columns in source order, with heads measured from their labels. Adjacent centres SHALL be at least half of each head plus 40 apart, plus any `gap`, and far enough for the labels of the messages between them (label width plus 24) and for self-calls and side notes.

#### Scenario: A long label widens a gap
- **WHEN** `a -> b: "A rather long message label"` is laid out
- **THEN** the distance between the centres of `a` and `b` is at least the label's measured width plus 24

### Requirement: Rows keep event order
Events SHALL be drawn top to bottom in their order; each event's row SHALL start below the previous one's. `space` SHALL add its amount above an event. Self-calls SHALL loop to the right of their column.

#### Scenario: Order is kept
- **WHEN** a diagram with messages `m1`, `m2` and `m3` in that order is laid out, with `space m2 40`
- **THEN** the arrows' y coordinates increase from `m1` to `m3`, and `m2` is 40 lower than without the `space`

### Requirement: Sequence drawing
The scene SHALL draw:

- heads (actors as figures, the UML kinds with their symbols, databases as cylinders, participants, collections and queues as boxes of 40 units at the bottom of the head row) and dashed lifelines;
- activation bars, nested 5 units apart;
- calls with a filled head, replies dashed with an open head, async calls with an open head, and the same head at the source for two-way messages; `arrowhead` and `arrowtail` styles replace them with any head;
- `create` heads at their row and `destroy` crosses;
- notes; fragment frames with the operator tab, the condition in brackets and dashed branch separators;
- dividers and delays;
- the message number in a disc when `autonumber` is set.

Heads, activation bars, notes, fragment frames and lifelines SHALL be stroked with the theme's `muted` token at `strokeWidth`, lifelines dashed and at half opacity so they stay below the messages, with `surface` as the fill of heads, bars and notes; messages SHALL keep `connector` at `connectorWidth`; a written `stroke` style on a participant SHALL replace `muted` on its head and lifeline.

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
- **THEN** the head of `api`, its lifeline and the activation bars are stroked `#526579`, the lifeline is dashed at half opacity, and the message connectors are stroked `#526579` at 1.3

#### Scenario: An activation of a participant the diagram does not have
- **WHEN** `activate billing` names no participant of the diagram (messages declare the participants they name, so only such a statement can)
- **THEN** `ref.unknown-element` is reported on `billing` and no layout is produced for the diagram

