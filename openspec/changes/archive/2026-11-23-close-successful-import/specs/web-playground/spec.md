## MODIFIED Requirements

### Requirement: Importing Mermaid and PlantUML

The page SHALL import Mermaid, PlantUML or Markdown text, pasted or from a chosen file, with the same importer as `meltemi-diagrams import`. It SHALL create one new `.meltemi` file per successful submission, open the file, close the input dialog and show the import status. When the import has findings, the status SHALL provide access to the findings and the Markdown report. A source that cannot be imported SHALL add nothing and leave the input dialog open with the reason.

#### Scenario: Mermaid flowchart

- **WHEN** the person pastes `flowchart LR\n  a[Shop] --> b[(Orders)]` and imports it
- **THEN** a new file opens with a flow diagram of `a` and `b`, the input dialog closes and the status reads complete

#### Scenario: Successful conversion with findings

- **WHEN** a Mermaid source converts to a sheet and the importer reports unsupported syntax
- **THEN** the file opens once, the input dialog closes, and the findings and download are available from the import result

#### Scenario: Conversion cannot produce a sheet

- **WHEN** the submitted source cannot be converted
- **THEN** the input dialog remains open with the submitted text and diagnostic, and no file is created
