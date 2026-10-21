## MODIFIED Requirements

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
