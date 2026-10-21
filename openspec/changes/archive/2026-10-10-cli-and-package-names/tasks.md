## 1. Packages

- [x] 1.1 Rename every package to `@meltemi/diagrams-<folder>`, the source condition to `@meltemi/diagrams-source`, and every import, dependency, `PACKAGE_NAME` constant, `tsconfig.base.json` condition, vitest alias and root script. Run `pnpm install`. Verify: `pnpm typecheck` and `pnpm test` pass.

## 2. CLI

- [x] 2.1 Declare the `meltemi-diagrams` and `mdg` binaries. Set `CLI_NAME` to `meltemi-diagrams`, add `Alias: mdg` to the help text, rename the root script `studio` to `mdg`, and update the CLI tests. Verify: `pnpm mdg --help` shows the new usage and `pnpm mdg validate corpus/valid` passes.

## 3. Names guard and documentation

- [ ] 3.1 Add the names test: manifest names and source conditions, and no `@dac/` or `studio` command leftovers outside archived changes and decision records.
- [x] 3.2 Update the README, `AGENTS.md`, `CONTRIBUTING.md`, `corpus/README.md`, `docs/language/*`, the example README, the skill (then run `pnpm skills:sync`), the CI workflow, the OpenSpec project context, and the `vscode-extension` and `import-mermaid-plantuml` change artifacts.
- [x] 3.3 Rewrite decision 0002 as the record of the final command and package names, and update decision 0009 accordingly.

## 4. Quality

- [x] 4.1 Run `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm mdg validate corpus/valid`, and `openspec validate cli-and-package-names --strict`.
