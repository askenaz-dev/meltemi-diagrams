## MODIFIED Requirements

### Requirement: Semantic differences
`diffDocuments(before, after)` SHALL list the diagrams, elements, relations, models, entities,
stories, scenes, themes and export profiles added, removed, renamed or changed between two
versions of a document, with what changed for each (label, kind, description, technology, URL,
link, classes, tags, group, place, size, route, label position, style, effects, diagram properties,
scenarios, C4 lists, constraints, story timing and actions). An id that changed SHALL be reported
as a rename when the item kept its kind and enough of its label, place, description or relations;
relations and story targets SHALL be compared through those renames. Comments and formatting SHALL
not count.

#### Scenario: Rename, not delete and create
- **WHEN** element `api["API Gateway"]` becomes `gateway["API Gateway"]` with its relations
- **THEN** the only change is `> element api → gateway "API Gateway"`

#### Scenario: Relabel
- **WHEN** the label of `api` changes and its id stays
- **THEN** one change reports the old and new label

#### Scenario: A tag added to a message
- **WHEN** `tag "PKCE"` is added to the block of the sequence message `authorize`
- **THEN** one change reports that the tags of `authorize` changed, and nothing else is listed

#### Scenario: A comment beside a tag
- **WHEN** only a comment after `tag "PKCE"` changes, or the tag's statement is reformatted onto its own line
- **THEN** no change is listed
