## ADDED Requirements

### Requirement: A sharp drawing at every zoom

The interactive player SHALL make its content layer a compositor layer (`will-change: transform`)
only while the user viewport changes at once (wheel, pinch, drag, keys, resize): from that change
until the viewport has rested for 150 ms. At rest the layer SHALL carry no such hint, so the browser
paints the drawing at the current zoom.

#### Scenario: A wheel zoom is painted again once the view rests

- **WHEN** Ctrl and a wheel delta of −120 arrive over the player of `purchase`, and the view then
  rests
- **THEN** the content layer has `will-change: transform` right after the wheel and `auto` within two
  seconds after, at the larger zoom.
