## ADDED Requirements

### Requirement: Project default theme
When `project.json` sets `theme`, every program of the project SHALL include the theme's file, `projectTheme(program)` SHALL return the theme as a key that `resolveTheme` resolves under `themeDefinitionsFor(file)` (or the built-in name), and `themeDefinitionsFor(file)` SHALL include that theme and its bases for every file of the project. Tools SHALL pass it to the layout as `defaultTheme`. When the setting is absent or does not resolve, `projectTheme(program)` SHALL return null and the layout SHALL use `technical.light`.

#### Scenario: Diagram without theme
- **WHEN** a project sets `"theme": "themes/company.meltemi#corporate"` and `diagrams/overview.meltemi` has no `theme` and no import of that file
- **THEN** `projectTheme` returns the key of `corporate`, and the layout of `overview` with that `defaultTheme` and `themeDefinitionsFor(file)` uses the tokens of `corporate`

#### Scenario: Unresolved setting
- **WHEN** the project sets `"theme": "themes/missing.meltemi#base"`
- **THEN** `projectTheme` returns null and diagrams use `technical.light`

### Requirement: Class checks
Project compilation SHALL check every class name applied in a flow diagram against the classes visible to it: the diagram's classes, the classes of its theme chain (the diagram's `theme`, or the project default theme, or `technical.light`), and the built-in classes. An unknown name SHALL be `theme.unknown-class` (warning) on the name, listing the classes in scope. Diagrams whose `theme` does not resolve SHALL NOT be checked, since `layout.unknown-theme` already reports them.

#### Scenario: Class from the project theme
- **WHEN** the project theme declares `class external` and a diagram without `theme` applies `class external`
- **THEN** no `theme.unknown-class` is reported

#### Scenario: Unknown class in a project
- **WHEN** a diagram applies `class hot` and no class `hot` is visible
- **THEN** `theme.unknown-class` is reported as a warning on `hot`
