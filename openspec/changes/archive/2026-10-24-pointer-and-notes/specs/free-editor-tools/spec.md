## ADDED Requirements

### Requirement: Note tool on the free palette
On a free diagram the canvas palette SHALL offer the note tool (O), creating `note <id> "Note"` with a `place` near the centre and opening its label editor, as the flow palette does; the tool SHALL be draggable onto the canvas like the other tools. On a sequence diagram O SHALL keep creating a note over the selection and the palette's note button SHALL stay hidden. On a read-only canvas the note button SHALL be hidden and O SHALL announce the refusal and write nothing.

#### Scenario: Create a note with O
- **WHEN** O is pressed on a free diagram
- **THEN** the text gains `note note1 "Note"` and a `place` near the centre, `note1` is selected and its label editor is open

#### Scenario: O on a sequence diagram
- **WHEN** O is pressed on a sequence diagram with `api` selected
- **THEN** the text gains `note over api "Note"` and no `note note1` is declared

#### Scenario: Shown per profile
- **WHEN** the canvas shows a free diagram, then a C4 view, then a sequence diagram
- **THEN** the palette's note button is visible on the first two and hidden on the third

#### Scenario: O on a read-only canvas
- **WHEN** the canvas is read-only and O is pressed on a free diagram
- **THEN** the note tool is hidden, the status line announces the view-only refusal, and the document is unchanged

### Requirement: Attached notes on the canvas
On flow and free diagrams a drop of the note tool, or a click with it armed, on an element (the topmost under the point, groups included) SHALL create the note at the element's east edge plus the theme's `groupPadding`, aligned to its top, with `attachedTo` set to the element, SHALL show the drop outline on the element while the tool is over it, and SHALL say in the status line that the note is attached; a drop or click on empty canvas SHALL create an unattached note. The inspector of a note SHALL show **Attached to** after the label: an `enum` field listing the ids of the diagram's other elements, empty for none, writing `attachNote` (`attachNote` action, `attachNote` operation). Delete on an element with attached notes SHALL list the attachments among the dependents, and confirming SHALL strip them and keep the notes. Copy, paste and Duplicate SHALL keep a note's attachment when its target is copied with it and drop it otherwise. Moving a note or its element SHALL redraw the leader with the live preview.

#### Scenario: Drop on an element
- **WHEN** the note tool is dragged from the palette and released on `api` (box at (420, 60) size (200, 56)) in a flow diagram under `technical.light`
- **THEN** the text gains `note note1 "Note" on api` and a `place note1` that puts the note's left edge 16 units (the theme's `groupPadding`) right of `api`'s east edge at x 520 and its top level with `api`'s top at y 32, snapped to the 14 px grid, the status line says the note is attached to `api`, and the label editor opens

#### Scenario: Attached to in the inspector
- **WHEN** `note1` is selected and `db` is chosen in Attached to
- **THEN** the declaration reads `note note1 "Note" on db`, and choosing the empty option removes the clause

#### Scenario: Delete keeps the note
- **WHEN** `api` has `note1` attached and one relation, and Delete is pressed on `api`
- **THEN** the dialog lists the relation and the attachment of `note1`, and confirming removes `api` and the relation and leaves `note note1 "Note"`

#### Scenario: Paste without the target
- **WHEN** `note1 "Note" on api` is copied alone and pasted
- **THEN** the text gains `note note1_2 "Note"` without `on`, and copying `api` and `note1` together pastes `note1_2` attached to `api_2`

#### Scenario: Attach to an id the diagram lacks
- **WHEN** an `attachNote` action names `ghost` as the element of `note1`
- **THEN** it is refused with `edit.unsafe-target`, the status line says so, and the declaration is unchanged

### Requirement: Language services for notes
Completion SHALL offer `note` among the statements of free diagrams and C4 views, the word `on` after a note's text, and after `on ` the ids of the diagram's other elements (the drawn entity paths in a view). Hover on the target of `on` SHALL show the element's hover (the entity's in a view), and go to definition SHALL open its declaration (the model's entity in a view). The quick fix for `ref.unknown-element` on an attachment SHALL offer the close ids, and the formatter SHALL keep the `on` clause as written. Hover on `on` SHALL describe the attachment.

#### Scenario: Completion of the target
- **WHEN** completion runs after `note n "Text" on ` in a free diagram with boxes `api` and `db`
- **THEN** the items are `api` and `db`, without `n`

#### Scenario: Completion of `on`
- **WHEN** completion runs after `note n "Text" ` in a flow diagram
- **THEN** the items include `on`

#### Scenario: Definition from the attachment
- **WHEN** go to definition runs on `shop.api` in `note cache "Cached" on shop.api` of a view
- **THEN** the result is `container api` in the model

#### Scenario: Quick fix for an unknown target
- **WHEN** `note n "Text" on ap` reports `ref.unknown-element` and the diagram declares `api`
- **THEN** a quick fix offers `api`, and applying it writes `on api`

#### Scenario: Format keeps the clause
- **WHEN** `note   n   "Text"   on   api` is formatted
- **THEN** the line reads `note n "Text" on api`
