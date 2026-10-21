## MODIFIED Requirements

### Requirement: Free palette and pickers
On a free diagram the canvas palette SHALL offer box (B; a split button whose arrow opens the shapes grid, also opened with F), text (T), icon (I), image (M), group (G), the arrow tool (R; a split button with the four arrow kinds) and connect (C). On a flow diagram it SHALL offer the flow kinds as before, with T creating a tag, the node button split the same way (N, F) and the same arrow button.

- **Icon.** The host SHALL offer the icons of the packs in a list that searches as the user types, and SHALL create `icon <id> "<reference>"`.
- **Image.** The host SHALL ask for an image file and SHALL create `image <id> "<path>"` with the path relative to the `.meltemi` file. A file outside the project SHALL be refused with a message.
- **Shapes.** The grid SHALL show a picture and a name for each of the twenty-two shapes, in the interface language, SHALL find a shape as its name is typed, and SHALL create the box or node with `style <id> { shape <value> }`; the chosen shape stays current for B, N and the button's main part.

#### Scenario: Create a text
- **WHEN** the text tool is dropped at (300, 100) on a free diagram
- **THEN** the text gains `text text1 "Text"` and `place text1 at (300, 98)` (snapped to the 14 px grid), and the label editor opens

#### Scenario: Create a star on a flow diagram
- **WHEN** F is pressed on a flow diagram, `sta` is typed and Enter is pressed
- **THEN** the text gains `node1["Node"]`, `style node1 { shape star }` and a `place` near the centre, and N then creates another star

#### Scenario: Shapes hidden when read-only
- **WHEN** the canvas is read-only
- **THEN** the split buttons show no arrow part and F does nothing

#### Scenario: Dashed arrow kind
- **WHEN** the arrow button's menu is opened on a free diagram, `-->` is chosen, and `a` then `b` are clicked
- **THEN** the text gains `a --> b`

### Requirement: Interior coordinates in canvas edits
For children of groups in free diagrams, the session SHALL write positions relative to the parent's interior origin from `LayoutResult.origins`, which for an untitled group lies `groupPadding` below its top edge. This SHALL hold for moves, nudges, creations inside a group, reparenting drops, alignment, distribution, pastes and arrangements.

- Moving a group SHALL write only the group's `place`.
- Resizing a group from its left or top edge SHALL shift its children's places by the opposite amount, so they stay where they are drawn.
- Copying a child whose group is not copied SHALL carry its drawn position.
- A reparenting drop SHALL write the moved element's `place` in the new parent's interior so it stays where it was dropped.

#### Scenario: Move a child
- **WHEN** child `a` of group `g` (interior origin at (116, 120)) is drawn centred at (196, 150) and is moved by (14, 0)
- **THEN** the text gains `place a at (94, 30)`

#### Scenario: Move a group
- **WHEN** group `g` with two placed children is moved by (28, 14)
- **THEN** only `place g` changes

#### Scenario: Child of an untitled group
- **WHEN** `group g ""` is placed at (300, 200) with size (400, 240) and its child `a` is created at drawn centre (200, 150)
- **THEN** the text gains `place a at (84, 54)`, measured from the interior origin (116, 96)

### Requirement: Language services for free diagrams
Completion SHALL offer:

- the free kinds;
- `shape` with its twenty-two values, in free diagrams and on flow nodes; `radius`, `fontSize`, `fontWeight` and `textAlign` with their values;
- `layers` and `layer` with the declared layers;
- `link` with `<diagram>.<element>` targets;
- image paths of the project's image files inside `image "…"`.

Hover SHALL describe the new kinds, the shapes, `radius` and links. Go to definition on a link SHALL open the linked element. Quick fixes SHALL declare an unknown layer and remove an unknown link.

#### Scenario: Definition of a link
- **WHEN** go to definition runs on `api` in `link checkout.api`
- **THEN** the result is the declaration of `api` in `diagram checkout`

#### Scenario: Completion of shapes on a flow node
- **WHEN** completion runs after `shape ` inside `style api { }` of a flow diagram
- **THEN** the items include `hexagon`, `cloud` and `person`

#### Scenario: No text properties on a flow node
- **WHEN** completion runs inside `style api { }` of a flow diagram
- **THEN** the items include `shape` and `radius` and exclude `fontSize`
