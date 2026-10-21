# source-editing Specification

## Purpose
Structured edit operations that become minimal, comment-preserving text edits, with dependency detection, inverses and revision checks.
## Requirements
### Requirement: Minimal text edits for placement operations
`planEdit(compilation, operation)` SHALL translate `setPosition`, `setSize`, `setRoute` and `setLabelAnchor` into text edits that replace only the tokens that change in the existing placement statement. Every byte outside the edited token ranges MUST be identical after applying the plan. Operations that target a relation MUST name a relation; an anonymous relation key SHALL be rejected with `edit.anonymous-relation` and the hint to run `materializeRelationId` first.

#### Scenario: Move an already placed box
- **WHEN** the source contains `  place api at (360, 180) // keep near the gateway` and the operation is `setPosition(api, 400, 200)`
- **THEN** the plan contains exactly two edits replacing `360` and `180`, and the trailing comment is untouched

#### Scenario: Replace route waypoints
- **WHEN** the source contains `route create from api.east to orders.west via [(520, 180)]` and the operation sets `via` to `[(500, 180), (500, 260)]`
- **THEN** only the text between `via ` and the end of the statement changes and the `from`/`to` ports are untouched

#### Scenario: Route on an anonymous relation
- **WHEN** the operation is `setRoute` with the relation key `orders->db#1`
- **THEN** the plan is rejected with `edit.anonymous-relation` and the text is unchanged

### Requirement: Insertion of missing placement statements
When the target has no placement statement, the plan SHALL insert one as a new line at the end of the existing `placement { }` block, indented like the existing statements of the block (or the parent indentation plus the detected indent unit when the block is empty), using the detected line ending of the document. When the diagram has no `placement` block, the plan SHALL insert `placement { ... }` as the last statement of the diagram block, preceded by a blank line when the previous statement is not blank.

#### Scenario: First position for an element in an existing block
- **WHEN** the placement block already contains two `place` statements indented with four spaces and the operation is `setPosition(db, 1000, 180)`
- **THEN** one edit inserts `    place db at (1000, 180)` plus the document line ending after the last statement of the block

#### Scenario: Diagram without placement block
- **WHEN** a diagram has no `placement` block and the operation is `setPosition(api, 360, 180)`
- **THEN** one edit inserts a `placement` block containing the `place` statement before the closing `}` of the diagram, and reparsing the result yields the placement in the model

#### Scenario: CRLF and tabs are respected
- **WHEN** the document uses CRLF line endings and tab indentation
- **THEN** inserted lines end with CRLF and are indented with tabs

### Requirement: Comment and formatting preservation
Applying any edit plan SHALL preserve every comment, blank line and `;`-joined statement that is not the target of the operation. Applying a plan and reparsing SHALL yield a CST whose untouched statements have identical text.

#### Scenario: Comments around the target
- **WHEN** the target statement is preceded by a block comment, followed by a line comment, and separated from the next statement by a blank line
- **THEN** after the edit all three are present unchanged and in the same positions relative to the statement

#### Scenario: Statement joined with semicolons
- **WHEN** `place api at (1, 1); place db at (2, 2)` is on one line and the operation moves `db`
- **THEN** only the numbers of the second statement change and the `;` layout is preserved

### Requirement: Rename element
`renameElement` SHALL replace every identifier token that resolves to the element: its declaration, relation endpoints, port references (`api.east`, `bus.in`), and the targets of placement, constraint, style and animate statements. Named ports keep their names. Strings and comments MUST NOT be modified; comments that contain the old identifier SHALL be listed in the `notes` of the plan. The operation SHALL be rejected with `edit.id-conflict` when the new id is already used, and with `edit.invalid-id` when it is not a valid identifier.

#### Scenario: Rename with references everywhere
- **WHEN** `api` is declared, used in two relations, in `route create from api.east ...`, in `place api at (...)` and in `style api { }` and the operation renames it to `gateway`
- **THEN** all six references become `gateway`, the label string `"API Gateway"` is unchanged, and the plan notes the comment `// api handles auth`

#### Scenario: Rename into an existing id
- **WHEN** elements `api` and `orders` exist and the operation renames `api` to `orders`
- **THEN** the plan is rejected with `edit.id-conflict` and the text is unchanged

#### Scenario: Rename an element used by constraints
- **WHEN** `api` appears in `row api, orders` and `distance api, db 80` and is renamed to `gateway`
- **THEN** both statements name `gateway`, and the text compiles without errors

### Requirement: Relation label and id materialisation
`setRelationLabel` SHALL replace the label string of a relation, add `: "label"` after the target when the relation has none, or remove the `: "label"` segment when the label is set to null. `materializeRelationId` SHALL insert ` as <id>` after the label (or after the target when there is no label) and before any block or terminator; it SHALL be rejected with `edit.already-named` when the relation already has an id and with `edit.id-conflict` when the id is taken.

#### Scenario: Materialise an anonymous relation
- **WHEN** the source contains `orders -> db: "Persist"` and the operation materialises key `orders->db#1` as `save`
- **THEN** the line becomes `orders -> db: "Persist" as save` and nothing else changes

#### Scenario: Materialise a named relation
- **WHEN** the relation already reads `... as save`
- **THEN** the plan is rejected with `edit.already-named`

### Requirement: Remove element with dependency detection
`removeElement` without `cascade` SHALL be rejected with `edit.has-dependents` listing every relation, placement, constraint, style and animate statement that references the element, each with its range. With `cascade` the plan SHALL delete the element declaration and every dependent statement, removing a whole line when the statement owns it and the statement plus one `;` separator when it shares a line. A `style` or `animate` statement that lists other targets SHALL keep its statement and lose only the removed target and its separating comma. A constraint that keeps at least two targets SHALL lose only the removed ones; a `distance`, or a constraint left with fewer than two targets, SHALL be deleted.

#### Scenario: Removal blocked by dependents
- **WHEN** `db` is referenced by one relation and one `place` statement and the operation is `removeElement(db, cascade: false)`
- **THEN** the plan is rejected with `edit.has-dependents` and two dependents are listed with their ranges

#### Scenario: Cascading removal
- **WHEN** the same operation runs with `cascade: true`
- **THEN** the declaration, the relation and the `place` statement are deleted, the surrounding comments remain, and reparsing reports no diagnostics

#### Scenario: Implicit elements survive the removal of their relations
- **WHEN** `a` is declared only by the relation `a -> b` and `removeElement(b, cascade: true)` runs
- **THEN** the relation is replaced by `node a`, statements that place or style `a` keep working, and the plan notes that `a` was kept

#### Scenario: One target of a shared style
- **WHEN** `style obo, ciba, cimd { line dashed }` exists and `removeElement(ciba, cascade: true)` runs
- **THEN** the statement becomes `style obo, cimd { line dashed }` and its block is untouched

#### Scenario: Last target of a shared style
- **WHEN** `style obo, ciba { line dashed }` exists and both `obo` and `ciba` are removed in one cascade
- **THEN** the whole statement is deleted

#### Scenario: Constraints lose a removed element
- **WHEN** `align a, b, c top`, `row b, c` and `distance a, c 80` exist and `removeElement(c, cascade: true)` runs
- **THEN** the first becomes `align a, b top`, the other two are deleted, and the text compiles without diagnostics

### Requirement: Inverse edits and revision checks
Every plan SHALL carry `baseRevision` and an `inverse` edit list. `applyEdits(document, plan)` SHALL reject with `edit.stale-revision` when the document revision differs from `baseRevision`, and otherwise SHALL return the new text and a new revision. Applying `inverse` to the new text MUST restore the previous text exactly.

#### Scenario: Inverse restores the original
- **WHEN** any edit fixture is applied and then its inverse is applied
- **THEN** the resulting text equals the original byte for byte

#### Scenario: Stale revision
- **WHEN** a plan is created against revision 3 and the document is now at revision 4
- **THEN** `applyEdits` rejects with `edit.stale-revision` and the document is unchanged

### Requirement: Unsafe targets are rejected
When the diagram containing the target has syntax errors, or the target cannot be located in the source map, `planEdit` SHALL reject with `edit.unsafe-target` and a message explaining what prevents the edit.

#### Scenario: Diagram with a syntax error
- **WHEN** the target diagram contains an unterminated string on another line and the operation is `setPosition`
- **THEN** the plan is rejected with `edit.unsafe-target` naming the line of the syntax error

### Requirement: Batch plans
`planBatch(compilation, operations, options)` SHALL plan each operation on the text produced by the previous ones and compose the edits onto the base text:

- edits in untouched text are shifted;
- an edit that touches text inserted earlier is merged with that insertion.

Applying the batch to the base text SHALL equal applying the operations one by one, and its inverse SHALL restore the base text. When an operation is refused, the batch SHALL be refused with that operation's code and `operationIndex`, and nothing SHALL be planned.

#### Scenario: Two moves and a size
- **WHEN** a batch moves `api` and `db` and resizes `api`
- **THEN** one plan changes the three statements, and its inverse restores the original text

#### Scenario: One refusal refuses all
- **WHEN** the second of three operations names an unknown element
- **THEN** the batch is refused with `edit.unsafe-target` and `operationIndex` 1

### Requirement: Creating elements and relations
`createElement { diagram, kind, id?, label?, at?, size?, parent? }` SHALL insert a declaration of the kind after the last declaration of the diagram, or of the group `parent`:

- shorthand for `node` and `data`;
- the keyword form for `decision`, `note`, `tag` and `group`.

Without `id`, it SHALL generate `<kind><n>` with the smallest free `n`. With `at` it SHALL also write `place`, and with `size`, `size`. `createRelation { diagram, from, to, line, label?, id?, fromPort?, toPort? }` SHALL insert the relation after the last relation, or after the last declaration. With ports, it SHALL also write `as <id>` and a `route`.

#### Scenario: Node with a place
- **WHEN** `createElement` adds a node at (420, 266) to a diagram whose ids include `node1`
- **THEN** `node2["Node"]` is inserted after the last declaration and `place node2 at (420, 266)` in the placement block

### Requirement: Relation operations
The edit package SHALL support:

- **`renameRelation { relation, newId }`**: renames a named relation and every `route`, `label`, `style` and `animate` reference to it;
- **`removeRelation { relation }`**: deletes the relation, its `route` and `label`, and its style and animate targets, keeping shared statements for other targets;
- **`reconnectRelation { relation, end, element, port? }`**: replaces one endpoint, and its port in the `route`;
- **`setRelationLine { relation, line }`**: switches `->` and `-->`, and `<->` and `<-->` for a two-way relation, which stays two-way.

A relation that cannot be named because it is anonymous SHALL be addressed by its key.

#### Scenario: Reconnect the target
- **WHEN** `api -> db as save` with `route save from api.east to db.west` is reconnected to `cache` at the north port
- **THEN** the relation reads `api -> cache as save` and the route `route save from api.east to cache.north`

#### Scenario: Dashed two-way
- **WHEN** `setRelationLine` sets `line` `dashed` on `api <-> cache as sync`
- **THEN** the relation reads `api <--> cache as sync`

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

### Requirement: Style and diagram properties
`setStyleProperty { target, property, value }` SHALL do one of the following:

- replace the value in the statement that sets the property for the target;
- insert the property into the target's single-target `style` block;
- create `style <target> { <property> <value> }` after the last `style` statement or at the end of the body.

When the property is set in a statement shared by several targets, that statement SHALL lose the target, which SHALL get its own statement with the shared properties and the new value. A `null` value SHALL remove the property and delete a single-target statement left empty. Values SHALL be validated as in the model. `setDiagramProperty { property, value }` SHALL replace, insert after the last property statement, or remove a diagram property.

#### Scenario: Remove the last property
- **WHEN** `style api { fill accent }` exists and `fill` of `api` is set to `null`
- **THEN** the whole statement is removed

### Requirement: Ports and groups
`addPort { element, name, side, position? }` SHALL add `port <name> <side> [<n>%]` to the element's block, creating the block when needed. `removePort` SHALL delete it, and SHALL be refused with `edit.has-dependents` while routes use it.

`groupElements { elements, id, label }` SHALL move the declarations of sibling elements into a new group block at the position of the first one, re-indented. Implicit elements SHALL become `node` declarations inside the group. Elements with different parents SHALL be refused with `edit.unsafe-target`.

`ungroup { group }` SHALL replace a group with its children, dedented, and drop the group's own `description`, `class`, `place`, `size`, `style` and `animate` statements. A group used as a relation endpoint SHALL be refused with `edit.has-dependents`.

#### Scenario: Group two boxes
- **WHEN** `api` and `db`, declared on consecutive lines, are grouped as `backend "Backend"`
- **THEN** the two lines are replaced by a `group backend "Backend" { ... }` block containing them, and their places are unchanged

### Requirement: Inserting fragments
`insertFragment { diagram, fragment }` SHALL take the text of a compiled `diagram <id>: flow { }` fragment and insert:

- its declarations and relations before the first `placement` block of the diagram, or at the end of the body;
- its placement statements into the last `placement` block, or a new one;
- its `style` and `animate` statements at the end of the body.

Ids in the fragment that already exist in the diagram SHALL be refused with `edit.id-conflict`.

#### Scenario: Paste into a diagram
- **WHEN** a fragment declaring `api_2` with `place api_2 at (388, 208)` is inserted
- **THEN** the declaration, the place and any styles of `api_2` appear in their sections and the text compiles without new errors

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

### Requirement: Reordering declarations
`reorderElement { element, to }` SHALL move an element's declaration, with its block and the comments attached to it, among its sibling declarations in the same block:

- `front` makes it the last sibling declaration;
- `back` makes it the first;
- `forward` moves it after the next sibling declaration;
- `backward` moves it before the previous one.

Relations and other statements SHALL stay where they are. A move that would change nothing SHALL return an empty plan. Implicit elements SHALL first gain a declaration.

#### Scenario: Send backward
- **WHEN** a free diagram declares `a`, `b` and `c` in that order and `c` is sent backward
- **THEN** the order of the declarations is `a`, `c`, `b`, and the text compiles without new errors

### Requirement: Layer and link statements
`setElementProperty { target, targetKind, property, value }` SHALL set, replace or (with `null`) remove the `layer` or `link` statement in the block of an element or relation, creating the block when needed. A `layer` value SHALL name a declared layer and a `link` value SHALL be `<diagram>.<element>`; other values SHALL be refused with `edit.invalid-value`. `link` SHALL be refused on relations.

#### Scenario: Move to a layer
- **WHEN** `box a "A"` in a free diagram with `layers main, front` is set to layer `front`
- **THEN** the declaration reads `box a "A" { layer front }`

### Requirement: Arranging free diagrams
`arrange` with `writeGroups: true` SHALL also write a `place` and a `size` for each group. In a free diagram, the places of group children SHALL be written relative to their group's interior origin. Without `writeGroups`, groups SHALL be left as they are.

#### Scenario: Write an automatic free layout
- **WHEN** an `auto` free diagram with group `g` holding `a` is arranged with scope `all` and `writeGroups: true`
- **THEN** `g` gains a `place` and a `size`, and `a`'s `place` is relative to `g`'s interior

### Requirement: Links follow renames and removals
`renameElement` SHALL rewrite the element part of every same-file `link` that targets the renamed element. `removeElement` SHALL list the `link` statements targeting the element as dependents of kind `link`. With `cascade` it SHALL remove those statements, and a block left empty SHALL be removed with them. `ungroup` SHALL remove the links to the group, with a note.

#### Scenario: Rename a linked element
- **WHEN** `api` of `diagram checkout` is renamed to `gateway` and `checkout_free` holds `box api "API Gateway" { link checkout.api }`
- **THEN** the link reads `link checkout.gateway`, and the box keeps its id `api`

### Requirement: Icon and image sources
`setElementSource { element, source }` SHALL replace the icon reference of an `icon` object or the path of an `image` object, and SHALL be refused with `edit.unsafe-target` for other elements. `setElementLabel` SHALL be refused for icons and images, which have no label.

#### Scenario: Change an icon
- **WHEN** `icon i "tabler:user"` gets the source `tabler:server`
- **THEN** the declaration reads `icon i "tabler:server"`

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

### Requirement: Converting a box into a container
`convertToContainer { diagram, element, children, size? }` SHALL replace the declaration of a flow `node` or a free `box` by a group block with the same id, label and description at the same place in the text, and SHALL move the declarations of `children` (`{ id, at? }`, siblings of the element declared after it) into that block in their order of declaration, as `moveElement` does, writing each child's `place` from `at` when given. It SHALL keep the element's `place`, `class`, `link`, `layer`, `animate` statements and style properties, SHALL drop `shape` from its style statements (`square` and `rectangle` SHALL become `radius 0`; a statement left empty SHALL go), SHALL keep its `size` or write `size` from the operation when the element has none, and SHALL leave relations that end on the element as they are. The operation SHALL be refused with `edit.unsafe-target` for other kinds, for sequence diagrams and C4 views, and for a child that is not a sibling, is the element or is a group holding it, and with `edit.has-dependents` naming the ports when the element declares `port` statements. The inverse SHALL restore the text exactly.

#### Scenario: Square to container in a flow diagram
- **WHEN** `node3[""]` with `style node3 { shape square; line dashed; fill "#DBBDBD" }`, `place node3 at (770, 68)` and `size node3 (238, 196)` is converted with `children: [{ id: "db" }]`, `db[("Database")]` being declared after it
- **THEN** the text declares `group node3 "" {` with `db[("Database")]` inside and no other change of order, `style node3 { line dashed; fill "#DBBDBD"; radius 0 }`, the place and size unchanged, `api -> db` and `db -> client` still resolve, the text compiles without errors and the inverse restores it

#### Scenario: Box to container in a free diagram
- **WHEN** `box frame "" { link overview.node3 }` with `place frame at (400, 300)` and no `size` is converted with `children: [{ id: "db", at: (120, 48) }]` and `size: (238, 196)`
- **THEN** the text declares `group frame "" { link overview.node3` … `box db …` `}`, gains `size frame (238, 196)`, and `place db at (120, 48)` replaces the box's old place

#### Scenario: Refused for ports
- **WHEN** a node declaring `port in west` is converted
- **THEN** the plan is refused with `edit.has-dependents` naming `in`

#### Scenario: Refused child
- **WHEN** a node is converted with a child declared inside another group
- **THEN** the plan is refused with `edit.unsafe-target`

### Requirement: Creating diagrams
`createDiagram { type, id?, title? }` SHALL append `diagram <id>: <type> {` and `}` after the last top-level statement of the file, separated by a blank line, for `type` `flow`, `free` or `sequence`; `title` SHALL add `title "<title>"` inside. The id SHALL default to the first of `diagram1`, `diagram2`… that no diagram, model, theme or story of the file uses. A file without a `language` header SHALL get `language "0.2"` and a blank line first. A given id that is not an identifier or is taken, or another type, SHALL be refused with `edit.invalid-value`. The result SHALL compile without new errors.

#### Scenario: Empty file
- **WHEN** `createDiagram { type: "flow" }` runs on an empty text
- **THEN** the text becomes `language "0.2"\n\ndiagram diagram1: flow {\n}\n`

#### Scenario: Next free id
- **WHEN** the file declares `diagram diagram1: flow { }` and `createDiagram { type: "free", title: "Slide" }` runs
- **THEN** `diagram diagram2: free {\n  title "Slide"\n}` is appended after it

#### Scenario: Taken id
- **WHEN** `createDiagram { type: "flow", id: "overview" }` runs on a file that declares `overview`
- **THEN** the plan is refused with `edit.invalid-value`

