## ADDED Requirements

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
Overlays (particles and halos) SHALL have opacity 0 outside their keyframes, and dashes SHALL be
set only inside keyframes, so the picture is the static drawing before a delay, after the last
cycle and where CSS animation is unsupported. `@media (prefers-reduced-motion: reduce)` SHALL stop
every animation.

#### Scenario: Reduced motion
- **WHEN** the animated SVG is shown with reduced motion requested
- **THEN** no effect runs and the drawing equals the static export

### Requirement: Same states as frames
The animated profile and `sceneAt` SHALL describe the same states: particle fractions, dash offsets
and halo scale and opacity at any time t SHALL be equal in both.

#### Scenario: Matching phase
- **WHEN** an effect has `duration 1s` and `particles 2`
- **THEN** the second particle's keyframes start at offset 50 %, as `sceneAt` places it
