## ADDED Requirements

### Requirement: Other people's selections
The canvas SHALL accept a `presence` host message with people (name, colour, selected element
ids) and draw, on a layer above the scene, a coloured outline with a name tag around each
element another person has selected, the name set as a text node; the layer SHALL be neither
selectable nor exported, SHALL clear when the message carries nobody or the canvas shows
another file, and SHALL ignore ids the scene does not hold.

#### Scenario: Outline with a name
- **WHEN** the host sends `presence` with Ben selecting `api`
- **THEN** `api` shows an outline in Ben's colour with the tag `Ben`, and clicking it selects `api` for the person, not Ben's outline

#### Scenario: Unknown element
- **WHEN** the message names an id the scene lacks
- **THEN** nothing is drawn for it and no error is raised

#### Scenario: A name holding markup
- **WHEN** the message carries the name `<img src=x>` selecting `api`
- **THEN** the tag shows those characters and the layer holds no element made from them
