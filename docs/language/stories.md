# Stories

[Español](../es/language/stories.md)

A `story` tells a diagram step by step: scenes that reveal, highlight, trace and draw parts of it,
move the camera, and change to another view of the same system. A story never changes its
diagrams; it draws them frame by frame on the same deterministic clock as motion effects
([motion.md](motion.md)), so the canvas, exported frames, the player and videos show the same
state at the same instant.

```text
story purchase for checkout {
  title "A purchase"

  scene overview {
    reveal client, api, orders, db over 800ms
    hold 1s
  }

  scene processing {
    trace request over 1200ms
    trace create over 1200ms
    parallel {
      trace save over 1200ms
      highlight db over 1200ms
    }
    hold 2s
  }
}
```

The story lasts 7.4 s: `overview` takes 0.8 + 1 s, `processing` 1.2 + 1.2 + 1.2 + 2 s.

A file may hold several stories of the same diagram: the flows of one drawing, each with its own
scenes over the same picture (a purchase, a refund, an outage). The canvas plays any of them from
its story picker, `--stories` writes them into one HTML player whose **Story** picker offers each
flow ([player.md](../player.md#several-stories)), and **New story** on the canvas starts the next
one without writing its block by hand.

## Structure

| Statement                                   | Where                 | Meaning                                                                                 |
| ------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------- |
| `story <id> for <diagram> { ... }`          | top level             | a story about a diagram of the file or an imported one (`checkout`, `views.containers`) |
| `title "..."`, `description "..."`          | story                 | shown by the player and the canvas                                                      |
| `scene <id> ["Title"] { ... }`              | story                 | a step; scenes run one after the other                                                  |
| `view <diagram>`                            | first in scene        | the diagram this scene shows; the next scenes keep it                                   |
| `transition cut\|fade\|morph [over <time>]` | scene, before actions | how the scene's view replaces the previous one                                          |
| `parallel { ... }`                          | scene, parallel       | actions that start together; the block lasts as long as its longest action              |

Times are written `800ms` or `1.5s`, from `0ms` to `600s`.

## Actions

| Action                      | Default time | Effect                                                                                                                          |
| --------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `reveal a, b [over <time>]` | 600 ms       | fades the targets in; a target whose first visibility action is `reveal` starts hidden                                          |
| `hide a, b [over <time>]`   | 600 ms       | fades the targets out                                                                                                           |
| `highlight a [over <time>]` | 1000 ms      | outlines the targets in the accent colour, ramping in and out over min(200 ms, a quarter of the time)                           |
| `focus a, b [over <time>]`  | 600 ms       | dims everything but the targets and the relations between them to 25 %, to the end of the scene; `focus all` clears it          |
| `camera a, b [over <time>]` | 800 ms       | moves the view box to the targets' bounds plus 40 px at the picture's aspect ratio; `camera all` frames the whole view          |
| `trace r [over <time>]`     | 1200 ms      | draws one relation from its source to its target in the accent colour, 2 px wider, with a dot at its head                       |
| `draw a, b [over <time>]`   | 800 ms       | draws pens, free lines and named relations again from their first point to their last, one after another, and leaves them drawn |
| `hold <time>`               | —            | waits                                                                                                                           |

Targets are the ids of the scene's view: elements, named relations, and named notes and fragments
of sequence diagrams; in a C4 view, entity paths such as `shop.api`. Sequential actions add up; the
next scene starts when the previous one ends. Every curve is linear. A relation is drawn at the
opacity of its least visible end, so revealing two boxes reveals the arrows between them. A trace suspends the
relation's own `animate` effects while it runs; the views' other effects run on the story's clock.

`draw` replays what was drawn on a whiteboard ([free.md](free.md#pen-strokes)): an explanation
written with pens becomes a story, an animated SVG and a video.

```text
diagram whiteboard: free {
  theme "sketch.light"

  sticky idea "Ship it"
  pen title [(40, 40), (80, 30), (120, 44), (160, 36)]
  pen arrow [(40, 120), (120, 110), (200, 124)]

  placement {
    place idea at (340, 120)
  }

  style arrow { arrowhead triangle }
}

story explain for whiteboard {
  scene strokes {
    draw title, arrow over 2s
    reveal idea
  }
}
```

- **Order and time.** The targets are drawn one after another in the order written, each over a
  share of the time proportional to the length of its line, so a long word takes most of it and a
  dot appears in its turn; when none has a length, they share it equally. Each grows from its
  first point to its last in its own colour, width, line and opacity, and its heads and label
  appear when it is whole.
- **Visibility.** A target whose first visibility action is `draw` starts hidden, as with
  `reveal`, and stays drawn after its share. `draw` uses the visibility and trace channels of its
  targets, so a `reveal` or a `trace` of the same target at the same time is `story.conflict`.
- **Effects.** While a target is being drawn its own `animate` effects are suspended, as under a
  trace.
- **Targets.** Pens, free lines and named relations; anything else is `story.invalid-target`,
  which says that draw takes pens, lines and relations.

In a gantt chart ([gantt.md](gantt.md#effects-and-stories)) sections, tasks, milestones and markers
are elements, so `reveal`, `hide`, `highlight`, `focus` and `camera` take them, and a section hides
and focuses with its tasks and arrows. Two actions know charts:

- `draw <task>[, <task>…]` grows each bar from its start to its end as a clip that widens from left
  to right, one task after another over shares of the time in proportion to the widths of the
  bars, and leaves it drawn; a task whose first action is `draw` starts hidden. On a section, a
  milestone or a marker it is `story.invalid-target`, which says that draw takes pens, lines,
  relations and gantt tasks.
- `trace <task>` (or a milestone) lights the arrows of the chain that drives it: from it, the
  predecessor that ends last, and so on back to the start, earliest first, one after another, each
  over a share of the time in proportion to its length, until the action ends. A task or milestone
  without arrows, a section or a marker is `story.invalid-target`.

The axis, its grid and its labels are never faded or hidden by an action.

## Transitions

A scene whose view differs from the previous scene's view needs a transition
(`story.missing-transition`):

| Transition | Default time | Effect                                                                                                |
| ---------- | ------------ | ----------------------------------------------------------------------------------------------------- |
| `cut`      | 0            | switches at once                                                                                      |
| `fade`     | 800 ms       | cross-fades the two pictures                                                                          |
| `morph`    | 800 ms       | moves each element both views draw (same id) from its old box to its new one and cross-fades the rest |

The transition starts the scene; its actions follow. A camera set in one view does not carry over
to another.

## Rules

| Code                       | When                                                                                                             |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `story.unknown-diagram`    | the diagram after `for` or `view` is neither in the file nor imported; the hint lists the diagrams               |
| `ref.unknown-element`      | a target is not an id of the scene's view; close ids are suggested                                               |
| `story.invalid-target`     | `trace` names something that is not a relation, or `draw` something that is not a pen, a free line or a relation |
| `story.missing-transition` | the view changes without a `transition`                                                                          |
| `story.conflict`           | two actions on the same channel of the same target overlap in time (`reveal db` and `hide db` in one `parallel`) |
| `story.empty-scene`        | warning: a scene with no actions and no transition takes no time                                                 |
| `prop.invalid-value`       | a malformed or out-of-range time, or a statement in the wrong place                                              |

Channels are visibility (`reveal`, `hide`), highlight and trace per target (`draw` takes
visibility and trace), and focus and camera per view. A story of an imported diagram whose import
does not resolve is reported by the import, not by the story.

## Exports

| Command                                                              | Result                                              |
| -------------------------------------------------------------------- | --------------------------------------------------- |
| `mdg export purchase.meltemi --story purchase`                       | `purchase.purchase.svg`, the end of the story       |
| `mdg export purchase.meltemi --story purchase --at 500ms`            | the frame at 500 ms                                 |
| `mdg export purchase.meltemi --story purchase --format html`         | `purchase.purchase.html`, the HTML player           |
| `mdg export purchase.meltemi --story purchase --at 3s --format png`  | the frame at 3 s as PNG (or `pdf`)                  |
| `mdg export purchase.meltemi --story purchase --format mp4`          | the whole story as a 1080p video (or `webm`, `gif`) |
| `mdg export purchase.meltemi --story purchase --scenes`              | `purchase.purchase.overview.svg` and one per scene  |
| `mdg export purchase.meltemi --story purchase --scenes --format pdf` | `purchase.purchase.pdf`, a page per scene           |
| `mdg export flows.meltemi --stories`                                 | `flows.stories.html`, every story in one player     |

`--story` writes one frame, so it cannot be combined with `--diagram`, `--scenario` or
`--motion animated`; `--out` takes a file or an existing directory, `--stdout` prints the SVG.
`--scenes` writes each scene's final state instead, the frame the player's static view shows: just
before the next scene starts, and the end for the last one. SVG and PNG give a file per scene,
named `<stem>.<story>.<scene>.<ext>` beside the file or in the directory `--out` names; PDF gives
one file with a page per scene, every page the largest frame's size with each frame fitted and
centred. `--scenes` cannot take `--at`, `--stdout`, `html` or a video format. `--stories` writes
every story of the file into one HTML player in source order, or the ones listed in that order
(`--stories refund,purchase`), also as a fragment with `--embed`; a story that cannot be drawn is
left out and named. Profiles take `scenes true` ([export.md](export.md#profiles)).
`validate` reports story diagnostics like any other. The HTML player plays the story with pause,
progress, scenes, reduced motion, a static view and a text summary ([player.md](../player.md));
video and GIF record it frame by frame ([export.md](export.md)).

## Projects

A story may tell a diagram of another file of the project through an import:

```text
import context from "../diagrams/context.meltemi"
import "../diagrams/containers.meltemi" as views

story tour for context {
  scene who { reveal customer, shop, bank }
  scene inside {
    view views.containers
    transition morph over 900ms
    reveal shop.web, shop.api, shop.db
  }
}
```

Renaming an element, relation or entity renames it in the stories of every file that names it, and
removing one lists the story actions that name it before removing them.

## In the editor

Completion offers story statements, actions, transition kinds and the ids of the scene's view;
hover gives each action's place on the clock; the outline lists stories and scenes; definition,
references and rename go from a story target to the element, also in imported files. The canvas
plays a story read-only with a timeline: play, pause, scrub, drag the end of a bar to retime it,
and **Add to scene** for the selection ([editor.md](../editor.md)). **New story**, beside the story
picker, writes `story story1 for <diagram> { scene scene1 { } }` for the diagram shown (or the
playing story's) and plays it at once, so **Add to scene** and the scene button fill it; the timeline's
**Export scenes** writes a picture of every scene, and **Export HTML** the player. In the web app's
export dialog and in VS Code's **Export HTML Player**, **Every story** writes the player of every
story of a file that has more than one.

Selecting another diagram or file in the explorer leaves story mode immediately; **Edit diagram**
in the story picker does the same. Opening a story explicitly starts its playback again. If a
source edit temporarily makes a present story invalid, its last valid frame stays visible until
it can be drawn again; removing that story ends playback.

**Delete story** in the timeline, or the story's explorer menu and Delete key, asks before removing
that story. The confirmation names any export profiles that must go with it. Its diagrams, other
stories and unrelated comments remain. Undo restores the exact text as one edit, without starting
playback. A read-only project offers playback and exports while editing controls remain hidden.

Select a scene's name to edit **Scene duration (s)**. This is its total time: transition plus
sequential actions, with the longest child determining each parallel block's time. Changing the
total changes only the final top-level `hold`, or adds one. For example, `reveal a over 2s` followed
by `hold 1s` totals 3 s; setting 4 s changes the pause to 2 s. Setting 1 s is rejected because the
content already needs 2 s, and the field keeps the draft with the minimum and a correction hint.
No actions are rescaled. Setting the minimum leaves an existing final `hold 0ms`, preserving its
comments. Select an action or a fade/morph transition bar to edit **Selected action duration (s)**;
parallel totals are derived, and cut transitions remain instantaneous. Dragging a bar's end still
works. Enter or leaving a field commits once; Escape or cancelling a drag writes nothing.
