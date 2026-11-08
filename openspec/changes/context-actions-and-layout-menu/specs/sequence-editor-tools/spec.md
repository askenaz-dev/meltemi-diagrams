# Spec Delta

## ADDED Requirements

### Requirement: Number messages toggle
The context menu of a sequence diagram on a canvas that edits SHALL offer **Number messages** as
a checkable item, checked when the diagram has `autonumber`, and the command palette SHALL offer
the same command. Choosing it SHALL write `autonumber` among the diagram's properties when it is
off, or remove the statement, whatever its start, when it is on. The inspector's **Number messages
from** field SHALL keep choosing the first number. A scenario preview SHALL offer the item
disabled.

#### Scenario: Turn numbering on
- **WHEN** the context menu opens on the payment canvas without `autonumber` and **Number messages** is chosen
- **THEN** the text gains `autonumber`, the messages show their discs, and the menu item is checked the next time

#### Scenario: Turn numbering off
- **WHEN** the diagram has `autonumber 10` and **Number messages** is chosen
- **THEN** the statement is removed and the discs disappear

#### Scenario: From the palette
- **WHEN** the **Number messages** command runs while a sequence diagram is shown
- **THEN** it writes or removes `autonumber` as the menu item does, and on another kind of diagram it is unavailable

#### Scenario: Disabled in a preview
- **WHEN** a scenario is previewed and the context menu opens
- **THEN** **Number messages** is listed disabled and choosing it writes nothing
