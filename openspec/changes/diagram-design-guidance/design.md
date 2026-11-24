# Design

## Context

See proposal.md for the motivation. What shapes the approach:

- The canonical skill is `skills/meltemi-diagrams/` (`SKILL.md`, 298 lines and 21 KB, eleven
  references, six examples); `pnpm skills:sync` copies it and `packages/render/test/skills.test.ts`
  holds it to 500 lines, a 1,024-character description and equal copies. The local plugin bundle
  (`scripts/local-agent-plugins.mjs`) takes every file of the folder, so a new reference travels
  with it. The built-in assistance reads six language references (`scripts/assist-guide.mjs`).
- The review step today reads "Review the SVG" and lists four checks; the export already prints
  the composition warnings. A PNG needs an installed Edge or Chrome (`packages/capture`), and the
  MCP tool `preview` draws one with its own rasteriser, with no browser.
- Layout problems reach every profile, the command line, the canvas and the MCP tools as
  diagnostics: `layoutDiagram` runs `checkComposition` and `auditLabels` over the finished scene
  (`packages/layout/src/layout.ts`), and messages live in `packages/layout/src/messages/`.
- `renderSvg` (`packages/render/src/svg.ts`) writes `<title>` and `<desc>` and no `role`. It is
  called by the exports and the review of `packages/editor`, by the player's frames and by the
  canvas's story view.
- The reviewed skill is `cathrynlavery/diagram-design` (MIT, read on 24 November 2026). Its agent
  writes SVG coordinates by hand and its checks are scripts over that SVG; what transfers is the
  written criteria, the plan stated before drawing, the look at a rendered picture with defects
  named, and the theme taken from a brand. No text of it is copied.
- Contrast of the built-in palettes, measured on 24 November 2026 with the tokens of
  `packages/layout/src/theme.ts`:

  | Theme             | ink on surface | muted on band | tag text on tag | accent on surface |
  | ----------------- | -------------- | ------------- | --------------- | ----------------- |
  | `technical.light` | 17.68          | 5.27          | 5.17            | 6.70              |
  | `technical.dark`  | 16.62          | 6.55          | 10.48           | 4.70              |
  | `editorial.light` | 16.58          | 5.47          | 16.58           | 6.70              |
  | `editorial.dark`  | 13.46          | 6.17          | 14.75           | 4.5027            |
  | `stage.light`     | 19.16          | 8.01          | 6.70            | 6.70              |
  | `stage.dark`      | 18.08          | 9.30          | 11.09           | 4.92              |

  Every text pair passes 4.5 to 1, the signals included (the lowest is 5.02). The hairlines
  (`line`, `bandLine`) measure 1.3 to 2.4 against their background: they are decoration, and this
  change checks texts only.

## Goals / Non-Goals

**Goals:**

- An agent with the skill chooses the profile, the amount and the emphasis of a sheet by written
  rules, and looks at the picture before it delivers.
- A text that cannot be read is a diagnostic wherever diagnostics appear.
- The guidance uses what the language has (groups, links, C4 views, `tag`, `theme`), so each rule
  is a statement the agent can write.

**Non-Goals:**

- Scoring a sheet's design, or diagnostics for taste (too many boxes, too many colours).
- Contrast of lines, borders and icons.
- A second rasteriser for the command line's `export`.

## Decisions

### The criteria are a reference; the workflow gains a table and a step

`SKILL.md` loads at every use, so it keeps what every sheet needs: the table of profiles, the plan
line and the review step. The rules with their examples go to `reference/design.md`, which the
workflow names at the two moments it matters: before writing (focus, density) and before
delivering (the removal test).

- Alternative: everything in `SKILL.md`. Rejected: about 120 more lines read on every use, near
  the 500-line limit, for rules that matter twice in a task.
- Alternative: a page of `docs/` only. Rejected: the agent reads the skill, not the documentation
  site.

The assistance guide (`GUIDE_PAGES`) stays as it is: it sends language references with each
request of the built-in assistance, whose answers are small edits of an existing sheet.

### Twelve boxes at a glance, groups up to thirty, a split beyond

The reviewed skill stops at nine nodes because its agent places each one by hand. Meltemi's
audience documents systems of ten to thirty components, ELK arranges them and groups make blocks
of them, so the amounts are: up to twelve boxes read at a glance; from thirteen, the sheet is
organised in groups so that it reads as three to six blocks; beyond thirty, an overview of the
groups and a detail sheet for each, joined by `link`, or the context, container and component
views of one model.

- Alternative: nine, as the reviewed skill. Rejected: it would split sheets the product exists to
  draw.
- Alternative: a warning of the engine past an amount. Rejected: a sheet of thirty boxes is valid,
  and a warning there would break the line that says success, `0 errors, 0 warnings`.

### The plan is said, not asked

Before writing, the agent says in one line the profile, the layout mode, the theme and what it
leaves out, and continues. The person can redirect on the next message; nothing waits.

- Alternative: ask and wait, as the reviewed skill does when the person is reachable. Rejected by
  the product's rule of a default over a block.

### The look is at a PNG or a preview, with defects named

The review step exports a PNG at scale 1 into a temporary folder (`export --format png --out`), or
calls `preview` through MCP, and reads the picture. It lists six defects, has the agent name the
ones it found and fixed or say why each does not apply, and prefers a change of structure
(direction, grouping, shorter labels, merged arrows) to moving coordinates. Two rounds at most.
With neither a browser nor MCP, the report says "validated, not looked at".

- Alternative: keep "review the SVG" and trust the composition warnings. Rejected: warnings catch
  overlaps, not a lopsided or crowded sheet, and an agent does not see SVG text as a picture.
- Alternative: a PNG without a browser from the command line, with the MCP's rasteriser.
  Rejected: two rasterisers behind one `--format png` would give two pictures of one sheet;
  `preview` already serves the case, and `agent-distribution` brings it with the plugin.
- Alternative: no rule to name defects. Rejected: without it the step is passed by saying "looks
  good"; naming, or saying why none applies, is what makes the look happen.

### Contrast is checked on what is drawn

`auditContrast(scene)` reads the laid-out scene: for each text, its colour, its size and weight,
and the fill behind it. That covers a theme's tokens, a class, a rule and a colour written in a
`style` with one check, in the five profiles, because all of them end in a scene.

- Alternative: check pairs of tokens when a theme is compiled. Rejected: the colours an agent gets
  wrong are the ones it writes in `style`, which never pass through a theme.
- Alternative: check in the canvas only. Rejected: agents and the command line never open it.

### The fill behind a text comes from paint order

Scene items are painted in order. The audit keeps the filled shapes painted so far with their
boxes; for a text, the fill is that of the last one that contains the centre of the text's box,
and the sheet's background when none does. A fill it cannot weigh (opacity below 1, a gradient, a
pattern, an image, a colour that is neither hexadecimal nor `rgb()`) leaves the text unchecked: a
warning the person cannot trust is worse than none.

- Alternative: draw the scene and sample pixels. Rejected: it needs a rasteriser in the layout
  package and depends on fonts' antialiasing.
- Alternative: blend translucent fills down to the background. Rejected for the first check: it is
  exact only for flat colours under flat colours, and silently wrong otherwise.

### The ratio and its least values are those of WCAG 2

Relative luminance and the ratio as WCAG 2 defines them; 4.5 to 1, and 3 to 1 for a text of 24 px
or more, or of 18.66 px or more at weight 700. The comparison uses the ratio before rounding, so
`editorial.dark`'s accent on its surface (4.5027) passes; the message prints two decimals.

- Alternative: APCA. Rejected: it is not part of a published standard, and people know 4.5 to 1.

### A warning, once for each pair of colours, with the fix

The code is `layout.low-contrast`, a warning like the composition checks. One wrong token would
otherwise repeat on every tag of a sheet, so each pair of text colour and fill is reported once
per diagram, on the first statement that draws it, with the count of the others. The hint is a
`color` statement with the theme's `ink` when it passes against that fill, else black or white.

- Alternative: an error. Rejected: it would stop the canvas and the export for a sheet that
  draws.
- Alternative: one warning per text. Rejected: noise that hides the other diagnostics.

### `role="img"` without identifiers

A titled scene without links gets `role="img"` on its root: browsers then name the image by its
`<title>` child and describe it by its `<desc>`. No `id` and no `aria-labelledby` are written, so
`<title>` keeps its bytes and several SVGs set inline in one page cannot clash. A scene with a
link gets no role, because the role would hide the link from assistive technology. `RenderOptions`
gains `role?: "image" | "none"` (default `image`), and the player, whose frames have selectable
parts, passes `none`.

- Alternative: `aria-labelledby` with identifiers on `<title>` and `<desc>`, as the reviewed skill
  does. Rejected: it changes two more elements of every export and needs identifiers unique across
  the SVGs of a page.
- Alternative: no role when the option is absent. Rejected: every export path would have to opt
  in, and the one that forgets ships an unnamed image.

### A theme from a brand is a recipe of the skill

The agent reads the brand with the tools it has and writes an ordinary `theme` block. The recipe
fixes what would otherwise vary between agents:

| From the brand                    | Token                                                           |
| --------------------------------- | --------------------------------------------------------------- |
| page background                   | `background`; it also picks the base (`*.light` or `*.dark`)    |
| card or panel background          | `surface` and `band`                                            |
| body text                         | `ink`                                                           |
| secondary text                    | `muted` and `connector`                                         |
| main brand colour (button, link)  | `accent`, `tag` and `bandLine`                                  |
| body and heading font             | `font`: the nearest bundled family, from a table in the section |
| code font                         | `mono`: the nearest bundled family                              |

The base is `editorial.*` (no frame) unless the person wants the Meltemi frame. The block goes
where the project keeps themes, or in the sheet's own file when there is one sheet; the sheet asked
for uses it; `project.json` changes only on request. The agent validates, fixes every
`layout.low-contrast` by changing the text colour and never the brand's colour, and reports each
value with its source and each approximation.

- Alternative: a command, `theme from <url>`. Rejected: the command line would fetch pages and
  carry heuristics for every site's markup, for a task the agent's own tools do.
- Alternative: named profiles in the person's home folder, as the reviewed skill keeps. Rejected:
  a theme of the project is a file under version control that every reader of the sheet has.

### Unresolved choices

None is left open: the amounts (twelve and thirty), the two rounds, the least ratios and the
default of the role are decided above with their alternatives.

## Interfaces and packages

- `packages/layout`: `contrast.ts` with `contrastRatio(a, b)`, `parseColour(text)` and
  `auditContrast(scene, options)`; `layoutDiagram` reports its problems as `layout.low-contrast`;
  `messages/en.ts` and `messages/es.ts` gain the message and the hint. Exported from the package
  for the tests of other packages.
- `packages/render`: `RenderOptions.role`; `renderSvg` writes the attribute.
- `packages/player`: frames pass `role: "none"`. `packages/editor` and `packages/canvas` keep the
  default; their callers are read one by one in the tasks.
- `skills/meltemi-diagrams/`: `SKILL.md` (table, plan line, review step, Reference),
  `reference/design.md` (new), `reference/themes.md` (the brand section), `reference/language.md`
  (the new code among the diagnostics), `reference/mcp.md` (the look through `preview`); copies by
  `pnpm skills:sync`.
- `packages/render/test/skills.test.ts`: the table against `DIAGRAM_TYPES`, the headings of
  `design.md`, its examples compiled, the six defects of the review step, the brand section.
- `docs/language/diagnostics.md`, `docs/language/layout.md`, `docs/agents.md` and their Spanish
  pairs; `CHANGELOG.md`; decision note `docs/decisions/0079-diagram-design-guidance.md`.

## Risks / Trade-offs

- [A default drawing of some profile warns, such as a gantt bar's label on a status colour] → the
  zero-target test runs over every profile and built-in theme before anything else is written; a
  failing pair is fixed in the theme or the drawing, never by lowering the least ratio.
- [People's sheets that printed `0 warnings` print one] → intended: the text is hard to read; the
  hint is a statement to paste, and the changelog names the new code.
- [The centre of a text lies outside the outline of a non-rectangular shape, such as a cloud] →
  the fill is still the shape's, since the text is laid out inside it; the tests include each
  shape with a label.
- [Every stored SVG gains `role="img"`] → snapshots, the gallery and the examples are written
  again in one task with `pnpm gallery`; PNG references keep their pixels.
- [An agent names a defect that is not there, to satisfy the rule] → the step accepts "none, and
  why for each", and the trial of the tasks reads the reports against the pictures.
- [The amounts are read as limits] → the reference says "reads at a glance", gives the system of
  twenty components as a single sheet, and no diagnostic counts boxes.
- [`SKILL.md` grows towards its limit] → the table and the step add about thirty lines; the rules
  live in the reference, and the size test keeps holding.
- [The other open change edits the same skill] → this change only adds requirements to
  `agent-skill`; `agent-distribution` changes how commands are named, and whichever is applied
  second writes its text with the names in force.
