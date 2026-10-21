## MODIFIED Requirements

### Requirement: Element and entity URLs
Elements of every profile and model entities SHALL take `url "<url>"` with an `http:`, `https:` or
`mailto:` URL (`prop.invalid-value` otherwise); the SVG SHALL wrap the element's drawing in an `<a>`
element, kept by PDF and HTML exports. In the interactive player a click on the element SHALL select
it and the detail panel SHALL offer **Open link**, which opens the URL in a new tab with
`noopener noreferrer`; a click with Ctrl, Cmd or the middle button SHALL follow the link as the
browser does; with `interactive="false"` the anchor SHALL behave natively.

#### Scenario: Linked box
- **WHEN** `api["API"] { url "https://docs.example.com/api" }` is exported as SVG
- **THEN** the drawing of `api` is inside `<a href="https://docs.example.com/api">`

#### Scenario: Click selects, the panel opens the link
- **WHEN** that element is clicked in the interactive player
- **THEN** it is selected, no window opens, the panel's **Open link** names
  `https://docs.example.com/api`, and a Ctrl+click opens it in a new tab

#### Scenario: Unsafe scheme refused
- **WHEN** an element writes `url "javascript:alert(1)"`
- **THEN** `prop.invalid-value` is reported on the value and no `<a>` is written
