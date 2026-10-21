## MODIFIED Requirements

### Requirement: Creating and connecting
The palette SHALL create a node, decision, data store, note, tag or group, by drag and drop or by keyboard (N, D, S, O, T, G) at the centre of the viewport, snapped to a free grid cell:

- the new element SHALL go inside the group under the drop point;
- it SHALL get a generated id (`node1`, `decision1`, …) and a `place`, with a `size` for groups;
- it SHALL then be selected with its label ready to edit.

Dragging from a connection handle to another box SHALL create a relation (`->`; `-->` with Shift). "Connect to…" (C) SHALL offer the other elements in a filtered list. The palette's relation tool (R) SHALL create a relation from the first clicked element to the second, Escape cancelling and Shift making it dashed.

#### Scenario: Create a data store
- **WHEN** the data store tool is dropped at (420, 260) with a 14 px grid in a `manual` diagram
- **THEN** the text gains `data1[("Data")]` and `place data1 at (420, 266)`, and `data1` is selected

#### Scenario: Connect with the keyboard
- **WHEN** `api` is selected, C is pressed and `db` is chosen
- **THEN** the text gains `api -> db`

#### Scenario: Connect with the tool
- **WHEN** the relation tool is chosen, `api` is clicked and then `db` with Shift held
- **THEN** the text gains `api --> db`

### Requirement: Property inspector
The inspector SHALL begin with the style strip (swatches, picker, inherit, line, width, arrowhead, effects and speed, and the theme row for the diagram) and SHALL then show the fields of the diagram when nothing is selected, of one element, of one relation, or the style fields shared by several selected items:

- **diagram**: title, description, direction, layout, routing, theme, preset;
- **element**: id, kind, label, description, classes, ports, position, size and every style property;
- **relation**: id, label, ends and ports, line, routing, arrowhead, classes, style properties and label position.

Each change SHALL be one edit plan: `setDiagramProperty`, `setStyleProperty`, `setElementLabel`, `setDescription`, `setElementKind`, `setRelationLine`, `setClasses`, `addPort`, `removePort`, `setPosition`, `setSize` or `setRoute`; a change to several selected items SHALL be one batch plan. Fields SHALL show the written value or, greyed, the default.

#### Scenario: Change a colour shared by a style
- **WHEN** `style api, db { fill "#eef" }` exists and the inspector sets the fill of `api` to `accent`
- **THEN** the statement becomes `style db { fill "#eef" }` and `style api { fill accent }` is added

#### Scenario: Width for a selection
- **WHEN** `api` and `db` are selected and the strip sets the width to 2
- **THEN** one undo step gives both `width 2`
