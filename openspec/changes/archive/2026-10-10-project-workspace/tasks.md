## 1. Vertical slice: a diagram uses a theme from another file

- [x] 1.1 Parse `import` statements (both forms, aliases, recovery) into `ImportStatement` CST nodes, and add `import` to the top-level keywords. Test the three syntax scenarios and the CST order with a header and a block.
- [x] 1.2 Record `Document.imports` in `compile()` (path, bindings, kind, ranges), and make `checkThemeBases` skip names that start with an import binding. Test the imported-base scenario.
- [x] 1.3 Create `packages/project` (`@meltemi/diagrams-project`, vitest alias, tsconfig) with `ProjectHost`, POSIX path helpers, `findProjectRoot`, an in-memory host for tests and `createNodeHost` under the `./node` subpath. Test both root scenarios.
- [x] 1.4 Implement import path rules and resolution (`module.invalid-path`, `module.outside-project`, `module.not-found` with the real-case hint) and the bindings with `module.unknown-member`. Add the `themes` option to `layoutDiagram` and `themeDefinitionsFor(file)`. Verify with a test that a diagram with an imported member theme lays out with that theme.

## 2. Manifest

- [x] 2.1 Implement `parseJsonWithPositions` (objects, arrays, strings with escapes, numbers, literals, ranges per key and value, errors with offsets). Test valid documents, the trailing-comma error and position accuracy.
- [x] 2.2 Implement `readManifest`: fields, defaults, `project.invalid-json`, `project.missing-field`, `project.unknown-field`, `project.invalid-value`. Test the three manifest scenarios.
- [x] 2.3 Implement `satisfiesRange` (exact, caret, tilde, comparators, `*`), `project.tool-version` and `project.language-mismatch`. Test the range-forms, tool-too-old and language-mismatch scenarios.
- [x] 2.4 Implement `listSources` with `sources`, `exclude` and the always-excluded folders in stable order, and write `schemas/project.schema.json`. Test the excluded-drafts scenario and the schema-agrees-with-reader scenario.

## 3. Module semantics

- [x] 3.1 Implement binding checks: `ref.duplicate-id` against top-level ids, `module.reserved-name` from the built-in theme prefixes, `module.import-position`, `module.duplicate-import`, and `module.unused-import` (info), based on the references in the file. Test the clash, reserved, late-import and unused scenarios.
- [x] 3.2 Implement cycle detection, the chain message, and cutting the cycle edge. Test the two-file cycle, a three-file cycle, and termination.
- [x] 3.3 Implement the theme scope across files: keys, aliases, `extends` rewritten in each defining file, and cross-file `theme.unknown-base` (loops across files are reported as `module.cycle`). Test the namespace-qualified, local-extends-imported and cross-file-cycle scenarios.
- [x] 3.4 Implement `resolveReference(file, ref, kinds)`. Test the diagram-through-namespace and wrong-kind scenarios, and a member binding.

## 4. Workspace

- [x] 4.1 Implement `Workspace` with `compileFile`, `compileProject`, overlays, `invalidate`, dependent tracking and reuse of single-file compilations. Test the two project scenarios, the shared-theme edit (counting recompilations) and clearing an overlay.
- [x] 4.2 Add a robustness test: random edits of corpus project files never throw and always terminate.

## 5. CLI

- [x] 5.1 Use the Workspace in `validate`: folders as projects, files with imports, `project.json` lines, and the JSON output entry for the manifest. Test the cycle and manifest scenarios and keep the existing validate tests green.
- [x] 5.2 Use the Workspace in `export`, with the theme scope and `--theme` resolved in it, and with module errors in the exit code. Test the imported-theme scenario and keep the existing export tests green.
- [x] 5.3 Set every package and `CLI_VERSION` to `0.3.0`, and add a test that they agree.

## 6. Corpus

- [x] 6.1 Add `corpus/projects/valid/commerce` (manifest, `themes/company.meltemi` with `base` and `corporate`, two diagrams importing the theme in both forms, one story-less module) with SVG snapshots of the diagrams.
- [x] 6.2 Add one project per code under `corpus/projects/invalid/` (`module.*`, `project.*` and cross-file `theme.unknown-base`) with diagnostics snapshots. Add a test that every new code has a project.

## 7. Documentation

- [x] 7.1 Write `docs/language/projects.md` (manifest, root, sources, imports, namespaces, paths, cycles, theme scopes, workspace), and update `grammar-0.2.md` (import statement) and `diagnostics.md` (every new code).
- [x] 7.2 Write `docs/decisions/0010-module-system.md`, add a "Projects" section to the README, and add imports and projects to the skill's language reference. Run `pnpm skills:sync`.

## 8. Quality

- [x] 8.1 Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm mdg validate corpus/valid`, `pnpm mdg validate corpus/projects/valid/commerce`, and `openspec validate project-workspace --strict`. Then archive the change and mark it in the roadmap.
