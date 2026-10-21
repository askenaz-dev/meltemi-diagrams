## MODIFIED Requirements

### Requirement: Free palette and pickers
On a free diagram the canvas palette SHALL offer box (B; a split button whose arrow opens the shapes grid, also opened with F), text (T), icon (I), image (M), group (G), the arrow tool (R; a split button with the four arrow kinds) and connect (C). On a flow diagram it SHALL offer the flow kinds as before, with T creating a tag, the node button split the same way (N, F) and the same arrow button. Boxes SHALL be created with an empty label and without opening the label editor; texts SHALL be created with their default text and open it.

- **Icon.** The host SHALL offer the icons of the packs in a list that searches as the user types, and SHALL create `icon <id> "<reference>"`.
- **Image.** The host SHALL ask for an image file and SHALL create `image <id> "<path>"` with the path relative to the `.meltemi` file. A file outside the project SHALL be refused with a message.
- **Shapes.** The grid SHALL show a picture and a name for each of the twenty-three shapes, in the interface language, SHALL find a shape as its name is typed, and SHALL create the box or node with `style <id> { shape <value> }`; the chosen shape stays current for B, N and the button's main part.

#### Scenario: Create a text
- **WHEN** the text tool is dropped at (300, 100) on a free diagram
- **THEN** the text gains `text text1 "Text"` and `place text1 at (300, 98)` (snapped to the 14 px grid), and the label editor opens

#### Scenario: Create an empty box
- **WHEN** B is pressed on a free diagram
- **THEN** the text gains `box box1 ""` and a `place` near the centre, `box1` is selected and no label editor is open

#### Scenario: Create a star on a flow diagram
- **WHEN** F is pressed on a flow diagram, `sta` is typed and Enter is pressed
- **THEN** the text gains `node1[""]`, `style node1 { shape star }` and a `place` near the centre, and N then creates another star

#### Scenario: Shapes hidden when read-only
- **WHEN** the canvas is read-only
- **THEN** the split buttons show no arrow part and F does nothing

#### Scenario: Dashed arrow kind
- **WHEN** the arrow button's menu is opened on a free diagram, `-->` is chosen, and `a` then `b` are clicked
- **THEN** the text gains `a --> b`
