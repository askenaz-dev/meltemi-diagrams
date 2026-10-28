## ADDED Requirements

### Requirement: Collapsible properties panel
Ctrl+Alt+B (Cmd+Alt+B) SHALL fold the canvas's properties panel to its rail or unfold it from anywhere in the page, the code's own textarea included, except while a dialog is open or the focus is in a native input, a select, a contenteditable field or a textarea other than the code's, claiming the key from the browser as Ctrl+J is claimed; on a narrow screen it SHALL fold or unfold the panel inside the Canvas tab without switching tabs. The page SHALL name the chord to the canvas, so the toolbar's **Show the properties** toggle and the panel's fold and rail buttons show "(Ctrl+Alt+B)" ("(Cmd+Alt+B)" on Apple systems) in their tooltips. Whether the panel is folded SHALL be kept with the canvas's state under the page's settings, as the toolbar's toggle is kept today, read as a boolean only; the page SHALL give the canvas `inspector: false` as its default when the window is narrower than 1100 px at load, so a first visit there starts with the rail, and a kept choice SHALL win over the default. The canvas SHALL keep its viewport (no fit, no zoom) as its stage grows or shrinks.

#### Scenario: Ctrl+Alt+B from the code
- **WHEN** the code's textarea has the focus and Ctrl+Alt+B is pressed, then pressed again
- **THEN** the properties panel is a 36 px rail after the first press, open after the second, the canvas's zoom and offset are what they were, and the toolbar's **Show the properties** toggle follows with `aria-pressed`

#### Scenario: The chord in the tooltips
- **WHEN** the pointer rests on the toolbar's **Show the properties** toggle
- **THEN** the bubble reads "Show the properties (Ctrl+Alt+B)" ("Mostrar las propiedades (Ctrl+Alt+B)" in Spanish) and the toggle's `aria-keyshortcuts` is "Control+Alt+B"

#### Scenario: Kept across a reload
- **WHEN** the panel is folded from its header button and the page is reloaded
- **THEN** the panel is still a rail and its button **Show the properties panel** is visible

#### Scenario: A first visit below 1100 px
- **WHEN** the page opens at 1000 px wide with nothing kept
- **THEN** the properties panel is a rail and the explorer is a rail; after the rail's button is pressed and the page reloaded at the same width, the panel is open

#### Scenario: Narrow screen
- **WHEN** the page is 375 px wide with a kept open panel and the Canvas tab is shown
- **THEN** the panel shows beside the stage, Ctrl+Alt+B folds it to the rail without changing the tab, and the page does not scroll sideways

#### Scenario: Ctrl+Alt+B in a native input
- **WHEN** Ctrl+Alt+B is pressed while the explorer's rename box, a dialog's field or a field of the inspector has the focus
- **THEN** the panel does not change and the field keeps its text

#### Scenario: A kept value that is not a boolean
- **WHEN** the kept settings hold `"canvas": { "inspector": "no" }`
- **THEN** the page opens with the panel shown on a wide window and keeps working

### Requirement: Tooltips of the page's controls
Every icon-only button of the page (the header's Undo, Redo, Format, theme switch and About, the explorer's bar, head and rail buttons, the project switcher's rename and close buttons and the tree rows' ⋯, the code bar's and the code rail's buttons) SHALL have an accessible name that says what it does without naming a key, a `title` equal to that name followed by the key in parentheses when the control has one, and `aria-keyshortcuts` holding the key as ARIA writes it ("Control+Z", "Control+Shift+Z", "Shift+Alt+F", "Control+B", "Control+J"; "Meta" for Cmd on Apple systems); the page SHALL draw their tooltips with the canvas's bubble, scoped so the canvas's own bubble keeps `#app`, shown 400 ms after the pointer rests and fading in, the control keeping its `title`. The theme switch SHALL be named per state, **Switch to the dark theme** while the page is light and **Switch to the light theme** while it is dark. The three pane glyphs SHALL differ: the explorer's a frame with a bar at the left, the code pane's a frame with code chevrons inside, the properties' a frame with a bar at the right holding two rows. Every word SHALL exist in English and Spanish.

#### Scenario: Undo's tooltip
- **WHEN** the pointer rests on the header's Undo button
- **THEN** no bubble shows at once, the page's bubble shows "Undo (Ctrl+Z)" within a second, the button's `aria-label` is "Undo", its `aria-keyshortcuts` "Control+Z", and the button still has its `title` after the pointer leaves

#### Scenario: Format without the key in its name
- **WHEN** the header is drawn
- **THEN** the Format button's `aria-label` is "Format the file", its title "Format the file (Shift+Alt+F)" and its `aria-keyshortcuts` "Shift+Alt+F"; in Spanish "Dar formato al archivo", "Dar formato al archivo (Mayús+Alt+F)" and "Shift+Alt+F"

#### Scenario: The theme switch says what it will do
- **WHEN** the page is light and the theme switch is pressed
- **THEN** the button was named "Switch to the dark theme" before the press and is named "Switch to the light theme" after it, with the sun glyph

#### Scenario: One bubble per region
- **WHEN** the pointer rests on the toolbar's Zoom in button inside the canvas
- **THEN** exactly one bubble shows, "Zoom in (+)", drawn by the canvas's own tooltips and not by the page's

#### Scenario: The pane glyphs differ
- **WHEN** the explorer's fold button, the code bar's fold button and the properties' fold button are drawn
- **THEN** their SVG path data are three different strings

#### Scenario: A button added without a name is caught
- **WHEN** an icon-only button of the header is drawn without an `aria-label` or a `title`
- **THEN** the browser suite's check of the header's buttons fails naming the button

## MODIFIED Requirements

### Requirement: Collapsible code pane
On a wide screen the playground SHALL fold the code pane to a 36 px rail and unfold it again: a
button at the right end of the code-path bar (**Hide the code**, titled "Hide the code (Ctrl+J)",
`aria-keyshortcuts="Control+J"`, `aria-expanded`, drawing a frame with code chevrons inside) and a
double click on the divider fold it; the rail SHALL hold one button (**Show the code**, titled
"Show the code (Ctrl+J)", `aria-keyshortcuts="Control+J"`, `aria-expanded`,
`aria-controls="code-pane"`, the same glyph) that unfolds it, and beneath it the open file's
error count when the file has errors, with the problems' summary as its title, and nothing
otherwise. Ctrl+J (Cmd+J) SHALL toggle the pane from anywhere in the page, the code's own
textarea included, except while a dialog is open or the focus is in a native input, a select, a
contenteditable field or a textarea other than the code's, claiming the key from the browser as
Ctrl+S is claimed. Whether the pane is folded SHALL be kept with the page's settings beside the code's
share, read as folded only when the kept value is a boolean `true`; unfolding SHALL restore the
kept share. Folding from inside the pane SHALL move the focus to the rail's button and unfolding
SHALL put it in the code. The grid's columns SHALL move with the page's transition and none under
reduced motion; the canvas SHALL keep its viewport (no fit, no zoom) as its pane grows or shrinks;
the divider SHALL keep its column, hidden and inert, while the pane is folded. A reveal that asks
for the focus (**Show in text** from the canvas's menus, go to definition, a problem's line, a
quick fix) SHALL unfold the pane; opening a file from the explorer and a canvas selection SHALL
leave it folded. Go to definition, Ctrl+click and the problems list live inside the pane and fire
only while it is open. On a narrow screen the code SHALL stay the Code
tab, whole, whatever is kept, the bar button and the rail SHALL not be shown, and Ctrl+J SHALL
show the Code tab when another is shown and the Canvas tab otherwise.

#### Scenario: Fold from the bar and keep it
- **WHEN** the code-path bar's **Hide the code** button is pressed and the page is reloaded
- **THEN** the code pane is a 36 px rail with one button and the canvas takes the width, the canvas's zoom and offset are what they were, and after the reload the pane is still a rail

#### Scenario: The fold buttons' names and titles
- **WHEN** the code pane is open
- **THEN** the bar's button has `aria-label` "Hide the code", title "Hide the code (Ctrl+J)" and `aria-keyshortcuts` "Control+J", and once folded the rail's button has "Show the code", "Show the code (Ctrl+J)" and "Control+J"; in Spanish "Ocultar el código", "Ocultar el código (Ctrl+J)" and "Mostrar el código", "Mostrar el código (Ctrl+J)"

#### Scenario: Ctrl+J unfolds and focuses the code
- **WHEN** Ctrl+J is pressed on a folded pane
- **THEN** the pane is open at its kept share, the divider's `aria-valuenow` is that share and the code's textarea has the focus

#### Scenario: Double click on the divider
- **WHEN** the divider is double-clicked with the code at 60 % of the width
- **THEN** the pane folds, no share is written, and unfolding brings it back to 60 %

#### Scenario: Errors on the rail
- **WHEN** the pane is folded and the open file gains `style missing { fill "#fff" }` without `missing`
- **THEN** the rail shows 1 under its button, titled with the problems' summary, and the live region announces the summary; fixing the line removes the number

#### Scenario: A reveal with focus unfolds
- **WHEN** the pane is folded and **Show in text** is chosen in the canvas's context menu for `api`
- **THEN** the pane unfolds at its kept share and `api`'s declaration is selected in the code with the focus

#### Scenario: Opening a file leaves it folded
- **WHEN** the pane is folded and another diagram is opened from the explorer
- **THEN** the canvas shows that diagram and the pane stays a rail, its badge counting that file's errors

#### Scenario: A canvas selection leaves it folded
- **WHEN** the pane is folded and an element is selected on the canvas
- **THEN** the pane stays a rail, and its text is selected in the code when the pane unfolds

#### Scenario: Narrow screen keeps the tabs
- **WHEN** the page is 375 pixels wide with a kept folded state
- **THEN** the tabs are Files, Code and Canvas, the Code tab shows the whole code with no rail and no bar button, the page does not scroll sideways, and Ctrl+J shows the Canvas tab

#### Scenario: Reduced motion
- **WHEN** the system asks for reduced motion and the pane is folded
- **THEN** the columns change with a transition of 0 s, while without it they take 0.18 s

#### Scenario: A kept value that is not a boolean
- **WHEN** the kept settings hold `"code": { "collapsed": "yes" }`
- **THEN** the page opens with the code pane open and keeps working

#### Scenario: Ctrl+J in a native input
- **WHEN** Ctrl+J is pressed while the explorer's rename box or a dialog's field has the focus
- **THEN** the pane does not change and the field keeps its text
