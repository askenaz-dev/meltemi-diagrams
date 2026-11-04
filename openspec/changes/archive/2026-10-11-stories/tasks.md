## 1. Language and model

- [x] 1.1 Story types (`StoryDefinition`, scenes, actions, transitions, references) and `Document.stories`; analyzer with timing, defaults, targets per view, diagnostics `story.unknown-diagram`, `story.invalid-target`, `story.missing-transition`, `story.conflict`, `story.empty-scene`; JSON; `compile(text, { diagrams })`.
- [x] 1.2 Project: `importedDiagram` resolver and recompilation of story files; project validation. Corpus: purchase moves to `valid/`, invalid files for the new codes, project corpus with a story in `stories/`.

## 2. Timeline and frames

- [x] 2.1 Scene: group `opacity` and scene `viewBox`, written by the renderer.
- [x] 2.2 `storyTimeline` and `storyFrame` in motion: visibility, highlight, trace with suspension, focus, camera, transitions (cut, fade, morph), local effects; tests for every scenario.

## 3. CLI

- [x] 3.1 `export --story <id> [--at <time>]` and usage errors; tests.

## 4. Editing

- [x] 4.1 Edit operations `setStoryTiming`, `insertStoryAction`, `removeStoryAction`, `insertScene`; rename and removal reaching stories; project-wide rename into story files.
- [x] 4.2 Language services: completion, hover, outline, definition, references for stories.
- [x] 4.3 Canvas story mode: protocol, session (timeline, scenes, plans, story actions), webview timeline with play, pause, scrub, drag to retime, add to scene, and local frames; webview and VS Code tests.

## 5. Docs

- [x] 5.1 `docs/language/stories.md`, grammar, diagnostics, model JSON, editor guide, README, skill reference and example, decision 0023; `pnpm skills:sync`.

## 6. Verification

- [x] 6.1 `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm vscode:test-webview`, `pnpm vscode:test`, `pnpm vscode:package`, `pnpm licenses:inventory --check`; review story frames.
