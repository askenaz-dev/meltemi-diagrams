## Context

The stage uses one live region for selection descriptions and action feedback. Document and diagram changes can reuse the stage and its live region.

## Decision

Track whether the live region holds a selection description. Clear that description when focus leaves the stage, the diagram changes, or a render replaces the selection. Keep the live region mounted so it can announce the next selection.
