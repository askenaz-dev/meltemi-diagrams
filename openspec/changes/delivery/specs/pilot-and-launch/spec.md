## MODIFIED Requirements

### Requirement: Launch material and repository policies
`docs/launch/announcement.md` SHALL present the product with links to the gallery, the demo,
the example, installation and the hosted app at `https://diagrams.meltemi.dev`;
`docs/launch/checklist.md` SHALL list the owner actions with their real values (the repository
`askenaz-dev/meltemi-diagrams`, the npm organisation `meltemi`, the `meltemi` publisher on the
Visual Studio Marketplace and on Open VSX, the Cloudflare account, the domains `meltemi.dev` and
`meltemi.page`, the secrets by name), mark the actions the delivery change performed, and keep
the remaining ones (trademark review, the office applications' table, the pilot, the PlantUML
corpus) linked to the document that prepares each. `GOVERNANCE.md` SHALL describe decisions,
maintainers, contributions under the MIT licence with a sign-off and no assignment, and that
users' diagrams, assets and projects remain theirs. `SECURITY.md` SHALL give supported versions
(the current minor, 1.8.x) and private reporting through the repository's security advisories.

#### Scenario: Owner actions in one place
- **WHEN** the owner prepares the launch
- **THEN** the checklist links each action to the document that prepares it, and every address and account name in it is the real one

#### Scenario: A placeholder left
- **WHEN** the docs test reads `docs/launch/checklist.md`, `SECURITY.md` or `RELEASING.md`
- **THEN** none of them names `github.com/meltemi/meltemi-diagrams` or a `<placeholder>` address
