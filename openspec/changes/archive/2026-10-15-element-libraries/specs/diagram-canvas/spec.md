## ADDED Requirements

### Requirement: Element libraries panel
The canvas SHALL offer a Libraries panel for flow and free diagrams (a toolbar toggle and the key U) with a search box and the libraries the document knows, each with its categories; a category SHALL list its elements with a 24 px thumbnail and the label. Clicking an element SHALL create it at the centre of the view and dragging it onto the canvas SHALL create it where it is dropped: a node (a box in free compositions) labelled as the element, with `style <id> { icon "<pack>:<name>" }` written after its declaration, then selected with its label ready to edit. Search SHALL match labels, names and keywords across the libraries and show up to 60 elements. Thumbnails of a pack still loading SHALL be asked for again when a later render arrives.

#### Scenario: Create from a library
- **WHEN** "AWS Lambda" of the AWS library's Compute category is clicked in a flow diagram
- **THEN** the text gains `lambda1["AWS Lambda"]` followed by `style lambda1 { icon "aws:lambda" }`, and `lambda1` is selected

#### Scenario: Search across libraries
- **WHEN** `postgres` is typed in the panel's search box
- **THEN** the Technology library's PostgreSQL element is listed
