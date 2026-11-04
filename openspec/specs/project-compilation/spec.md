# project-compilation Specification

## Purpose
Compiling files with their imports: theme scopes across files, qualified references to top-level blocks, and the incremental workspace with overlays.
## Requirements
### Requirement: Compiling with imports
`Workspace.compileFile(path)` SHALL compile the file and every file it imports, transitively. It SHALL return, for each file of the closure, its single-file compilation, its resolved bindings, and its diagnostics: compile diagnostics plus every `module.*`, `project.*` and cross-file `theme.*` diagnostic located in that file. `Workspace.compileProject()` SHALL do the same for every source file of the project and for `project.json`. Neither SHALL throw for any file content.

#### Scenario: Diagram using an imported theme
- **WHEN** `diagrams/checkout.meltemi` imports `corporate from "../themes/company.meltemi"` and sets `theme "corporate"`
- **THEN** the file has no diagnostics and its layout uses the tokens of `corporate`

#### Scenario: Project with problems in two files
- **WHEN** a project has a cycle between `a.meltemi` and `b.meltemi` and an unknown field in `project.json`
- **THEN** `compileProject()` reports `module.cycle` in the file that closes the cycle and `project.unknown-field` in `project.json`

### Requirement: Theme scopes across files
`themeDefinitionsFor(file)` SHALL return definitions under which `resolveTheme` resolves, for that file:

- local theme ids;
- member bindings;
- `namespace.id` names;
- built-in names.

An imported theme SHALL resolve its own `extends` in the scope of the file that defines it. An `extends` or `theme` name with an import prefix that resolves to nothing SHALL be `theme.unknown-base` for `extends`, and `layout.unknown-theme` for `theme`, on the written name. Names bound by an import that did not resolve SHALL NOT be reported again. An inheritance loop across files implies an import cycle; it SHALL be reported only as `module.cycle`, and resolution SHALL terminate.

#### Scenario: Namespace-qualified theme
- **WHEN** a file imports `"../themes/company.meltemi" as company` and sets `theme "company.corporate"`
- **THEN** the diagram is laid out with `corporate`, including the tokens it inherits from its own base `base` in `company.meltemi`

#### Scenario: Local theme extending an imported one
- **WHEN** a file declares `theme local { extends "corp"; accent "#ff0000" }` and imports `corporate as corp`
- **THEN** `local` has every token of `corporate` except `accent`

#### Scenario: Cross-file cycle
- **WHEN** `a.meltemi` has `theme x { extends "b.y" }` importing `b.meltemi` as `b`, and `b.meltemi` has `theme y { extends "a.x" }` importing `a.meltemi` as `a`
- **THEN** `module.cycle` is reported, no `theme.*` diagnostic is added for the cut names, and the layout terminates with the default theme

### Requirement: Qualified references to top-level blocks
`resolveReference(file, ref, kinds)` SHALL resolve a reference to a top-level block of one of the given kinds, in this order:

1. a local id;
2. a member binding;
3. `namespace.id`.

It SHALL return the defining file, id and kind. When nothing matches, it SHALL fail with a message that lists the candidates of those kinds visible in the file. A match of the wrong kind SHALL fail naming the kind found.

#### Scenario: Diagram through a namespace
- **WHEN** `stories/purchase.meltemi` imports `"../diagrams/checkout.meltemi" as flows` and `flows.checkout` is resolved with kinds `diagram`
- **THEN** the result is the diagram `checkout` in `diagrams/checkout.meltemi`

#### Scenario: Wrong kind
- **WHEN** `company.corporate` is resolved with kinds `diagram` and `corporate` is a theme
- **THEN** resolution fails, saying that `company.corporate` is a theme, not a diagram

### Requirement: Incremental workspace
The workspace SHALL take a file's text from its overlay when one is set (unsaved editor buffers) and from the host otherwise. `setOverlay` and `invalidate` SHALL discard the cached results of that file and of every file that imports it, directly or transitively, and nothing else. Recompiling after a change SHALL reuse the single-file compilations of unaffected files.

#### Scenario: Editing a shared theme
- **WHEN** an overlay changes `themes/company.meltemi` in a project where `checkout.meltemi` and `payment.meltemi` import it and `notes.meltemi` does not
- **THEN** the next compilation re-resolves `checkout` and `payment`, reuses the single-file compilation of `notes`, and reads the overlay text instead of the file on disk

#### Scenario: Clearing an overlay
- **WHEN** the overlay of a file is set to `null`
- **THEN** the next compilation reads the file from the host again

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

