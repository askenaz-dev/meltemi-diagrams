# Design: A connection preview starts at its selected side

The handle gesture already stores `side`; only the preview falls back to the centre because it
has no exact `start` attachment. Pass that side into the preview's source-point calculation.
Use existing `portPosition`, `onOutline` and `outOfFrame` helpers to project the side midpoint
onto the shape and rotate it, then use the existing screen conversion once.

Keep the no-side fallback and Gantt bar endpoint unchanged. Exact border attachments continue
to take precedence. Do not populate `drag.start` for handle gestures: release handling uses that
field to persist a pinned route, which would change drops onto a target's automatic endpoint.

Browser regressions must inspect the live wire's origin, including transformed and nonrectangular
elements, exact border starts and cancellation. Final-route-only tests missed this defect.
The existing host suites verify the shared canvas in both its browser and VS Code integrations.

No public API or source format changes.
