# Tasks

## 1. Continuous manipulation

- [x] Reproduce delayed preview/drop geometry in the real webview and record the cause.
- [x] Fix the gesture-to-render handoff and cover delayed, cancelled and refused replies.

## 2. Visual affordances

- [x] Draw the arc-arrow rotation handle and verify existing rotation behavior.
- [x] Add subtle canvas-only component shadows and verify exclusions and exports.

## 3. Verification

- [x] Run focused canvas/browser regressions and inspect screenshots.
- [x] Complete repository typecheck and unit tests with the inspector change: typecheck passed;
      9,881 unit tests passed and one was skipped.
- [x] Complete VS Code integration and packaging with the inspector change: 22/22 integration
      checks passed; packaging and its contents check passed with 416 files.
- [x] Complete the final shared browser suites and repository lint, record their results, then
      archive after every required gate passes.

Evidence and the precise scope of the reproduced defect are recorded in [validation.md](validation.md).
