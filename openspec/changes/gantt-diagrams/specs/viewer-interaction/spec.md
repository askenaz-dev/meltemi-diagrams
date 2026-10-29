## ADDED Requirements

### Requirement: Gantt cards
In a gantt chart, the hover card and the detail panel of a task SHALL show its label, its section,
its start and end dates in the player's language (`8 jun 2026 → 19 jun 2026`), its working days, its
status and "critical" when it is, the tasks it follows, its description and the host of its `url`; a
milestone's card SHALL show its date instead of the span; a marker's its date; a section's its label
and its span; a dependency arrow's "<predecessor> → <successor>". The card SHALL follow the hover
card rules of the other targets (delay, placement, hiding, text nodes only) and SHALL never show the
written clauses, comments or diagnostics. The `axis` group SHALL take no pointer events.

#### Scenario: A task's card
- **WHEN** the pointer rests 400 ms on tec1 in the HTML player of the owner's chart in Spanish
- **THEN** the card shows "Prueba de concepto con el equipo de Arquitectura", "Tecnología",
  "8 jun 2026 → 19 jun 2026", "10 días hábiles" and "Después de: Evaluar plataformas de agentes"

#### Scenario: An arrow's card
- **WHEN** the pointer rests on the arrow from sdlc1 to sdlc2
- **THEN** the card shows "Workshops AI-SDLC → Desarrollo de Skills y Agentes (AI-SDLC)."

#### Scenario: Nothing on the grid
- **WHEN** the pointer rests on a tick label of the axis
- **THEN** no card appears

#### Scenario: A description is never markup
- **WHEN** a task's description is `Uses <b>TLS</b>` and its card shows
- **THEN** the card displays the characters `<b>TLS</b>` and holds no `b` element
