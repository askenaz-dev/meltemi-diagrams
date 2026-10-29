## MODIFIED Requirements

### Requirement: Labels checked in the drawing
`auditLabels(scene, measurer, options)` SHALL measure every text of a laid-out scene with the
scene's fonts, a text drawn as several lines (a wrapped message label) line by line, and report:

- **cut**: a text beyond the picture (or the scene's view box), beyond the background drawn just
  before it in a label or a tag (a relation's pill, a guard's band, a sequence tag's pill), or
  beyond the inscribed text area of the element that draws it (the box for rectangles, the shape's
  inscribed rectangle for the other shapes), with how far;
- **overlap**: a text over a text of another element, relation or event; over the box of an element
  it does not belong to; or crossed by a drawn connector other than its own.

Containers (boxes and groups that hold other boxes) SHALL hold labels without overlap, and a
container's own text SHALL NOT be reported over the boxes it contains. The texts of
annotations (tags, the tags of sequence messages and participants, notes, free texts, icons and
images) SHALL NOT be checked against boxes, a sequence tag's text SHALL NOT be checked against the
inscribed area of its owner's head, and boxes on different layers SHALL NOT be checked against each
other's texts.

#### Scenario: Label over a box
- **WHEN** the label of `save` is placed with `label save at 50% offset (0, 100)` onto the box of `cache`
- **THEN** the audit reports the text "save order" overlapping the box of `cache`

#### Scenario: Container title
- **WHEN** a node's text lies inside the group that holds it
- **THEN** nothing is reported

#### Scenario: Stack with empty labels
- **WHEN** `outer ""`, `middle ""` and `inner ""` are stacked at one centre
- **THEN** nothing is reported

#### Scenario: Stack with coinciding labels
- **WHEN** `outer "Outer"` and `inner "Inner"` are stacked at one centre and both texts are drawn at the same point
- **THEN** `layout.label-overlap` is reported on `inner`, naming the text of `outer`

#### Scenario: Container's own label over a child
- **WHEN** `outer "Outer"` holds `inner ""` and the text of `outer` lies over the box of `inner`
- **THEN** nothing is reported

#### Scenario: Label crossing a diamond
- **WHEN** a `shape diamond` box of 160 × 80 has a description line 101 px wide drawn 22 px below its centre
- **THEN** `layout.label-cut` is reported on the box, with the distance beyond the diamond's inscribed area

#### Scenario: A wrapped message label
- **WHEN** `customer -> api: "Esto es una prueba de un texto Largo" as test` is laid out across the lifeline of `web` with `spacing 8`, so the label wraps
- **THEN** the audit measures each drawn line of `test` as its own text, and nothing is reported

#### Scenario: A badge over its head
- **WHEN** `participant bank "Bank" { tag "external" }` and `api -> bank: "Authorize" { tag "PKCE" }` are laid out
- **THEN** each tag's text lies on its pill, and nothing is reported

#### Scenario: A wrapped label moved onto a note
- **WHEN** the label of `test` is moved with `label test at 50% offset (0, 60)` onto a `note over web "Fraud check"` drawn in the next row
- **THEN** `layout.label-overlap` is reported on `test`, naming the text of the note
