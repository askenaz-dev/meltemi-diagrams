## Context

See `proposal.md` for the problem and scope. The relevant behavior is shared by the browser playground and the VS Code webview through `CanvasApp`.

### Evidence established before implementation

- `packages/motion/src/css.ts` applies the `mdg-m` class to the first stroked primitive of a connector for a moving-dash effect. Its stylesheet then sets `pointer-events: none` on every `mdg-m` primitive. In this case the primitive is the real connector body, whereas particles, halos and trace overlays are decorative.
- `CanvasApp.hit()` in `packages/canvas/src/app.ts` identifies a relation through the DOM event target's owning relation group. `setSvg()` adds separate transparent stroke targets for Gantt dependencies and free line objects, but not for the other relation profiles.
- A bounded headless Edge check using the actual `analyzeDocument` and `renderDiagram` exports reproduced the distinction: the midpoint of a static relation returned its relation polyline from `elementFromPoint`; the same relation with `animate link { effect dash }` returned the background and had computed `pointer-events: none`. A press three pixels away from the thin static line also missed, confirming inadequate reach at ordinary zoom. This checked browser hit targeting, not the complete application selection loop.
- The source and a pure-helper check establish that `selectInRect` already selects a connector when every routed point is inside the rectangle, including a rectangle dragged in reverse. Crossing only part of the connector returns no selection by the current contract. The existing curved-connector webview scenario also covers full containment. The reported failure of a fully enclosed connector in the live application has **not** been reproduced; implementation must retain a regression for the owner's nested, animated example rather than claiming the containment algorithm is universally broken.
- Connectors crossing titled containers can be rendered as multiple visible stroke primitives. The current dash effect annotates the first primitive. A hit-area fix must cover every visible piece, even when a piece has no animation class. Partial dash animation across those pieces is a related motion-rendering issue, not the established cause of every selection failure.

## Goals / Non-Goals

**Goals:** stable body selection independently of motion phase; predictable rectangle gestures; hit tests on real geometry rather than empty bounding-box space; a common behavior for the shared hosts without writing source during selection.

**Non-Goals:** catalogue changes are in `unified-diagram-creation`; story lifecycle changes are in `story-editing-lifecycle`; release and deployment work is in `delivery`.

## Decisions

### 1. Separate interaction geometry from animated decoration

Add canvas-only, nonanimated hit primitives under each relation's drawing. Build them from all of the real connector stroke pieces and curves, excluding arrowhead decorations, labels and motion overlays. The source geometry already distinguishes the connector's track, visible pieces and label; reuse that information or factor a small shared helper instead of reconstructing a curved path from straight endpoint anchors.

Strip animation classes and animation styles from those targets. Give them a transparent continuous stroke and explicit stroke hit testing. Dashed and dotted paint gaps remain selectable, while structural gaps protecting a container title and genuinely clipped-out pieces do not become invisible input barriers. The targets stay inside the owning relation group so `hit()` retains stable ids. The label remains above the target, preserving its label-specific drag and edit behavior; overlay handles retain their higher input priority.

Alternative rejected: remove `pointer-events: none` from `.mdg-m` globally. That would allow particles, pulses and traces to intercept presses and would still leave very thin or dashed lines hard to hit. An override only on the real dash primitive is narrower, but a separate interaction target also fixes unanimated thin strokes and dash gaps consistently.

### 2. Keep pointer reach constant in screen coordinates

Use the same six-screen-pixel reach beyond the painted stroke as the canvas's pen interaction. Convert it using the current zoom and refresh it when zoom changes, without changing document geometry. Apply the existing viewport offset and element/group transforms once; scroll, pan and zoom must not shift the target away from the drawing. A pointer outside this reach must continue to reach the actual object or background underneath.

The helper boundary is internal to `packages/canvas`; it may extend the existing stroke-hit synchronization rather than adding a new host protocol message. Tests must observe hit targeting and selection through public canvas behavior rather than assert a specific implementation class name.

### 3. Use directional rectangle selection instead of replacing containment

Determine the mode from the horizontal drag direction before normalizing the rectangle:

- left-to-right, including a vertical drag with no horizontal displacement: contain complete objects and connector routes;
- right-to-left: crossing selection, collecting a connector when one of its visible stroke segments intersects the area, and ordinary nongroup objects whose actual drawn shape intersects it;
- enclosing groups keep the full-containment rule in both modes, so a small rectangle inside a large account band does not inadvertently select that enclosing container.

Use exact segment/rectangle tests on the drawn polyline, including sampled curves and orthogonal bends; do not use a connector's bounding rectangle alone. For nongroup shapes reuse the existing outline/shape geometry; free lines and pen strokes use their paths rather than their often mostly empty bounding boxes. Hidden layers and wholly clipped-out drawing are ineligible in either mode.

Preserve Shift/Ctrl additive selection and its starting selection, normalize rectangles on both axes, and retain existing gesture arbitration for mouse, stylus, touch pan, the relation tool and story playback. The pure `selectInRect` interface can gain an explicit internal mode/options argument with containment as its default; its callers choose the mode rather than inferring it again from normalized geometry.

Gantt task, milestone and section band selection keeps its existing chart-specific touched-row behavior. Directional containment/crossing is applied to Gantt dependency connectors without replacing the chart's task gestures. When a band includes tasks and dependencies, the last touched task remains the primary selection so Tab continues to the following row.

Alternatives: intersection for every drag would make surrounding several boxes select passing connectors accidentally; containment-only with better documentation would not provide the area-crossing behavior the owner expects. The directional distinction is the recommended reviewable behavior. It changes selection only, never source.

### 4. Make the mode discoverable while dragging

Draw a solid-outline containment band and a dashed-outline crossing band, using the existing theme selection colour and a shared translucent fill. Keep the indication visible under reduced motion and without relying on colour alone. A localized status/accessible announcement names the active mode; the editor guides describe the direction and the special treatment of enclosing groups. No persistent preference or project type is introduced.

### 5. Test the real input path in both shared hosts

Pure geometry tests cover containment, reverse rectangles, crossing an elbow or a curve, false-positive bounding boxes, clipping and hidden layers. Browser regressions press the connector body away from its label and endpoints, including a dash gap, and assert the actual selected relation and available inspector. Cover all supported relation profiles where appropriate, both 49% and ordinary zoom, pan and a scrolled host, nested titled containers, reduced motion, read-only inspection and moving decorative overlays. Preserve the existing endpoint/label behavior and ensure selection alone creates no edit plan.

## Risks / Trade-offs

- A wider transparent target could steal a label or a nearby handle → keep targets beneath labels and overlays, test adjacency and use only stroke geometry rather than a filled bounding box.
- Right-to-left crossing is a deliberate addition rather than a reproduced containment fix → distinguish it in UI and documentation and preserve the left-to-right contract with explicit regressions.
- Curves, clipping and title gaps can diverge from a raw routed line → derive targets from rendered pieces and test false positives in protected holes and in the empty interior of a curved route's bounds.
- A small crossing rectangle could catch a large enclosing group → groups always require full containment; test an arrow wholly inside nested account/control-plane bands.
- Exported SVG or motion behavior could change accidentally → keep hit geometry canvas-only and assert that static/animated exported SVGs contain no interaction targets and motion overlays remain noninteractive.

## Affected modules and interfaces

- `packages/canvas/src/app.ts`: `setSvg`, stroke-hit synchronization, band completion and interaction precedence; `packages/canvas/canvas.css` and the canvas message catalogs for band feedback.
- `packages/editor/src/canvas/selection.ts`: `selectInRect` mode/options and geometric intersection helpers, exposed through the existing editor/canvas internal package surface.
- `packages/editor/src/canvas/routes.ts` and existing layout shape helpers: reuse `outlineOf`/drawn geometry and transformed shapes rather than introduce a public rendering contract without need.
- `packages/motion/src/css.ts`: the verified decorative-class interaction must remain covered; factor only if required to identify base connector primitives safely. No animation schema change is planned.
- Shared webview/playground tests and `docs/editor.md` with `docs/es/editor.md`.
