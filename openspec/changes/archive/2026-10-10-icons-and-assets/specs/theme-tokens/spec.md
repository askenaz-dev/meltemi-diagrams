## MODIFIED Requirements

### Requirement: Token table
Theme blocks SHALL accept the following tokens. An unknown token SHALL be `prop.unknown` with the list of tokens, and a value that does not fit SHALL be `prop.invalid-value` naming the expected value or range.

| Tokens | Value |
|---|---|
| `background`, `surface`, `ink`, `muted`, `line`, `connector`, `band`, `bandLine`, `tag`, `tagText`, `accent`, `accentEnd`, `success`, `warning`, `danger`, `info` | a quoted, non-empty colour |
| `font`, `mono`, `brand`, `extends` | a quoted string |
| `labelSize`, `descriptionSize`, `groupTitleSize`, `noteSize`, `tagSize`, `relationLabelSize`, `frameSize` | a number from 6 to 48 |
| `labelWeight` | 400, 500, 600 or 700 |
| `padding`, `groupPadding`, `groupHeader`, `margin` | a number from 0 to 200 |
| `radius`, `groupRadius` | a number from 0 to 64 |
| `strokeWidth`, `connectorWidth` | a number from 0 to 8 |
| `arrowSize` | a number from 0 to 32 |
| `arrowhead` | `triangle`, `open` or `none` |
| `iconSize` | a number from 8 to 64 (technical 18, editorial 16, stage 24) |
| `iconPosition` | `left` or `top` (stage `top`, the others `left`) |
| `frame` | `none`, `footer` or `header` |
| `mark` | `meltemi` or `none` |

Numbers SHALL be written without a unit or with `px`, and SHALL be stored as numbers.

#### Scenario: Type and spacing tokens
- **WHEN** a theme block contains `labelSize 15; padding 20px; arrowhead open`
- **THEN** the theme definition has `labelSize` 15, `padding` 20 and `arrowhead` `open`, and no diagnostic is reported

#### Scenario: Number out of range
- **WHEN** a theme block contains `labelSize 80`
- **THEN** `prop.invalid-value` is reported on `80` and the message names the range 6 to 48

#### Scenario: Wrong value type
- **WHEN** a theme block contains `radius "8"` and `labelWeight 650`
- **THEN** `prop.invalid-value` is reported on `"8"` naming a number from 0 to 64, and on `650` listing 400, 500, 600 and 700

#### Scenario: Icon tokens
- **WHEN** a theme block contains `iconSize 20; iconPosition top`, and another contains `iconPosition right`
- **THEN** the first has `iconSize` 20 and `iconPosition` `top`, and `prop.invalid-value` is reported on `right` listing `left, top`
