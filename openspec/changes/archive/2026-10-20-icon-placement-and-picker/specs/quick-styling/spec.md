## MODIFIED Requirements

### Requirement: Icon picker from the Icon field
The Icon style field of the elements and relations of flow diagrams, free compositions and C4 views SHALL open the canvas's own icon picker under the field (see `diagram-canvas`), not a dialog of the host, and the chosen reference SHALL be written with `setStyleProperty`; **Remove** SHALL remove the property. On C4 views the picker SHALL offer the icons of the document's packs, without libraries and without a placement control. Sequence diagrams, whose participants and messages draw no icons, SHALL offer no Icon or Icon colour field.

#### Scenario: Icon on a flow node
- **WHEN** `api` is selected, "Choose…" is pressed on the Icon field and `tabler:server` is chosen
- **THEN** the text gains `style api { icon "tabler:server" }`

#### Scenario: Icon on a C4 entity
- **WHEN** container `shop.api` of a C4 container view is selected, "Choose…" is pressed on the Icon field and `server` is typed
- **THEN** the picker lists the Tabler server icon and no library, and choosing it writes `style shop.api { icon "tabler:server" }`

#### Scenario: No Icon field on a sequence diagram
- **WHEN** participant `a` of a sequence diagram is selected
- **THEN** the inspector shows neither an Icon field nor an Icon colour field
