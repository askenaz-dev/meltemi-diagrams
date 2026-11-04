## ADDED Requirements

### Requirement: Free palette and pickers
On a free diagram the canvas palette SHALL offer box (B), text (T), icon (I), image (M), group (G) and connect (C). On a flow diagram it SHALL offer the flow kinds as before, with T creating a tag.

- **Icon.** The host SHALL offer the icons of the packs in a list that searches as the user types, and SHALL create `icon <id> "<reference>"`.
- **Image.** The host SHALL ask for an image file and SHALL create `image <id> "<path>"` with the path relative to the `.meltemi` file. A file outside the project SHALL be refused with a message.

#### Scenario: Create a text
- **WHEN** the text tool is dropped at (300, 100) on a free diagram
- **THEN** the text gains `text text1 "Text"` and `place text1 at (300, 98)` (snapped to the 14 px grid), and the label editor opens

### Requirement: Order and layers on the canvas
The canvas SHALL offer bring to front (Ctrl+Shift+]), send to back (Ctrl+Shift+[), bring forward (Ctrl+]) and send backward (Ctrl+[) in the keyboard map and the context menu, each one `reorderElement`. The inspector SHALL show a Layer field for elements and relations of free diagrams, with the declared layers, and a Layers field for the diagram.

#### Scenario: Bring to front
- **WHEN** `a` is declared before `b` in the same block and `a` is brought to front
- **THEN** `a`'s declaration moves after `b`'s, and `a` is drawn above `b`

### Requirement: Interior coordinates in canvas edits
For children of groups in free diagrams, the session SHALL write positions relative to the parent's interior origin from `LayoutResult.origins`. This SHALL hold for moves, nudges, creations inside a group, alignment, distribution, pastes and arrangements.

- Moving a group SHALL write only the group's `place`.
- Resizing a group from its left or top edge SHALL shift its children's places by the opposite amount, so they stay where they are drawn.
- Copying a child whose group is not copied SHALL carry its drawn position.

#### Scenario: Move a child
- **WHEN** child `a` of group `g` (interior origin at (116, 120)) is drawn centred at (196, 150) and is moved by (14, 0)
- **THEN** the text gains `place a at (94, 30)`

#### Scenario: Move a group
- **WHEN** group `g` with two placed children is moved by (28, 14)
- **THEN** only `place g` changes

### Requirement: Convert to free composition in the editor
The canvas toolbar, the context menu and the command palette SHALL offer **Convert to Free Composition** for flow diagrams. It SHALL apply `convertToFree` and switch the canvas to the new diagram.

#### Scenario: Convert from the canvas
- **WHEN** the command runs on the checkout canvas
- **THEN** the document gains `checkout_free` and the canvas shows it

### Requirement: Language services for free diagrams
Completion SHALL offer:

- the free kinds;
- `shape`, `fontSize`, `fontWeight` and `textAlign` with their values;
- `layers` and `layer` with the declared layers;
- `link` with `<diagram>.<element>` targets;
- image paths of the project's image files inside `image "…"`.

Hover SHALL describe the new kinds and links. Go to definition on a link SHALL open the linked element. Quick fixes SHALL declare an unknown layer and remove an unknown link.

#### Scenario: Definition of a link
- **WHEN** go to definition runs on `api` in `link checkout.api`
- **THEN** the result is the declaration of `api` in `diagram checkout`
