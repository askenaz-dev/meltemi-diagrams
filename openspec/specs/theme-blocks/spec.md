# theme-blocks Specification

## Purpose
Theme blocks in sources: token validation, inheritance and resolution against built-in themes.
## Requirements
### Requirement: Theme block compilation
`compile(text)` SHALL turn every `theme <id> { }` block into a theme definition in `document.themes` with its id, its `extends` target (or null), its tokens, its classes and its rules. Tokens SHALL be flat `name value` statements validated against the theme token table of the `theme-tokens` capability: colours, fonts, type sizes, the label weight, spacing, radii, widths, the arrowhead, `frame`, `brand`, `mark` and `extends`. `class <id> { }` and `rule <kind> { }` statements SHALL be read as described by the `style-classes-and-rules` capability. An unknown token SHALL produce `prop.unknown` with the list of tokens, a repeated token `prop.duplicate`, and a wrong value `prop.invalid-value`. A theme id SHALL share the file namespace with diagrams (`ref.duplicate-id`).

#### Scenario: Theme with palette and frame
- **WHEN** a file contains `theme konfio { extends "technical.light"; accent "#6a4fd0"; frame footer; brand "Konfío · Meltemi Diagrams" }`
- **THEN** the document lists one theme `konfio` extending `technical.light` with tokens `accent`, `frame` and `brand`, and no diagnostic is reported

#### Scenario: Unknown and invalid tokens
- **WHEN** a theme block contains `colour "#fff"` and `frame sideways`
- **THEN** `prop.unknown` is reported on `colour` and `prop.invalid-value` on `sideways` listing `none, footer, header`

#### Scenario: Theme block is no longer unsupported
- **WHEN** a file contains only `theme t { ink "#000" }`
- **THEN** compilation reports no `block.unsupported` diagnostic and `ok` is true

#### Scenario: Classes and rules in a theme
- **WHEN** a theme block contains `class proposed { line dashed }` and `rule data { pattern dots }`
- **THEN** the theme definition lists the class `proposed` and the rule for `data`, and its tokens do not include them

### Requirement: Theme inheritance
A theme's `extends` target MUST be one of:

- a built-in theme name (`technical.light`, `technical.dark`, `editorial.light`, `editorial.dark`, `stage.light`, `stage.dark`);
- the id of a theme in the same file;
- a theme reached through an import (a member binding or `namespace.id`).

Otherwise `theme.unknown-base` SHALL be reported on the `extends` value. Single-file compilation SHALL leave names that start with an import binding to project compilation, which reports them when they do not resolve. Inheritance that returns to a theme within a file SHALL be reported as `theme.cycle` on that theme. A loop across files needs an import cycle, which is reported as `module.cycle`. A theme without `extends` SHALL inherit from `technical.light`. A theme SHALL inherit the classes and rules of its bases as well as their tokens.

#### Scenario: Unknown base
- **WHEN** a theme block contains `extends "corporate"` and no theme `corporate` exists in the file or its imports
- **THEN** `theme.unknown-base` is reported on `"corporate"` with the built-in names in the hint

#### Scenario: Cycle
- **WHEN** a file contains `theme a { extends "b" }` and `theme b { extends "a" }`
- **THEN** `theme.cycle` is reported on both themes and compilation does not loop

#### Scenario: Imported base in single-file compilation
- **WHEN** a file imports `"./company.meltemi" as company` and declares `theme local { extends "company.corporate" }`
- **THEN** `compile()` alone reports no `theme.unknown-base`, and project compilation resolves the base

### Requirement: Theme resolution
`resolveTheme(name, themes)` in the layout SHALL resolve a name first among the given theme definitions, then among built-in themes, applying `extends` chains so that a theme overrides only the tokens it sets. The resolved theme SHALL carry every token, the classes of the chain (a class of a more specific theme shadowing one of the same name in a base, and built-in classes last), and the rules of the chain from the base to the most specific. The definitions SHALL be the file's themes, or the scope returned by `themeDefinitionsFor(file)` when the file is compiled in a project. An unknown name SHALL resolve to `technical.light` with `known: false`.

#### Scenario: File theme overrides one token
- **WHEN** `theme konfio { extends "technical.dark"; accent "#6a4fd0" }` is resolved
- **THEN** every token equals `technical.dark` except `accent`, which is `#6a4fd0`

#### Scenario: Chained file themes
- **WHEN** `theme base { tag "#111111" }` and `theme child { extends "base"; frame none }` are resolved as `child`
- **THEN** the theme has `tag` `#111111`, `frame` `none` and the remaining tokens of `technical.light`

#### Scenario: Imported theme through the layout option
- **WHEN** `layoutDiagram` receives `themes` from `themeDefinitionsFor(file)` and the diagram sets `theme "corp"`, a member binding of an imported theme
- **THEN** the scene uses that theme's tokens and no `layout.unknown-theme` is reported

#### Scenario: Inherited classes
- **WHEN** `theme base { class hot { fill "#ff0000" } }` and `theme child { extends "base"; class hot { fill "#00ff00" } }` are resolved as `child`
- **THEN** the class `hot` has fill `#00ff00`, and the built-in classes are present

