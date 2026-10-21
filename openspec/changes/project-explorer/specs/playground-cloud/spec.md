## RENAMED Requirements

- FROM: `### Requirement: The projects drawer`
- TO: `### Requirement: The project switcher`

## MODIFIED Requirements

### Requirement: The project switcher
Signed in, the explorer's switcher panel (`project-explorer`) SHALL list the person's cloud
projects with name, thumbnail, last change and role, the open one marked, and SHALL offer **New
project** from the template cards as a cloud project, **Import project** into a new cloud project,
**Save this project to the cloud** when the current project is the anonymous one and has files,
and per project open, rename, duplicate, copy the link and delete (with confirmation). The header's
name of an open cloud project SHALL rename it. Anonymous, the panel SHALL show the project of this
browser and its actions only, and nothing of the cloud but an invitation to sign in. A refusal of
the service (the quota above all) SHALL be said in the panel and in the status line and SHALL
change nothing in the list.

#### Scenario: Save the local project
- **WHEN** a signed-in person with the anonymous `flow` project edited chooses "Save this project to the cloud"
- **THEN** a project with those files exists in the cloud and the page is bound to it

#### Scenario: Quota shown
- **WHEN** creating a project answers `413 quota.projects`
- **THEN** the status line says the account's limit of projects is reached and the panel is unchanged

#### Scenario: Anonymous
- **WHEN** nobody is signed in and the panel opens
- **THEN** no cloud project, no Save this project to the cloud and no cloud destination of the import dialog appear

## ADDED Requirements

### Requirement: An archive as a new cloud project
Signed in, the import dialog SHALL create a cloud project from an archive: `POST /api/projects`
with the archive's text files under their paths, then each image and font through the binaries
route, reporting the progress, and open the project; a creation or an upload that fails SHALL
delete the project again, so that nothing half-made stays in the account, and say why. The limits
of a cloud project (paths, files, sizes) SHALL be checked before the first call, naming the limit.

#### Scenario: Texts and an image
- **WHEN** an archive with `project.json`, `diagrams/a.meltemi` and `assets/logo.png` is imported as a new cloud project
- **THEN** the project exists with the two texts, `assets/logo.png` is uploaded by hash, and the page is bound to the project

#### Scenario: An upload that fails
- **WHEN** the image's upload answers `413 quota.storage`
- **THEN** the project is deleted again, the list does not show it, and the dialog says the storage limit is reached

#### Scenario: A path the cloud refuses
- **WHEN** the archive holds `.hidden/a.meltemi`
- **THEN** nothing is created and the dialog says which path a cloud project refuses
