## ADDED Requirements

### Requirement: Collapsible code pane
On a wide screen the playground SHALL fold the code pane to a 36 px rail and unfold it again: a
button at the right end of the code-path bar (**Hide the code (Ctrl+J)**, `aria-expanded`) and a
double click on the divider fold it; the rail SHALL hold one button (**Show the code (Ctrl+J)**,
`aria-expanded`, `aria-controls="code-pane"`) that unfolds it, and beneath it the open file's
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
