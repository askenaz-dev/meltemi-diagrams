## ADDED Requirements

### Requirement: Pointer trails relayed by the room
A kind 2 state's `canvas` part MAY hold `laser: { diagram?, points }` beside, or instead of, `selection` and `pointer`: `points` a list of at most 64 entries, each `{ x, y, t }` with `x` and `y` finite numbers within the pointer bound (rounded to integers) and `t` a finite number from 0 to 1000 (rounded to an integer), and `diagram` a string of at most 256 characters when present. The room SHALL relay a laser as it relays the rest of the state, SHALL never keep it in the socket attachment, and SHALL treat a `laser` of another shape, a batch over 64 points, a point outside the bounds or a `t` outside 0..1000 as a message of the wrong shape: dropped and counted, the sender's state unchanged, the connection kept. A `canvas` part SHALL hold a selection, a pointer, a laser or any of them; one with none SHALL be of the wrong shape. The size and rate limits SHALL be the ones of every kind 2 message.

#### Scenario: A laser alone is relayed
- **WHEN** a client sends `{ canvas: { laser: { diagram: "flow", points: [{ x: 10, y: 20.4, t: 0 }, { x: 30, y: 20, t: 120 }] } } }`
- **THEN** the other clients receive it with the sender's identity, the second point's `y` as `20`, and the sender's attachment holds no laser

#### Scenario: A laser with a selection
- **WHEN** a client sends `{ canvas: { selection: ["api"], laser: { points: [{ x: 1, y: 1, t: 0 }] } } }`
- **THEN** it is relayed with both parts

#### Scenario: An oversized batch is dropped
- **WHEN** a client sends a `laser` with 65 points, or a point with `t` 1001, or `x` 2 000 000, or `points` that is not a list
- **THEN** the message is dropped and counted, nothing is relayed, and the client's last state stands

#### Scenario: States survive hibernation without the laser
- **WHEN** two clients have published states with lasers, the room is evicted from memory, and a third client connects
- **THEN** it receives both states' identities, files and carets, and no laser
