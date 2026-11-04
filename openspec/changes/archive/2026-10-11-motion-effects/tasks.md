## 1. Language and model

- [x] 1.1 Add `delay`, `direction`, `particles` and `color` to the animate property table, with ranges; extend `AnimationEntry` and the JSON model; refuse properties that do not apply to the block's effect.
- [x] 1.2 Diagnostics `animate.missing-effect`, `animate.invalid-target` and `animate.conflict` (per target and channel, across statements) in flow, free, sequence and C4 analyzers; remove the duplicate-property check across animate statements. Corpus invalid files and model tests.

## 2. Scene and motion

- [x] 2.1 Scene: `track` on relation groups and `bounds` on element and event groups (flow, free, C4, sequence emitters); `className` on items and `styleSheet` on the scene; the SVG renderer writes them. Static output unchanged (existing snapshots).
- [x] 2.2 Create `packages/motion` (`@meltemi/diagrams-motion`): `planMotion`, `motionDuration`, `sceneAt` (flow particles, dash, pulse halos) with tests for every scenario.
- [x] 2.3 `animatedScene`: CSS keyframes, shifted particle keyframes, overlays with opacity 0, reduced motion; tests comparing CSS states with `sceneAt`.

## 3. Export

- [x] 3.1 CLI `export --motion static|animated` and `--at <time>`, usage errors, help text; tests.

## 4. Editing

- [x] 4.1 Edit operations `setAnimation` and `removeAnimation` with fixtures and tests.
- [x] 4.2 Inspector Effects section and field operations; editor tests.
- [x] 4.3 Canvas Play effects: session render option, protocol, toolbar button in the webview; webview test.
- [x] 4.4 Completion and hover for every property by effect; tests.

## 5. Docs and corpus

- [x] 5.1 `docs/language/motion.md`, grammar, diagnostics, SVG export, model JSON, editor guide, README, skill reference, decision 0022; corpus valid motion sheets with snapshots; `pnpm skills:sync`.

## 6. Verification

- [x] 6.1 `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm vscode:test-webview`, `pnpm vscode:test`, `pnpm vscode:package`, `pnpm licenses:inventory --check`; review animated exports in a browser.
