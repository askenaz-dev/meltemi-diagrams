## ADDED Requirements

### Requirement: Motion options of export
`meltemi-diagrams export` SHALL accept `--motion static|animated` (default `static`) and
`--at <time>` (`ms` or `s`). `static` SHALL write the drawing without effects, as before;
`animated` the animated SVG profile; `--at` the frame at that time. `--at` with `--motion
animated`, a negative time or a malformed time SHALL be a usage error (exit 2). Diagrams without
effects SHALL export identically in every mode.

#### Scenario: Animated export
- **WHEN** `mdg export sheet.meltemi --motion animated` runs on a sheet with a flow effect
- **THEN** the written SVG contains the keyframes and exit is 0

#### Scenario: A frame
- **WHEN** `mdg export sheet.meltemi --at 600ms --stdout` runs on a sheet with a pulse effect
- **THEN** the printed SVG has the halo at the scale and opacity of phase 0.6
