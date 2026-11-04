# The HTML player

[Español](es/player.md)

The player plays a story, or a diagram and its effects, in any browser: offline, from one HTML
file, with the controls the proposal asks for (pause, progress, scene selection, reduced motion
and a static view) and full keyboard and screen reader support. It draws every frame with the same
functions as `meltemi-diagrams export` and the canvas, so the picture at an instant is the same
everywhere (decision 0024). Around the frame, never in it, the player lets people explore the
drawing: zoom and pan, hover cards, a detail panel, and opening what a box holds with a double
click or its plus sign (decision 0047).

## Writing a player

| Command                                                                   | Result                                                 |
| ------------------------------------------------------------------------- | ------------------------------------------------------ |
| `pnpm mdg export purchase.meltemi --format html --story purchase`         | `purchase.purchase.html`, a complete page              |
| `pnpm mdg export purchase.meltemi --format html --story purchase --embed` | a fragment to paste into a page                        |
| `pnpm mdg export checkout.meltemi --format html`                          | `checkout.html`, the diagram and its `animate` effects |

The page of a diagram also holds every view a drill-down reaches from it across the project (the
container view of a system, the component view of a container, the diagrams its elements link
to), so it explores offline; the command says how many views it bundled:
`Wrote commerce.context.html (3 views)`. Fonts are embedded by default, so the page looks the same without the fonts installed;
`--fonts system` leaves them to the viewer. `--at`, `--motion animated` and `--fonts outlined` do
not apply to a player. In VS Code, **Meltemi Diagrams: Export HTML Player** asks which story or
diagram to write and writes the same page as the command line, and the canvas timeline has an
**Export HTML** button for the story it plays.

## Controls

| Control               | Keys                                                     | What it does                                                                            |
| --------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Play / Pause          | Space, K                                                 | Plays from the current time, from the start at the end; pauses                          |
| Progress              | Left / Right (one second), `,` / `.` (100 ms), Home, End | A slider with the time; dragging it pauses                                              |
| Previous / Next scene | Page Up / Page Down, P / N                               | The start of a scene (Page Up goes to the start of the current scene first)             |
| Scene                 |                                                          | A list of the scenes with their titles                                                  |
| Static view           | S                                                        | Each scene's final state, without animation; for a diagram, the drawing without effects |
| Zoom out / Zoom in    | `-` / `+` (or `=`)                                       | The previous or next zoom step, around the focused element or the centre                |
| Zoom level            | `1`                                                      | Shows the zoom; pressed, actual size                                                    |
| Fit the drawing       | `0`                                                      | The whole drawing, never above actual size                                              |
|                       | Shift and an arrow                                       | Pans an eighth of the drawing's window                                                  |
|                       | Up / Down                                                | Walks the elements and relations, says each one                                         |
|                       | Enter                                                    | Shows the details of the element reached; on a selected one that opens a view, opens it |
|                       | Backspace                                                | Goes up to the view above                                                               |
|                       | Escape                                                   | Closes the card, then the panel, then clears the selection                              |

Keys work wherever the focus is in the player, except in the scene list, and the slider keeps its
own arrows. Every control has a name, a tooltip with its key and a visible focus ring.

- **Reduced motion.** When the system asks for reduced motion, the player starts in the static view
  and never autoplays; the viewer may still turn the static view off.
- **Announcements.** Scene changes are announced politely ("Scene 2 of 2: processing"), and the
  picture's accessible name says the story and the scene.
- **Text summary.** Under the player, a summary lists every scene with its times and its actions in
  words, with the elements' labels: "Reveal Cliente, API Gateway, Pedidos and PostgreSQL over
  800 ms", "Trace “HTTPS” from Cliente to API Gateway over 1.2 s".
- **Effects that repeat forever** play until paused, without a progress slider.
- **Interactive drawing.** The picture's name says it takes input ("A purchase. Interactive
  drawing"); selections, the views opened and key zooms are announced ("Selected: API", "Opened
  containers", "Zoom 150%"); the summary lists the elements as buttons that select them, with what
  each opens.
- **Language.** The controls, announcements, times and summary are in English or Spanish ("Reproducir",
  "Escena 1: …", "1,2 s"), in the language of the export: `--lang`, else the project's `"locale"`,
  else English ([projects](language/projects.md#language-of-exports)), never the viewer's.

## Exploring a drawing

- **Zoom and pan.** Ctrl or Cmd with the wheel (and a trackpad pinch) zooms around the pointer,
  from 10 % to 800 %. A plain wheel pans a drawing larger than its window and is left to the page
  otherwise, so pages still scroll over a drawing. A drag pans; two fingers pinch on a touch
  screen, one finger pans a zoomed drawing. The drawing first shows whole, never above actual
  size, and keeps the zoom while a story plays; Fit is the only reset. Zoom is never part of the
  frame: **Download SVG** and every export draw the drawing as written.
- **Hover cards.** Resting the pointer 400 ms on an element shows its label, its C4 type and
  technology, its description (three lines) and its link; on a relation, its label, ends,
  technology, description and assumption. Cards never cover what they describe and never show on
  touch screens.
- **Selection and the detail panel.** A click or a tap selects an element or a relation (a ring
  around it) and opens a panel beside the drawing, or under it on narrow screens: type,
  technology, the full description, the link as **Open link**, the relations in and out (each
  selects it), and what the host adds (the catalog's stories, entity and views). A click on an
  element with a `url` selects it; Ctrl or Cmd and a click follows the link. Escape or Close
  closes the panel.

## Opening what a box holds

A plus sign at the corner of a box says that it opens a view: a system whose container view
exists, a container whose component view exists, or an element whose `link` names a diagram of the
page. A double click, the plus sign or Enter on the selected box opens it: the camera moves to the
box, then the view morphs into the one it opens (a cross-fade when the boxes differ), on the
player's clock; under reduced motion it cuts. A trail above the drawing names the views above,
**Up** and Backspace go back the same way, and a crumb jumps several views at once. Boxes that
open nothing are only selected by a double click. Stories keep their own camera and transitions:
their elements have cards and the panel, not plus signs.

## Embedding

A page or fragment holds a `<meltemi-player>` element with its document in a
`<script type="application/json">` child, and the runtime script once:

```html
<meltemi-player autoplay loop>
  <script type="application/json">
    {"format":"meltemi-player","version":2, …}
  </script>
</meltemi-player>
<script>
  /* the runtime, written by the exporter */
</script>
```

| Attribute             | Meaning                                                                 |
| --------------------- | ----------------------------------------------------------------------- |
| `autoplay`            | Plays at once, unless the viewer asks for reduced motion                |
| `loop`                | Starts again at the end                                                 |
| `static`              | Starts in the static view                                               |
| `controls="false"`    | Hides the controls; the keyboard and the summary remain                 |
| `interactive="false"` | Draws the frame and the playback controls only: no zoom, cards or panel |
| `lang`                | The language of the controls: `es` or `en`                              |

A complete page carries its language as `<html lang>`; a Spanish fragment carries `lang="es"` on
its element, an English one nothing. A player uses the nearest `lang` (its own, then its page's),
so English and Spanish fragments can share a page. Fragments can be pasted more than once in a
page; the element is defined once. The controls live
in a shadow root, so the page's styles do not reach them, and the fonts go to the page's head once.
Scripts can also call `MeltemiPlayer.mountPlayer(element, document, options)`, whose options take
`locale: "en" | "es"` and `interactive`, which returns a handle with `play`, `pause`, `seek(ms)`,
`goToScene(index)`, `setStatic(on)`, the `svg` on screen, the `viewport`, `zoomIn()`, `zoomOut()`,
`fit()`, `actualSize()`, `setZoom(zoom)`, `panBy(dx, dy)`, `select(id)`, `showDetails(id)`,
`closeDetails()`, `open(id)` and `up()`. Hosts pass `targets`, `onNavigate`, `sections` and
`trail` to open their own pages; the element dispatches `meltemi-select`, `meltemi-navigate` and
`meltemi-view` events. The page may set the motion tokens on the element
(`meltemi-player { --meltemi-motion: 0ms }`); they are zero under reduced motion.

## The document

| Key                          | Meaning                                                                                      |
| ---------------------------- | -------------------------------------------------------------------------------------------- |
| `format`, `version`          | `meltemi-player` and `2`                                                                     |
| `kind`                       | `story` or `effects`                                                                         |
| `id`, `title`, `description` | The story or diagram                                                                         |
| `timeline`, `views`          | Stories: the timeline and, by diagram id, the scene, effects and relation ends of every view |
| `key`, `views`               | Effects: the diagram's own view and every view a drill-down reaches, with when effects end   |
| `names`                      | Per view, its title and the labels of its elements, relations, notes and fragments           |
| `details`                    | Per view, what cards say and what each element opens; its C4 level and scope; its parent     |
| `accent`                     | The colour of highlights and traces                                                          |
| `fontFaces`                  | `@font-face` rules for the text, or none                                                     |

The data is escaped so that nothing in it can end its script element, and nothing is loaded from
the network.
