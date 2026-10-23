## 1. Routes follow a reconnect (`packages/edit`)

- [x] 1.1 `src/types.ts`, `src/c4.ts`: `reconnectModelRelation` gains `port?` and rewrites the moved end of every `route <id>` of the file's views that draw the relation (end lifted per view with `liftTo`, named port and point dropped, compass port carried over, `via` and the other end kept, the dropped `port` written into the edited view's route after naming the relation when it has no id, a route whose ends meet removed), verified over the whole file; tests in `test/c4.test.ts`: a routed relation in a container view, a pinned named port dropped, a compass port carried, a lifted context view's route untouched, an unknown entity refused, the `placement.route-mismatch` fixture of today's bug compiling clean
- [x] 1.2 `src/c4.ts`: `rewriteRouteEnd { diagram, relation, end, element }` for the views of other files (the per-view rewrite of 1.1 as an operation of its own, used by `planSteps`), `src/types.ts`, `src/plan.ts`; tests: a route rewritten, a route of another relation untouched
- [x] 1.3 `src/messages/en.ts`, `es.ts`: `oneWay` for models names `->` alone; `c4.nameRelation` and its raise in `src/c4.ts` removed, the refusal of a local label on an anonymous relation keeping `edit.anonymous-relation` with a generic `relations.unnamed` reason (an API-level guard: the session names first)

## 2. The session reconnects without a stale route (`packages/editor`)

- [x] 2.1 `src/session.ts` `setEnd` on a C4 view: the dropped port goes into `reconnectModelRelation.port`, no `setRoute` after a reconnect; new fixtures in `test/c4.test.ts`: the commerce corpus with `route` statements in two views and a `layout manual` copy of the C4 template's views; tests: a second reconnect of a routed relation planned, a mid-box drop leaving no `placement.route-mismatch`, a port drop written into the route
- [x] 2.2 `src/projects.ts` `planSteps`: a `reconnectModelRelation` step extended to the `route` statements of other files' views with `rewriteRouteEnd` (through `relationReferences`), and every file whose views resolve the model compiled against the planned texts, the first new error refusing the plan; tests in `test/c4.test.ts` "a model in another file": a reconnect rewriting a route of the view's file, a third file's view that would break refusing the plan

## 3. Entities from the canvas

- [x] 3.1 `packages/editor/src/c4.ts`: `allowedKinds(level)` (context: person, system; container: container, datastore, person, system; component: component, person, system) and `entityParent(view, kind)`; `src/session.ts` `c4Action` `create`: `createEntity` (fresh `<kind><n>` free in the model, its file and the view's file; empty label) + `includeEntity` + `setPosition` in assisted and manual mode, `pendingSelection` and the label editor on the new element, steps when the model is in another file; `c4Refused.create` removed from `messages/en.ts` and `es.ts`; tests in `test/c4.test.ts`: a container inside the scope of a container view, a person on a context view, a person on a view with `include`, a kind the level does not draw refused with `edit.invalid-value`, the two-file project through `openIn`; `test/c4.test.ts:169-170` flipped
- [x] 3.2 `src/session.ts` `c4Action` `paste` and `duplicate`: copies declared with `createEntity` + `setEntityProperty` (technology, description, external), ids `<id>_2`…, `includeEntity`, offset `setPosition`, no relations; `c4Refused.paste` and `duplicate` removed; `move.parent` reworded (the model's text); tests: a pasted container with its technology, a duplicated person, `test/session.test.ts:666-710` updated
- [x] 3.3 `packages/canvas/src/app.ts`: the C4 palette's entity tools from `tools` of the render (one per allowed kind, click or drop, the same ghost as the box tool), **Connect to…** in the C4 context menu (`messages/en.ts:361`, `es.ts:412`); the palette's tools per level asserted on the session's render in `packages/editor/test/c4.test.ts` (the session decides them); a label typed on an entity the model left empty writes the model's label; `packages/vscode/test/webview/run.ts`: a scenario creating a container from the palette on the C4 text (declared in the model, drawn, labelled through the inline editor) and one reconnecting `uses` twice after Recompute layout on a `layout auto` view
- [x] 3.4 `packages/playground/test/model-steps.test.ts`: a container created on a view whose model is in `models/`, both files written in one undo step

## 4. Combinations named on demand

- [x] 4.1 `packages/editor/src/targets.ts` (`nameable`, `styleTargets`), `src/c4.ts`, `src/session.ts` (`setEnd` on the same entity, `setVia`, `moveLabel`, `setLocalLabel`): an anonymous combination named `as <from>_<to>` in the view's statement with `materializeRelationId` and a fresh id free in the model, its file and the view's file; `c4.nameCombination` removed from `messages/en.ts` and `es.ts`; tests in `test/c4.test.ts` and `test/effects.test.ts`: a width and a Flow effect on an anonymous combination of the `components` view, the `named` notice, a fresh id avoiding a model relation's id, `reconnectCombination` still refused; `test/messages.test.ts` parity

## 5. Documentation and decision

- [x] 5.1 `docs/editor.md` and `docs/es/editor.md`: the C4 views section (entities from the palette, paste and duplicate, routes rewritten on reconnect, combinations named) and the refusal tables (`create`, `paste`, `duplicate` and `nameCombination` gone, `move.parent` reworded); the "Combinations (C)" paragraph replaced by **Connect to…**; `docs/language/c4.md` "In the editor" note if it names the refusals; `pnpm docs` checks pass
- [x] 5.2 `CHANGELOG.md` 1.10.0: a "Canvas" entry for entities created on C4 views and a "Fixed" entry for routes after a reconnect
- [x] 5.3 `docs/decisions/0053-c4-entities-and-routes.md` (context, decision, alternatives, consequences), linked from `docs/decisions/0020-models-and-c4-views.md` and `0051-c4-relations-from-the-canvas.md`

## 6. Gates

- [ ] 6.1 `pnpm typecheck`, `pnpm lint`, `pnpm test`
- [ ] 6.2 `pnpm vscode:test-webview` (the two new scenarios included) and a look at the C4 screenshots it writes
