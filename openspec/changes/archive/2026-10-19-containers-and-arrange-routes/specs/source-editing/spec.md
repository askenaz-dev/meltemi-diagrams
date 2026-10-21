## ADDED Requirements

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
