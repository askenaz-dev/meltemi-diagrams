## ADDED Requirements

### Requirement: Recorded editing demo
`pnpm demo` SHALL build and serve the playground, drive it in the installed Edge or Chrome at
1280 × 720 through an editing session (code typed, a box dragged on the canvas, a connector's route
changed, a label renamed in the inspector, undo and redo, an SVG export) with a caption for each
step, and encode the recorded frames with the system FFmpeg into `docs/media/editing-demo.mp4` and
`docs/media/editing-demo.gif`. It SHALL check after each step that the code changed as shown and
fail naming the step otherwise.

#### Scenario: Demo recorded
- **WHEN** `pnpm demo` runs with Edge and FFmpeg installed
- **THEN** both files are written, the MP4 is 1280 × 720, and the code after the route step holds
  the new `route` statement
