## ADDED Requirements

### Requirement: Optional relative scene overlap

A scene MAY declare `overlap <time>` before its actions. Positive overlap SHALL start it before
the preceding scene ends by exactly that amount, bounded by both scene durations. Zero/omission
SHALL preserve sequential behavior. Invalid times, first-scene positive overlap and malformed or
late declarations SHALL be diagnosed without modifying source. Existing valid files SHALL retain
their timing and meaning.

#### Scenario: Three concurrent scenes

- **WHEN** three ten-second scenes use eight-second incoming overlaps after the first
- **THEN** their starts are zero, two and four seconds and the story ends at fourteen seconds

#### Scenario: Invalid overlap

- **WHEN** overlap exceeds either adjacent duration or is positive in the first scene
- **THEN** a stable diagnostic identifies the invalid amount and no negative schedule is accepted
