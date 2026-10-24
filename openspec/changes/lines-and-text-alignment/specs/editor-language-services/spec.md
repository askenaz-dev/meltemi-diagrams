## MODIFIED Requirements

### Requirement: Completion
`completions(analysis, offset)` SHALL return the items that are valid at the cursor, according to the innermost block, the statement keyword and the argument index:

- top-level words;
- the statements of the flow body and the element ids that start a relation;
- element ids after `->`, `-->`, `--`, `---`, `<->` and `<-->`;
- the statements of element blocks;
- the enumerated values of diagram properties;
- the themes in scope inside `theme "`;
- placement statements, then element or relation ids by argument;
- the ports of an element after `<element>.`;
- style properties and their values: enums, colour token names, classes in scope, `verticalAlign` with `top`, `middle` and `bottom` in free diagrams;
- icon references matching the typed prefix, at most 200;
- animation properties and their values;
- theme tokens and their values, `sketch` with `none`, `light` and `rough`.

Each item SHALL carry a kind and a short detail.

#### Scenario: Ports after a dot
- **WHEN** completion runs after `route publish from api.east to bus.` and `bus` declares the port `in`
- **THEN** the items are `in`, `north`, `south`, `east`, `west` and `auto`

#### Scenario: Values of a property
- **WHEN** completion runs after `layout ` in a flow body
- **THEN** the items are `auto`, `assisted` and `manual`

#### Scenario: Relation targets
- **WHEN** completion runs after `api -> ` in a diagram that declares `api`, `db` and `cache`
- **THEN** the items include `db` and `cache`

#### Scenario: Targets after a line token
- **WHEN** completion runs after `api -- ` and after `api --- ` in the same diagram
- **THEN** the items include `db` and `cache` both times

#### Scenario: Sketch token values
- **WHEN** completion runs after `sketch ` inside a `theme` block
- **THEN** the items are `none`, `light` and `rough`, and `sketch` itself is offered among the tokens at the start of a theme statement

## ADDED Requirements

### Requirement: Hover and symbols name the written token
The hover of a relation and its entry in the document symbols SHALL print the relation with the token as written (`->`, `-->`, `--`, `---`, `<->` or `<-->`), not a token derived from its line alone, and the hover of a `--` or `---` relation SHALL say it is a line without heads unless styled.

#### Scenario: Hover on a line relation
- **WHEN** the cursor is on `cache` in `api -- cache as link`
- **THEN** the hover's first line is **Relation** `api -- cache`, named `link`

#### Scenario: Symbol of a two-way relation
- **WHEN** `documentSymbols` runs on a diagram with `api <-> cache`
- **THEN** the relation's symbol is named `api <-> cache`

#### Scenario: Hover on a relation with a missing target
- **WHEN** the cursor is on `--` in `api --` with no target
- **THEN** no relation hover is returned, and the diagnostic for the missing target stands
