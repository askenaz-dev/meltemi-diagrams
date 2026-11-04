## ADDED Requirements

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
