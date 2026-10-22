## 1. Model operations (`packages/edit`)

- [ ] 1.1 `src/types.ts`, `src/plan.ts`, `src/c4.ts`: `reconnectModelRelation { model, relation, end, entity }` rewriting one end's token with the entity's path and verifying no new errors; reasons `en`/`es`; tests in `test/c4.test.ts`: a direct end, a lifted end moved to the drawn entity, an end onto its own ancestor refused, an unknown entity refused, an anonymous relation by its key
- [ ] 1.2 `src/c4.ts`: `removeModelRelation` with `cascade`; without it the dependents (statements naming the relation in the file, combinations standing for it alone, "drawn in `<view>`" for the other views of the file); tests: refused with the list, removed with cascade, a relation nothing names removed at once
- [ ] 1.3 `test/c4.test.ts`: `setModelRelationProperty { id }` on an anonymous relation by key and the `edit.id-conflict` refusal, with a plan that names and then styles in one batch

## 2. The view's relations, model in the same file (`packages/editor`)

- [ ] 2.1 `src/targets.ts`: `freshModelRelationId` (entity paths with `_`, free in the model, its file and the view's file) and `styleTargets` naming a C4 relation through `setModelRelationProperty { id }`; `src/inspector.ts`: the Style and Effects sections for every C4 relation; `c4.nameRelation` removed from `messages/en.ts` and `es.ts`; tests in `test/c4.test.ts` and `test/effects.test.ts`: Flow particles and a width on an anonymous relation of the `commerce` corpus and of `corpus/import/mermaid/c4-context.meltemi`, one plan each, the `named` notice
- [ ] 2.2 `src/session.ts` `c4Action`: `connect` → `createModelRelation` (`->`, the `connect.twoWay` wording `->` only), with `id` and `setRoute` when pinned, the new relation selected; tests in `test/session.test.ts`: a plain connection, a pinned one, two-way refused
- [ ] 2.3 `src/session.ts`: `setEnd` → `reconnectModelRelation` for a one-source relation dropped on another entity, naming first plus `setRoute` on the same entity; `setVia`, `moveLabel` and `setLocalLabel` naming first; a combination refusing `setEnd` with its sources; `c4Refused.setEnd` removed; tests: each path, the lifted end, the combination
- [ ] 2.4 `src/session.ts`: `remove` of a one-source drawn relation → `removeModelRelation` without cascade, the dependents answered as `edit.has-dependents` with `retry`, `removeRelation` kept for combinations; `session.modelRelation` removed; tests: refused with the dialog's list, cascaded in one plan, a combination removed from the view
- [ ] 2.5 `src/session.ts` `setLabel`: the model's label when the model relation has none, the local label (named first) otherwise, the combination's own; tests
- [ ] 2.6 `test/messages.test.ts` parity of `en`/`es` after the removed and changed keys; `docs/editor.md` table of refusals checked by the acceptance docs test still passes

## 3. The model in another file: steps over files

- [ ] 3.1 `src/canvas/protocol.ts` and `src/session.ts`: `SessionResult.project` as `{ kind: "files", steps }` or `createTheme`; `themeToken` emits one step; `test/themes.test.ts` updated
- [ ] 3.2 `src/projects.ts`: `planSteps(documentPath, steps)` grouping consecutive steps per file into a batch, threading temporary overlays and recompiling the project between files, extending `renameEntity` with `renameEntityInProject` and `removeModelRelation` with the new `removeModelRelationInProject` (statements naming the relation in every file whose views resolve the model, "drawn in" dependents across files), restoring overlays; tests in `test/c4.test.ts` with a two-file project (model in `models/`, view importing it): name then style, remove reaching another file, a refused second step planning nothing and leaving the texts
- [ ] 3.3 `src/session.ts`, `src/c4.ts`: every model-writing action of a view whose model is in another file becomes steps (`connect`, `setEnd`, `remove`, `setLabel`, styles and effects through `styleTargets`, `entity.*` and `relation.*` fields, `renameId`); `c4FieldOperations` loses the read-only branch and `c4.readOnly` becomes the file's name under the fields; `session.modelElsewhere` removed; the status notice naming the model's file; tests: a reconnect, a Flow effect and a technology on the imported model answered as steps with `pendingSelection` kept

## 4. The hosts apply the steps

- [ ] 4.1 `packages/playground/src/studio.ts` `applyProject`: `files` → `sessions.planSteps` → `applyEdits` over the map, the status line naming the files; unit test with a two-file project in the browser's store: one undo step restores both files
- [ ] 4.2 `packages/vscode/src/extension/canvas.ts` `applyProjectEdits`: `files` → `planSteps` → one `WorkspaceEdit`, the message naming the files written; `messages` `en`/`es`; unit test of the request to the edit mapping with a fake `ProjectSessions`

## 5. Sequence messages, notes and fragments

- [ ] 5.1 `packages/editor/src/effects.ts`, `src/targets.ts`, `src/inspector.ts`: effects on anonymous messages name them with `materializeRelationId`, notes and fragments with `renameEvent` and a fresh `<kind><n>` id; the Effects section shown for them; `reasons.nameForEffect` removed; tests in `test/sequence.test.ts` and `test/effects.test.ts` on `corpus/import/mermaid/sequence-payment.meltemi`: a trace on `Customer -> Web`, a pulse on an unnamed note, turning off names nothing

## 6. The canvas

- [ ] 6.1 `packages/canvas/src/app.ts`: on C4 views the arrow split button and the relation tool offer `->` only, Shift ignored, the end handles kept; `packages/canvas/test` unit test of the kinds offered per profile
- [ ] 6.2 `packages/vscode/test/webview/run.ts`: a scenario on the C4 text: select an anonymous relation, Effects visible, Flow particles on → `as` in the model and `animate` in the view; drag its end onto another entity → the model statement rewritten; Delete → the dialog with the other view, confirmed

## 7. Documentation and decision

- [ ] 7.1 `docs/editor.md` and `docs/es/editor.md`: the C4 views section (relations drawn, reconnected, deleted and labelled from the canvas; the model's file written from another file), the "Naming relations" note, the routes sentence and the refusal tables; `docs/language/motion.md` "In the editor" paragraph names messages, notes and fragments; `pnpm docs` checks pass
- [ ] 7.2 `CHANGELOG.md` 1.10.0: a "Canvas" entry for the C4 relations and one for effects on imported diagrams
- [ ] 7.3 `docs/decisions/0051-c4-relations-from-the-canvas.md` (context, decision, alternatives, consequences), linked from `docs/decisions/0020-models-and-c4-views.md`

## 8. Gates

- [ ] 8.1 `pnpm typecheck`, `pnpm lint`, `pnpm test`
- [ ] 8.2 `pnpm vscode:test-webview` (the new scenario included) and a look at the C4 screenshots it writes
