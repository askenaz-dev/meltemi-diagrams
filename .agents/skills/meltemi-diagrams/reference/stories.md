# Stories

A `story` tells a diagram step by step for a walkthrough, a talk or a recorded demo. It never
changes the diagram: scenes reveal, hide, highlight, focus, frame and trace parts of it on one
deterministic clock, and may switch to another view of the same system. Write the diagram first,
then the story below it (or in another file that imports the diagram).

```text
story purchase for checkout {
  title "A purchase"

  scene overview {
    reveal client, api, orders, db over 800ms
    hold 1s
  }

  scene processing {
    trace request over 1200ms
    parallel {
      trace save over 1200ms
      highlight db over 1200ms
    }
    hold 2s
  }
}
```

## Vocabulary

| Statement                                   | Default | Meaning                                                                           |
| ------------------------------------------- | ------- | --------------------------------------------------------------------------------- |
| `scene <id> ["Title"] { ... }`              |         | a step; scenes run one after the other                                            |
| `view <diagram>`                            |         | first in a scene: the diagram it shows from now on                                |
| `transition cut\|fade\|morph [over <time>]` | 800 ms  | needed when the view changes; `morph` moves boxes with the same id, `cut` takes 0 |
| `reveal a, b [over <time>]`                 | 600 ms  | fades in; targets first revealed start hidden                                     |
| `hide a, b [over <time>]`                   | 600 ms  | fades out                                                                         |
| `highlight a [over <time>]`                 | 1 s     | accent outline for the action's time                                              |
| `focus a, b` / `focus all`                  | 600 ms  | dims the rest to 25 % until the end of the scene; `all` clears it                 |
| `camera a, b` / `camera all`                | 800 ms  | frames the targets plus 40 px; `all` frames the whole view                        |
| `trace r [over <time>]`                     | 1.2 s   | draws one named relation from source to target in the accent colour               |
| `hold <time>`                               |         | waits                                                                             |
| `parallel { ... }`                          |         | actions that start together; lasts as long as the longest                         |

Targets are ids of the scene's view: elements, named relations (`as <id>`), named notes and
fragments; entity paths (`shop.api`) in C4 views. Times are `800ms` or `1.5s`, up to `600s`.

## Rules that save iterations

- Name every relation you want to trace: `api -> db: "SQL" as save`.
- Reveal everything that should appear; anything never revealed is visible from the start. An
  arrow appears with its two ends, so reveal the boxes, not the relations.
- Two actions on the same target and channel must not overlap (`story.conflict`): put a `reveal`
  and a `hide` of the same box in sequence, not in one `parallel`.
- A change of `view` needs a `transition` (`story.missing-transition`); use `morph` between views
  that share ids (two C4 views of one model), `fade` otherwise.
- Keep scenes short (a few seconds) and end the story with a `hold` so the last state stays.

## Diagnostics

| Code                       | Fix                                                                   |
| -------------------------- | --------------------------------------------------------------------- |
| `story.unknown-diagram`    | the diagram after `for` or `view` is not in the file or imported      |
| `ref.unknown-element`      | the target is not an id of the scene's view; use the suggested id     |
| `story.invalid-target`     | `trace` needs a named relation                                        |
| `story.missing-transition` | add `transition cut`, `fade` or `morph` after `view`                  |
| `story.conflict`           | two overlapping actions on one target and channel; sequence them      |
| `story.empty-scene`        | warning: give the scene an action or remove it                        |
| `prop.invalid-value`       | a time without `ms` or `s`, beyond 600 s, or a statement out of place |

## Checking a story

```bash
pnpm mdg validate path/to/sheet.meltemi
```

```bash
pnpm mdg export path/to/sheet.meltemi --story purchase --at 2.4s
```

`--story` writes `<stem>.<story>.svg`: the end of the story, or the frame at `--at`. Export a few
instants (the start of each scene, the middle of a trace) and look at them; the canvas in VS Code
plays the story with a timeline.

To share the story, write its HTML player, an offline page with pause, progress, scenes, reduced
motion, a static view, a text summary, zoom, hover cards and a detail panel (`--embed` writes a
fragment for an existing page):

```bash
pnpm mdg export path/to/sheet.meltemi --story purchase --format html
```
