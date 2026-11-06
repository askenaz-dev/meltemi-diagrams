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

## CI installation follow-up

PR CI `42290912449` at `3a49627e9845e2fa162d748b9dfc68ea89305fbb` passed all six non-Browser
jobs. Browser attempt 1 never reached a test: APT was downloading from
`azure.archive.ubuntu.com` for more than twenty minutes. It was a new installation of FFmpeg
and 98 other packages, with zero upgrades and 94.1 MB of archives. One 13.6 MB download was
followed by the next package only about six minutes later. The coordinator cancelled that
infrastructure run and retried only Browser; the second runner showed the same installation
delay. This is not a test timeout or product failure. The original log and both attempt
snapshots are retained in `artifacts/docs-user-audit-production/diagrams-svg-followup/`.

The follow-up replaces only the mirror hostname in the three known, existing Ubuntu source
locations, preserves suites/components/signing declarations, and sets APT retries to 2 with
30-second HTTP/HTTPS inactivity waits. Only the installation step gains a 10-minute timeout;
FFmpeg remains mandatory and APT errors propagate. Test commands and their deadlines are
semantically identical to the previously validated workflow.

Applicable local verification:

- The workflow parses as YAML with no errors; its entire parsed structure outside the single
  FFmpeg installation step is identical to the previous commit.
- Git Bash accepts the extracted installation script with `bash -n`.
- Temporary fixtures exercise legacy `sources.list`, deb822 `ubuntu.sources` and mirror-list
  formats together, plus missing optional files. Only the Azure hostname changes; protocols,
  suites, components, signing declarations and an unrelated vendor file stay byte-exact.
- Stubbed APT records the real shell arguments without invoking network/package operations.
  Update failure exits 42 and prevents install; install failure also exits 42. Successful and
  missing-file cases execute both required APT operations with the bounded options.
- Workflow formatting and `git diff --check` pass. The applicable workflow/authorization checks
  pass 51/51 across two files, recorded in `ci-followup-focused.log`; fresh full seven-job CI is
  required on the new head.

The fixture harness and machine-readable result are external evidence under
`C:/meltemi/artifacts/docs-user-audit-production/diagrams-svg-followup/verify-ci-install.cjs`
and `ci-fixtures/verification.json`. It uses the already installed YAML parser for validation,
with no project dependency or lockfile change. Earlier full runtime/type/lint results remain
applicable to unchanged product sources; they are not claimed as fresh runs of this CI-only commit.

The observed mirror issue is also documented upstream in
[runner-images issue 14594](https://github.com/actions/runner-images/issues/14594) and
[issue 12949](https://github.com/actions/runner-images/issues/12949). The workflow retains failing
prerequisite semantics rather than adopting examples that allow installation failure.
