## Why

A successful Mermaid import with findings can leave the input dialog open and invite duplicate imports. Connector handles are hard to discover and use at low zoom, and fractional layout coordinates can make visual alignment drift.

## What changes

- Close the input dialog when the imported file opens and keep the report available separately.
- Make both connector ends easier to grab and offer keyboard-operable endpoint changes from the connector menu.
- Keep the selection and unrelated source intact when a connector is reattached.
- Use the geometry shown by the canvas when aligning or snapping and preserve manual routes when materializing automatic layout.

## Scope

Post-1.0 canvas and playground work outside the original roadmap.

## Non-goals

- Universal diagram import.
