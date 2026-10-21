## MODIFIED Requirements

### Requirement: Theme inheritance
A theme's `extends` target MUST be one of:

- a built-in theme name (`meltemi.light`, `meltemi.dark`, `studio.light`, `studio.dark`);
- the id of a theme in the same file;
- a theme reached through an import (a member binding or `namespace.id`).

Otherwise `theme.unknown-base` SHALL be reported on the `extends` value. Single-file compilation SHALL leave names that start with an import binding to project compilation, which reports them when they do not resolve. Inheritance that returns to a theme within a file SHALL be reported as `theme.cycle` on that theme. A loop across files needs an import cycle, which is reported as `module.cycle`. A theme without `extends` SHALL inherit from `meltemi.light`.

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
`resolveTheme(name, themes)` in the layout SHALL resolve a name first among the given theme definitions, then among built-in themes, applying `extends` chains so that a theme overrides only the tokens it sets. The definitions SHALL be the file's themes, or the scope returned by `themeDefinitionsFor(file)` when the file is compiled in a project. An unknown name SHALL resolve to `meltemi.light` with `known: false`.

#### Scenario: File theme overrides one token
- **WHEN** `theme konfio { extends "meltemi.dark"; accent "#6a4fd0" }` is resolved
- **THEN** every token equals `meltemi.dark` except `accent`, which is `#6a4fd0`

#### Scenario: Chained file themes
- **WHEN** `theme base { tag "#111111" }` and `theme child { extends "base"; frame none }` are resolved as `child`
- **THEN** the theme has `tag` `#111111`, `frame` `none` and the remaining tokens of `meltemi.light`

#### Scenario: Imported theme through the layout option
- **WHEN** `layoutDiagram` receives `themes` from `themeDefinitionsFor(file)` and the diagram sets `theme "corp"`, a member binding of an imported theme
- **THEN** the scene uses that theme's tokens and no `layout.unknown-theme` is reported
