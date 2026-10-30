## Context

**How a text gets its font today.** A theme has two stacks, `font` and `mono` (`Theme`,
`packages/layout/src/theme.ts`; the tokens at `packages/model/src/schema.ts:419-420`). The layout
measures through `DiagramMetrics` (`packages/layout/src/measure.ts:34-70`), whose `width(text,
role, weight, size)` maps the role `body` or `mono` to the theme's stack (`resolve`, `:46-47`) and
asks the host's `TextMeasurer` (`FontLibrary` or `estimateMeasurer`). Every `TextItem` of the
scene carries that role (`packages/layout/src/scene.ts:73-84`), `Scene.fonts` holds the two stacks
(`layout.ts:2689`), and `renderSvg` writes the body stack once on the `<svg>` and `font-family`
on mono texts only (`packages/render/src/svg.ts:89`, `:413-416`), resolves each text's family for
the `embedded` faces (`embeddableFaces`, `:246-290`) and outlines with it (`:325-`). The canvas's
inline editor takes a text's font from its `TextPlace.font` (`packages/canvas/src/inline.ts:133-138`,
`:341`), built by `textPlaces` from the drawn items (`packages/editor/src/text-places.ts`), with
the `<svg>` attribute as the fallback (`packages/canvas/src/app.ts:8795-8796`).

**How sizes are derived.** `TypeScale` (`layout.ts:528-575`) turns the theme's type tokens into
every measure the drawing uses: `label`, `labelWeight`, `description` and `descriptionLine`
(`16/11` of the size), `relationLabel`, `relationLabelHeight` (`18/11`) and
`relationLabelPadding` (`12/11`), `tag`, `tagHeight` (`18/10.5`) and `tagPadding`, `note` and
`noteLine`, `groupTitle`, `frame`. `labelFont(element)` (`:3597-3604`) gives a box's label size,
weight and line (1.25 × the size), reading `fontSize` and `fontWeight` for free boxes and texts
only; stickies (`:3864-3880`) and free notes (`:3838-3846`) read them in their own methods; every
other text takes the scale directly (`metrics.width(…, "body", scale.labelWeight, scale.label)`,
e.g. heads at `packages/layout/src/sequence.ts:145`, messages `:157`, tags `layout.ts:589`,
relation pills `:2919-2932`, group titles `:4606`, `:5022`, descriptions `:4546`, technology
lines `:439`, `:5795`). Default box sizes scale with `labelSize` (`SHAPE_SIZES`, `:397`,
`:4222`, `:4425`), and `layout.text-overflow` compares a written `size` with the measured text
(`flow-svg-export`, "Text fits its box").

**The tables.** `STYLE_PROPERTIES` (`schema.ts:452-`) are the properties of styles, classes and
rules of every profile; `FREE_STYLE_PROPERTIES` (`:446-452`) are added in free diagrams and
reported elsewhere by `refuseFreeProperties` (`style-values.ts:491-506`) with the hint
`hints.values.freeProperties`; `STICKY_PROPERTIES` (`:535-551`), the `*_REFUSED_PROPERTIES` lists
and `StyleResolver` (`packages/layout/src/styles.ts`) say which target takes what. A `string`
value kind is read generically (`style-values.ts:117`, `:167`). `setStyleProperty` validates with
the same tables; `completions` offers a property's values from its spec (`completion.ts:477`).

**The interface.** The inspector's style fields are `STYLE_FIELDS` plus, in free diagrams,
`FREE_STYLE_FIELDS` (`fontSize` as a number, `fontWeight` as an enum,
`packages/editor/src/inspector.ts:242-246`, `:302-304`); the strip (`withStrip`, `:1222-1290`)
lifts `style.fontSize` and `style.fontWeight` only for stickies (`:1192-1193`, `:1229`). The
theme panel builds `font` and `mono` as an `enum` field over `embeddableFamilies` (bundled plus
unrestricted project fonts) with "custom" (`packages/editor/src/themes.ts:136-178`), and
`themeTokenOperation` writes the chosen family quoted. Field types are `id`, `text`, `multiline`,
`number`, `enum`, `color`, `icon`, `classes`, `ports` and `boolean`
(`packages/editor/src/canvas/protocol.ts:351-352`); the canvas draws a `number` with a `range` as
a slider with its number, an `enum` with `glyphs` as pictures (`packages/canvas/src/inspector.ts`),
and the icon picker is a popover of the canvas package opened from a field (`diagram-canvas`,
"Icon picker"; decision 0046). Keys are a table (`packages/editor/src/canvas/keyboard.ts:139-225`),
`primary` meaning Ctrl or Cmd.

**Fonts in the hosts.** `BUNDLED_FAMILIES` (`packages/fonts/src/families.ts:15-50`) names each
family's Fontsource package, prefix, optional complete files and weights; `FONT_PACKAGES` (`:59-66`)
the packages a reader provides; `bundledFontFiles()` (`packages/fonts/src/node.ts:63-95`) every
file a host copies (`packages/vscode/build.mjs:95-97`, `packages/playground/build.mjs:154-156`).
The CLI reads the packages from `node_modules` (`createNodeFontLibrary`); the extension reads its
`assets/fonts` on demand (`packages/vscode/src/extension/extension.ts:57-62`); the playground
fetches a file the first time a text needs it (`LazyFiles`, `STARTUP_FONTS`,
`packages/playground/src/main.ts:17-26`, `:100-115`; `settle`, `studio.ts:868-885`). The four
families' files are 1,979 KB in 107 files (measured 2026-10-29; the two complete fonts are 699 KB
of them). `scripts/licenses.mjs:13-20` marks the font packages as embedded in
`THIRD_PARTY_LICENSES.md`; the VSIX and playground notices say "OFL-1.1 for the fonts".

## Goals / Non-Goals

**Goals:**

- A person picks a font for a diagram, for a selection or for a kind from a list of families they
  know, sees each family in its own face before choosing, and the export measures, embeds and
  outlines it exactly as the four families today.
- Any text of any profile takes a size and a weight in the file and from the strip, and the
  drawing grows around it; nothing is scaled down or overflows silently.
- Every existing picture, snapshot and model JSON is unchanged: the built-in themes keep their
  fonts and no default moves.

**Non-Goals:**

- `textAlign`, `verticalAlign` and `opacity` outside free compositions (decisions 0043, 0058, 0064
  hold).
- Italic text, letter spacing, line height or text decoration properties.
- System families (Arial, Georgia, Times New Roman) in the picker: a family the tool cannot
  measure contradicts "looks the same on every machine"; a stack written by hand still works, as
  today, with estimates and `layout.unmeasured-font`.
- Mermaid `themeVariables.fontFamily` and PlantUML `skinparam defaultFontName|defaultFontSize`: a
  diagram-wide default that would write a theme block, out of these importers' approximations.
- Variable fonts, and fetching fonts from the network at run time.

## Decisions

### D1. Thirteen Fontsource families in `@meltemi/diagrams-fonts`, grouped

The families, chosen for how often people look for them in draw.io, Google Slides and on the web,
and for having a static Fontsource 5.x package (`@fontsource/<name>`, files
`files/<prefix>-<subset>-<weight>-normal.woff2` and `unicode.json`, the layout the reader knows):

| Group       | Families                                                   | Weights among 400–700 (as published)                                 |
| ----------- | ---------------------------------------------------------- | -------------------------------------------------------------------- |
| sans        | Roboto, Open Sans, Lato, Montserrat, Poppins, Nunito       | all four, except Lato (400, 700)                                     |
| serif       | Merriweather, Lora, Playfair Display                       | all four                                                             |
| mono        | Roboto Mono, Source Code Pro                               | all four                                                             |
| hand        | Caveat, Comic Neue                                         | Caveat all four; Comic Neue 400, 700                                 |

Every one is under the SIL Open Font License 1.1 as Fontsource 5.x records it (task 1.1 reads the
`license` field of each installed package and the notices name any other licence). `BundledFamily`
gains `group: "sans" | "serif" | "mono" | "hand"` and `license: string`; the four existing families
get theirs (Inter, IBM Plex Sans sans; Cascadia Mono mono; Patrick Hand hand). `weights` lists what
the package publishes among the four, and `nearestWeight` keeps giving a missing weight the
nearest file (ties heavier), measured, embedded and outlined alike, with the `@font-face` range
rule of decision 0058 (`EmbeddableFace.weightTo`) so that a browser does not synthesize a bold.
`FALLBACK_FAMILIES` stays `Inter, IBM Plex Sans`. `FONT_GROUPS` orders the groups for pickers and
listings, and `FontLibrary.families()` returns `{ family, group, weights, license, source:
"bundled" | "project", restricted }` for the bundled families and `addFont`'s project fonts
(project fonts in a group of their own, `project`). `bundledFontFiles()` and the host builds need
no change: they iterate the table.

Why these monos: Roboto Mono and Source Code Pro have no contextual ligatures, so the width the
layout measures from advances is the width a browser draws; JetBrains Mono and Fira Code turn `=>`
and `!=` into ligatures by default and would draw narrower than measured.

Alternatives: a second package `@meltemi/diagrams-fonts-popular` as an optional dependency (keeps
`npx` light, but two tables, two readers and a family that is "sometimes there" in the picker;
rejected unless the measured install of task 1.1 exceeds about 60 MB, see Open Questions);
`@fontsource-variable/*` (one file per family, but a second code path in the subsetter and the
`@font-face` rules, and fontkit's variable instancing is not what the outliner uses); Google Fonts
at run time (offline rule of the product, playground CSP, non-deterministic exports); the system
families (not measurable).

### D2. `font` is a style property whose value is a stack, measured as written

`font "<stack>"` joins `STYLE_PROPERTIES` with the value kind `string`, non-empty, in every
profile. It is named after the token it overrides, as `radius`, `iconSize` and `iconPosition` are.
It applies to every target that draws text: elements of the kinds `node`, `decision`, `data`,
`datastore`, `note`, `tag`, `group`, `box`, `text`, `sticky`, the sequence participants and the C4
entities; relations and free lines (their label pill, label and technology line); the sequence
events `note` and `fragment` (operator and condition). `icon`, `image` and `pen` targets refuse it
with `prop.invalid-value` and the hint that it applies to targets that draw text; a class carrying
it on such a target ignores it, as classes do.

Measuring: `DiagramMetrics.width` and `baseline` take a `font` argument that is a role or `{ role,
stack }`; with a stack, the measurer is asked for the written stack alone, so `font "Roboto"`
measures with Roboto, `font "Company Sans"` with the project font, and `font "Comic Sans MS"`
with estimates plus one `layout.unmeasured-font` (info) per diagram that names the stack, as a
theme's unknown font does today. The theme's stack is not appended before measuring: appending
it would measure a Comic Sans sheet with Inter and say nothing.

Drawing: `TextItem.stack?: string` holds the written stack when a text has one. `renderSvg`
writes `font-family="<written stack>, <theme stack of the role>"` on such a text, so a viewer of a
`system` export without the family falls back as the theme does, and `embeddableFaces`, the
`outlined` policy and the label audit resolve the item's stack when it has one, the role's
otherwise (`stackOf`). The canvas's `TextPlace.font` carries the same value, so the inline editor
types in the written family. `Scene.fonts` stays `{ body, mono }`.

Alternatives: `fontFamily` (CSS's name, but the theme token is `font` and every style property that
overrides a token bears its name); a bare family name as the value (`font Roboto`: families have
spaces, and the token takes a quoted stack); a per-element `mono` (tags are the only mono text,
and `font` on a tag already replaces it); writing the written family only, without the theme's
stack after it (a `system` export would fall to the browser's default serif on a machine without
the family).

### D3. `fontSize` and `fontWeight` leave the free-only table

`fontSize` (6 to 160) and `fontWeight` (400, 500, 600, 700) move from `FREE_STYLE_PROPERTIES` to
`STYLE_PROPERTIES`; `textAlign`, `verticalAlign` and `opacity` stay, and `refuseFreeProperties`,
its hints and the messages name the three that remain. The targets are those of D2. The default
of each target is the theme's measure for its kind, greyed in the interface:

| Target                                                               | Size                    | Weight             |
| -------------------------------------------------------------------- | ----------------------- | ------------------ |
| node, decision, data store, C4 entity, participant head, free box    | `labelSize`             | `labelWeight`      |
| free text                                                            | 1.6 × `labelSize`       | `labelWeight`      |
| sticky                                                               | 1.2 × `labelSize`       | 400                |
| group (its title)                                                    | `groupTitleSize`        | `labelWeight`      |
| note (flow, free, C4, sequence)                                      | `noteSize`              | 400                |
| tag                                                                  | `tagSize`               | 500                |
| relation, free line, C4 relation (its label)                         | `relationLabelSize`     | 500                |
| sequence message (its label)                                         | `relationLabelSize`     | 400                |
| fragment (its operator; the condition at the same size, weight 400)  | `relationLabelSize`     | 600                |

A written size scales what the theme token scales: a box's description line is `round(size ×
descriptionSize / labelSize)` at `16/11` line spacing and the technology line of a relation or
entity follows `technologySize` of the written size; a pill is `18/11` of its size high with
`12/11` padding; a tag's pill `18/10.5`; label lines 1.25 × the size; a note's lines its scale's
ratio; a sticky's shrink-to-fit starts from the written size as today. A titled group's band is
`max(groupHeader, round(size × 1.25) + round(groupHeader − 1.25 × groupTitleSize))`, so a larger
title keeps the band's spare room above and below. Default box sizes (`SHAPE_SIZES` scaled by
`labelSize / 13`) are unchanged: a box without `size` grows to fit the measured text with the
theme `padding`, as it grows for a long label, so a larger font gives a larger box in `auto`,
`assisted` and `manual` alike, and a written `size` too small for the text is
`layout.text-overflow` with the fitting hint. The sequence layout measures a head at the
participant's size and weight (its head grows), a message's lines and longest word at the
message's (the natural distance, the wrap room and the `gap-floor` of decision 0065 follow),
notes and fragments at theirs, and rows grow with the lines. Nothing changes where nothing is
written: `labelFont`, the sticky's and the note's readers become one `textOf(target)` of the
`StyleResolver`'s resolved style, and every reader of `scale.<kind>` at a text goes through it.

Alternatives: a `textScale` percentage instead of pixels (people and draw.io think in points);
sizes on flow nodes through the theme only, as decided in 0043 (the owner asks for the control
per text, and the base derives every measure from a size already); a separate `descriptionSize`
style property (one size per target as in draw.io; the description keeps the theme's ratio).

### D4. A font picker of the canvas package, fed by the session

A new field type `font` draws a button with the field's family written in that family (the
inherited family greyed when nothing is written, "custom" for a stack that is none of the
options, "mixed" for a selection that differs). It opens a popover under the button, built like
the icon picker (decision 0046): a search field that filters by name; the families in groups
headed Sans, Serif, Monospace, Handwriting and Project fonts (the groups of D1 that have a
member), each row the family name and "Aa" drawn in the family; a "theme" row that removes the
property ("inherit" in the theme panel); arrow keys move, type-ahead jumps, Enter chooses, Escape
closes, and the rows are a listbox with the family as accessible name. The strip and the theme
panel open the same control.

The faces the rows need come as the icon picker's results do: the canvas sends `listFonts` with a
token when the picker opens, and the session answers `fonts` with, per family, its name, group,
weights and the `@font-face` rules for the row's own glyphs (`provider.faces(family, 400,
"<Family> Aa")` through `fontFaceRule`: the Latin subset file, about 20 to 40 KB per family),
cached by provider and family once its files have been read; the canvas puts the rules in one
`<style>` of the popover. A row whose face has not arrived (a playground family not yet fetched)
is drawn in the interface font at the same row height and swaps in place when a later answer
brings it: the canvas asks again when a render arrives while the picker is open, as it does for
icon thumbnails. A project font that is
restricted (measure only) is listed with a lock and the reason, and writes like any other.

Writes: the picker writes the family quoted (`font "Roboto"`; the panel `font "Roboto"` too, as
"Project font" writes today), through `setStyleProperty` for the strip (one batch for a
multi-selection) and `setThemeToken` for the panel. Nothing writes a generic family after it: the
export embeds the font and the renderer appends the theme's stack (D2).

Alternatives: a `<select>` with the family names (what the panel has; it cannot show the faces);
rendering the rows with the complete fonts (0.7 MB for Inter alone; the subsets of a row's own
glyphs are small); listing families the host cannot measure (Non-Goals); a Google-Fonts-style
browser with previews of the diagram's own text (more surface than the owner asked for; the
canvas redraws the selection in the chosen family on choice anyway).

### D5. The strip's Text group, and two keys

For a selection whose every item takes `font` (D2), in every profile, the strip shows a group
headed **Text** ("Texto") after the shape and alignment controls and before Effects: the font
button of D4; a size control, which is a field whose list offers 8, 9, 10, 11, 12, 14, 16, 18, 20,
24, 28, 32, 36, 40, 48, 56, 64, 72 and 96, with − and + buttons that step to the previous or next
value of the list from the effective size (a size between two values steps to the nearer one in
the direction pressed), the inherited size greyed as placeholder, any number from 6 to 160 typed
(out of range refused in place naming the range, as the radius field refuses), and "theme" to
remove it; and a weight row of four chips showing "Aa" drawn at 400, 500, 600 and 700, named
Regular, Medium, Semibold and Bold ("Normal", "Media", "Seminegrita", "Negrita"), the written
chip pressed, the inherited greyed, a "theme" chip, a radio group with the arrow keys. Each writes
`fontSize` or `fontWeight` with `setStyleProperty` for every selected item, one batch; "mixed"
where the values differ. Read-only canvases draw the controls disabled with the written values
shown. The sticky-only `style.fontSize` and `style.fontWeight` strip fields are replaced by the
group; the Text size and Text weight fields of the inspector below the strip are the same
controls, which the strip lifts.

Two commands join the keymap: `growText` on Ctrl+Shift+. and `shrinkText` on Ctrl+Shift+, (Cmd
on macOS), the keys slide tools use. They step the effective size of every selected item that
takes `fontSize` to the next or previous value of the list in one batch, announce the new size,
do nothing at the ends, and are listed in the keyboard help and the editor guide. Neither key is
among those VS Code binds globally (`diagram-canvas`, "Keyboard operation and focus"); the canvas
prevents the default so that the webview keeps them.

Alternatives: a slider for the size (the radius's control; a slider from 6 to 160 cannot hit 11
or 13); Ctrl+B for bold (VS Code toggles the side bar with it in the webview's host, and the row
is one click); Ctrl+= and Ctrl+- (zoom in the browser and the playground); Alt+Shift+Up/Down (the
grid steps).

### D6. Where the fields appear

`STYLE_FIELDS` gains `font` (type `font`), `fontSize` and `fontWeight` for the targets of D2 in
every profile: `elements` predicates for the element kinds, relation fields for relations and
free lines, and the sequence event fields for notes and fragments; `FREE_STYLE_FIELDS` keeps
`opacity` and the alignments. `NOT_IN_SEQUENCES` leaves the three in. The inspector of a C4 entity
shows them beside Icon position. `textPlaces` carries each drawn text's stack, size and weight,
so the inline editor of a sized heading opens at its size and family.

### D7. Language services, the command line and the audit

Completion after `font ` in a style, class or rule block, and after `font ` or `mono ` in a theme
block, offers every family of `families()` as a quoted string with its group as detail (project
fonts first, then the groups in `FONT_GROUPS` order); after `fontWeight ` the four weights, as
today, in every profile. Hover on the value of `font` names the family the text is measured with
("measured with Roboto", "project font Company Sans") or says that no bundled or project family
matches and the text is measured with estimates. `meltemi-diagrams assets list` prints a
"Bundled fonts" table (family, group, weights, licence) before the project fonts; the project
fonts' table is unchanged. `auditLabels` measures each text with its stack when it has one.

### D8. Hosts, notices and inventory

The builds copy `bundledFontFiles()` as today, so the VSIX and the playground's assets gain the
new families' subset files; `STARTUP_FONTS` is unchanged and a new family is fetched the first
time a text names it, through the same `LazyFiles` and `settle`. `packages/vscode/test/package/check.mjs`
and the packaging scenario list one `unicode.json` of a new family. The notices generated by the
builds take each font package's `license` field from its `package.json` instead of the fixed
sentence, and `scripts/licenses.mjs` marks the new packages embedded. `packages/fonts/test/bundled-files.test.ts`
covers every family in the table without change; a new test reads each family's `weights` back
from the installed files.

### D9. Documentation, skill and decision

`docs/language/fonts.md` lists the seventeen families by group with their weights, says how
`font`, `fontSize` and `fontWeight` are measured and drawn, and keeps the policies; `styles.md`
moves the three properties out of the free-only rows into the general table with the defaults of
D3; `free.md` and `grammar-0.2.md` keep `textAlign`, `verticalAlign` and `opacity` as the
free-only trio; `diagnostics.md` says `layout.unmeasured-font` names a style's font too;
`docs/editor.md` describes the picker, the Text group and the keys; the Spanish mirrors follow.
The skill's `SKILL.md` gains one rule (pick a bundled family with `font`, size with `fontSize`,
never a system family), `reference/themes.md` the families, `reference/free.md` and
`reference/language.md` the properties in every profile. The changelog's 1.11.0 section gains a
"Fonts and text" part; decision 0067 records the family list with the measured sizes, D2 to D5
and the alternatives.

### D10. Motion

The picker's popover opens and closes with the motion tokens of decision 0046 (`--motion-fast`,
`--motion-ease`), rising 4 px and fading in; a row's face swaps in place without a height change;
the − and + buttons give the pressed feedback of the strip's chips; the chosen weight chip and the
size field settle with the strip's `--motion-fast` transition; the canvas redraw after a change is
the ordinary render, with the live preview of resizes untouched. Nothing animates under
`prefers-reduced-motion`.

## Risks / Trade-offs

- [Install and package size] Thirteen Fontsource packages add about 4 MB each to `node_modules`
  (italics and every weight come along) and about 350 to 500 KB each of subset files to the VSIX
  and the playground's assets. → Task 1.1 measures both before anything else and records them in
  decision 0067; the playground pays nothing at startup; if the install grows by more than about
  60 MB the owner decides between D1 and the second package (Open Questions).
- [A family's licence or layout differs from the table] A package recorded under another licence,
  or without a `unicode.json`, would break the reader or the notices. → Task 1.1 reads `license`
  and the file layout of each installed package and the table is corrected before the families
  are listed; the bundled-files test fails on a missing subset.
- [Missing weights] Lato and Comic Neue lack 500 and 600 among the statics. → The
  nearest weight is measured, embedded and outlined with the range rule of decision 0058, so the
  browser never synthesizes; the picker's weight chips show which weights a family has (a chip of a
  missing weight is drawn with the nearest file, as the export draws it).
- [Larger text moves ELK's arrangement] A node that grows changes the automatic layout around it.
  → That is what a longer label does today; `layout.text-overflow` protects written sizes, and the
  acceptance sheets record the arrangements.
- [Sequence wrap and floor] A larger message font widens the longest word and the natural
  distance. → The rules of decision 0065 take the measured values; tests cover a sized message
  between pulled participants.
- [Keys reaching the host] A webview host could take Ctrl+Shift+. before the canvas. → The canvas
  prevents the default on keydown, the webview suite presses both keys, and the Text group has the
  same steps with the pointer.
- [Picker rows before their fonts arrive] In the playground a family not yet fetched shows in the
  interface font for a moment. → Rows have a fixed height and swap in place; `settle` re-sends
  `fontOptions` when the files arrive.
- [Snapshots must not move] A mistake in the per-target scale would change existing pictures. →
  The corpus, gallery, acceptance and visual suites run unchanged first (task 3.5) before any
  sheet that writes the new properties is added.

## Open Questions

1. **The downloads.** Thirteen `@fontsource/*` packages (OFL-1.1, D1), to be added to
   `@meltemi/diagrams-fonts` with `pnpm add`; nothing is downloaded before the owner approves the
   list. Recommendation: the list as written. The owner may strike or add families; each needs a
   static Fontsource package.
2. **One package or two.** Recommendation: one (D1), unless task 1.1 measures more than about 60 MB
   added to a CLI install, in which case the thirteen move to `@meltemi/diagrams-fonts-popular`,
   an optional dependency the CLI, the extension and the playground always carry.
3. **The keys.** Recommendation: Ctrl+Shift+. and Ctrl+Shift+, (D5). Alternative: Alt+= and
   Alt+-.
4. **The written value.** Recommendation: the family alone, `font "Roboto"`, with the theme's
   stack appended by the renderer (D2). Alternative: the picker writes `font "Roboto, sans-serif"`.
