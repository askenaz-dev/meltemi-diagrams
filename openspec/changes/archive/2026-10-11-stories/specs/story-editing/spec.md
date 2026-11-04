## ADDED Requirements

### Requirement: Story edit operations
`setStoryTiming { story, path, durationMs }` SHALL set the time of the action at `path` (scene
index, then action indexes through `parallel` blocks), writing or replacing `over <n>ms`, the time of
`hold`, or the transition's `over`; `insertStoryAction { story, scene, action, targets,
durationMs? }` SHALL append an action to a scene; `removeStoryAction { story, path }` SHALL remove
one; `insertScene { story, id, title?, after? }` SHALL add a scene. Each SHALL keep comments and
formatting and refuse results with new errors.

#### Scenario: Longer reveal
- **WHEN** `setStoryTiming` sets the first action of `overview` to 1200
- **THEN** the text reads `reveal client, api, orders, db over 1200ms`

### Requirement: References in stories
Renaming an element SHALL rename it in the stories of the file and, in a project, in stories of
other files that import its diagram. Removing an element SHALL list its story references among its
dependents and remove them, removing an action whose last target goes. References and definition
SHALL lead from a story target to the element.

#### Scenario: Rename reaches the story
- **WHEN** `db` is renamed to `store` in `checkout`
- **THEN** the story reads `reveal client, api, orders, store over 800ms`

### Requirement: Story language services
Completion SHALL offer story statements, actions, transition kinds and the ids of the scene's view;
hover SHALL document every statement; the outline SHALL list stories and their scenes.

#### Scenario: Targets
- **WHEN** completion runs after `reveal ` in a scene of a story for `checkout`
- **THEN** it offers the elements and named relations of `checkout`

### Requirement: Story timeline in the editor
The canvas SHALL offer a story picker when the file has stories. In story mode it SHALL draw frames
locally, read-only, with a timeline of scenes and actions, play, pause and scrubbing; dragging the
end of an action SHALL call `setStoryTiming`; **Add to scene** SHALL insert the chosen action for
the canvas selection into the current scene; every change SHALL be a text edit, undone like any
other.

#### Scenario: Drag a duration
- **WHEN** the end of the `hold 2s` bar is dragged to 3 s
- **THEN** the text reads `hold 3000ms`
