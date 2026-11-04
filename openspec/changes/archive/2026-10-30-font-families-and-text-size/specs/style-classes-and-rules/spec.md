## ADDED Requirements

### Requirement: Text properties in every profile
Style blocks, classes and rules of every profile SHALL accept three text properties:

- `font "<stack>"`, a quoted, non-empty CSS font stack, the family the target's text is measured, embedded, outlined and drawn with (the first bundled or project family of the stack; estimates and one `layout.unmeasured-font` per diagram naming the stack when none is);
- `fontSize <number>` from 6 to 160, the size of the target's text;
- `fontWeight 400|500|600|700`, its weight.

They SHALL apply to every target that draws text: elements of the kinds `node`, `decision`, `data`, `datastore`, `note`, `tag`, `group`, `box`, `text` and `sticky`, sequence participants and C4 entities; relations and free lines (their label, and the technology line of a C4 relation); and the sequence events `note` and `fragment`. Without them a target SHALL keep the theme's size and weight of its kind: `labelSize` and `labelWeight` for nodes, decisions, data stores, entities, participants and boxes, 1.6 × `labelSize` for texts, 1.2 × `labelSize` at 400 for stickies, `groupTitleSize` for a group's title, `noteSize` at 400 for notes, `tagSize` at 500 for tags, `relationLabelSize` at 500 for relation labels, at 400 for sequence messages and at 600 for a fragment's operator. The three SHALL be `prop.invalid-value` on `icon`, `image` and `pen` targets of `style` statements and rules, with the hint that they apply to targets that draw text, and a class carrying them SHALL ignore them on such a target. An empty `font`, a `fontSize` outside 6 to 160 and a `fontWeight` that is not one of the four SHALL be `prop.invalid-value` naming the expected value. `textAlign`, `verticalAlign` and `opacity` SHALL stay free-only. The model SHALL store `font` as a string, the sizes as numbers, and the model JSON SHALL carry them in the style entry.

#### Scenario: Text properties on a flow node
- **WHEN** a flow diagram contains `style api { font "Roboto"; fontSize 16; fontWeight 500 }`
- **THEN** the style entry of `api` has `font` `Roboto`, `fontSize` 16 and `fontWeight` 500, no diagnostic is reported, and the model JSON of the diagram carries the three in that entry

#### Scenario: A rule sizes every note
- **WHEN** a sequence diagram contains `rule note { fontSize 12; font "Caveat" }`
- **THEN** every note is measured and drawn in Caveat at 12 px, and a note with `style n1 { fontSize 14 }` is drawn at 14 px in Caveat

#### Scenario: Font on an image
- **WHEN** a free composition contains `style logo { font "Lora" }` on an image and `class big { fontSize 24 }` applied to that image
- **THEN** `prop.invalid-value` is reported on the style's `font` with the hint that it applies to targets that draw text, and the class's `fontSize` is ignored without a diagnostic

#### Scenario: Values that do not fit
- **WHEN** a diagram contains `style a { font ""; fontSize 200; fontWeight 650 }`
- **THEN** `prop.invalid-value` is reported on `""` naming a non-empty quoted font stack, on `200` naming the range 6 to 160, and on `650` listing 400, 500, 600 and 700

#### Scenario: Alignment stays free-only
- **WHEN** a flow diagram contains `style api { fontSize 15; textAlign left }`
- **THEN** `fontSize` is recorded and `prop.invalid-value` is reported on `textAlign` with the hint naming free diagrams and the three free-only properties
