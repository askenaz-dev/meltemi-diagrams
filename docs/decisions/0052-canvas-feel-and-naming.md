# 0052. Effects play by default, a rotation starts where it was grabbed, sequence heads are measured as drawn

Status: accepted (canvas-feel-and-naming change, 22 October 2026). Extends decisions 0019, 0022
and 0045.

## Context

The owner met four rough edges of the canvas on 2026-10-22, each with one cause in the code.

- The four effect toggles of the style strip sat in a group with only an accessible label, loose
  beside the titled "Route kind" and "Corners" rows, and turning one on drew nothing until the
  toolbar's Play effects was pressed: the session's `playing` started false and only that button
  changed it.
- The rotation handle took the pointer's absolute bearing from the centre with no drag threshold.
  The handle of a default node sits about 66° from its centre, so the first pixel of jitter after
  a press snapped an upright node to 60°, and a plain click wrote `rotation 60`. The drawing was
  turned by a CSS transform with a 120 ms transition while the selection outline turned at once,
  and each live preview replaced the drawing with the session's without turning it again, so the
  two disagreed; in `layout auto` the preview let the engine move the node away from its outline.
- In sequence diagrams the row of heads is as tall as an actor's figure and name whenever a figure
  is present, while participants, databases, collections and queues are drawn in its bottom 40
  units; the layout reported the whole row as the head's box and as its scene group's bounds, so
  the selection, the pulse halo, story highlights and the inline editor sat 20 units above the
  drawn box. The same diagrams looked washed out: heads, activation bars, notes and lifelines took
  the theme's `line` token, `#DCE5ED` on `#F7FBFF` under `technical.light`, about 1.2:1.
- The editor named anonymous relations, messages, notes and fragments on demand, but several
  paths lost the selection once the id changed (label, layer, dotted line, moving a label,
  dragging an end or a bend, the inline label), and two still refused instead of naming: a style
  on an unnamed note or fragment, and the label position of an anonymous relation.

## Decision

- **Effects play from the start, and a pause is remembered per diagram.** The session starts
  playing. The canvas keeps the person's last choice for each diagram of the file in its
  persisted state (`effectsPlaying`), beside the hidden layers; a diagram without a choice plays
  unless the system asks for reduced motion. A drawing whose playing state disagrees with that
  choice is not shown: the canvas asks the session for the other one, so a paused diagram never
  flashes animated after a reload. The toolbar's one toggle reads **Pause effects** while playing
  and **Play effects** while paused, and is disabled without effects. Turning an effect on while
  paused says so in the status line.
- **The effects are a titled row of the strip.** "Effects" at the left and, at the right, "off",
  the names of the effects that are on, or "mixed", like the route kind's row; the toggles beneath.
- **A rotation is the turn since the grab.** The angle is the element's angle at the press plus
  the change of the pointer's bearing about the centre since the press (`turnedAngle`), snapped to
  15° unless Alt is held, and nothing turns before the pointer has moved the drag threshold.
- **The live rotation is the SVG `transform` of the element's group, without easing.** The
  canvas writes `rotate(a cx cy)` in the coordinates of the drawing shown, as the layout does, and
  writes it again over every answered preview, about the box the preview's answer gives for the
  turned element; the selection outline turns by the same angle about the same box, and keeps the
  written angle until the edit's render arrives. A transition on the group would ease the very
  attribute the drag writes, so it applies only once, on the drop.
- **A rotation is geometry.** In a diagram with `layout auto` a rotation, previewed or written,
  writes the arrangement first, as a move does, so the engine does not move the turned node.
- **A sequence head's box is the box it is drawn as.** Participants, databases, collections (with
  their stack offset) and queues report the drawn box in `boxes` and as their group's `bounds`;
  figures keep their cell. The layout reports `shapes` (`rounded`, `cylinder` for databases) and
  `radii` for heads. Every consumer of the bounds (halos, story highlights, the review overlay, the
  player's stage, the inline editor, the label audit) follows without a change of its own.
- **Sequence diagrams draw in `muted`.** Heads, activation bars, notes, fragment frames and
  lifelines take the theme's `muted` token; lifelines are dashed at half opacity, so they stay
  below the messages, which keep `connector`. No palette changes.
- **Every naming keeps the selection, and nothing is refused for want of a name.** Each path that
  names its target first returns the new id as the selection; styles on unnamed notes and
  fragments name them `note1`, `alt1`; a label position names the relation first.

## Alternatives considered

- **Turning effects on only when the first one is added**, the owner's first wording: a file
  opened with effects would still be still, and the second effect would not need it.
- **Keeping the absolute bearing and adding only a threshold:** the first move would still snap to
  the handle's own bearing.
- **Sending no previews while rotating and turning the group locally:** connectors would not
  follow the turned element, which is what the live preview exists for.
- **Changing `line` in `technical.light`, or new tokens `lifeline` and `participantLine`:** the
  first reaches every flow, free and C4 picture for a token whose job there is a quiet edge; the
  second adds tokens to every theme family and the theme panel for one picture. `bandLine` for
  lifelines is no stronger than `line` in `technical.dark`.
- **Drawing box heads at the top of the row:** an actor's name would sit lower than a
  participant's, and the figure's cell would still be taller than the box.

## Consequences

- A diagram with effects animates while it is edited; the pause is one click and stays.
- The first rotation of an `auto` diagram writes placements, as its first move does.
- Sequence snapshots, the acceptance pictures and the gallery are regenerated with the new
  strokes; the layout tests assert the head boxes and the tokens directly.
- New public surface: `turnedAngle` in the editor's canvas helpers, `box` on the preview answer,
  `PreviewedAction` and `RotationAction` exported by the editor package, `PersistedState`'s
  `effectsPlaying`, and the canvas words `inspector.effectsOff`, `toolbar.pauseEffects` and
  `announcements.effectsPaused`. The editor's `reasons.nameToStyle` and `reasons.nameToMoveLabel`
  are gone. The language stays 0.2.
