## ADDED Requirements

### Requirement: Moving declarations between groups
`moveElement { diagram, element, parent, at? }` SHALL move an element's declaration, with its block and the comments attached to it, out of its current block and into the block of `parent` (a group id) or, when `parent` is `null`, into the diagram body, re-indented, after the last declaration there. When `at` is given it SHALL write the element's `place` to that point (the host passes the point in the new parent's interior coordinates); otherwise the `place` SHALL stay as written. Relations, styles and animations SHALL stay where they are and keep working by id. Implicit elements SHALL first gain a declaration. The operation SHALL be refused with `edit.unsafe-target` when `parent` is the element itself or one of its descendants, when `parent` is not a group, and in sequence diagrams and C4 views. A move whose parent is already the element's parent and that gives no `at` SHALL return an empty plan. The inverse SHALL restore the text exactly.

#### Scenario: Into a group
- **WHEN** `box c` is declared at the top level of a free diagram with `place c at (400, 300)`, and `moveElement { element: "c", parent: "g", at: (84, 60) }` runs
- **THEN** `box c` is declared inside `group g { … }` after its last declaration, `place c at (84, 60)` replaces the old place, the text compiles without new errors, and the inverse restores the original text

#### Scenario: Out to the diagram body
- **WHEN** `node api` is declared inside `group backend` and `moveElement { element: "api", parent: null }` runs
- **THEN** `node api` is declared at the top level after the last top-level declaration, and `api -> db` still resolves

#### Scenario: Refused cycle
- **WHEN** `moveElement { element: "outer", parent: "inner" }` runs and `inner` is a group declared inside `outer`
- **THEN** the plan is refused with `edit.unsafe-target`

#### Scenario: Refused in a sequence diagram
- **WHEN** `moveElement` runs on a participant of a sequence diagram
- **THEN** the plan is refused with `edit.unsafe-target`

## MODIFIED Requirements

### Requirement: Labels, descriptions and kinds
The edit package SHALL support:

- **`setElementLabel { element, label }`**: replaces the label string, or adds one; an implicit element gains a `node` declaration with the label;
- **`setDescription { target, description }`**: sets, adds or (with `null`) removes the `description` statement of an element or relation block, creating the block when needed;
- **`setElementKind { element, kind }`**: rewrites the declaration in the new kind's form, keeping id, label and block; when the new kind does not take `shape` (decision, data store, note, tag), the element's `shape` style is removed in the same plan, splitting a style statement shared with other targets.

#### Scenario: Node to data store
- **WHEN** `api["API"] { description "REST" }` becomes a data store
- **THEN** the declaration reads `api[("API")] { description "REST" }`

#### Scenario: Shaped node to decision
- **WHEN** `style api, cache { shape hexagon; fill "#eef" }` exists and `api` becomes a decision
- **THEN** the text reads `decision api "API"`, `style cache { shape hexagon; fill "#eef" }` and `style api { fill "#eef" }`, and compiles without errors

### Requirement: Creating free objects
`createElement` SHALL accept the kinds `box`, `text`, `icon` and `image` in free diagrams, and `group` in both profiles. It SHALL write:

- `box <id> "<label>"`, defaulting the label to `Box`;
- `text <id> "<text>"`, defaulting the text to `Text`;
- `icon <id> "<source>"`;
- `image <id> "<source>"`.

`icon` and `image` SHALL require `source`, and SHALL otherwise be refused with `edit.invalid-value`. A `shape` given with a `box` or a flow `node` SHALL be written as `style <id> { shape <value> }` right after the declaration, in the same edit (beside `icon` when both are given); an unknown shape SHALL be refused with `edit.invalid-value`. In a free diagram, `at` SHALL be written as given, since the host converts it to the parent's interior coordinates. Flow kinds SHALL be refused in free diagrams and free kinds in flow diagrams with `edit.invalid-value`.

#### Scenario: Icon with a source
- **WHEN** `createElement { kind: "icon", source: "tabler:server", at: (420, 266) }` runs on a free diagram whose ids include `icon1`
- **THEN** `icon icon2 "tabler:server"` is inserted after the last declaration, and `place icon2 at (420, 266)` in the placement block

#### Scenario: Box with a shape
- **WHEN** `createElement { kind: "box", shape: "hexagon", at: (420, 266) }` runs on a free diagram
- **THEN** `box box1 "Box"` is inserted followed by `style box1 { shape hexagon }`, and `place box1 at (420, 266)` in the placement block, as one edit

#### Scenario: Unknown shape
- **WHEN** `createElement { kind: "box", shape: "blob", at: (420, 266) }` runs
- **THEN** the plan is refused with `edit.invalid-value`
