## MODIFIED Requirements

### Requirement: New project from cards
**New project…** SHALL open a dialog with a name and a grid of cards, one per template, each with
a thumbnail of the template's first diagram in the page's theme, a title in words, the
description and what it holds (diagrams, models, views, stories), chosen with the pointer or the
arrows; the name SHALL default to the chosen card's title. Anonymous, **Create** SHALL replace the
project of this browser with the template's files, asking first when the work differs from every
template and keeping it as the previous project; signed in, it SHALL create a cloud project from
the template with that name and open it.

#### Scenario: The cards
- **WHEN** New project… opens in Spanish
- **THEN** seven cards show, `c4` titled "Modelo C4" with "1 modelo · 2 vistas", `kanban` titled "Tablero kanban" with "1 diagrama", `whiteboard` titled "Pizarra" with "1 diagrama · 1 historia", `purchase` with "1 modelo · 2 vistas · 2 diagramas · 1 historia", each with its thumbnail

#### Scenario: Anonymous creation
- **WHEN** the anonymous flow project has been edited and the sequence card is created
- **THEN** the page asks before replacing, and after a yes the tree shows `diagrams/sign-in` and the panel offers Previous project · Restore

#### Scenario: A whiteboard from its card
- **WHEN** the whiteboard card is created anonymously
- **THEN** the tree shows `diagrams/whiteboard` and the canvas draws the strokes and stickies under `sketch.light`
