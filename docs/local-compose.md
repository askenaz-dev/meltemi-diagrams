# Local workspace with Docker Compose

[Español](es/local-compose.md)

Run the web editor, project backend and MCP on your computer. Your browser and Claude Code or
Codex edit the same projects. You need Git and Docker Compose; to diagram with an agent, you
also need Claude Code or Codex installed. No Meltemi account or host Node installation is needed.

## Start

Start Docker Engine with Compose on Linux, or Docker Desktop using Linux containers on Windows.
This distribution supports Linux amd64 containers.

Open a terminal in the folder where you want to install Meltemi and run the matching block.
It checks `latest` to download the latest published release into a new `meltemi-local` folder
and start the application. Drafts and prereleases are excluded from `latest`.

### Linux (Bash)

You also need `curl` to look up the latest release.

```bash
release_url=$(curl -fsSL -o /dev/null -w '%{url_effective}' https://github.com/askenaz-dev/meltemi-diagrams/releases/latest) &&
git clone --depth 1 --branch "${release_url##*/}" https://github.com/askenaz-dev/meltemi-diagrams.git meltemi-local &&
cd meltemi-local &&
docker compose up
```

### Windows (PowerShell)

```powershell
$release = Invoke-RestMethod https://api.github.com/repos/askenaz-dev/meltemi-diagrams/releases/latest -ErrorAction Stop
git clone --depth 1 --branch $release.tag_name https://github.com/askenaz-dev/meltemi-diagrams.git meltemi-local
if ($LASTEXITCODE -ne 0) { throw "Git clone failed." }
Set-Location meltemi-local -ErrorAction Stop
docker compose up
```

### Open the editor

The first start builds the image and needs network access to download dependencies. It initializes
persistent storage and a default project automatically. Wait for the ready message, then open
**[http://127.0.0.1:8879/](http://127.0.0.1:8879/)** in your browser. You can now edit the default
project. The terminal also prints the editor address and agent setup prompt.

Keep the terminal running. Run the following Docker Compose commands from `meltemi-local`.
`docker compose ps` in another terminal shows the service's status.
If port 8879 is occupied, stop the service using it before starting Meltemi; do not expose the
container port on your network as a workaround.

## Connect an agent

In the editor, choose **Set up my agent**. Copy the prompt into Claude Code or Codex running on
this computer. The prompt includes the project you have open and reads installation instructions
from `http://127.0.0.1:8879/agent-setup/local/prompt.md`.

The agent installs the **Meltemi Diagrams local plugin**, including its diagramming skill and
language references, and registers the plugin's Streamable HTTP MCP connection to
`http://127.0.0.1:8879/mcp`. Both are needed: a skill alone does not connect the editor, and an
MCP URL alone does not install the plugin. There is no credential to create or copy.

The matching plugin bundles and their hashes come from your running instance. Installation
preserves unrelated client configuration; repeating the same setup reuses it without duplicate
registrations. A conflicting Meltemi registration is reported before replacement. No npm install
or separately running `mdg mcp` process is needed. The setup prompt uses existing download and
archive tools; its Python installer is optional.

### Client activation

Claude Code installs the plugin using its native local marketplace and local scope. Codex uses
its native plugin marketplace in the current Codex home. Their native install or trust controls
still apply. The integration was developed against Claude Code 2.1.312 and Codex 0.156.1; the
setup instructions check the installed client's supported commands.

Claude Code may need `/reload-plugins`; Codex may need a new session or chat. The agent gives the
continuation with your selected project when that is necessary. Setup is complete only when the
client's native MCP tools are actually available. A successful archive download or an HTTP call
alone is not evidence that the plugin is active.

## Diagram together

Tell your agent what to diagram. It reads the selected project's files and revision, writes
`.meltemi` source with revision and retry protection, validates it and inspects a preview. It
returns the address that opens that project in the editor.

Keep that project open: its text and canvas update when the agent writes, without reloading the
page. Drag or change an element yourself, then ask the agent to read again; it sees the source
change you made. Two local agents can use the same project. A stale revision is refused so an
agent can read and preserve the newer change before retrying.

If you have deliberately kept a browser-only project, startup preserves it. Open a workspace
project from **Projects**, or save the browser project to the local workspace, before copying an
agent setup prompt. A prompt copied after switching projects names the newly selected project.

## Files and exports

Workspace projects live in the backend's persistent volume. They are not live bind-mounted Git
folders. Use **Import project…** for a project archive and **Download → Project** to transfer
source back to your computer. Editing that downloaded copy does not automatically update the
workspace; import it explicitly when you want to bring it back.

The browser's exports still produce pictures, HTML players, catalogs and supported videos.
The MCP `preview` tool draws SVG or PNG locally. See [the web app](web-app.md) for exports and
[drawing with agents](agents.md) for the diagramming workflow.

## Stop and restart

Press Ctrl+C in the original terminal, or use:

```bash
docker compose stop
```

`docker compose down` removes the container while keeping the instance's volume. Start again with
`docker compose up`: owner, projects, versions, room documents and uploaded assets remain. Logs
are available with `docker compose logs`.

The local backend saves each accepted editor or API update before confirming or relaying it.
After a change is confirmed, no extra wait is needed before stopping the instance. Edits still
pending in an offline browser have not reached this boundary.

## Backup and restore

The instance includes D1 rows, room documents and binary assets. Back up the complete stopped
instance, rather than copying just its database while a room can still write.

### Backup

Create the `backups` folder once, then stop the application and make an archive. Choose a new
archive filename for each backup and use it in both commands: `docker cp` can replace an existing
destination file.

```bash
mkdir backups
docker compose stop
docker compose run --no-deps --name meltemi-backup app backup /tmp/meltemi.meltemi-backup
docker cp meltemi-backup:/tmp/meltemi.meltemi-backup ./backups/meltemi.meltemi-backup
docker rm meltemi-backup
```

The helper refuses a running instance. The archive includes its instance and version metadata.
The backup writes inside a one-off container that stops when it finishes; `docker cp` then writes
the host copy as your host user. This avoids requiring the container's user to write your Linux
host folder. Continue to copying only when the backup command succeeds. If `meltemi-backup`
already exists, inspect it or choose another container name before proceeding. Remove it only
after copying succeeds; if the copy fails, the archive remains in that container so you can retry.
Another backup needs a new archive filename; the one-off container name can be reused after
removal. Start the original instance again with
`docker compose up` when the backup succeeds.

### Restore to a new instance

Keep the original data. Restore into an empty volume under another Compose project name:

```bash
docker compose stop
docker compose -p meltemi-restored run --rm --no-deps --volume ./backups/meltemi.meltemi-backup:/backup.meltemi-backup:ro app restore /backup.meltemi-backup
docker compose -p meltemi-restored up
```

The original service must stay stopped because both instances use port 8879. Restore verifies
metadata and hashes, refuses incompatible or malformed archives and refuses a nonempty target.
It retains the source archive. Open the restored editor and check sources, versions and uploaded
images before treating the backup as proven. Use the same product release for a restore.

## Update

Stop and back up the instance first. Obtain the new release's source in the same installation
folder, preserving your backup and Compose project name, then rebuild and start:

```bash
docker compose build
docker compose up
```

Initialization applies missing schema updates before readiness. Do not discard the volume to
recover from a failed update; keep its data and logs. Run **Set up my agent** again to inspect the
plugin matching the running version. A different installed bundle, version or endpoint is reported as a
conflict: review its replacement through the client's native controls before retrying. Identical
setup is reused. Follow any required native client reload after a reviewed update.

## Reset

The following command permanently removes this Compose project's instance data, including every
project, version and uploaded asset. Make and verify a backup before using it:

```bash
docker compose down -v
```

The next `docker compose up` creates a new empty instance and default project. This is a reset,
not a normal restart or a prerequisite for restoring to a separate instance.

## Access and offline operation

The service is bound to `127.0.0.1`, and every local process that can reach that port can use the
workspace. This distribution is for one person and their agents on one computer. It provides
no isolation between local users or agents. Do not publish its port to a LAN, reverse proxy or
the Internet. An externally hosted agent cannot reach this loopback address.

Once the image is built, the local editor, storage, MCP, bundled plugin files, fonts/icons and
SVG/PNG previews require no external service. Your chosen agent's model may still need its own
network access. Local diagrams and uploaded assets remain in this instance.

## Supported features

Fourteen core tools cover projects, files, versions, account description, editor URLs and previews.
The shared catalogue also lists thirteen sharing, guest-session and publication tools; those
return `local.feature-unavailable` and change nothing in this mode. Their editor controls are
absent. Ordinary synchronization between your browser and agents remains enabled.

The hosted service and its account are separate from this local workspace.
