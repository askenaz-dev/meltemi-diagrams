## Why

The proposal separates local effects from finite stories: a story explains a path through a
diagram in scenes with times, computed on the same clock as the effects so playing and exporting
give equivalent states. Its rules: sequential actions add up, a parallel block lasts as long as its
longest action, objects that are revealed start hidden, temporary emphasis returns to the base
style, focus changes emphasis and the camera changes framing without moving nodes, a change of
composition between scenes needs an explicit transition matched by id, incompatible animations of
one property are a diagnostic, and a trace suspends the local effect of its relation. Deleting an
entity finds its references in stories. Today `story` blocks only parse (`block.unsupported`).
Roadmap change 14 asks for story blocks with every action, durations and rules, and a story
timeline in the editor that shares undo with the text and the canvas.

## What Changes

- **Language.** `story <id> for <diagram> { title; description; scene … }` compiles. A scene is
  `scene <id> ["Title"] { … }` with an optional `view <diagram>` and `transition cut|fade|morph
  [over <time>]`, and actions `reveal`, `hide`, `highlight`, `focus`, `camera` (on elements,
  relations, notes and fragments, with `over <time>`), `trace <relation> [over <time>]`,
  `hold <time>` and `parallel { … }`. Durations follow the proposal: sequential actions add up, a
  parallel block lasts as long as its longest action; the purchase example lasts 7.4 s. Stories can
  target diagrams of the same file or imported ones, of every profile.
- **Diagnostics.** `story.unknown-diagram`, `story.invalid-target`, `story.missing-transition`,
  `story.conflict` (two actions on the same property of a target at overlapping times),
  `story.empty-scene` (warning), with `ref.unknown-element` for unknown targets.
- **Timeline and frames** in `@meltemi/diagrams-motion`: `storyTimeline(story)` (scenes and actions
  with absolute times) and `storyFrame(timeline, views, t)`, the scene at time t: visibility,
  highlights, traces drawn along their relation with the relation's local effects suspended,
  focus that dims the rest, the camera as a view box, transitions between views (cut, fade, morph
  of elements matched by id), and the local effects on the same clock. Nothing moves a node except
  a morph between two compositions.
- **Scene.** Groups may carry an opacity and the scene a view box; the renderer writes them.
- **CLI.** `meltemi-diagrams export --story <id> [--at <time>]` writes a story frame (the final
  state by default); `validate` reports story diagnostics.
- **Editing.** Edit operations `setStoryTiming`, `insertStoryAction`, `removeStoryAction` and
  `insertScene`; renaming an element renames it in stories, and removing it lists and removes its
  story references. Language services: completion, hover, outline, definition and references for
  stories and scenes. The canvas gets a story mode: a story picker, frames drawn in the webview, and
  a timeline with play, pause and scrubbing, scene and action bars, durations changed by dragging,
  and actions added from the canvas selection — every change is a text edit, so undo is shared.
- **Docs.** `docs/language/stories.md`, grammar, diagnostics, model JSON, editor guide, skill
  reference, decision 0023; the purchase example moves from `parse-only` to `valid`.

## Capabilities

### New Capabilities

- `story-language`: story blocks, scenes, actions, timing rules and diagnostics.
- `story-timeline`: the timeline and the frame at any time.
- `story-export`: story frames from the command line.
- `story-editing`: edit operations, references, language services and the timeline in the editor.

### Modified Capabilities

None.

## Impact

- `Document.stories`; `compile(text, { diagrams })` resolves imported targets and the project
  passes the resolver; `block.unsupported` remains for `export` blocks only.
- `@meltemi/diagrams-motion` grows the story evaluation; the webview bundle includes motion and
  render to draw frames locally.
