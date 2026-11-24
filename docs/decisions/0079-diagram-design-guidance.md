# 0079 — Design guidance for agents, readable text and named pictures

## Context

Agents following the `meltemi-diagrams` skill wrote sheets that validated but did not always read
well: the skill taught the grammar and the diagnostics, not which profile answers a request, how
much a sheet holds or where colour goes, and its review step asked the agent to "review the SVG",
which an agent cannot see. A review on 24 November 2026 of a widely used agent skill for diagrams
(`cathrynlavery/diagram-design`, MIT) showed that written criteria and an enforced look at a
rendered picture are what make an agent's diagrams publishable. Nothing reported a text colour
that cannot be read on its fill, and exported SVG carried a `<title>` that assistive technology did
not take as the picture's name.

## Decision

- The skill's workflow opens with a table from what the person wants to show to the profile, its
  reference and an example; it says when a table or a sentence is the better answer, and has the
  agent say its plan in one line and continue without waiting.
- A new reference, `reference/design.md`, holds the criteria: one or two focal elements; up to
  twelve boxes at a glance, groups from thirteen, a split past thirty (an overview and linked
  detail sheets, or C4 views); colour with a legend; short texts; one direction; what to avoid;
  and a removal test before delivering. The amounts are guidance: no diagnostic counts boxes,
  because a system of thirty components is what the tool is for.
- The review step has the agent look at a PNG exported to a temporary folder, or at MCP's
  `preview`, never at the SVG's text; name six kinds of defect it found and fixed or why each does
  not apply; restructure before moving coordinates; stop after two rounds; and say "validated, not
  looked at" when it has nothing to look with.
- `reference/themes.md` gains a recipe for a theme from a brand: the sources, the token each value
  becomes, the base theme, the nearest bundled family for each kind of font, where the block goes,
  and a report of what was used and approximated. `project.json` changes only when asked.
- `layout.low-contrast` reports a text whose colour against the fill painted behind its centre
  is under 4.5 to 1 (3 to 1 for 24 px, or 18.66 px and bold), with WCAG 2's ratio compared before
  rounding. The fill comes from paint order; translucent fills, gradients, patterns, images and
  colours that are neither hexadecimal nor `rgb()` leave the text unchecked. Each pair of colours
  is reported once per diagram, on the first statement in source order, counting the others; the
  hint is the theme's `ink` when it passes, else black or white.
- `renderSvg` writes `role="img"` on a titled picture without links. Hosts that make the parts of
  the drawing selectable (the canvas, the player and its catalog pages) ask for no role.

## Fixes found by the zero target

- The built-in class `c4_person` pairs the fill `accentEnd` with the text colour `tagText`. In the
  three light palettes that is white on `#0891B2`, 3.68 to 1, in every C4 sheet of the corpus, the
  gallery and the example. Changing `accentEnd` would also change the Meltemi mark's gradient, and
  no single token is dark in light themes and light in dark ones. The style resolver now gives an
  element of a C4 view whose fill and text colour both come from its built-in class a readable
  text colour: the class's own when it passes, else the theme's `ink`, else black or white. Light
  themes draw persons' texts in `ink` (4.80, 4.50 and 5.20 to 1); dark themes keep `tagText`. A
  fill or colour written by the person is kept and reported.
- Sheets that write their own light fills (the gallery's roadmap, typography and delivery
  pipeline) warn when drawn in a dark theme, as they should: the all-themes target covers the
  sheets drawn with tokens alone.

## Alternatives considered

- The criteria in `SKILL.md` itself: about 120 more lines on every use, near its limit, for rules
  that matter twice in a task.
- Nine boxes as the limit, as the reviewed skill keeps: it places each box by hand, while ELK and
  groups make thirty readable here; a warning past an amount would break the success line.
- Asking for the plan and waiting: the product takes a default over a block.
- A rasteriser in the command line for PNG without a browser: two rasterisers behind one format;
  `preview` already serves agents without one.
- Checking pairs of tokens when a theme compiles: the colours agents get wrong are written in
  styles. Sampling pixels: needs a rasteriser in the layout and depends on antialiasing. APCA: not a
  published standard.
- `aria-labelledby` with identifiers, as the reviewed skill writes: two more changed elements and
  identifiers that must be unique across the SVGs of a page.
- A `theme from <url>` command: the agent's own tools read pages, and heuristics for every site's
  markup do not belong in the command line.

## Consequences

Sheets that printed `0 warnings` may print `layout.low-contrast`, with a statement to paste. Every
stored SVG gains one attribute; C4 sheets in light themes change the colour of persons' texts, so
their PNG, PDF, video and visual references were drawn again. The skill grows by about thirty
lines and one reference, which the local plugin carries with the rest of the folder.
