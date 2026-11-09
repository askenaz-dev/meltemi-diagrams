# Tasks

## 1. Proposal

- [x] Inspect sequence/parallel semantics and define insertion-style scope and safety constraints.
- [x] Validate the proposal strictly before implementation.

## 2. Shared implementation

- [x] Implement the lossless reorder operation and source/inverse regressions.
- [x] Wire the operation through the runtime-validated canvas protocol and session.
- [x] Implement body insertion drag, parallel-group representation, keyboard/buttons and cancellation.
- [x] Preserve moved-action selection through acknowledgement and rejection.

## 3. Verification and guidance

- [x] Add real browser regressions for pointer/resize/parallel/keyboard/cancel/stale/read-only cases.
- [x] Document insertion semantics and controls in English/Spanish and synchronized agent guidance.
- [x] Run typecheck, lint, all unit tests, shared webview, VS Code, VSIX and playground browser checks.
- [x] Review results, synchronize and archive the completed specification with evidence.

Evidence: [local verification report](../../../../docs/quality/2026-11-09-story-clip-reordering.md).
