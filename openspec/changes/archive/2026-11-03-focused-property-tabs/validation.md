# Validation — 2026-11-03

- Shared inspector browser regressions pass for EN/ES labels, roving keys, ARIA relationships,
  typography separated from shape colour, real x/y/w/h/rotation fields in Layout, category
  retention after edits and selection, blur commits and read-only navigation.
- Theme font scenario verifies the active Text tab after a source render. Hosted browser
  scenarios also cover invalid draft retention and theme text-size edits.
- Inspected `properties-text-light.png` and `properties-text-dark-es.png` from the webview
  harness, including the 260 px inspector. Subtle canvas shadows and the curved rotation arrow
  are included in the final build.
- `pnpm typecheck`, `pnpm lint`, `pnpm build`: passed.
- `pnpm test --maxWorkers=2`: 9,881 passed, 1 skipped, 329 files.
- `pnpm vscode:test`: 22 passed; cached VS Code 1.141.0 with temporary fixture workspaces.
- `pnpm vscode:package`: 416 files; packaged contents verified.
- Documentation checks after EN/ES updates: 88 passed.
- Final shared browser results are recorded below.

The controls retain their established commit-on-Enter-or-blur behaviour. Tabs do not add an
extra save action. No changes to source format, public protocol, exports or dependencies.

## Final shared checks

- Final webview suite: **265/265 passed** (`pnpm vscode:test-webview`).
- Playground: **96/99 passed** on the first full run; the three failures were old test navigation
  and stale-render assertions. Corrected tests (plus the English counterpart) passed **4/4**;
  no application failures remained. EN/ES scenarios, typography/alignment and explorer errors
  are covered. The full log and corrected log are kept separately.
- Repository lint and build passed; updated browser test typechecks and formatting passed.
- Both OpenSpec changes validated with `--strict`.

Evidence is local under `C:/meltemi/artifacts/diagrams-visual-polish/` and each host's ignored
`.test-output/` directory. Remote pull-request CI remains a separate pre-merge check.

Final screenshot review also verified wrapped Spanish alignment descriptions without horizontal
panel overflow. The 11 affected browser scenarios passed after this small CSS adjustment;
VS Code typecheck includes all harness files and passed on the final test code.
