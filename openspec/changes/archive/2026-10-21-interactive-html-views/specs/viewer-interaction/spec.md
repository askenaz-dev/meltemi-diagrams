## ADDED Requirements

### Requirement: Zoom and pan
The interactive player SHALL let the viewer zoom and pan every drawing it shows, diagram views and
story views alike, without changing the frame: the user viewport SHALL be a CSS transform on a
persistent content layer inside a fixed stage and SHALL never be written into the frame's SVG, so
`PlayerHandle.svg`, **Download SVG** and every export stay byte for byte the renderer's output. The
stage SHALL take the current view's aspect ratio and, at mount and on resize while nothing has been
zoomed, SHALL fit the view whole at the largest zoom that is not above 100 %, centred. Ctrl or Cmd
with the wheel (a trackpad pinch arrives so) SHALL zoom around the pointer by `exp(−Δy × 0.002)`;
a plain wheel SHALL pan only when the drawing overflows the stage in that direction and SHALL
otherwise be left to the page; a left or middle drag past 3 px SHALL pan and SHALL cancel the click
that follows it; two touch pointers SHALL pinch around their midpoint and one SHALL pan only while
the drawing overflows (`touch-action: pan-y` at fit). `+` and `=` SHALL zoom in, `-` out, `0` SHALL
fit, `1` SHALL go to actual size, and Shift with an arrow SHALL pan an eighth of the stage. Zoom
SHALL be limited to 0.1 to 8 (the lower limit lowered to the fit zoom when that is smaller), keys
and buttons SHALL step through the canvas's presets, and the control bar SHALL offer zoom out, the
zoom level (its text the percentage in the content language, pressing it goes to actual size), zoom
in and fit, each with an accessible name that says its key. The user viewport SHALL persist across
frames, scenes, story camera moves and the static view; fit SHALL be the only reset.

#### Scenario: Zoom with the wheel leaves the frame untouched
- **WHEN** Ctrl and a wheel delta of −120 arrive over the `api` box of the player of `purchase`
- **THEN** the viewport's zoom grows by `exp(0.24)`, the scene point under the pointer stays under
  it, and `handle.svg` still equals the SVG that `meltemi-diagrams export --story purchase --at <t>
  --fonts system` writes

#### Scenario: A plain wheel at fit belongs to the page
- **WHEN** the pointer is over a fitted drawing and the wheel turns without Ctrl or Cmd
- **THEN** the event is not prevented, the page scrolls and the viewport is unchanged

#### Scenario: Fit never exceeds actual size
- **WHEN** a 480 × 300 drawing is mounted in a host 1200 px wide
- **THEN** the stage is 480 px wide, the picture is drawn at 100 % and the zoom level reads `100%`
  (`100 %` in Spanish)

#### Scenario: Zoom is clamped
- **WHEN** `+` is pressed with the zoom at 8
- **THEN** the zoom stays 8, the zoom-in button is disabled and the frame is unchanged

#### Scenario: A drag pans and its click is swallowed
- **WHEN** the pointer presses on `api["API"] { url "https://docs.example.com/api" }`, moves 40 px
  and releases
- **THEN** the viewport moved by 40 px, no element is selected, no window opens and the page did not
  navigate

### Requirement: Hover cards
When the pointer (not a touch) rests 400 ms on an element, a relation or a lifeline, the interactive
player SHALL show a card with `role="tooltip"`: for an element its label, its C4 type word and
technology (and "external" when it is), its description cut to three lines and the host of its
`url`; for a relation its label (or "from → to"), its ends, its technology, its description cut to
three lines and its assumption; a lifeline SHALL show its participant's card. The card SHALL sit
6 px below the box, centred, above it when it does not fit, clamped 4 px inside the viewport, and
SHALL follow the pointer for relations, lifelines and boxes taller than 60 % of the viewport; while
a card is visible, moving onto another target SHALL swap its content at once. The card SHALL hide on
leaving the target, on `pointerdown`, `keydown`, `wheel` and Escape, SHALL take no pointer events,
SHALL render every text as text nodes and SHALL show only the label, type, technology, description,
URL and relation fields of the compiled diagram, never comments, paths or diagnostics. Groups with
`data-role="motion"` SHALL take no pointer events.

#### Scenario: An element's card
- **WHEN** the pointer rests 400 ms on `bank` in the `context` view of
  `corpus/valid/c4/commerce.meltemi`
- **THEN** a card with `role="tooltip"` shows "Banco", "External Software System" and "Autoriza
  tarjetas", below the box

#### Scenario: A relation's card from its track
- **WHEN** the pointer rests on the line of `visit` in the `context` view, 4 px away from its stroke
- **THEN** the card shows "Compra" and "Cliente → Commerce"

#### Scenario: Description text is never markup
- **WHEN** an element's description is `Uses <b>TLS</b>` and its card shows
- **THEN** the card displays the characters `<b>TLS</b>` and the shadow root holds no `b` element

#### Scenario: No card on touch
- **WHEN** a touch pointer taps `shop.api`
- **THEN** no card appears; the element is selected and the detail panel opens

#### Scenario: The card hides on the wheel
- **WHEN** a card is visible and the wheel turns
- **THEN** the card is hidden at once

### Requirement: Selection and the detail panel
A click or a tap whose press moved less than 3 px SHALL select the element, relation or lifeline
under it: a ring drawn on an overlay (never in the frame) and a non-modal detail panel with
`role="region"` named after the target, inside the player, docked to the stage's right edge
(`min(320px, 60%)` wide) or below the stage when it is narrower than 720 px or shorter than 280 px.
For an element the panel SHALL show its label, type word, technology, full description, its `url`
as **Open link**, **Open …** when it opens something, its outgoing and incoming relations as
buttons that select them, and the sections the host adds; for a relation its ends as buttons, its
technology, assumption, description and, in C4 views, the model relations it stands for with a
lifted mark. The panel SHALL never take the focus by itself; selecting another target SHALL swap its
body; Escape and its Close button SHALL close it; a click elsewhere on the page SHALL not. From the
keyboard, with the stage focused, ArrowUp and ArrowDown SHALL move a focus ring through the view's
elements and relations in drawing order, revealing and announcing each; Enter SHALL select the
focused item and open the panel; Escape SHALL close the card, then the panel, then clear the
selection. Clicking an element with a `url` SHALL select it without following the link, unless Ctrl,
Cmd or the middle button is pressed. `handle.select(id)` SHALL select an item of the current view and
SHALL refuse an unknown id.

#### Scenario: A click opens the panel and never navigates
- **WHEN** `shop.api` is clicked in the `containers` view
- **THEN** a ring surrounds the box, a region named "Details of API de pedidos" shows "Container",
  "HTTP", "Web" under incoming relations and "Pedidos" under outgoing ones, and the page's address
  is unchanged

#### Scenario: Keyboard walk
- **WHEN** the stage has the focus and ArrowDown is pressed twice, then Enter, then Escape twice
- **THEN** the second item in drawing order is focused and announced, Enter selects it and opens the
  panel, the first Escape closes the panel and the second clears the selection

#### Scenario: A linked element selects first
- **WHEN** `api["API"] { url "https://docs.example.com/api" }` is clicked
- **THEN** the element is selected, no window opens and the panel offers **Open link** to that URL;
  with Ctrl held the click opens the URL in a new tab instead

#### Scenario: Unknown id refused
- **WHEN** `handle.select("nope")` is called
- **THEN** it returns false, nothing is selected and nothing is announced

#### Scenario: Another selection swaps the body
- **WHEN** `shop.db` is clicked while the panel shows `shop.api`
- **THEN** the panel stays open and now names "Pedidos", and the ring moves to `shop.db`

### Requirement: Drill-down
An element SHALL show a plus badge exactly when it opens something: `details[view].elements[id].opens`
in the document or a target the host returns. The badge SHALL sit at the top-right corner of the
element's box on the overlay, 20 px on screen at every zoom with a 32 px hit area, hidden while the
box on screen is under 32 px in either direction, while a drill plays and while a drag is in
progress, and SHALL never appear in SVG, PNG or PDF exports. A double click on the element, a press
on its badge and Enter on the selected element SHALL open it: the user viewport returns to fit, then
the drill plays on the player's clock, a camera move to the element's box over 320 ms followed by a
`morph` (or a cross-fade when ids differ) into the child view over 480 ms, drawn by `drillFrame`
with each phase eased by `cubic-bezier(0.2, 0.7, 0.3, 1)`; under reduced motion both phases SHALL be
0 ms. When the target is in the document the current view becomes the child; when the host owns it
the player SHALL call `onNavigate` after the camera phase and SHALL not change view. A double click
on an element that opens nothing SHALL only select it. Drill frames SHALL never be exported:
**Download SVG** during a drill SHALL write the settled view. The player SHALL announce "Opened
<view>" when the drill settles.

#### Scenario: Badges only where something opens
- **WHEN** the `context` view of `corpus/valid/c4/commerce.meltemi` is shown with its reachable views
  bundled
- **THEN** `shop` carries a plus badge and `customer` none

#### Scenario: A datastore opens nothing
- **WHEN** the `containers` view is shown and `shop.db` is double-clicked
- **THEN** `shop.db` has no badge, it is selected, and the view is still `containers`

#### Scenario: Camera, then morph
- **WHEN** `shop` is double-clicked in the `context` view
- **THEN** the frame at 320 ms frames the `shop` box plus 40 px, the frame at 560 ms holds a
  `shop#morph` wrapper, at 800 ms the view is `containers` with the `shop` boundary drawn,
  `handle.svg` equals `frameSvg(document, 0, { view: "containers" })` and the live region says
  "Opened containers"

#### Scenario: Reduced motion cuts
- **WHEN** reduced motion is requested and `shop` is double-clicked
- **THEN** the `containers` view is drawn at once with no intermediate frame and the same
  announcement is made

#### Scenario: A host target is handed over
- **WHEN** the host's `targets` returns `{ kind: "host", label: "Containers", transition: "morph" }`
  for `shop` and `shop` is double-clicked
- **THEN** after the 320 ms camera phase `onNavigate` is called with that target and
  `{ view: "context", id: "shop" }`, and the player's view is still `context`

#### Scenario: A small box hides its badge
- **WHEN** the drawing is zoomed out until the `shop` box is 24 px tall on screen
- **THEN** its badge is hidden, and zooming back in shows it

### Requirement: The trail and the way back
The interactive player SHALL show a trail above the stage (`nav` named "Path") with an **Up**
button named after the parent view and the ancestor views as buttons, the current view marked
`aria-current="page"`, hidden when there is nothing above the current view. Backspace on the
stage, the **Up** button and a crumb SHALL go up: the reverse drill plays (the child's whole view
to the element's camera box, then the parent's whole view), the element the person came from is
selected, and "Back in <view>" is announced. The standalone trail SHALL be the player's own stack,
capped at 32 entries; a host MAY supply the ancestors of the document's root with the action of
each (`trail`), the last of which **Up** and Backspace run at the root. At the root without host
ancestors the trail SHALL be hidden and Backspace SHALL do nothing to the page.

#### Scenario: Backspace goes up
- **WHEN** after opening `containers` from `shop` Backspace is pressed on the stage
- **THEN** the reverse transition plays, the view is `context` again, `shop` is selected, "Back in
  Commerce en contexto" is announced and the frame equals the one before the drill

#### Scenario: Nothing above the root
- **WHEN** Backspace is pressed on the stage of a standalone page at its root view
- **THEN** the view is unchanged, the trail is hidden and the browser's history is untouched

#### Scenario: Crumbs jump several levels
- **WHEN** `components` was reached from `context` through `containers` and the first crumb is pressed
- **THEN** one reverse transition plays into `context` and the trail hides

#### Scenario: A host supplies the ancestors
- **WHEN** the catalog mounts `components` with `trail: [context, containers]`
- **THEN** the trail reads context › containers › components and **Up** runs the action of
  `containers`
