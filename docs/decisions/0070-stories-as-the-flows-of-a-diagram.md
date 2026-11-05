# 0070. Stories as the flows of a diagram

Status: accepted (stories-player-and-stills change, 4 November 2026). Amends
[0023](0023-stories.md) and [0024](0024-html-player.md).

## Context

On 4 November 2026 the owner asked for "scenes of animation" that tell several flows of one
diagram, so that a reader sees each flow on the same drawing instead of a copy pasted elsewhere
with one zone highlighted. The language already had it: a file may hold several `story` blocks for
one diagram, and the canvas plays any of them (decision 0023). Three things were missing. The HTML
player held one story per page (`version: 2`, one `timeline`), so a reader of a page could not
pick a flow. A story could only be started in the text, so a person on the canvas wrote
`story … for … { scene … { } }` by hand before the timeline offered anything. And the picture of a
scene, the frame that goes into a slide or a document, was written one `--at <time>` at a time.

## Decision

- **Version 3 documents hold a list of stories.** A story document carries `stories`, each with
  its id, title, description and timeline, in the order given, over `views` embedded once by
  diagram id; the document's `id`, `title` and `description` are its first story's, so a page of
  one story reads as before. `storiesDocument` builds it, leaves out a story whose views cannot be
  drawn and names it; none drawn gives no document. `PLAYER_VERSION` is 3, and the runtime reads
  versions 2 and 3: `readPlayerDocument` lifts a version 2 `timeline` into one story of one, so
  pages written before keep playing. An older runtime says a version 3 document is unreadable, as
  it does for version 1; a page that mixes fragments takes the runtime of its newest one.
- **The Story picker belongs to the control bar.** With more than one story the player shows a
  `<select aria-label="Story">` before the scene picker. Picking a flow shows its first frame at
  0 s, stopped (in the static view, its first scene's final state), keeps the static view and the
  zoom, fills the scene picker, names the frame and the figure by the story, and announces
  "Story: <title>". The summary lists every story under its title, the one shown marked
  `aria-current`. The element attribute `story="<id>"` chooses the story shown first (an unknown id
  gives the first). No key: Page Up and Page Down walk scenes, a flow is a deliberate choice, and
  keys typed in the picker stay its own.
- **`--stories` writes the page of every story.** `export <file> --stories` (or `--stories a,b`,
  in that order) writes `<stem>.stories.html`, or a fragment with `--embed`; HTML is its format when
  none is given, and another format, `--story`, `--diagram`, `--scenario`, `--scenes`, `--at` or a
  folder is a usage error. Each view is laid out once for the request. The web app's export dialog
  offers **Every story (N)**, HTML only, and VS Code's **Export HTML Player** offers **Every
  story**, both building the same request.
- **`createStory` is an edit like `createDiagram`.** It appends `story <id> for <diagram> { scene
<scene> { } }` after the last statement of the file, `story1`, `story2`… by default; the diagram
  must be one of the file's. The canvas's **New story**, beside the story picker, writes it for the
  diagram shown (in story mode, the playing story's) and plays it at once on its empty scene, with a
  status line that says what to add. The new story warns `story.empty-scene`, a warning, until its
  scene has an action. Read-only canvases do not offer it.
- **The stills of scenes are the static view's frames.** `sceneStills(timeline)` in motion gives
  each scene's final-state instant: its end for the last scene, 0.01 ms before it otherwise. The
  player's static view and every export of scenes take it from there. `--scenes` with `--story`
  writes an SVG or PNG per scene, `<stem>.<story>.<scene>.<ext>`, or one PDF with a page per
  scene, every page the largest frame's size with each frame fitted and centred (a multi-page
  `capturePage`); `--out` names a directory for SVG and PNG. Profiles take `scenes true` on SVG,
  PNG and PDF of a story. The web app's **One picture per scene** downloads a `.zip` of the files
  or prints the pages; the timeline's **Export scenes** asks VS Code for the format, and opens the
  web app's dialog with the box checked.
- **The language stays 0.2.** `scenes` is an additive option of the `export` block; the model JSON
  gains its `scenes` key within version `0.1`.

## Alternatives considered

- **One `<meltemi-player>` per story with a selector outside.** Views and fonts would be embedded
  once per story, and `--embed` would give no single element to paste.
- **An optional `stories` field under version 2.** An older runtime would play the first story and
  say nothing of the others, which the version check exists to prevent.
- **Repeating `--story` for several stories.** Ambiguous with its meaning of one frame.
- **An `export … for stories` profile.** A new target form of the language for a page the command
  line writes in one go; a profile keeps one target.
- **A dialog asking the new story's id and title.** The canvas has none for **New diagram**; ids and
  titles are edited in the text, where hover documents them.
- **A single SVG sheet of every scene.** A layout of its own; a PDF page per scene is what slides
  and documents take. One download per scene in the browser was refused too: browsers ask about
  several downloads and some refuse them.

## Consequences

- A page with an older runtime and a newer fragment says the document is unreadable;
  `docs/player.md` says to paste the newest fragment first.
- The PDF of stories that show views of different sizes has pages of one size, the largest, with
  the smaller frames centred.
- A new story warns `story.empty-scene` until **Add to scene** fills its scene; the status line
  says so.
- A story that cannot be drawn among several is left out and named; the page plays the others.
- The catalog keeps one page per story, and video stays one story per file. Colours per flow and
  filtered views with their own layout are not part of this change.
