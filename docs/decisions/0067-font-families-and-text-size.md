# 0067. Popular font families, and the font, size and weight of any text

Status: accepted (font-families-and-text-size change, 29 October 2026). Narrows decisions 0018,
0043 and 0058, which kept the text properties free-only, and extends the bundled fonts of
decisions 0012 and 0058.

## Context

The owner asked on 2026-10-29 to improve how fonts and text are handled: the font could not be
changed, the size had no real control, and there was no choice among popular families.

- A family was written in one place only, a theme's `font` and `mono` tokens. Every text of a
  scene carried a role, `body` or `mono`, that the measurer and the renderer turned into the
  theme's stack, so a heading in a serif or a note in a hand font needed a theme of its own.
- Four families were bundled (Inter, IBM Plex Sans, Cascadia Mono, Patrick Hand); any other was
  measured with estimates and reported as `layout.unmeasured-font`.
- `fontSize` and `fontWeight` were free-only and read for free boxes, texts, stickies and notes. A
  node, a group's title, a tag, a relation's label, a participant or a C4 container could only
  change size through the theme's type tokens, which move every text of the kind at once.
- The strip showed size and weight for stickies only, as plain fields; no key changed the size.

## Decision

- **Thirteen Fontsource families.** Roboto, Open Sans, Lato, Montserrat, Poppins, Nunito (sans),
  Merriweather, Lora, Playfair Display (serif), Roboto Mono, Source Code Pro (monospace), Caveat
  and Comic Neue (handwriting), from their `@fontsource/*` 5.3 packages under OFL-1.1, approved by
  the owner on 2026-10-29. They are measured, subset, embedded and outlined from their script
  subsets as Cascadia Mono and Patrick Hand are. `BundledFamily` gains `group` and `license`,
  `FONT_GROUPS` orders the groups, `FontLibrary.families()` lists the bundled and project families.
  The monospace pair has no contextual ligatures, so measured widths are drawn widths. Measured on
  2026-10-29:

  | What                                        | Size              |
  | ------------------------------------------- | ----------------- |
  | The thirteen packages installed             | 34 MB             |
  | Files the hosts copy (`bundledFontFiles()`) | 279 files, 3.9 MB |
  | One picker row's faces (the Latin subset)   | 20 to 40 KB       |

  One package rather than an optional second one: 34 MB is below the 60 MB the design set as the
  point to split, and a family that is "sometimes there" in the picker would be worse.

- **`font` is a style property whose value is a stack, measured as written.** `font "<stack>"`, a
  quoted, non-empty string, joins the style properties of every profile, named after the token it
  overrides. The layout measures a text with the written stack alone (`TextFont` is a role or
  `{ role, stack }`), so a stack with no bundled or project family is estimated and reported
  instead of being measured with the theme's font. `TextItem.stack` carries it, and the renderer
  writes `font-family="<written>, <theme stack of the role>"`, resolves embedded faces and outlines
  from the written stack, and leaves a stack nobody has as `<text>` under `outlined`.
- **`fontSize` and `fontWeight` leave the free-only table.** The three text properties apply to
  everything that draws text in every profile and are refused on icons, images and pens (a class
  ignores them there). The defaults are the theme's for each kind. A written size scales what the
  theme's token scales (`writtenScale`): a box's description at the theme's ratio, pills, tags,
  notes, a titled group's band (`groupHeaderOf`, shared with the editor), sequence heads, messages,
  notes and fragments. `textAlign`, `verticalAlign` and `opacity` stay free-only.
- **A font picker of the canvas package.** A popover like the icon picker: a search, the families
  in groups, each row its name and "Aa" in its own face, a row that inherits again, a lock on a
  restricted project font. The canvas asks `listFonts` and the session answers `fonts` with each
  family's `@font-face` rules for its row, renamed to `mdg-font <Family>` so they never change the
  page's other text; the canvas asks again when a render arrives, so faces that a playground
  fetches late swap in place at the same row height. Enter pressed before the answer chooses the
  first row when it arrives. The strip's Font field and the theme panel's text and code fonts open
  it; the picker writes the family alone, quoted.
- **The strip's Text group and two keys.** For everything that draws text: the Font button, a size
  field with the common sizes 8 to 96 listed, − and + that step every selected item from the size
  it draws (`stepTextSize`, one edit), a size outside 6 to 160 refused in place, and four "Aa"
  weight chips. Ctrl+Shift+. and Ctrl+Shift+, (Cmd on macOS) and the context menu step the size.

## Alternatives considered

- **`fontFamily` as the property's name.** CSS's word, but every style property that overrides a
  theme token bears the token's name (`radius`, `iconSize`).
- **A bare family as the value** (`font Roboto`). Families have spaces, and the token takes a
  quoted stack.
- **Appending the theme's stack before measuring.** A stack nobody has would be measured with the
  theme's font and nothing would say so.
- **Variable fonts** (`@fontsource-variable/*`). One file per family, but a second path in the
  subsetter and the outliner.
- **Google Fonts at run time.** Against the local workflow, the playground's policy and
  deterministic exports.
- **System families in the picker** (Arial, Georgia). The tool cannot measure them; a stack written
  by hand still works, estimated and reported.
- **JetBrains Mono and Fira Code.** Their ligatures draw narrower than the advances measure.
- **A slider for the size**, or **Ctrl+B for bold and Ctrl+= for size.** A slider from 6 to 160
  cannot hit 11 or 13; VS Code and the browsers take those keys.
- **The faces in the session's first render.** Seventeen families' rows are about 400 KB, sent
  only when the picker opens.
- **Reporting a family whose files cannot be fetched.** The playground fetches every family on
  demand, so each first use would flash a notice; such a text is measured with the fallback
  families, as before its files arrive.

## Consequences

- The language stays 0.2: `font` is new, and `fontSize` and `fontWeight` outside free diagrams
  were errors before. No stored picture, model JSON or visual reference changes; the corpus, the
  acceptance corpus and the gallery gain typography sheets.
- New public surface: `BundledFamily.group` and `.license`, `FONT_GROUPS`, `FamilyInfo`,
  `FontLibrary.families()`, `TEXT_STYLE_PROPERTIES`, `TEXT_PROPERTIES`, `TEXTLESS_KINDS`,
  `TextFont`, `fontRole`, `textFont`, `writtenStack`, `TextItem.stack`, `writtenScale`,
  `pillText`, `MessageText.weight` and `.font`, `StickyText.font`, the protocol's `font` field type,
  `InspectorField.list`, `FontOption`, `listFonts`, `fonts` and `stepTextSize`, the canvas commands
  `growText` and `shrinkText`.
- `assets list` starts with the bundled fonts; the project's table is "Project fonts".
- The VS Code extension and the playground's assets are 3.9 MB larger; the playground's startup
  set is unchanged.
