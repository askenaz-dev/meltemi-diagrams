## ADDED Requirements

### Requirement: Focused fullscreen story presentation

The player SHALL expose an accessible fullscreen control for its own presentation surface,
restore layout/focus on exit and handle unsupported or denied requests gracefully. Optional
summary/detail content SHALL be independently configurable without disabling zoom/pan.

#### Scenario: Enter and leave fullscreen

- **WHEN** the fullscreen control is activated and Escape later exits
- **THEN** the player alone fills the viewport, enabled controls remain reachable and normal layout/focus returns

#### Scenario: Clean interactive presentation

- **WHEN** summary and details are disabled
- **THEN** their UI is absent while diagram navigation and fullscreen remain available
