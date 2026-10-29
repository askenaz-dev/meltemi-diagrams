## ADDED Requirements

### Requirement: Whiteboard tokens
Theme blocks SHALL accept three more colour tokens, each a quoted, non-empty colour and listed with the others in the `prop.unknown` hint: `highlight` (the colour of highlighter strokes), `sticky` (the default fill of stickies) and `stickyText` (the colour of their text). Pens SHALL take the existing `ink` token as their default stroke. Every built-in theme SHALL set the three: the light themes `highlight` `#ffe600`, `sticky` `#fff59d` and `stickyText` `#1f2328`; the dark themes `highlight` `#ffd600`, `sticky` `#f3e37c` and `stickyText` `#1f2328`. A theme that `extends` another SHALL inherit them, the theme panel SHALL show them in a "Whiteboard" group, and the model JSON SHALL carry them in `tokens` when written.

#### Scenario: A theme sets the whiteboard colours
- **WHEN** a file has `theme board { extends "technical.light"; sticky "#dbeafe"; highlight "#fde68a" }` and a diagram under it with a sticky and a highlighter pen
- **THEN** the sticky's card is `#dbeafe`, the stroke is `#fde68a`, and the sticky's text is `#1f2328` from the base theme

#### Scenario: A value that is not a colour
- **WHEN** a theme block has `sticky 12`
- **THEN** `prop.invalid-value` is reported on `12` naming a quoted colour

#### Scenario: A built-in theme
- **WHEN** a sticky and a pen with no styles are laid out under `sketch.dark`
- **THEN** the card is `#f3e37c`, the text `#1f2328`, and the pen's stroke is the theme's `ink`

#### Scenario: The panel's group
- **WHEN** the theme panel opens
- **THEN** a "Whiteboard" group shows `highlight`, `sticky` and `stickyText` as colour fields
