# Motion effects

[Español](../es/language/motion.md)

`animate` statements give elements and relations a local effect: particles that flow along a
connector, a dash that moves along a line or an outline, a pulse that draws attention to a box, or
a trace that fills a connector from its start to its end.
Effects never move or resize anything; they are drawn above the static picture. Every effect runs
on one deterministic clock, so an animated export, a frame at a chosen time and, later, stories
and videos show the same state at the same instant (decision 0022).

```text
diagram checkout: flow {
  api -> orders as create
  orders --> events: "OrderCreated" as publish

  animate create { effect flow; particles 2 }
  animate publish { effect dash; direction reverse; delay 300ms }
  animate orders { effect pulse; duration 1500ms; repeat 3; color accent }
  animate create { effect trace; delay 600ms }
}
```

## Properties

| Property    | Values                                       | Default                                                                                                                                 | Effects            |
| ----------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `effect`    | `flow`, `pulse`, `dash`, `trace`             | required (`animate.missing-effect`)                                                                                                     | all                |
| `duration`  | one cycle, `100ms` to `60s`                  | the theme's `flowDuration`, `dashDuration`, `pulseDuration` or `traceDuration`; else 1200 ms for flow, 1500 ms for trace, 1 s otherwise | all                |
| `repeat`    | `forever` or 1 to 1000 cycles                | `forever`                                                                                                                               | all                |
| `delay`     | time before the first cycle, `0ms` to `60s`  | none                                                                                                                                    | all                |
| `direction` | `forward` (source to target) or `reverse`    | `forward`                                                                                                                               | flow, dash, trace  |
| `particles` | 1 to 8, evenly spaced                        | 1                                                                                                                                       | flow               |
| `color`     | a quoted colour or a colour token (`accent`) | the theme's `accent`, which shows on any line or outline                                                                                | flow, pulse, trace |

A property that does not apply to the block's effect is `prop.invalid-value`.

A flow particle is a disc of radius `max(4, 1.5 × width)` on a line of `width` (4 on the default
1.3-wide connector), so it shows in a 960 × 540 GIF; a moving dash keeps the line's own colour,
since it animates the line itself.

## Targets and channels

| Effect  | Draws                                                               | Targets                                              |
| ------- | ------------------------------------------------------------------- | ---------------------------------------------------- |
| `flow`  | particles along the connector, under its label                      | named relations, sequence messages and C4 relations  |
| `dash`  | a dash of 8 and a gap of 6 moving along the line or outline         | named relations and elements with an outline         |
| `pulse` | a halo that grows by 15 % and fades out, or a glow along a relation | elements, named relations, named notes and fragments |
| `trace` | a highlight that fills the connector from its start, then fades out | named relations, sequence messages and C4 relations  |

Any other target is `animate.invalid-target`: flow or a trace on a box, a dash on a note or an
icon. Each effect drives one channel, so a target can have a flow, a dash, a pulse and a trace at
once, but a second
effect of the same kind on the same target is `animate.conflict`, wherever it is written. Notes,
text, icons, images and the stick figures of sequence diagrams have no outline for a dash.

Animations are the last layer of style precedence: while an effect runs, its dash replaces the
written line style of the target; outside its window the target is drawn exactly as styled.

## The clock

Time starts at 0. For an effect with delay `d`, duration `D` and `repeat n`, the target is drawn
without the effect before `d` and from `d + n·D` on; in between, the phase is
`((t − d) mod D) / D`, and every curve is linear.

| Effect | At phase `p`                                                                                                                                                                                                               |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| flow   | particle `i` of `k` at `(p + i/k)` of the track's length (`1 −` that, reversed)                                                                                                                                            |
| dash   | dash offset `−14·p` (`+14·p` reversed)                                                                                                                                                                                     |
| pulse  | halo scaled `1 + 0.15·p` with opacity `0.7·(1 − p)`; on a relation, a glow 6 px wider with opacity `0.5·(1 − p)`                                                                                                           |
| trace  | grown fraction `g = min(1, p / 0.8)` of the track (from its end, reversed): the track 2 px wider with a dash as long as the track at offset `L·(1 − g)`, and a dot at `g`; opacity 1, then `(1 − p) / 0.2` after `p = 0.8` |

A trace is drawn inside its relation's group, under the label, so the label stays readable; the
other overlays are drawn above everything.

## Exports

| Command                                           | Result                                                                                        |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `pnpm mdg export sheet.meltemi`                   | the static picture, without effects                                                           |
| `pnpm mdg export sheet.meltemi --motion animated` | the animated SVG profile, below                                                               |
| `pnpm mdg export sheet.meltemi --at 1.5s`         | the picture at 1.5 s: particles, dashes, halos and traces where they are                      |
| `pnpm mdg export sheet.meltemi --format html`     | an HTML player of the effects, with play, pause and a static view ([player.md](../player.md)) |

The animated SVG profile is an explicit subset: one `<style>` element with CSS keyframes on
`opacity`, `offset-path`/`offset-distance`, `stroke-dasharray`/`stroke-dashoffset` and
`transform: scale`, linear timing, and no scripts or SMIL. Overlays are invisible outside their
keyframes, so the static picture is what shows before a delay, after the last cycle, where CSS
animation or motion paths are unsupported, and when the viewer asks for reduced motion
(`prefers-reduced-motion`). It is meant for browsers and web pages; documents and slides should
use the static export or a frame.

## In the editor

The inspector lists the effects a selected element, relation, message, note or fragment can take
(Flow particles, Moving dash, Pulse, Trace) with their properties; a target without an id, such as
a relation an import wrote or a model relation of a C4 view, is named first in the same edit.
**Play effects** on the canvas toolbar runs them in the canvas until it is pressed again
([editor.md](../editor.md)).
