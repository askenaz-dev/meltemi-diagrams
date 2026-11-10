# 0076 — Illustrated diagram starter choices

## Context

Small monochrome icons do not explain the seven New diagram choices. The owner requested color
and previews. Several starters intentionally create an empty document, so rendering their exact
initial source would not communicate what their type can express.

## Decision

Use seven local, static inline SVG examples in the browser dialog, with a shared palette derived
from theme tokens, existing names/descriptions and one localized examples hint. The drawings are
decorative; native radio controls retain selection, keyboard navigation and accessible naming.
Use the existing wide dialog only here and adapt the grid to available space.

## Alternatives considered

Rendering source while opening the form adds work and gives empty previews for empty starters.
Raster images require assets and theme variants. Recolored small icons still do not show the
structure of the diagram. Local SVG examples remain crisp and immediately available offline.

## Consequences

The gallery communicates each kind without changing its creation payload or initial source.
Illustrations must remain representative, distinguishable without color, nonfocusable and
readable across themes and viewport sizes. They are examples of capability, not screenshots of
the exact initial document.
