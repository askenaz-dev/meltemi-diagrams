# layout-constraints Specification

## Purpose
Named ports on boxes and the relative constraints `align`, `row`, `column`, `order` and `distance`: strong rules that move only free boxes and report conflicts instead of moving placed ones.
## Requirements
### Requirement: Named ports
An element block SHALL accept `port <name> <side> [<n>%]`:

- `side` is `north`, `south`, `east` or `west`;
- the percentage, from 0 to 100 and 50 by default, runs left to right on `north` and `south`, and top to bottom on `east` and `west`.

The model SHALL record the ports on the element. The checks SHALL be:

- a port named after a compass side or `auto` is `prop.invalid-value`;
- a second port with the same name on the element is `ref.duplicate-id`;
- a bad side or percentage is `prop.invalid-value`.

In `route` statements, an endpoint port SHALL be a compass port, `auto` or a named port of that element; otherwise `placement.unknown-port` is reported, listing the element's ports. The anchor of a named port SHALL be its point on the box.

A compass endpoint MAY be followed by a percentage, `route save from api.east 50% to db.north 25%`, with the same meaning as in a `port` declaration. The model SHALL record it as the endpoint's `position`. Such an end SHALL anchor at that point of the side and leave square to it, like a named port, in every layout mode: waypoints SHALL NOT move it, parallel lanes SHALL NOT shift it, and the layout engine SHALL receive a port at that point. A percentage after `auto`, a bare element or a named port, or outside 0 to 100, SHALL be `prop.invalid-value`. Model JSON SHALL write `position` (a percentage) on endpoints that have one.

#### Scenario: Port at 30 % of the east side
- **WHEN** `bus["Bus"] { port out east 30% }` is placed at (500, 100) with size (160, 60), and a route leaves `bus.out`
- **THEN** the connector starts at (580, 88)

#### Scenario: Unknown port
- **WHEN** a route says `from bus.exit` and `bus` has the ports `in` and `out`
- **THEN** `placement.unknown-port` is reported on `exit`, listing `in, out` and the compass sides

#### Scenario: Reserved port name
- **WHEN** an element block contains `port east west`
- **THEN** `prop.invalid-value` is reported on the first `east`

#### Scenario: The middle of a side
- **WHEN** `api` is placed at (100, 100) with size (120, 60), `db` at (340, 140) with size (120, 60), and `route save from api.east 50% to db.west 50%` is written in an `assisted` diagram
- **THEN** the connector starts at (160, 100) and ends at (280, 140), whatever the overlap of the two boxes

#### Scenario: A position on a named port
- **WHEN** a route says `from bus.out 30%` and `out` is a named port of `bus`
- **THEN** `prop.invalid-value` is reported on `30%`

### Requirement: Relative constraints
A `placement` block SHALL accept these constraints, recorded in source order with their targets:

- `align <ids> top|middle|bottom|left|center|right`;
- `row <ids>`, equal to `align <ids> middle`;
- `column <ids>`, equal to `align <ids> center`;
- `order <ids> [horizontal|vertical]`, centres strictly increasing along the axis in the written order. The default axis is horizontal for `LR` and `RL` and vertical for `TB` and `BT`;
- `distance <id>, <id> <n>`, at least `n` px between the two boxes, edge to edge.

The checks SHALL be:

- targets MUST be non-group elements (`ref.unknown-element`);
- `align`, `row`, `column` and `order` need two or more distinct targets, `distance` exactly two, and a repeated target is `prop.invalid-value`;
- a bad edge, axis or distance is `prop.invalid-value`.

#### Scenario: Recorded constraints
- **WHEN** a placement block contains `row api, orders, db` and `distance api, db 120`
- **THEN** the diagram lists a `row` constraint on three elements and a `distance` of 120 between `api` and `db`

#### Scenario: Too few targets
- **WHEN** a placement block contains `row api`
- **THEN** `prop.invalid-value` is reported, saying that `row` needs two or more elements

### Requirement: Constraint solving and conflicts
After arrangement, the layout SHALL project unplaced elements onto every constraint in turn, for up to 20 rounds:

- **`align`**: the reference is the first placed member, else the mean of the members;
- **`order`**: an unplaced member is moved past its predecessor by at least the node spacing;
- **`distance`**: an unplaced member is pushed apart.

Placed elements, and every element in `manual`, SHALL never move. A constraint still violated afterwards SHALL be `layout.constraint-conflict` (error) on its statement, naming the elements and the difference, and the scene SHALL still be produced.

#### Scenario: Free box aligned
- **WHEN** an `assisted` diagram places `api` at (100, 100), leaves `db` unplaced, and declares `row api, db`
- **THEN** `db` is centred at y = 100

#### Scenario: Conflict between fixed boxes
- **WHEN** a `manual` diagram places `a` at (100, 100) and `b` at (300, 140) and declares `row a, b`
- **THEN** `layout.constraint-conflict` is reported on the `row` statement, naming `a` and `b` and the 40 px difference, and the scene keeps both places

#### Scenario: Order resolved by moving a free box
- **WHEN** an `assisted` diagram places `b` at (200, 100), leaves `a` unplaced, and declares `order b, a`
- **THEN** the centre of `a` is right of the centre of `b`

### Requirement: Attached notes
A note with `attachedTo` SHALL be drawn with a leader, in flow diagrams, free compositions and C4 views alike: the last item of the note's scene group, a polyline from the point where the segment between the two boxes' centres leaves the note's box to where it enters its element's drawn outline (its turned outline for a turned element), stroked with the theme's `muted` at `strokeWidth` and dotted; no leader SHALL be drawn when the two boxes overlap. The leader SHALL be no relation: not in the diagram's relations, routes, labels, counts or JSON relations, and a press on it SHALL select the note. In `layout auto`, and for a note without `place` in `layout assisted`, the engine's request SHALL hold one edge from the element to the note (id `\u0002attach\u0002<note>`, not primary, no ports, no label), so the note is arranged beside its element, and the route the engine answers for that edge SHALL be discarded; in `layout manual`, and for a placed note in `layout assisted`, nothing SHALL move because of the attachment, and an attached note without `place` in `layout manual` SHALL be `layout.missing-placement` as any element is. The composition checks SHALL ignore the leader.

#### Scenario: A leader to the element
- **WHEN** `note limits "500 rps" on api` is placed at (420, 470) and `api` at (420, 60) with size (200, 56) in a `layout manual` flow diagram
- **THEN** the note's group ends with a dotted polyline in `#526579` under `technical.light` whose first point lies on the note's top edge and whose last point lies on the bottom edge of `api`, and the diagram's relation count is unchanged

#### Scenario: Arranged beside its element
- **WHEN** a `layout auto` flow diagram `a -> b -> c` declares `note n "Why" on b`
- **THEN** the engine's request holds an edge from `b` to `n` with `primary` false, the arranged `n` is nearer to `b` than to `a` or `c`, and no route is drawn for the leader

#### Scenario: A placed note stays
- **WHEN** a `layout assisted` diagram places `n` at (100, 400) and attaches it to `b`
- **THEN** the request holds no edge for the note, `n` is drawn at (100, 400), and the leader is drawn from there

#### Scenario: Overlapping boxes draw no leader
- **WHEN** the note is placed over its element
- **THEN** the note's group holds no leader polyline and no diagnostic is reported for it

#### Scenario: A target that is not drawn
- **WHEN** a note's target is on a layer hidden on the canvas
- **THEN** the leader is still in the scene, drawn to where the element is, and nothing else changes

#### Scenario: An attached note without a place in manual layout
- **WHEN** a `layout manual` diagram declares `note n "Why" on b` and no `place n`
- **THEN** `layout.missing-placement` is reported on `n` with the hint to add its `place`, and the attachment places nothing

