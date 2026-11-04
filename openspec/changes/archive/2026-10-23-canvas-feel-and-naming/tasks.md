## 1. Effects row and play by default

- [x] 1.1 `packages/canvas/src/inspector.ts`: the effect toggles under a row header (label `inspector.effects` at the left, "off", the names of the effects that are on, or the mixed word at the right), the same row element as `glyphField`; words `inspector.effectsOff` in `messages/en.ts` and `es.ts`; canvas unit test of the row's text for off, one on, two on and mixed
- [x] 1.2 `packages/editor/src/session.ts`: `playing` starts true; `test/effects.test.ts`: a diagram with effects renders the animated style sheet on `ready`, a diagram without effects renders static, `playEffects { on: false }` renders static
- [x] 1.3 `packages/canvas/src/app.ts`: `PersistedState.effectsPlaying` keyed by diagram (the choice either way); a render whose playing state disagrees with it is not shown and `playEffects` asks for the other; the toolbar toggle (pause glyph and `toolbar.pauseEffects` while playing, play glyph and `toolbar.playEffects` while paused, disabled without effects) writes the record and posts; `matchMedia("(prefers-reduced-motion: reduce)")` as the default for a diagram without a record; words `en`/`es`; the status notice when an effect is turned on while paused
- [x] 1.4 `packages/vscode/test/webview/run.ts`: a file with effects opens animated and shows Pause; pause, reload, static and Play; a file without effects has the toggle disabled; reduced motion starts paused

## 2. The rotation gesture

- [x] 2.1 `packages/editor/src/canvas/turning.ts`: `turnedAngle(from, centre, grab, pointer, step?)`; `test/turning.test.ts`: a quarter turn from a grab at the handle's bearing, snapping, Alt free, wrap past 359
- [x] 2.2 `packages/canvas/src/app.ts`: the rotate drag stores `grab`, waits for `DRAG_THRESHOLD`, computes the angle with `turnedAngle`; `pointerUp` writes nothing without movement; the overlay outline and the badge take `drag.angle` about `drag.centre`
- [x] 2.3 `packages/canvas/src/app.ts` and `canvas.css`: `turnDrawing` writes the SVG `transform` attribute `rotate(a cx cy)` in scene coordinates; `.content g.turning` loses its transition; `turned-release` eases over `--mdg-motion-fast` on the drop only; `applyPreview` re-applies the attribute after every answered drawing with `previewWaiting.angle` / `previewShown.angle`; a refused preview keeps the attribute
- [x] 2.4 `packages/editor/src/session.ts` and `src/canvas/protocol.ts`: a `setField style.rotation` action or preview on an `auto` diagram materialises the arrangement first in the same batch; the preview's answer carries the turned element's box; `test/canvas-setup.test.ts` (its `preview` helper accepts the rotation field) and `test/canvas.test.ts:704-735`: a rotation preview in `layout auto` keeps the node's centre, the drop writes the arrangement and the rotation in one plan
- [x] 2.5 `packages/vscode/test/webview/run.ts` rotation scenarios (3928-4120): a press with 2 px of jitter writes nothing; the outline's `rotate(...)` and the group's `transform` agree at mid-drag and after a preview answers; rotating in a `layout auto` fixture keeps the centre; refused previews (`h.refusePreviews`) keep the drawing turned; the existing Alt scenario rewritten as a relative turn

## 3. Sequence heads measured as drawn

- [x] 3.1 `packages/layout/src/sequence.ts`: `bounds` and `boxes` of box-kind heads are the drawn box (collections with their stack offset), `shapes` and `radii` for heads; `test/sequence.test.ts`: an actor beside a participant gives the participant a 40-unit box 20 units below the row's top equal to the drawn rectangle, `shapes`/`radii` reported, a database `cylinder`; `packages/motion/test/motion.test.ts:368` extended with an actor in the diagram so the halo sits on the drawn box
- [x] 3.2 `packages/editor/src/session.ts:423`: heads take the layout's shape and radius; `test/sequence.test.ts` and `test/text-places.test.ts:116`: `ElementInfo` of a participant beside an actor, and the inline editor's area on the drawn box
- [x] 3.3 `packages/vscode/test/webview/run.ts`: the selection frame of `api` of the `SEQUENCE` fixture (rectangular, as every element's) has each edge within 1 px of its drawn rectangle; the pulse halo centred on it

## 4. Sequence contrast

- [x] 4.1 `packages/layout/src/sequence.ts`: heads, activation bars, notes, fragment frames and lifelines stroked `theme.muted`, a participant's written `stroke` still winning; `test/sequence.test.ts` and `test/themes.test.ts`: the tokens of the drawing under `technical.light` and `technical.dark`
- [x] 4.2 Look at `corpus/acceptance/visual/sequence` and `gallery/sequence/passkey-sign-in.png` after the change, then regenerate: `packages/render/test/corpus.test.ts` (`corpus/valid/sequence/*.svg`), `packages/render/test/examples.test.ts` (`examples/purchase/exports/payment.svg`), `packages/acceptance/test/corpus.test.ts`, `pnpm acceptance:visual --update`, `pnpm gallery`
- [x] 4.3 `docs/language/sequence.md` and `docs/es/language/sequence.md`: the drawing's tokens; `docs/language/svg-export.md` and its Spanish copy where they name the sequence tokens

## 5. The selection follows every naming

- [x] 5.1 `packages/editor/src/inspector.ts`: the label, layer and dotted-line cases return `select` through `selectionAfter` as the style case does; styles on unnamed notes and fragments name them with `renameEvent` and `freshEventId` first; the label position names the relation first; `reasons.nameToStyle` and `reasons.nameToMoveLabel` removed from `messages/en.ts` and `es.ts`; `test/effects.test.ts:200-275` and `test/strip.test.ts`: `inspector().target.ids` after each naming path, a fill on an unnamed note, a label position on `api -> db`; `test/messages.test.ts` parity
- [x] 5.2 `packages/editor/src/session.ts:1310-1365`, `1538-1545`: `moveLabel`, `setVia`, `setEnd` and the inline label set `pendingSelection` to the new id (and the C4 pinned end and local label); `test/effects.test.ts`: each gesture on `corpus/import/mermaid/flowchart-checkout.meltemi` keeps the selection on the named relation
- [x] 5.3 `packages/vscode/test/webview/run.ts`: on an imported flow fixture, a dotted line and a moved label keep the relation selected and the inspector on the new id

## 6. Documentation and decision

- [x] 6.1 `docs/editor.md` and `docs/es/editor.md`: the Effects row and the Pause/Play toggle, rotation (threshold, relative angle, ease on release, `auto` layouts), sequence selection on the drawn box, the naming note without the two refusals; `pnpm docs` checks pass
- [x] 6.2 `CHANGELOG.md` 1.10.0: entries for the Effects row and autoplay, the rotation gesture, the sequence heads and contrast, and the selection after naming
- [x] 6.3 `docs/decisions/0052-canvas-feel-and-naming.md` (context, decision, alternatives, consequences), linked from `docs/decisions/0045-rotation-and-corner-radius.md` and `0019-sequence-profile.md`

## 7. Gates

- [x] 7.1 `pnpm typecheck`, `pnpm lint`, `pnpm test`
- [x] 7.2 `pnpm vscode:test-webview` (the new scenarios included) and a look at the rotation and sequence screenshots it writes
