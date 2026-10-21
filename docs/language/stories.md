# Stories

[Español](../es/language/stories.md)

A `story` tells a diagram step by step: scenes that reveal, highlight and trace parts of it, move
the camera, and change to another view of the same system. A story never changes its diagrams; it
draws them frame by frame on the same deterministic clock as motion effects
([motion.md](motion.md), decision 0023), so the canvas, a frame exported at a time and, later, the
player and videos show the same state at the same instant.

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

| Action                      | Default time | Effect                                                                                                                 |
| --------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `reveal a, b [over <time>]` | 600 ms       | fades the targets in; a target whose first visibility action is `reveal` starts hidden                                 |
| `hide a, b [over <time>]`   | 600 ms       | fades the targets out                                                                                                  |
| `highlight a [over <time>]` | 1000 ms      | outlines the targets in the accent colour, ramping in and out over min(200 ms, a quarter of the time)                  |
| `focus a, b [over <time>]`  | 600 ms       | dims everything but the targets and the relations between them to 25 %, to the end of the scene; `focus all` clears it |
| `camera a, b [over <time>]` | 800 ms       | moves the view box to the targets' bounds plus 40 px at the picture's aspect ratio; `camera all` frames the whole view |
| `trace r [over <time>]`     | 1200 ms      | draws one relation from its source to its target in the accent colour, 2 px wider, with a dot at its head              |
| `hold <time>`               | —            | waits                                                                                                                  |

Targets are the ids of the scene's view: elements, named relations, and named notes and fragments
of sequence diagrams; in a C4 view, entity paths such as `shop.api`. Sequential actions add up; the
next scene starts when the previous one ends. Every curve is linear. A relation is drawn at the
opacity of its least visible end, so revealing two boxes reveals the arrows between them. A trace suspends the
relation's own `animate` effects while it runs; the views' other effects run on the story's clock.

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
| `story.invalid-target`     | `trace` names something that is not a relation                                                                   |
| `story.missing-transition` | the view changes without a `transition`                                                                          |
| `story.conflict`           | two actions on the same channel of the same target overlap in time (`reveal db` and `hide db` in one `parallel`) |
| `story.empty-scene`        | warning: a scene with no actions and no transition takes no time                                                 |
| `prop.invalid-value`       | a malformed or out-of-range time, or a statement in the wrong place                                              |

Channels are visibility (`reveal`, `hide`), highlight and trace per target, and focus and camera
per view. A story of an imported diagram whose import does not resolve is reported by the import,
not by the story.

## Exports

| Command                                                                  | Result                                              |
| ------------------------------------------------------------------------ | --------------------------------------------------- |
| `pnpm mdg export purchase.meltemi --story purchase`                      | `purchase.purchase.svg`, the end of the story       |
| `pnpm mdg export purchase.meltemi --story purchase --at 500ms`           | the frame at 500 ms                                 |
| `pnpm mdg export purchase.meltemi --story purchase --format html`        | `purchase.purchase.html`, the HTML player           |
| `pnpm mdg export purchase.meltemi --story purchase --at 3s --format png` | the frame at 3 s as PNG (or `pdf`)                  |
| `pnpm mdg export purchase.meltemi --story purchase --format mp4`         | the whole story as a 1080p video (or `webm`, `gif`) |

`--story` writes one frame, so it cannot be combined with `--diagram`, `--scenario` or
`--motion animated`; `--out` takes a file or an existing directory, `--stdout` prints the SVG.
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
and **Add to scene** for the selection ([editor.md](../editor.md)).
