## ADDED Requirements

### Requirement: Name navigation to the code
The shared canvas context-menu action that reveals an element's declaration SHALL be named
**Go to code** in English and **Ir al código** in Spanish. It SHALL keep its existing `focusText`
event and be available in view-only menus as well as editable menus.

#### Scenario: Navigate from an editable canvas
- **WHEN** the selected element's context menu is opened in English or Spanish
- **THEN** the navigation action is named Go to code or Ir al código, respectively, and activating it reveals that element's declaration with the code editor focused

#### Scenario: Navigate while viewing
- **WHEN** an element's view-only context menu is opened
- **THEN** the same localized action is offered without enabling actions that edit the diagram
