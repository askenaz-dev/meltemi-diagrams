## ADDED Requirements

### Requirement: A read-only canvas
`CanvasSettings` SHALL carry `readOnly` (false when absent), delivered through the `settings`
host message and switchable at run time. While it is true, `act()` SHALL drop every action so
no plan reaches the host, inline editing of labels and ids and the inspector's `commit` SHALL
be no-ops, the palette and the other editing controls SHALL be hidden as in story mode (the
`data-edit` hiding), and drags, connections, deletions and keyboard edits SHALL leave the
diagram as it is; selection, zoom, pan, the minimap, stories and effects SHALL work. A host
that never sends `readOnly` (VS Code) SHALL see no change.

#### Scenario: No plan in read-only mode
- **WHEN** the canvas is read-only and the person drags an element
- **THEN** the element stays where it was and the host receives no plan

#### Scenario: The inspector does not commit
- **WHEN** the canvas is read-only and a field is changed in the inspector
- **THEN** no `setField` action is posted

#### Scenario: Stories still play
- **WHEN** the canvas is read-only and a story is chosen
- **THEN** it plays as in edit mode

#### Scenario: Switched back at run time
- **WHEN** a `settings` message with `readOnly: false` arrives
- **THEN** the palette returns and a drag sends a plan again
