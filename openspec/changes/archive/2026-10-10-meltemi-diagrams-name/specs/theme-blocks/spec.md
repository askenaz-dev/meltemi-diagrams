## MODIFIED Requirements

### Requirement: Theme block compilation
`compile(text)` SHALL turn every `theme <id> { }` block into a theme definition in `document.themes` with its id, its `extends` target (or null) and its tokens. Tokens SHALL be flat `name value` statements validated against the theme token table: colour tokens (`background`, `surface`, `ink`, `muted`, `line`, `connector`, `band`, `bandLine`, `tag`, `tagText`, `accent`, `accentEnd`) and `brand`, `font`, `mono`, `extends` take a quoted string; `frame` takes `none`, `footer` or `header`; `mark` takes `meltemi` or `none`. An unknown token SHALL produce `prop.unknown` with the list of tokens, a repeated token `prop.duplicate`, and a wrong value `prop.invalid-value`. A theme id SHALL share the file namespace with diagrams (`ref.duplicate-id`).

#### Scenario: Theme with palette and frame
- **WHEN** a file contains `theme konfio { extends "meltemi.light"; accent "#6a4fd0"; frame footer; brand "Konfío · Meltemi Diagrams" }`
- **THEN** the document lists one theme `konfio` extending `meltemi.light` with tokens `accent`, `frame` and `brand`, and no diagnostic is reported

#### Scenario: Unknown and invalid tokens
- **WHEN** a theme block contains `colour "#fff"` and `frame sideways`
- **THEN** `prop.unknown` is reported on `colour` and `prop.invalid-value` on `sideways` listing `none, footer, header`

#### Scenario: Theme block is no longer unsupported
- **WHEN** a file contains only `theme t { ink "#000" }`
- **THEN** compilation reports no `block.unsupported` diagnostic and `ok` is true
