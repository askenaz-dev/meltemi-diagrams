# Spec Delta

## ADDED Requirements

### Requirement: Every story in one player
When the file has more than one story the export dialog SHALL offer the target **Every story
(N)** after the stories, for the HTML format only, building the request `meltemi-diagrams export
--format html --stories` builds (with Autoplay and Loop) and downloading `<stem>.stories.html`;
a story that cannot be drawn SHALL be named in the status line and left out.

#### Scenario: Every story downloaded
- **WHEN** the file has the stories `purchase` and `refund` and the person picks **Every story
  (2)** and HTML
- **THEN** `<stem>.stories.html` is downloaded, its document holds both stories in source order,
  and the status line names the file and the two stories

#### Scenario: Other formats hidden
- **WHEN** **Every story (2)** is chosen
- **THEN** the format field offers HTML only and the fields of pictures and videos are hidden

#### Scenario: One story offers no target
- **WHEN** the file has one story
- **THEN** the target list has no **Every story** entry

#### Scenario: A story left out
- **WHEN** one of the two stories shows a view with an error and **Every story (2)** is exported
- **THEN** the page holds the other story alone and the status line names the one left out

### Requirement: One picture per scene
For a story target with SVG, PNG or PDF the export dialog SHALL show a checkbox **One picture per
scene**, unchecked at each opening, which hides the Instant field while checked, writes each
scene's final state as `--scenes` does, and says in the status line how many pictures were
written. The words SHALL be in the interface language.

#### Scenario: The instant gives way
- **WHEN** the box is checked while the Instant field reads `1s`
- **THEN** the Instant field is hidden and the export writes the scenes' final states, not the
  frame at 1 s

#### Scenario: Unchecked at each opening
- **WHEN** the person exported with the box checked, closes the dialog and opens it again
- **THEN** the box is unchecked and the next export writes one frame

#### Scenario: No box for a diagram or a video
- **WHEN** the target is a diagram, or a story with the GIF format
- **THEN** there is no box about scenes in the dialog

#### Scenario: In Spanish
- **WHEN** the interface language is Spanish and a story is the target
- **THEN** the box reads "Una imagen por escena" and the every-story target "Todas las historias
  (2)"

### Requirement: The scenes downloaded
With **One picture per scene** checked, SVG and PNG SHALL download `<stem>.<story>.scenes.zip`
holding `<stem>.<story>.<scene>.<ext>` per scene, the PNGs drawn one by one with the progress
line of videos and cancellable, and PDF SHALL open the print dialog on a page with one page per
scene, every page the largest frame's size with no margin.

#### Scenario: A zip of SVGs
- **WHEN** the `purchase` story is exported as SVG with the box checked
- **THEN** `purchase.purchase.scenes.zip` is downloaded holding
  `purchase.purchase.overview.svg` and `purchase.purchase.processing.svg`, each equal to the file
  `meltemi-diagrams export --story purchase --scenes` writes, and the status line says two
  pictures

#### Scenario: A PDF with a page per scene
- **WHEN** the `purchase` story is exported as PDF with the box checked
- **THEN** the print frame holds two pages, each with a `@page` rule of the larger frame's size
  and no margin, the first showing the overview's final state

#### Scenario: Cancelled while drawing
- **WHEN** the person cancels while the PNGs of a story of six scenes are drawn
- **THEN** no zip is downloaded and the status line says the export was cancelled
