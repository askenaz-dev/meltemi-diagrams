## ADDED Requirements

### Requirement: Roles in the room
The Worker SHALL pass the resolved role (`owner`, `editor`, `viewer`) to the room with each
connection; the room SHALL send it in `hello`, broadcast updates to viewers as to everyone, and
close a viewer's socket with 4403 `access.denied` on its first update, leaving the document
unchanged. A connection whose project the person cannot access SHALL be refused by the Worker
with 404 before reaching the room.

#### Scenario: A viewer watches
- **WHEN** a viewer is connected and an editor changes a file
- **THEN** the viewer receives the update

#### Scenario: A viewer writes
- **WHEN** the viewer sends an update
- **THEN** its socket closes with 4403 and the document and revision are unchanged

#### Scenario: A spoofed role header
- **WHEN** a viewer's upgrade carries `X-Meltemi-Role: owner`
- **THEN** `hello` says `viewer` and its first update closes the socket with 4403
