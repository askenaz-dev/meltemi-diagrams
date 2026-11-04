## MODIFIED Requirements

### Requirement: Scenes and actions
A scene SHALL be `scene <id> ["Title"] { … }` with unique ids per story. It MAY start with
`view <diagram>` and `transition cut|fade|morph [over <time>]`. Actions SHALL be `reveal`, `hide`,
`highlight`, `focus` and `camera` with comma-separated targets (`focus all` and `camera all`
clear), `trace <relation>`, `draw <target>[, <target>…]` (pens, free lines and named relations, drawn from their first point to their last and left drawn), each with an optional `over <time>`, `hold <time>`, and `parallel { …
}` holding actions. Targets SHALL be element ids, named relation ids and named note and fragment
ids of the scene's view (entity paths in C4 views); unknown ones SHALL be `ref.unknown-element` with
close ids as hints. `trace` on anything but a relation SHALL be `story.invalid-target`, and so SHALL `draw` on anything but a pen, a free line or a named relation. Times SHALL use `ms` or `s` from 0 to 10 minutes; a
scene without actions SHALL be `story.empty-scene` (warning).

#### Scenario: Trace on a box
- **WHEN** a scene has `trace api` where `api` is a node
- **THEN** `story.invalid-target` says trace follows a relation

#### Scenario: Draw the strokes of a whiteboard
- **WHEN** a scene of a story for a free diagram has `draw title, arrow over 2s` where both are pens
- **THEN** it compiles without diagnostics and the timeline holds a `draw` action of 2000 ms with the two targets in order

#### Scenario: Draw on a box
- **WHEN** a scene has `draw api` where `api` is a box
- **THEN** `story.invalid-target` says draw takes pens, lines and relations
