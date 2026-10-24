## ADDED Requirements

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
