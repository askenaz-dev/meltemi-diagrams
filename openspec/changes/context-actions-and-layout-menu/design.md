# Design

## Context

See proposal.md for the motivation. The pieces this change builds on already exist:

- The canvas (`packages/canvas`, `app.ts`) has one context menu per profile: `openMenu` (flow
  and free), `openSequenceMenu`, `openViewMenu` (C4), `openGanttMenu` and `openReadOnlyMenu`,
  all built from `MenuItem[]` and shown by `Menu` (`panels.ts`), whose items may be radio items
  (`checked`). The toolbar badge `modeBadge` is a `<span>` whose text is `layout <mode>` for flow,
  free and C4 views, and a plain word for stories, scenario previews, sequence and gantt.
- The editor (`packages/editor`) sends the canvas an inspector model per selection. Effects are
  `effect.<e>` enum fields (`off`/`on`, `mixed` for a mixed selection) built by
  `effects.ts: effectFields` for the effects `effectsFor` allows; `setField` on them goes through
  `effectOperations`, which names anonymous targets and splits shared statements
  (`motion-editing`). The diagram's `layout`, `direction`, `routing`, `theme` and `autonumber`
  are diagram-level fields mapped to `setDiagramProperty`.
- Refusals that want a confirmation already have a protocol: the session answers
  `rejected { code: "edit.has-dependents", reason, dependents, retry }`, the canvas opens
  `Dialog.confirm` and sends `retry` on confirmation (`session.ts`, `app.ts`, `panels.ts`).
- `packages/edit` has `reconnectRelation` (rewrites one end of a relation and its route end),
  `setLinePoints`, `toggleActivation`, `setLabelAnchor`, `arrange` (which, with scope `all`,
  already strips `via` lists and compass points) and `setDiagramProperty`.
- The canvas session handles `arrange { scope }` by computing the positions itself
  (`arrangeAttempt`), so the canvas never needs geometry to ask for an arrangement.

Constraints from the owner (7 November 2026): additive only, nothing moves out of the inspector
or the toolbar; one-click actions, no typed input in the new controls; no floating selection
bar; Recompute and the layout modes keep their current behaviour; reversing relations of C4
views is out; the confirmation must read well in English and Spanish.

## Goals / Non-Goals

**Goals:**

- Effects, reversal and numbering reachable with one click from the context menu, writing
  exactly what the inspector or the text would.
- A layout badge that is also the one place that shows the mode and lets you change it or
  arrange, without a new toolbar control.
- A switch to `auto` that never silently throws away hand-made positions.
- One code path per action, shared by the VS Code webview and the web playground.

**Non-Goals:**

- No change to the language, the layout engine, the exports or the player.
- No submenus in `Menu`; no hover toolbars, chips or rails on the canvas.
- No new keyboard shortcuts (the context menu is reachable with Shift+F10 already).
- No reversal of C4 model relations, no numbering control for anything but sequence diagrams.

## Decisions

### D1. Effect items are derived from the inspector model, not from effect rules in the canvas

The canvas builds the effect items from the `effect.<e>` fields of the current inspector model:
a field present means the selection takes that effect, `value === "on"` means checked, `mixed`
means unchecked. Choosing an item posts the same `setField { ids, field: "effect.<e>", value }`
the inspector's toggle posts (`"on"` when any selected target lacks it, `null` when all have it),
so naming, splitting and refusals are the editor's, unchanged. The items are inserted by one
helper, `effectMenuItems()`, used by the flow/free, sequence, C4 and gantt menus right after the
selection's own items and before the clipboard group, each labelled with the field's label.

- Alternative: a new protocol message listing effects. Rejected: duplicates the inspector model.
- Alternative: the canvas knows `effectsFor`. Rejected: the rules live in the editor and depend
  on styles (outlined notes), which the canvas does not see.

### D2. `Menu` gains checkbox items

`MenuItem` gets `check?: "radio" | "checkbox"`. An item with `checked` and no `check` is a radio
item as today (`menuitemradio`), so the route-kind items are untouched; the effect items and
**Number messages** use `check: "checkbox"` (`menuitemcheckbox`, `aria-checked`). The first
focused entry stays the checked radio item or the first item.

- Alternative: a submenu "Animate ▸". Rejected: `Menu` has no submenus and the owner wants flat,
  one-click items.

### D3. `reverseRelation` is one operation across three statement kinds

`packages/edit` adds `reverseRelation { diagram, relation }` (`types.ts`, dispatched in
`plan.ts`):

- Flow relation (`relations.ts`): swap the two refs of the statement; if a `route` exists, swap
  its two endpoint texts whole (element, port, side and position travel with their element) and
  reverse the `via` list; a `label <id> at p%` becomes `at (100 − p)%`, offset kept.
- Sequence message (`sequence.ts`): swap the refs; a `return` or a self message is refused with
  `edit.unsafe-target`; when the message has a written activation of its receiver (the pair
  `activate <to>` … `deactivate <to>` the layout reports as `activation: "written"`), both
  statements are rewritten to the new receiver; a call block stays attached to the statement.
- Free line (`lines.ts`): reverse the point list in place with `setLinePoints`' writer.

The operation takes an id or a key, as `reconnectRelation` does, so anonymous relations need no
name. Styles, `animate` statements and tags reference the id or key and are untouched.

- Alternative: compose `reconnectRelation` twice. Rejected: it cannot swap both ends in one pass
  without an intermediate invalid state, and it drops named ports when the element changes.

### D4. Numbering is a canvas command mapped to `setDiagramProperty`

A canvas command `toggleAutonumber` posts `setDiagramProperty`-backed action
`setAutonumber { on }`; the session writes the value-less `autonumber` when turning on and removes
the statement when turning off, whatever its start. The sequence context menu lists **Number
messages** (`check: "checkbox"`, checked when the render's diagram has `autonumber`, disabled in
a scenario preview). VS Code exposes it as the command `meltemi.numberMessages` beside
`meltemi.arrangeUnplaced`, enabled when the active canvas shows a sequence diagram; the
playground's command list gets the same entry.

- Alternative: reuse `setField` on `autonumber` with `1`. Rejected: it would write `autonumber 1`
  where the language's canonical form is bare `autonumber`.

### D5. The badge becomes a menu button on profiles with a layout mode

`modeBadge` is rendered as a `<button class="badge">` when the canvas edits a flow, free or C4
view, and stays a `<span>` otherwise (stories, previews, sequence, gantt, read-only). Pressing it
opens `Menu` under it with **Automatic**, **Assisted**, **Manual** (radio items, the written or
implied mode checked) and, after a separator, the Arrange button's two items. The mode items
post a new canvas action `setLayoutMode { mode, confirmed? }`. The Arrange button keeps its menu.

- Alternative: chips in the toolbar (Mermaid's layout bar). Rejected by the owner: noise; the
  badge already occupies the right spot.

### D6. The mode switch is decided in the editor, with the confirmation as a refusal

`session.ts` handles `setLayoutMode` and routes the inspector's `setField` on the diagram's
`layout` field through the same function:

- `assisted`: `setDiagramProperty { property: "layout", value: "assisted" }`.
- `manual`: `arrangeAttempt(scope: "unplaced")` when boxes are unplaced, then
  `setDiagramProperty layout manual`, one batch.
- `auto`: a probe `planEdit(clearPlacement)`; when it has edits and `confirmed` is not set, the
  answer is `rejected { code: "edit.loses-placement", reason, retry: { ...action, confirmed: true } }`
  with the reason naming the counts; otherwise one batch of `setDiagramProperty layout auto` and
  `clearPlacement`.

`clearPlacement { diagram }` is a new operation in `packages/edit` (`structure.ts` or a new
`placement.ts`) that removes what `auto` ignores (spec `layout-actions`), reusing the `via`
stripping of `arrange` with scope `all`. An empty `placement` block is removed as other edits do.

The canvas handles `edit.loses-placement` next to `edit.has-dependents`: it opens
`Dialog.confirmArrange(reason, () => this.act(retry))`, a sibling of `confirm` with its own words
(`dialogs.arrangeTitle`, `dialogs.arrangeBody`, `dialogs.arrange`, `dialogs.cancel`) and no list,
and does not show the refusal under the inspector field. Wording:

- EN: **Back to automatic layout** / "The engine will place everything again, and the N
  positions and M routes you moved by hand will be lost. You can undo it afterwards." /
  **Cancel**, **Arrange**.
- ES: **Volver al orden automático** / "El motor va a colocar todo de nuevo y se perderán las
  N posiciones y M recorridos que moviste a mano. Puedes deshacerlo después." / **Cancelar**,
  **Reordenar**. Singular forms through the existing `plural` helper.

- Alternative: confirm in the canvas before sending, by counting `place` statements itself.
  Rejected: the canvas does not know bands, group children or routes; the editor does, and the
  refusal protocol already exists.
- Alternative: keep the `place` statements and let `layout.placement-ignored` show. Rejected by
  the owner: the file should match the picture.

### D7. Reverse direction is a canvas command limited to one target

`reverseDirection` is a `CanvasCommand` offered as **Reverse direction** in `openMenu` for one
selected relation or free line (not a pen, not a group) and in `openSequenceMenu` for one
selected message whose render is not a `return` and whose ends differ; it posts
`reverseRelation` with the selection's key. The item is absent, not disabled, where it does not
apply, so the menus stay short.

### D8. Where the words live

Menu labels and the dialog's words are in `packages/canvas/src/messages/{en,es}.ts` (`menu`,
`dialogs`); the effect labels come from the inspector fields; reasons of the new refusals in
`packages/edit/src/messages` and `packages/editor/src/messages`. Docs: the context menu, Effects,
Automatic and assisted layouts and Sequence sections of `docs/editor.md` and `docs/es/editor.md`;
decision note `docs/decisions/0074-context-actions-and-layout-menu.md` written at apply.

## Risks / Trade-offs

- [Menus grow by up to four effect items] → effects sit in their own group, only the applicable
  ones are listed, and the inspector keeps everything else; measured in the webview suite so no
  menu overflows the canvas at 1280 px.
- [Reversing a message with a written activation moves the bar to the other lifeline] → the
  pair is rewritten in the same edit and the status line says which participant is now
  activated; the scenario is tested.
- [A mixed selection: some targets have the effect] → the item is unchecked and one click turns
  the effect on for the rest, as the inspector's toggle does; turning off needs a second click.
  Stated in the docs.
- [The confirmation counts differ from what the user sees] → the counts come from the probe's
  edits, so they are exactly what the retry removes; tested with bands and group children.
- [The inspector's `layout` field shows `auto` while the dialog is open] → the field is not
  written until the retry; on cancel the inspector is re-rendered from the unchanged model.
- [Manual with unplaced boxes depends on the engine] → when the engine cannot arrange, the
  session answers `layout.cannot-arrange` as **Arrange unplaced elements** does, and the mode is
  not written.

## Open Questions

- Whether **Reverse direction** deserves a key later (Shift+R is free on the canvas). It changes
  no spec here and can be added when the owner asks.
- Whether the badge menu should also list **Convert to free composition** on flow diagrams, as
  the Arrange button does. Left out to keep the menu to modes and arranging.
