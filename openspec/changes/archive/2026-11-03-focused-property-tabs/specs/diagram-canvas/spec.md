## ADDED Requirements

### Requirement: Focused property categories

The shared canvas inspector SHALL group available properties into translated Style, Text,
Layout, Effects and Details tabs, with only the active panel visible. Empty tabs SHALL be omitted.
Tabs SHALL use roving focus with Left/Right and Home/End and expose tab/tabpanel relationships.

#### Scenario: Typography is separate from shape appearance

- **WHEN** a box is selected and Text is opened
- **THEN** font, size, weight, text colour and alignment are visible, while shape and fill are hidden
- **AND** choosing Style exposes shape and fill without losing an edited text value.

#### Scenario: Renders and selection changes

- **WHEN** an edit causes a host render or another target supports the current tab
- **THEN** the active category is retained and focused controls preserve their editing behaviour
- **AND** a target without that category falls back to the first available tab.

#### Scenario: View-only inspection

- **WHEN** the canvas is read-only
- **THEN** tabs remain navigable and all editing controls stay disabled.
