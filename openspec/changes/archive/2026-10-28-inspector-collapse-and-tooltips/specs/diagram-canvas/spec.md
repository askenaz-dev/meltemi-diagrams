## ADDED Requirements

### Requirement: Collapsible inspector
The property inspector SHALL be headed by a row holding its title and a fold button (**Hide the properties panel**, `aria-expanded="true"`, `aria-controls` naming the panel), and SHALL fold to a 36 px rail holding one button (**Show the properties panel**, `aria-expanded="false"`, `aria-controls` naming the panel) that unfolds it. The fold button, the rail's button, the toolbar's **Show the properties** toggle (`aria-pressed`) and the host's `setInspectorCollapsed` SHALL all change the one kept state `PersistedState.inspector`, so the toggle and the panel always agree; a kept value that is not a boolean SHALL read as the host's `CanvasSettings.inspector`. The theme panel SHALL fold with the inspector, its head holding the same fold button, and SHALL come back when the inspector unfolds. There SHALL be no rail and no panel without a diagram or while a story plays. Folding from inside the panel SHALL move the focus to the rail's button; unfolding SHALL put it on the panel. The panel's width SHALL change over `--mdg-motion-slow`, the rail fading in after `--mdg-motion-fast`, and none of it under reduced motion; the canvas SHALL keep its viewport (no fit, no zoom) as the stage grows or shrinks. The fold SHALL write nothing to the document and SHALL work on a read-only canvas, whose fields stay disabled. When the host names a key for the fold (`CanvasHostApi.keys.inspector`), the titles of the toggle, the fold button and the rail's button SHALL end in that key in parentheses; otherwise they SHALL be the names alone.

#### Scenario: Fold from the header and keep it
- **WHEN** the header's **Hide the properties panel** button is pressed and the canvas is reloaded with its kept state
- **THEN** the panel is a 36 px rail with one button **Show the properties panel** (`aria-expanded="false"`), the toolbar's **Show the properties** toggle reads `aria-pressed="false"`, the stage's transform is what it was, and after the reload the panel is still a rail

#### Scenario: The rail unfolds and focuses the panel
- **WHEN** the rail's button is pressed
- **THEN** the panel is 260 px wide with its title, its fields and the header button `aria-expanded="true"`, the toggle reads `aria-pressed="true"`, and the panel has the focus

#### Scenario: The toolbar toggle and the panel agree
- **WHEN** the panel is open and the toolbar's **Show the properties** toggle is pressed, then pressed again
- **THEN** the panel is a rail after the first press and open after the second, the toggle's `aria-pressed` following each time

#### Scenario: Folding from a field moves the focus
- **WHEN** the Title field of the inspector has the focus and the header button is pressed
- **THEN** the rail's button has the focus and the field is not reachable until the panel unfolds

#### Scenario: The theme panel folds too
- **WHEN** a theme is being edited in the theme panel and its head's fold button is pressed, then the rail's button
- **THEN** the rail stands where the theme panel was, and after the unfold the theme panel is back with the same theme

#### Scenario: No rail without a diagram or during a story
- **WHEN** the file has no diagram, or a story is playing
- **THEN** neither the panel nor the rail is shown, and the toggle is hidden while the story plays as today

#### Scenario: A read-only canvas folds without writing
- **WHEN** the canvas is read-only, the header button is pressed and the rail's button is pressed
- **THEN** the panel folds and unfolds, its fields are disabled as before, and the host receives no action

#### Scenario: Motion on the tokens
- **WHEN** the panel folds
- **THEN** the panel's computed transition on its width is 0.22 s, the rail becomes visible after 0.12 s, and under `prefers-reduced-motion: reduce` both are 0 s

#### Scenario: A kept value that is not a boolean
- **WHEN** the host's kept state holds `"inspector": "no"` and the host's setting is `true`
- **THEN** the canvas opens with the panel shown and the toggle `aria-pressed="true"`, and the next fold writes a boolean `false`

#### Scenario: The host names the key
- **WHEN** the host passes `keys: { inspector: "Ctrl+Alt+B" }`
- **THEN** the toggle's title is "Show the properties (Ctrl+Alt+B)", its `aria-label` "Show the properties", its `aria-keyshortcuts` "Control+Alt+B", the header button's title "Hide the properties panel (Ctrl+Alt+B)" and the rail's "Show the properties panel (Ctrl+Alt+B)"

#### Scenario: No key, or an empty one, from the host
- **WHEN** the host passes no `keys`, or `keys: { inspector: "" }`
- **THEN** the three titles are the names alone, and none of the three has `aria-keyshortcuts`

### Requirement: Tooltips of icon-only controls
Every icon-only button, toggle, chip and split arrow of the toolbar and the panels SHALL have an accessible name that says what it does without naming a key, a `title` equal to that name followed by the key in parentheses when the control has one (shown by the canvas's bubble 400 ms after the pointer rests, the control keeping its `title`), and `aria-keyshortcuts` holding the key as ARIA writes it ("L", "Shift+1", "Control+Alt+B") when it has one; a toggle SHALL keep one name and `aria-pressed`, except a control whose effect flips, which SHALL be named per state. The palette's tools SHALL be named by the tool and its use ("Node: click on the canvas"; "Node, rounded: click on the canvas" for a shaped tool; "Icon: find one for the selection or to place" for the icon tool) and titled by the tool and its key once ("Node (N)", "Node, rounded (N)", "Icon (I)"); the split arrows SHALL be named by their menu ("More shapes", "Kinds of arrow", "Group or container") and keep the tooltip the requirement "Visible split buttons" names ("More shapes (F)", "Kinds of arrow (R cycles)"). Each pane control of the canvas (the properties toggle, the fold button, the rail's button) SHALL draw the same glyph, a frame with a bar at the right holding two rows, which no other control of the canvas or of a host page draws. Every word SHALL exist in English and Spanish.

#### Scenario: The layers toggle
- **WHEN** the toolbar is drawn
- **THEN** the layers toggle's `aria-label` is "Show the layers", its title "Show the layers (L)" and its `aria-keyshortcuts` "L"; in Spanish "Mostrar las capas", "Mostrar las capas (L)" and "L"

#### Scenario: The palette says the key once
- **WHEN** a flow diagram is open
- **THEN** the node tool's `aria-label` is "Node: click on the canvas", its title "Node (N)" and its `aria-keyshortcuts` "N", and after `hexagon` is chosen in the shapes grid its name is "Node, hexagon: click on the canvas" and its title "Node, hexagon (N)"; the icon tool's `aria-label` is "Icon: find one for the selection or to place", its title "Icon (I)"; the shapes arrow's `aria-label` is "More shapes", its title "More shapes (F)" and its `aria-keyshortcuts` "F"

#### Scenario: The bubble after the pointer rests
- **WHEN** the pointer rests on the header's fold button
- **THEN** no bubble shows at once, the bubble shows its title within a second, and when the pointer leaves the button still has its `title`

#### Scenario: The Spanish key words
- **WHEN** the interface language is Spanish and the toolbar is drawn
- **THEN** the fit button's title is "Ajustar el diagrama a la vista (Mayús+1)" and its `aria-keyshortcuts` "Shift+1"

#### Scenario: A control without a title is caught
- **WHEN** a toolbar button is drawn with an `aria-label` and no `title`
- **THEN** the webview suite's check that every toolbar button has a label and a title fails naming the button

## MODIFIED Requirements

### Requirement: Keyboard operation and focus
Every pointer action SHALL have a keyboard alternative, as listed in decision 0017 and the editor guide. Focus SHALL be visible on every control and on the focused element. Elements SHALL expose their kind and label to assistive technology. A live region SHALL announce the selection and the result of each action. The canvas SHALL not use keys that VS Code binds globally (Ctrl+G, Ctrl+Shift+G, Ctrl+K chords, Ctrl+Alt with the arrows, Alt with Left or Right, Ctrl+Alt+B), and SHALL leave undo and redo to VS Code; the inspector's fold has its header and rail buttons on every canvas and the host's own chord where the host binds one.

#### Scenario: Keyboard only
- **WHEN** a user tabs into the canvas, selects `api` with Tab, nudges it with Shift+Right and presses Delete then confirms
- **THEN** each step has a visible focus indicator and an announcement, and the text changes as with the pointer

#### Scenario: Ctrl+Alt+B reaches the host
- **WHEN** the stage has the focus and Ctrl+Alt+B is pressed
- **THEN** the canvas handles nothing and does not prevent the event, which reaches the host's page; in the playground that page folds the properties
