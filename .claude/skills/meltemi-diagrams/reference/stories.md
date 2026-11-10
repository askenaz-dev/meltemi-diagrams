# Stories

A `story` tells a diagram step by step for a walkthrough, a talk or a recorded demo. It never
changes the diagram: scenes reveal, hide, highlight, focus, frame, trace and draw parts of it on one
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

| Statement                                   | Default | Meaning                                                                                                                    |
| ------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------- |
| `scene <id> ["Title"] { ... }`              |         | a step; sequential unless an overlap is declared                                                                           |
| `view <diagram>`                            |         | first in a scene: the diagram it shows from now on                                                                         |
| `overlap <time>`                            |         | starts before the preceding scene ends; bounded by both durations                                                          |
| `transition cut\|fade\|morph [over <time>]` | 800 ms  | needed when the view changes; `morph` moves boxes with the same id, `cut` takes 0                                          |
| `reveal a, b [over <time>]`                 | 600 ms  | fades in; targets first revealed start hidden                                                                              |
| `hide a, b [over <time>]`                   | 600 ms  | fades out                                                                                                                  |
| `highlight a [over <time>]`                 | 1 s     | accent outline for the action's time                                                                                       |
| `focus a, b` / `focus all`                  | 600 ms  | dims the rest to 25 % until the end of the scene; `all` clears it                                                          |
| `camera a, b` / `camera all`                | 800 ms  | frames the targets plus 40 px; `all` frames the whole view                                                                 |
| `trace r [over <time>]`                     | 1.2 s   | draws one named relation from source to target in the accent colour                                                        |
| `draw a, b [over <time>]`                   | 800 ms  | replays pens, free lines and named relations as drawn, one after another, and keeps them; targets first drawn start hidden |
| `hold <time>`                               |         | waits                                                                                                                      |
| `parallel { ... }`                          |         | actions that start together; lasts as long as the longest                                                                  |

Targets are ids of the scene's view: elements, named relations (`as <id>`), named notes and
fragments; entity paths (`shop.api`) in C4 views. Times are `800ms` or `1.5s`, up to `600s`.

## Rules that save iterations

Use readable story/scene titles (`title "Walkthrough"`, `scene prod "Production"`) while keeping
their stable ids. The UI's name fields edit these titles; its selected scene is independent of
the playhead. The lower Delete scene keeps its story; story removal is beside the upper selector
or in the explorer. Panel height is host-local view state, never project configuration.

For concurrent scenes, add `overlap 2s` before the incoming scene's actions. It starts two seconds
before the previous scene ends; the amount must fit both durations (and the 600 s time limit).
Omission/zero means sequential. In an overlapped scene, transition and actions start together and
the longer determines its duration; sequential scenes keep transition-first timing. Separate
targets run together; a later scene's started claim wins on the same channel, with interpolation
anchored at that claim's start. Same-scene parallel conflicts remain errors. Check `inspect_story`
global starts/ends and preview an instant inside the shared interval to verify both contributions.
Directed scene exports show each scene's own closing state, excluding later overlapping scenes.

When removing or inserting a scene, clear the next scene's orphaned overlap in the same reversible
edit and preserve its inherited view. Shortening cannot invalidate either neighbouring overlap.
HTML export can omit heading, textual summary and optional details while retaining controls and
zoom/pan; the player also offers fullscreen. Geometry, ids and timing needed for offline playback
remain embedded. Do not describe presentation choices as hiding all data.

- Name every relation you want to trace: `api -> db: "SQL" as save`.
- A whiteboard's explanation is a `draw` of its pens in the order they were written
  (`draw title, arrow over 2s`): each takes a share of the time proportional to its length, in its
  own colour, and stays drawn ([free.md](free.md#pen-strokes)).
- Reveal everything that should appear; anything never revealed is visible from the start. An
  arrow appears with its two ends, so reveal the boxes, not the relations.
- In a gantt chart ([gantt.md](gantt.md)) the targets are sections, tasks, milestones and markers:
  `reveal` a section to show its band and rows, `draw a, b` to grow task bars from their start, and
  `trace x` to light the arrows of the chain that drives a task or milestone that follows others;
  `draw` of anything but a task, or `trace` of a task without arrows, is `story.invalid-target`.
- Two actions within one scene on the same target and channel must not overlap (`story.conflict`): put a `reveal`
  and a `hide` of the same box in sequence, not in one `parallel`.
- A change of `view` needs a `transition` (`story.missing-transition`); use `morph` between views
  that share ids (two C4 views of one model), `fade` otherwise.
- Keep scenes short (a few seconds) and end the story with a `hold` so the last state stays.

## Diagnostics

| Code                       | Fix                                                                           |
| -------------------------- | ----------------------------------------------------------------------------- |
| `story.unknown-diagram`    | the diagram after `for` or `view` is not in the file or imported              |
| `ref.unknown-element`      | the target is not an id of the scene's view; use the suggested id             |
| `story.invalid-target`     | `trace` needs a named relation; `draw` a pen, a free line or a named relation |
| `story.missing-transition` | add `transition cut`, `fade` or `morph` after `view`                          |
| `story.conflict`           | two overlapping actions on one target and channel; sequence them              |
| `story.empty-scene`        | warning: give the scene an action or remove it                                |
| `prop.invalid-value`       | a time without `ms` or `s`, beyond 600 s, or a statement out of place         |

## Authoring and revising with an agent

1. Read the current file and its imported diagrams. Inventory diagram ids, existing story ids,
   scene ids, named relations and export profiles before choosing targets. A new story uses its
   own stable id; do not replace an existing story unless the person requested it.
2. Write a small `story` block with named scenes, titles and explicit times. Add it alongside
   the diagram, preserving comments, formatting, other stories and exports. A story in a separate
   file imports the diagram: `import checkout from "./checkout.meltemi"`.
3. Validate the whole project after each logical edit, including edits to shared diagrams or
   imported views. A valid story alone does not prove that an export in another file still works.
   Fix errors and relevant warnings before presenting the result.
4. With MCP, call `inspect_story` with the project, file path and story id. It returns the
   compiled timeline: total `durationMs`, ordered scenes, resolved `view` identities,
   `startMs`/`endMs`/`durationMs`, transitions and nested actions. Action `path` starts with the
   scene index and then its nested action indexes. All times are absolute milliseconds on the
   story clock; omitted source times already have the language defaults applied.
5. Preview the start and `stillAtMs` of every scene, plus the middle of important actions. The
   sequential scene's end is the next scene's start; `stillAtMs` is just before that boundary
   (or the final story end). With overlaps, `stillAtMs` is a global closing instant and preview
   includes every active scene. Use directed scene exports to inspect an isolated closing state.
   Inspect the pictures, not only the JSON. Each inspection and preview reads its own snapshot:
   compare their `revision` values and re-inspect if another edit arrived. These calls do not lock
   a revision or request a historical preview.
6. To adjust a scene's length, edit its action durations or its trailing `hold`, then inspect
   again. Sequential actions add and `parallel` lasts as long as its longest child. A sequential
   scene prefixes its transition; an overlapped scene runs it concurrently. Do not scale every
   action just to add a pause. When reordering scenes, check
   each active view and its required transition again: a preceding view may have changed.
7. To delete a story, remove only that story block. Find exports `for <story-id>` across the
   project first; report them and remove or retarget those dependencies only within the person's
   requested scope. Keep unrelated stories, scenes and diagrams intact. Validate the whole
   project again and inspect the surviving story when relevant.

For account projects, every write uses `read_files`' current `revision` as `ifRevision` and a
fresh idempotency key per logical change. A `revision.mismatch` requires another read and a
minimal reapplication on the person's latest text, preserving their comments and edits. Never
retry an old whole-file replacement over newer source. See [mcp.md](mcp.md#story-timelines).

With `mdg mcp --folder <dir>`, the same `inspect_story` reads files from disk without an account.
Its content-derived `revision` identifies a folder snapshot; it is not a cloud write revision.
Use your file tools for small source edits and re-inspect after any disk change. Without MCP,
validate through the CLI and export a few known scene/action instants as below; do not claim to
have inspected a compiled timeline through a tool that is unavailable.

The visual timeline also reorders top-level actions by dragging their bodies before/after
siblings, or with Move earlier/Move later and Alt+Left/Right. This is insertion-style ordering:
durations and the scene total stay fixed; starts follow source order. A parallel header moves its
whole block without changing simultaneous children. Its right duration handles remain separate.
This gesture reorders actions; scene overlap is configured separately. When revising the equivalent source as an
agent, move the existing action/block with its comments, preserve durations, then validate and
inspect again. Do not silently extract parallel children, move transitions or invent pauses.

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
