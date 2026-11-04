## MODIFIED Requirements

### Requirement: Accessible and responsive page
The page SHALL use landmarks and labelled controls, keep a visible focus, reach every action by
keyboard, announce changes in the problems of the open file and export outcomes in a polite live
region, follow the system's light or dark scheme with a switch that the page remembers, use no
transitions or animations of its own when reduced motion is asked (exported players honour it as
they do everywhere), and work at 375 pixels wide by showing the code and the canvas as tabs, the
Canvas tab first.

#### Scenario: Narrow screen
- **WHEN** the page is 375 pixels wide
- **THEN** the code and the canvas are tabs, the Canvas tab is shown with its drawing fitted to
  its stage, and the page does not scroll sideways

## ADDED Requirements

### Requirement: Compact header on a narrow screen
Below 768 pixels wide the header SHALL be one row from 360 pixels wide: the logo and the buttons'
pictures, their words kept for assistive technology, and a **More** menu holding the theme switch,
About and the language choices, which the row SHALL not show otherwise. More SHALL not show on a
wider screen. The canvas's toolbar SHALL be one row there that scrolls sideways, its menus opening
in view.

#### Scenario: One row on a phone
- **WHEN** the page is 360, 375 or 412 pixels wide
- **THEN** the header and the canvas's toolbar are one row each, and the page does not scroll
  sideways

#### Scenario: More
- **WHEN** More is pressed on a narrow screen
- **THEN** its menu lists the theme switch, About, Automatic, English and Español, inside the
  screen, and choosing the theme switch changes the theme

#### Scenario: A wide screen
- **WHEN** the page is 1024 pixels wide
- **THEN** the theme switch, About and the language are buttons of the header, and More is not shown
