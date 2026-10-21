## ADDED Requirements

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
- **`setRelationLine { relation, line }`**: switches `->` and `-->`.

A relation that cannot be named because it is anonymous SHALL be addressed by its key.

#### Scenario: Reconnect the target
- **WHEN** `api -> db as save` with `route save from api.east to db.west` is reconnected to `cache` at the north port
- **THEN** the relation reads `api -> cache as save` and the route `route save from api.east to cache.north`

### Requirement: Labels, descriptions and kinds
The edit package SHALL support:

- **`setElementLabel { element, label }`**: replaces the label string, or adds one; an implicit element gains a `node` declaration with the label;
- **`setDescription { target, description }`**: sets, adds or (with `null`) removes the `description` statement of an element or relation block, creating the block when needed;
- **`setElementKind { element, kind }`**: rewrites the declaration in the new kind's form, keeping id, label and block.

#### Scenario: Node to data store
- **WHEN** `api["API"] { description "REST" }` becomes a data store
- **THEN** the declaration reads `api[("API")] { description "REST" }`

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
