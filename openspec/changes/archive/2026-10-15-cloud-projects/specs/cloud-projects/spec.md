## ADDED Requirements

### Requirement: Projects
A signed-in person SHALL list their projects (`GET /api/projects`: id, name, description,
updated, thumbnail address, role), create one (`POST /api/projects` with a name and either a
template name or files and binaries), read its metadata, rename and describe it (`PATCH`),
duplicate it (`POST /api/projects/:id/duplicate`, which copies its `project_blobs` rows), and
delete it (`DELETE`, which destroys the room's storage, the thumbnail, the versions, the file
rows and the `project_blobs` rows; blobs wait for collection). Every path given at creation
SHALL pass the path rule (`cleanPath` of `@meltemi/diagrams-project`; `400 path.invalid`
otherwise, nothing created). A project name SHALL be 1 to 100 characters; the 101st project
SHALL answer `413 quota.projects`; a project of another person SHALL answer `404
project.not-found` to anyone but its owner in this change.

#### Scenario: Create from a template
- **WHEN** a person creates a project from the `purchase` template
- **THEN** the room holds the template's five `.meltemi` files and `project.json`, and the list shows the project

#### Scenario: Too many projects
- **WHEN** a person with 100 projects creates another
- **THEN** the answer is `413 quota.projects` and nothing is created

#### Scenario: Someone else's project
- **WHEN** a person requests a project they do not own
- **THEN** the answer is `404 project.not-found`

#### Scenario: A bad path on create
- **WHEN** `POST /api/projects` names `../x.meltemi` among its files
- **THEN** the answer is `400 path.invalid` and no project is created

### Requirement: A project's address
A project's link SHALL be `<origin>/p/<id>`; `GET /p/<id>` SHALL answer a `302` to
`/?project=<id>` keeping the request's query string (`?invite=` included), so that the page is
served from `/` and reads the id from `location.search`; a `/p/` path whose id is not 20
base32 characters SHALL answer `404 project.not-found`.

#### Scenario: The link opens the page
- **WHEN** `GET /p/<id>?invite=abc` arrives, signed in or not
- **THEN** the answer is a 302 to `/?project=<id>&invite=abc`

#### Scenario: A malformed id
- **WHEN** `GET /p/not-an-id` arrives
- **THEN** the answer is `404 project.not-found`

### Requirement: Images and fonts by hash
`PUT /api/projects/:id/binaries/<path>` (the path checked by the path rule) with at most 10 MiB
of bytes SHALL store the blob by SHA-256, record the hash in `project_blobs` for the project,
set the file's path and hash in the room (`paths` and `binaries` under one id), and answer the
hash; the stored media type SHALL come from the magic bytes for `image/png`, `image/jpeg`,
`image/gif`, `image/webp`, `font/woff2`, `font/ttf` and `font/otf`, and `image/svg+xml` SHALL
be accepted only when the body parses as XML with an `svg` root; any other body SHALL answer
`400 binary.invalid` whatever `Content-Type` claims, and a larger body `413 quota.binary`.
`DELETE` SHALL remove the entry. `GET /api/projects/:id/blobs/<hash>` SHALL stream the bytes and
`HEAD` SHALL answer 200 when `project_blobs` or `version_files` of the project hold the hash
(never the live map), and both SHALL answer `404` otherwise; every answer SHALL carry
`Cache-Control: private, max-age=31536000, immutable`, `Content-Security-Policy: sandbox`,
`X-Content-Type-Options: nosniff` and `Content-Disposition: attachment; filename="<hash>"`.

#### Scenario: Upload and read
- **WHEN** a person uploads `assets/logo.png` and reads its hash
- **THEN** the bytes come back with `Cache-Control: private, max-age=31536000, immutable`, `Content-Security-Policy: sandbox` and `X-Content-Type-Options: nosniff`, and `HEAD` answers 200

#### Scenario: A font
- **WHEN** a person uploads `fonts/title.woff2`
- **THEN** the blob's media type is `font/woff2` and the room's `paths` holds `fonts/title.woff2`

#### Scenario: Too large or not accepted
- **WHEN** the body is 11 MiB, or a `text/html` body is sent with `Content-Type: image/png`
- **THEN** the answer is `413 quota.binary` or `400 binary.invalid` and nothing is stored

#### Scenario: A script in an SVG executes nothing
- **WHEN** an uploaded SVG holding `<script>` is opened top-level at its blob address
- **THEN** nothing executes and the document cannot read `/api/session`, while an `<img>` on the page still shows it

#### Scenario: Another project's hash
- **WHEN** `GET …/blobs/<hash>` names a hash another project uploaded and this one never did
- **THEN** the answer is `404`

### Requirement: Versions
`POST /api/projects/:id/versions { label? }` SHALL materialise and record a version with the
next number; the first materialisation of a UTC day whose files differ from the latest version
SHALL record an automatic unlabelled version; unlabelled versions beyond 100 SHALL be removed
oldest first, unlabelled versions older than thirty days SHALL keep only the newest of each
ISO week, and labelled versions SHALL never be removed. A project SHALL hold at most 200
versions, labelled ones counted (`CLOUD_LIMITS.versions`): after thinning, a `POST …/versions`
or a restore that would record the 201st SHALL answer `413 quota.versions`, and the automatic
daily version SHALL be skipped; more than six creations per project per minute SHALL answer
`429 versions.rate`. `GET …/versions` SHALL list them with the paths changed since the previous
one; `GET …/versions/:n` SHALL return the files; `POST …/versions/:n/restore` SHALL record an
automatic version of the current state and apply the version's files through the room. A label
SHALL be at most 80 characters.

#### Scenario: A named version survives thinning
- **WHEN** a project has 100 unlabelled versions and the labelled version `v1`, and a new version is made
- **THEN** the oldest unlabelled version is gone and `v1` remains

#### Scenario: Restore
- **WHEN** version 3 is restored
- **THEN** the room's files equal version 3's, a new automatic version holds the state before the restore, and a connected client received the change as remote

#### Scenario: Unknown version
- **WHEN** `GET …/versions/99` names no version
- **THEN** the answer is `404 version.not-found`

#### Scenario: The 201st version
- **WHEN** a project holds 200 labelled versions and `POST …/versions` arrives
- **THEN** the answer is `413 quota.versions` and no version is recorded

#### Scenario: Too many in a minute
- **WHEN** seven `POST …/versions` for one project arrive within a minute
- **THEN** the seventh answers `429 versions.rate` and records nothing

### Requirement: Thumbnails
`PUT /api/projects/:id/thumbnail` with an SVG of at most 200 KiB SHALL store it and set
`thumbnail_at`, taking at most one per thirty seconds per project (`429 thumbnail.rate` beyond
it); `GET` SHALL serve it as `image/svg+xml` with `Content-Security-Policy: sandbox`; a larger
body or another type SHALL answer `413 thumbnail.too-large` or `400 thumbnail.invalid`.

#### Scenario: Served sandboxed
- **WHEN** a thumbnail is read
- **THEN** the response carries `Content-Type: image/svg+xml` and `Content-Security-Policy: sandbox`

#### Scenario: Too large
- **WHEN** the body is 300 KiB
- **THEN** the answer is `413 thumbnail.too-large`

#### Scenario: Too frequent
- **WHEN** a second thumbnail arrives ten seconds after the first
- **THEN** the answer is `429 thumbnail.rate` and the first thumbnail stays

### Requirement: Usage and storage quota
`GET /api/account/usage` SHALL answer the number of projects and the bytes of the distinct
blobs the account's projects and versions reference, refreshed at materialisation, version
creation and binary upload; a binary upload that would take the account over 200 MiB SHALL
answer `413 quota.storage` (text and versions count in the usage but are never refused for it).
A weekly scheduled run SHALL delete blobs referenced by nothing and older than
seven days.

#### Scenario: Shared bytes count once
- **WHEN** two projects of one account hold the same image
- **THEN** usage counts its bytes once

#### Scenario: Over quota
- **WHEN** an account at 199 MiB uploads a 2 MiB image
- **THEN** the answer is `413 quota.storage` and nothing is stored

### Requirement: Deleting the account deletes its projects
A `user.deleted` event SHALL delete the person's projects, their file and `project_blobs` rows,
versions, thumbnails and rooms; their blobs SHALL be collected when nothing else references
them.

#### Scenario: Cascade
- **WHEN** a person with three projects is deleted
- **THEN** no project, version, thumbnail or room of theirs remains, and a later collection removes the blobs only they referenced

#### Scenario: A shared blob survives
- **WHEN** a deleted person's image is also referenced by another account's project
- **THEN** the collection keeps it
