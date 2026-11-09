# Design

## Presentation and content

The exported diagram is the primary surface. The timeline's Export HTML action opens the existing
chooser with that story and HTML selected. Add explicit options for heading/description, textual
summary, element details and playback controls. Browser defaults omit the first three and retain
controls. Keep zoom/pan independent of optional details; do not misuse the existing interactive
flag, which disables navigation too. Programmatic defaults remain compatible.

Thread options through export requests, page/element generation and mount attributes. Omitted
extras do not create their panels or include unnecessary optional detail payloads. Necessary
diagram labels, geometry, ids and timing remain in the offline document. These controls describe
presentation, not a claim that the HTML conceals data needed to draw the diagram.

## Fullscreen interaction

Place a labelled fullscreen control on the player surface, including clean presentation. Request
fullscreen for the player host so unrelated page headings/summaries are excluded. In fullscreen,
the stage fills available space while enabled controls stay reachable. Escape restores prior
layout and focus. Reflect native fullscreenchange and handle denial/unavailable APIs gracefully;
multiple players must not alter each other's state. Keep offline, reduced motion and accessible
names/keyboard operation. Reuse the product's restrained control styling.

## Verification

Test generated options and old defaults, absence of excluded UI/payload extras, selected-story
export-dialog routing, downloaded HTML, fullscreen enter/exit/failure, multiple instances,
English/Spanish and narrow/reduced-motion layouts. Run player browser, playground browser,
export visual/acceptance and affected browser verification after the combined story changes.

See [decision 0077](../../../../docs/decisions/0077-concurrent-story-authoring.md).
