## ADDED Requirements

### Requirement: Reversible overlap and transition authoring

The editor SHALL expose sequential/overlap placement, overlap seconds and transition kind/time.
Source operations SHALL preserve comments and exact undo. Invalid retiming SHALL be refused;
removing a scene SHALL clear the next scene's orphaned incoming overlap in the same operation.

#### Scenario: Configure placement and transition

- **WHEN** an author changes a scene from sequential to an allowed overlap and chooses a fade
- **THEN** source, derived start/end, player and exports use that schedule and undo restores it

#### Scenario: Protect adjacent overlaps

- **WHEN** a duration edit would invalidate an incoming or outgoing overlap
- **THEN** the edit is rejected with the minimum/limit rather than silently changing other scenes
