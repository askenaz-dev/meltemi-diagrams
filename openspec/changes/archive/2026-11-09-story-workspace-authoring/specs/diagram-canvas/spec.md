## ADDED Requirements

### Requirement: Explicit story workspace selection and size

The shared workspace SHALL expose a labelled scene selector, a persistent editing selection and
distinct selected/playing states, including empty and overlapping scenes. It SHALL offer accessible
panel-height resizing, consistent add labels and scene deletion. All writes SHALL be guarded by
the playback's document/revision and pending state. Track end geometry SHALL remain inside bounds.

#### Scenario: Choose an empty scene

- **WHEN** several empty scenes share a start time and the author selects one
- **THEN** its name/timing controls remain targeted to that scene with visible selection and no artificial horizontal scroll

#### Scenario: Resize or cancel

- **WHEN** the separator is dragged or resized with its keyboard controls
- **THEN** the height stays within the available workspace and is saved locally; cancellation restores the prior height

#### Scenario: A source update precedes playback

- **WHEN** the host revision advances before the corresponding story reply arrives
- **THEN** old controls cannot write or confirm deletion against the new document, and later replies cannot restore stale selection
