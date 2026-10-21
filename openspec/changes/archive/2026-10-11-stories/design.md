## Context

- `story` blocks parse as `StoryBlock` (`story <id> for <ref> { … }`) and are reported as
  `block.unsupported`. The proposal's example (`corpus/parse-only/purchase.meltemi`) lasts 7.4 s.
- Change 13 built the clock, the motion plan against the drawn scene, frames (`sceneAt`) and the
  scene's `track` and `bounds`. The layout gives each element, relation and event a group with its
  id; C4 views use entity paths, so views of one model share ids.
- The canvas shows SVG renders from the host; the webview bundle is plain browser code.

## Goals / Non-Goals

**Goals:** stories compiled and checked; a deterministic timeline; frames at any time with every
action and transitions between views; story frames from the CLI; editing stories from the text,
the timeline and the canvas with shared undo; references and renames that reach stories.

**Non-Goals:** the HTML player (15), video and GIF (17), export profiles (16).

## Decisions

### D1. Grammar

```text
story <id> for <diagram> {
  title "…"; description "…"
  scene <id> ["Title"] {
    view <diagram>                         // optional; another diagram from here on
    transition cut|fade|morph [over <time>] // required when the view changes
    reveal <targets> [over <time>]
    hide <targets> [over <time>]
    highlight <targets> [over <time>]
    focus <targets>|all [over <time>]
    camera <targets>|all [over <time>]
    trace <relation> [over <time>]
    hold <time>
    parallel { <actions> }
  }
}
```

Targets are element ids, named relation ids and named note and fragment ids of the scene's view;
C4 paths in C4 views. `<diagram>` is a diagram of the file or an imported one (`import checkout
from "…"`, `views.checkout`). Times use `ms` or `s`, from 0 to 10 minutes; default `over`:
reveal, hide and focus 600 ms, camera 800 ms, highlight 1000 ms, trace 1200 ms, fade and morph
800 ms, cut 0.

### D2. Timing

A scene starts when the previous one ends. Inside a scene, its transition comes first, then each
action starts when the previous one ends; a `parallel` block starts its actions together and lasts
as long as the longest. The story's length is the sum of its scenes. Every action has an absolute
`startMs` and `durationMs` in the compiled story; the purchase example gives 7400 ms.

### D3. State at time t (`storyFrame`)

- **Visibility.** A target whose first visibility action is `reveal` starts hidden; others start
  visible. `reveal` and `hide` move its opacity linearly to 1 or 0 over their time; the group
  carries the opacity.
- **Highlight.** For its time, a halo in the theme accent (a glow on relations) that fades in and
  out over `min(200 ms, d/4)`; afterwards the base style is back.
- **Trace.** The relation's track drawn from its start to `p = (t − s)/d` in the accent, 2 px wider,
  with a dot at the head; the relation's own `animate` effects are suspended during the trace.
- **Focus.** From its start, over its time, everything outside the focus set (its targets and the
  relations between them) fades to opacity 0.25; it lasts to the end of its scene or the next
  focus; `focus all` clears it.
- **Camera.** The view box moves linearly from the current one to the bounds of its targets plus
  40 px, widened to the scene's aspect ratio; it lasts until the next camera, `camera all` or a
  change of view.
- **Transitions.** A scene whose view differs from the previous scene's view needs a transition
  (`story.missing-transition`): `cut` switches, `fade` cross-fades the two pictures, `morph` moves
  each element present in both views (same id) from its old box to its new one and cross-fades the
  rest. Only a morph moves boxes, and only between two compositions.
- **Effects.** The views' `animate` effects run on the same clock (`sceneAt`), minus suspended
  ones.

### D4. Conflicts

Channels: per target, visibility (reveal, hide), highlight and trace; per view, focus and camera.
Two actions of one channel whose times overlap are `story.conflict` on the later one, with the
earlier as related information (for example `reveal db` and `hide db` in one `parallel`).

### D5. Compilation and projects

`Document.stories` holds `StoryDefinition`s (id, target, title, scenes with views, transitions and
actions, ranges, `durationMs`, references). Targets are checked against the view; an unknown id is
`ref.unknown-element` with close ids as hints. `compile(text, { diagrams })` resolves imported
diagrams; the project passes `importedDiagram(file, name)` and recompiles story files when the
files they import change, as it does for views of imported models. A story of an imported diagram
whose import does not resolve stays silent, as views do.

### D6. Frames in the canvas

In story mode the host sends the timeline, the scenes of every view the story uses and their
motion plans once; the webview, whose bundle now includes motion and render, draws each frame with
`storyFrame` and `renderSvg` (font faces already loaded by the canvas apply). Play, pause and
scrubbing never round-trip to the host. The canvas is read-only in story mode, like scenario
previews.

### D7. Editing

`setStoryTiming { story, path, durationMs }` writes `over <n>ms` (or the time of `hold`);
`insertStoryAction { story, scene, action, targets, durationMs? }` appends an action to a scene;
`removeStoryAction { story, path }`; `insertScene { story, id, title?, after? }`. Paths are scene
and action indexes, through `parallel` blocks. Renaming an element renames it in the stories of the
file and, in projects, in stories of other files that import its diagram; removing an element lists
its story references as dependents and removes them (an action whose last target goes is removed).
The timeline drags change durations, the canvas selection adds actions to the current scene, and
each change is one text edit.

## Risks / Trade-offs

- [Frames drawn in the webview duplicate the host's work] → Both call the same pure functions;
  the timeline JSON is the same data the CLI uses.
- [Focus and camera persistence rules are choices the proposal leaves open] → They are written in
  the docs and kept simple: focus per scene, camera until changed.
