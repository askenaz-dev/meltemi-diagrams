# Validation

The change affects documentation only; it does not implement or alter exports.

## Implementation evidence

- Base: `243f2f825f3532f6ec5df4be27798fa02d3500bd` (current `origin/main` when the worktree was created).
- `packages/editor/src/exports.ts:37` accepts SVG, PNG, PDF, HTML, MP4, WebM and GIF.
- `packages/cli/src/export-command.ts:341` defaults a plain file export to SVG and validates that
  format list. The later renderable-diagram selection does not limit it to flow/free.
- `packages/cli/test/export.test.ts` exports sequence and Gantt; `packages/cli/test/c4.test.ts`
  exports all three C4 levels. Flow/free coverage remains in the existing export tests.
- An independent read-only source review confirmed the formats, profiles and existing example.

Only the introduction and options of the English and Spanish SVG guide changed. They enumerate
the five profile identifiers and distinguish the SVG default from explicit `--format svg`.
The general export-guide link carries other format requirements. Every fenced example and all
reference text starting at “What renders” / “Qué se dibuja” remain identical to the base.

## Checks

- `pnpm install --offline --frozen-lockfile`: 354 cached packages reused, zero downloads, no lockfile
  or dependency changes. Fresh-checkout CLI-bin warnings refer to unbuilt generated output.
- `pnpm exec vitest run packages/model/test/docs.test.ts packages/acceptance/test/docs.test.ts packages/cli/test/export.test.ts packages/cli/test/c4.test.ts`:
  4 files and 123 tests passed.
- After the final reader-facing link-label/reflow adjustment, the two documentation targets were
  repeated: 92 tests passed.
- `pnpm typecheck`: passed across the workspace.
- `pnpm lint`: passed (ESLint and repository-wide Prettier).
- `pnpm test --maxWorkers=2`: 385 files passed; 11,337 tests passed and 1 skipped, in 293.59 seconds.
- `openspec validate svg-guide-accuracy --strict`: valid before archive.
- `git diff --check`: passed.

The existing invalid-video fixture emits an FFmpeg “Invalid frame marker” diagnostic; its tests
passed. No browser, capture, export implementation, CLI interface, dependency or credential changed.
The correction needs no new visual reference or package installation smoke test.

Evidence is retained under `C:/meltemi/artifacts/docs-user-audit-production/` as
`diagrams-svg-guide-scope.json`, `diagrams-svg-typecheck.log`, `diagrams-svg-lint.log` and
`diagrams-svg-tests.log`. Publication and full remote CI are separate from this local verification.
