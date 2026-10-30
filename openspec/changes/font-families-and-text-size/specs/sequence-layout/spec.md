## ADDED Requirements

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
