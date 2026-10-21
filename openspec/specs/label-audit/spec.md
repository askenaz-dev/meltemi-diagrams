# label-audit Specification

## Purpose
Labels that are seen whole: an audit of every drawing that reports cut and overlapping texts as layout diagnostics, and the zero target over every corpus, template and example.
## Requirements
### Requirement: Labels checked in the drawing
`auditLabels(scene, measurer, options)` SHALL measure every text of a laid-out scene with the
scene's fonts and report:

- **cut**: a text beyond the picture (or the scene's view box), beyond the background drawn just
  before it in a label (a relation's pill, a guard's band), or beyond the inscribed text area of
  the element that draws it (the box for rectangles, the shape's inscribed rectangle for the other
  shapes), with how far;
- **overlap**: a text over a text of another element, relation or event; over the box of an element
  it does not belong to; or crossed by a drawn connector other than its own.

Containers (boxes and groups that hold other boxes) SHALL hold labels without overlap, and a
container's own text SHALL NOT be reported over the boxes it contains. The texts of
annotations (tags, notes, free texts, icons and images) SHALL NOT be checked against boxes, and
boxes on different layers SHALL NOT be checked against each other's texts.

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

### Requirement: Label diagnostics in every profile
`layoutDiagram` SHALL run the audit after every layout of every profile and report each finding
once as a warning on the declaration of the element, relation or event that draws the text:
`layout.label-cut` ("The text "…" of `id` goes n px beyond its shape") and `layout.label-overlap`
("The text "…" of `id` overlaps …"). A finding about an element or relation that
`layout.text-overflow`, `layout.overlap`, `layout.label-under-connector` or
`layout.connector-crossing` already names SHALL NOT be reported again.

#### Scenario: A box too low for its text
- **WHEN** a node with a description is given `size api (240, 24)`
- **THEN** `layout.label-cut` is reported on `api`

#### Scenario: Corpus at zero
- **WHEN** every sheet of `corpus/valid`, `corpus/projects/valid`, `corpus/acceptance`, the templates and the examples is laid out
- **THEN** no `layout.label-cut` or `layout.label-overlap` is reported

