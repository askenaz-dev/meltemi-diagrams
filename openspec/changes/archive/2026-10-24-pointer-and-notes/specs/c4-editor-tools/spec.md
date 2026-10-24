## ADDED Requirements

### Requirement: Notes on the C4 canvas
On a C4 view the palette SHALL offer the note tool with the key O beside the entity tools. A click or a drop of the tool on empty canvas SHALL plan `createElement` of a note in the view at the point, with its label editor opened; a click or a drop on a drawn entity SHALL create the note beside it (at its east edge plus the theme's `groupPadding`, aligned to its top) attached to it, with the drop outline shown on the entity while the tool is over it, and the status line naming the attachment. The inspector of a note SHALL show the note's label, **Attached to** (a picker of the drawn entity paths, empty for none, writing `attachNote`), its style and effects, and none of the entity fields. Delete on an entity with attached notes SHALL list the attachments in the dialog, and confirming SHALL exclude the entity and keep the notes without their leaders; Delete on a note SHALL remove the note's declaration with its placement and styles as for any element. Dragging a note, Arrange and the layout modes SHALL write the view's placement only.

#### Scenario: A note from the palette
- **WHEN** O is pressed on the `containers` view of the C4 template
- **THEN** the view gains `note note1 "Note"` with a `place` near the centre, `note1` is selected with its label editor open, and the model's file is unchanged

#### Scenario: Drop on an entity
- **WHEN** the note tool is dragged from the palette and released on `product.api`
- **THEN** the view gains `note note1 "Note" on product.api` placed at the entity's east edge plus the padding, the status line says the note is attached to `product.api`, and the canvas draws the dotted leader

#### Scenario: Attached to in the inspector
- **WHEN** `note1` is selected and `product.db` is chosen in Attached to
- **THEN** the declaration reads `note note1 "Note" on product.db`, and choosing the empty option removes the clause

#### Scenario: Delete an entity with a note
- **WHEN** `product.api` with `note1` attached is selected and Delete is pressed
- **THEN** the dialog lists the attachment of `note1`, and confirming excludes `product.api` and leaves `note note1 "Note"` in the view

#### Scenario: No entity fields on a note
- **WHEN** `note1` is selected on a C4 view
- **THEN** the inspector shows no kind-and-path, technology or external field, and a `create` action carrying `container` with `attachedTo` is refused with `edit.invalid-value`
