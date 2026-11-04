# diagram-type-registry Specification

## Purpose
Diagram types declared as data: schema, validation, layout, palette tools and primitives, compiled on the free profile.
## Requirements
### Requirement: Declared diagram types
A diagram type SHALL be declarable as data: its name, title and description; kinds with label,
description, style (shape, colours, line, icon, text) and typed properties (`string`, `number`,
`boolean`, `enum`) with required ones; allowed relations between kinds and relation properties;
layout mode, algorithm (`layered` or `tree`) and direction; and palette tools. Definitions SHALL be
checked (`readDiagramType`), refusing words of the language as type, kind or property names, and
unknown kinds, styles or values. `compile(text, { types })` SHALL compile `diagram <id>: <type>`
of a declared type on the free profile, kinds as boxes carrying `typeKind` and `data`.

#### Scenario: Entity diagram
- **WHEN** `diagram s: erd { entity orders "Orders" { owner "Sales"; rows 1200 } }` compiles with the
  `erd` type
- **THEN** `orders` is a box with `typeKind` `entity` and `data` `{ owner: "Sales", rows: 1200 }`

### Requirement: Validation of declared types
A declared type SHALL check that every element of a kind sets the kind's required properties
(`type.missing-property`), that relations join allowed kinds (`type.relation-not-allowed`, with the
allowed pairs as hint), and that property values match their declared kind.

#### Scenario: Relation not allowed
- **WHEN** an `erd` diagram relates an entity to a view and only view-to-entity is allowed
- **THEN** `type.relation-not-allowed` is reported on the relation

### Requirement: Layout, primitives and tools of declared types
Layouts SHALL draw a declared kind with the kind's style first, then rules of the kind, classes and
styles; arrange with the type's algorithm and direction (`tree` centring parents over their
children); and editors SHALL offer the type's kinds in the palette, complete kinds, properties and
enum values, describe kinds on hover, and create declared kinds from the palette.

#### Scenario: Organisation chart
- **WHEN** an `org` diagram (tree, top to bottom) is laid out
- **THEN** every role is centred over the teams it leads

