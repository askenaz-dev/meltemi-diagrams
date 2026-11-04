## ADDED Requirements

### Requirement: Empty file and new diagrams
When the document has no diagram and no story is playing, the canvas SHALL show the reason and one button per kind it can create — flow diagram, free composition, sequence diagram — and SHALL clear the diagram selector, the inspector, the minimap and the layout and stale badges of the last render. A button SHALL write `diagram <id>: <type> { }` through `createDiagram` and show the new diagram. A **New diagram** button beside the diagram selector SHALL offer the same kinds for any file. Read-only canvases SHALL show neither the buttons nor the New diagram button.

#### Scenario: Start from an empty file
- **WHEN** the text is emptied and the Flow diagram button is pressed
- **THEN** the text becomes `language "0.2"`, a blank line and `diagram diagram1: flow {` … `}`, the canvas shows the empty diagram with its palette, and the selector names `diagram1`

#### Scenario: Nothing stale is left
- **WHEN** a file showing `overview` is emptied
- **THEN** the selector, the inspector, the minimap and the layout badge no longer show `overview`

#### Scenario: Another diagram in the file
- **WHEN** New diagram › Free composition is chosen in a file declaring `overview`
- **THEN** `diagram diagram1: free {` … `}` is appended after `overview` and shown

#### Scenario: Read-only
- **WHEN** the canvas is read-only and the file has no diagram
- **THEN** the reason is shown without buttons

### Requirement: Canvas size in the inspector
The diagram inspector SHALL show a **Canvas** field with fit to content, document, slide and custom, and, for custom, a width and a height from 100 to 10000. Choosing SHALL write `preset document`, `preset slide` or `canvas (w, h)` and remove the other statement in the same plan, or remove both for fit to content. Custom SHALL start from the drawn size of the content.

#### Scenario: A slide
- **WHEN** Canvas › Slide is chosen for a diagram with `canvas (800, 600)`
- **THEN** the text has `preset slide` and no `canvas` statement, in one undo step

#### Scenario: A custom size
- **WHEN** Canvas › Custom is chosen and the width is set to 1600 and the height to 900
- **THEN** the text has `canvas (1600, 900)` and no `preset`

#### Scenario: Out of range
- **WHEN** 50 is typed as the width
- **THEN** the field refuses it with the range and the text is unchanged

### Requirement: Visible split buttons
The arrow part of the box/node button and of the relation button SHALL be a visible dropdown control: a chevron in the foreground colour, at least 16 px wide and as tall as the button, inside one outline shared with the main part, with hover and keyboard focus states and a tooltip naming its menu and key ("More shapes (F)", "Kinds of arrow (R cycles)", in the interface language). A right-click or a press longer than 450 ms on the main part SHALL open the same menu; a short click SHALL still arm the tool.

#### Scenario: Long press
- **WHEN** the box button is pressed for half a second and released
- **THEN** the shapes grid is open and no tool is armed

#### Scenario: Short click
- **WHEN** the box button is clicked
- **THEN** the box tool is armed with the current shape and no menu opens

### Requirement: Live preview of moves and resizes
While boxes of a flow diagram, a free composition or a C4 view are dragged or resized, the canvas SHALL send `preview` messages carrying the move or resize the drop would send, at most one awaiting an answer, the latest gesture first. The session SHALL plan it as the drop would, apply it to a copy of the text without writing, recording history or changing the revision, lay out the shown diagram and answer with its drawing, or with none when the action would be refused or the copy has errors. The canvas SHALL show the answered drawing, keeping the dragged boxes under the pointer, so connectors, labels and groups follow during the gesture; Escape or a refused drop SHALL bring back the last drawing.

#### Scenario: A connector follows a dragged box
- **WHEN** `api` with `client -> api` is dragged 200 px right and the pointer is still pressed
- **THEN** the stage draws the connector of `client -> api` ending at `api`'s new position, and the text is unchanged

#### Scenario: Escape restores
- **WHEN** the same drag is cancelled with Escape
- **THEN** the stage shows the drawing from before the drag and nothing is written

#### Scenario: A group grows with its child
- **WHEN** a child of an unsized free group is resized larger
- **THEN** the group's drawing grows during the gesture as it will after the drop

#### Scenario: Refused preview
- **WHEN** a preview carries a move of a group into a group it holds, which the session refuses
- **THEN** the answer has no drawing and the canvas keeps moving the boxes alone
