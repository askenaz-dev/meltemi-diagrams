## ADDED Requirements

### Requirement: Strokes being drawn in presence
While the person draws with the canvas's pen or highlighter, the page SHALL publish the stroke's points as the pointer trail is published (`canvas.laser`, the same throttle, the same message, the same bounds on the points) with a `pen: { width, colour, opacity, stroke, cancel? }` part (`width` an integer from 1 to 64, `colour` a string of at most 32 characters, `opacity` a number from 0 to 1, `stroke` an integer from 0 to 2,147,483,647 that the person's page increases with each stroke, and `cancel` true on the batch that ends a stroke cancelled with Escape). The room SHALL parse the part with those bounds and SHALL invalidate the message when it does not fit, as any bad part does. A peer's page SHALL show the batches of one stroke (the same `stroke` number) as one growing stroke, never joined to another, in the given colour, width and opacity; it SHALL drop a stroke at once when its `cancel` batch arrives; and it SHALL show them on the canvas of the diagram the batch names, kept until the document changes after the last batch or ten seconds pass, so the stroke is replaced by the pen statement the release writes. Nothing of it SHALL be in an export.

#### Scenario: A guest draws for the owner
- **WHEN** a guest of a live session presses P and drags a stroke on the canvas the owner has open
- **THEN** the owner's canvas shows the stroke growing in the colour of the guest's pen within half a second, and within a second of the release the owner's file holds the guest's `pen` statement and the presence stroke is gone

#### Scenario: A highlighter seen by a peer
- **WHEN** Ben draws with the highlighter over Ana's canvas
- **THEN** Ana sees a translucent 20 px stroke in the highlight colour, not a fading trail

#### Scenario: A pen part over the bounds
- **WHEN** a client sends a state whose `canvas.laser.pen` has `width` 0 or a `colour` of 100 characters
- **THEN** the room drops the message and the client's earlier selection and pointer stay shown

#### Scenario: Bounded traffic
- **WHEN** a guest draws for ten seconds without pause
- **THEN** the room counted no more awareness messages from the guest than the throttle allows, and none over 16 KiB
