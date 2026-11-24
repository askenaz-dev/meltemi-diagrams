# Design guidance for agents — 24 November 2026

Local implementation of the `diagram-design-guidance` change, on main `b172d55`, on Windows with
Node 24.15.0, pnpm 10.33.2 and Edge 158. No commit, publication or deployment was made when this
note was written.

## What was built

- The skill's workflow chooses the profile from a table, says when a table or a sentence answers
  better, and has the agent say its plan in one line and continue. `reference/design.md` holds the
  criteria and the removal test. The review step looks at a PNG in a temporary folder or at MCP's
  `preview`, names six kinds of defect, and says "validated, not looked at" when nothing can be
  looked at. `reference/themes.md` makes a theme from a brand.
- `layout.low-contrast` in every profile, once per pair of colours, with a passing colour as the
  hint, in English and Spanish.
- C4 persons in the light themes draw their texts in the theme's `ink` (the built-in class gave
  white on `#0891B2`, 3.68 to 1).
- `role="img"` on titled SVG exports without links; the canvas and the player draw without it.

## Zero targets

- Every corpus sheet, project, acceptance sheet, template, example and gallery sheet: no
  `layout.low-contrast`.
- Every sheet of the gallery, the acceptance corpus and the templates that writes no colour of its
  own, in each of the eight built-in themes: none. Sheets that write their own light fills warn in
  the dark themes, as they should.
- Stored SVG: 34 corpus and project snapshots changed by the one attribute; the two C4 project
  views also by the person's text colour. The gallery and the purchase example were drawn again
  with `pnpm gallery`; only the C4 sheet's PNG and PDF and the example's C4 views, player and story
  videos changed in content. The other PDFs differed only by Edge's version and were kept.
- Visual regression: the seven C4 drawings with a person differed (0.08 % to 0.88 % of pixels, the
  persons' labels) and were recorded again with Edge 158; the other 34 matched their Edge 156
  references exactly.

## Trial with an agent

The skill was installed from this worktree with `mdg skill install --agent claude` in three empty
folders, with `mdg` running this worktree's sources. Claude Code 2.1.312 ran each request with
`claude -p`, allowed only `mdg`, file tools and, for the brand, WebFetch.

### "The calls … when a card payment is declined"

- Profile: `sequence`, four participants, the two outside services tagged `external`, eleven
  numbered messages with nested calls and `return`, and one note.
- It said what it left out (the card network hop, 3-D Secure, retries) and that the names are
  generic for want of code.
- It validated with no diagnostic and reported the picture checked for cut text, misplaced labels
  and crossing arrows: three of the six defects, not each one by name.
- The picture matches the report.

### "… in the colours of https://meltemi.dev"

- Profile: `flow`, four boxes in one row, the main path numbered, the API outlined in the accent,
  a dashed cached response.
- Theme: `extends "editorial.light"`, in the sheet's file, no project configuration. Its report
  names each source: the gradient from the mark the site serves, the page tokens from the family's
  design-system document because the site served no readable stylesheet, and Inter and Cascadia
  Mono as the site's own bundled families.
- Review: two layouts came out wrong (a cycle put the browser above the CDN); it moved to manual
  placement, then reported no cut text, no label away from its arrow, no arrow through a box and
  even gaps. Removal test: it dropped a "cache miss" tag and the response arrows, and said why.
- The picture matches the report.

### "Draw our e-commerce platform … 34 components"

- It split the platform as the design reference says: an overview of nine domain boxes and two
  people, and three detail sheets (storefront, order path, platform), each component on exactly
  one of them, each overview box linked to its sheet, the same colour for a domain on every sheet,
  and a `project.json` for the links.
- It listed its assumptions about the wiring (where carts live, the order of the checks) for the
  person to confirm.
- It reported looking at every picture and fixing two defects (misaligned apps, an order path too
  wide, placed again by hand in two rows), but did not go through the six kinds of defect. The
  pictures still show some it did not name: on the order path, the badge of step 8 sits beside the
  crossing of two arrows, so which one it numbers is unclear, and two event arrows run around the
  outside of the whole sheet; the overview is 4,568 pixels wide with long arrows back across it.

### The review step, changed and tried again

None of the three reports went through the six kinds of defect one by one, though each named
some. The step was changed from a sentence to a list, with "in your report take them one by one",
and the declined payment was asked again in a new empty folder. The second sheet is as good as the
first (the API inside an "Our platform" box, eight numbered messages, two notes), but its report
again sums up the look in one sentence: "checked the exported picture for cut text, stray labels
and crossings". The agent's own preference for a short final answer outweighs the skill's request
for the report's shape; the drawings themselves had no defect of the six in the two sequence
sheets and the brand sheet. What the reports do say is true of the pictures, and none claims a
look it did not take. The order path's ambiguous badge is a defect the review did not catch, and
no composition check covers it.

## Gates

- `pnpm typecheck`, `pnpm lint`: green.
- `pnpm test`: 11,702 passed and 1 skipped; the 4 tests of `local-operations` fail under Git
  Bash's `tar` and pass 8/8 from PowerShell, as before this change.
- `pnpm acceptance:visual`: 41/41 after the seven C4 references were drawn again.
- `pnpm player:test-browser` 46/46, `pnpm vscode:test-webview` 367/367,
  `pnpm playground:test-browser` 160/160.
- `openspec validate diagram-design-guidance --strict`: valid.
