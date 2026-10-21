# 0023. Stories drawn frame by frame from the text

Status: accepted (stories change, 11 October 2026)

## Context

The proposal makes stories part of 1.0: a story over one or more views with scenes, `reveal`,
`hide`, `highlight`, `focus`, `camera`, `trace`, `hold` and `parallel`, transitions between
compositions matched by id (`morph` only between compositions), and the purchase example that
lasts 7.4 s. Effects and stories share one clock so playing and exporting give the same state;
overlapping actions on the same property are a diagnostic; no action moves a node outside a
morph. `story` blocks were parsed and reported as `block.unsupported`.

## Decision

- **Compiled timing.** The compiler resolves every scene to absolute times: sequential actions add
  up, a `parallel` block lasts as long as its longest action, a scene starts when the previous
  one ends, and a transition starts its scene. Defaults are written down (reveal, hide and focus
  600 ms, camera, fade and morph 800 ms, highlight 1 s, trace 1.2 s, cut 0) and times are limited
  to 600 s. The JSON carries the resolved times.
- **Views and targets.** A story is `for` a diagram of the file or an imported one; `view` changes
  it, and a change of view without a `transition` is `story.missing-transition`. Targets are
  checked against the scene's view, with close ids as hints; `trace` takes a relation.
- **Channels.** Visibility, highlight and trace per target, focus and camera per view. Two actions
  of one channel that overlap in time are `story.conflict` on the later one.
- **Frames from data.** `storyTimeline` turns a story into plain data and `storyFrame` draws any
  instant from it and the laid-out views: opacity for visibility, accent outlines, partial tracks
  for traces with the relation's own effects suspended, dimming for focus, a view box for the
  camera, cross-fades and morphs between views. Every curve is linear and nothing depends on wall
  time, so the CLI (`export --story <id> --at <time>`), the canvas and, later, the player and
  videos draw the same frame.
- **Canvas frames in the webview.** In story mode the host sends the timeline, the scenes of the
  views and their effects once; the webview bundles motion and the renderer and draws each frame
  itself, so playing and scrubbing never wait for the host. Story mode is read-only; the timeline
  edits only the story's text (`setStoryTiming`, `insertStoryAction`, `removeStoryAction`,
  `insertScene`).
- **References.** Story targets are references like any other: renames reach them (also in other
  files of a project, and entity paths of C4 views through the model's references), removals list
  them as dependents, and definition, references and hover lead from them to the elements.

## Alternatives considered

- **Stories as a separate timeline file (JSON).** Easier to edit graphically, but the proposal
  keeps everything in the text, and references would not follow renames.
- **Frames rendered by the host.** Simpler, but every scrub would wait for a round trip; the
  functions are pure, so the webview draws the same frames.
- **Eased transitions.** Rejected for the same reason as for effects: linear curves keep CSS,
  code and video frame-exact.

## Consequences

- The player (change 15) plays the same timeline data with the same `storyFrame`.
- Video and GIF exports (change 17) sample `storyFrame` at their frame rate.
- `focus` lasting to the end of its scene and `camera` lasting until the next camera or view are
  choices the proposal leaves open; they are written in `docs/language/stories.md`.
