## ADDED Requirements

### Requirement: Scene removal and human-readable story names

Source editing SHALL support removing a scene and setting or clearing a story/scene display title
without changing stable identifiers, diagrams or export references. Edits SHALL preserve unrelated
source/comments, reject unsafe recovered syntax and support byte-exact undo. Removing the final
scene SHALL retain the story and allow adding a new scene.

#### Scenario: Rename and undo

- **WHEN** a story or scene receives a human-readable title
- **THEN** selectors and labels show it, ids/references remain valid and undo restores exact source

#### Scenario: Remove a scene

- **WHEN** the selected scene is removed and the current-source confirmation is accepted
- **THEN** only that scene is removed, its story remains and a neighbouring scene or empty state is selected
