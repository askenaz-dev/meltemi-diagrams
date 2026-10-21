## Why

Testing 1.1, the owner liked the `pulse` effect and asked for one like it that runs along the
arrow: a highlight that travels from the start of the arrow to its end until the whole arrow is
lit, and then starts again. Stories already draw such a highlight (`trace`), but only once, on a
story's clock; a diagram cannot loop it, so the HTML player, the animated SVG and the videos of a
plain diagram cannot show it.

## What Changes

- **A new effect, `trace`.** `animate pay { effect trace }` draws a highlight in the theme's accent
  colour (or `color`) that grows along the relation from its start to its end during the first
  80 % of each cycle; during the last 20 % the fully lit relation fades out; then the cycle starts
  again. `direction reverse` runs from the end to the start. It takes `duration`, `repeat`,
  `delay`, `direction` and `color`, targets relations (sequence messages included) and has a
  channel of its own, so it combines with flow, dash and pulse.
- **Its look is the story trace's.** A line two pixels wider than the relation's, solid, with a
  dot at its head, drawn inside the relation's group under its label.
- **A theme token `traceDuration`** gives a theme its default speed; without it a trace takes
  1500 ms. Built-in themes write none.
- **Frames and the animated SVG agree.** `sceneAt` and `animatedScene` describe the same state at
  every instant (the same dash offset, dot position and opacity), so the canvas preview, the
  animated SVG, the HTML player, PNG and PDF at a time and the videos all show it alike.
- **Editing.** The strip and the Effects section of the inspector get a **Trace** toggle with its
  speed (the theme's default greyed); the theme panel's Motion group gets its duration; the
  player's text summary describes it; completion and hover document it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `motion-effects`: `trace` in the effect list, its properties, defaults, targets and channel.
- `motion-clock`: the state of a trace at time t.
- `animated-svg`: the trace in the CSS subset, with the same states as frames.
- `theme-tokens`: the `traceDuration` token.
- `motion-editing`: the Trace toggle and its fields in the inspector.
- `quick-styling`: the strip lists four effects.

## Impact

- `packages/model`: `ANIMATION_EFFECTS`, `AnimationEffect`, effect properties and defaults,
  `THEME_DURATION_TOKENS`, target rules and the missing-effect message.
- `packages/layout`: `Theme.traceDuration`.
- `packages/motion`: the trace in `planMotion` (accent by default), `sceneAt` and `animatedScene`.
- `packages/editor`, `packages/edit`, `packages/canvas`: effect labels, target rules, the strip,
  the theme panel, completion and hover docs.
- `packages/player`: the effects summary.
- `packages/vscode/syntaxes`, docs (`motion.md`, `styles.md`, `svg-export.md`, `editor.md`),
  the skill references and the assist guide, a valid corpus sheet.
- Additive within language 0.2; no drawing without `trace` changes.
