## Why

Trying 1.5 in the playground, the owner connected `api` to `client` from a point of `api`'s border
and asked the layout to choose again. Three things went wrong:

- **Recompute Layout failed** with "Text edits overlap", and the playground then refused to start
  with that file: when every route of the last `placement` block is removed, the new `place`
  statements were inserted at the end of a statement that was being deleted. The playground plans
  that action for its quick fixes, so the failure surfaced on every analysis.
- **A connector ran through a box**: `client -> api` pinned to `client.south` and `api.south` was
  drawn straight through `db`. The engine's route crossed it, and the search for a way around only
  ran for connectors with free ends in `assisted` and `manual` mode.
- **The handle to add a bend floated in the void**: segment handles sit at the middle of the
  straight line between the route's control points, not on the drawn connector.

They also asked why the outline shown around a box while connecting is pink when the theme is
blue, and that those colours come from the theme.

## What Changes

- Fixed: arranging everything when every route goes writes the new places where they were.
- **Connectors go around boxes in every mode, with any ends.** When a connector without waypoints
  or lane, drawn by the engine or by the anchor rules, runs through another shape, it takes the
  shortest orthogonal detour that leaves and enters its boxes where it did, with a cost per bend,
  if that crosses fewer shapes. Connectors with free ends first try the existing L and Z routes.
- **Segment handles on the connector.** The handle that inserts a bend sits at the middle, by
  length, of the stretch of the drawn connector between two control points.
- **Canvas colours from the theme.** The selection, handles, outlines, magnets and guides of the
  canvas take the diagram theme's `accent`; the new theme tokens `selection` and `guide` change
  them. They are canvas-only: exports do not use them.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `connector-routing`: connectors around boxes in every mode and with pinned ends.
- `diagram-canvas`: segment handles on the drawn connector; overlay colours from the theme.
- `theme-tokens`: `selection` and `guide`.
- `layout-actions`: arranging everything when every route goes.

## Impact

- Layout: `detourRoute` in `packages/layout/src/routing.ts`; routing in `layout.ts`.
- Edit: `arrange` composes its insertion after the removals (`composeEdits` in `batch.ts`).
- Editor/canvas: `routeHandles` along the drawn points; `CanvasRender.colors`; CSS variables.
- Model: theme tokens `selection` and `guide` (colour values, not colour names for styles).
- Docs: `docs/language/styles.md`, `docs/language/layout.md`, `docs/editor.md` and their Spanish
  versions; CHANGELOG 1.6.0.
