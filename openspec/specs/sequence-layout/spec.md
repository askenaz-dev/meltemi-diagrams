# sequence-layout Specification

## Purpose
Sequence diagrams are laid out without an engine: columns from the measured heads and `gap`, rows from the events in order and `space`, with lifelines, activation bars, messages, notes, fragment frames, dividers, delays and numbering, and the geometry editors need.
## Requirements
### Requirement: Columns
`layoutDiagram` SHALL lay out sequence diagrams without an engine. Participants SHALL be columns in source order, with heads measured from their labels. Adjacent centres SHALL be at half of each head plus the diagram's `spacing` (40 scaled by the theme's label size when none is written) plus the `gap` after the left participant and the `gap` before the right one when their sum is positive, and never closer than half of each head plus 8, a head counting as the wider of itself and its row of tags; they SHALL be pushed apart as far as the messages between them need on one line: each label's width plus 24, plus 22 when `autonumber` is on, and the row of a message's tags plus 24, the disc and the arrowhead; and as far as self-calls (whose labels stay on one line beside the loop) and side notes need. That is the pair's natural distance, and a positive `gap` absorbed by a longer label SHALL stay silent. A pull SHALL bring the pair closer than its natural distance by its amount: a negative sum of the two `gap`s, and a `spacing` below the default by the difference (the natural distance then counting the default). The pull SHALL stop at the pair's floor: half of each head plus 8, the longest word of each label between them (its words split at spaces and `\n`) plus 24 and the disc, the row of a message's tags plus 24, the disc and the arrowhead, self-calls and side notes; a message spanning several columns SHALL push the natural columns with its whole label and the pulled ones with its longest word. A creating message, whose arrow ends on the near edge of the head it makes, SHALL count half that head on top of each of these lengths, and its label's room SHALL be the arrow's length minus 24 and the disc. A label left less room than its width wraps ("Message labels wrap"). A `gap` before the first participant SHALL add room left of it and a `gap` after the last SHALL add room right of it, inside the drawing. When a negative `gap` cannot be honoured because of that floor, the layout SHALL report `layout.gap-floor` (warning) on the `gap` statement, naming the amount applied, measured from the natural distance.

#### Scenario: A long label widens a gap
- **WHEN** `a -> b: "Authorization_with_a_long_identifier"`, one word, is laid out
- **THEN** the distance between the centres of `a` and `b` is at least the word's measured width plus 24

#### Scenario: Spacing moves every pair
- **WHEN** `a -> b; b -> c` is laid out with `spacing 60` and again without it
- **THEN** the centres of `a` and `b`, and of `b` and `c`, are 20 further apart with `spacing 60`, and the payment corpus SVG is unchanged without it

#### Scenario: A negative gap tightens a pair
- **WHEN** `a -> b` is laid out with `placement { gap b -20 }`
- **THEN** the centres of `a` and `b` are 20 closer than without the gap, and nothing is reported

#### Scenario: A long label no longer holds a pair apart
- **WHEN** `a -> b: "Esto es una prueba de un texto Largo"` is laid out with `placement { gap b -20 }`
- **THEN** the centres of `a` and `b` are 20 closer than without the gap, the label is drawn on more than one line between them, and nothing is reported

#### Scenario: A small spacing pulls labelled pairs
- **WHEN** `a -> b: "Esto es una prueba de un texto Largo"` is laid out with `spacing 20` and again without it
- **THEN** the centres of `a` and `b` are closer with `spacing 20` by the default spacing minus 20, and the label is drawn on more than one line between them

#### Scenario: The floor wins
- **WHEN** `a -> b: "Authorization_with_a_long_identifier"` is laid out with `placement { gap b -60 }`
- **THEN** the centres are the word's width plus 24 apart, and `layout.gap-floor` is reported on the `gap` statement naming the amount applied

#### Scenario: Tags hold a pair apart
- **WHEN** `a -> b: "Go" { tag "idempotent"; tag "retry-safe" }` is laid out with `placement { gap b -60 }`
- **THEN** the centres are at least the row of the two pills plus 24 and the arrowhead apart, and `layout.gap-floor` is reported on the `gap` statement

#### Scenario: Tags on a creating message
- **WHEN** `create participant b` is followed by `a -> b: "New" { tag "one"; tag "two"; tag "three" }`
- **THEN** the last pill ends before the arrowhead, which ends on the near edge of `b`'s head, and no pill touches that head

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

### Requirement: Message labels wrap
The label of a message between two different participants SHALL be drawn on one line when its room holds it, and wrapped at its room when a pull left less ("Columns"): the room is the distance between the two lifelines minus 24, and minus 22 more when `autonumber` is on, and the label is broken by `wrapLines` with the layout's measurer at the label's font (body, weight 400, `relationLabelSize`): at each `\n`, then at spaces, a word wider than the room broken between characters. Its lines SHALL be 1.25 times the label size apart, each drawn as its own text item, centred, in the message's label group. The block of lines SHALL be `relationLabelHeight` plus that distance for each line after the first high and its widest line plus 8 wide, and SHALL be placed as a one-line label is: its bottom just above the arrow (higher by half a tag's height plus 2 when the message has tags), centred at `at` along the arrow, moved by `label <message> at n% offset (dx, dy)`, which SHALL NOT change the room. The message's row SHALL grow by the extra lines, the arrow drawn under the last one, and the head a creating message draws SHALL be lower by the same amount. A self-call's label SHALL NOT wrap: it SHALL stay beside the loop, broken at `\n` only, its lines centred on the loop's middle, the row growing when they are taller than the loop. `LayoutResult.labels` SHALL hold each block, and `LayoutResult.messageTexts` SHALL hold, per message key, the room (`area`: the block's top and height, the room's width centred on the block), the `lines` as drawn, the `size`, the `line` distance and `wraps` (true when a pull caps the room; false for a self-call and for a pair at its natural distance, whose label pushes its columns instead), in diagram coordinates.

#### Scenario: A long label between two lifelines
- **WHEN** `actor customer`, `participant web` and `participant api` are laid out under `technical.light` with `spacing 8` and `customer -> api: "Esto es una prueba de un texto Largo" as test`, so the room between the lifelines of `customer` and `api` is narrower than the label
- **THEN** the label of `test` is drawn as at least two text items, each no wider than the distance between the lifelines of `customer` and `api` minus 24, their baselines 13.75 apart, the arrow is below the last one, the row of `test` is 13.75 taller than a one-line message's for each line after the first, and `messageTexts` gives `test` that room and those lines

#### Scenario: A label keeps its line
- **WHEN** the same diagram is laid out without `spacing 8`
- **THEN** the label of `test` is one text item, and the lifelines of `customer` and `api` are at least its measured width plus 24 apart

#### Scenario: A line break
- **WHEN** `a -> b: "One\nTwo" as m` is laid out
- **THEN** the label of `m` is two lines, `One` above `Two`, though both would fit on one

#### Scenario: A numbered message
- **WHEN** the same diagram is laid out with `autonumber`
- **THEN** the room of `test` in `messageTexts` is 22 narrower than without it

#### Scenario: A self-call keeps its line
- **WHEN** `a -> a: "Validate the whole incoming request" as check` is laid out
- **THEN** the label of `check` is one text item beside the loop, and `messageTexts` gives `check` with `wraps` false

#### Scenario: A moved label keeps its lines
- **WHEN** the diagram of the first scenario adds `placement { label test at 25% offset (0, -10) }`
- **THEN** the lines of `test` are the same, and its block is centred a quarter of the way along the arrow and 10 higher

#### Scenario: Rows below move down
- **WHEN** `customer -> api: "Esto es una prueba de un texto Largo" as test` is followed by `api --> customer: "OK" as ok`
- **THEN** the arrow of `ok` is lower than with a one-line label for `test` by 13.75 for each extra line of `test`

#### Scenario: A label position out of range is refused before the layout
- **WHEN** `placement { label test at 150% offset (0, 0) }` is written
- **THEN** `prop.invalid-value` is reported by the model on `150%` and no layout is produced for the diagram

### Requirement: Tags are drawn
Each tag of a message or a participant SHALL be drawn as the flow tag's pill: its text in the mono font at `tagSize`, weight 500, in the theme's `tagText`, on a pill `tagHeight` high and its text plus `tagPadding` wide, filled and stroked with the theme's `tag`.

- **On a message**, the pills SHALL form a row in source order, left to right, 4 apart, centred on the arrow's line and drawn over it, the end of the row nearest the source 6 units from the arrow's start, or 12 when the message is numbered; the pair's column constraint SHALL hold the row plus 24, the disc and the arrowhead. On a self-call the row SHALL sit on the loop's top segment from its source end, and the label beside the loop SHALL start after the wider of the loop and the row.
- **On a participant**, the pills SHALL form a row in source order, 4 apart, centred on the head's centre line: their middle on the top edge of the box as drawn for a participant, database, collections or queue, and their bottom 4 above the figure for an actor, boundary, control or entity. When any participant of the diagram has tags, the row of heads SHALL start lower by the room they need above it (half a tag's height for box kinds, a tag's height plus 4 for figures, the larger), and a head drawn by `create` SHALL take the same room in its row.

Each pill SHALL be a scene group of role `tag` whose id is its owner's id or key and whose `tag` is its index, inside the owner's group (in a message's group, after its label group), so that effects, highlights and stories that target the owner draw its tags with it. `LayoutResult.tags` SHALL give, per owner, its pills' boxes in diagram coordinates.

#### Scenario: Pills on a message
- **WHEN** `api -> bank: "Authorize" as authorize { tag "PKCE"; tag "v2" }` is laid out under `technical.light`
- **THEN** two pills 18 units high are drawn filled with the theme's `tag` and lettered in `tagText` at 10.5 px in the mono font, centred on the arrow of `authorize`, `PKCE` left of `v2` with 4 between them, the left edge of `PKCE` 6 right of the arrow's start; their groups have role `tag`, id `authorize` and `tag` 0 and 1 and follow the label group inside the group of `authorize`; and the label's block is 11 higher than without tags

#### Scenario: A message from right to left
- **WHEN** `bank --> api: "OK" as ok { tag "cached" }` is laid out with `api` left of `bank`
- **THEN** the pill's right edge is 6 left of the arrow's start at `bank`'s side

#### Scenario: A badge on a participant
- **WHEN** `participant bank "Bank" { tag "external" }` is laid out under `technical.light` beside `participant api "API"`
- **THEN** the pill is centred on the head of `bank` with its middle on the top edge of the box, every head is drawn 9 lower than without the tag, and `tags` gives `bank` that pill

#### Scenario: A badge on an actor
- **WHEN** `actor customer "Customer" { tag "VIP" }` is laid out
- **THEN** the pill is centred on the figure with its bottom 4 above the figure's top

#### Scenario: Tags go with their owner
- **WHEN** a story scene hides `bank`, whose block has `tag "external"`
- **THEN** the frame draws the pill of `bank` at the opacity of `bank`'s head, hidden with it

#### Scenario: A misplaced tag is refused before the layout
- **WHEN** a sequence diagram writes `tag "core"` in a group block
- **THEN** `prop.unknown` is reported by the model and no layout is produced for the diagram

### Requirement: Activation bars as objects
Every activation bar SHALL be drawn as its own scene group inside its participant's `lifeline` group, with `bounds` equal to its rectangle: of role `event` with its `activate` key as id for a written bar, and of role `event` with the call's key as id for the bar a call's block draws. The rectangles, their order, their colours and the lifeline SHALL be drawn as before. `LayoutResult.boxes` SHALL hold each written bar by its `activate` key, and `LayoutResult.bars` SHALL give, per `activate` key or call key, the participant, the box, the depth, `from` (the key of the `activate` or the call), `to` (the key of the matching `deactivate`, null for a bar open to the end or drawn by a call's block) and `block` (whether a call's block draws it), in diagram coordinates.

#### Scenario: A written bar
- **WHEN** the payment corpus file is laid out
- **THEN** the lifeline group of `api` holds a group of role `event` and id `activate#1` whose `bounds` are its rectangle, `boxes` holds `activate#1` with that box in diagram coordinates, and `bars` gives `activate#1` the participant `api`, `from` `activate#1`, `to` `deactivate#1` and `block` false

#### Scenario: A call's bar
- **WHEN** `corpus/valid/sequence/calls.meltemi` is laid out
- **THEN** `bars` gives the call `pay` its bar on `api` with `block` true and `to` null, and `boxes` holds no bar under `pay`'s key

#### Scenario: An open bar
- **WHEN** `a -> b as ask; activate b; b -> c` is laid out with no `deactivate`
- **THEN** the bar of `activate#1` reaches the end of `b`'s lifeline and `bars` gives it `to` null

#### Scenario: The drawing stays
- **WHEN** the payment corpus file is exported under `technical.light`
- **THEN** the bar's `<rect>` has the same position, size, fill and stroke as before, inside a `<g data-id="activate#1" data-role="event">` inside the lifeline's group

#### Scenario: An unmatched deactivate is refused before the layout
- **WHEN** `deactivate api` is written while `api` is not active
- **THEN** `sequence.activation` is reported by the model and no layout is produced for the diagram

### Requirement: Written text sizes and fonts
`layoutSequence` SHALL measure and draw a participant's head label at the participant's written `fontSize`, `fontWeight` and `font` (the theme's `labelSize`, `labelWeight` and body font otherwise), a message's label lines and longest word at the message's (`relationLabelSize` at 400 otherwise), a note's lines at the note's (`noteSize` at 400) and a fragment's operator and condition at the fragment's (`relationLabelSize`, the operator at 600 and the condition at 400). Heads SHALL grow to hold their label with the head padding, rows SHALL grow with taller lines, the natural distance, the wrap room, the column floor and `layout.gap-floor` SHALL take the measured values, and the sequence pictures of the corpus SHALL be unchanged where nothing is written.

#### Scenario: A larger head
- **WHEN** `participant api "Order API"` has `style api { fontSize 18; font "Montserrat" }`
- **THEN** its head is wider than without the style, its label `<text>` has `font-size="18"` and `font-family` starting with `Montserrat`, the label is measured with Montserrat, and the heads of the other participants are unchanged

#### Scenario: A larger message between pulled participants
- **WHEN** `a -> b: "Validate the card number"` has `style m1 { fontSize 16 }` (the message named `m1`) and `placement { gap b -40 }`
- **THEN** the label's lines are measured at 16 px weight 400, the label wraps at the room left between the columns, the columns never come closer than the longest word measured at 16 px plus 24, and the row is as tall as the wrapped lines at 16 px

#### Scenario: A note in a hand font
- **WHEN** `note over a "Retries twice"` is named `n1` with `style n1 { font "Caveat"; fontSize 14 }`
- **THEN** its lines are measured with Caveat at 14 px, its box fits them, and its `<text>` has `font-size="14"` and `font-family` starting with `Caveat`

#### Scenario: A fragment's operator
- **WHEN** `alt` fragment `f1` has `style f1 { fontSize 13 }`
- **THEN** its operator tab is drawn at 13 px weight 600 and its condition at 13 px weight 400, with the tab as wide as the measured operator plus its padding

#### Scenario: Size out of range on a message
- **WHEN** a sequence diagram contains `style m1 { fontSize 300 }`
- **THEN** `prop.invalid-value` is reported on `300` naming the range 6 to 160, and the diagram is laid out with the theme's size

