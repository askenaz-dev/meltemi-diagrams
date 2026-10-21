## ADDED Requirements

### Requirement: Theme block compilation
`compile(text)` SHALL turn every `theme <id> { }` block into a theme definition in `document.themes` with its id, its `extends` target (or null) and its tokens. Tokens SHALL be flat `name value` statements validated against the theme token table: colour tokens (`background`, `surface`, `ink`, `muted`, `line`, `connector`, `band`, `bandLine`, `tag`, `tagText`, `accent`, `accentEnd`) and `brand`, `font`, `mono`, `extends` take a quoted string; `frame` takes `none`, `footer` or `header`; `mark` takes `meltemi` or `none`. An unknown token SHALL produce `prop.unknown` with the list of tokens, a repeated token `prop.duplicate`, and a wrong value `prop.invalid-value`. A theme id SHALL share the file namespace with diagrams (`ref.duplicate-id`).

#### Scenario: Theme with palette and frame
- **WHEN** a file contains `theme konfio { extends "meltemi.light"; accent "#6a4fd0"; frame footer; brand "Konfío · Meltemi Charts" }`
- **THEN** the document lists one theme `konfio` extending `meltemi.light` with tokens `accent`, `frame` and `brand`, and no diagnostic is reported

#### Scenario: Unknown and invalid tokens
- **WHEN** a theme block contains `colour "#fff"` and `frame sideways`
- **THEN** `prop.unknown` is reported on `colour` and `prop.invalid-value` on `sideways` listing `none, footer, header`

#### Scenario: Theme block is no longer unsupported
- **WHEN** a file contains only `theme t { ink "#000" }`
- **THEN** compilation reports no `block.unsupported` diagnostic and `ok` is true

### Requirement: Theme inheritance
A theme's `extends` target MUST be a built-in theme name (`meltemi.light`, `meltemi.dark`, `studio.light`, `studio.dark`) or the id of a theme in the same file; otherwise `theme.unknown-base` SHALL be reported on the `extends` value. Inheritance that returns to a theme SHALL be reported as `theme.cycle` on that theme. A theme without `extends` SHALL inherit from `meltemi.light`.

#### Scenario: Unknown base
- **WHEN** a theme block contains `extends "corporate"` and no theme `corporate` exists in the file
- **THEN** `theme.unknown-base` is reported on `"corporate"` with the built-in names in the hint

#### Scenario: Cycle
- **WHEN** a file contains `theme a { extends "b" }` and `theme b { extends "a" }`
- **THEN** `theme.cycle` is reported on both themes and compilation does not loop

### Requirement: Theme resolution
`resolveTheme(name, themes)` in the layout SHALL resolve a name first among the file's theme definitions, then among built-in themes, applying `extends` chains so that a file theme overrides only the tokens it sets. An unknown name SHALL resolve to `meltemi.light` with `known: false`.

#### Scenario: File theme overrides one token
- **WHEN** `theme konfio { extends "meltemi.dark"; accent "#6a4fd0" }` is resolved
- **THEN** every token equals `meltemi.dark` except `accent`, which is `#6a4fd0`

#### Scenario: Chained file themes
- **WHEN** `theme base { tag "#111111" }` and `theme child { extends "base"; frame none }` are resolved as `child`
- **THEN** the theme has `tag` `#111111`, `frame` `none` and the remaining tokens of `meltemi.light`
