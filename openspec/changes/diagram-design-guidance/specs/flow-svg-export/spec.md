## ADDED Requirements

### Requirement: The image role of an exported SVG
`renderSvg` SHALL write `role="img"` on the root element of a scene that has a title and holds no
link, so that assistive technology reads its `<title>` as the image's name and its `<desc>` as its
description. A scene without a title, or with a link, SHALL get no `role`, and a host that exposes
the parts of the drawing SHALL be able to ask for none. The `<title>` and `<desc>` elements SHALL
stay as they are, without `id`.

#### Scenario: A titled sheet
- **WHEN** a diagram with `title "Checkout"` and `description "Purchase path"` and no link is exported as SVG
- **THEN** the root element carries `role="img"`, and `<title>Checkout</title>` and `<desc>Purchase path</desc>` come before any shape

#### Scenario: A sheet with a link
- **WHEN** a titled diagram in which an element has a link is exported as SVG
- **THEN** the root element carries no `role` and the `<a href` of the link is in the SVG

#### Scenario: A sheet without a title
- **WHEN** a diagram without a title is exported as SVG
- **THEN** the root element carries no `role`

#### Scenario: A host that exposes the parts
- **WHEN** the player draws a frame of a titled diagram whose elements it makes selectable
- **THEN** it asks for no role and the frame's root element carries none
