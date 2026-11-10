# Design

## Context

Top-level actions are sequential; `parallel` children start together and its duration is the
longest child. The compiler derives starts from source order. There is no arbitrary offset
syntax. Source remains the authority, and comments and unrelated content must survive edits.

## Goals and scope

- Move an entire action or parallel group before/after a sibling within one scene.
- Preserve written durations, targets, parallel structure and the scene/story total.
- Preserve comments, line endings, unrelated stories, diagrams and export profiles, with exact undo.
- Distinguish click/select, body/reorder and end-handle/resize.
- Preview without source writes; commit once on a valid drop against the captured revision.
- Support pointer, touch and accessible keyboard/button alternatives in browser and VS Code.

Non-goals: free timestamp placement, overlaps, cross-scene moves, extracting parallel children,
moving transitions, left-edge trimming, scene reordering or changing the language.

## Decisions

### Discrete ripple insertion

Drop boundaries are the exact positions before/after remaining top-level actions. Do not round
existing durations or boundaries: numerical timing has millisecond precision. A body's drop
reorders the sequence; neighbours close/open its slot. Right-handle resizing keeps its existing
100 ms snap. The preview identifies this as reordering and shows the candidate start time.

Only top-level actions are movable. Give a `parallel` block a distinct header and outline with
its child count. Moving that header moves the whole block. Child bodies still select; their
duration controls remain available. Do not silently promote dragging a child to dragging its group.
Transitions and `view` statements stay at the beginning and are not insertion targets.

### Reversible source operation

Add `reorderStoryAction { story, path: [sceneIndex, actionIndex], index }`, where `index` is the
final sibling index after removal. Validate integer/range constraints; a current-index move is
a no-op. Nested paths and malformed source boundaries are refused. Relocate the exact action
with its attached leading and trailing comments using CST-aware edits, preserve LF/CRLF and
safe semicolon separation, compile the candidate, and use the normal inverse/undo mechanism.

### Gesture lifecycle and selection

A click selects and scrubs. Start a reorder after a small horizontal drag threshold, pause
playback and capture the pointer. Display a constant-width clip preview and an insertion marker.
Keep destinations in the original scene; an outside drop does not move source. Allow ordinary
vertical scrolling for touch until a horizontal gesture is recognized. Auto-scroll only an
overflowing track while dragging.

Capture playback/document/revision and source path at gesture start. Escape, pointer cancel,
lost capture, read-only, document/story change, or a source update cancels all transient state
without a write. A pointer-up produces exactly one structured edit. Keep selection and numeric
duration editing on the moved action's new path after acknowledgement, not on its old neighbour.
Rejected edits restore the original visual order and announce the reason.

Provide labelled Move earlier/Move later buttons and Alt+Left/Alt+Right on movable clips. They
use the same operation and guards. Disable unavailable directions; plain arrows retain scrubbing.

Very short and instantaneous top-level actions outside parallel groups receive a minimum-size
body cap in auxiliary lanes, without changing their actual interval. Keep its resize handle separate from the draggable body and
recalculate hit caps when tracks resize. A scene containing only instantaneous actions has no
distinct temporal drop positions: explain and provide the ordered buttons/keyboard controls
instead of inventing a temporal drag destination.

An unchanged same-revision refresh while a drop is being applied does not cancel its pending
acknowledgement. Block further panel writes until acknowledgement, rejection or a real source/
navigation change resolves it; selection and playback remain available.

## Alternatives

Absolute `at` offsets would support free placement, but also change conflict semantics, parallel
timing, scene duration, lane allocation and export/language contracts. Inventing holds or nested
parallel blocks during a drag would obscure intent and rewrite unrelated structure. This change
uses the existing sequence semantics and explicitly labels insertion-style movement.

## Risks and verification

Comment attachment and inline statements are data-loss risks: cover leading/trailing comments,
blank-line boundaries, block comments, LF/CRLF, semicolons, malformed input and exact inverse.
Indexed paths can become stale or point at a neighbour after moving: cover revision/document
changes and selected-action acknowledgement. Browser tests must exercise actual pointer moves,
right resize, cancellation, read-only and parallel groups rather than only protocol objects.

## Migration and open questions

No migration or new dependency. Existing files keep their meaning. No unresolved irreversible
decision blocks this insertion-style scope; free offsets remain a separately proposed capability.

See [ADR 0075](../../../../docs/decisions/0075-story-clip-reordering.md) for the recorded decision.
