## 1. Language and model

- [x] 1.1 `trace` in `ANIMATION_EFFECTS`, `AnimationEffect`, `ANIMATION_EFFECT_PROPERTIES` (direction, color), `ANIMATION_DEFAULT_DURATIONS` (1500), `THEME_DURATION_TOKENS` (`traceDuration`) and `Theme.traceDuration`; the missing-effect message lists four effects
- [x] 1.2 Targets: relations only (`animationTargetFits`, the edit operations' `requireTarget`, the editor's `effectsFor`); `animate.invalid-target` names what a trace accepts
- [x] 1.3 Corpus: `corpus/valid/motion/trace.meltemi` with its model JSON and SVG snapshots; conformance passes

## 2. Motion

- [x] 2.1 `planMotion`: trace defaults to the theme's accent (else `#1f6feb`) and 1500 ms; `effectsEnd` knows the default
- [x] 2.2 `sceneAt`: the trace overlay in the relation's group before its label (dash `L L`, offset `L × (1 − g)`, dot at g, fade after 0.8), reversed track for `direction reverse`
- [x] 2.3 `animatedScene`: per-effect keyframes for the line and the dot (`offset-path` inside `@supports`), overlays at opacity 0 outside keyframes; unit tests that frames and CSS give the same states

## 3. Editor, canvas and player

- [x] 3.1 Inspector and strip: the Trace toggle, its speed with the theme default greyed, the theme panel's Motion group (`traceDuration`), shared effect fields for a selection
- [x] 3.2 Canvas: the effect toggle pattern includes trace; player `effectsSummary` describes a trace
- [x] 3.3 Language services: completion of `trace`, hover docs of the effect and of `traceDuration`

## 4. Documentation and checks

- [x] 4.1 `docs/language/motion.md`, `styles.md`, `svg-export.md`, `diagnostics.md`, `docs/editor.md`, `packages/motion/README.md`; skill references and `pnpm skills:sync` (assist guide); grammar highlighting of `traceDuration`
- [x] 4.2 Unit tests (model, motion, editor, edit, player), the webview and player browser suites; typecheck, lint, conformance
