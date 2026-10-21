# 0002. Package, command and file names

Status: accepted (cli-and-package-names change, 10 October 2026)

## Context

Code needs package names, a command name and a file extension from the first day, and every later
change adds packages, commands and documentation that repeat them. The product name is Meltemi
Diagrams (decision 0009) and it belongs to the Meltemi family.

## Decision

- npm packages are `@meltemi/diagrams-<folder>` for each folder under `packages/`
  (`@meltemi/diagrams-language`, `@meltemi/diagrams-model`, and so on). The family scope leaves room
  for other Meltemi products.
- The export condition that resolves workspace packages to their TypeScript sources is
  `@meltemi/diagrams-source`.
- The command is `meltemi-diagrams`, installed together with the alias `mdg`. Messages always use
  the full name. Inside the repository the CLI runs from sources as `pnpm mdg`.
- Diagram files use the `.meltemi` extension (the proposal said `.arch`).

| Name                       | Where it appears                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| `@meltemi/diagrams-*`      | `packages/*/package.json`, imports, `vitest.config.ts`                                     |
| `@meltemi/diagrams-source` | package exports, `tsconfig.base.json`, root scripts                                        |
| `meltemi-diagrams`, `mdg`  | `packages/cli/package.json` `bin`, `CLI_NAME` and `CLI_ALIAS` in `packages/cli/src/cli.ts` |
| `.meltemi`                 | `MELTEMI_EXTENSION` in `packages/cli/src/cli.ts`, corpus files, docs                       |

A test (`packages/cli/test/names.test.ts`) checks the manifest names and source conditions, and fails
when a former name appears outside archived changes and decision records.

## Alternatives considered

- `@meltemi-diagrams/*`: a product-only scope; the family scope was preferred.
- A bare `meltemi` command: shorter, but it could collide with a command of the Meltemi IDE.
- No scope: risks collisions on npm once packages are published.

## Consequences

- Package folders keep short names (`packages/language`), so paths stay readable.
- Publishing needs the `@meltemi` npm organisation, which the owner registers (roadmap change 24).
