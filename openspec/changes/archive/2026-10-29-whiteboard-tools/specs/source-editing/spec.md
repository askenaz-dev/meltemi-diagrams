## ADDED Requirements

### Requirement: Pen operations
`createPen { diagram, points, parent?, style? }` SHALL write `pen <id> [(x, y), …]` in a free diagram, after the last declaration of `parent`'s block or of the diagram body, with every coordinate rounded to a tenth (a whole number printed without a decimal), the list on one line when the statement fits in 100 columns and otherwise filled as "Pen statements" of `source-formatting` prints it, no `place`, and, when `style` gives `stroke`, `width`, `opacity`, `arrowhead` or `arrowtail`, a `style <id> { … }` statement right after it in the same edit; the id SHALL be `pen1`, `pen2`, … past the ids in use. The host passes the points in the parent's interior coordinates. Fewer than one point, a coordinate that is not finite, or a diagram that is not free SHALL be refused with `edit.invalid-value`. `setPenPoints { element, points }` SHALL rewrite the statement's tuples with minimal edits when the count is unchanged and the whole list otherwise, keeping comments, and SHALL be refused on an element that is not a pen with `edit.unsafe-target`. The inverse edits SHALL restore the text, and `removeElement` on a pen SHALL remove its styles and animations as dependents.

#### Scenario: A stroke written
- **WHEN** `createPen { points: [(40, 60), (90.46, 58.04), (140, 70)], parent: "notes", style: { width: 4 } }` runs on a free diagram whose group `notes` holds one text
- **THEN** `pen pen1 [(40, 60), (90.5, 58), (140, 70)]` is inserted after the text inside `notes`, followed by `style pen1 { width 4 }`, as one edit, and the text compiles without new errors

#### Scenario: A long stroke
- **WHEN** `createPen` runs with sixty points
- **THEN** the statement is written with `[` at the end of its first line, the tuples one level deeper filled to 100 columns with a trailing comma on each line, and `]` on its own line

#### Scenario: A highlighter stroke
- **WHEN** `createPen { points, style: { stroke: "@highlight", width: 20, opacity: 0.35 } }` runs
- **THEN** the pen is followed by `style pen1 { stroke highlight; width 20; opacity 0.35 }`

#### Scenario: Points moved
- **WHEN** `setPenPoints { element: "pen1", points }` runs with the same count of points, each 10 to the right
- **THEN** only the numbers change, a comment after the statement is kept, and the inverse restores them

#### Scenario: Refused
- **WHEN** `createPen` runs with no points, or on a flow diagram, or `setPenPoints` names a box
- **THEN** the plan is refused with `edit.invalid-value` for the first two and `edit.unsafe-target` for the third

### Requirement: Stickies and list groups in edits
`createElement` SHALL accept the kind `sticky` in free diagrams, writing `sticky <id> "<text>"` with the text defaulted as `text` defaults its text, and, when `fill` is given, `style <id> { fill "<colour>" }` right after it in the same edit. `createElement` of a `group` SHALL accept `layout` (`column` or `row`) and write it in the group's block: `group <id> "<label>" { layout column }`. `setElementProperty` SHALL accept `layout` (`column`, `row` or null, which removes it with `spacing` and `align`), `spacing` and `align` on a group of a free diagram, writing, replacing or removing the property in the group's block with a minimal edit, and SHALL refuse them on any other target or profile with `edit.invalid-value`.

#### Scenario: A sticky with a colour
- **WHEN** `createElement { kind: "sticky", fill: "#f8bbd0", at: (420, 266) }` runs on a free diagram
- **THEN** `sticky sticky1 "Sticky"` is inserted followed by `style sticky1 { fill "#f8bbd0" }`, and `place sticky1 at (420, 266)` in the placement block, as one edit

#### Scenario: A column group
- **WHEN** `createElement { kind: "group", label: "To do", layout: "column", at: (100, 100) }` runs
- **THEN** `group group1 "To do" { layout column }` is inserted with its `place` and `size`

#### Scenario: Spacing set and the layout removed
- **WHEN** `setElementProperty { element: "todo", property: "spacing", value: 16 }` runs on `group todo "To do" { layout column }` and then `setElementProperty { property: "layout", value: null }`
- **THEN** the block first holds `layout column` and `spacing 16`, and then neither

#### Scenario: A layout on a box
- **WHEN** `setElementProperty { element: "api", property: "layout", value: "column" }` runs on a box
- **THEN** the plan is refused with `edit.invalid-value`

### Requirement: Moving a declaration to a position
`moveElement` SHALL accept `index`, the position among the declarations of the destination block at which the moved declaration is inserted (before the declaration at that index; after the last when omitted or past the end). When the destination is a list group the operation SHALL remove the element's `place` statement and SHALL be refused with `edit.invalid-value` when `at` is given too; when the destination is not a list group, `at` SHALL write the `place` as "Moving declarations between groups" says. Moving a declaration within its own block to another index SHALL be the same operation.

#### Scenario: A card between two cards
- **WHEN** `group todo { layout column }` holds `sticky a`, `sticky b` and `moveElement { element: "c", parent: "todo", index: 1 }` runs on a top-level `sticky c` with `place c at (400, 300)`
- **THEN** `sticky c` is declared between `a` and `b`, `place c at (400, 300)` is gone, and the inverse restores both

#### Scenario: Reordered within a column
- **WHEN** `moveElement { element: "b", parent: "todo", index: 0 }` runs on the second card of `todo`
- **THEN** `b` is declared before `a` and nothing else changes

#### Scenario: A card taken out of a column
- **WHEN** `moveElement { element: "a", parent: null, at: (500, 200) }` runs on a card of `todo`
- **THEN** `sticky a` is declared at the top level with `place a at (500, 200)`

#### Scenario: A place into a list
- **WHEN** `moveElement { element: "c", parent: "todo", index: 0, at: (10, 10) }` runs
- **THEN** the plan is refused with `edit.invalid-value`
