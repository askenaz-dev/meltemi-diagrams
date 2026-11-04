## ADDED Requirements

### Requirement: Labels checked in the drawing
`auditLabels(scene, measurer, options)` SHALL measure every text of a laid-out scene with the
scene's fonts and report:

- **cut**: a text beyond the picture (or the scene's view box), beyond the background drawn just
  before it in a label (a relation's pill, a guard's band), or beyond the box of the element that
  draws it, with how far;
- **overlap**: a text over a text of another element, relation or event; over the box of an element
  it does not belong to; or crossed by a drawn connector other than its own.

Containers (boxes that hold other boxes) SHALL hold labels without overlap. The texts of
annotations (tags, notes, free texts, icons and images) SHALL NOT be checked against boxes, and
boxes of free diagrams on different layers SHALL NOT be checked against each other's texts.

#### Scenario: Label over a box
- **WHEN** the label of `save` is placed with `label save at 50% offset (0, 100)` onto the box of `cache`
- **THEN** the audit reports the text "save order" overlapping the box of `cache`

#### Scenario: Container title
- **WHEN** a node's text lies inside the group that holds it
- **THEN** nothing is reported

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
