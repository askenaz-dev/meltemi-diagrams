## ADDED Requirements

### Requirement: Optional HTML presentation extras

HTML generation SHALL accept explicit heading/description, summary, details and controls choices,
preserve existing API defaults when omitted and propagate choices into offline runtime options.
Unselected extras SHALL not create visible panels or unnecessary optional detail payloads.

#### Scenario: Export only the presentation

- **WHEN** heading, summary and details are omitted explicitly
- **THEN** the offline HTML shows the diagram/player with enabled controls and no such extra sections
