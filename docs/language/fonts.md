# Fonts and text measurement

[Español](../es/language/fonts.md)

Meltemi Diagrams measures text with real fonts before laying out a diagram, so boxes fit their
labels and the exported file looks the same on every machine.

## Bundled fonts

| Family        | Used by                                                         | Measured with                    | Embedded from             |
| ------------- | --------------------------------------------------------------- | -------------------------------- | ------------------------- |
| Inter         | body text of the `technical.*`, `stage.*` and `sketch.*` themes | complete font (`inter-ui`)       | Fontsource script subsets |
| IBM Plex Sans | body text of the `editorial.*` themes                           | complete font (`@ibm/plex-sans`) | Fontsource script subsets |
| Cascadia Mono | tags and monospace text of every theme                          | Fontsource script subsets        | Fontsource script subsets |

Weights 400, 500, 600 and 700 are bundled. All fonts use the SIL Open Font License 1.1, which allows
bundling them and embedding them in documents (`THIRD_PARTY_LICENSES.md`).

The `sketch.*` themes paint their strokes by hand but write their text in Inter, measured and
embedded as in the technical themes, until a hand font is bundled; their text is never drawn with
the sketched strokes, so it stays readable at label size.

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
