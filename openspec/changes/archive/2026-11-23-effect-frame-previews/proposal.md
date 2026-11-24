# Proposal

## Why

An agent asked to "animate the arrows" of an existing PKCE diagram wrote a story first and added
the effects afterwards: the skill names both forms of motion without saying which request asks for
which. Having written `animate`, it could not check the result through the MCP either. The engine
already draws a diagram's effects at an instant when `preview` receives `at` without a `story`, but
the tool describes `at` as "the story's time", the reference says the same, and the report beside
the picture says nothing of motion, so the agent exported an animated SVG with the command line to
see whether the particle moved.

This is a post-1.0 authoring improvement outside `docs/roadmap-1.0.md`.

## What Changes

- The skill says, in its workflow and with a short example of each, that "animate this arrow" or
  "animate the diagram" means `animate` on the existing diagram's relations, checked in the
  diagram's ordinary view, and that "show me the flow step by step" means a `story` with scenes,
  times and actions. The language, stories and MCP references say the same where each is read.
- `preview` with `at` and no `story` is a stated part of the tool in the hosted endpoint, the local
  account server and folder mode: the diagram with its effects at that instant. Without `at` the
  picture stays still, as before.
- The report of such a frame carries `motion`: the instant, the length of one loop and, for each
  effect, its target, timing, phase and where its moving marks are (a flow's particles, a trace's
  head) with how far along the line each has travelled. Two frames at different instants prove
  the mark advanced without reading the SVG's paths or seeing the picture.
- A shared journey proves it through the tools alone against the Worker's test host and as a new
  step of the hosted acceptance gate; folder mode has its own integration test.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-skill`: the skill tells effects on a diagram from stories and how to check each.
- `mcp-previews`: effect frames of a diagram at an instant, and the `motion` report beside them.
- `mcp-acceptance`: a step for effect frames; the hosted gate grows to 36 steps.
- `motion-clock`: the state of a plan at an instant, derived with the frame's own arithmetic.

## Impact

Changes touch `packages/motion` (the state of a plan at an instant), `packages/editor` (the export
answers it beside a frame), `packages/mcp` (report, schema, descriptions, cache key),
`packages/cloud` and `packages/cli` (the handlers pass the report through), `packages/acceptance`,
the canonical skill with its copies, and the agents and cloud guides in English and Spanish. No new
dependency, tool, scope or grammar; the picture drawn for any existing request is byte-equal.

## Non-goals

- Animated pictures (GIF, video, animated SVG) through the MCP: a frame is a still picture.
- A `motion` report for story frames: `inspect_story` already gives their compiled timeline.
- Changes to the canvas, the player or the command line's `export`.
- Publication, deployment and production verification, which belong to `delivery`.
