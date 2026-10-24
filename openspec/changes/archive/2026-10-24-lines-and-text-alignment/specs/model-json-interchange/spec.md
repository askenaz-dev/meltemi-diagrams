## ADDED Requirements

### Requirement: Lines and heads in JSON
Each relation SHALL carry `heads` (`end`, `both` or `none`) after `twoWay`, in every profile; each element SHALL carry `line` after `shape`: `{ "from": { "x", "y" }, "to": { "x", "y" }, "via": [ { "x", "y" }, … ] }` for a free `line` object, null otherwise. Style entries SHALL carry `verticalAlign` as any other property, and theme `tokens` SHALL carry `sketch` when written. Key order SHALL stay fixed and `version` stays `0.1`, since the keys are added and no existing one changes.

#### Scenario: A headless relation
- **WHEN** a flow diagram with `api -- cache as link` and `api <--> db` is serialised
- **THEN** `link` has `line` `solid`, `twoWay` false and `heads` `none`, and `api->db#1` has `line` `dashed`, `twoWay` true and `heads` `both`

#### Scenario: A line object
- **WHEN** `corpus/valid/free/lines.meltemi` is serialised
- **THEN** its `line` elements have kind `line`, `shape` null and a `line` object with `from`, `to` and `via`, every box has `line` null, and the output matches the stored snapshot

#### Scenario: Stable key order with the new keys
- **WHEN** the same compilation is serialised twice
- **THEN** the two strings are identical, `heads` follows `twoWay` in every relation and `line` follows `shape` in every element

#### Scenario: A sketch token in a theme
- **WHEN** a file with `theme hand { extends "technical.light"; sketch rough }` is serialised
- **THEN** `themes` holds one entry whose `tokens` are `{ "sketch": "rough" }`

#### Scenario: A line in a flow diagram is not serialised
- **WHEN** a flow diagram containing `line l from (0, 0) to (100, 0)` is serialised
- **THEN** `ok` is false, that diagram is omitted from `diagrams`, and `diagnostics` holds `prop.unknown` on `line`
