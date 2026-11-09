# Design

## Context

The preview tool supports `story` and `at` and has parity tests with CLI export. Its report describes a rendered frame, not the story timeline. `storyTimeline` in `packages/motion` already exposes deterministic scene and nested action timing; computing times separately in an MCP handler would create another source of truth.

## Decisions

### Compiled, read-only timeline inspection

Use `inspect_story { project, path, story }` with `projects:read` scope and ordinary project access checks. Folder mode takes `path` and `story`, reads the current files and returns a content-derived revision as snapshot identity, not a writable cloud revision. The result includes revision, path, story id/title, total duration, ordered scenes with view/start/end/duration, transition timing and nested action trees with source paths, targets and intervals. Include each scene's final-state preview instant from `sceneStills`.

The shared renderer engine compiles project files and obtains the story through resolved project compilation, then calls `storyTimeline`. Hosted inspection runs in the renderer Durable Object via the existing core/RPC boundary; local servers use the same core in process. It does not rasterize or lay out images and does not need binary assets. Unknown path/story and malformed inputs are refused. Compilation errors return `diagram.invalid` with bounded diagnostics; warnings are reported with a successful result. The tool does not mutate source, playback, sharing or versions.

Alternative rejected: deriving scene times in the agent or adding a CRUD endpoint for each scene. Source remains the editing interface; inspection supplies the engine's authoritative interpretation.

### Bounded contract

Timeline structure follows existing story safety limits. Preserve action nesting and absolute times rather than flattening parallel semantics. Expose end times as start plus compiled duration. All fields are ordinary JSON and the schemas are shared by hosted/local/folder catalogues. The result is tied to the read snapshot; agents compare revisions before combining inspection and preview results. Folder previews retain the same content-derived revision used by inspection, so this comparison also works without an account. No promise of atomic multi-call snapshots is made.

### Agent guidance and verification

The skill teaches read current source/revision, preserve unrelated blocks/comments, prepare one logical edit, write with revision/idempotency protection, re-read on conflicts, validate the whole project, inspect timing, then preview scene starts, meaningful midpoints and final-state instants. Durations derive from transitions plus sequential actions; parallel groups take their longest child; a final hold adds a pause. Examples cover separate imported diagrams and view transitions. Version creation is a whole-project snapshot of the state at call time, not a revision-pinned story undo.

### Acceptance journey

Use a run-owned generic project with a preserved diagram/comment and unrelated story. Create an agent-authored story, inspect sequential/parallel timing, insert a human comment through a second revision, reject a stale agent write and merge it, change timing and reorder scenes, preview compiled boundaries, then delete only the authored story and confirm the preserved content remains. Include a dependent export profile so invalid deletion is refused before an explicit scoped cleanup. The suite registers the extra step and strict hosted counts consistently; local integration tests execute the same behavior without real account credentials.

## Interfaces and packages

- `packages/mcp`: shared catalogue and schemas, inspection request/outcome and core/engine method.
- `packages/cloud`: renderer RPC forwarding and authenticated MCP handler.
- `packages/cli`: local-account and accountless-folder handler, shared drawing engine method.
- `packages/acceptance`: automated lifecycle step and host-gate expected count.
- `skills/meltemi-diagrams`: references, example and generated skill copies.

## Risks and verification

- Timeline/view keys must preserve imported file identity: use resolved compilation and test imported diagrams.
- Widened RPC interfaces affect test stand-ins: update them explicitly and typecheck the complete workspace.
- An accepted source replacement can still omit unrelated content: preservation assertions are part of the lifecycle test and guide.
- Boundary previews are static samples, not proof of smooth video playback: retain existing player/export suites and do not claim visual continuity from timing inspection alone.

All product changes are authorized by the owner after proposal review. No production data or credentials are used for the implementation tests.
