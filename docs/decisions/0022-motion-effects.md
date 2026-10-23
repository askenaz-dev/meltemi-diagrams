# 0022. Motion effects on a deterministic clock

Status: accepted (motion-effects change, 11 October 2026)

## Context

The proposal makes animation part of 1.0. Animated arrows express activity with particles or a
moving dash; effects and stories are computed on the same clock so playing and exporting give
equivalent states; two incompatible animations on the same property are a diagnostic; animation
is the last layer of style precedence; no action moves a node; animated SVG is an explicit subset
with a static alternative and is not considered universally compatible. `animate` statements were
parsed and validated but never evaluated.

## Decision

- **Three effects, three channels.** `flow` draws particles along a relation, `dash` moves a dash
  along a line or an outline, `pulse` grows and fades a halo (a glow on relations). A target takes
  at most one effect per channel; a second one is `animate.conflict`. Each effect has `duration`,
  `repeat`, `delay` and, where they apply, `direction`, `particles` and `color`, with defaults per
  effect; `effect` is required.
- **One clock, linear curves.** For delay `d`, duration `D` and `n` cycles, the phase at time `t` is
  `((t − d) mod D)/D` inside `[d, d + n·D)` and the target is static outside it. Every curve is
  linear, so the CSS of the animated profile and the frames computed in code agree exactly, and
  the frame at an instant never depends on the speed of the machine.
- **A separate, pure package.** `@meltemi/diagrams-motion` plans the effects against the drawn
  scene (relation tracks and element bounds, which the layout now records) and returns either the
  scene at a time (`sceneAt`) or the scene with a style sheet and classes (`animatedScene`). The
  CLI, the editor and, later, the player and the video exporter share it.
- **CSS, not SMIL or scripts.** The animated profile uses CSS keyframes on opacity, motion paths,
  dash offsets and scale. Overlays carry `opacity="0"` as an attribute, so a viewer without CSS
  animation, without motion paths (`@supports`), or asking for reduced motion shows the static
  picture.
- **Static by default.** Exports draw no effects unless asked (`--motion animated` or `--at`), so
  documents and slides never carry animation by accident.

## Alternatives considered

- **SMIL `<animateMotion>`.** Wider support in old viewers, but it cannot honour reduced motion and
  mixes timing into the markup; CSS keeps one style sheet with a clean fallback.
- **Eased curves.** Easing would read better, but CSS easing and code would have to match to the
  last decimal; linear curves make equivalence exact.
- **Effects moving or scaling boxes.** Ruled out by the proposal: composition checks hold for every
  frame because geometry never changes.

## Consequences

- Stories (change 14) suspend a relation's local effect while they trace it, on the same clock.
- Video exports (change 17) evaluate `sceneAt` per frame and will need an explicit length for
  effects that repeat forever.
- Particles and halos take the theme's accent and particles ride under their label since
  [decision 0055](0055-export-defaults-and-visible-effects.md), which also gives endless effects a
  default length.
