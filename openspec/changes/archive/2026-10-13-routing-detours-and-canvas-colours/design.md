## Context

`arrange` with scope `all` (1.5) deletes routes left with nothing and inserts new `place`
statements after the last statement of the last `placement` block. When that statement is a
deleted route, the insertion falls inside the deletion. `codeActions` plans that arrangement for
every analysis in the playground, so the error broke the page.

Connectors follow the engine's route in `auto` mode, and the anchor rules otherwise.
`avoidingRoute` replaces a crossing route only when both ends are free, there are no waypoints or
lanes, and the mode is `assisted` or `manual`; it chooses among L and Z routes between side
middles. A pinned end (compass side, point or named port) keeps its point and side, so no L or Z
route between middles applies.

Route handles come from `routeHandles(connector)`: the ends, the bends of `via`, and one segment
handle at the middle of each pair of consecutive control points. The drawn connector has extra
elbows, so those middles can be far from it.

The canvas draws its overlay with CSS variables: `--mdg-select` (VS Code's focus border) and
`--mdg-guide` (VS Code's info colour, pink `#e0398c` in the playground).

## Goals / Non-Goals

**Goals:** no crash; no connector through a box when a way around exists; handles on the line;
overlay colours that match the diagram and can be set in a theme.

**Non-Goals:** routing around connectors or labels; changing routes that carry waypoints (the
person drew them); a general-purpose router replacing the engine.

## Decisions

### Composing the arrangement

When routes are deleted and places inserted, `arrange` applies its other edits, compiles the
result, plans the insertion on it, and composes both into edits against the original text with
the same piece table as `planBatch` (`composeEdits`). The places land where the removed routes
were.

### Detours keep the ends

`detourRoute(from, to, obstacles)` takes each end as its box, the point the connector leaves or
enters and that side. It searches the shortest orthogonal path between 20 px stubs out of both
points (the same stub as the port elbows) over a sparse grid: the lines through the stubs and
20 px outside every obstacle and both end boxes. A step may not pass through an obstacle or an end
box; each change of direction costs 40 px; leaving the start stub, or entering the end stub, in
another direction than the stub's counts as a bend. Dijkstra over (grid point, direction). The
result replaces the route only when it crosses fewer shapes.

The layout tries, for an `auto` or `orthogonal` connector without waypoints and lane whose route
(the engine's or the anchor rules') crosses a shape: with both ends free, the L and Z routes
first; then, when still crossing, the detour from the route's own first and last points and sides.
This now applies in every layout mode.
Alternative: ask ELK to route around (it already should); the engine's routes still cross shapes
when the person pins ports, and assisted and manual layouts do not use the engine's routes.

### Handles along the drawn connector

`routeHandles` projects each control point (the ends and the bends of `via`) onto the drawn
polyline, in order, and puts the segment handle `i` at the middle, by length, of the stretch
between controls `i` and `i + 1`. Dragging it still inserts a bend at index `i` of `via`.

### Colours from the theme

The session sends `colors: { selection, guide }` with each render: the theme's `selection`, else
its `accent`, and its `guide`, else its `accent`. The canvas sets `--mdg-select` and `--mdg-guide`
on its stage from them; keyboard focus rings keep the editor's focus colour. `selection` and
`guide` are theme tokens with colour values, inherited like others, editable in the theme panel,
and not colour names in styles, since they mean nothing in an export.
Alternative: a canvas setting. The owner asked for the theme, and a theme already decides the
diagram's accent.

## Risks / Trade-offs

- [The grid grows with the number of shapes] → only crossing connectors are searched, and the grid
  has two lines per shape side; a few hundred shapes stay within the analysis budget.
- [Detours change drawings of existing files that had crossing connectors] → only those that
  crossed a shape, which `layout.connector-crossing` already reported.
