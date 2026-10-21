# links Specification

## Purpose
Hyperlinks of elements, model entities and whole pictures, kept by SVG, PDF and HTML exports.
## Requirements
### Requirement: Element and entity URLs
Elements of every profile and model entities SHALL take `url "<url>"` with an `http:`, `https:` or
`mailto:` URL (`prop.invalid-value` otherwise); the SVG SHALL wrap the element's drawing in an `<a>`
element, kept by PDF and HTML exports.

#### Scenario: Linked box
- **WHEN** `api["API"] { url "https://docs.example.com/api" }` is exported as SVG
- **THEN** the drawing of `api` is inside `<a href="https://docs.example.com/api">`

### Requirement: Picture link
A profile's `link` (and `--link`) SHALL make the whole picture of an SVG or PDF export a link, such
as a frame that leads to the story's player.

#### Scenario: Frame with a link to the walkthrough
- **WHEN** a PDF profile of a story frame has `link "purchase.purchase.html"`
- **THEN** the page links to the player

