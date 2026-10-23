## Why

Four things the owner met on 2026-10-22 make the canvas feel unfinished, and each has one cause
in the code. The four effect toggles of the style strip sit in a group that has only an
accessible label, so they look loose beside "Route kind" and "Corners", and turning one on draws
nothing until the toolbar's Play effects is pressed, because `playing` starts false in the
session (`packages/editor/src/session.ts:148`) and only that button changes it. The rotation
handle takes the pointer's absolute bearing from the centre (`bearing` in
`packages/editor/src/canvas/turning.ts`), with no drag threshold, so the first pixel of jitter
after a press snaps an upright node to 60° (the handle itself sits at about 66° from the
centre) and a plain click writes `rotation 60`; meanwhile `.content g.turning` in
`packages/canvas/canvas.css` eases the drawing over 120 ms while the selection outline turns at
once, and in `layout auto` every live preview lets the engine move the node away from its
outline. In sequence diagrams the head row is `max(40, 34 + 6 + labelLine)` units tall whenever
an actor or another figure is present, box kinds draw only the bottom 40 units of it
(`packages/layout/src/sequence.ts:105-109`, `789-794`), and the layout reports the whole row as
the head's box and as the scene group's `bounds`, so the selection outline, the pulse halo, the
story highlights and the inline editor sit 20 units above the drawn box; the same diagrams look
washed out because heads, activation bars, notes and lifelines all take the theme's `line`
token, `#DCE5ED` on `#F7FBFF` (about 1.2:1). Last, the editor names anonymous relations, messages,
notes and fragments on demand, but several paths still lose the selection once the id changes
(label, layer, dotted line, moving a label, dragging an end or a bend) and two still refuse
instead of naming (`reasons.nameToStyle` for notes and fragments, `reasons.nameToMoveLabel`).
This change fixes the four. Post-1.0 change, outside the roadmap; it builds on `quick-styling`,
`motion-editing`, `rotation-and-corner-radius`, `canvas-setup-and-live-preview`,
`sequence-profile` and `c4-relations-and-effects`.

## What Changes

- **An Effects row.** The style strip shows the four toggles under a row header like the route
  kind's and the corners': "Effects" at the left and, at the right, "off" or the names of the
  effects that are on; the speeds follow as today.
- **Effects play by default.** A diagram with effects opens animated; the toolbar button becomes
  one Pause effects / Play effects toggle; the choice is remembered per diagram of the file in the
  canvas's persisted state, as hidden layers are, so a paused file stays paused after a reload;
  `prefers-reduced-motion: reduce` starts paused; a diagram without effects shows the static
  drawing and a disabled toggle.
- **A rotation that starts where it was grabbed.** The angle is the element's angle at the press
  plus the change of the pointer's bearing about the centre since the press, snapped to 15°
  (Alt free), and nothing turns until the pointer has moved past the drag threshold, so a press
  and release writes nothing. The drawing follows the pointer without easing, through the SVG
  `transform` attribute as moves do, re-applied after every live preview; the selection outline
  turns with the same angle about the same centre, so the two agree at every moment; the ease
  of `--mdg-motion-fast` plays on release only, as decision 0045 asked. In `layout auto` a
  rotation preview or drop materialises the arrangement first, as moves do, so the engine does
  not move the node.
- **Sequence heads measured as drawn.** The box of a box-kind head (participant, database,
  collections, queue) is the drawn box, and the layout reports `shapes` and `radii` for heads, so
  the selection outline, the handles, the pulse halo, the story highlights and the inline editor
  sit on the drawn shape whether or not an actor shares the diagram.
- **Sequence diagrams with contrast.** Heads, activation bars, notes, fragment frames and
  lifelines take the theme's `muted` token instead of `line`; messages keep `connector`. No
  palette changes; the snapshots, the acceptance pictures and the gallery are regenerated.
- **The selection follows every naming.** Every edit that names an anonymous relation, message,
  note or fragment first (label, layer, dotted line, label position, moving a label, dragging an
  end or a bend, the inline label) keeps the selection and the inspector on the new id. Styles on
  unnamed notes and fragments and the label position of an anonymous relation name the target
  first instead of refusing; `reasons.nameToStyle` and `reasons.nameToMoveLabel` disappear.
- **Documentation.** The editor guide (rotation, effects, sequence selection) in English and
  Spanish, `docs/language/sequence.md` (the drawing's tokens), the changelog's 1.10.0 section,
  decision 0052.

## Non-goals

- Naming a C4 combination on demand (`c4.nameCombination`), creating entities from a C4 view
  and rewriting routes when an end is reconnected belong to `c4-entities-and-routes`.
- Adding icons from the picker belongs to `custom-icons`.
- Visible particles and halos in exports, and defaults in place of the video refusals, belong
  to `export-defaults-and-visible-effects`.
- The delivery change owns the pipelines and the release of what this change ships.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `diagram-canvas`: "Rotating on the canvas" takes the angle relative to the grab after a drag
  threshold, draws without easing while dragging with outline and drawing always agreeing, and
  materialises `auto` arrangements before a rotation.
- `sequence-layout`: "Sequence drawing" reports the drawn box, shape and radius of each head and
  draws heads, bars, notes, frames and lifelines in `muted`.
- `quick-styling`: "Styling names anonymous relations" names notes and fragments for styles,
  names relations for label positions, keeps the selection after every naming and no longer
  refuses C4 relations; "Style strip with corners and rotation" gains the Effects row header
  with its state.
- `motion-editing`: "Preview on the canvas" plays by default with a remembered pause and
  reduced-motion rule.

## Impact

- `packages/canvas`: `src/inspector.ts` (the Effects row), `src/app.ts` (the Pause/Play toggle,
  `PersistedState.pausedEffects`, the rotation drag, the overlay's angle, the preview
  re-application), `canvas.css` (the drag transition removed, a release-only ease), messages
  `en`/`es`; unit tests under `test/`.
- `packages/editor`: `src/session.ts` (`playing` true by default, rotation as geometry in `auto`
  diagrams, `pendingSelection` after naming gestures), `src/canvas/turning.ts` (`turnedAngle`),
  `src/canvas/protocol.ts` (the rotation preview carries the element's box), `src/inspector.ts`
  and `src/effects.ts` and `src/targets.ts` (naming notes and fragments for styles, label
  positions, `select` on every naming path), messages `en`/`es`; `test/turning.test.ts`,
  `canvas.test.ts`, `canvas-setup.test.ts`, `effects.test.ts`, `strip.test.ts`,
  `sequence.test.ts`, `messages.test.ts`.
- `packages/layout`: `src/sequence.ts` (head bounds, `shapes`, `radii`, tokens);
  `test/sequence.test.ts`, `test/themes.test.ts`; snapshots under `corpus/valid/sequence`,
  `examples/purchase/exports`, `corpus/acceptance/sequence`, `corpus/acceptance/visual/sequence`,
  `gallery/sequence`.
- `packages/motion`: `test/motion.test.ts` (a sequence with an actor); no source change, the
  halo reads `bounds`.
- `packages/vscode/test/webview/run.ts`: rotation and sequence scenarios.
- `docs/editor.md`, `docs/es/editor.md`, `docs/language/sequence.md`, `docs/es/language/sequence.md`,
  `CHANGELOG.md`, `docs/decisions/0052-canvas-feel-and-naming.md`.
