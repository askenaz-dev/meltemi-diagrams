## MODIFIED Requirements

### Requirement: Component, deployment and use case diagrams
Description blocks SHALL become flow diagrams with `layout auto`. Elements declared with
`component`, `[t]`, `node`, `rectangle`, `agent`, `artifact`, `frame`, `package`, `stack`,
`label`, `action`, `process`, `boundary`, `control`, `entity`, `collections` SHALL become `node`;
`database`, `storage` and `queue` `data`; `cloud` `node` with `shape cloud`, `hexagon` with
`shape hexagon`, `card`, `file` and `folder` with `shape document`, `usecase` and `(t)` with
`shape ellipse`, `interface`, `()` and `circle` with `shape circle`, `actor`, `person` and `:t:`
with `shape person`, each written as `style <id> { shape … }` after the declaration. A missing or
refused include SHALL be reported and the rest of the source SHALL still be imported.
Aliases (`as x`, `"t" as x`, `x as "t"`) SHALL give ids and labels; multi-line `[ … ]` labels and
`\n` SHALL give line breaks. An element with `{ … }` SHALL become a group holding its children.
`<<stereotype>>` SHALL become the description `«stereotype»` (approximated). Colours
`#colour`, `#line:c`, `#line.dashed` and `#text:c` SHALL become `fill`, `stroke`, `line dashed`
and `color` styles.

#### Scenario: Deployment nesting
- **WHEN** a block has `node "Server" as srv { [API] as api; database "DB" as db }` and
  `api --> db : SQL`
- **THEN** the sheet has `group srv "Server"` holding `node api "API"` and `data db "DB"`, and
  `api -> db: "SQL"`

#### Scenario: Shapes kept
- **WHEN** a block declares `cloud "CDN" as cdn`, `usecase "Pay" as pay` and `actor Buyer`
- **THEN** the sheet declares `node cdn "CDN"` with `style cdn { shape cloud }`, `node pay "Pay"`
  with `style pay { shape ellipse }` and `node Buyer "Buyer"` with `style Buyer { shape person }`,
  none of them `import.approximated`

#### Scenario: Refused include
- **WHEN** a block has `!include ../outside.puml` pointing outside the project
- **THEN** `import.unsupported` is reported on the include and the other elements are imported
