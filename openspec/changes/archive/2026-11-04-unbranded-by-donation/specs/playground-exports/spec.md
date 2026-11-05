# Spec Delta

## MODIFIED Requirements

### Requirement: Exports without the branding
When the page's session is a cookie session whose answer says `user.entitlements.unbranded` is
`true`, the export dialog SHALL show a checkbox **Export without the Meltemi branding** under the
Theme field, for every format and target, unchecked each time the dialog opens, with a hint saying
what it leaves out (the strip at the foot of the sheet: the Meltemi mark, the wordmark and the
title) and that the catalog's pictures follow. Checked, the request SHALL carry `branding: "none"`
and the export SHALL be laid out with the frame override of `flow-svg-export` ("Styles and
themes"): no `frame` group and no mark gradient in the SVG, in the PNG and PDF pictures, in every
view the HTML player bundles and in every frame of a GIF, WebM or MP4, with the theme's other tokens
unchanged; the status line after the download SHALL add "Without the Meltemi branding." after the
download's message; and the catalog downloaded from the same dialog SHALL be built with the same
override for its pictures, its footer "Built with Meltemi Diagrams <version>" and its generator
meta unchanged. When the session is a cookie session whose answer says `false` and carries
`support`, the dialog SHALL show in the checkbox's place one line, "Donate to export without the
Meltemi branding", with a link to `support.url` opening in a new tab and a hint that a donation
made with the GitHub account linked to this one is recognised when the account panel is opened.
Anonymous, on a static server, for a session whose `user` lacks `entitlements` or
whose `unbranded` is anything but `true` and whose answer carries no `support`, and for a token
session, the dialog SHALL have no such control at all. The file's profiles SHALL be unaffected by
the box, and a published catalog SHALL be built without the override. The words SHALL be in the
interface language.

#### Scenario: An entitled person exports an SVG without the strip
- **WHEN** a person whose session answer carries `user.entitlements: { "unbranded": true }` checks the box and exports the `flow` template's diagram as SVG
- **THEN** the downloaded SVG has no `<g data-role="frame">`, no `meltemi-wind` gradient, the same `width` as the branded one and a `height` 44 px smaller, the same fonts and background, and the status line reads "Downloaded flow.svg. Without the Meltemi branding."

#### Scenario: The hint under the box
- **WHEN** the entitled person opens the dialog
- **THEN** under the checkbox a hint reads "Leaves out the strip at the foot of the sheet: the Meltemi mark, the wordmark and the title; the catalog's pictures follow."

#### Scenario: Every format
- **WHEN** the same person exports the `purchase` template's story as an HTML player and as a GIF with the box checked
- **THEN** no view embedded in the player holds a `frame` group, and the first GIF frame has the height of the unframed scene

#### Scenario: The catalog from the dialog
- **WHEN** the entitled person checks the box and presses the catalog button
- **THEN** no picture of the downloaded catalog holds a `frame` group or a `meltemi-wind` gradient, and the page's footer still reads "Built with Meltemi Diagrams <version>." with its generator meta

#### Scenario: Unchecked at each opening
- **WHEN** the person exported with the box checked, closes the dialog and opens it again
- **THEN** the box is unchecked and the next export carries the branding

#### Scenario: Nothing on a static server
- **WHEN** the page is served by the playground suite's static server, whose `/api/session` answers `{ "user": null }`
- **THEN** the export dialog has no checkbox about the branding, hidden or otherwise, and exports as before

#### Scenario: Nothing for a plain person
- **WHEN** a signed-in person whose session answer carries `user.entitlements: { "unbranded": false }` and no `support`, or a `user` with no `entitlements`, opens the export dialog
- **THEN** there is no checkbox about the branding and the SVG carries the strip

#### Scenario: A hostile answer entitles nobody
- **WHEN** `/api/session` answers a `user` whose `entitlements` is `{ "unbranded": "yes" }` or a string
- **THEN** the page treats the person as not entitled and shows no checkbox

#### Scenario: Profiles keep the branding
- **WHEN** the entitled person checks the box and runs the file's `sheet` profile from the dialog
- **THEN** the profile's output carries the strip its theme gives, as `meltemi-diagrams export --profile sheet` writes it

#### Scenario: In Spanish
- **WHEN** the interface language is Spanish and the entitled person opens the dialog
- **THEN** the checkbox reads "Exportar sin la marca de Meltemi", its hint "Omite la franja al pie de la hoja: la marca de Meltemi, el nombre y el título; las imágenes del catálogo la siguen.", and the status line after an unbranded download ends with "Sin la marca de Meltemi."

#### Scenario: The donation line
- **WHEN** a signed-in person whose session answer carries `"unbranded": false` and `"support": { "url": "https://github.com/sponsors/askenaz" }` opens the dialog
- **THEN** under the Theme field a line reads "Donate to export without the Meltemi branding" linking that address with `target="_blank"` and `rel="noopener"`, no checkbox exists, and the SVG carries the strip; in Spanish the line reads "Dona para exportar sin la marca de Meltemi"

#### Scenario: A hostile support address
- **WHEN** `/api/session` answers `"support": { "url": "javascript:alert(1)" }` or a `support` that is not an object with an `https:` URL
- **THEN** the page shows no line and no link
