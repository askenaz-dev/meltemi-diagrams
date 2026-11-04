# Design

## Direction

Calm, compact surfaces with one editing intention visible at a time. Keep the canvas dominant;
the inspector presents its target, a compact tab row, then relevant controls. Tab changes are
immediate; existing disclosure motion and reduced-motion behaviour remain.

## Decisions

- Classify by stable field names in the canvas, never translated text. No edit protocol changes.
- Retain all panels in the DOM and toggle `hidden`. Switching tabs does not rebuild controls or
  discard drafts; host renders retain the existing guard for unfinished typing.
- Use roving tab focus, Left/Right and Home/End, labelled tabpanels and visible focus. Hide empty
  categories, retain the active category when available, otherwise use the first available tab.
- Style contains shape/fill/stroke; Text owns font, size, weight, text colour and alignment;
  Layout owns geometry/placement; Effects owns every effect card; Details holds identity/content.
- Theme tokens use the same categories while retaining their existing subsection headings.

## Alternatives

Accordion-only grouping leaves unrelated controls stacked together. Separate host implementations
would diverge. Adding protocol metadata is unnecessary because classification is presentation-only.

## Verification

Browser checks against real compiled diagrams cover field partitioning, keyboard navigation,
edits across renders, read-only panels and both host surfaces. Existing inspector scenarios select the relevant
tab before interacting. No new dependencies or public interfaces.
