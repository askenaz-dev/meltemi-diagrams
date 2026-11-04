# Spec Delta

## MODIFIED Requirements

### Requirement: The page as a guest
With `?live=<token>` in the address the page SHALL connect to the room with the token, its
guest id and name (or the account's cookie when signed in), open the project bound to the
page in the mode `hello`'s role gives, keep nothing in IndexedDB, show a guest bar naming
the session and the person with a name field and a sign-in link, and keep `live` in the
address so that a reload rejoins. A guest editor SHALL edit text, canvas and files through
the room with own-edits undo; the page SHALL hide or refuse, with a sentence that offers
sign-in, adding images and fonts, versions, the thumbnail, sharing and publishing. "Make a
copy" SHALL work, and "Save a copy to my projects" when signed in. The default name SHALL be
"Guest NN" (Spanish "Invitado NN"), NN two digits derived from the guest id.

#### Scenario: Editing without an account
- **WHEN** an anonymous browser opens the live link of a session that lets guests edit
- **THEN** the page opens the project for editing without a snapshot, the guest bar shows "Guest NN", typing reaches the owner's page, and IndexedDB holds no copy of the project

#### Scenario: An image refused
- **WHEN** a guest drops an image on the canvas
- **THEN** nothing is uploaded and the status line says images need an account, with sign-in

#### Scenario: Renamed
- **WHEN** the guest types "Ana" in the name field
- **THEN** the page reconnects and the owner's header lists "Ana" within two seconds
