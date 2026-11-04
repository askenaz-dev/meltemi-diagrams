## MODIFIED Requirements

### Requirement: Empty file and new diagrams
When the document has no diagram and no story is playing, the canvas SHALL show the reason and one button per kind it can create — flow diagram, free composition, sequence diagram, Gantt chart — and SHALL clear the diagram selector, the inspector, the minimap and the layout and stale badges of the last render. A button SHALL write `diagram <id>: <type> { }` through `createDiagram` and show the new diagram. A **New diagram** button beside the diagram selector SHALL offer the same kinds for any file. Read-only canvases SHALL show neither the buttons nor the New diagram button.

#### Scenario: Start from an empty file
- **WHEN** the text is emptied and the Flow diagram button is pressed
- **THEN** the text becomes `language "0.2"`, a blank line and `diagram diagram1: flow {` … `}`, the canvas shows the empty diagram with its palette, and the selector names `diagram1`

#### Scenario: Nothing stale is left
- **WHEN** a file showing `overview` is emptied
- **THEN** the selector, the inspector, the minimap and the layout badge no longer show `overview`

#### Scenario: Another diagram in the file
- **WHEN** New diagram › Free composition is chosen in a file declaring `overview`
- **THEN** `diagram diagram1: free {` … `}` is appended after `overview` and shown

#### Scenario: A Gantt chart from an empty file
- **WHEN** the text is emptied and the Gantt chart button is pressed in Spanish ("Diagrama de Gantt")
- **THEN** the text becomes `language "0.2"`, a blank line and `diagram diagram1: gantt {` … `}`, and the canvas shows an empty timeline of four weeks with the Task, Milestone, Marker and Section tools

#### Scenario: Read-only
- **WHEN** the canvas is read-only and the file has no diagram
- **THEN** the reason is shown without buttons
