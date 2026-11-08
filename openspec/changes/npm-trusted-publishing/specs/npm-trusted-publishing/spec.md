## ADDED Requirements

### Requirement: npm trusts a constrained release identity

The npm publishing job SHALL request GitHub OIDC with `id-token: write` in environment `npm`,
restricted to `main`, and SHALL publish and move dist-tags with an npm that exchanges that identity
for both, 11.21.0 or later. Each of the twenty packages SHALL register a GitHub Actions trusted
publisher naming `askenaz-dev`, `meltemi-diagrams`, `release.yml` and `npm`, allowed to publish and
to manage dist-tags.

#### Scenario: A registered package publishes

- **GIVEN** a package whose trusted publisher matches the job
- **WHEN** a main release passes its existing CI authorization and artifact preflight
- **THEN** npm exchanges the job's identity, publishes the checked tarball with provenance and moves
  `latest` where `automatic-main-releases` allows it, without the token

#### Scenario: An older npm

- **WHEN** the job's npm is older than 11.21.0, or a 12 release older than 12.2.0
- **THEN** the npm channel fails before publishing, naming the version it needs

#### Scenario: An unapproved ref requests the environment

- **WHEN** a workflow ref other than `main` requests environment `npm`
- **THEN** the environment's deployment branch policy prevents that job from publishing

### Requirement: The token is a fallback until it is retired

While `NPM_TOKEN` exists, npm SHALL use it only for a package whose registration does not match the
job, and the job SHALL report how many packages it published through trusted publishing and with
the token, naming those still on the token. The registry's publisher of each new version decides
the count; a version the registry cannot describe yet SHALL be counted as unknown and SHALL NOT fail
the channel. With neither the job's identity nor the token, the channel SHALL fail before
publishing.

#### Scenario: Registrations are not finished

- **WHEN** a release runs while some packages have no trusted publisher
- **THEN** those packages publish with `NPM_TOKEN` and the job names them in a notice

#### Scenario: Every package is registered

- **WHEN** a release reports all twenty packages through trusted publishing
- **THEN** the owner can disallow tokens on each package and retire `NPM_TOKEN`, after which a
  package without a matching registration fails the npm channel instead of falling back

#### Scenario: No credential at all

- **WHEN** the job has no OIDC identity and `NPM_TOKEN` is empty
- **THEN** the npm channel fails before publishing, naming both
