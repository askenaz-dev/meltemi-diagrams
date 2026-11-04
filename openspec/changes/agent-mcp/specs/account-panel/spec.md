# Spec Delta

## ADDED Requirements

### Requirement: Connected apps section
The account panel SHALL have a **Connected apps** section listing each grant with the client's
name and host, its scopes in words, when it was approved and last used, and **Revoke** behind a
confirmation naming the client; empty, it SHALL say how an agent connects, with the address of
the endpoint and the agents guide; the words SHALL be in the interface language.

#### Scenario: A grant revoked
- **WHEN** the person opens Connected apps, sees `Codex` with "Read and write your projects" and confirms Revoke
- **THEN** the list no longer shows `Codex` and the status line says it was revoked

#### Scenario: Nothing connected
- **WHEN** the account has no grant
- **THEN** the section shows the sentence on connecting an agent and the endpoint's address, and no list

#### Scenario: In Spanish
- **WHEN** the interface language is Spanish
- **THEN** the section is "Aplicaciones conectadas" and the button "Revocar"
