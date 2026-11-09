## ADDED Requirements

### Requirement: Compiled story timeline inspection
`inspect_story` SHALL return a read-only snapshot of a named story's compiled timeline: revision, path, id/title, total duration, ordered scenes and their views, start/end/duration, transition and nested action timing, targets and final-state preview instants. Hosted and local-account calls SHALL require project read access; folder mode SHALL use its safe current disk snapshot.

#### Scenario: Sequential and parallel actions
- **WHEN** inspection reads a story with a 500 ms transition, parallel actions lasting 1 s and 2 s, and a 1 s hold
- **THEN** the scene total is 3500 ms and the nested actions retain their compiled absolute start times

#### Scenario: An imported view
- **WHEN** a story switches to a resolved imported diagram
- **THEN** the timeline identifies that view and its transition at the compiled instant

#### Scenario: A refused inspection
- **WHEN** the requested path/story is missing, input is malformed or project read access is absent
- **THEN** inspection returns the corresponding request, path or access refusal and changes no state

#### Scenario: Invalid source
- **WHEN** the source contains a compilation error
- **THEN** inspection returns `diagram.invalid` with bounded diagnostics rather than a guessed timeline

### Requirement: Inspection snapshot consistency
Inspection SHALL use the same timing engine as playback/export, report warnings and snapshot identity, and perform no source, version, playback or sharing mutation. It SHALL NOT claim that subsequent previews or writes use the same snapshot without checking their revisions.

#### Scenario: A folder inspection and preview
- **WHEN** the agent inspects and previews unchanged folder contents
- **THEN** both results report the same content-derived revision, and a subsequent disk edit changes the revision of both results

#### Scenario: A project changes afterwards
- **WHEN** a person edits the project after inspection and before a preview
- **THEN** the later result reports its own revision so the agent can detect the mismatch
