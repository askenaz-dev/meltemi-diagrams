## ADDED Requirements

### Requirement: Texts measured with their written font
`auditLabels` SHALL measure a text item that carries a written stack with that stack (through the measurer's resolution of it, estimates when no family matches) and at the item's own size and weight, so a label drawn in another family or at another size is checked at its drawn width, and SHALL report nothing for a text that fits in its written font.

#### Scenario: A wide label in a wide family
- **WHEN** `size api (120, 56)` holds `Orders API` with `style api { font "Playfair Display"; fontSize 30 }`, whose measured width in Playfair Display exceeds the box's inscribed width
- **THEN** the audit reports the label of `api` cut by its shape, with the distance measured in Playfair Display at 30 px, and the same box without the style reports nothing

#### Scenario: A written font nobody has
- **WHEN** a label has `style api { font "Comic Sans MS" }`
- **THEN** the audit measures it with the estimate measurer at its size and reports nothing beyond what the estimated width justifies
