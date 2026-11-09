## ADDED Requirements

### Requirement: Story-aware explorer navigation
Opening a file or diagram SHALL explicitly leave the current story and show the destination;
opening a story entry SHALL select that story. The explorer, picker, canvas, mode badge and timeline
SHALL agree without a parent-diagram detour. Navigation SHALL preserve source, history and unsaved
content.

#### Scenario: Open a one-diagram file from a story
- **WHEN** a story of `control-data-planes.meltemi` is shown and the file row for
  `central-api-gateway.meltemi`, with one diagram and no stories, is clicked
- **THEN** the tree and canvas show the central-entry file, the timeline and story badge are gone,
  and no parent selection or reload was needed

#### Scenario: Another story entry
- **WHEN** the user opens a story entry belonging to another file
- **THEN** that file opens and exactly that story is selected instead of its ordinary diagram view

#### Scenario: Files with equal ids
- **WHEN** two files use the same diagram and story ids and the user opens the second file's diagram
- **THEN** the canvas displays the second file in edit mode and a late message from the first file cannot restore its story

#### Scenario: A destination without a drawable diagram
- **WHEN** a story is shown and the user opens a non-diagram file or a source that cannot draw
- **THEN** playback ends and the destination's normal file, empty or diagnostic view appears without rewriting either file

### Requirement: Story deletion from the explorer
A writable story row SHALL offer **Delete story** through its context menu and Delete key. A
confirmation SHALL name the story and dependent export profiles, distinguish symbol from file
deletion and require consent for cascade. Confirming SHALL use the shared operation and history;
cancelling SHALL change nothing. Read-only rows SHALL offer no deletion, and stale targets SHALL be
checked against current source.

#### Scenario: Remove the selected story only
- **WHEN** Delete is confirmed on `story2` in a file containing a diagram and `story1` and `story2`
- **THEN** only `story2` disappears, the file and other entries remain, active playback is cleared if necessary,
  and undo restores the original source

#### Scenario: Dependent exports require consent
- **WHEN** the selected story has an export profile and the confirmation is cancelled rather than accepting its removal
- **THEN** neither the story nor its export profile is changed

#### Scenario: A stale story row
- **WHEN** another editor removes or changes the story before the deletion is confirmed
- **THEN** the operation is checked against current source, refuses a stale target with feedback and never deletes its file or another story

#### Scenario: Viewing only
- **WHEN** a project is read-only and a story row is selected
- **THEN** its story can be opened and played, but Delete and its context menu cannot submit a source mutation
