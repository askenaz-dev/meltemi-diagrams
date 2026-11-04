## Why

The proposal makes animation part of the first public version: animated arrows express activity
with particles or a moving dash, local effects and stories are computed on the same deterministic
clock so playing and exporting produce equivalent states, two incompatible animations on the same
property are a diagnostic, the animation state is the last layer of style precedence, and SVG has
an animated profile that is an explicit subset with a static alternative. Today `animate` blocks
are parsed and validated (`effect`, `duration`, `repeat`) but nothing evaluates or draws them.
Roadmap change 13 asks for the effects, the scene state at any time t, conflict diagnostics, the
animated SVG profile and effect editing in the editor. Stories (14), the player (15) and the video
exports (17) build on this clock.

## What Changes

- **Language.** `animate <targets> { … }` takes `effect flow|pulse|dash` (required), `duration`,
  `repeat forever|<n>`, `delay`, `direction forward|reverse` (flow and dash), `particles 1..8`
  (flow) and `color`. Defaults per effect. Valid targets: `flow` on relations; `dash` on relations
  and boxes (a moving outline); `pulse` on elements, relations, notes and fragments. New
  diagnostics `animate.missing-effect`, `animate.invalid-target` and `animate.conflict` (two
  effects of the same channel on one target, across statements), replacing the duplicate-property
  error that blocked two different effects on one target.
- **New package `@meltemi/diagrams-motion`** (pure, deterministic): `planMotion(diagram, scene)`
  resolves the effects against the drawn scene; `sceneAt(scene, plan, t)` returns the scene at
  time t (particles placed along the connector, dash offsets, pulse halos), identical for every
  run; `animatedScene(scene, plan)` returns the scene with a CSS style sheet and classes for the
  animated SVG profile; `motionDuration(plan)` gives the finite length or `null` for endless
  effects.
- **Scene.** Relation groups carry their drawn track and element groups their bounds; scene items
  may carry a class and the scene a style sheet, which the SVG renderer writes. Without effects
  the SVG output is unchanged.
- **Animated SVG profile.** CSS keyframes on opacity, `offset-distance`, `stroke-dashoffset` and
  scale only, linear timing, `prefers-reduced-motion` honoured; the static picture is what shows
  when animation is unsupported or reduced. `meltemi-diagrams export --motion animated` writes it;
  `--at <time>` writes the frame at that instant; the default stays the static drawing.
- **Editor.** Edit operations `setAnimation` and `removeAnimation` (splitting shared statements);
  an Effects section in the inspector for elements, relations and named notes and fragments (flow,
  dash and pulse with their properties); a **Play effects** toggle on the canvas that previews the
  animated profile; completion, hover and diagnostics for every new property.
- **Docs.** `docs/language/motion.md`, grammar, diagnostics, SVG export, model JSON, editor guide,
  skill reference; decision 0022.

## Capabilities

### New Capabilities

- `motion-effects`: the `animate` language: properties, defaults, targets, channels and their
  diagnostics.
- `motion-clock`: the deterministic clock, the motion plan and the scene at time t.
- `animated-svg`: the animated SVG profile and its static fallback.
- `motion-export`: `--motion` and `--at` on the command line.
- `motion-editing`: the edit operations, inspector section, canvas preview and language services
  for effects.

### Modified Capabilities

None.

## Impact

- New package `packages/motion` depending on model and layout; render writes classes and style
  sheets; the CLI, the editor and the VS Code extension use motion.
- `AnimationEntry` gains `delayMs`, `direction`, `particles` and `color`; JSON interchange
  follows.
- Corpus: valid motion sheets with snapshots, invalid files for the three new codes, frame and
  animated SVG fixtures.
