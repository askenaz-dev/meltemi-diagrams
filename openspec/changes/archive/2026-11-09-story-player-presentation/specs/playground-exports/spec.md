## ADDED Requirements

### Requirement: Story HTML export chooser

The timeline's HTML export action SHALL open the export chooser with its current story and HTML
selected. The chooser SHALL expose localized presentation options and default to a clean browser
presentation, while preserving the author's explicit choices in the resulting document.

#### Scenario: Choose the current story and content

- **WHEN** Export HTML is activated from a story and presentation choices are confirmed
- **THEN** the selected story is exported with exactly those presentation options rather than downloading immediately
