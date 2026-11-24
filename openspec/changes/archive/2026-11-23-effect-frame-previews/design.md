# Design

## Context

Motion has two forms in the language. `animate <target> { effect … }` belongs to a diagram and
plays wherever the diagram is shown: the canvas, the animated SVG, the player. A `story` is a
separate block that walks an audience through diagrams with scenes on one clock. The skill's
workflow only says "to walk an audience through a diagram, add a `story`", and its front matter
lists "motion effects and stories" side by side, so a request to animate arrows is read as a
request for a story.

`produceExport` already turns a diagram into its frame at `at` (`planMotion`, then `sceneAt`), and
the preview engine forwards `at` whatever the target. A probe against `mdg mcp --folder` confirmed
that `preview { path, at: "300ms", format: "svg" }` on a diagram with one `flow` effect and no
story moves the particle (x 176 at 0 ms, 232.75 at 300 ms, 289.5 at 600 ms). What is missing is the
contract: the description, the reference, tests, and a report that says what moved.

## Decisions

### The skill decides by the request's words

The workflow's first step gains the rule and `SKILL.md` a short section, "Motion: effects or a
story", with the two phrasings, the smallest example of each and how each is checked. The rule is
stated by what the person asks for, not by feature: animate an arrow or the diagram is `animate`
on the diagram that exists (naming an anonymous relation with `as <id>` first); a walkthrough,
steps, a presentation or a demo is a `story`. The agent adds no story when only effects were
asked, and no effects when only a story was. `language.md` (Animate), `stories.md` (its opening)
and `mcp.md` repeat the rule where an agent lands when it follows either form.

Alternative rejected: a new reference file for motion. The distinction is one decision made
before writing; it belongs in the workflow an agent reads first, and the two references exist.

### `at` without `story` is the diagram's effects at that instant

No new argument. `at` keeps its type and its meaning of "the time of the frame"; the story gives
the clock when one is named, the diagram's effects otherwise. Without `at` the diagram is drawn
still, so every existing request answers the same bytes. The descriptions of `preview` (account and
folder catalogues), the server instructions and the references say so.

Alternative rejected: a `motion` or `effects` flag. It would add a second way to say what `at`
already says, and a frame "with effects" has no meaning without an instant.

### The report says where each effect is

A PNG 1280 pixels wide shows a particle as a dot of a few pixels, and an SVG shows it as a path's
`d`. Neither lets an agent claim "the mark advanced along the arrow" without geometry of its own.
The report beside an effect frame therefore carries:

```json
"motion": {
  "atMs": 300,
  "loopMs": 1200,
  "effects": [
    {
      "target": "authorize", "role": "relation", "effect": "flow",
      "durationMs": 1200, "delayMs": 0, "repeat": "forever", "direction": "forward",
      "phase": 0.25,
      "marks": [{ "x": 236.75, "y": 48, "along": 0.25 }]
    }
  ],
  "truncated": false
}
```

- `target` and `role` are the `data-id` and `data-role` of the SVG group the effect runs on.
- `phase` is the progress of the current cycle, 0 to 1; `null` before the effect's delay and after
  its last repeat, when the target is drawn without it.
- `marks` are the moving marks: each particle of a `flow` and the head of a `trace`, with the
  centre in the picture's own coordinates (SVG units, or pixels of a PNG) and `along`, the share
  of the line travelled in the direction the effect runs. `dash` and `pulse` have no mark; their
  `phase` is their state.
- `loopMs` is one seamless loop of every effect (`motionLoop`), `null` when there is none under
  ten seconds or nothing is animated. An empty `effects` says the diagram animates nothing drawn.
- At most fifty effects are listed; `truncated` says when there were more.

`motion` is present exactly when `at` was given for a diagram; a still picture and a story frame
carry none. The state comes from `motionStateAt(plan, t)` in `packages/motion`, written beside
`sceneAt` and sharing its arithmetic (`phaseAt`, the particle and trace helpers the frame itself
draws with), so the report cannot disagree with the picture. `produceExport` answers it beside
the frame's text; the preview engine passes it on and the core scales the marks for a PNG.

Alternative rejected: computing the state in the MCP package from the SVG, or laying the diagram
out a second time. Both make a second source of truth for what the frame drew.

### The cache

A frame's key already holds `at`. The key gains a shape number so an answer stored before this
change, whose report has no `motion`, is never served for a request that now promises one.

### Acceptance

A shared journey (`effectFramesJourney`) writes a run-owned file holding a diagram with a named
relation, `animate … { effect flow }` and no story; asks for the still picture and for frames at
two instants; and asserts no `motion` on the first, one active effect on the others, a mark that
advanced (`along` and its coordinate), the same revision and different pictures. It runs against
the Worker's in-memory host in the package tests and as a hosted step, which makes the hosted gate
36 steps. Folder mode has its own integration test with the real `mdg mcp --folder`, where the
agent has the MCP alone and no account.

## Interfaces and packages

- `packages/motion`: `motionStateAt`, `MotionState`, the shared particle and trace helpers.
- `packages/editor`: `produceExport` answers `motion` beside the text of a diagram's frame.
- `packages/mcp`: `RenderReport.motion`, its schema, `MAX_REPORT_EFFECTS`, descriptions and
  instructions, the cache key's shape, one helper for the tools' report.
- `packages/cloud`, `packages/cli`: the handlers answer the report through that helper.
- `packages/acceptance`: the journey, the hosted step and the count.
- `skills/meltemi-diagrams` and its copies; `docs/agents.md`, `docs/cloud.md` and their Spanish
  pairs; `CHANGELOG.md`.

## Risks and verification

- The report drifting from the frame: one arithmetic for both, and a test that reads the particle
  from the rendered frame and compares it with the mark.
- A changed picture for existing requests: the refactor keeps the frame's numbers; the existing
  frame and export tests stay unchanged and green.
- The hosted gate's count: `HOSTED_STEP_COUNT` and the tests that name it change together; the
  recorded results of earlier runs are not edited.
- The previews' rate (thirty a minute): the journey asks for three.

Hosted staging and production are not run by this change; the journey passing against the Worker's
test host does not claim a hosted run.
