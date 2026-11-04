## ADDED Requirements

### Requirement: Icon style properties
Style blocks, classes and rules SHALL accept:

- `iconColor`, a quoted colour or a colour token name, which paints monochrome icons;
- `iconPosition left|top`, which places the icon of a node, decision or data store.

They follow the same precedence as the other properties, so `rule data { icon "tabler:database" }` gives every data store an icon. `iconPosition` on a relation target of a `style` statement or a relation rule SHALL be `prop.invalid-value`. `iconColor` with a bare word that is not a colour token SHALL be `prop.invalid-value`.

#### Scenario: Icon for every data store
- **WHEN** a diagram contains `rule data { icon "tabler:database"; iconColor accent }` and two data stores
- **THEN** both stores are drawn with the Tabler database icon in the theme accent

#### Scenario: Icon position on a relation
- **WHEN** a style statement targeting a relation contains `iconPosition top`
- **THEN** `prop.invalid-value` is reported on `iconPosition` with the hint that it applies to elements
