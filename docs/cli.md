# The command line

[Español](es/cli.md)

`meltemi-diagrams` (alias `mdg`; `pnpm mdg` from the sources) covers the life of a project:
starting it, previewing it, validating, formatting, importing, exporting, publishing a catalog,
reviewing changes and keeping a copy of it in the cloud. Every command takes `--help`. Paths in
messages are relative to the working folder; nothing a command prints or writes names the machine's
absolute paths unless asked.

| Command                     | What it does                                                                                          |
| --------------------------- | ----------------------------------------------------------------------------------------------------- |
| `init [folder]`             | Creates a project from a template; `--ci` adds a CI workflow, `--cloud` a job that pushes             |
| `validate <path>...`        | Checks files, projects and the composition of their diagrams ([diagnostics](language/diagnostics.md)) |
| `preview [path]`            | Serves the project's catalog and rebuilds it as files change                                          |
| `format <path>...`          | Rewrites files in the canonical layout ([formatting](language/formatting.md))                         |
| `import <path>`             | Imports Mermaid, PlantUML and Markdown files ([import](import/))                                      |
| `export <path>`             | Renders diagrams, stories and profiles ([export](language/export.md))                                 |
| `layout <file>`             | Writes ELK's arrangement down as `place` statements ([layout](language/layout.md))                    |
| `convert <file>`            | Copies a flow diagram into a free one, or writes the model JSON (`--to free\|json`)                   |
| `build catalog [path]`      | Writes the offline HTML catalog ([catalog](catalog.md))                                               |
| `review [path]`             | Lists what changed by id, with pictures before and after, since a Git revision or the cloud           |
| `assets <subcommand>`       | Lists icon packs and fonts, searches icons, writes the lock ([assets](language/assets.md))            |
| `assist <operation>`        | Optional AI help as proposals to accept in part ([assistance](assist.md))                             |
| `plugins [path]`            | Lists the plugins a project installs, what they add and their problems ([plugins](plugins.md))        |
| `login`, `logout`, `whoami` | Sign in to the cloud service, revoke and forget the token, say who the token is for                   |
| `push [folder]`             | Makes a cloud project match the folder                                                                |
| `pull [id] [folder]`        | Writes a cloud project's files into a folder                                                          |
| `publish [folder]`          | Publishes the catalog as a web page of the cloud service                                              |
| `projects`                  | Lists your cloud projects                                                                             |
| `skill install [folder]`    | Gives a project's coding agents the skill that draws Meltemi diagrams ([agents](agents.md))           |
| `skill prompt`              | Prints the prompt a coding agent follows to install the skill and prove it ([agents](agents.md))      |

The five rows before the last two are [the cloud commands](#the-cloud-commands).

Untrusted repositories are safe to process: nothing in a project runs, reads outside it or reaches
the network, and sizes are bounded ([security](security.md)). The commands that use the network do
so only when you run them: `assist`, and the cloud commands, which talk to one service and send a
token only to it. An unexpected error prints its message without secrets (an API token shows as
`mdg_…`) and exits 70 (`MELTEMI_DEBUG=1` adds the stack).

Exit codes: 0 when all went well, 1 when there were findings (errors, partial imports, skipped
diagrams, changes with `review --exit-code`) or a cloud command was refused or failed, 2 on usage
errors and unreadable paths, and 3 when a cloud command needs you to sign in: nobody is signed in,
or the service refused the token (run `login`).

## Languages

Every command takes `--lang en|es`, anywhere among its arguments. It sets the language of the
command's help, messages, summaries, prompts and diagnostics, and of the words it adds to the files
it writes (the type lines of C4 entities, the controls of HTML players, the headings and search of
the catalog, the review report) over the project's `"locale"`
([projects](language/projects.md#language-of-exports)). Another value is a usage error (exit 2).

Without `--lang`, messages follow `MELTEMI_LANG`, then the first of `LC_ALL`, `LC_MESSAGES` and
`LANG` that names a language (`C` and `POSIX` do not), then the system's language, and English
otherwise. Files follow the project, or English when the project says nothing, and never the
machine's language, so the same sources give the same files everywhere. Codes, exit codes and the
keys of `--format json` are the same in both languages. Confirmations accept `y` and `yes` as well
as `s`, `si` and `sí`.

```bash
pnpm mdg export architecture --lang es --out site
```

## Starting: `init`

```bash
pnpm mdg init architecture --template purchase
```

`init` writes `project.json` (the folder's name, or `--name`; the language version; this CLI's
version range) and the template's sheets, and prints the next commands. It never replaces a file:
if one exists, nothing is written.

| Template   | Sheets                                                                                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `flow`     | `diagrams/overview.meltemi`: a first flow diagram (the default)                                                                                                          |
| `c4`       | `models/system.meltemi` and `diagrams/views.meltemi`: a model, a context and a container view                                                                            |
| `sequence` | `diagrams/sign-in.meltemi`: a sequence with a scenario for each outcome                                                                                                  |
| `free`     | `diagrams/slide.meltemi`: a 16:9 slide of text, boxes, an icon and a group                                                                                               |
| `purchase` | The reference example: model, context and container views, payment sequence with scenarios, executive slide, animated story, PDF, PNG and MP4 profiles, catalog settings |

`--list` prints each with its title, what it is for and what it holds, as the playground's New
project shows them, such as `C4 model — An architecture model with a context view and a container
view (1 model, 2 views)`.

`--ci github` or `--ci gitlab` also writes a CI workflow (below); in an existing project,
`init --ci <service>` writes only the workflow.

## Previewing: `preview`

```bash
pnpm mdg preview architecture --open
```

The catalog of the project is served at `http://127.0.0.1:4317/` (`--port`, or `0` for a free
port) and built again whenever a sheet, `project.json`, the lock or an asset changes; open pages
reload on the same page and scroll position, and the terminal shows each build's diagnostics. A
file opens on its first diagram. The server listens on this machine only and answers only requests
addressed to `127.0.0.1` or `localhost`. Ctrl+C stops it. In VS Code, the canvas beside the code is
the live view of one file ([editor.md](editor.md)).

## Whole projects

`validate`, `format`, `import`, `export` and `build catalog` take a folder:

| Command                                              | Does                                                            |
| ---------------------------------------------------- | --------------------------------------------------------------- |
| `pnpm mdg validate architecture --strict`            | every file of the project, `project.json` and the assets        |
| `pnpm mdg format architecture --check`               | lists the files that would change                               |
| `pnpm mdg import legacy --out architecture/imported` | every `.mmd`, `.puml` and `.md` below `legacy`, keeping folders |
| `pnpm mdg export architecture --out site`            | every diagram of every file, as `site/<folders>/<file>.svg`     |
| `pnpm mdg export architecture --format png`          | the same as PNG, beside each file, in one browser session       |
| `pnpm mdg export architecture --profiles`            | every `export` profile of every file                            |

In a folder, files without diagrams (models, themes, stories) are passed over, and `--diagram`,
`--story`, `--scenario` and `--stdout` are refused: they choose within one file. When importing a
folder, PlantUML `.iuml` files are read through the files that include them and Markdown files
without diagram blocks are passed over; the summary counts complete, partial, failed and existing
sheets.

## Model JSON: `convert --to json`

```bash
pnpm mdg convert diagrams/overview.meltemi --to json
```

writes `diagrams/overview.model.json`, the file's model in the interchange format
([model JSON](language/model-json.md)): every diagram without errors, the themes, models and
stories, and the diagnostics. `--out <file>` writes it elsewhere and `--stdout` prints it. A file
with errors still gets its JSON, with them listed, and the command exits 1. `convert --to free`
copies a flow diagram, as drawn, into a free one ([free](language/free.md)).

## Reviewing: `review`

```bash
pnpm mdg review architecture --base main --out review
```

`review` compares a project, a folder or a file with an earlier version and lists what changed by
id: diagrams, elements, relations, entities, stories, scenes, themes and export profiles.

```text
~ diagrams/containers.meltemi
    diagram containers
        ~ element shop.api "Pedidos API": label "API de pedidos" → "Pedidos API"
        ~ element shop.db "Pedidos": moved
~ diagrams/purchase.meltemi
    diagram purchase
        > element bank → issuer "Banco"
+ diagrams/overview.meltemi
    + diagram overview: flow
> stories/tour.meltemi → stories/walkthrough.meltemi
4 files changed: 1 added, 0 removed, 1 renamed, 2 changed.
```

`+` added, `-` removed, `>` renamed, `~` changed. Because ids are explicit, an element whose id
changed but which kept its kind and its label, place, description or relations is a rename, not a
removal and an addition; relations and story targets follow the renames. Each change says what
changed: labels, kinds, descriptions, technology, URLs, links, classes, groups, places, sizes,
routes, label positions, styles, effects, diagram settings, scenarios, story timing and actions.
Comments and formatting are not changes.

| Option               | Meaning                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `--base <revision>`  | The version before from Git: a commit, branch or tag (`HEAD` by default)                                            |
| `--base cloud[:<n>]` | The version before from the cloud project: its files now (`cloud`), or its version `n` (`cloud:3`)                  |
| `--project <id>`     | With `--base cloud`: the cloud project, instead of the one `project.json` names                                     |
| `--host <url>`       | With `--base cloud`: the service, as for [the cloud commands](#the-host-and-the-token)                              |
| `--before <path>`    | The version before from another folder or file, without Git                                                         |
| `--out <folder>`     | Writes `index.html` with the changes and, for every changed diagram, `<file>/<diagram>.before.svg` and `.after.svg` |
| `--json`             | One JSON object: the files, their changes and a summary                                                             |
| `--exit-code`        | Exit 1 when something changed                                                                                       |

In the pictures, changed elements and relations are outlined: added in green, removed in red,
renamed in blue, changed in amber. The page names the versions compared, never local paths.

`--base cloud` compares the folder with the files the cloud project holds now, and `--base cloud:3`
with its version 3: it is how to see what somebody changed in the page before you push over it. The
review is the same, by id, and `--out`, `--json` and `--exit-code` work as before. The cloud project
is the one `project.json` names, or `--project`; the service and the sign-in are as for the
[cloud commands](#the-cloud-commands). `--project` and `--host` go only with `--base cloud` (they
are a usage error otherwise), and `--base` cannot be combined with `--before`. The cloud project is
read once before anything is compared: a path in it that does not stay inside the folder fails with
`pull.unsafe-path` and compares nothing, and a project or version that does not exist fails with
exit code 1. When nobody is signed in the exit code is 3.

## Assistance: `assist`

`assist generate`, `modify`, `relations` and `explain` ask an optional AI provider and turn the
answer into a proposal you accept in part (`--save`, then `assist apply <proposal> --items 1,3`, or
`--apply` at once). What is sent is printed first and needs your yes, or `--yes`; keys come only
from the environment. See [assist.md](assist.md).

## Agents' skill

`skill install [folder]` writes the `meltemi-diagrams` skill into the folder (the working one by
default), in the folders the agents read skills from: `.claude/skills/meltemi-diagrams/` for
Claude Code, `.agents/skills/meltemi-diagrams/` for Codex, Cursor, GitHub Copilot, Gemini CLI,
Devin Desktop (once Windsurf) and any other agent that reads `.agents/skills`. `--agent` takes
`claude`, `codex`, `cursor`, `copilot`, `gemini`, `windsurf`, `devin`, `agents` or `all` (the
default), several as a comma-separated list or repeated, and writes each folder once; an unknown
or empty name is a usage error listing them. `--user` installs into your own folders instead
(`~/.claude/skills`, `~/.agents/skills`), and `--force` replaces a copy already there (only the
skill's own folder; without it the command refuses with exit code 2 and writes nothing). The
command writes skill folders only, never an instruction file of the project, and the installed
text names this command line (`mdg validate`, `mdg preview`).

`skill prompt` prints the agent setup prompt, the text a coding agent reads and follows to install
the skill and prove it draws, which `https://diagrams.meltemi.dev/agent-setup/prompt.md` serves
too; it takes no argument. See [agents.md](agents.md).

## The cloud commands

The [cloud service](cloud.md) keeps projects online, to open them in the page, share them and
publish them. For a developer the repository is the truth and the cloud its mirror, so these
commands push a folder, bring back what somebody drew in the page and publish the catalog, through
the API the page uses, driven with an API token. No other command talks to the service, except
`review --base cloud`.

### The developer's loop

```bash
pnpm mdg login                              # once for each computer and service
pnpm mdg push architecture --create         # makes the cloud project, records it in project.json
pnpm mdg push architecture                  # later: lists what differs, asks, pushes
pnpm mdg review architecture --base cloud   # what somebody changed in the page, by id
pnpm mdg pull architecture                  # brings those files into the folder
pnpm mdg publish architecture --slug shop   # builds the catalog and publishes it
```

`push --create` writes a `cloud` setting into `project.json`
([projects](language/projects.md#the-cloud-project)). Commit it, and every clone and every CI job
know which project the folder mirrors. Push from CI when a branch is merged
([below](#pushing-to-the-cloud-on-merge)) and the cloud follows the repository: the page, the share
links and the published catalog show what `main` holds. When somebody draws in the page instead,
`review --base cloud` shows what differs by id and `pull` brings it into the folder, to commit like
any other change. Nothing is hidden in the folder beyond that one setting, and nothing in the cloud
is overwritten that was not shown to you first, or forced.

### Signing in: `login`, `logout` and `whoami`

```bash
pnpm mdg login
```

`login` makes an API token for this computer in four steps:

1. It listens on `127.0.0.1`, at a free port, for one request, and makes a random `state`.
2. It prints a six-character check, then opens `<host>/cli-auth?port=<port>&state=<state>` in your
   browser. The approval page shows the same six characters: approve only if they match, because
   that tells you the request is the one this terminal made. With `--no-browser` it prints the
   address instead and you open it yourself, on this same computer, because the approval comes back
   to the listener on `127.0.0.1`.
3. When you approve, the page sends the browser to the listener with a one-time code. The listener
   takes one `GET /` that carries a `code` and a `state` and is addressed to `127.0.0.1` and its own
   port, and stops listening. A `state` that is not this request's is refused
   (`login.state-mismatch`).
4. The command exchanges the code once, at `POST /cli-auth/token`, asks `GET /api/session` who the
   token is for and keeps token, id and name in [the credentials file](#the-host-and-the-token). The
   browser is shown a page that says the terminal can be used again, in its language, and the
   command prints `Signed in as Ana (https://diagrams.meltemi.dev)`.

The token never appears in an address and the code is never printed. The wait ends after five
minutes (`login.timeout`). A code the service refuses (`cli.invalid`: unknown, used or older than
five minutes), too many failed attempts (`cli.rate`), an account that already holds 20 tokens
(`quota.tokens`: revoke one in the page) and a token that could not be kept (`login.not-stored`: it
is revoked again) all fail with exit code 1 and keep nothing.

On a machine without a browser, make a token in the page's **API tokens** dialog and pipe it in:

```bash
printf '%s' "$TOKEN" | pnpm mdg login --token
```

`--token` reads the token from standard input, never from an argument, so it stays out of the
shell's history and the process list. At a terminal it asks you to paste it. It checks that the text
is shaped like a token (`mdg_` and base64url characters), asks `GET /api/session` for its id and
owner, and keeps them as a browser sign-in does.

`MELTEMI_TOKEN` in the environment takes precedence over any stored token, which is what CI uses.
While it is set, `login` refuses (`login.environment-token`), because nothing it stored would be
used.

`logout` revokes the stored token at the service (`DELETE /api/tokens/<id>`) and forgets it. Only
an answer that settles the matter lets the entry go: the token revoked, or `401 token.invalid`,
which says the service no longer knows it. When the service cannot be reached, or fails, nothing is
forgotten (`logout.not-revoked`, exit code 1, naming the file), so that the token can be revoked
later, with `logout` again or in the page. With nobody signed in it does nothing and exits 0.
`MELTEMI_TOKEN` is never revoked or changed.

`whoami` asks the service who the token is for and prints the name and handle (`Ana (@ana)`, or
`Ana (no handle yet)`) and the host, and says when the token came from `MELTEMI_TOKEN`. It never
prints the token. It also tells you whether the token still works.

### The host and the token

Every cloud command talks to one host: `--host`, else `MELTEMI_HOST` (empty counts as unset), else
`https://diagrams.meltemi.dev`. A host is an origin: `https:`, or `http:` only for `127.0.0.1`,
`localhost` or `[::1]` (the development service is `http://localhost:8788`). Anything else fails
before a request is made (`cloud.host-invalid`, `cloud.insecure-host`).

`project.json`'s `cloud.host` names the service a project mirrors but never chooses where a token
goes. When it is another host than the one the command resolved, the command fails with
`cloud.host-mismatch`, naming both hosts and `--host`, before any request; so a repository you cloned
cannot make your token travel anywhere.

The token is `MELTEMI_TOKEN`, else the stored entry for the host. With neither, the command says to
run `login` and exits 3 (`cloud.not-signed-in`); a token the service refuses, because it is unknown
or was revoked, gets the same advice and exit code (`token.invalid`). A token goes only to the
resolved host, never over `http:` except to the loopback, and never where a redirect points
(`cloud.redirect`: redirects are not followed). Every request has a timeout and every answer is read
through a limit ([safety](security.md#the-command-line-and-the-cloud)).

`login` keeps the token in `credentials.json` in your configuration folder, one entry for each
host:

| System    | File                                                                                                                                   |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Windows   | `%APPDATA%\meltemi-diagrams\credentials.json`                                                                                          |
| Elsewhere | `$XDG_CONFIG_HOME/meltemi-diagrams/credentials.json` when that is an absolute path, else `~/.config/meltemi-diagrams/credentials.json` |

An entry holds the token, its id at the service (which `logout` revokes) and the `sub` and name of
the account. Where the system has file modes the file is `0600` in a `0700` folder; Windows keeps
the permissions your profile folder gives it, and the command changes nothing there. The file is
written through a temporary file and a rename, so a failure never leaves half a file, and the
entries of other hosts and the fields it does not know are kept as found. A file that is not valid
credentials is reported with its path (`credentials.corrupt`) and never written over. It is the only
place a token is written.

### Mirroring a folder: `push`

```bash
pnpm mdg push architecture --create
```

`push [folder] [--create [--name <n>]] [--project <id>] [--force] [--check] [--strict] [--host <url>]`
makes the cloud project match the folder, in one transaction.

**What is sent.** The folder's project as `validate` reads it: `project.json`, the sources, themes
and other text files (`.meltemi`, `.json`, `.md`, `.txt`, `.svg`, `.css`) travel by content; images
and fonts (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.woff2`, `.ttf`, `.otf`, up to 10 MiB each) by
hash. Never sent: `.git` and every other name that starts with a dot, `node_modules`, what
`project.json`'s `exclude` names, the catalog's output folder (`catalog.out`) and links, which are
never followed. A file of another kind (a PDF, an export) is not kept in the cloud, and the push says
how many there are, with examples. A file the cloud would refuse (a name outside
[the path rule](cloud.md#the-path-rule), text that is not UTF-8, a file that cannot be read) is
listed as `warning: <path> is not sent`, is never sent, and never makes the push delete the cloud's
file of that name. The limits of the cloud ([quotas](cloud.md#quotas-and-limits)) are checked before
any request and refused with the service's own codes, naming the path where there is one: a text
over 2 Mi characters or texts over a document's 16 MiB (`doc.too-large`), an image or a font over
10 MiB (`quota.binary`), more than 2000 files (`quota.files`).

**Which project.** `--project <id>`, else the `cloud.project` of `project.json`. A folder that names
none, with no `--project` and no `--create`, fails with `cloud.no-project`, which names both options.

**Compare, then ask or refuse.** Before changing anything, `push` fetches the cloud project's files
and revision once and compares every path of the push set: text by content, images and fonts by
hash, and paths only the cloud has as deletions. The paths that differ are listed with the review
by id of the diagrams beside them:

```text
The cloud project differs from the folder in 2 paths:
  diagrams/containers.meltemi differs
  project.json differs
By id, what pushing changes in the diagrams:
~ diagrams/containers.meltemi
    diagram containers
        ~ element shop.api "Pedidos API": label "API de pedidos" → "Pedidos API"
1 file changed: 0 added, 0 removed, 0 renamed, 1 changed.
Overwrite these changes in the cloud? [y/N]
```

The review sees the diagrams only, so a difference in `project.json`, a comment or an image is in the
list of paths and not in the review. When the cloud already matches the folder there is nothing to
push and nothing to ask. Otherwise, on a terminal, `push` asks the question above
(`y`, `yes`, `s`, `si` and `sí` are yes); without a terminal it refuses with exit code 1
(`push.differs`) unless you pass `--force`. A project made in the page has no `cloud` setting in its
`project.json`, so after a `pull` the first push lists `project.json` as different, because `pull`
added the setting to the folder's copy; say yes once and both agree.

**One transaction.** The images and fonts that differ are uploaded first (an upload is skipped when
the project already holds the bytes: `HEAD …/blobs/<hash>` answers 200), then a single
`PUT …/files` carries the texts that differ, the hashes and the deletions with `ifRevision`, the
revision `push` fetched. If somebody changed the project in between (`409 revision.mismatch`),
nothing is applied: `push` fetches again, compares again and asks again, once. A second mismatch
ends with `revision.mismatch` and exit code 1, having overwritten nothing. `--force` stands for the
answer yes, so with it the second comparison is pushed too.

**`--check`** does the same comparison, prints it, writes nothing and exits 1 when anything differs,
0 when nothing does. It cannot be combined with `--create`.

**Validation.** The folder is validated as `validate` does, and its diagnostics are printed before
the comparison. Errors do not stop the push, because the page shows them too and a half-finished
diagram in the cloud is better than a stale one; `--strict` stops it when there are errors or files
that cannot be sent (`push.strict`, exit code 1, nothing pushed). Unlike `validate --strict`,
warnings do not count.

**`--create`** makes the cloud project first, with the folder's text files, named `--name`, else the
`name` of `project.json`, else the folder's. It records `cloud: { host, project }` in `project.json`,
keeping the file's indentation, line endings and every other byte (a folder with no `project.json`
gets a minimal one), and then pushes what is left, the images and fonts and the manifest with its
new setting, without asking, as the new project holds nothing the folder has not shown. It prints
`Created the cloud project <id> (<name>).` and, at the end, `Open it at <host>/p/<id>`. A
`project.json` that already names a cloud project is `push.already-linked`; `--create` with
`--project` or `--check` is a usage error. If the project was made but `project.json` could not be
updated (`push.manifest-not-written`), the message names the project and the lines to add.

Changing files needs the editor role on the project, or the owner's (`access.denied` otherwise); a
project that does not exist, or that you may not open, is `project.not-found`, the same answer for
both.

### Bringing a project back: `pull`

```bash
pnpm mdg pull k4c2w7x5q3y6m2n5r7d4 architecture
```

`pull [<id>] [folder] [--version <n>] [--force] [--host <url>]` writes the files of a cloud project
into a folder. The project is `<id>` (20 lower-case letters and digits) or the one `project.json`
names; with one argument, it is the id when it has that shape and the folder otherwise. The folder is
the working folder by default and is made when it is missing. An id that is not the `cloud.project`
of the folder's `project.json` is refused (`pull.other-project`): pulling would mix two projects.

**Every path is checked before anything is written.** A path the cloud answers must be in the form
the cloud keeps ([the path rule](cloud.md#the-path-rule): relative, `/`-separated, nothing hidden,
no `..`), a name Windows could keep (no trailing dot or space, no device name such as `con`, `nul` or
`com1`), not differ from another path only in letter case, not be a file where another path needs a
folder, resolve inside the folder and not go through a link in the folder. One path that fails
refuses the whole pull with `pull.unsafe-path`, naming it, exit code 1 and nothing written, not even
the folder. The cloud already refuses such paths; the command line does not take that on trust,
because a project can be written by anybody who edits it and the folder is yours.

Then, file by file. A file the folder lacks is written, and images and fonts are fetched by hash and
checked against it. An identical file is left alone. A file that exists and differs is listed
(`kept <path> (it differs from the cloud)`) and not written unless `--force`, and the exit code is 1;
a folder where a file belongs is kept too. Files only the folder has stay: `pull` never deletes.
Every file is written through a temporary file and a rename. The copies two people made at once in
the cloud (`<path>~<id>`) are skipped with a note: settle them in the page.

`--version <n>` pulls version `n` of the project instead of its latest files (`version.not-found`
when it holds no such version). `project.json` gains `cloud: { host, project }` when it has none,
and nothing else of it changes; a project without a `project.json` leaves the folder without one,
and the command asks you to give the id next time. It ends with a summary such as
`Pulled the latest files of the cloud project <id> into <folder>: 5 written, 0 already identical, 0 kept.`

### Publishing: `publish`

```bash
pnpm mdg publish architecture --slug shop --handle ana
```

`publish [folder] [--slug <name>] [--handle <name>] [--project <id>] [--force] [--strict]` and
`publish --unpublish [--slug <name>]` publish the catalog of the folder's project as a public web
page of the service, at `https://<publish host>/<handle>/<slug>/` ([publishing](cloud.md#publishing)).
It is the catalog `build catalog` writes, sent for the cloud project `project.json` names, or
`--project`, which must be yours: publishing is the owner's. The steps, in order:

1. The project and the session: the host, `cloud.host-mismatch` and the token fail before any request.
2. `--unpublish` ends here: one `DELETE` for the page `--slug` names, nothing built or pushed
   (`publish.not-published` when the project publishes nothing under it). It cannot be combined
   with `--handle`, `--force` or `--strict`.
3. The owner's route `GET …/publish`: a project you may not publish (`access.denied`,
   `project.not-found`) fails before the catalog is built, and the answer says whether you have a
   handle.
4. The catalog is built in memory exactly as `build catalog` builds it, and its diagnostics are
   printed. A project with nothing to draw (`publish.empty`), with errors under `--strict`
   (`publish.errors`) or with a catalog over the 16 MiB a page may be (`publish.too-large`: leave
   things out with `catalog.exclude`) fails with nothing pushed and nothing published.
5. The handle. The first publication needs one, the first part of every address you publish under,
   and it is public: give `--handle`, or answer the question on a terminal (three tries);
   otherwise `handle.required`. With `--handle` the command sets it first (`Handle set: ana`). The
   service lets an API token choose it. If a service answers `403` instead, the command says so
   (`publish.handle-in-page`): choose it once in the project's publish dialog in the page, then run
   `publish` again. `handle.taken`, `handle.invalid` and `handle.locked` (a handle cannot change
   while pages are published under it: unpublish them first) are shown as they are.
6. The folder is pushed when it differs from the cloud project, as `push` does, with the same
   comparison and question (`--force` answers it and `--strict` applies), so that what is published
   is what the cloud holds.
7. `PUT …/publish` sends the page. The command prints a summary line and then the public address on
   a line of its own, the last line it prints.

The slug is 1 to 60 lowercase letters, digits and hyphens: `--slug`, else the project's name made
simple (`diagrams` when nothing is left). A project may publish several pages, one for each slug;
another project of yours that publishes the slug is `publish.taken`. A project may be published ten
times an hour (`publish.rate`, with the seconds to wait). Published pages are public.

### Listing: `projects`

`projects [--json] [--host <url>]` lists the cloud projects you can open, yours and those shared
with you, most recently changed first:

```text
ID                    NAME  ROLE    LAST CHANGE
k4c2w7x5q3y6m2n5r7d4  shop  owner   2026-10-15T09:41:02Z
```

The role is `owner`, `editor` or `viewer`. A name that holds control characters is shown with spaces
instead. With none, the command suggests `push --create`. `--json` prints one object whose keys are
stable:

```json
{
  "host": "https://diagrams.meltemi.dev",
  "projects": [
    {
      "id": "k4c2w7x5q3y6m2n5r7d4",
      "name": "shop",
      "description": "",
      "role": "owner",
      "updated_at": "2026-10-15T09:41:02.118Z"
    }
  ]
}
```

### Failures and exit codes

A cloud command exits with 0 when it did what you asked, 1 when it was refused or failed, 3 when you
have to sign in and 2 for a usage error (an option it does not know, a folder `push` or `publish`
cannot find). A failure prints one line on standard error, made of the command, a code and a
sentence in the interface language: `meltemi-diagrams push: push.differs: …`. The codes are stable
and the same in both languages. These are the command line's own:

| Code                           | Exit | What happened                                                                                           |
| ------------------------------ | ---- | ------------------------------------------------------------------------------------------------------- |
| `cloud.host-mismatch`          | 1    | `project.json` names another service than the one the command resolved; pass `--host` with it to use it |
| `cloud.host-invalid`           | 1    | The host is not an origin such as `https://diagrams.meltemi.dev`                                        |
| `cloud.insecure-host`          | 1    | The host is `http:` and not the loopback: a token only travels over `https:`                            |
| `cloud.not-signed-in`          | 3    | No `MELTEMI_TOKEN` and no stored token for the host: run `login`                                        |
| `cloud.no-project`             | 1    | The folder names no cloud project, and no `--project` was given: `push --create` makes one              |
| `cloud.unreachable`            | 1    | The host cannot be reached (the system's reason follows)                                                |
| `cloud.timeout`                | 1    | The host did not answer in time                                                                         |
| `cloud.response-too-large`     | 1    | The host sent more than the command line accepts                                                        |
| `cloud.redirect`               | 1    | The host answered with a redirect; a token is never sent where it leads                                 |
| `cloud.bad-response`           | 1    | The answer is not the service's                                                                         |
| `credentials.corrupt`          | 1    | The credentials file cannot be used; fix it or delete it, nothing was written over it                   |
| `credentials.unreadable`       | 1    | The credentials file cannot be read                                                                     |
| `credentials.unwritable`       | 1    | The credentials file cannot be written, or its folder made                                              |
| `login.timeout`                | 1    | No approval arrived within 5 minutes; nothing was stored                                                |
| `login.state-mismatch`         | 1    | The approval did not carry this request's `state`; nothing was exchanged or stored                      |
| `login.environment-token`      | 1    | `MELTEMI_TOKEN` is set, so nothing `login` stored would be used                                         |
| `login.token-input`            | 2    | `--token` reads standard input and there is none: pipe the token in                                     |
| `login.no-token`               | 1    | Nothing was given on standard input                                                                     |
| `login.not-a-token`            | 1    | That is not an API token (they start with `mdg_`)                                                       |
| `login.not-stored`             | 1    | The token could not be kept, so it was revoked again                                                    |
| `login.not-stored-not-revoked` | 1    | The token could not be kept or revoked: revoke it in the page                                           |
| `login.listener`               | 1    | The command cannot listen on this computer for the approval                                             |
| `logout.not-revoked`           | 1    | The token could not be revoked, so it was kept (the file is named): run `logout` again or use the page  |
| `push.differs`                 | 1    | The cloud project differs from the folder, with no terminal to ask and no `--force`                     |
| `push.declined`                | 1    | You answered no; nothing was pushed                                                                     |
| `push.already-linked`          | 1    | `--create`, and `project.json` already names a cloud project                                            |
| `push.strict`                  | 1    | `--strict`, and there are validation errors or files that cannot be sent; nothing was pushed            |
| `push.manifest-invalid`        | 1    | `project.json` is not UTF-8 text with a JSON object that can be edited; nothing was created             |
| `push.manifest-not-written`    | 1    | The project was created but `project.json` could not take `cloud`; the message has the lines to add     |
| `push.file-changed`            | 1    | A file changed while it was being pushed; nothing of it was kept                                        |
| `pull.unsafe-path`             | 1    | The cloud project holds a path that is not safe inside the folder; nothing was written                  |
| `pull.no-project`              | 1    | No id was given and the folder's `project.json` names no cloud project                                  |
| `pull.other-project`           | 1    | The id is not the cloud project the folder's `project.json` names                                       |
| `pull.not-a-folder`            | 1    | The destination exists and is not a folder                                                              |
| `pull.manifest-not-updated`    | 1    | The files were written but `project.json` could not take `cloud`                                        |
| `pull.write`                   | 1    | A file could not be written (the path and the reason follow)                                            |
| `publish.handle-in-page`       | 1    | The service did not let an API token choose the handle: choose it in the page                           |
| `publish.empty`                | 1    | Nothing to publish: no diagram or story that can be drawn                                               |
| `publish.errors`               | 1    | `--strict`, and the project has errors; nothing was pushed or published                                 |
| `publish.not-published`        | 1    | `--unpublish` of a name the project does not publish                                                    |

The service's own codes, as the commands meet them, are printed with a sentence of their own too
(any other code is printed as it came, with the service's message in English;
[errors of the service](cloud.md#errors)):

| Code                | Exit | What happened                                                                           |
| ------------------- | ---- | --------------------------------------------------------------------------------------- |
| `token.invalid`     | 3    | The service refuses the token, because it is unknown or was revoked: run `login`        |
| `auth.required`     | 3    | The service needs a signed-in person and the request has none                           |
| `cli.invalid`       | 1    | The one-time code was refused: unknown, used or expired                                 |
| `cli.rate`          | 1    | Too many failed attempts: wait the seconds it says and run `login` again                |
| `quota.tokens`      | 1    | The account already holds 20 API tokens: revoke one in the page                         |
| `project.not-found` | 1    | The cloud project does not exist, or you may not open it (one answer for both)          |
| `version.not-found` | 1    | The cloud project has no such version                                                   |
| `access.denied`     | 1    | Your role does not allow it: publishing, sharing, renaming and deleting are the owner's |
| `revision.mismatch` | 1    | The project changed again while pushing, so nothing was overwritten: run `push` again   |
| `quota.files`       | 1    | A project holds at most 2000 files                                                      |
| `quota.binary`      | 1    | An image or a font may be at most 10 MiB                                                |
| `quota.storage`     | 1    | The account would go over its 200 MiB of storage                                        |
| `quota.projects`    | 1    | The account already holds 100 projects                                                  |
| `doc.too-large`     | 1    | A text over 2 Mi characters, or texts over the 16 MiB a project's document holds        |
| `path.invalid`      | 1    | A path the cloud does not keep                                                          |
| `binary.invalid`    | 1    | An upload that is not a PNG, JPEG, GIF, WebP, woff2, ttf or otf by its bytes            |
| `handle.required`   | 1    | You have no handle yet: give `--handle`, or run `publish` in a terminal to be asked     |
| `handle.taken`      | 1    | Another account has the handle: choose another with `--handle`                          |
| `handle.locked`     | 1    | The handle cannot change while pages are published under it: unpublish them first       |
| `handle.invalid`    | 1    | A handle is 3 to 30 lowercase letters, digits and hyphens                               |
| `publish.too-large` | 1    | The catalog is over the 16 MiB a page may be; nothing was sent                          |
| `publish.rate`      | 1    | A project may be published ten times an hour; try again in the seconds it says          |
| `publish.taken`     | 1    | Another project of yours already publishes that name: choose another with `--slug`      |

## Continuous integration

```bash
pnpm mdg init architecture --ci github
```

writes `.github/workflows/meltemi-diagrams.yml` at the top of the repository with the project's
path. On every push and pull request it installs `@meltemi/diagrams-cli` at this CLI's version,
validates with `--strict`, reviews pull requests against their base branch (into the job summary
and a `review` folder), builds the catalog, and keeps `catalog` and `review` as artifacts. The base
branch reaches the script through `$GITHUB_BASE_REF`, never written into it. Commented steps
install FFmpeg and run every export profile.

`--ci gitlab` writes `.gitlab-ci.yml`, or `.gitlab/meltemi-diagrams.yml` when a pipeline already
exists, and prints the `include` that adds it. Existing workflows are never replaced.

### Pushing to the cloud on merge

```bash
pnpm mdg init architecture --ci github --cloud
```

adds one more job to the workflow, the last thing in the file: on a push to the repository's default
branch it runs `meltemi-diagrams push "$PROJECT" --force --strict`, so that the cloud project follows
the repository. The job reads the token from the CI's secrets as `MELTEMI_TOKEN` and writes none in
the file: on GitHub `${{ secrets.MELTEMI_TOKEN }}`, with the optional repository variable
`MELTEMI_HOST` to name another service than `https://diagrams.meltemi.dev` (a variable, not a
secret); on GitLab the job `meltemi-diagrams-cloud` runs on the pipelines of the default branch and
reads `MELTEMI_TOKEN`, best kept as a masked, protected CI/CD variable, and the optional
`MELTEMI_HOST`. `--cloud` goes with `--ci` (alone it is a usage error), and without it the workflow
is exactly what it was. The project
has to be pushed once from a computer (`push --create`) and its `project.json` committed, so that
the job knows the project. GitHub's workflow starts on pushes to `main` only, so edit the `branches`
under `on:` if your default branch has another name.

Make the token for the job in the page's **API tokens** dialog, which shows it once, and keep it in
the secrets of the repository. A token acts as you for everything the API allows and is not limited
to one project: name it for the repository and revoke it if the secret leaks.

**Why `--force --strict`.** The repository is the truth. A push asks before it overwrites what the
cloud holds and the folder lacks, a diagram somebody drew in the page, and CI cannot answer: without
a terminal the push would be refused and the job would fail every time, so the job says `--force`.
`--strict` keeps a broken project out of the cloud: the job fails on validation errors and on files
that cannot be sent, and what the cloud held stays. Whatever the page changed since the last merge
is overwritten, so `pull` it first if it should survive (`review --base cloud` lists it). To find
out whether the cloud has drifted, `push --check` exits 1 when anything differs and writes nothing.
