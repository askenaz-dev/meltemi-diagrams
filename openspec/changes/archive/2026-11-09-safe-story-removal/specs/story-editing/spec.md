## ADDED Requirements

### Requirement: Story removal requires unambiguous syntax
`removeStory` SHALL refuse source with parser errors using `edit.unsafe-target` and localized
feedback. The refusal SHALL produce no edit or source mutation in either cascade mode. Semantic
errors alone SHALL NOT prevent removal from syntactically valid source.

#### Scenario: Missing closing brace before unrelated content
- **WHEN** a story lacks a closing brace and another diagram follows its recovered parser range
- **THEN** removal with either cascade value is refused and every byte, including line endings and the later diagram, remains unchanged

#### Scenario: Removal repairs a semantic error
- **WHEN** the source parses correctly and the named story contains an invalid reference
- **THEN** the story can be removed without changing unrelated content
