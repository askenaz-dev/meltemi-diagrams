## ADDED Requirements

### Requirement: Turned elements in the arrangement
In `layout auto`, and for the unplaced elements of `layout assisted`, the engine's request SHALL give a turned element the size of its drawn box, the bounding box of its turned outline, so the engine leaves room for the turned drawing; the element's box SHALL be centred where the engine centres that drawn box, with its own written or default size. `assisted` offsets and pushes SHALL compare drawn boxes.

#### Scenario: Room for a turned node
- **WHEN** a `layout auto` diagram has `client -> api -> db`, `api` is 160 × 56 and has `rotation 90`, and is laid out with a test engine that records its request
- **THEN** the request gives `api` width 56 and height 160, and the drawn box of `api` is centred on the engine's centre for it

#### Scenario: Assisted push uses the drawn box
- **WHEN** a `layout assisted` diagram places a node turned by 90 degrees and leaves a related node unplaced
- **THEN** the unplaced node does not overlap the placed node's drawn box
