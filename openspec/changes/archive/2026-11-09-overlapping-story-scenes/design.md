# Design

## Temporal contract

An optional `overlap <time>` statement appears in the scene header before actions, alongside
view/transition. Omission or zero means sequential. For a positive amount, the scene begins at
the preceding scene's end minus that amount. The amount cannot exceed either scene's duration;
the first scene accepts only zero. This describes the actual shared interval, keeps starts and
ends nondecreasing and admits three or more concurrent scenes. Story duration is the maximum end.

This is additive in language 0.2: `overlap` was previously invalid and existing valid files retain
their meaning. Preserve the existing evaluator and pixels for timelines without positive overlap.
Keep existing timeline/JSON fields compatible; start/duration already describe the schedule.

## Composition and transitions

All active scenes execute. For the same property/channel, a later scene has priority after its
claim starts; action order breaks ties within that scene. Preserve same-scene conflict diagnostics,
including invalid parallel actions, while allowing cross-scene claims under this rule. Anchor
interpolation to the state at the claim's start so an older scene cannot drag a newer camera or
opacity value indirectly. Focus expires at its scene end; other effects retain their documented
per-kind lifetime. Distinct targets remain independent.

The incoming scene's transition is configurable independently of overlap. With positive overlap,
actions and transition begin together and scene duration is their maximum. Sequential transition
behavior remains unchanged (transition then actions, summed). Opt-in overlap composition supports same-view and different-view
transitions, evaluating outgoing/incoming actions at their actual times rather than freezing them.
Where several views are concurrent, deterministic later-scene priority and the incoming transition
define the visible composite. The renderer, player and exports share this contract.

## Authoring and source safety

Use `setSceneOverlap {story,scene,durationMs}` and `setSceneTransition
{story,scene,transition,durationMs?}`. Zero overlap removes its declaration. The editor exposes
Sequential/Overlap, an overlap amount in seconds and Cut/Fade/Morph with transition duration.
Show maximum overlap and the derived start/end; reject invalid amounts without silent clamping.

Scene retiming cannot shorten below its content or the overlap needed by either neighbour.
Removing or inserting a scene clears the following scene's overlap, because it has lost its
predecessor, in one reversible source operation. Preserve the next scene's inherited view with
explicit view/cut headers where necessary. Keep action-reorder duration/selection guarantees.
Refuse cascading diagram edits that would remove actions and invalidate a written overlap rather
than silently changing its amount or emitting an invalid document.

Directed scene stills render that scene's closing state without later scenes masking it. The
ordinary timeline export and inspection report the concurrent global schedule. Update agent
guidance with authored overlap examples, deterministic conflict rules and inspection checks.

## Verification and alternatives

Cover two/three simultaneous scenes; same and separate targets, cameras and views; transition
entry; invalid bounds/first/empty scenes; shortening/deletion and exact inverse; directed stills,
player and MCP inspection. Old conformance and pixel references must remain identical.

Absolute scene offsets and arbitrary nested placement add a different scheduling contract. The
requested adjacent sequential/overlap choice is represented directly without inventing holds or
rewriting action groups. No migration or automatic private-project changes are required.

See [decision 0077](../../../../docs/decisions/0077-concurrent-story-authoring.md).
