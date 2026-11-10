# Design

## Visual thesis

A calm diagram gallery with small, crisp vector examples: color belongs to the diagram content;
the existing blue remains the selection and focus signal.

## Content plan

Keep the dialog title, destination and name field. The type field shows a brief examples hint,
then seven selectable illustrations with names and descriptions. Flow shows connected steps and
a decision, sequence shows lifelines/messages, C4 a person and a system boundary, Gantt a time
axis with dependent bars, whiteboard sticky notes and a sketch, Kanban three columns, and free
composition independently arranged shapes and selection handles. Keep the existing action footer.

## Interaction thesis

Selecting anywhere in a tile selects its native radio, including its drawing. Hover and focus
use restrained border/background transitions already present in the product, with reduced motion
respected. Illustrations stay static so the choice is readable at a glance.

## Decisions

Use inline SVG built with the existing DOM helper and a small shared palette derived from theme
tokens. No image requests, generated bitmaps, SVG IDs or engine initialization are needed.
Examples are decorative (`aria-hidden`, nonfocusable); labels/descriptions and the radio group
remain the accessible content. Shapes distinguish types independently of color.

Use the existing wide dialog option only for New diagram: three columns when space permits,
two at intermediate widths and one on phones. Give the preview a shallow landscape proportion,
so all seven fit in a desktop dialog without excessive height. Keep header/footer available
while the body scrolls on short screens. Other name dialogs retain their existing dimensions.

Keep the shared seven identities, order, creation payloads, validation, cancel and focus return.
All examples are illustrative possibilities: several starters intentionally begin empty. Add a
single English/Spanish hint to make this clear without technical language.

## Alternatives and risks

Rendering each starter dynamically would add model/layout work to opening a routine form, and
empty starters would provide unhelpful previews. Raster examples add assets and theme variants.
Small native SVG examples communicate the type with no network or new dependency. See
[ADR 0076](../../../../docs/decisions/0076-diagram-starter-previews.md).

Check text contrast, visible selected/focused states, SVG sizing and viewport bounds. Use real
browser creation, native radio keyboard navigation, preview clicks, English/Spanish and both
themes, desktop and 320-pixel screenshots. Existing files must remain byte-identical on cancel.

## Migration

None. The dialog creates the same documents as before.
