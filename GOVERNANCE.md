# Governance

How decisions are made in Meltemi Diagrams, who makes them, and what contributors and users can
rely on.

## Maintainers

The maintainers review and merge changes, cut releases and decide the roadmap. The product owner
leads them and makes the final call on product decisions and priorities. Maintainers are added by
the existing maintainers after a record of reviewed contributions.

## How decisions are made

- Every change of behaviour is planned as an OpenSpec change under `openspec/changes/`: a proposal
  (why), a design (how), specifications (what must hold) and tasks. It is reviewed before it is
  implemented and archived when it is done ([contributing](CONTRIBUTING.md)).
- Choices with real alternatives get a short decision note in `docs/decisions/`: context, decision,
  alternatives and consequences. Notes are not edited afterwards; a later note replaces an
  earlier one.
- Changes to the language follow the [language change policy](docs/language/policy.md), and a
  release follows [RELEASING.md](RELEASING.md).
- Priorities after 1.0: defects that lose data or draw wrong relations first, then what people
  need to use the product again, before new notations or services.

## Contributions

- Contributions are welcome as issues and pull requests, following
  [CONTRIBUTING.md](CONTRIBUTING.md).
- Contributions are accepted under the project's MIT licence: what you submit is licensed to
  everyone under the same terms as the rest of the code ("inbound equals outbound"). There is no
  copyright assignment and no contributor licence agreement.
- Each commit carries a `Signed-off-by:` line (`git commit -s`), certifying the
  [Developer Certificate of Origin](https://developercertificate.org/): that you wrote the change
  or have the right to submit it under the licence.
- Third-party code, fonts and icons come in only with a compatible licence, recorded by
  `pnpm licenses:inventory`.

## Users' work

- Diagrams, models, assets and projects belong to the people who make them. The project claims no
  rights over them, and the tools never send them anywhere unless a person asks (optional AI
  assistance, with the provider they configure).
- Files stay readable without the project's services: the language is documented, the model JSON
  is an open format, and exports are standard files. Users can export and host everything
  themselves.
- Changes that would invalidate users' files follow the language policy: deprecation first, an
  explicit migration that keeps the original, and older versions kept readable.

## Sustainability

Sponsorship, support, theme design services and managed publishing or rendering may fund
maintenance. Any commercial offer charges for operation and service and keeps the code open under
its licence.
