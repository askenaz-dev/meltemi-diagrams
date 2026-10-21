## ADDED Requirements

### Requirement: Import syntax
The parser SHALL accept two top-level import forms:

- `import "<path>" as <namespace>`;
- `import <id> [as <alias>] (, <id> [as <alias>])* from "<path>"`.

Each SHALL be parsed into an `ImportStatement` node that keeps every token. A malformed import SHALL produce `syntax.expected-token` at the first wrong token and parsing SHALL continue with the next statement.

#### Scenario: Namespace import
- **WHEN** a file starts with `import "../themes/company.meltemi" as company`
- **THEN** the CST has an `ImportStatement` with path `../themes/company.meltemi` and namespace `company`

#### Scenario: Member import with alias
- **WHEN** a file contains `import corporate as corp, base from "./themes.meltemi"`
- **THEN** the statement has two members, `corporate` bound as `corp` and `base` bound as `base`

#### Scenario: Missing path
- **WHEN** a file contains `import corporate from`
- **THEN** `syntax.expected-token` is reported after `from` and the next line is parsed normally

### Requirement: Import paths
An import path SHALL be a relative path that starts with `./` or `../`, uses `/` separators and ends in `.meltemi`. Absolute paths, URLs, backslashes, empty segments and other extensions SHALL be `module.invalid-path`. The path SHALL be resolved against the importing file's folder. A result outside the project root SHALL be `module.outside-project`. A file that does not exist SHALL be `module.not-found`, naming the resolved path and, when the host can tell, a file that differs only in letter case.

#### Scenario: URL
- **WHEN** a file imports `"https://example.com/theme.meltemi"`
- **THEN** `module.invalid-path` is reported on the path and nothing is fetched

#### Scenario: Escaping the project
- **WHEN** a file at the project root imports `"../outside.meltemi"`
- **THEN** `module.outside-project` is reported on the path

#### Scenario: Wrong letter case
- **WHEN** a file imports `"./Themes.meltemi"` and only `themes.meltemi` exists
- **THEN** `module.not-found` names `themes.meltemi` as the file with a different case

### Requirement: Bindings and members
A namespace import SHALL bind its namespace, and a member import SHALL bind each member under its alias or its own id. Bound names SHALL share the file's top-level namespace with diagrams, themes, models, stories and exports. A clash SHALL be `ref.duplicate-id`. A binding equal to the first segment of a built-in theme name SHALL be `module.reserved-name`. A member that the module does not define SHALL be `module.unknown-member`, listing the module's top-level ids.

#### Scenario: Clash with a local theme
- **WHEN** a file imports `corporate from "./themes.meltemi"` and also declares `theme corporate { }`
- **THEN** `ref.duplicate-id` is reported on the second definition with the first one as related information

#### Scenario: Reserved namespace
- **WHEN** a file contains `import "./brand.meltemi" as meltemi`
- **THEN** `module.reserved-name` is reported on `meltemi`

#### Scenario: Unknown member
- **WHEN** `themes.meltemi` defines `corporate` and `base` and a file imports `dark from "./themes.meltemi"`
- **THEN** `module.unknown-member` is reported on `dark`, listing `base, corporate`

### Requirement: Position, duplicates and unused imports
An import after the first block SHALL be `module.import-position` (warning) and SHALL still be resolved. A second import of the same resolved file in one file SHALL be `module.duplicate-import` (warning). A binding never used by any reference in the file SHALL be `module.unused-import` with severity `info`.

#### Scenario: Late import
- **WHEN** an import follows a `diagram` block
- **THEN** `module.import-position` is reported and the import's names still resolve

#### Scenario: Unused binding
- **WHEN** a file imports `base from "./themes.meltemi"` and never refers to `base`
- **THEN** `module.unused-import` (info) is reported on `base`

### Requirement: Module cycles
An import that closes a cycle in the import graph SHALL be `module.cycle` (error), with the cycle written as a chain of paths in the message. Compilation SHALL terminate, SHALL leave the names of the cut import unresolved, and SHALL report every other diagnostic.

#### Scenario: Two files importing each other
- **WHEN** `a.meltemi` imports `./b.meltemi` and `b.meltemi` imports `./a.meltemi`
- **THEN** `module.cycle` is reported with the chain `a.meltemi → b.meltemi → a.meltemi`, and compiling either file terminates
