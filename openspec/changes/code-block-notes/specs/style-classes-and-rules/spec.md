# Spec Delta

## ADDED Requirements

### Requirement: Text format property
Style blocks, classes and rules SHALL accept `textFormat plain|code` for notes: the `note` elements of flow diagrams, free compositions and C4 views and the `note` events of sequence diagrams, with the precedence of any style property. `plain` SHALL be what a note has without the property. The model SHALL store the value as a string and the model JSON SHALL carry it in the style entry.

#### Scenario: A style, a class and a rule
- **WHEN** a free composition has `style a { textFormat code }`, `class snippet { textFormat code; fontSize 12 }` applied to note `b`, and a second diagram has `rule note { textFormat code }`
- **THEN** `a` and `b` are code notes, every note of the second diagram is a code note, and the model JSON of each style entry carries `textFormat` `code`

#### Scenario: Plain overrides a rule
- **WHEN** a diagram has `rule note { textFormat code }` and `style legend { textFormat plain }`
- **THEN** `legend` is drawn as a plain note and the other notes as code blocks

#### Scenario: A note of a sequence diagram
- **WHEN** a sequence diagram has `note n over api "x"` and `style n { textFormat code }`
- **THEN** no diagnostic is reported and the style entry of `n` has `textFormat` `code`

### Requirement: Text format on other targets
On a target that is not a note, gantt charts included, `textFormat` in a `style` statement or a rule SHALL be `prop.invalid-value` with the hint that it applies to notes; a class that carries it SHALL be applied to such a target without it and without a diagnostic. A value that is not `plain` or `code` SHALL be `prop.invalid-value` listing the two.

#### Scenario: A target that is not a note
- **WHEN** a free composition has `style api { textFormat code }` where `api` is a box
- **THEN** `prop.invalid-value` is reported on `textFormat` with the hint that it applies to notes, and `api` is drawn as before

#### Scenario: A class on a box
- **WHEN** `class snippet { textFormat code; fill "#eef" }` is applied to a box
- **THEN** the box takes the fill, `textFormat` is ignored and no diagnostic is reported

#### Scenario: An unknown value
- **WHEN** a diagram has `style n { textFormat markdown }` on a note
- **THEN** `prop.invalid-value` is reported on `markdown`, listing `plain` and `code`

#### Scenario: A task of a gantt chart
- **WHEN** a gantt chart has `style a { textFormat code }` where `a` is a task
- **THEN** `prop.invalid-value` is reported on `textFormat` with the hint that it applies to notes
