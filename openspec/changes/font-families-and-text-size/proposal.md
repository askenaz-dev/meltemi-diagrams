## Why

The owner asked on 2026-10-29: "Mejorar el manejo de fuentes y de textos. Ahora mismo no se puede
cambiar la fuente y el control del tamaño de la fuente. Vamos a mejorar eso y poder seleccionar
entre algunos tipos de fuente populares". Both complaints have one cause each in the language and
one in the interface.

- **A text cannot have its own font.** The only place a family is written is a theme's `font` and
  `mono` tokens (`THEME_TOKENS`, `packages/model/src/schema.ts:419-420`). Every text item of a
  scene carries a role, `body` or `mono` (`TextItem.font`, `packages/layout/src/scene.ts:81`), the
  measurer turns the role into the theme's stack (`DiagramMetrics.resolve`,
  `packages/layout/src/measure.ts:46-47`) and so does the renderer (`stackOf`,
  `packages/render/src/svg.ts:232-234`), so a heading in a serif, a note in a hand font or a code
  box in a monospace needs a second theme or does not exist. The theme panel offers `font` and
  `mono` as a plain select of four names plus "custom" (`tokenField`,
  `packages/editor/src/themes.ts:157-178`), and nothing on the canvas or in the strip chooses a
  font for a selection.
- **Four families, one of each kind at most.** `BUNDLED_FAMILIES` is Inter, IBM Plex Sans,
  Cascadia Mono and Patrick Hand (`packages/fonts/src/families.ts:15-50`): two sans, one mono, one
  hand, no serif, none of the families people know from draw.io, Google Slides or the web (Roboto,
  Open Sans, Lato, Montserrat, Poppins). A theme that names any other family is measured with
  estimates and reports `layout.unmeasured-font`.
- **The text size is a free-composition property.** `fontSize` and `fontWeight` live in
  `FREE_STYLE_PROPERTIES` (`schema.ts:446-452`) and `refuseFreeProperties` reports them in every
  other profile (`packages/model/src/style-values.ts:491-506`, decisions 0018 and 0043); the layout
  reads them for free boxes and texts only (`labelFont`, `packages/layout/src/layout.ts:3597-3604`),
  stickies (`:3864-3875`) and free notes (`:3838-3846`). A flow node, a decision, a data store, a
  group title, a tag, a relation label, a sequence participant or message, a C4 container can only
  change size through the theme's type tokens, which move every text of the kind at once.
- **No control sizes text on the canvas.** The strip shows Text size and Text weight for stickies
  only (`withStrip`, `packages/editor/src/inspector.ts:1192-1193`, `:1229`), as plain number and
  select fields; the inspector of other kinds has neither; no key grows or shrinks the text of a
  selection, while every slide tool has one.

The base makes this a small language change and a mostly interface change. The style tables are
data (`STYLE_PROPERTIES`, profile tables), classes and rules apply any property, the layout
already derives line heights, pill heights and box sizes from sizes (`TypeScale`,
`layout.ts:555-575`), boxes without `size` grow to fit their text and `layout.text-overflow`
reports a `size` that does not, `FontLibrary` measures, subsets, embeds and outlines any bundled
or project family, and hosts fetch font files when a text needs them
(`LazyFiles`, `packages/playground/src/main.ts:17-26`, `studio.ts:868-885`). Post-1.0 change,
outside the roadmap (`docs/roadmap-1.0.md`); it narrows decisions 0018, 0043 and 0058 (the
free-only text properties) and records decision 0067 (0066 is reserved by `gantt-diagrams`).

## What Changes

- **Popular families bundled.** `@meltemi/diagrams-fonts` grows from four to seventeen families,
  each from its Fontsource package under the SIL Open Font License 1.1, in the weights it has
  among 400, 500, 600 and 700, measured, subset, embedded and outlined like the four: Roboto,
  Open Sans, Lato, Montserrat, Poppins and Nunito (sans); Merriweather, Lora and Playfair Display
  (serif); Roboto Mono and Source Code Pro (monospace); Caveat and Comic Neue (handwriting). Each
  family records its group and licence; `FontLibrary.families()` lists the bundled and project
  families with them; the licence inventory, the VSIX and playground notices and
  `docs/language/fonts.md` list them. The downloads need the owner's approval (design, Open
  Questions). The built-in themes keep their fonts, so every existing picture is unchanged.
- **`font` is a style property.** `style <target> { font "<stack>" }`, a quoted, non-empty CSS
  font stack like the theme token, on every element, group, relation and event that draws text,
  in every profile, in classes and rules too; `icon`, `image` and `pen` targets refuse it. The text
  is measured with the first bundled or project family of the written stack (estimates and one
  `layout.unmeasured-font` naming the stack when none is), embedded, outlined and drawn with it:
  the scene's text items carry the written stack and the renderer writes it as the text's
  `font-family`, followed by the theme's stack of the text's role so that viewers without the
  font fall back as the theme does.
- **`fontSize` and `fontWeight` in every profile.** They leave the free-only table: a flow node,
  decision, data store, note, tag, group title, relation label, sequence participant, message,
  note or fragment, and C4 entity or relation take them in `style` statements, classes and rules,
  with the theme's size and weight of the kind as the greyed default (the description, the
  technology line, line heights, pill heights and paddings scale with the written size as they
  scale with the theme token). A box without `size` grows to fit; a `size` that is too small is
  `layout.text-overflow` with a fitting hint, as today. `textAlign`, `verticalAlign` and
  `opacity` stay free-only (decisions 0043, 0058 and 0064).
- **A font picker.** One control of the canvas package, opened from a button that shows the
  current family in its own face: a search field and the families in groups (Sans, Serif,
  Monospace, Handwriting, Project fonts), each row drawn in its family, "custom" for a stack
  written by hand, "theme" to inherit again, arrow keys and Enter. The theme panel's `font` and
  `mono` fields use it; the strip uses it for the selection's `font`.
- **A Text group in the strip.** For every selection that draws text, in every profile: the font
  button, a size control (a field with a list of the common sizes 8 to 96, − and + stepping along
  them, the inherited size greyed as placeholder, 6 to 160 typed, out of range refused) and a
  weight row of four chips drawn at 400, 500, 600 and 700 (Regular, Medium, Semibold, Bold) with
  a "theme" chip. Each writes `font`, `fontSize` or `fontWeight` with `setStyleProperty`, one
  batch for a multi-selection, "mixed" where values differ. Ctrl+Shift+. and Ctrl+Shift+, (Cmd on
  macOS) step the size of the selection along the list. The inline editor types in the written
  family, size and weight. The sticky-only Text size and Text weight fields of the strip become
  this group.
- **Language services and the command line.** Completion after `font` offers every bundled and
  project family quoted, with its group as detail; hover on a `font` value names the family the
  text is measured with, or says it is estimated. `meltemi-diagrams assets list` prints the
  bundled families (family, group, weights, licence) before the project fonts.
- **Documentation, skill, changelog and decision.** `docs/language/fonts.md`, `styles.md`,
  `free.md`, `grammar-0.2.md`, `diagnostics.md`, `docs/editor.md` and their Spanish mirrors, the
  agent skill (`SKILL.md` and `reference/themes.md`, `free.md`, `language.md`), the 1.11.0
  changelog section and decision 0067.

## Capabilities

### New Capabilities

None: every piece extends a capability that exists.

### Modified Capabilities

- `text-measurement`: seventeen bundled families with group, weights and licence; `families()`.
- `svg-font-policies`: a text's `font-family`, embedded faces and outlines from its written stack.
- `style-classes-and-rules`: `font`, `fontSize` and `fontWeight` as properties of every profile.
- `flow-diagram-model`: the style block's property list gains the three.
- `free-diagram-model`: `fontSize` and `fontWeight` are no longer refused in flow diagrams.
- `flow-svg-export`: written sizes grow boxes, pills, tags and group bands; `layout.text-overflow`
  and `layout.unmeasured-font` with written sizes and fonts.
- `sequence-layout`: written sizes and fonts on heads, messages, notes and fragments.
- `c4-layout`: written sizes and fonts on entities and relations.
- `label-audit`: texts measured with their written font.
- `theme-editing`: the `font` and `mono` fields of the panel are the font picker.
- `quick-styling`: the Text group of the strip and the size keys.
- `diagram-canvas`: the font picker control; the inspector's text fields in every profile.
- `editor-language-services`: completion and hover of `font`.
- `project-assets`: `assets list` prints the bundled families.
- `license-inventory`: the new font packages in the inventory.
- `vscode-extension`: the new families among the packaged fonts.
- `web-playground`: families fetched when a text first needs them.

## Impact

- **Packages**: `fonts` (families table, groups, licences, `families()`), `model` (style tables,
  the free-only list, the `font` property, messages), `layout` (per-target text scale, written
  stacks in `TextItem`, `DiagramMetrics`, sequence heads and rows, the audit), `render`
  (`font-family` per text, embedded faces and outlines per written stack), `edit` (nothing new:
  `setStyleProperty` is generic), `editor` (inspector fields and strip, theme panel, text places,
  completion, hover, keymap, messages), `canvas` (font picker, size control, weight chips, keys,
  inline editor), `cli` (`assets list`), `vscode` and `playground` (build copies, notices, suites),
  `acceptance` (sheets and references), the skill, docs, changelog.
- **Dependencies**: thirteen `@fontsource/*` packages (OFL-1.1) added to `@meltemi/diagrams-fonts`,
  after the owner approves the download; `scripts/licenses.mjs` marks them embedded. No other
  dependency.
- **Public surface**: `BundledFamily.group` and `.license`, `FONT_GROUPS`, `FontLibrary.families()`,
  `TextItem.stack`, `TextPlace.font` carrying the written stack, `StyleProperties.font`,
  `ResolvedStyle.font`, the protocol's `font` field type and `fontOptions`, the canvas commands
  `growText` and `shrinkText`.
- **Outputs**: no existing SVG, PNG, PDF, model JSON or player changes, since the built-in themes
  keep their fonts and nothing writes the new properties; the model JSON of a sheet that writes
  `font` carries it as a string property; the version stays 0.1.
- **Size**: the VSIX and the playground's assets grow by the new families' subset files
  (measured and recorded in decision 0067 at apply); the playground's startup set is unchanged
  and other families are fetched when a text needs them.

## Non-goals

- Editable PPTX shapes and PPTX export, where fonts would travel as text runs: a 1.0 exclusion of
  the proposal.
- Importing fonts, text sizes and weights from draw.io, PowerPoint or other pictures: the
  proposal's universal-import exclusion.
- Text properties on Gantt tasks, milestones and sections: the `gantt-diagrams` change, which
  takes the properties this change defines when it lands.
