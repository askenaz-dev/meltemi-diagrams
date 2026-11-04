## ADDED Requirements

### Requirement: Categorised theme settings

The theme editor SHALL separate style colours/shapes, text settings, layout and effects into
translated keyboard-operable tabs, retaining existing token validation and inheritance behaviour.

#### Scenario: Theme font editing

- **WHEN** a theme is opened and the Text tab is selected
- **THEN** its fonts, text colours and typography tokens are available separately from shape colours
- **AND** changing a token retains that tab after the host returns the updated theme.
