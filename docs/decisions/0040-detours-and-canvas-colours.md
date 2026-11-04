# 0040. Detours around boxes and canvas colours from the theme

Status: accepted (routing-detours-and-canvas-colours change, 13 October 2026)

## Context

Trying 1.5 in the playground, the owner pinned a connection to points of two boxes' borders and
asked the layout to choose again. **Recompute Layout** failed with "Text edits overlap", and the
playground then refused to start with the kept file: the new `place` statements were inserted at
the end of a route statement that the same plan deleted. A connector pinned to `client.south` and
`api.south` ran through `db`: the engine's route crossed it, and the search for a way around
(decision 0006's L and Z routes, 1.3) ran only for connectors with free ends in placed views. The
handle that adds a bend sat at the middle of the straight line between the route's controls, away
from the drawn connector. The outline shown around a box while connecting was pink in the
playground, whose theme is blue.

## Decision

- **Arrange composes its edits.** When it removes routes and inserts places, the insertion is
  planned on the text the other edits leave and composed with them (`composeEdits`, the piece table
  of batch plans), so the places land where the routes were.
- **Detours keep the ends.** In every mode, an `auto` or `orthogonal` connector without waypoints
  or lane whose route crosses a shape first tries the L and Z routes when both ends are free, then
  `detourRoute`: the shortest orthogonal path between 20 px stubs out of its own first and last
  points, on a sparse grid of lines through the stubs and 20 px outside the boxes near the ends,
  each change of direction costing 40 px. A new route is kept only when it crosses fewer shapes.
- **Handles on the line.** A stretch's handle sits halfway, by length, along the drawn connector
  between the projections of its two controls.
- **Colours from the theme.** Each render carries the theme's `selection` and `guide` colours,
  both defaulting to `accent`; the canvas sets `--mdg-select` and `--mdg-guide` on its stage. The
  two tokens are canvas-only: exports ignore them and styles cannot name them.

## Alternatives considered

- **Ask the engine to route around.** ELK should, but it still crossed a box with fixed-side
  ports, and placed views do not use its routes.
- **A full visibility-graph router for every connector.** More work per render for connectors
  that already cross nothing; detours run only when a crossing is found.
- **A canvas setting for the colours.** The owner asked for the theme, which already decides the
  diagram's accent.

## Consequences

- Drawings change only where a connector ran through a box, which `layout.connector-crossing`
  reported.
- Theme blocks accept `selection` and `guide`; the language stays 0.2.
