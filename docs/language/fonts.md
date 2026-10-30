# Fonts and text measurement

[Español](../es/language/fonts.md)

Meltemi Diagrams measures text with real fonts before laying out a diagram, so boxes fit their
labels and the exported file looks the same on every machine.

## Bundled fonts

| Family        | Used by                                             | Measured with                    | Embedded from             |
| ------------- | --------------------------------------------------- | -------------------------------- | ------------------------- |
| Inter         | body text of the `technical.*` and `stage.*` themes | complete font (`inter-ui`)       | Fontsource script subsets |
| IBM Plex Sans | body text of the `editorial.*` themes               | complete font (`@ibm/plex-sans`) | Fontsource script subsets |
| Patrick Hand  | body text of the `sketch.*` themes                  | Fontsource script subsets        | Fontsource script subsets |
| Cascadia Mono | tags and monospace text of every theme              | Fontsource script subsets        | Fontsource script subsets |

Inter, IBM Plex Sans and Cascadia Mono are bundled in weights 400, 500, 600 and 700. Patrick Hand,
a hand font, has one weight (400) and the Latin, Latin Extended and Vietnamese scripts: every
weight is measured, outlined and embedded with it, and an embedded rule covers 400 to 700 so that
a browser draws a heavier label with the same file, not in a synthesized bold. All fonts use the
SIL Open Font License 1.1, which allows bundling them and embedding them in documents
(`THIRD_PARTY_LICENSES.md`).

The `sketch.*` themes paint their strokes by hand and write their text in Patrick Hand, with Inter
after it in the stack: a character that Patrick Hand lacks, such as Greek or Cyrillic, is measured
with Inter, and outlined with it in `outlined` exports (an embedded export leaves it to the
viewer's fallback). Their text is never drawn with the sketched strokes, so it stays readable at
label size.

## Popular families

Thirteen more families are bundled for the text a person chooses, so that a heading, a note or a
code box can take a face people know from slides and the web. They come from their Fontsource
packages under the SIL Open Font License 1.1 and are measured, embedded and outlined like the four
above, from their script subsets.

| Group       | Families                                             | Weights                                   |
| ----------- | ---------------------------------------------------- | ----------------------------------------- |
| Sans        | Roboto, Open Sans, Lato, Montserrat, Poppins, Nunito | 400 to 700; Lato 400 and 700              |
| Serif       | Merriweather, Lora, Playfair Display                 | 400 to 700                                |
| Monospace   | Roboto Mono, Source Code Pro                         | 400 to 700                                |
| Handwriting | Caveat, Comic Neue                                   | Caveat 400 to 700; Comic Neue 400 and 700 |

A weight a family lacks is measured, outlined and embedded with its nearest weight (the heavier on
a tie), and the embedded rule covers the weights asked for, so a browser never draws a synthesized
bold. The monospace families have no ligatures, so a width measured from the advances is the
width drawn. `meltemi-diagrams assets list` prints every bundled family with its group, weights
and licence.

## The font, size and weight of a text

Three style properties set the text of anything that draws text, in every profile: nodes,
decisions, data stores, groups (their title), notes, tags, relations and free lines (their
label), free boxes, texts and stickies, sequence participants, messages, notes and fragments, and
C4 entities and relations. Icons, images and pens draw no text and refuse them.

```text
style api { font "Roboto"; fontSize 16; fontWeight 500 }
rule note { font "Caveat" }
```

- `font "<stack>"` is a quoted CSS font stack. The text is measured with the first bundled or
  project family of the stack alone; a stack with none (`font "Comic Sans MS"`) is measured with
  estimates and reported once per diagram as `layout.unmeasured-font`. The exported text names the
  written stack followed by the theme's, so a viewer without the family falls back as the theme
  does.
- `fontSize` is a number from 6 to 160 and `fontWeight` one of 400, 500, 600 and 700. Without them
  a text keeps its theme's size and weight: labels `labelSize` at `labelWeight`, free texts 1.6
  times that, stickies 1.2 times at 400, group titles `groupTitleSize`, notes `noteSize` at 400,
  tags `tagSize` at 500 in the mono font, relation labels `relationLabelSize` at 500 (400 on
  sequence messages), a fragment's operator at 600.
- A written size scales what the theme's token scales: a box's description at the theme's ratio
  of description to label, a pill's height and padding, a tag's pill, a note's lines, a group's
  title band. Boxes, heads, notes and pills without `size` grow to hold their text; a written
  `size` that is too small is `layout.text-overflow` with a size that fits.

The canvas sets them from the strip's Text group and its font picker, and Ctrl+Shift+. and
Ctrl+Shift+, step the size of the selection ([editor guide](../editor.md)).

A theme's `font` and `mono` tokens are CSS font stacks. The first family of the stack that is bundled
is used for measuring (`"Inter", "Segoe UI", sans-serif` measures with Inter). A character the
family lacks is measured with the next bundled family that has it, as browsers do; arrows such as
`→` in Cascadia Mono text use Inter.

## What the layout does with the measurements

- Boxes without `size` grow to fit their label and description lines with the theme `padding` on
  each side (16 px in `technical.*`), and to fit several description lines in height.
- Groups without `size` grow to fit their title.
- Tags, notes and relation label pills are as wide as their measured text plus their padding.
- Text baselines are the text centre plus half the cap height of the font, so text sits optically
  centred.
- An explicit `size` that leaves less than 6 px between the text and an edge is
  `layout.text-overflow` (warning), with a hint giving a width that fits. Text is never scaled down.
- A theme font with no bundled family, or characters no bundled font has (emoji, CJK), give one
  `layout.unmeasured-font` (info) per diagram. That text is measured with estimates.

Hosts without fonts, such as a test or a minimal script, can lay out with `estimateMeasurer`, which
estimates widths from character classes.

## Project fonts

Fonts in a project's `assets/fonts/` (WOFF2, WOFF, TrueType or OpenType) join the bundled ones for
that project's exports, under the family, weight and style each font declares, and need a licence
in `assets/licenses.json`. A theme uses them by name (`font "'Company Sans', sans-serif"`). The
`embedded` policy writes the whole file, without `unicode-range`. A font whose embedding permission
(`OS/2 fsType`) is restricted measures text but is never embedded or outlined: exports name it, and
`asset.font-restricted` (warning) says so. See [assets.md](assets.md).

## Font policies in exports

| Policy     | What the SVG contains                                                                                            | Use it for                                   |
| ---------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `embedded` | `@font-face` rules with the bundled subset files as data URIs, limited by `unicode-range` to the characters used | documentation, web pages, GitHub (default)   |
| `outlined` | every text as a `<path>` from the glyph outlines, with `aria-label`                                              | presentations and office applications        |
| `system`   | font names only; viewers use the first installed font                                                            | the smallest files, when fonts are installed |

```bash
pnpm mdg export sheet.meltemi --fonts outlined
```

In `embedded` files, characters only the complete fonts have (arrows, for example) are not part of
the small subsets, so viewers draw them with a fallback font. Their width is still measured exactly.
`outlined` files draw every character with the bundled outlines.

## For tools

`@meltemi/diagrams-fonts` provides `FontLibrary`, built from a reader of the font package files;
`addFont(data, source)` registers a project font and `embeddable(family)` tells whether its text may
be embedded or outlined.
`createNodeFontLibrary()` reads them from `node_modules`. It implements the layout's
`TextMeasurer` (`width`, `capHeight`, `knows`, `uncovered`) and the renderer's `FontProvider`
(`family`, `faces`, `outline`).
