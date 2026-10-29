# sequence-layout Specification

## Purpose
Sequence diagrams are laid out without an engine: columns from the measured heads and `gap`, rows from the events in order and `space`, with lifelines, activation bars, messages, notes, fragment frames, dividers, delays and numbering, and the geometry editors need.
## Requirements
### Requirement: Columns
`layoutDiagram` SHALL lay out sequence diagrams without an engine. Participants SHALL be columns in source order, with heads measured from their labels. Adjacent centres SHALL be at half of each head plus the diagram's `spacing` (40 scaled by the theme's label size when none is written) plus the `gap` after the left participant and the `gap` before the right one, and never closer than half of each head plus 8; they SHALL be pushed apart as far as the labels of the messages between them (label width plus 24), self-calls and side notes need. A `gap` before the first participant SHALL add room left of it and a `gap` after the last SHALL add room right of it, inside the drawing. When a negative `gap` cannot be honoured because of that floor, the layout SHALL report `layout.gap-floor` (warning) on the `gap` statement, naming the amount applied; a positive `gap` absorbed by a longer label SHALL stay silent.

#### Scenario: A long label widens a gap
- **WHEN** `a -> b: "A rather long message label"` is laid out
- **THEN** the distance between the centres of `a` and `b` is at least the label's measured width plus 24

#### Scenario: Spacing moves every pair
- **WHEN** `a -> b; b -> c` is laid out with `spacing 60` and again without it
- **THEN** the centres of `a` and `b`, and of `b` and `c`, are 20 further apart with `spacing 60`, and the payment corpus SVG is unchanged without it

#### Scenario: A negative gap tightens a pair
- **WHEN** `a -> b` is laid out with `placement { gap b -20 }`
- **THEN** the centres of `a` and `b` are 20 closer than without the gap, and nothing is reported

#### Scenario: The floor wins
- **WHEN** `a -> b: "A rather long message label"` is laid out with `placement { gap b -60 }`
- **THEN** the centres are the label's width plus 24 apart, and `layout.gap-floor` is reported on the `gap` statement naming the amount applied

#### Scenario: Room on the outer sides
- **WHEN** `a -> b` is laid out with `placement { gap a 30; gap b 50 after }`
- **THEN** every column is 30 further right than without the gaps, and the drawing's right edge is 50 further right than the right edge of `b`'s head

### Requirement: Rows keep event order
Events SHALL be drawn top to bottom in their order; each event's row SHALL start below the previous one's. `space … before` SHALL add its amount above an event, `space … after` below it (below the last event, it SHALL extend the lifelines). The events of a call's block SHALL be drawn below the call's arrow and above whatever follows the call, each with its own row; the call's row SHALL be its arrow's row. Self-calls SHALL loop to the right of their column.

#### Scenario: Order is kept
- **WHEN** a diagram with messages `m1`, `m2` and `m3` in that order is laid out, with `space m2 40`
- **THEN** the arrows' y coordinates increase from `m1` to `m3`, and `m2` is 40 lower than without the `space`

#### Scenario: Space after
- **WHEN** the same diagram is laid out with `space m2 40 after`
- **THEN** `m2` is where it was without the `space`, `m3` is 40 lower, and with `space m3 40 after` the lifelines end 40 lower

#### Scenario: Rows of a call block
- **WHEN** `a -> b as call { b -> c as inner; return "OK" as back }; c -> a as later` is laid out
- **THEN** the arrows' y coordinates increase from `call` to `inner` to `back` to `later`, `events` has a row for each of the four, and the row of `call` ends above the row of `inner`

#### Scenario: A negative space is refused before the layout
- **WHEN** `space m2 -10` is written
- **THEN** `prop.invalid-value` is reported by the model and the layout receives no diagram

### Requirement: Sequence drawing
The scene SHALL draw:

- heads (actors as figures, the UML kinds with their symbols, databases as cylinders, participants, collections and queues as boxes of 40 units at the bottom of the head row) and dashed lifelines;
- activation bars, nested 5 units apart: the written `activate`/`deactivate` pairs and, for every call with a block, an implicit bar on the callee from the call's arrow to the block's last event (the arrow of a last `return`), at least 12 tall, with the ends of the nested messages moved to its edge; an `activate` of the callee inside the block nests a deeper bar;
- calls with a filled head, replies dashed with an open head, returns as replies from the callee to the caller, async calls with an open head, and the same head at the source for two-way messages; `arrowhead` and `arrowtail` styles replace them with any head;
- `create` heads at their row and `destroy` crosses;
- notes; fragment frames with the operator tab, the condition in brackets and dashed branch separators;
- dividers and delays;
- the message number in a disc when `autonumber` is set, returns numbered in order.

Heads, activation bars, notes, fragment frames and lifelines SHALL be stroked with the theme's `muted` token at `strokeWidth`, lifelines dashed and at half opacity so they stay below the messages, with `surface` as the fill of heads, bars and notes; messages SHALL keep `connector` at `connectorWidth`; a written `stroke` style on a participant SHALL replace `muted` on its head and lifeline.

`LayoutResult` SHALL report `boxes` for heads, notes and fragments, `connectors` and `labels` for messages and returns, and `events` with each event's row band, nested events included. The box of a box-kind head SHALL be the box as drawn (the bottom 40 units of the head row; collections include their stack offset), and the box of a figure its cell; each head's scene group SHALL carry that same box as `bounds`. `LayoutResult` SHALL report `shapes` and `radii` for heads: `rounded` with the theme's `radius` for participants, collections, queues and the UML kinds drawn as boxes, `cylinder` for databases.

#### Scenario: Payment sequence
- **WHEN** the payment corpus file is exported
- **THEN** the SVG has a frame with the tab `alt`, the conditions `[Aprobado]` and `[Rechazado]`, one activation bar on `api`, the replies dashed, and it matches the stored snapshot

#### Scenario: Activation bar
- **WHEN** `activate api` follows `customer -> api: "Pagar"` and `deactivate api` comes later
- **THEN** the bar on `api` starts at the arrow of `Pagar` and ends at the last event before `deactivate`

#### Scenario: A call block's bar
- **WHEN** `customer -> api: "Pay" as pay { api -> bank: "Authorize" as authorize; return "Receipt" as receipt }` is laid out
- **THEN** one bar is drawn on `api`, from the arrow of `pay` to the arrow of `receipt`, `authorize` starts at the bar's right edge, `receipt` is dashed from the bar's left edge to `customer`'s lifeline, and no bar is drawn on `bank`

#### Scenario: Nested bars from a call inside a call
- **WHEN** `a -> b as outer { b -> b as self { return } }` is laid out
- **THEN** two bars are drawn on `b`, the second 5 units right of the first and inside its span

#### Scenario: A box beside an actor
- **WHEN** a diagram declares `actor customer` and `participant api` and is laid out under `technical.light`
- **THEN** the box of `api` in `boxes` and the `bounds` of its scene group are 40 units tall and start 20 units below the top of the head row, equal to the rectangle drawn for it, `shapes` gives `api` `rounded` and `radii` gives it 8, while the box of `customer` is the whole row

#### Scenario: Tokens of the drawing
- **WHEN** the same diagram is laid out
- **THEN** the head of `api`, its lifeline and the activation bars are stroked `#526579`, the lifeline is dashed at half opacity, and the message connectors are stroked `#526579` at 1.3

#### Scenario: An activation of a participant the diagram does not have
- **WHEN** `activate billing` names no participant of the diagram (messages declare the participants they name, so only such a statement can)
- **THEN** `ref.unknown-element` is reported on `billing` and no layout is produced for the diagram

