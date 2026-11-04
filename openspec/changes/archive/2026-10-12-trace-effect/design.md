## Context

Effects are planned by `planMotion` (`packages/motion/src/plan.ts`) against the drawn scene and
drawn two ways that must agree: frames (`sceneAt`, `frames.ts`), used by the HTML player, PNG and
PDF at a time and the videos, and the animated SVG profile (`animatedScene`, `css.ts`), used by the
canvas preview and `--motion animated`. Pulse draws a glow over a relation's track; flow moves
particles along it with CSS motion paths; dash moves the dash of the line itself.

Stories already draw a trace (`storyOverlays` in `story.ts`): a polyline of the track cut at the
progress, in the accent colour, `width + 2` wide, with a dot of radius `width + 3` at its head,
inserted into the relation's group before its label. Stories are never exported as animated SVG,
so that drawing has no CSS counterpart.

## Goals / Non-Goals

**Goals:**

- A looping effect on relations that fills the arrow from start to end and starts again, looking
  like the story trace.
- The same state in frames and in CSS at every instant.

**Non-Goals:**

- Traces around boxes (their outlines have no length helper; the owner asked for arrows).
- Changing the story `trace` action.

## Decisions

### One cycle: fill, then fade

The phase p of a cycle (0 to 1, linear) gives the grown fraction `g = min(1, p / 0.8)` and the
opacity `1` until 0.8, then `(1 − p) / 0.2`. The fade makes the restart read as a new pass rather
than a flicker; 80/20 keeps most of the cycle on the travel. Alternatives: an instant reset (a
visible jump), or a hold at full then reset (two visible states with no transition).

### Drawn with a dash, in frames and in CSS

The overlay is the whole track as a polyline with `stroke-dasharray: L L` and
`stroke-dashoffset: L × (1 − g)`, where L is the track's length rounded to hundredths. With CSS the
same values go into per-effect keyframes (`0% → 80%`: offset L → 0; `80% → 100%`: opacity 1 → 0),
linear, so both renderers give equal numbers at every t. Frames could cut the track instead (as
stories do), but then the two representations would differ in form and in rounding. The keyframes
are per effect because L differs per relation, as flow keyframes already differ per particle.

### The head dot rides the track

Frames place the dot at `pointAlong(track, g)`. CSS moves it with `offset-path` and
`offset-distance` (0 % to 100 % until 80 %, then held) inside the `@supports (offset-path …)` block
that particles use; where motion paths are unsupported the dot stays invisible and the line still
fills. `direction reverse` reverses the track's points for both, so the keyframes stay the same.

### Inside the relation's group, under the label

As in stories, the overlay goes into the relation's group before its label group, so labels stay
readable and the highlight sits on its arrow (pulse glows and particles go into the top-level
motion group). Overlays start at opacity 0 and are made visible only by keyframes, so the static
picture is unchanged before a delay, after the last cycle, with reduced motion and without CSS.

### Accent by default

Flow, dash and pulse default to the target's stroke; a trace in the line's own colour would be
invisible on it, so its default colour is the theme's `accent` (else `#1f6feb`), like the story
trace. `color` overrides it.

### Duration and token

The default is 1500 ms, a little slower than flow, because a fill is read rather than glanced at.
`traceDuration` joins the theme's duration tokens; the planner resolves written duration, then the
theme's, then the constant, as for the others.

### Relations only, its own channel

Like flow, a trace targets relations (sequence messages included); a trace on a box is
`animate.invalid-target` naming what it accepts. The conflict rule is per effect, so a trace
combines with flow, dash and pulse on the same relation. While a story traces a relation it
already suspends that relation's effects, the trace included.

## Risks / Trade-offs

- [CSS keyframes per effect grow the style sheet] → one rule and one keyframe set per traced
  relation, a few hundred bytes each.
- [Round line caps show a dot at the start of an empty dash] → at offset L nothing is drawn: the
  dash starts beyond the track's end.
- [A trace hides part of the arrowhead] → the overlay follows the track, which ends at the head's
  base, so the head stays visible.
