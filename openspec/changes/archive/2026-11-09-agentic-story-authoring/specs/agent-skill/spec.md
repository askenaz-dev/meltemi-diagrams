## ADDED Requirements

### Requirement: Agentic story authoring workflow
The skill SHALL teach creating, editing, reordering and deleting stories and scenes through source while preserving unrelated blocks, ids and comments. It SHALL require revision-safe writes, conflict re-read/merge, whole-project validation, compiled timeline inspection and previews at multiple meaningful instants before claiming a story is verified.

#### Scenario: A complete authoring recipe
- **WHEN** an agent follows the skill to add a story to an existing project
- **THEN** it reads current source, writes with revision and idempotency protection, validates the project, inspects compiled timing and reviews scene boundaries and an action midpoint

#### Scenario: A concurrent change
- **WHEN** the write is refused because a person changed the project
- **THEN** the skill directs the agent to read again and merge rather than restore the old complete file

### Requirement: Story timing and snapshot semantics
The skill SHALL explain transition plus sequential timing, parallel maxima and final holds, with an imported-view example and explicit transitions. It SHALL distinguish whole-project versions from revision-pinned story undo, and static preview samples from continuous playback verification.

#### Scenario: A scene duration
- **WHEN** a scene has a 500 ms transition, parallel actions of 1 s and 2 s, and a 1 s ending hold
- **THEN** the guide explains a 3500 ms total and uses inspection to obtain the engine's timing
