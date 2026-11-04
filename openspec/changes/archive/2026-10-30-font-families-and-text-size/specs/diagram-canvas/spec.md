## ADDED Requirements

### Requirement: Font picker
The canvas SHALL provide a font picker, a control of the canvas package drawn for inspector fields of type `font`: a button showing the field's family written in that family (the inherited family greyed when nothing is written, "custom" for a stack that is none of the options, "mixed" for a selection that differs), which opens a popover under it with a search field that filters the rows by name, the families in groups headed Sans, Serif, Monospace, Handwriting and Project fonts (a group is shown when it has a member), each row the family name and "Aa" drawn in the family, a restricted project font with a lock and the reason, and a "theme" row ("inherit" in the theme panel) that removes the property. The rows SHALL be a listbox named by the family, moved with the arrow keys and type-ahead, chosen with Enter, Space or a click, and Escape SHALL close the popover and return focus to the button. The canvas SHALL ask for the families with `listFonts` when the picker opens and again when a render arrives while it is open, and the session SHALL answer `fonts` with each family's name, group, weights and the `@font-face` rules of the row's own glyphs from the document's font provider (none for a restricted font); a row whose faces have not arrived SHALL be drawn in the interface font at the same height and swap in place when they do. The popover SHALL open and close with the motion tokens of the icon picker, and no motion under `prefers-reduced-motion`. A read-only canvas SHALL draw the button disabled.

#### Scenario: Open and choose
- **WHEN** the font button of `api` is pressed and `Poppins` is clicked in the Sans group
- **THEN** the text gains `style api { font "Poppins" }`, the popover closes, focus returns to the button and the button shows "Poppins" drawn in Poppins

#### Scenario: Search and keyboard
- **WHEN** the popover is open, `mer` is typed, then Down and Enter are pressed
- **THEN** the rows are those whose name contains `mer` (Merriweather), the first is chosen and `font "Merriweather"` is written

#### Scenario: Nothing matches
- **WHEN** `arial` is typed in the search
- **THEN** the list shows no rows and a line saying no family matches, Enter writes nothing, and clearing the field shows the groups again

#### Scenario: Back to the theme
- **WHEN** `api` has `font "Roboto"` and the "theme" row is chosen
- **THEN** the `font` property is removed, the button shows the theme's family greyed, and the rows have no pressed row

#### Scenario: A project font and a restricted one
- **WHEN** the project has `assets/fonts/Company.woff2` (embeddable) and `assets/fonts/Locked.ttf` (restricted) and the popover opens
- **THEN** the Project fonts group lists `Company Sans` drawn in itself and `Locked` with a lock and the reason that exports measure it only, and choosing `Locked` writes `font "Locked"`

#### Scenario: Faces arrive late
- **WHEN** the popover opens in the playground before Caveat's files were fetched
- **THEN** the Caveat row is drawn in the interface font at the rows' height, and when a later `fonts` answer brings its faces it is drawn in Caveat without the list moving

## MODIFIED Requirements

### Requirement: Property inspector
The inspector SHALL begin with the style strip (swatches, picker, inherit, line, width, corner radius, rotation, shape, icon position, route, corners, start and end heads, the Text group, effects and speed, and the theme row for the diagram) and SHALL then show the fields of the diagram when nothing is selected, of one element, of one relation, or the style fields shared by several selected items:

- **diagram**: title, description, direction, layout, routing, theme, preset;
- **element**: id, kind, label, description, classes, ports, inside (the parent group, or none), position, size and every style property that applies to its kind: Shape, shown with a picture per value, for free boxes and flow nodes; Corner radius, a number from 0 to 64 with a slider, wherever the radius is drawn: `rounded`, `rectangle`, `square` and `framed` boxes and nodes, the polygon shapes and decisions, persons and agents, notes, the frames of free texts, icons and images, and groups, with the radius drawn (a rule's or a class's, else the theme's `radius` for `rounded` boxes, notes and frames, `groupRadius` for a group, the body radius for persons and agents, 0 for the others) greyed as the default; an ellipse, a circle, a pill, a cylinder, a cloud or a document has no Corner radius field; Rotation, a number from 0 to 359 with a slider, for the elements of flow diagrams and free compositions other than groups, with 0 greyed; Icon (thumbnail, name, Choose… opening the icon picker, and Remove) for the elements and relations that draw an icon; Icon position (five pictures) and Icon size (a number from 8 to 128 with a slider, the drawn size greyed as the default, an **auto** choice and Clear) for nodes, decisions, data stores and boxes; Icon position for C4 entities too, without `center`, which they draw as `top`; Label position (four pictures) when the icon is the centre piece (`iconPosition center` or `shape icon`); and Font (the font picker), Text size and Text weight (the controls of the strip's Text group) for every element that draws text, in every profile, with the theme's family, size and weight of its kind greyed as the default, and none for icons, images and pens;
- **relation**: id, label, ends and ports, line (solid, dashed or dotted), routing, corners, start and end heads, classes, style properties, Font, Text size and Text weight of its label, and label position.

Each change SHALL be one edit plan: `setDiagramProperty`, `setStyleProperty`, `setElementLabel`, `setDescription`, `setElementKind`, `setRelationLine`, `setClasses`, `addPort`, `removePort`, `setPosition`, `setSize`, `setRoute` or `moveElement`; a change to several selected items SHALL be one batch plan. Fields SHALL show the written value or, greyed, the default.

#### Scenario: Change a colour shared by a style
- **WHEN** `style api, db { fill "#eef" }` exists and the inspector sets the fill of `api` to `accent`
- **THEN** the statement becomes `style db { fill "#eef" }` and `style api { fill accent }` is added

#### Scenario: Width for a selection
- **WHEN** `api` and `db` are selected and the strip sets the width to 2
- **THEN** one undo step gives both `width 2`

#### Scenario: Shape by its picture
- **WHEN** box `a` is selected and the `ellipse` picture of the Shape field is chosen
- **THEN** the text gains `style a { shape ellipse }`

#### Scenario: Icon position by its picture
- **WHEN** node `api` with an icon is selected and the `right` picture of the Icon position field is chosen
- **THEN** the text gains `style api { iconPosition right }`

#### Scenario: Icon position of a C4 entity
- **WHEN** container `shop.web` with an icon is selected on a C4 container view
- **THEN** the Icon position field offers the `left`, `right`, `top` and `bottom` pictures and no `center`

#### Scenario: Label position appears with a centred icon
- **WHEN** node `db` with `style db { icon "tabler:database"; iconPosition center }` is selected
- **THEN** the inspector shows Label position with `bottom` greyed, and choosing `top` writes `labelPosition top`

#### Scenario: Icon size auto
- **WHEN** the Icon size slider of `db` is set to 48 and then **auto** is chosen
- **THEN** the text gains `iconSize 48`, then `iconSize auto`

#### Scenario: Corner radius of a group
- **WHEN** group `g` is selected and the Corner radius slider is set to 0
- **THEN** the text gains `style g { radius 0 }`, and the field showed 14 greyed before the change under `technical.light`

#### Scenario: No corner radius where none is drawn
- **WHEN** a free box with `style b { shape ellipse }`, or a flow node with `style h { shape circle }`, is selected
- **THEN** neither the strip nor the inspector shows a Corner radius field, while a `rounded` box or node shows it with the theme's `radius` greyed, and a `rectangle` box or a `hexagon` node shows it with 0 greyed

#### Scenario: Inside field
- **WHEN** top-level `box c` is selected and `g` is chosen in the Inside field
- **THEN** `c` is declared inside `group g` and keeps its drawn position

#### Scenario: Radius typed out of range
- **WHEN** 90 is typed in the Corner radius field
- **THEN** the field refuses it and the text is unchanged

#### Scenario: Rotation field
- **WHEN** node `api` is selected and 30 is typed in the Rotation field, then group `g` is selected
- **THEN** the text gains `style api { rotation 30 }`, and the inspector of `g` shows no Rotation field

#### Scenario: Text fields of a C4 entity and a sequence participant
- **WHEN** container `shop.api` of a container view is selected, then participant `a` of a sequence diagram
- **THEN** each inspector shows Font with the theme's family greyed, Text size with 13 greyed and Text weight with 600 greyed, and setting the size of `a` to 16 writes `style a { fontSize 16 }`

#### Scenario: No text fields on an image
- **WHEN** image `logo` of a free composition is selected
- **THEN** the inspector shows no Font, Text size or Text weight field
