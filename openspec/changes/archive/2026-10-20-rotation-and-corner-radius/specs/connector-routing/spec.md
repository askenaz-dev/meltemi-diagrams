## ADDED Requirements

### Requirement: Ends on turned elements
A connector SHALL meet a turned element on its turned outline. A free end SHALL be routed to the element's drawn box as to any box (sides, lanes, detours around obstacles), and the point found on a side of the drawn box SHALL move along that side's inward normal onto the turned outline, or to the nearest point of it when the normal meets none. A named port or a point pinned to a side (`api.north 30%`) SHALL be computed on the unturned shape in the element's own frame and turned with it; the connector SHALL leave or enter it square to the drawn box's side whose outward normal is closest to the turned side's normal. `route` statements SHALL keep naming sides and percentages in the element's own frame.

#### Scenario: Free end on a turned square
- **WHEN** square `s` has `rotation 45` and `a`, placed left of it at the same height, has `a -> s` without a route
- **THEN** the connector ends on the left vertex of the turned square, on its outline

#### Scenario: Pinned end turns with the element
- **WHEN** node `api` has `rotation 90` and `route save from api.north 50% to db` is written
- **THEN** the connector starts at the middle of `api`'s turned north side, which faces east, and leaves it eastwards

#### Scenario: Unturned elements keep their ends
- **WHEN** a diagram without `rotation` is laid out
- **THEN** every connector has the same points as before this requirement
