# 0035. The trace effect

Status: accepted (trace-effect change, 12 October 2026)

## Context

Testing 1.1, the owner liked `pulse` and asked for an effect like it that runs along an arrow: a
highlight that travels from the start of the arrow to its end until the whole arrow is lit, then
starts again. Stories already draw such a highlight with their `trace` action, but only once and
only on a story's clock, so a plain diagram could not show it in its animated SVG, its HTML player
or its videos.

## Decision

- **`effect trace`** joins `flow`, `pulse` and `dash` in `animate`, with the story action's name
  and look: a line two pixels wider than the relation's, in the theme's accent by default, with a
  dot at its head, drawn inside the relation's group under its label.
- **One cycle is a fill and a fade.** The highlight grows from the start to the end during the
  first 80 % of the cycle, and the fully lit relation fades out in the last 20 %.
  `direction reverse` runs it from the end.
- **Relations only**, sequence messages and C4 relations included; a trace has its own channel,
  so it combines with the other effects.
- **The same numbers in frames and in CSS.** Both draw the track with one dash as long as the
  track and an offset that shrinks to zero; the CSS keyframes are per effect because the length
  differs per relation. The dot rides a motion path in CSS and is placed on the track in frames.
- **A theme token, `traceDuration`**, sets its default speed; without it a trace takes 1500 ms.

## Alternatives considered

- **Reusing `pulse` with a direction.** A pulse lights the whole target at once; a fill is a
  different state over time, and a separate effect keeps both simple to describe.
- **Cutting the track in frames, as stories do.** Equal on screen, but the two renderers would
  describe the state in different forms; one dash formulation keeps frames and CSS equal by
  construction.
- **Drawing the trace above the label.** It would cover the label's text; under it, the label
  stays readable and the highlight shows on both sides of it.
- **Traces around boxes.** Outlines of cylinders, diamonds and custom shapes have no length helper
  yet, and the request was about arrows.

## Consequences

- Additive within language 0.2: no file changes meaning and no drawing without `trace` changes.
- A trace on a short, labelled relation is mostly hidden by the label; the effect reads best on
  long connectors.
