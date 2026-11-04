## MODIFIED Requirements

### Requirement: Package scope
Every workspace package under `packages/<folder>` SHALL be named `@meltemi/diagrams-<folder>`, SHALL export its TypeScript entry under the condition `@meltemi/diagrams-source`, and SHALL depend on other workspace packages by those names. The one exception is `packages/vscode`, the VS Code extension: extension names cannot carry an npm scope, so it SHALL be named `meltemi-diagrams` with publisher `meltemi`, SHALL be `private`, and SHALL export nothing. `tsconfig.base.json`, the root scripts and `vitest.config.ts` SHALL use the same condition and names. The repository SHALL NOT mention the package scope or the command name used before decision 0002, outside archived OpenSpec changes and decision records.

#### Scenario: Manifest names
- **WHEN** the names test reads every `packages/*/package.json`
- **THEN** each name equals `@meltemi/diagrams-` followed by the folder name, and each `exports["."]` has the `@meltemi/diagrams-source` condition, except `packages/vscode`, which is the private extension `meltemi-diagrams`

#### Scenario: No leftovers
- **WHEN** the names test scans the repository text files outside `node_modules`, `dist`, `openspec/changes/archive` and `docs/decisions`
- **THEN** no file contains the former scope or an invocation of the former command, and the test names the offending file when one does
