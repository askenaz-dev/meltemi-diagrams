# animated-svg Specification

## Purpose
The animated SVG profile: an explicit CSS subset whose fallback is the static picture, with the same states as frames.
## Requirements
### Requirement: Animated SVG subset
`animatedScene(scene, plan)` SHALL return a scene whose `styleSheet` holds CSS keyframes and whose
items carry classes, using only `opacity`, `offset-path` and `offset-distance`,
`stroke-dasharray` and `stroke-dashoffset`, and `transform: scale` with `transform-box: fill-box`,
with `linear` timing, `animation-delay` for delays, `animation-iteration-count` for repeats and no
fill mode. The SVG renderer SHALL write the style sheet in one `<style>` element and the classes as
`class` attributes. The result SHALL contain no scripts and no SMIL elements.

#### Scenario: One flow
- **WHEN** a diagram with `animate pay { effect flow }` is exported with the animated profile
- **THEN** the SVG has a `<style>` with `@keyframes`, a particle element whose class gives it the
  relation's `offset-path`, and no `<script>`

### Requirement: Static fallback and reduced motion
Overlays (particles, halos and traces) SHALL have opacity 0 outside their keyframes, and dashes
SHALL be set only inside keyframes, so the picture is the static drawing before a delay, after the
last cycle and where CSS animation is unsupported. `@media (prefers-reduced-motion: reduce)` SHALL
stop every animation.

#### Scenario: Reduced motion
- **WHEN** the animated SVG is shown with reduced motion requested
- **THEN** no effect runs and the drawing equals the static export

#### Scenario: Trace before its delay
- **WHEN** a diagram with `animate pay { effect trace; delay 2s }` is shown before 2 s
- **THEN** the trace overlay inside `pay`'s group has opacity 0 and `pay` looks as in the static
  export

### Requirement: Same states as frames
The animated profile and `sceneAt` SHALL describe the same states: particle fractions, dash offsets,
halo scale and opacity, and a trace's dash offset, dot position and opacity at any time t SHALL be
equal in both.

#### Scenario: Matching phase
- **WHEN** an effect has `duration 1s` and `particles 2`
- **THEN** the second particle's keyframes start at offset 50 %, as `sceneAt` places it

#### Scenario: Matching trace
- **WHEN** a relation 200 px long has `animate r { effect trace }`
- **THEN** its keyframes take the dash offset from 200 at 0 % to 0 at 80 % and the opacity from 1
  at 80 % to 0 at 100 %, as `sceneAt` draws it

