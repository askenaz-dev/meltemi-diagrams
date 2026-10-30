## MODIFIED Requirements

### Requirement: Text fits its box
When an explicit `size` gives an element less width than its widest measured text line plus 6 px on each side, the layout SHALL report `layout.text-overflow` (warning) on the `size` statement. The message SHALL name the text, and the hint SHALL give `size <id> (<width>, <height>)` with the comfortable width (text plus the theme `padding` on each side, 16 px in `technical.light`). The same SHALL apply to a group with an explicit size and a wider title. Text SHALL never be scaled down. The text is measured at the element's written `fontSize`, `fontWeight` and `font` when it has them, so the check and the hint follow a larger or smaller text. When a theme font stack or a style's `font` stack has no bundled or project family, or text contains characters no bundled subset covers, the layout SHALL report `layout.unmeasured-font` (info) once per diagram, listing the font or the characters.

#### Scenario: Explicit size too small
- **WHEN** `size api (80, 56)` is set and the label `API Gateway` measures 79.66 px at 13 px weight 600
- **THEN** `layout.text-overflow` is reported on that `size` statement with the hint `size api (112, 56)`

#### Scenario: Unknown theme font
- **WHEN** a file theme sets `font "Comic Sans MS"` and a diagram uses it
- **THEN** `layout.unmeasured-font` (info) names `Comic Sans MS`, and the scene is produced with estimated widths

#### Scenario: Emoji in a label
- **WHEN** a label is `Deploy 🚀`
- **THEN** `layout.unmeasured-font` (info) lists `🚀`, and the box still fits the rest of the label

#### Scenario: Padding token
- **WHEN** the same `size api (80, 56)` is laid out with a theme that sets `padding 24`
- **THEN** the hint is `size api (128, 56)`

#### Scenario: A written size in a written box
- **WHEN** `size api (160, 56)` holds the label `API Gateway` with `style api { fontSize 32 }`
- **THEN** `layout.text-overflow` is reported on the `size` statement, its hint names a width that fits the label measured at 32 px weight 600 plus the padding, and the same label at `fontSize 13` reports nothing

#### Scenario: Unknown style font
- **WHEN** a flow diagram writes `style api { font "Comic Sans MS" }` under `technical.light`
- **THEN** `layout.unmeasured-font` (info) names `Comic Sans MS` once, the label of `api` is measured with estimates, and every other label is measured with Inter

## ADDED Requirements

### Requirement: Written text sizes and fonts in the drawing
The layout SHALL draw every text at its target's written `fontSize`, `fontWeight` and `font` (`style-classes-and-rules`, "Text properties in every profile"), and SHALL derive from the written size what it derives from the theme's token for that kind: a box's label lines 1.25 × the size apart and its description at `round(size × descriptionSize / labelSize)` with the description's line ratio; a relation's or free line's pill `18/11` of the size high with `12/11` padding and its technology line at the technology ratio of the size; a tag's pill `18/10.5` of the size high with the tag padding; a note's lines at the note scale's ratio; a titled group's band the larger of `groupHeader` and the title's line plus the band's spare room at the theme's title size. A box, head, note or pill without a written `size` SHALL grow to hold the measured text with the theme `padding`, in every layout mode, and its default size SHALL stay the theme's. A text item drawn from a target with a written `font` SHALL carry the written stack (`TextItem.stack`), measured with that stack alone, and the renderer SHALL write it before the theme's stack of the text's role (`svg-font-policies`). Nothing SHALL change for a target without the three properties.

#### Scenario: A larger node
- **WHEN** `api["Gateway Service"] { description "REST" }` without `size` is laid out under `technical.light` with and without `style api { fontSize 20 }`
- **THEN** the sized box is wider and taller than the 160 × 56 default, its label `<text>` has `font-size="20"`, its description `font-size="17"` (20 × 11 / 13 rounded), both lines lie inside the box, and the unsized box is the stored snapshot

#### Scenario: A taller tag and a taller pill
- **WHEN** `tag jwt "JWT"` has `style jwt { fontSize 14 }` and relation `pay` has `style pay { fontSize 14; fontWeight 600 }`
- **THEN** the tag's pill is `round(14 × 18 / 10.5)` high and as wide as `JWT` measured in Cascadia Mono 500 at 14 px plus the tag padding, and the label pill of `pay` is `round(14 × 18 / 11)` high with its text at weight 600

#### Scenario: A group title in a hand font
- **WHEN** `group backend "Backend"` has `style backend { font "Caveat"; fontSize 22 }`
- **THEN** the title `<text>` has `font-size="22"` and `font-family="Caveat, &quot;Inter&quot;, …"`, is measured with Caveat, and the band is taller than `groupHeader` by the title line's growth, with the children's interior starting below it

#### Scenario: A rule in every profile
- **WHEN** a C4 container view contains `rule container { fontSize 15 }` and a flow diagram `rule node { fontWeight 500 }`
- **THEN** every container's name is drawn at 15 px with its technology line scaled, and every flow node's label at weight 500, while decisions and data stores keep `labelWeight`

#### Scenario: A sticky and a text keep their defaults
- **WHEN** a free composition with a sticky, a text and a box, none styled, is laid out
- **THEN** the sticky's text starts at 1.2 × `labelSize` at weight 400, the text at 1.6 × `labelSize` and the box at `labelSize`, exactly as the stored snapshot

#### Scenario: Font on a pen
- **WHEN** a free composition contains `style sketch { fontSize 20 }` on a pen stroke
- **THEN** `prop.invalid-value` is reported on `fontSize` with the hint that it applies to targets that draw text, and the stroke is drawn unchanged
