# Spec Delta

## ADDED Requirements

### Requirement: The Story picker
A story document with more than one story SHALL give the player a **Story** picker in its
control bar, before the scene picker, listing the stories by title (their id without one) in the
document's order; with one story there SHALL be no picker. Picking a story SHALL show its first
frame at time 0, stopped, keep the static view and the viewport, fill the scene picker with its
scenes and announce "Story: <title>" politely.

#### Scenario: Picking a flow
- **WHEN** a page holds a document with the stories `purchase` and `refund` and the viewer picks
  `refund` while `purchase` is playing at 2 s
- **THEN** the frame is `refund`'s at 0 ms, paused, the scene picker lists `refund`'s scenes, the
  live region says "Story: Refund" and the frame's name says the story and its first scene

#### Scenario: Keys inside the picker stay its own
- **WHEN** `+` is typed while the Story picker has the focus
- **THEN** the picker handles the key and the zoom is unchanged

#### Scenario: One story, no picker
- **WHEN** a page holds a document with one story
- **THEN** the control bar has no Story picker and the scene picker is as before

#### Scenario: In Spanish
- **WHEN** the same page has `lang="es"` and the viewer picks `refund`
- **THEN** the picker's name is "Historia" and the live region says "Historia: Refund"

### Requirement: The story shown first
The element attribute `story="<id>"` SHALL choose the story a document of several shows first,
and `ElementOptions.story` SHALL write it; an id that names no story of the document SHALL give
the first story, and the attribute SHALL change nothing on a document of one story.

#### Scenario: The attribute picks first
- **WHEN** a page holds `<meltemi-player story="refund">` with the purchase and refund document
- **THEN** the picker shows `refund` selected and the first frame is `refund`'s

#### Scenario: An unknown id
- **WHEN** a page holds `<meltemi-player story="tour">` with the same document
- **THEN** the player shows `purchase`, the first story, and the picker shows it selected

### Requirement: The summary of several stories
The text summary of a document with several stories SHALL list every story in the document's
order, each headed by its title (or id) and followed by its scenes and their actions as the
summary of one story lists them, and SHALL mark the story the player shows; the static view
SHALL show the chosen story's scenes.

#### Scenario: Summary of two stories
- **WHEN** the summary of the purchase and refund document is read while `refund` is shown
- **THEN** it has two headings, "A purchase" then "Refund", each with its scenes' lines, and the
  second carries `aria-current`

#### Scenario: Static view of the chosen story
- **WHEN** the static view is pressed while `refund` is shown
- **THEN** the frame is the final state of `refund`'s first scene and the scene picker still
  lists `refund`'s scenes
