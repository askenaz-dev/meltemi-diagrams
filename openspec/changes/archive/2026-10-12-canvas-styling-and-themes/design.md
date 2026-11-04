## Context

The canvas (`packages/canvas`, served by the VS Code extension and the playground) already turns
every gesture into an edit operation of `packages/edit`, and its inspector (`packages/editor/src/inspector.ts`)
exposes every style property as a field: `fill`, `stroke`, `color`, `iconColor` as `color` fields,
`line`, `width`, `pattern`, `arrowhead`, `routing`, `icon`, and the effects of
`packages/editor/src/effects.ts`. What the owner found when reviewing 1.0:

- a `color` field is a text input with a datalist of token names (`panels.ts:103`), and shows a
  swatch only for a `#` value (`panels.ts:128`);
- custom themes exist only as hand-written `theme <id> { }` blocks (`theme-block.ts`), with a
  fixed token set (`schema.ts:189-240`); nothing on the canvas creates or edits one;
- the default duration of an effect is the constant `ANIMATION_DEFAULT_DURATIONS`
  (`schema.ts:60`, mirrored in `effects.ts:17`);
- a style or an effect on an anonymous relation is refused ("Name the relation…"), while
  `namedRelation` (`inspector.ts:523`) already names relations for labels and routes;
- the icon picker (`SessionResult.pick`) serves only new free `icon` objects; on a flow node the
  icon is typed into the Icon field;
- relations are created from the connection handles or the C key, not from the palette.

The owner's decisions: a custom palette is a custom theme that extends a base theme; the quick
controls go in the sidebar (draw.io's format panel), with the full inspector below; the engine's
default speed stays, and a theme may set its own; no standalone lines.

## Goals / Non-Goals

**Goals:**

- Style the selection with swatches and a picker without leaving the canvas, and keep the
  distinction the language makes: a token follows the theme, a colour stays fixed.
- Create and edit a theme from the canvas, as text edits of a theme block, in both hosts.
- Let a theme set the default speed of effects, consistently from the inspector to every export.
- Remove the frictions found: anonymous relations, typed icons, relations only by gesture.

**Non-Goals:**

- Named colours of one's own (`brand1`) as tokens: the fixed set stays.
- A font family per element: fonts are theme tokens, chosen among embeddable families.
- Standalone lines, arranging a selection, the laser pointer (a change of the player).
- Changing any drawing: no visual reference moves.

## Decisions

### The strip is the top of the inspector, not a floating bar

The inspector keeps one model (`InspectorModel`) and the canvas keeps rendering it; the strip is
the first section of that model, rendered differently. The editor service adds to the model, for
the selection's style fields, the **swatches** of the effective theme: the sixteen colour tokens
and the four signals, each with the hex the resolved theme gives it (built-in or custom, so a
custom theme shows its own colours). `InspectorField` gains `swatches?: readonly { token; hex }[]`
and `inherit?: boolean`; the canvas renders a `color` field with swatches as a row of swatches, a
native `<input type="color">` for a value of one's own, and a "theme" control that sends `null`
(the inherited value). Without swatches, a `color` field renders as today.

The strip holds: fill, stroke, text colour; line (solid, dashed), width, arrowhead (relations); the
three effects as toggles with the speed of the ones that are on; and, for the diagram, the theme
row. It is one section of the panel, so it works in VS Code's webview and the playground alike, is
reachable by keyboard like every field, and is announced by the same status line.

### Swatches write tokens; the picker writes colours

A swatch sends the token's name (`accent`), the picker a hex (`#E8A33D`), "theme" `null`; the
service writes `setStyleProperty` as it does today (`style api { fill accent }`, or removes the
property). Nothing new in the language: this is the distinction `styles.md` documents, made
visible. For several selected items the service writes one `setStyleProperty` per target in one
batch plan (one undo step), as the shared-style inspector does.

### Styling an anonymous relation names it

`styleOperations` and `effectOperations` (`inspector.ts`, `effects.ts`) prepend
`materializeRelationId` through `namedRelation` when the relation has no id, exactly as
`setRelationLabel`, `moveLabel` and `setVia` do. The status line says "Named the relation
`api_db`". Relations also get the `classes` field elements have.

### The relation tool

A palette entry **Relation** (key R; "Message" on sequence diagrams) arms the cursor: the first
click chooses the source (highlighted), the second the target, Escape cancels, Shift gives `-->`.
It sends the existing `create` action for relations (`createRelation`), so the result is the same
text as dragging from a handle; it only makes the gesture discoverable.

### The icon picker from the Icon field

The `style.icon` field gets a "Choose…" control; the canvas asks the host to pick an icon
(`SessionResult.pick` gains `{ kind: "icon", style: { ids } }`), and the chosen reference is written
with `setStyleProperty icon`. Hosts already implement the picker for free objects; the same list
serves every profile, including relations (icons in label pills).

### Theme editing

- **Entry points** on the diagram's Theme field: "New theme from this one…" always; "Edit theme…"
  when the effective theme is a block of a file of the project (a built-in theme is read-only, so
  the first entry derives one).
- **Creating.** The dialog asks the id and where the theme lives:
  - *this file*: `createTheme { file, id, extends }` inserts `theme <id> { extends "<current>" }`
    before the first diagram of the file, and `setDiagramProperty theme "<id>"` points the diagram
    at it, in one batch;
  - *the project*: the editor service writes `themes/<id>.meltemi` (created when missing) with the
    block, and sets `"theme": "themes/<id>.meltemi#<id>"` in `project.json` through a minimal JSON
    text edit (insert or replace the field, keeping the file's formatting). Diagrams without their
    own `theme` follow it, as `projects.md` describes. This is a multi-file edit, returned as the
    `Map<path, TextEdit[]>` that renames already return; hosts apply it as a workspace edit (VS
    Code) or to the memory host (playground), creating the file when needed.
- **Editing.** A **Theme** panel replaces the inspector while open (as the story panel does),
  listing the tokens by group: colours (swatches of the theme's own values, a picker, and
  "inherit", which removes the token), fonts, type, spacing, shape, icons, frame and mark, and
  motion (the three durations). Each change is `setThemeToken { file, theme, token, value }`
  (insert the statement when absent, replace the value otherwise, in the block's own file) or
  `removeThemeToken`. The analysis re-runs and the canvas redraws with the theme, in every diagram
  that uses it.
- **Fonts.** The `font` and `mono` pickers list the bundled families (Inter, IBM Plex Sans,
  Cascadia Mono) and the project's fonts (`assets/fonts/`), because only those are embedded in
  exports; a stack written by hand that is none of them shows as "custom" and stays as written.
- **Classes and rules** stay in the code for now; the panel links to the block.

### Effect durations as theme tokens

`flowDuration`, `dashDuration` and `pulseDuration` join `THEME_TOKENS` as times written with `ms`
or `s`, from 100 ms to 60 s, exactly like `duration` in `animate`, and are documented in
`styles.md` and `motion.md`. The layout resolves them into the theme (`Theme.flowDuration` and the
others). Every motion plan is made from a laid-out diagram whose resolved theme is at hand (the
canvas preview and exports in `packages/editor`, story and effects views in `packages/motion`; the
players receive the plan already made), so `motionOptions(theme)` gives `planMotion` the theme's
colours and durations together, and an effect takes
`entry.durationMs ?? durations[effect] ?? DEFAULT_DURATIONS[effect]`. The scene stays unchanged. The inspector shows
the theme's value greyed as the default of a speed field. Built-in themes write none, so every
existing drawing and frame is unchanged. New conformance cases: a valid theme with the tokens and
its model JSON, and an invalid one out of range (`prop.invalid-value`).

### Light and dark counterpart

The strip's theme row shows the current theme and, for a built-in family, a one-click switch to
its `.light` or `.dark` counterpart, which writes `theme "<family>.dark"` with
`setDiagramProperty`. The playground's page switch keeps changing only the page: what is seen is
what is exported, which the product promises.

## Risks / Trade-offs

- [Theme panels in two hosts] → one panel in the canvas package; hosts only pick icons and create
  files, both of which they do today.
- [Multi-file edits and undo] → each host's undo is per file; the status line names every file
  written, and the playground's history groups the batch.
- [`project.json` edits by text] → a minimal insert or replace of one field, tested against
  formatted and minified files; a malformed file is refused with its diagnostic.
- [Durations change motion defaults] → only themes that write the tokens; built-in themes do not.
- [Native colour input looks different per browser] → acceptable; the swatches carry the design,
  the picker is the exception.

## Migration Plan

None: additive language tokens, no file changes meaning.

## Open Questions

None.
