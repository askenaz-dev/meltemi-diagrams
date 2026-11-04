## Context

- `animate` blocks compile into `AnimationEntry` (`target`, `targetKind`, `effect`, `durationMs`,
  `repeat`) for flow, free, sequence and C4 diagrams; the importers already write them. Nothing
  evaluates them, and a second `animate` statement on a target is `prop.duplicate` even when it
  asks for a different effect.
- The layout produces a `Scene` of groups (`role` element, relation, event…) with absolute
  coordinates; relations are drawn as a polyline, or a path with the sampled Bézier line kept by
  the layout. The SVG renderer writes the scene; the canvas shows that SVG.
- The proposal: effects and stories share one deterministic clock; playing and exporting give
  equivalent states; two incompatible animations on one property are a diagnostic; the animation
  state is the last layer of style precedence; animated SVG is an explicit subset with a static
  alternative; no action moves a node.

## Goals / Non-Goals

**Goals:** the three effects with their properties, conflicts and target rules; the scene at any
time t; the animated SVG profile; export flags; effect editing and preview in the editor.

**Non-Goals:** stories, scenes and the narrative suspension of local effects (change 14); the
player (15); video and GIF (17), where an endless effect will need an explicit export duration;
export profiles (16).

## Decisions

### D1. Properties, defaults and channels

| Property    | Values                                   | Default                         | Effects     |
| ----------- | ---------------------------------------- | ------------------------------- | ----------- |
| `effect`    | `flow`, `pulse`, `dash`                  | required                        | all         |
| `duration`  | time (`ms`, `s`), 100 ms to 60 s         | flow 1200 ms, dash and pulse 1 s | all         |
| `repeat`    | `forever` or 1 to 1000                    | `forever`                       | all         |
| `delay`     | time, 0 to 60 s                          | 0                               | all         |
| `direction` | `forward`, `reverse`                     | `forward`                       | flow, dash  |
| `particles` | 1 to 8                                   | 1                               | flow        |
| `color`     | colour or token                          | the target's stroke              | flow, pulse |

Each effect drives one channel: `flow` the particles, `dash` the stroke pattern, `pulse` the
halo. A target may have one effect per channel; a second effect of the same channel on the same
target, in any statement, is `animate.conflict` (error, pointing at both). `flow` targets
relations; `dash` relations and boxes (elements with an outline: nodes, decisions, data, notes,
tags, boxes, groups); `pulse` elements, relations and named notes and fragments. Anything else is
`animate.invalid-target`. A block without `effect` is `animate.missing-effect`. Properties that do
not apply to the block's effect are `prop.invalid-value`.

### D2. The clock

Time is in milliseconds from 0. For an effect with delay `d`, duration `D` and repeat `n`:
before `d` and from `d + n·D` on, the target is drawn as without effects; in between, the phase is
`((t − d) mod D) / D`. Every curve is linear, so CSS and frames agree exactly. `motionDuration`
is the largest `d + n·D`, or `null` when an effect repeats forever.

### D3. What each effect draws

- **flow:** `k` particles, circles of radius `max(3, width + 1.5)` in `color`, at fractions
  `(phase + i/k) mod 1` of the track's length (reversed with `direction reverse`), drawn above
  every relation.
- **dash:** the line or outline gets a dash of 8 and a gap of 6 and an offset of
  `−phase · 14` (`+` when reversed); outside its window the written line style applies.
- **pulse:** a halo above the target: for elements and events, the target's rounded bounds scaled
  by `1 + 0.15·phase` around its centre with stroke width 2 and opacity `0.7·(1 − phase)`; for
  relations, the track redrawn `width + 6` wide with opacity `0.5·(1 − phase)`.

No effect moves or resizes a box, so geometry and composition checks are those of the static
drawing.

### D4. Scene additions

Relation groups carry `track` (the drawn line, in scene coordinates, Bézier samples included);
element and event groups carry `bounds` (box and corner radius). Items may carry `className` and
the scene `styleSheet`; the SVG renderer writes them as `class` and one `<style>`. Static output is
byte for byte unchanged.

### D5. Package `@meltemi/diagrams-motion`

`planMotion(diagram, scene)` keeps the effects whose targets are drawn (C4 entity paths and
lifted relations included) with their defaults applied and the colour resolved from the drawn
stroke; `sceneAt(scene, plan, t)` returns a new scene; `animatedScene(scene, plan)` returns the
scene with the style sheet and the overlay items; `motionDuration(plan)`. Pure and synchronous,
so the CLI, the editor, the player and the video exporter share it.

### D6. Animated SVG profile

CSS animations only: `opacity`, `offset-path`/`offset-distance` (particles), `stroke-dasharray`
and `stroke-dashoffset` (dash) and `transform: scale` with `transform-box: fill-box` (halos),
`linear` timing, `animation-delay` for `delay`, `animation-iteration-count` for `repeat` and fill
mode `none`, so the static drawing shows before, after and wherever animation is unavailable.
Overlays have opacity 0 outside their keyframes. Multiple particles share keyframes shifted by
`i/k`, so one delay applies to all. `@media (prefers-reduced-motion: reduce)` stops every
animation. Everything is in one `<style>` element: no scripts, no SMIL.

### D7. Export

`meltemi-diagrams export --motion static|animated` (default `static`) and `--at <time>` (a frame,
for example `--at 1.5s`, never with `--motion animated`). Diagrams without effects export the same
in every mode.

### D8. Editing

`setAnimation { diagram, target, targetKind, effect, property?, value? }` makes sure the target has
an `animate` statement with that effect (one statement per target and channel; a shared
statement is split) and sets or removes one property; `removeAnimation { diagram, target,
effect }` removes it. The inspector shows **Effects** for elements, named relations and named
notes and fragments: `Flow particles`, `Moving dash` and `Pulse` as on/off, and their properties
when on. The canvas toolbar gets **Play effects**, which renders the animated profile in the
canvas until it is turned off or an edit starts a drag. Completion offers the properties and
values that apply to the block's effect; hover documents each property.

## Risks / Trade-offs

- [CSS motion paths are not universal] → The static drawing is the fallback, as the proposal
  allows; frames and later video use `sceneAt`, not CSS.
- [Halo scale is not a constant margin] → Linear scale keeps CSS and frames identical; 15 % is
  readable for boxes of every default size.
