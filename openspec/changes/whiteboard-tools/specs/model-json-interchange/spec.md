## ADDED Requirements

### Requirement: Whiteboard objects in JSON
Each element SHALL carry `pen` after `line`: `{ "points": [ { "x", "y" }, … ] }` for a pen, null otherwise; and `list` after `pen`: `{ "layout", "spacing", "align" }` for a list group (`spacing` and `align` null when not written), null otherwise. `kind` SHALL be `pen` or `sticky` for those declarations. Style entries SHALL carry `opacity` as any other property, diagram properties SHALL carry `preset` `board` when written, theme `tokens` SHALL carry `highlight`, `sticky` and `stickyText` when written, and story actions SHALL carry `draw` with its targets and time as `trace` is carried. Key order SHALL stay fixed and `version` stays `0.1`, since the keys are added and no existing one changes.

#### Scenario: A whiteboard sheet
- **WHEN** `corpus/valid/free/whiteboard.meltemi` is serialised
- **THEN** its pens have kind `pen`, `line` null and a `pen` object with their points, its stickies have kind `sticky` and `pen` null, its column groups have `list` `{ "layout": "column", … }`, every box has `pen` null and `list` null, and the output matches the stored snapshot

#### Scenario: Stable key order with the new keys
- **WHEN** the same compilation is serialised twice
- **THEN** the two strings are identical, and `pen` follows `line` and `list` follows `pen` in every element

#### Scenario: A pen in a flow diagram is not serialised
- **WHEN** a flow diagram containing `pen p [(0, 0), (10, 10)]` is serialised
- **THEN** `ok` is false, that diagram is omitted from `diagrams`, and `diagnostics` holds `prop.unknown` on `pen`
