# 0036. Arrow ends and connector shapes

Status: accepted (connector-ends-and-shapes change, 12 October 2026)

## Context

Testing 1.1, the owner found the arrows limited next to draw.io and Excalidraw: a head only at the
target, three heads, solid or dashed lines, sharp corners, and every choice made from a text list.
They asked to set both ends of an arrow, to choose heads and line types by their pictures, and for
more arrow types, rounded ones included. The Mermaid and PlantUML importers approximated two-way
arrows, circle and cross ends, inheritance, composition and crow's feet for the same reason.

## Decision

- **Two-way arrows are syntax.** `<->` and `<-->` join `->` and `-->` in flow, free and sequence
  diagrams; they draw the target's head at both ends. `<-` alone stays invalid, so a relation is
  always written from its source, and model relations stay `->`.
- **The start head is a style.** `arrowtail`, as DOT names it, takes the values of `arrowhead`.
  Without it a relation has no start head, or the end's head when written two-way, as `-->` sets
  a line that `line` can override.
- **Fifteen heads, by name.** The filled and hollow triangle, diamond and circle, the open V, a
  bar, a cross, and the crow's-foot ends of ER diagrams (`many`, `oneOrMany`, `onlyOne`,
  `zeroOrOne`, `zeroOrMany`), all single camel-case words like every value of the language.
- **One geometry for every head at either end.** The layout computes the head on the line and
  trims the line where the head needs it; the start head is the same geometry on the reversed
  line, and Bézier connectors are trimmed at both ends. Heads are drawn after the line, so the
  moving dash still finds the line first.
- **Rounded corners are sampled into the polyline.** `corners rounded` replaces each bend by a
  quadratic curve 10 px from it, sampled into the connector's points, so labels, checks, gaps
  under group titles, the label audit and motion keep working on a polyline.
- **Dotted lines** are round dots spaced by the line's width; scene items carry `dotted` as a
  value of their dash.
- **The strip draws pictures.** Fields carry a `glyphs` family; the canvas draws each value from
  its own table and falls back to a select for fields it has no pictures for.

## Alternatives considered

- **Only a style for both ends.** Enough for the canvas, but `a <-> b` is what people write in
  Mermaid and PlantUML, and the importers would have had to name and style every such relation.
- **`startArrowhead` and `endArrowhead`.** Clearer pairs, but `arrowhead` is already the end's
  head in every file; `arrowtail` adds one property and keeps them working.
- **Rounded corners as path curves.** Exact, but connectors would stop being polylines for every
  consumer that reads them; eight samples a corner are indistinguishable at diagram scale.
- **Hollow shapes filled with the background.** They would hide the line under them, but show a
  wrong colour over group bands; stopping the line at their back works on any background.

## Consequences

- Additive within language 0.2; existing files and drawings are unchanged.
- Every relation in the model JSON gains `twoWay`; the version stays 0.1 since no existing field
  changes.
- The importers keep two-way arrows, circle and cross ends, UML heads and crow's feet that they
  used to approximate.
