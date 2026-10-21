## ADDED Requirements

### Requirement: Findings in the interface language
The messages of findings and the import report SHALL be in the interface language; codes, severities, statuses, ranges and construct names SHALL NOT depend on it. The coverage tables SHALL give the notes of every construct in English and in Spanish, so the import documentation can be generated in both languages.

#### Scenario: A Spanish finding
- **WHEN** the interface language is Spanish and a Mermaid flowchart uses a hexagon node
- **THEN** the finding is `import.approximated` with its message in Spanish, and the status is `complete` as in English

#### Scenario: Notes in both languages
- **WHEN** the Mermaid coverage table is read
- **THEN** every construct has non-empty English and Spanish notes wherever it has English notes
