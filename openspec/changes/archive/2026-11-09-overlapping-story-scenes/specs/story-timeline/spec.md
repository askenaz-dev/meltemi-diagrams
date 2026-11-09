## ADDED Requirements

### Requirement: Deterministic concurrent scene composition

All active scene actions SHALL contribute at their global times. A later scene's started claim
SHALL take precedence on a shared channel, with interpolation anchored at the claim's start.
Transitions SHALL compose current scene states; directed stills SHALL exclude later scenes.
Timelines without positive overlap SHALL preserve existing output.

#### Scenario: Independent and shared targets

- **WHEN** overlapping scenes animate separate elements and also claim the same camera
- **THEN** both independent animations run and the later scene controls the camera deterministically

#### Scenario: Export an overlapping scene still

- **WHEN** a selected scene's closing still is exported while a later scene overlaps its end
- **THEN** the still shows the requested scene's closing state rather than the later scene's state
