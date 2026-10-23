# The playground

[Español](es/playground.md)

The playground is Meltemi Diagrams in a web page: the templates, the code beside the same canvas as
the VS Code extension, and every export, with nothing to install and no account needed. Everything
runs in the browser; nothing you write is sent anywhere (decision 0031). Served by the
[cloud service](cloud.md), the page also offers an optional account ([the account](#the-account))
and, with it, projects kept in the cloud ([projects in the cloud](#projects-in-the-cloud)), which
can be shared ([sharing a project](#sharing-a-project)), worked on together, live, by the people
they are shared with ([working together](#working-together)) and published as a web page
([publishing a project](#publishing-a-project)). The link to a shared project opens it for anyone
to look at, with no account ([viewing a shared project](#viewing-a-shared-project)); without an
account, nothing else changes.

## Building and serving it

```bash
pnpm playground:build
```

The build writes a static site to `packages/playground/dist/`: `index.html`, the scripts, the
style sheets, `templates.json`, the fonts, the Tabler data, the runtimes written into HTML exports,
`NOTICES.md`, `api/session`, the answer a static server gives the page's one request to an API
(`{"user":null}`: nobody is signed in), and `_headers`, the two headers the cloud service's assets
platform gives every file of the page (`frame-ancestors 'self'` and `nosniff`; a static server
serves it as a plain file). Any static server serves it; during development `pnpm preview` serves
the repository at `http://localhost:4173/packages/playground/dist/`. The hosted page is
`https://diagrams.meltemi.dev`: the [cloud service](cloud.md) serves the same build with an account
on top of it (`pnpm cloud:dev` locally), deployed from `main` by the deploy workflow.
The page signs people in at `https://id.meltemi.dev`; set `PLAYGROUND_IDENTITY` to another identity
service's origin when building to change that, and the policy's `form-action` follows.

```bash
pnpm playground:test-browser
```

builds the site, serves it on `127.0.0.1` and drives it in the installed Edge or Chrome.

## What it does

| Area     | In the playground                                                                                                                                                                                                                                                                                                                                  |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Projects | The explorer lists the project's folders and diagrams and makes, renames, moves and deletes them, with the imports that follow a move ([the explorer](#the-explorer)); **New project** starts from the `init` templates, shown as cards; a project `.zip` is imported and exported as a whole. The project compiler is the CLI's and the editor's. |
| Code     | Highlighting, line numbers, diagnostics underlined and listed with their lines and quick fixes, completion, hover, formatting, rename and go to definition across files.                                                                                                                                                                           |
| Canvas   | The canvas of VS Code: palette and relation tool, selection, moves, routes, labels, the style strip and inspector, the theme panel, minimap, grid and snapping, layout actions, sequence and C4 tools, effects and stories with their timeline. Every gesture is an edit of the text.                                                              |
| Undo     | One history per file for typing, canvas edits, fixes, formatting and renames, and moves of files with the imports that follow them; Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y anywhere in the page. In a cloud project it covers your own edits only.                                                                                                        |
| Import   | Mermaid, PlantUML and Markdown, pasted or from a file, into a new `.meltemi` file, with the importer's findings and its report.                                                                                                                                                                                                                    |
| Export   | SVG, animated SVG, PNG, PDF, the HTML player, GIF, WebM and MP4, and the file's export profiles; the source file, the project `.zip`, the model JSON and the HTML catalog.                                                                                                                                                                         |
| Share    | A link with the project in the address; for a cloud project, its own short link and who may open it ([sharing a project](#sharing-a-project)).                                                                                                                                                                                                     |
| Keep     | The project stays in the browser between visits.                                                                                                                                                                                                                                                                                                   |
| Account  | Optional, only when the cloud service serves the page: sign in with GitHub or Google through the Meltemi identity service, and make API tokens ([the account](#the-account)).                                                                                                                                                                      |
| Cloud    | Signed in: projects in your account that open on every device, merge what you edit offline, keep versions and show a preview ([projects in the cloud](#projects-in-the-cloud)).                                                                                                                                                                    |
| Together | A cloud project open in several places shows who is here, where their carets and selections are, and what they have selected on the canvas; everyone types at once ([working together](#working-together)).                                                                                                                                        |
| View     | The link of a shared project opens it to look at, play and export, signed in or not, and to copy ([viewing a shared project](#viewing-a-shared-project)).                                                                                                                                                                                          |
| Publish  | A cloud project's catalog as a web page at an address of its own ([publishing a project](#publishing-a-project)).                                                                                                                                                                                                                                  |
| Language | English and Spanish: the page follows the browser's language until the globe menu in the header chooses one.                                                                                                                                                                                                                                       |

### Keys of the code

| Key                          | Does                                                                     |
| ---------------------------- | ------------------------------------------------------------------------ |
| Ctrl+Space                   | Suggestions (they also open as a word starts)                            |
| Ctrl+.                       | Quick fixes                                                              |
| Shift+Alt+F                  | Format the file                                                          |
| F2                           | Rename the id under the caret across the project                         |
| F12, Ctrl+click              | Go to the definition                                                     |
| Tab, Shift+Tab               | Indent, unindent; Escape then Tab moves to the next control              |
| Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y | Undo and redo, in the code and on the canvas                             |
| Ctrl+S                       | Keep the project in the browser now; in a cloud project, send what waits |

On Apple systems, Cmd takes the place of Ctrl. The canvas keeps its own keys (`docs/editor.md`),
and the explorer its own ([the explorer](#the-explorer)).

## The explorer

The column on the left is the project: its name and where it lives at the top, then its folders and
diagrams, as an editor's explorer lists them.

- **The tree.** Folders come first, then files, each sorted by name. A `.meltemi` file is listed by
  its name without the extension, with the picture of its first diagram's kind (flow, free
  composition, sequence, C4 view), or of a model, a story or a theme. A file that declares more than
  one diagram or story opens to list them; a click on one opens the file and shows that diagram, or
  plays that story, on the canvas. The open file is in bold, and the diagram the canvas shows is
  selected. Images are listed with a picture icon and show in the code pane. A file with errors or
  warnings shows how many; a closed folder shows the sum of what it holds.
- **Making and changing files.** **New diagram…**, in the bar above the tree or in a folder's menu,
  asks a name and a kind (flow, free composition or sequence) and writes `<folder>/<name>.meltemi`
  with an empty diagram of that kind, titled with the name. **New folder…** makes a folder that stays
  once a diagram is in it. A row's menu (a right click, Shift+F10, or its **…** button) renames,
  moves, duplicates, downloads and deletes; a folder downloads as a `.zip`. Renaming or moving a
  `.meltemi` file rewrites the imports that name it, and its own, so that they point at the same
  files; the move and those edits are one step, which Ctrl+Z undoes from any file. A file that does
  not parse keeps its imports, and the status line names it. Deleting asks first and cannot be
  undone.
- **Drag and drop.** Rows drag into a folder, or onto the empty space below them for the project's
  root, one at a time or as a selection made with Ctrl or Shift. A drop that would land on a file of
  the same name moves nothing and says which. Files dragged from your computer land in the folder
  they are dropped on, and a `.zip` opens **Import project**.
- **Show all files.** The tree lists folders, diagrams and images. **Show all files**, at its foot,
  also lists `project.json`, `assets.lock.json`, fonts and any other file, and adds **New file…** to
  the menus; the page remembers the choice. A hidden file with a problem says so at the foot, with
  **Show**. **Project settings**, in the Projects panel, opens `project.json` whatever the toggle
  says, and makes it as `init` writes it when the project has none.
- **The assets' problems.** An icon pack without licence, an icon the sanitiser refuses or a file
  whose name a reference cannot write counts on the row of its file and on its folders, the pack's
  folder included, as the problems of diagrams do; an asset file opened lists its own. They go as
  soon as the file is fixed. Icons added with **Add icon…** come with their licence, so they add
  none ([adding icons](language/assets.md#adding-icons-from-the-editor)).
- **Its place.** The edge between the explorer and the code resizes it, from 180 to 480 pixels (the
  arrows on the focused edge, a double click to reset it), and Ctrl+B hides it to a rail and shows it
  again; the page remembers both. A first visit on a screen narrower than 1100 pixels starts with the
  rail. On a narrow screen the explorer is the first of three tabs, **Files**, **Code** and
  **Canvas**, and opening a file shows the code.

| Key (in the tree)   | Does                                                            |
| ------------------- | --------------------------------------------------------------- |
| Up, Down, Home, End | Move between rows; with Shift, extend the selection             |
| Right, Left         | Open a folder or go into it; close it or go to its parent       |
| Enter, Space        | Open the file, the diagram or the story; open or close a folder |
| A letter            | Go to the next row whose name starts with it                    |
| F2                  | Rename in the row: Enter keeps the name, Escape the old one     |
| Ctrl+D              | Duplicate the file beside it                                    |
| Delete              | Delete, after a question                                        |
| Shift+F10           | The row's menu                                                  |
| Ctrl+B              | Hide or show the explorer, from anywhere in the page            |
| Ctrl+Shift+E        | Go to the explorer, from anywhere in the page                   |

### The project switcher

The top of the explorer names the open project and where it lives: **This browser**, for a cloud
project its connection ("Saved to the cloud", "Saving…", "Offline"), or **View only**. The pencil
renames it: the `name` of `project.json` for the project of this browser, the project itself in the
cloud. A click opens the **Projects** panel:

- **New project…**, **Import project…**, **Export project (.zip)**, **Save this project to the
  cloud** (signed in, for the project of this browser), **Project settings** and **Show all files**;
- **This browser**: the project the browser keeps, which opens on a click (leaving a cloud project),
  and **Previous project** with **Restore** when a template, an archive or a link replaced work;
- **In the cloud**, signed in, your cloud projects
  ([cloud projects in the panel](#cloud-projects-in-the-panel)); signed out, a line and the
  **Sign in** link.

Escape or a click outside closes it.

### New project

**New project…** asks a name and shows a card per template: a picture of its first diagram, its
title, what it is for and what it holds, such as "1 model · 2 views". The arrows move between the
cards and Enter creates the project. The name follows the card chosen until you type one. Signed
out, the project replaces the one of this browser, after a question when that one holds work that is
not a template; the work is kept as the previous project. Signed in, the project is made in your
account and opens; **In this browser** makes it in the browser instead.

| Card                          | What it holds                                                                                                               |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Flow diagram (`flow`)         | A flow diagram to start from                                                                                                |
| C4 model (`c4`)               | An architecture model with a context view and a container view                                                              |
| Sequence diagram (`sequence`) | A sequence diagram with a scenario for each outcome                                                                         |
| Slide (`free`)                | A slide composed freely: text, boxes, an icon and a group                                                                   |
| Purchase example (`purchase`) | The reference example: a model, its C4 views, a payment sequence, an executive slide, an animated story and export profiles |

The pictures are drawn once, when the site is built, in the template's theme and in its dark
counterpart, and the page shows the one of its own theme.

### Importing and exporting a project

**Export project (.zip)** downloads the project as **Download → Project (.zip)** does
([continuing locally](#continuing-locally)). **Import project…**, **Open** with a `.zip`, or a `.zip`
dropped on the explorer reads the archive (a single top folder that holds everything is left out of
the paths) and asks where its project goes:

- **A new project in your account**, signed in: its texts are created, its images and fonts
  uploaded with the progress shown, and it opens; the limits of a cloud project are checked first,
  and a project that cannot be completed is deleted again.
- **This browser**: it becomes the project of this browser, and the work it replaces is kept as the
  previous project.
- **Replace the files of** the open cloud project: every file of it becomes the archive's.

Nothing is replaced without that choice. An archive with no file of a project says so and changes
nothing.

## Exports in the browser

The export dialog builds the same requests as `meltemi-diagrams export` and produces them with the
same code, so a picture is the CLI's picture; only the last step differs, because a web page has
neither a headless browser nor FFmpeg:

| Format    | How the page makes it                                                                                                                                |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| SVG, HTML | Written as produced: the same text as the CLI's.                                                                                                     |
| PNG       | The SVG drawn on a canvas at the size times the scale (at most 16,384 pixels a side), transparent when asked.                                        |
| PDF       | The browser's print dialog on a page the size of the picture with no margin; **Save as PDF** keeps it as vectors. The CLI writes PDF files directly. |
| GIF       | Frames at `i × 1000 / fps` ms from the player document, one palette of 256 colours, ordered dithering, frames cropped to what changed, looping.      |
| WebM, MP4 | The same frames encoded by the browser (WebCodecs: VP9 or VP8, H.264) in containers the page writes; formats the browser cannot encode are disabled. |
| Profiles  | Each `export` block of the file, named as it says.                                                                                                   |

Video sizes, frame rates and durations follow the CLI's defaults (1080p at 30 fps; GIF 960 × 540 at
15 fps). An empty **Duration** field shows, greyed, the length the video takes: the story's, the end
of finite effects, one loop of endless ones (`6s, one loop of the effects`), or 1 s without moving
effects; the message after the download names it. An MP4 asked transparent is drawn over the
theme's background, as MP4 has no transparency, and so is a WebM here, since the browser's encoders
have no alpha: the message says so, and that the CLI keeps a WebM transparent
(`--format webm --background transparent`). A size over 16,384 pixels a side is scaled down. The
frames are the CLI's frames; the encoders differ, so files differ in bytes, not in content.

The dialog's **Language** sets the words the tool adds to the export: the type lines of C4 entities,
the controls of the HTML player and the headings of the catalog, whose pages carry it as their
`lang`. It starts at the project's `"locale"`, or English, and applies to the file's profiles and to
the catalog section too; **Download → Catalog** uses the project's language
([projects](language/projects.md#language-of-exports)).

## Language

The page speaks English and Spanish. It follows the browser's language until the globe menu at the
end of the header chooses **Automatic**, **English** or **Español**; the choice is kept with the
page's settings, and choosing reloads the page with the project and the open file kept. When the
browser cannot keep data, the page says so and does not reload; images too large to keep are listed
first. The words the canvas writes into files, such as the text of a new note ("Nota"), follow
the page's language, as if you had typed them; exports follow the dialog's **Language** instead.

## Sharing and keeping work

**Share** copies a link that holds the project's text files, compressed, after `#p=`. The part of
an address after `#` never reaches a server. Images do not travel in links; download the project
to share them. A link is checked when it opens: at most 4 MiB once decompressed, the project's file
limit, and paths inside the project. Opening a link, an archive or a template keeps the work it
replaces as the previous project, which **Restore**, under **Previous project** in the Projects
panel, brings back.
In a cloud project, and in one being viewed by its link, **Share** opens
that project's own dialog instead ([sharing a project](#sharing-a-project)).

The page keeps the project in the browser (local storage), text files and images up to 512 KiB
each. A browser that keeps nothing still runs the playground; the status line says so. A cloud
project is kept differently, as its document in IndexedDB ([offline](#offline)), and the project of
the browser and the cloud projects never replace each other.

## Continuing locally

**Download → Project (.zip)** writes the project as a folder: `project.json` and every file at its
path. Extract it, and the command line and the VS Code extension work on it as on any project:

```bash
meltemi-diagrams validate my-project
```

**Export project (.zip)** in the Projects panel downloads the same archive, and
**Download → Continue locally** lists the commands.

## The account

The account is optional, and it belongs to the [cloud service](cloud.md), not to the page: the page
offers it only when the Worker of `packages/cloud` serves it. Served by a static server, such as
`pnpm preview`, nothing changes. When it starts the page asks its own origin, once, who is signed
in. A static server answers with the `{"user":null}` that the build wrote; any other answer the page
cannot use, or none at all, also means that nobody is signed in, silently.

**Signed out**, the end of the header holds a **Sign in** link. It goes to the identity service,
`id.meltemi.dev`, and brings you back to the page you were on; before leaving, the page keeps your
project in the browser. Everything else works as before and nothing is sent.

**Signed in**, the header shows your avatar and name, with a menu of three entries:

| Entry          | Does                                                             |
| -------------- | ---------------------------------------------------------------- |
| **Account**    | Opens the account panel at Profile, in this page                 |
| **API tokens** | Opens the account panel at API tokens                            |
| **Sign out**   | Ends the session at the identity service and returns to the page |

Under the entries the menu shows what your account holds, read when the menu opens: how many of the
100 projects it may hold and how much of its 200 MiB of storage it uses, as in "3 of 100 projects"
and "5.2 MiB of 200 MiB used", with a thin bar beside each; a click on them opens the panel at
Usage. They show nothing when the service does not answer, and appear only where cloud projects do.

### The account panel

The account is one panel in the page, never a tab, a popup or a frame: a list of sections on the
left and the one chosen beside it, or, on a narrow screen, a sheet over the whole page with the
sections as a strip of tabs above. The arrows, Home and End move between the sections; Escape and
the close button return to the page.

| Section         | Holds                                                                                                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Profile**     | Your picture and name, the emails of your sign-ins, the publishing handle (3 to 30 lowercase letters, digits or hyphens; it cannot change while a page is published under it) and Sign out |
| **Sign-ins**    | GitHub and Google as you sign in with them: the account, whether the provider verified its email, when it was linked; Unlink, after a question, while another one is left; Link the other  |
| **Devices**     | Where you are signed in, this device marked; Sign out of one device or of all the others, after a question                                                                                 |
| **API tokens**  | The tokens that let the command line and scripts act as you (below)                                                                                                                        |
| **Usage**       | Your projects and storage against their limits, and the limits of a project's files, size and versions and of an image                                                                     |
| **Danger zone** | Deleting the account: what it removes, and the way to the identity service's page where you confirm it                                                                                     |

Sign-ins and Devices are what the identity service holds; the page asks its own origin, whose Worker
asks the identity service on your behalf ([the identity data](cloud.md#the-identity-data)). When the
identity service cannot be reached the two sections say so, with **Try again** and a link to its
account page; the other sections keep working. A device you sign out keeps working on this product
for up to an hour, until the Worker checks its session again.

Two things leave the page, in the same tab, and come back to the section they left: linking a
provider (GitHub and Google show their own pages) and deleting the account (you confirm it on the
identity service's page). The page keeps your work in the browser before it goes. The identity
service brings you back to `?account=signins` or `?account=danger`; the panel opens at that section
and the parameter leaves the address. A session that ends while the panel is open closes it and
shows the page signed out, your work kept.

**API tokens** makes the tokens that let the command line and scripts act as you. It lists them with
when each was created and last used, makes one from a name of up to 60 characters, and revokes one
after a confirmation. A new token is shown once, with a button to copy it, and is gone when the
panel closes; the service keeps only a hash of it. An account holds at most 20. A token
authenticates the service's API as `Authorization: Bearer`, which is how the command line's cloud
commands use it ([the API tokens](cloud.md#api-tokens), [the command line](cli.md#the-cloud-commands)).

Signing in adds your cloud projects to the explorer's Projects panel
([projects in the cloud](#projects-in-the-cloud)) and changes nothing else: the project in your browser stays where it is, nothing is uploaded until you
make a cloud project or save the one you have open to the cloud, and signing out takes nothing
away; your cloud projects wait in your account.

## Projects in the cloud

Signed in, the page can keep projects in your account as well as in the browser. They open on every
device, survive a reinstalled browser, merge what you edit offline and keep versions; the
[cloud service](cloud.md) holds them. None of it appears signed out, and a static server has none of
it. Nothing is uploaded until you make a cloud project or save the one you have open to the cloud.

### Cloud projects in the panel

The Projects panel of the explorer's switcher lists your cloud projects: name, a small preview of the
diagram, when it last changed, and how many of the 100 an account may hold; above eight projects a
field filters them. The project that is open is marked. **New project** makes a project from one of
the templates' cards, with a name of 1 to 100 characters, and **Import project** one from an
archive. The pencil of the switcher renames the project that is open. Each project has buttons to
open it, rename it, duplicate it, copy its link (`<origin>/p/<id>`) and delete it, which asks first: the project goes with its versions, and it cannot be undone. When the
account is at its limit of projects, the status line says so and the list does not change. A project
somebody else owns and shared with you by name is listed too, marked "Shared with you: view only" or
"Shared with you: you can edit", and has only the buttons to open it, duplicate it and copy its link:
renaming and deleting are the owner's.

### Saving the local project

**Save this project to the cloud** appears while the project open is the one the browser keeps and
it holds files. It copies the project into a new cloud project, uploads each image and font (the
status line counts them) and opens the copy. The limits are checked before anything is sent: at
most 2000 files, 10 MiB for an image or a font, 2 Mi characters for a text file and 16 MiB of text
in all, and every file name must pass [the path rule](cloud.md#the-path-rule), which allows ASCII
letters, digits, spaces and `_ . ( ) + @ -`, and refuses `..`, a name that starts with a dot, a
backslash and a colon. A project that cannot be completed is deleted again, so trying again leaves
no copy behind. The project in the browser is not changed: it rests while the cloud project is open,
and a click on the project of this browser, in the panel, brings it back. The name starts as the `name` of
`project.json`.

### Opening a project and its address

A project opens from the panel or from an address. The link you copy, `<origin>/p/<id>`, redirects
to `/?project=<id>`: on load the page reads `project` (and `invite`, and `live`) from the address,
asks the service what you are to that project, opens it in the mode that role gives and keeps the
address, so reloading reopens it.

| You are                                              | The project opens                                                                                          |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| The owner, an editor, or signed in on an `edit` link | As a cloud project: bound to its room and edited as usual                                                  |
| A viewer, signed in (a member, or on a `view` link)  | In view mode, following the project live                                                                   |
| Not signed in, on a `view` or `edit` link            | In view mode, following the project live as a visitor; on a snapshot only if the room is silent            |
| Anyone with a live session's link (`?live=`)         | Bound to its room with the session's role, as a guest when not signed in ([live sessions](#live-sessions)) |
| Not admitted (a private project that is not yours)   | The status line says the project was not found; the browser's project opens                                |

Opening another project from the panel changes `project` in the address, and opening the project
of this browser removes it. When the project is not found, or the link does not admit you, the status line
says "The project was not found."; signed out, it adds that if the project was shared with you, you
should sign in and open the link again, and the **Sign in** link brings you back to the same
address. The page never says whether a project exists but is private: a private project that is not
yours looks like one that does not exist. The project of the browser opens meanwhile, untouched.

An address can carry an invitation, `/p/<id>?invite=<token>` (the link the owner copies from the
share dialog). Signed in, the page accepts it first, so the project opens with the role it gives,
says "Invitation accepted: you can view (or edit) the project" and takes `invite` out of the
address; if the invitation names another project than the address does, the invitation wins and
the address follows it. An invitation that is not valid (unknown, already used, or older than thirty
days) says "This invitation is not valid.", except when signing in with the invited address already
made you a member: the link is then spent and the project yours, so it opens as if it had just been
accepted. Signed out, the page shows what the link admits, if anything, says "Sign in to accept the
invitation to this project." and keeps `invite` in the address: the **Sign in** link returns to the
same address, and the invitation is accepted then. A share link (`#p=`) opens as the project of the
browser: a cloud project that was open is left first, and the panel then offers to save what the
link brought.

### Working in a cloud project

The page loads the project's files into the editor, connects to the project's room and keeps both in
step. Typing, canvas edits, quick fixes, formatting, renames, imports and added or deleted files
become edits of a shared document, merged and sent at most four times a second. A change that
arrives from elsewhere (another device, a push through the API, a restored version) updates the
text, the code pane (the caret stays on the same text), the canvas and the analysis, and never
enters your undo history.

- An image or font you add is uploaded, at most 10 MiB, as PNG, JPEG, GIF, WebP, SVG, WOFF2, TTF or
  OTF, and shows up when the service has stored it; the status line says when one was not stored.
- Deleting an image or a font while the page is online tells the service, and its bytes stop
  counting in your usage once no other file and no version of yours uses them; a weekly collection
  deletes the bytes from storage ([the collection of blobs](cloud.md#the-collection-of-blobs)).
  Undo does not bring such an image back, and the page says nothing when the service cannot be
  told.
- Two files that end up with one name (two devices rename a file offline) are both kept: one is
  shown as `<name>~<id>`, and the status line says so. Rename one to end it.
- The file you have open is yours: the page remembers it for each project in this browser, and it is
  not shared.
- Opening a template or a project archive replaces the files of the cloud project. The page asks
  first, unless the files are a template's, and says that the cloud copy is replaced; download the
  project first if you want a copy.
- A cloud project saves itself. **Ctrl+S** sends what waits and says where the work is.
- When the room refuses a change (a file too large, a name it cannot keep), the status line names
  the limit, the text goes back to what the room has, the connection reopens and the undo history
  starts again.

The status line shows the connection:

| It says                                                                   | It means                                                                                                                        |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Connecting to the cloud…                                                  | The room has not answered yet                                                                                                   |
| Saved to the cloud                                                        | The connection is open and the changes you made have been sent                                                                  |
| Saving…                                                                   | You changed something a moment ago; it lasts a second and a half after the last change                                          |
| Reconnecting… your changes are kept in this browser                       | The connection dropped while the browser is online; the page tries again after a second, then longer                            |
| Offline: your changes are kept in this browser and sync when you are back | The browser says it has no connection                                                                                           |
| Room full: 20 people are in this project. Trying again…                   | The room already holds twenty connections; the page tries again by itself, and **Try again** asks at once                       |
| Deleted from the cloud                                                    | The project was deleted from your account (on another device, say) or is no longer shared with you: the page stops reconnecting |

Where IndexedDB is unavailable, these lines add "Not kept offline in this browser" or ask you to
keep the page open, because a page closed while offline loses what the room has not got.

When a project is deleted from your account while it is open, the page stops reconnecting and keeps
what it has in the editor; it can no longer be saved to the cloud, so download the project to keep a
copy.

### Undo in a cloud project

Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y undo and redo your own edits of the open file and never a change
that arrived from the room. The grouping is the one of a project in the browser: typing joins one
step until a pause of 700 ms or a line break; a canvas edit, a quick fix, formatting, a rename, an
import or a file operation is a step of its own; deleting text or a line break ends the typing step,
so a drag followed by typing within 700 ms undoes in two steps; and an edit that touched several
files, such as renaming an element other files refer to, undoes in all of them together. When only
changes from elsewhere have arrived since your last step there is nothing to undo, and the Undo
button is disabled. The history lives in the page: it starts again when the page reloads, when
another project opens, after the room refuses a change and after a version is restored. A restore
replaces the files as a whole, and an earlier step could only turn the restored text into something
no version held, so undo does not bring back what it replaced; restore the automatic version the
list keeps instead.

### Offline

A cloud project is also kept in this browser: its document is stored in IndexedDB (the database
`meltemi-cloud`), with each change of yours and a moment after the room changes it. A project opens
from that copy at once and then syncs with the room, so you do not wait for the network to start.

If the connection drops while a project is open, you keep working. The status line says Offline or
Reconnecting, your changes are kept in IndexedDB, and when the connection returns the page
reconnects by itself, sends what the room lacks and receives what you lack, with no dialog. Edits
that two devices made to one file merge the way text merges, each keeping its own characters; edits
to different files and renames never conflict, except that two files given one name are shown as
described above. When the browser comes back online, or the page comes back to the front, the page
tries the connection at once instead of waiting; when the page is hidden or left, it sends what
waits and writes the document to IndexedDB.

What it does not do:

- There is no service worker, so the page itself does not load without a connection, and a page
  started offline cannot ask who is signed in: it opens as the project of the browser, signed out.
  Offline editing means a project that was open when the connection dropped, not opening the
  playground with no network.
- Where IndexedDB is unavailable (some private windows, blocked storage) the project opens from the
  room, the status line says it will not be kept offline, and what the room has not got is lost if
  the page closes while offline.
- The copy belongs to the browser: another browser or device syncs from the room.
- What you made while offline has to fit the room's messages (512 KiB). A single change over that
  (a very large paste or import made offline) cannot be sent: when the connection returns the
  page refuses it as the room would, in the same words, and goes back to the room's text.
- When the service cannot be reached as a project opens, a project this browser holds a copy of
  still opens from it, and says so; one it has no copy of does not open.

### Versions

While a cloud project is open the header has **Versions**: a panel with the project's versions, the
newest first. Each shows its number, its name (or "No name"; the ones the service made say
"Automatic"), when it was made and how many files changed since the one before, with their paths
(the first twenty, then "and N more"), and has **Restore**. The panel counts them, as in "12 of 200
versions".

- **Name this version** keeps the project as it is now, with a name of up to 80 characters, or with
  no name when the field is empty. The page sends what waits to the room just before it asks and
  does not wait for the room to confirm, so an edit typed in that last instant may miss the version.
- **Restore** asks first: the project's files become the version's, and the state you leave is kept
  as an automatic version, so you can come back to it. The files arrive like any change from
  elsewhere, and the page forgets what you could undo before: the way back is that automatic
  version.

Autosave never makes a version. The service makes one a day when the project has changed since its
latest version (it holds the project after the first changes of that day), and one before each
restore. It keeps at most 100 versions with no name: the oldest go first, and of those older than
thirty days only the newest of each week stays. A named version is never removed. A project holds
at most 200 versions, and when it is full of named ones the panel says so and refuses a new version
or a restore; six a minute is the most. [Versions](cloud.md#versions) has the policy.

### Thumbnails

The preview in the panel is made by the page, which already draws diagrams. Five seconds after the
analysis of the open `.meltemi` file settles, and at most once a minute for each project, the page
renders the diagram on the canvas as a static SVG (the picture the SVG export makes, with the file's
theme and embedded fonts) and sends it when it changed since the last one it sent. It sends nothing
for a file with nothing to draw (only a `model` block, or text that is not a diagram) and nothing
over 200 KiB; the service takes one for each project every thirty seconds, and a page that is
refused for being early tries once more a minute later, without saying anything. A project with no
preview shows the outline of a folder.

### Sharing a project

The owner of a cloud project decides who may open it, and as what, from the header's **Share**
button, which in a cloud project, and in a project being viewed by its link whether signed in or
not, opens the project's own dialog instead of the `#p=` one. Changing anything is the owner's;
everyone else sees what concerns them. [The cloud service](cloud.md#sharing-and-permissions)
holds the rules.

| You are                     | The dialog shows                                                                                                                                                                  |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The owner                   | The link; who can open it; the live session; the people with their emails, a role menu and **Remove**; **Invite someone**; the pending invitations with their links; **Publish…** |
| A member                    | The link; your role; the people (their names, pictures and roles); **Leave**                                                                                                      |
| Anyone else the link admits | The link and your role: "You can view this project but not change it."; nothing of the people                                                                                     |

- **The link** is `<origin>/p/<id>`, with **Copy**. It opens the project for whoever its level
  admits.
- **Who can open the link** has three choices, one sentence each. **Only the people listed**, what a
  new project starts with: only the people listed can open it. **Anyone with the link can view**:
  anyone, signed in or not, can see and play the diagrams but not change them. **Anyone signed in
  with the link can edit**: anyone who opens the link signed in can edit, and anyone else views. A
  member keeps their role whatever you choose; the link can only give more.
- **People** are the ones you gave a role by name, **Can view** or **Can edit**. The role menu
  changes it. **Remove** asks first: the person loses the access given by name, and keeps what the
  link gives, if it gives anything. A project holds at most 50 people and pending invitations
  together, and the dialog counts them ("3 of 50 people and invitations").
- **Invite someone** takes an email address and a role; an address that is not one is refused
  before anything is sent. **No email is sent**: the dialog shows the invitation with its link and
  **Copy link**, and you pass it on. The person gets the access when they open the link signed in,
  whatever their email, or when they sign in with that address and the provider has verified it. An
  invitation works once, lasts thirty days, and never lowers a role the person already has. Asking
  again for an address that has a pending invitation sets its role again and shows the same link.
- **Pending invitations** lists each with its address, role, when it expires, **Copy link** and
  **Revoke**. They are the owner's alone: an invitation's link is a way in, so members and people who
  only have the project's link never see one.
- **Leave** asks first. The project goes from your projects, and you can open it again only if the
  owner invites you or the link admits you. The owner has no **Leave**: they delete the project.
- **Live session**, the owner's alone, lets anyone with its link in for a while, with or without an
  account ([live sessions](#live-sessions)). With none on, it says so and offers **Start a live
  session** beside the **Guests can edit** switch. With one on, it shows its link with **Copy
  link**, the switch, how many guests are in now and when it ends ("Ends in 23 h 59 min"), and **End
  session**, which asks first. The dialog reads the session each time it opens, so one started on
  another device shows.
- **Publish…** opens the publish dialog ([publishing a project](#publishing-a-project)).

What the service refuses is said in words: for example "A project holds at most 50 people and
pending invitations together. Remove someone or revoke an invitation first."

An editor works in the project as its owner does: the files, the canvas, images and fonts, and the
versions, restoring one included. Renaming and deleting the project, who may open it and publishing
are the owner's.

### Viewing a shared project

A viewer can look at a project but not change it. Anyone a project's link admits is a viewer when
the link is `view`, and so is a person signed in who was added as **Can view**; a person who is not
signed in is a viewer on an `edit` link too, because editing needs an account. The page shows
**View only** in the header, with the buttons that keep a copy, and turns off everything that edits:

- **The code** is read-only. You can select and copy, and use hover and the problems list; typing,
  Enter, Tab, accepting a completion, a quick fix, rename (F2) and format (Shift+Alt+F) change
  nothing.
- **The files** cannot be opened from your computer, imported, made, renamed, moved or deleted:
  the explorer lists them with none of its actions, and the panel offers neither **New project**
  nor **Import project**. The tree, **Export** (every format) and **Download** work as always.
- **The canvas** says "view only". The palette and the other controls that write the diagram are
  hidden; a drag, a connection, a deletion or a keyboard edit changes nothing, and the status line
  says so; the inspector shows the values and cannot change them, and the theme panel does not open.
  Selection, zoom, pan, the minimap, showing and hiding layers, copying, stories with their timeline
  and effects work.
- **Undo, Redo and Ctrl+S** have nothing to undo or save; Ctrl+S says so and points to the copy.
- **Share** gives the project's link and what you are to it, and nothing to change: the people only
  to a member ([sharing a project](#sharing-a-project)).

What a viewer sees is not the same for everyone:

- **Not signed in.** The page connects to the project's room as a visitor, with a guest identity
  ("Guest 37", or the name you give in the bar under the header): what editors change appears as
  they make it, you see who else is here with their carets, selections and pointers, and they see
  you, with a **Guest** badge. It keeps nothing in the browser (no copy in IndexedDB), and the
  project the browser keeps is not touched. Only when the room does not answer in time does the page
  read the project once instead, its files and the images and fonts they use, and then it says at
  once that the project may have changed, with **Reload to see changes**, which reads it again.
- **Signed in.** The page connects to the project's room as a viewer: what editors change appears
  as they make it ("Following live"), and the connection reconnects as any cloud project's does
  ("Reconnecting… you see the last version meanwhile"). You see who else is here, with their
  carets and selections, and they see you ([working together](#working-together)). A viewer keeps
  nothing in the browser either: no copy in IndexedDB and no remembered file; and has no
  **Versions** button, because there are none to name or restore, and sends no thumbnail. If the
  project is deleted while it is followed, the status line says it is no longer available to you.

Two buttons keep a copy. **Make a copy** puts the files you are looking at in this browser as the
browser's own project and leaves view mode, so you can edit it, and it is kept like any other
project of the browser; if the browser holds work that is not a template, the page asks first, and
what it replaces stays as the previous project (**Restore** in the Projects panel).
**Save a copy to my projects**, shown when you are signed in, asks the service to copy the project
into your account and opens the copy as its owner: it counts against your 100 projects and 200 MiB
like any project, and the versions are not copied. Neither copy changes the shared project.

When your role changes while the project is open (the owner makes you an editor or a viewer, or
changes who the link admits), the service cuts your connection and the page reconnects after a
second. The room's greeting then names the new role, and the page opens the project again in the
mode that role gives, keeping the file you had open; it does the same when the room refuses a
change. The status line says "Your access changed: you can view this project but not change it." or
"Your access changed: you can edit this project now." An editor who is made a viewer loses what
the room had not received yet: the browser's copy of the project is dropped, as a viewer keeps
nothing. A person who is removed, and whom the link does not admit, finds the project gone, as if it had been deleted: a viewer is told "This project is
no longer available to you".

### Working together

A cloud project can be open in several places at once: on your own devices and, once you share it,
for the people who open its link ([sharing a project](#sharing-a-project)), and, during a live
session, for anyone with the session's link ([live sessions](#live-sessions)). The owner, the
editors and the guests who may edit type in it together; viewers and visitors follow along. Nothing
is switched on: what you do shows to the others and what they do shows to you. A room holds twenty
connections at a time, so a person with the project open in two tabs counts twice. When it is full,
the owner and the editors with an account still get in: a viewer or a guest (the newest connection
of whoever has the most) gives up its place and is shown the full room instead.

**Who is here.** The header lists the other people who have the project open: a picture, a name
and, on a screen 1700 pixels wide or more, the name of the file they are in. Each person has a
colour, one of twelve picked from their account and the same on every page, though two people may
share one. Four are listed and the rest are behind a **+N** button, in a menu. Clicking a person
opens the file they are in; a person who has none open, or one this project does not have, is
listed but cannot be clicked. The list is hidden while you are alone. Your own account is never
listed, however many tabs or devices have the project open, though the caret and selection of
another tab of yours are drawn like anybody's, in your colour. A person without an account has no
picture and a **Guest** badge beside their name, on the header and on their caret's flag: the room
says who is a guest, so nobody can pass for an account.

**In the code.** Another person's caret in the file you have open is a thin bar in their colour with
their name on a flag above it (below it on the first line). The flag fades after two seconds
without the caret moving, so the code stays readable when several people are in one file, and it
comes back when the caret moves. A selection is a translucent band in the same colour. Both hold to
the characters they were on, not to a line and a column, so they move as anybody types, you
included. The layer takes no clicks and no selection and is never copied. A person in another file
is not drawn.

**On the canvas.** An element, a relation or an event that another person has selected in the file
you are looking at is outlined in their colour with a tag holding their name; when several people
have the same one selected, their outlines and tags stack. The outline is only a drawing: a click
on it reaches the element under it. It is not drawn for something on a hidden layer, nor while a
story plays (it returns when the story ends), and none of the exports carries it. The canvas takes
it as a `presence` message ([the editor guide](editor.md#the-panes)).

**Pointers.** Where another person's pointer is over the canvas of the diagram you are looking at,
the canvas draws a cursor in their colour with their name at its tail. It moves four times a second
and glides from one position to the next over 200 milliseconds, so it reads as one motion; its tip
is on the same place of the diagram at every zoom, and it keeps its size on the screen. It goes
three seconds after the person's pointer stops, or as soon as it leaves their canvas. A click goes
through it; it is not drawn while a story plays, and no export carries it.

**What is shared.** Four things: the file you have open, where your caret or selection is in it,
what you have selected on the canvas, and where your pointer is over it while it moves there. Never who you are: the room attaches your account's name
and picture to what it relays ([awareness](cloud.md#awareness)), so nobody can appear as somebody
else, and a person with no name is shown as "Someone". Names are always shown as the characters they
are: a person called `<b>Ben</b>` appears as exactly that. The page sends your state when it changes,
at most four times a second, and again every fifteen seconds; a person disappears from your page when
their connection closes or when thirty seconds pass without a word from them, so a person whose
computer went to sleep or lost its connection is gone within half a minute (a page also forgets
anyone the room has not mentioned for forty-five seconds, in case the word that they left never
reached it). While your own connection is down nobody else is shown, and everybody is
again when it returns. Nothing of presence is saved: not in the project, not in an export, not in
this browser and not in the room's storage.

A viewer, signed in or not, shares presence like anybody (where they are, never an edit), and sees
everyone's ([viewing a shared project](#viewing-a-shared-project)).

**Typing together.** Two people typing in one file, even in one line at the same moment, end with
the same text on both pages and every character of both kept; there is no dialog and nothing to
resolve. Canvas edits and typing interleave the same way: while one person drags an element and
another types in the file, both pages keep the new `place` line and the typed text, and both
canvases show the element moved. After the usual pause the analysis runs on the text as it is,
whoever wrote it, and the canvas follows. Your caret stays on the same text when others edit around
it, and Ctrl+Z undoes only what you did, never a character of somebody else's
([undo in a cloud project](#undo-in-a-cloud-project)); a change that arrives while you type does
not end your typing step.

**The connection.** The status line says where it is ([the table above](#working-in-a-cloud-project)):
saved, reconnecting or offline, and for a viewer "Following live". While it is down you go on
editing. The page tries again after a second, then two, doubling up to thirty, and at once when the
browser comes back online or the page returns to the front; when it connects, what you did and what
the others did meanwhile merge, with nothing to resolve ([offline](#offline)).

**A full room.** The twenty-first connection is turned away. The status line says "Room full: 20
people are in this project. Trying again…" with a **Try again** button; the page also tries by
itself, after half a second at first and longer each time up to thirty seconds, and gets in when
somebody leaves. What you type meanwhile stays in this browser and merges once you are in. If this
browser has no copy of the project to open from (the first time, or as a viewer, who keeps none),
nothing opens: the page says the room is full and to open the project again in a moment, and the
project of the browser stays.

What it does not do:

- It is for cloud projects open in the playground. The VS Code extension and the command line show
  no presence; a push through the API or the command line reaches the people in the room live, as
  any change does.
- It does not follow anybody's view, and has no comments, chat or voice.
- Carets, selections and pointers are drawn for the file you have open only; people in other files
  are in the header.
- A project that is not in the cloud has no room: the `#p=` dialog of the browser's project says a
  live session needs the project in an account, with **Save to my projects** when you are signed in
  and **Sign in to start one** when you are not.

### Live sessions

A live session lets anyone with its link into a cloud project for a while, with or without an
account, to work on it together as it happens. The owner starts it from the share dialog
([sharing a project](#sharing-a-project)) and passes its link on, `<origin>/p/<id>?live=<token>`.
It lasts twenty-four hours, ends by itself after an hour with nobody in the project, and the owner
ends it with **End session** at any time. While it is on, the owner's header shows **Live · 2
guests**, which opens the dialog. **Guests can edit** decides what the people who join by the link
may do: edit, or only watch; changing it while guests are in reconnects them in a second with the
new role.

**Joining.** Whoever opens the link joins at once: a person signed in with their account, keeping the
higher of their own role and the session's; anybody else as a guest, with no account and no sign-in.
A guest's page opens the project bound to its room, keeps nothing in the browser and keeps `live` in
the address, so a reload rejoins. A bar under the header says "You are in the live session of
Together as" with the name others see, **Guest 37** at first (two digits from the browser's own id,
so two guests differ by name and not only by colour), which you change there: the page reconnects
and the others see the new name in a moment. The bar also says when the session ends, and offers
**Make a copy** and **Sign in**. A visitor of a `view` or `edit` link without a session has the
same bar ("You are following Together live as").

**What a guest can do.** Edit the text and the canvas, add, rename and delete files, and undo their
own edits, as an editor does. What is kept in an account needs one, and the page says so with the
way to it: adding images and fonts ("Adding images and fonts needs an account. Sign in to add them."),
versions, the thumbnail, sharing and publishing. **Make a copy** puts the files in this browser as
its own project.

**When it ends.** A guest's connection closes and the status line says "Live session ended"; the
page never reconnects with that link. When the project's link lets anybody view, the page goes on
following it live as a visitor, without editing. When it does not, the page keeps what it shows,
read-only, with **Make a copy**: nothing else of the project reaches it.

**Limits.** Guests and visitors count in the room's twenty places and give theirs up to the owner and
the editors as viewers do. One network holds at most ten connections without an account in a room:
the eleventh says "Too many connections from this network" and does not try again by itself.

### Publishing a project

The owner of a cloud project publishes it from the share dialog's **Publish…**. A published project
is a web page: the HTML catalog of its diagrams and stories, the same page that **Download →
Catalog** writes ([catalog](catalog.md)), in the project's language and with its `catalog`
settings, served at an address of its own that anyone can open with no account:
`https://<publish host>/<handle>/<page name>/`. The page is built in the browser; the service stores
what it is sent and never renders. Only the owner can publish, unpublish or see the dialog.

- **Handle.** The first time, the dialog asks for one: 3 to 30 lowercase letters, digits or
  hyphens, unique among accounts. It is part of every address you publish, and it cannot change
  while you have a published page. The page asks for it only once the catalog is built and small
  enough to send, so a project that cannot be published never takes a handle.
- **Page name.** The last part of the address: lowercase letters, digits and hyphens, up to 60. It
  starts as the project's name made into one. A project may publish several pages under different
  names, and a name another of your projects already publishes under is refused: the dialog says
  so under the name and asks for another. It also says what the address will end in.
- **Publish** builds the catalog, checks that it is at most 16 MiB and sends it. It says "Published
  _name_." and, when some diagrams could not be drawn, how many were left out. A project with
  nothing to draw says it has no diagrams to publish. The address appears with **Copy** and **Open**
  (a new tab). A project can be published ten times an hour.
- **Published pages** lists what the project has published, with its date, **Publish again**,
  which updates the page with the project as it is now, and **Unpublish**, which asks first. An
  unpublished page stops being served at once, though a browser may keep showing a copy it already
  has for up to five minutes.
- **Removed by the service.** A page the service took down is listed as removed by the service, with
  the date and the reason.

What a published page holds is what the catalog holds: titles, descriptions, types, file names inside
the project and what the drawings show, and the source text only if the project's `catalog.source` is
`true` ([the catalog](catalog.md#authorised-metadata-only)). The page runs under the catalog's own
policy, on a domain that has no cookie and no API ([the publish host](cloud.md#the-publish-host)).
That domain is `meltemi.page`; in development the address is under `/_published/` on the
service's own origin.

### Known limits

- An image or a font removed while the page is offline, or when the service cannot be told, stays
  counted in the account's storage until the project is deleted
  ([the collection of blobs](cloud.md#the-collection-of-blobs)).

## Privacy and safety

The page's content security policy allows scripts, styles, fonts, images and connections from its
own origin only, plus `data:` and `blob:` for drawn pictures; without an account no request leaves
it, which the browser test checks for every feature. The account adds two things to the policy and
takes nothing out. `img-src` also allows `https://avatars.githubusercontent.com` and
`https://*.googleusercontent.com`, where the sign-in providers keep avatars, so a signed-in
person's avatar is the one image the browser may load from another origin. `form-action`, which was
`'none'`, is `'self'` plus the origin of the identity service the page was built for, so that the
**Sign out** form can post to it. `connect-src` stays `'self'`: signing in is a navigation, not a
request the page makes. Cloud projects add nothing to the policy either: the page talks to its own
origin, with ordinary requests and one WebSocket to its own host (`/rooms/<id>`). The images and
fonts of a cloud project reach the page as bytes the service serves sandboxed and as downloads
([images and fonts](cloud.md#images-and-fonts)), so a script inside an uploaded SVG runs nowhere.
Sharing, viewing and publishing add nothing either: a viewer's page reads the project through
ordinary requests to its own origin, and publishing sends the catalog's HTML to the service as one
more; the pictures of people in the share dialog are drawn only from the hosts the policy already
allows. Working together adds nothing: presence travels on the same socket, and the name and
picture of every person come from the room, are shown as text and through the same rule for
pictures, and are kept nowhere ([safety](security.md#cloud-projects)). A published page is served
from a domain of its own, never from the page's origin
([safety](security.md#sharing-and-publishing)).
Nothing runs from a project or a link: they are compiled with the limits of
`docs/security.md`. There is no AI assistance in the page: it would need a provider key in a web
page and requests to the provider; the CLI and the editor have it (`docs/assist.md`).

## How it is built

- The canvas is `@meltemi/diagrams-canvas`, shared with the extension's webview; the page plays
  the extension's role (applies plans, keeps revisions, answers the canvas's requests).
- The explorer is `src/explorer/`: `tree-model.ts` (the tree, the rows the keys walk and the rules
  of names, moves and copies, with no DOM), `tree.ts` (the WAI-ARIA tree, redrawn by key so that
  focus, scroll and an opening folder survive the project's changes), `explorer.ts` (the pane and
  its actions), `switcher.ts` (the header and the Projects panel), `new-project.ts`, `import.ts`
  and `dialogs.ts`. A move goes through `Studio.moveFiles`, which rewrites the imports with
  `moveFileEdits` of `@meltemi/diagrams-editor` and records the move in the history's own stack;
  the pictures of the template cards are drawn when the site is built (`thumbnails.mjs`).
- Projects live in memory (`MemoryHost`, a `ProjectHost` under `/playground`) and compile with
  `ProjectSessions` of `@meltemi/diagrams-editor`, with the page's font and Tabler readers and the
  bundled ELK worker.
- Fonts and icon data are fetched from the page's own origin when first read; the page analyses
  again when they arrive, and exports wait for every file they read.
- The GIF encoder, the WebM and MP4 writers and the ZIP reader and writer are part of the page
  (`packages/playground/src/encode/`, `src/zip.ts`); nothing else is downloaded.
- The account is `src/cloud/`: the session the page asks for once (`session.ts`), the header's
  sign-in link and account menu (`account.ts`) and the API tokens dialog (`tokens-dialog.ts`, over
  `tokens-model.ts` and `tokens.ts`, which need no DOM). The page works the same whatever the
  service answers; it never throws on it.
- Cloud projects are in `src/cloud/` too. `client.ts` makes the calls to the service and none of
  them throws. `projects-model.ts` is the cloud list of the explorer's panel, and `versions.ts` the
  versions panel over `versions-model.ts`; neither model needs a DOM. `project.ts` is one open
  project: its Yjs document (`doc.ts`), the binding that ties the document to the `Studio`
  (`binding.ts`), the socket to the room (`room.ts`), its copy in IndexedDB (`persistence.ts`) and
  the connection's state (`status.ts`). `thumbnails.ts` and `thumbnail-render.ts` make and send the
  preview, `address.ts` reads and writes `?project=`, and `controller.ts` holds it all together for
  the panel and the shell. The `Studio` gains a `change` listener, `replaceText` for changes that
  arrive from elsewhere and `canUndo` and `canRedo`, and delegates undo to the binding while a cloud
  project is open. The one runtime dependency cloud projects add is `yjs` (MIT, listed in
  `NOTICES.md`); the page keeps the browser, the socket, IndexedDB and the clock behind small
  interfaces, so the tests play all of them.
- Sharing, viewing and publishing are in `src/cloud/` as well. `share.ts` draws the share dialog
  over `share-model.ts`, whose `shareView` is the one place that decides what each role is shown (a
  control a person may not use is not drawn), and `share-api.ts`, the calls; `publish.ts`,
  `publish-model.ts` and `publish-api.ts` do the same for publishing, building the page with
  `projectCatalog` (`src/exports/files.ts`), the build the catalog download shares. Viewing is
  `view-mode.ts` (the mode), `snapshot.ts` (the read of a person who is not signed in), `link.ts`
  (opening an address and accepting an invitation), `view-actions.ts` (the copies and the reload),
  `view-bar.ts` (the header's badge and the reload hint) and `view-page.ts`, which ties them
  together. `Studio.setReadOnly` refuses every edit at the one place edits pass, `CodePane.setReadOnly`
  and the shell guard the rest, the binding sends no update as a viewer, and `canvas-settings.ts`
  gives the canvas `readOnly` in its `settings` message ([the editor guide](editor.md)).
- Presence is in `src/cloud/` as well. `presence.ts` is what a project tells the room about its
  person (the file open, the caret as Yjs relative positions, the canvas selection) with the 250 ms
  throttle and the heartbeat, and what the room says of the others; `presence-wire.ts` is the format
  of the kind 2 messages ([awareness](cloud.md#awareness)) and the only place that reads a peer's
  payload; `presence-model.ts` decides, against the document as it is now, who the header lists,
  which carets the code pane draws and what the canvas is told; `presence-geometry.ts` says where a
  position is on the pane. None of those four needs a DOM. `presence-bar.ts` draws the header's
  list, `presence-overlay.ts` the carets and selections over the code, and `presence-mount.ts` ties
  them to the shell; `room.ts` carries kind 2 messages both ways, and the canvas draws the rest from
  a `presence` message ([the editor guide](editor.md)).
