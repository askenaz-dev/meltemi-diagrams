# Spec Delta

## ADDED Requirements

### Requirement: Code tokens
Theme blocks SHALL accept two more colour tokens, listed with the others in the `prop.unknown` hint: `code`, the default fill of a code note's panel, and `codeText`, the default colour of its text. Light built-in themes SHALL set `#f3f5f8` and `#1f2328`, dark ones `#131c2b` and `#e6edf3`. A theme that `extends` another SHALL inherit them, the theme panel SHALL show them in a "Code" group, and the model JSON SHALL carry them when written.

#### Scenario: A theme sets the code colours
- **WHEN** a file has `theme docs { extends "technical.light"; code "#fff7ed"; mono "Roboto Mono" }` and a diagram under it with a code note
- **THEN** the note's panel is `#fff7ed`, its text is `#1f2328` from the base theme, and its lines are measured and drawn in Roboto Mono

#### Scenario: A value that is not a colour
- **WHEN** a theme block has `codeText 12`
- **THEN** `prop.invalid-value` is reported on `12` naming a quoted colour

#### Scenario: A built-in dark theme
- **WHEN** a code note with no styles is laid out under `technical.dark`
- **THEN** its panel is `#131c2b`, its text `#e6edf3`, and its stroke the theme's `line`

#### Scenario: The panel's group
- **WHEN** the theme panel opens
- **THEN** a "Code" group shows `code` and `codeText` as colour fields
