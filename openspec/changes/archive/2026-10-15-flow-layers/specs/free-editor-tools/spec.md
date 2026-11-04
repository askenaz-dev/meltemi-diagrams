## MODIFIED Requirements

### Requirement: Order and layers on the canvas
The canvas SHALL offer bring to front (Ctrl+Shift+]), send to back (Ctrl+Shift+[), bring forward (Ctrl+]) and send backward (Ctrl+[) in the keyboard map and the context menu, each one `reorderElement`. The inspector SHALL show a Layer field for elements and relations of free and flow diagrams, with the declared layers, and a Layers field for the diagram.

#### Scenario: Bring to front
- **WHEN** `a` is declared before `b` in the same block and `a` is brought to front
- **THEN** `a`'s declaration moves after `b`'s, and `a` is drawn above `b`

## ADDED Requirements

### Requirement: Layers panel
The canvas SHALL offer a Layers panel for flow and free diagrams (a toolbar toggle and the key L) listing the layers from front to back with how many elements and relations each holds. The panel SHALL add a layer (`layer<n>`, appended before `main`, through `setDiagramProperty layers`), rename one (`renameLayer`, which rewrites `layers` and every `layer` statement of the diagram; `main` cannot be renamed, a taken name is refused), remove one (its elements and relations go back to `main`, then `layers` loses it), move one up or down, hide or show it on the canvas without writing anything, and move the selection to it (`setElementProperty layer` for each element and relation). Hidden layers SHALL be left out of rectangle and keyboard selection, and hiding SHALL be kept with the canvas's state per diagram.

#### Scenario: Add and rename a layer
- **WHEN** Add is pressed in the panel of a diagram without `layers` and the new layer is renamed `back`
- **THEN** the text gains `layers back, main`

#### Scenario: Move the selection to a layer
- **WHEN** `band` is selected and "Move to back" is chosen
- **THEN** `band`'s block gains `layer back`, and the panel shows one element on `back`

#### Scenario: Remove a layer
- **WHEN** `back` holding `band` is removed
- **THEN** `band` loses `layer back` and the `layers` statement goes, in one undo step
