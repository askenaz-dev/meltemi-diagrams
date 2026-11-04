## 1. Formatter core

- [x] 1.1 Implement the pre-pass (matching pairs, one-line blocks, multi-line groups, top-level item boundaries) and the token emitter with the spacing, block, list, blank-line and line-ending rules, in `packages/language/src/format.ts`. Test the messy-flow, shorthand-versus-list, chained-clauses, multi-line-list and top-level-spacing scenarios.
- [x] 1.2 Emit comments: trailing comments, own-line comments, block comments, comments in multi-line lists, at file start and end, and the BOM. Test both comment scenarios and the BOM-and-CRLF scenario.
- [x] 1.3 Refuse files with parse errors and invalid options (`format.invalid-option`). Implement `FormatOptions.indent`, including tabs. Test the syntax-error, tabs and invalid-option scenarios.
- [x] 1.4 Implement `diffLines` (Myers on lines) and the line-range edits in `packages/language/src/diff.ts`. Test the edits-touch-only-changed-lines scenario, random line edits (applying the edits gives the target), and identical texts (no edits).

## 2. Corpus guarantees

- [x] 2.1 Add the corpus property test (`corpus/valid`, `corpus/parse-only`, `corpus/edits`, `examples`, skill examples): `ok`, token sequence, comment sequence, idempotence, and model JSON without ranges.
- [x] 2.2 Format the repository's own `.meltemi` sources that are not byte-exact fixtures (examples, skill examples, valid projects) and regenerate any snapshot that depends on source offsets. Keep `corpus/` byte-exact files untouched.

## 3. Project setting and CLI

- [x] 3.1 Add `format` to the manifest reader, `MANIFEST_FIELDS`, the schema and `formatOptionsFor`. Test the three format-settings scenarios.
- [x] 3.2 Implement `meltemi-diagrams format` with `--check` and `--stdout`, project options, refused files and exit codes, and update the help. Test every CLI scenario.

## 4. Documentation

- [x] 4.1 Write `docs/language/formatting.md`, add `format.syntax-errors` and `format.invalid-option` to `diagnostics.md`, and mention `format` in the README scripts and the skill (the review step runs `pnpm mdg format`). Run `pnpm skills:sync`.
- [x] 4.2 Write `docs/decisions/0011-formatter.md`.

## 5. Quality

- [x] 5.1 Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm mdg validate corpus/valid` and `pnpm mdg format --check examples`, and add the format check to the CI workflow. Validate with `openspec validate source-formatter --strict`, archive, fill the purposes of the new specs, and mark the roadmap.
