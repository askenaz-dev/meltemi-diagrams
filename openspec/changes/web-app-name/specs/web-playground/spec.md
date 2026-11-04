# Spec Delta

## ADDED Requirements

### Requirement: The page's name
The page SHALL present itself as Meltemi Diagrams. Its title, description, loading and failure
lines, header, About and hints SHALL call it Meltemi Diagrams, "the app" ("la app") or "in the
browser" ("en el navegador"), and no visible word of the page or of the Worker's own pages, in
either language, SHALL call it a playground. About SHALL say that without an account nothing
written is sent anywhere, and that with one, projects can be kept in the cloud and shared.

#### Scenario: The title and About
- **WHEN** the page loads in English
- **THEN** the document title is "Meltemi Diagrams", the header's tag reads "Web", the About
  button is named "About Meltemi Diagrams", the dialog's title is the same and its first
  paragraph says that without an account nothing written is sent anywhere

#### Scenario: In Spanish
- **WHEN** the page loads in the Spanish interface
- **THEN** the document title is "Meltemi Diagrams", the About button and the dialog are
  "Acerca de Meltemi Diagrams" and the loading line is "Cargando Meltemi Diagrams…"

#### Scenario: The Worker's way out
- **WHEN** the Worker shows a person its approval page or an error page
- **THEN** the link out of the page reads "Back to Meltemi Diagrams" ("Volver a Meltemi
  Diagrams"), and the approval page's sentence names the account panel, not a playground, as
  where tokens are revoked

#### Scenario: A word slips back
- **WHEN** an entry of the page's or the Worker's message catalogues, in either language,
  contains "playground" in any case
- **THEN** the catalogue test fails naming the entry's path and its language
