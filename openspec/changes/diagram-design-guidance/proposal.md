# Proposal

## Why

An agent that follows the `meltemi-diagrams` skill writes a sheet that validates, and nothing tells
it whether the sheet reads well. The skill teaches the grammar and how to clear diagnostics; it
does not say which profile answers a request, how much a sheet can hold, where colour goes or when
a table says the same thing better. Its review step asks the agent to "review the SVG", which an
agent cannot look at, so the check that would catch a crowded or lopsided drawing is skipped.
Nothing warns when a text colour the agent chose cannot be read on its fill, a brand has no stated
path into a `theme`, and an exported SVG carries a title that assistive technology does not take
as the image's name.

The review of 24 November 2026 of a widely used agent skill for diagrams (design.md, Context)
showed that written criteria and an enforced look at the result are what make an agent's diagrams
publishable. Meltemi already has the engine that such a skill lacks; it lacks the criteria.

This is a post-1.0 authoring improvement outside `docs/roadmap-1.0.md`.

## What Changes

- The skill's workflow opens with a table from what the person wants to show to the profile that
  draws it, says when not to draw, and has the agent state its plan in one line and continue.
- A new reference, `reference/design.md`, holds the criteria: one or two focal elements, how much
  a sheet holds before it is grouped or split, colour for categories with a legend, short texts,
  arrangement, what to avoid and a removal test before delivery. Each rule names the statement of
  the language that applies it.
- The review step has the agent look at a picture: a PNG exported to a temporary folder, or
  `preview` through MCP. It names the defects to look for, asks the agent to name what it found
  and fixed, to restructure before moving coordinates, and to say so when it could not look.
- `reference/themes.md` gains a recipe for a theme from a brand: a website, a tokens file or
  colours the person gives become a `theme` block of the project, with the bundled family nearest
  to each font and a report of what was used and what was approximated.
- A new warning, `layout.low-contrast`, reports a text that cannot be read against the solid fill
  drawn behind it, in every profile, with a colour that passes as its hint. Built-in themes, the
  corpus, the templates, the gallery and the examples give none.
- An exported SVG with a title and no link carries `role="img"`, so its `<title>` is its name and
  its `<desc>` its description.

## Capabilities

### New Capabilities

- `text-contrast`: the warning for texts that cannot be read against what is drawn behind them,
  how the fill behind a text is found, its hint and the zero target.

### Modified Capabilities

- `agent-skill`: choosing the profile from the request, the design reference and its rules, the
  look at the drawing before delivering, and the theme from a brand.
- `flow-svg-export`: the image role of an exported SVG.

## Impact

Changes touch `packages/layout` (the contrast audit and its diagnostics, with messages in English
and Spanish), `packages/render` (`renderSvg` and its options), the hosts that call it
(`packages/editor`, `packages/player`, `packages/canvas`), the canonical skill with its copies,
the language and agents guides in both languages, and the stored SVG snapshots, the gallery and
the examples, which gain one attribute. No new dependency, statement, property or tool; a sheet
that validated before validates the same, and may print the new warning.

## Non-goals

- How the skill reaches a project (plugin marketplaces, the skills registry, the README, the
  `doctor` command): the `agent-distribution` change.
- New profiles or chart types: the language keeps `flow`, `sequence`, `c4`, `free` and `gantt`.
- A limit of the engine on how many elements a sheet holds: a system of thirty components is a
  valid sheet, and the amounts of the design reference are guidance.
- A command that reads a brand's website: the agent reads it with its own tools.
- Publication, deployment and production verification, which belong to `delivery`.
