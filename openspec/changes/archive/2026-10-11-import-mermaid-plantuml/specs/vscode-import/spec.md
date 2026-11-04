## ADDED Requirements

### Requirement: Import commands
The extension SHALL contribute **Meltemi: Import from Mermaid or PlantUML…** (file picker for
`.mmd`, `.mermaid`, `.puml`, `.plantuml`, `.pu`, `.iuml`, `.wsd`, `.md`), **Convert to Meltemi
Diagram** in the explorer context menu and the editor title menu for those files, and **Import
Selection as Meltemi Diagram** for a non-empty selection in any text editor (format by detection,
else asked). The commands SHALL accept a source URI and a target URI as arguments for automation.
The result SHALL be written beside the source as `<stem>.meltemi` (the selection command asks for
the path, defaulting next to the document) and opened with the code and the canvas.

#### Scenario: Explorer conversion
- **WHEN** the user runs **Convert to Meltemi Diagram** on `checkout.mmd`
- **THEN** `checkout.meltemi` is created next to it and opens with the canvas

### Requirement: Existing target
When the target exists, the extension SHALL ask whether to **Merge** (keep adjustments), **Replace**
or **Cancel**, and act accordingly.

#### Scenario: Merge chosen
- **WHEN** the target exists and the user chooses **Merge**
- **THEN** the sheet is re-imported with `mergeImport` and its placements are kept

### Requirement: Findings in VS Code
Findings SHALL be written to the **Meltemi Import** output channel with the source positions and
the coverage counts, and shown as Problems on the source document (collection `meltemi-import`)
until the source is imported again or closed. A partial import SHALL show a warning notification
with **Show Findings**; a failed import an error notification and no file.

#### Scenario: Problems on the source
- **WHEN** an imported Mermaid file had a hexagon node
- **THEN** the Problems view lists an information on the hexagon's line of the `.mmd` file
