## ADDED Requirements

### Requirement: Package scope
Every workspace package under `packages/<folder>` SHALL be named `@meltemi/diagrams-<folder>`, SHALL export its TypeScript entry under the condition `@meltemi/diagrams-source`, and SHALL depend on other workspace packages by those names. `tsconfig.base.json`, the root scripts and `vitest.config.ts` SHALL use the same condition and names. The repository SHALL NOT mention the former `@dac` scope, nor the former `studio` command, outside archived OpenSpec changes and decision records.

#### Scenario: Manifest names
- **WHEN** the names test reads every `packages/*/package.json`
- **THEN** each name equals `@meltemi/diagrams-` followed by the folder name, and each `exports["."]` has the `@meltemi/diagrams-source` condition

#### Scenario: No leftovers
- **WHEN** the names test scans the repository text files outside `node_modules`, `dist`, `openspec/changes/archive` and `docs/decisions`
- **THEN** no file contains `@dac/`, `pnpm studio` or a `studio validate`, `studio export` or `studio import` invocation, and the test names the offending file when one does
