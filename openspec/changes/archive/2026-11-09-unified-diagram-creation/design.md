# Design

## Context

See `proposal.md` for motivation. The reviewed base is `origin/main` at `819e669` (9 November 2026). The existing working checkout contains unrelated agent-setup edits and workshop artifacts; this proposal lives in a separate worktree.

The restriction is in creation UI, not in project storage:

- `packages/playground/src/explorer/dialogs.ts` lists four kinds; `tree-model.ts::newDiagramText` builds one empty block from them.
- `packages/canvas/src/app.ts` repeats the same four-item list in both the empty state and toolbar menu.
- `packages/edit/src/diagrams.ts` and `types.ts` intentionally limit the low-level `createDiagram` operation to four profiles; a C4 view alone is invalid without a model.
- `packages/project/src/templates.ts` describes full-project examples, not additions to an existing document. Calling init or importing a project is the wrong lifecycle for adding one view.
- Mixed flow/free files were accepted in the private workshop project. No workshop content or account identity is needed in a regression fixture.

## Goals and boundaries

Create any of seven user-facing starting points in an existing workspace without introducing a new grammar profile. Keep the existing editing, undo, permissions and local-first contracts. Story editing and connector interaction have their own proposals.

## Decisions

### 1. One catalogue, several presentation surfaces

Add a typed `DIAGRAM_STARTERS` registry and `DiagramStarterId` in the dependency-free `@meltemi/diagrams-edit/starters` subpath, re-exported by `packages/editor` for the canvas and used directly by the explorer. Order: `flow`, `sequence`, `c4`, `gantt`, `whiteboard`, `kanban`, `free`. The registry holds stable ids rather than translated strings or DOM; hosts translate the same message key set for English and Spanish. Project-template metadata stays responsible for creating entire example projects. The pure subpath keeps source-planning and layout dependencies out of the browser bundle.

The explorer dialog uses compact selectable tiles with a name and one-sentence outcome, inside the existing dialog and focus model. It retains file name, destination, Create and Cancel. The canvas menu and empty state use the same identities, order and descriptions without forcing a seven-column segmented control on small screens. New project describes its cards as an initial template; it does not imply a lasting project kind.

Alternative rejected: copying seven arrays into explorer and canvas, or using grammar profiles as the catalogue. Both allow the surfaces to diverge again; the latter cannot express a Kanban starter as a free composition.

### 2. A starter is a structured source transaction

Add `createDiagramFromStarter { starter, id?, title? }` to the edit operations and a corresponding validated canvas action. The planner allocates names using every top-level binding, validates the resulting document, and returns the ordinary `EditPlan`; its return shape does not change. The host preallocates the view id with the shared top-level name allocator and passes it as `id`, retaining it as the created-view identity. For C4, the planner reserves that view id before allocating the model id. A direct operation without an id uses the same allocator. `createDiagram` remains the primitive for an empty profile block; starter creation composes that behavior with prepared content where required.

For the explorer, plan against an empty source and add exactly one file at the requested destination. For the canvas, append the starter to the active file using the existing block-insertion rules. Both paths use the same generated content, line-ending rules and escaping. Refused source edits write nothing; undo restores the exact prior text. Existing source is never formatted as part of creation. A new file uses the existing file-creation history mechanism; it does not claim a new project-wide undo contract.

Alternative rejected: inserting copied full-project templates, which would overwrite or introduce manifests, imports, asset paths and demonstration stories unrelated to the requested diagram.

### 3. Useful minimal content, no hidden prerequisites

| Choice | Result |
| --- | --- |
| Flow | One empty flow diagram, automatic layout |
| Sequence | One empty sequence diagram |
| C4 architecture | One self-contained model with a generic person and system, a uses relation and an initial context view |
| Gantt | One empty Gantt timeline, as the existing creation operation produces |
| Whiteboard | One free diagram with board preset, sketch theme, a heading and one editable sticky |
| Kanban | One free diagram with board preset, row container, three column lists and one editable starter sticky |
| Free composition | One empty free diagram |

C4 model and view are written in the same new file, so creation is atomic and has no import-path prerequisite. Adding another C4 starter creates fresh model and view ids rather than silently reusing a possibly unrelated model. The title follows the chosen name; generic starter labels follow the UI language. Once inserted, all text belongs to the author and language changes do not rewrite it. The starters use bundled themes and fonts and require no downloads or cloud calls.

Alternative rejected: making the first C4 choice launch an obligatory model-selection wizard, or generating a view that fails validation until a model is written manually. Existing-model view creation can remain with the established C4 authoring workflow; this catalogue creates a valid starting point immediately.

### 4. Host and session integration

`packages/editor/src/canvas/protocol.ts` re-exports the shared catalogue and validates the creation action's stable id. `CanvasSession` allocates and passes an explicit view id before planning, keeps it as `pendingDiagram`, and shows it once its source edit is applied. It does not infer the new view from a source diff or from a model id, and does not require extra `EditPlan` metadata. The explorer likewise knows the view id it supplied when generating a new file. The canvas uses the same catalogue in the browser and VS Code; it does not infer availability from the active view. Opening the new diagram leaves playback for authoring through the navigation contract of `story-editing-lifecycle`.

`packages/playground/src/explorer/{dialogs,tree-model,explorer}.ts` creates a new file without replacing workspace state or changing project settings. Read-only rendering hides editing commands, and the editor checks permission again at commit time. Path validation and file-collision errors remain localized and leave the dialog open.

### 5. Verification

Use synthetic fixtures for every starter, English/Spanish labels, name escaping, CRLF, comments, same-file id collisions, invalid source and undo. Compare ids/order across the explorer, canvas toolbar and empty state. Browser tests create the seven choices from representative flow and C4 projects; a project-template matrix checks that the other initial templates introduce no filtering. Check file and manifest bytes before and after addition. Webview tests exercise the shared canvas, including switching away from an active story. No tests write to the real private workshop project.

## Risks and trade-offs

- Seven choices overcrowd the current segment strip: use responsive tiles in the dialog and a compact menu on the canvas, with keyboard selection, scroll containment and visible focus.
- C4 starter names can collide with imports, models or stories: allocate against all top-level names and test repeated additions.
- Starter-local ids and free-diagram coordinates can drift from valid language rules: compile/layout every generated starter in tests with zero diagnostics.
- Parallel proposals touch the same packages: retain independent spec requirements and land navigation/selection regressions first, then integrate catalogue actions.
- The OpenSpec context contains historical product assumptions: this change preserves existing user documents and declares no project replacement behavior.

## Interfaces and files affected

`packages/edit`: starter ids, descriptors, structured operation, source planner, public exports and translated rejection messages. `packages/editor`: canvas protocol validation, advertised catalogue, pending-view selection and session tests. `packages/canvas`: menu/empty-state rendering and translated starter names/descriptions. `packages/playground`: explorer dialog and file creation, project-template wording, browser tests. `docs/editor.md` and its Spanish counterpart describe all creation paths. No new network interface or infrastructure change is involved.

## Review decisions

Recommended defaults are resolved above: seven choices everywhere, minimal valid content, C4 model plus context in one file, and append-only creation. Product review precedes implementation at the user's request.
