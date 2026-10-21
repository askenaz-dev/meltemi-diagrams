/**
 * The command line's words in English: help, usage errors, messages, summaries, progress and
 * prompts, in the interface language; and the words of the review report, in the language of the
 * files a command writes. Commands, options, values, file names and codes are not words and stay as
 * written. Sentences with values are functions, so each language builds its own grammar.
 */

import { pushPullEn } from "./push-pull-en.js";

/** A list of ids or names, or "none" when it is empty. */
const listOrNone = (items: readonly string[]) => items.join(", ") || "none";
const quoted = (ids: readonly string[]) => ids.map((id) => `"${id}"`).join(", ");
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const en = {
  /** The help of the command line and of each command. */
  help: {
    /** `meltemi-diagrams --help`: the command's name and its short alias. */
    main: (name: string, alias: string) => `Usage: ${name} <command> [options]
Alias: ${alias}

Commands:
  init [folder]          Create a project from a template (--list shows them)
  validate <path>...     Check .meltemi files and projects
  preview [path]         Serve the project's catalog and rebuild it as files change
  format <path>...       Rewrite .meltemi files and projects in the canonical layout
  import <path>          Import Mermaid, PlantUML or Markdown files into .meltemi sheets
  export <path>          Render the diagrams, stories or profiles of a file or a folder
  layout <file.meltemi>  Arrange a file's diagrams with ELK and write the positions
  convert <file.meltemi> Copy a flow diagram, as drawn, into a new free diagram, or write its
                         model JSON
  build catalog [path]   Write the offline HTML catalog of a project's diagrams and stories
  review [path]          List what changed since a Git revision or another version, by id
  assist <operation>     Optional AI help: generate, modify, relations, explain, apply
  assets <subcommand>    List icon packs and fonts, search icons, write assets.lock.json
  plugins [path]         List the plugins a project installs, what they add, and their problems
  push [folder]          Make the cloud project match the folder (--create, --force, --check)
  pull [id] [folder]     Write a cloud project's files into a folder (--version, --force)
  login                  Sign in to the cloud service in your browser (--no-browser, --token)
  logout                 Revoke the stored cloud token and forget it
  whoami                 Print the name and handle you are signed in as
  publish [folder]       Publish the catalog as a web page of the cloud service (--unpublish)
  projects               List your cloud projects: id, name, role, last change (--json)

Every command takes --lang en|es: the language of its messages and of the words it adds to the
files it writes (the project's "locale" otherwise; messages follow MELTEMI_LANG or LANG).

Options for init:
  --template <name>      flow (default), c4, sequence, free or purchase
  --name <name>          The project's name; the folder's name by default
  --list                 List the templates
  --ci <service>         Also write a CI workflow: github or gitlab
  --cloud                With --ci: the workflow also pushes to the cloud on the default branch

Options for validate:
  --json                 Print one JSON object with all diagnostics
  --strict               Treat warnings as errors for the exit code

Options for export:
  --diagram <id>         Export only this diagram
  --scenario <id>        Export one scenario of the sequence diagrams that declare it
  --story <id>           A story instead: its end, the frame at --at, or its player
  --format <name>        svg (default), png, pdf, html (the player), mp4, webm or gif; PNG,
                         PDF and video use the installed Edge or Chrome, video also FFmpeg
  --profile <id>         Run one export profile of the file; --profiles runs them all
  --out <path>           Output file (one output) or a directory; a folder's outputs
                         keep their folders under it
  --stdout               Print the SVG or HTML of one output instead of writing a file
  --theme <name>         Render with this theme instead of the diagram's own
  --fonts <policy>       SVG and HTML text: embedded fonts (default), outlined or system
  --motion <mode>        SVG effects: static (default, none drawn) or animated (CSS)
  --at <time>            Write the frame at this time, such as 600ms or 1.5s
  --scale <n>            PNG pixels per unit, 1 to 8 (default 2)
  --size <w>x<h>         PNG, PDF and video size; the picture is fitted and centred
                         (videos: 1920x1080, GIF 960x540 by default)
  --fps <n>              Video frames per second, 1 to 60 (30, GIF 15 by default)
  --duration <time>      Video length; the story's, or the effects' end by default
  --background <colour>  transparent, a colour token or a CSS colour (not for HTML)
  --link <url>           The whole picture links to this URL (SVG and PDF)
  --embed                With --format html, a fragment to paste into a page

Options for layout:
  --diagram <id>         Arrange only this diagram
  --all                  Arrange every element anew; without it only unplaced elements move
  --check                Write nothing; list diagrams that would change (exit 1 if any)
  --stdout               Print the arranged text instead of writing the file

Options for convert:
  --to free|json         free: copy a flow diagram into a free one; json: write the model JSON
                         (<stem>.model.json beside the file, the interchange format)
  --out <file>           With --to json, write the JSON here
  --diagram <id>         The flow diagram to copy; needed when the file has several
  --id <id>              Id of the copy; <diagram>_free by default
  --check                Write nothing; say what would be added (exit 1)
  --stdout               Print the converted text instead of writing the file

Options for format:
  --check                Write nothing; list files that would change (exit 1 if any)
  --stdout               Print the formatted text of one file instead of writing it

Options for import:
  --from <format>        mermaid, plantuml or markdown, when the extension does not say
  --out <file>           Write the sheet here instead of <stem>.meltemi beside the source
  --force                Replace an existing sheet
  --merge                Re-import into an existing sheet, keeping its placement and styles
  --check                Write nothing; report what the import would do
  --json                 Print one JSON object with the result

Options for build catalog:
  --out <path>           A folder (for index.html) or a .html file; catalog/ by default
  --title <text>         The catalog's title instead of the project's
  --source               Include the text of each catalogued file (comments included)

Options for preview:
  --port <n>             The port, 4317 by default; 0 picks a free one
  --open                 Open the preview in the default browser

Options for review:
  --base <revision>      The version before, from Git (HEAD by default); cloud, or cloud:<n>
                         for the cloud project's files now, or its version n
  --before <path>        The version before, from another folder or file
  --project <id>         With --base cloud: the cloud project, instead of the manifest's
  --host <url>           With --base cloud: the service, as for login
  --out <folder>         Write index.html with before and after pictures of changed diagrams
  --json                 Print one JSON object
  --exit-code            Exit 1 when something changed

Options for push:
  --create               Make a new cloud project from the folder and record it in project.json
  --name <name>          With --create, the project's name; project.json's name by default
  --project <id>         The cloud project, instead of project.json's "cloud" setting
  --force                Overwrite what differs in the cloud without asking
  --check                Write nothing; list what differs (exit 1 if anything does)
  --strict               Do not push when validation finds errors
  --host <url>           The service, as for login

Options for pull:
  --version <n>          Pull this version of the project instead of its latest files
  --force                Overwrite files that differ in the folder
  --host <url>           The service, as for login

Options for login:
  --host <url>           The service: MELTEMI_HOST, else https://diagrams.meltemi.dev
  --no-browser           Print the approval address instead of opening it
  --token                Read an API token from standard input instead of using the browser

Options for logout and whoami:
  --host <url>           The service, as for login

Options for publish:
  --slug <name>          The page's name in its address; the project's name by default
  --handle <name>        The handle the address starts with; needed for the first publication
  --unpublish            Remove the page --slug names instead of publishing it
  --project <id>         The cloud project, instead of the manifest's cloud.project
  --host <url>           The service, as for login
  --force                Push the folder without asking when it differs from the cloud project
  --strict               Publish nothing while the project has errors

Options for projects:
  --json                 Print one JSON object
  --host <url>           The service, as for login

Operations of assist (see assist --help):
  generate <file>        A new sheet from --prompt
  modify <file>          Changes as --prompt asks, as a proposal to accept in part
  relations <file>       Probably missing relations, marked as assumptions
  explain [path]         What changed since a Git revision, explained
  apply <proposal>       Apply items of a saved proposal

Subcommands of assets:
  list [path]            Icon packs, aliases and fonts with versions, sources and licences
  icons <words>          Icon references matching every word (--project <path>, --limit <n>)
  lock [path]            Write assets.lock.json at the project root

Options:
  -h, --help             Show this help
  -v, --version          Show the version

Exit codes: 0 no errors, 1 errors found, 2 usage error or unreadable path. For import: 0
complete, 1 partial, 2 usage error, unsupported input or an existing sheet. For the cloud
commands: 3 not signed in, or the service refused the token (run login).
`,
    /** `init --help`: the template names, joined. */
    init: (templates: string) => `Usage: init [folder] [options]

Creates a project in the folder (the working folder by default): project.json and the sheets of
a template. Nothing that exists is replaced.

Options:
  --template <name>  ${templates} (flow by default)
  --name <name>      The project's name; the folder's name by default
  --list             List the templates
  --ci <service>     Also write a CI workflow that validates, reviews pull requests and builds
                     the catalog: github or gitlab. In an existing project, only the workflow.
  --cloud            With --ci: the workflow also has a job that pushes the project to the cloud
                     service on the default branch, with --force --strict (CI cannot answer a
                     question). The token is the CI secret MELTEMI_TOKEN; it is never written
                     in the file.
`,
    import: `Usage: import <file or folder> [options]

Imports a Mermaid (.mmd, .mermaid), PlantUML (.puml, .plantuml, .pu, .iuml, .wsd) or Markdown
(.md) file into a .meltemi sheet beside it. A folder imports every such file below it (PlantUML
.iuml includes are read through the files that include them; Markdown files without diagrams are
passed over). The sources are never changed.

Options:
  --from <format>    mermaid, plantuml or markdown, when the extension does not say (one file)
  --out <path>       One file: write the sheet here. A folder: write the sheets under this
                     folder, keeping the sources' folders
  --force            Replace existing sheets
  --merge            Re-import into existing sheets, keeping their placement and styles
  --check            Write nothing; report what the import would do
  --json             Print one JSON object with the result

Exit codes: 0 complete, 1 partial (something essential was not imported), 2 usage error,
unreadable or unsupported input, or an existing sheet without --force or --merge.
`,
    review: `Usage: review [path] [options]

Compares two versions of a project, a folder or a file (the working folder by default) and lists
what changed by id: diagrams, elements, relations, entities, stories, scenes, themes and export
profiles. A changed id whose element kept its kind, label, place or relations is a rename, not a
removal and an addition.

Options:
  --base <revision>  The version before: a Git commit, branch or tag (HEAD by default); or the
                     cloud project: cloud for its files now, cloud:<n> for its version n
  --before <path>    The version before: another folder or file, instead of Git
  --project <id>     With --base cloud: the cloud project, instead of the manifest's cloud.project
  --host <url>       With --base cloud: the service (MELTEMI_HOST, else https://diagrams.meltemi.dev)
  --out <folder>     Write index.html and before and after pictures of every changed diagram
  --json             Print one JSON object
  --exit-code        Exit 1 when something changed

Exit codes: 0 compared, 1 changes with --exit-code, or the cloud project cannot be read, 2 usage
error or unreadable versions, 3 not signed in (--base cloud).
`,
    assets: `Usage: assets <subcommand>

Subcommands:
  list [path]                    Icon packs, aliases and fonts of the project, with their licences
  icons <query> [--project <p>]  Icon references whose name or tags contain every word
                                 (--limit <n>, default 50)
  lock [path]                    Write assets.lock.json with versions, licences and hashes
`,
    plugins: `Usage: plugins [path] [--json]

Lists the plugins the project that contains path installs (the working folder by default): their
versions, the permissions granted, the diagram types and icon packs they contribute, their licence
and origin, and their problems. Plugins are data; their code is never run.
`,
    build: `Usage: build catalog [path] [options]

Writes the offline HTML catalog of the project that contains path (the working folder by
default): its diagrams and stories by folder, with the player, search and links, in one file.

Options:
  --out <path>    A folder (which receives index.html) or a .html file; the project's
                  catalog.out, or catalog/ under the project root, by default
  --title <text>  The catalog's title instead of catalog.title or the project's name
  --source        Include the text of each catalogued file (comments included)
`,
    preview: `Usage: preview [path] [options]

Serves the catalog of the project that contains path (the working folder by default) at
http://127.0.0.1:4317/ and builds it again whenever a source, project.json or an asset changes;
open pages reload where they were. A file opens on its first diagram. Ctrl+C stops it.

Options:
  --port <n>   The port, 4317 by default; 0 picks a free one
  --open       Open the preview in the default browser
`,
    assist: `Usage: assist <operation> [path] [options]

Optional AI assistance (decision 0029). Every answer becomes a proposal of whole blocks, checked
against the project, that you accept in part or in full; nothing is written without --apply.
What a request sends is listed first and needs your yes, or --yes.

Operations:
  generate <file>    Write a new sheet from --prompt
  modify <file>      Change a sheet as --prompt asks
  relations <file>   Suggest relations that are probably missing, marked as assumptions
  explain [path]     Explain what changed since a Git revision or another version
  apply <proposal>   Apply items of a saved proposal (--items 1,3; all by default)

Options:
  --prompt <text>    What to do (generate, modify; an optional focus for relations)
  --profile <name>   generate: flow, c4, sequence or free
  --block <block>    relations: one block, such as "diagram checkout"
  --save <file>      Save the proposal as JSON, to apply later
  --apply <items>    Apply the proposal at once: all, or a list such as 1,3
  --items <items>    apply: the items to apply (all by default)
  --base <revision>  explain: the version before, from Git (HEAD by default)
  --before <path>    explain: the version before, from another folder or file
  --provider <name>  anthropic or openai-compatible (or MELTEMI_AI_PROVIDER)
  --model <name>     The model (or MELTEMI_AI_MODEL; claude-opus-5-5 for Anthropic)
  --base-url <url>   The endpoint (or MELTEMI_AI_BASE_URL), such as http://127.0.0.1:11434/v1
  --yes              Send without asking; what is sent is still listed
  --json             Print the proposal as JSON

Keys come from the environment only: ANTHROPIC_API_KEY, or MELTEMI_AI_API_KEY. Validation,
layout and export never use assistance.

Exit codes: 0 done, 1 a proposal that cannot be applied or a provider error, 2 usage error or
nothing sent.
`,
    push: pushPullEn.help.push,
    pull: pushPullEn.help.pull,
    login: `Usage: login [options]

Signs in to the cloud service. The browser opens at the service's approval page; the one-time code
it hands back reaches this computer only (127.0.0.1, a random port) and is exchanged for an API
token, which is kept in the configuration folder, one per service, readable by you alone where the
system has such permissions. The six characters printed first are the ones the approval page
shows: approve the request only when they match. MELTEMI_TOKEN in the environment takes
precedence over the stored token and over this command.

Options:
  --host <url>   The service: MELTEMI_HOST, else https://diagrams.meltemi.dev
  --no-browser   Print the approval address instead of opening it
  --token        Read an API token from standard input (never from an argument) instead of using
                 the browser: for machines without one

Exit codes: 0 signed in, 1 it failed or nothing was stored, 2 usage error, 3 the service refused
the token.
`,
    logout: `Usage: logout [--host <url>]

Revokes the stored token at the service and forgets it. A token the service no longer knows is
forgotten as well. When the service cannot be reached nothing is forgotten, so that the token can
be revoked later (or on the account page). MELTEMI_TOKEN is never revoked or changed.

Exit codes: 0 signed out (or never signed in), 1 the token could not be revoked, 2 usage error.
`,
    whoami: `Usage: whoami [--host <url>]

Prints the name and handle the token belongs to, and the service it was checked with. The token
itself is never printed.

Exit codes: 0 signed in, 1 the service could not be reached, 2 usage error, 3 not signed in or the
token was refused.
`,
    publish: `Usage: publish [folder] [options]

Publishes the catalog of the project in the folder (the working folder by default) as a web page of
the cloud service: the catalog "build catalog" writes, sent for the cloud project the manifest's
"cloud" names (or --project). The folder is pushed first when it differs from the cloud project,
with the same question as push. The first publication needs a handle, the first part of every
address you publish under; it is public. Give --handle, or answer the question in a terminal.
Published pages are public.

Options:
  --slug <name>    The page's name in its address: 1 to 60 lowercase letters, digits and hyphens
                   (the project's name, simplified, by default)
  --handle <name>  Your handle: 3 to 30 lowercase letters, digits and hyphens; needed once
  --unpublish      Remove the page --slug names instead of publishing it (nothing is built)
  --project <id>   The cloud project, instead of the manifest's cloud.project
  --host <url>     The service: MELTEMI_HOST, else https://diagrams.meltemi.dev
  --force          When the folder differs from the cloud project, push without asking
  --strict         Push and publish nothing while the project has errors

Exit codes: 0 published (or removed), 1 refused or failed, 2 usage error, 3 not signed in or the
token was refused.
`,
    projects: `Usage: projects [options]

Lists the cloud projects you can open: id, name, your role (owner, editor or viewer) and the time
of the last change, the most recent first.

Options:
  --json         Print one JSON object: host and projects, each with id, name, description, role
                 and updated_at
  --host <url>   The service: MELTEMI_HOST, else https://diagrams.meltemi.dev

Exit codes: 0 listed, 1 the service could not be reached, 2 usage error, 3 not signed in or the
token was refused.
`,
  },
  /** Usage errors and messages that several commands share. */
  common: {
    /** `--lang` with another value. */
    lang: "--lang must be en or es.",
    /** The command `meltemi-diagrams frobnicate`: the program's name and the command. */
    unknownCommand: (name: string, command: string) =>
      `${name}: unknown command "${command}". Run "${name} --help".`,
    /** An error the program did not expect, with its message. */
    internalError: (name: string, message: string) => `${name}: internal error: ${message}`,
    /** The word before each hint of a diagnostic: `    hint: Declare it first…`. */
    hint: "hint",
    /** A file or folder that cannot be read, with the system's reason when there is one. */
    cannotRead: (path: string, reason?: string) =>
      `cannot read ${path}${reason === undefined ? "" : `: ${reason}`}`,
    cannotWrite: (path: string, reason: string) => `cannot write ${path}: ${reason}`,
    pathNotFound: (path: string) => `path not found: ${path}`,
    wrote: (path: string) => `Wrote ${path}`,
    atLeastOnePath: "give at least one file or directory.",
    oneMeltemiFile: "give exactly one .meltemi file.",
    oneProject: "give one project folder or file.",
    oneProjectFolderOrFile: "give one project folder, folder or file.",
    cannotCombine: (first: string, second: string) => `${first} cannot be combined with ${second}.`,
    /** A diagram id that a file does not have, and the ids it has. */
    noDiagram: (id: string, path: string, available: readonly string[]) =>
      `no diagram named "${id}" in ${path}; available: ${listOrNone(available)}.`,
    /**
     * Errors in the arguments, by Node's error code: `message` is Node's own text, which English
     * keeps, and `name` the option or argument it names (`--diagram <value>`, `--check`).
     */
    arguments: {
      unknownOption: (message: string, _name: string) => message,
      missingValue: (message: string, _name: string) => message,
      noValue: (message: string, _name: string) => message,
      ambiguous: (message: string, _name: string) => message,
      unexpected: (message: string, _name: string) => message,
    },
  },
  validate: {
    /** The last line: files, errors and warnings. */
    summary: (files: number, errors: number, warnings: number) =>
      `Checked ${count(files, "file")}: ${count(errors, "error")}, ${count(warnings, "warning")}.`,
  },
  layout: {
    sequence: (id: string) => `"${id}" is a sequence diagram, which has no positions to write.`,
    cannotWrite: (id: string, reason: string) => `cannot write the positions of "${id}": ${reason}`,
    unchanged: (path: string) => `${path}: every position is already written.`,
    wouldArrange: (ids: readonly string[], path: string) =>
      `Would arrange ${quoted(ids)} in ${path}`,
    arranged: (ids: readonly string[], path: string) => `Arranged ${quoted(ids)} in ${path}`,
  },
  convert: {
    giveTo: "give --to free (a flow diagram copied into a free one) or --to json.",
    outWithJson: "--out goes with --to json; free copies are written in place.",
    noFlowDiagram: (id: string, path: string, available: readonly string[]) =>
      `no flow diagram named "${id}" in ${path}; flow diagrams: ${listOrNone(available)}.`,
    noFlow: (path: string) => `${path} has no flow diagram.`,
    severalFlows: (path: string, ids: readonly string[]) =>
      `${path} has ${ids.length} flow diagrams (${ids.join(", ")}); choose one with --diagram.`,
    cannotDraw: (id: string) => `"${id}" cannot be drawn, so it cannot be copied.`,
    wouldConvert: (id: string, copy: string, path: string) =>
      `Would convert "${id}" to "${copy}" in ${path}`,
    converted: (id: string, copy: string, path: string) =>
      `Converted "${id}" to "${copy}" in ${path}`,
    /** An option that `--to json` does not take, such as `--diagram`. */
    notForJson: (option: string) => `${option} does not apply to --to json.`,
    wroteJson: (source: string, target: string, ok: boolean) =>
      `Wrote the model JSON of ${source} to ${target}${ok ? "" : " (with errors; see diagnostics)"}`,
  },
  format: {
    stdoutOne: "--stdout formats exactly one file and cannot be combined with --check.",
    stdoutOneFile: "--stdout formats exactly one file.",
    /** The message of `format.syntax-errors`. */
    syntaxErrors: "The file has syntax errors and was not formatted.",
    wouldFormat: (path: string) => `Would format ${path}`,
    formatted: (path: string) => `Formatted ${path}`,
    checkedAll: (files: number) => `Checked ${count(files, "file")}: all formatted.`,
    checked: (files: number, changed: number, refused: number) =>
      `Checked ${count(files, "file")}: ${changed} would be formatted, ${refused} refused.`,
    summary: (changed: number, files: number) => `Formatted ${changed} of ${count(files, "file")}.`,
  },
  export: {
    /** A picture written with a browser, named with its version. */
    wroteViews: (path: string, views: number) => `Wrote ${path} (${views} views)`,
    wrotePicture: (path: string, browser: string) => `Wrote ${path} (${browser})`,
    wroteVideo: (path: string, browser: string, ffmpeg: string, frames: number) =>
      `Wrote ${path} (${browser}, FFmpeg ${ffmpeg}, ${frames} frames)`,
    /** `export.no-diagram`, with the types of the blocks that are not diagram types. */
    noDiagram: (types: readonly string[]) =>
      types.length > 0
        ? `No diagram to export; \`${types.join("`, `")}\` is not a diagram type of the language.`
        : "No diagram to export.",
    noDiagramStoriesHint:
      "Export a story with `--story <id>`, or the file's profiles with `--profiles`.",
    noDiagramTypesHint:
      "`diagram <id>: flow { ... }`, `free`, `sequence` and `c4` diagrams render.",
    onePath: "give exactly one .meltemi file or project folder.",
    profileOrProfiles: "--profile runs one profile and --profiles all of them; choose one.",
    profileOption: (option: string) =>
      `profiles set their own options; ${option} does not go with --profile or --profiles.`,
    profilesOut: "with profiles, --out is an existing directory for their files.",
    format: (format: string, formats: readonly string[]) =>
      `format "${format}" is not supported; use ${formats.join(", ")}.`,
    fonts: (fonts: string, policies: readonly string[]) =>
      `--fonts must be one of ${policies.join(", ")}, not "${fonts}".`,
    motion: (motion: string, modes: readonly string[]) =>
      `--motion must be one of ${modes.join(", ")}, not "${motion}".`,
    at: (at: string) => `--at takes a time such as 600ms or 1.5s, not "${at}".`,
    atAnimated: "--at writes one frame; it cannot be combined with --motion animated.",
    story: (option: string) =>
      `--story writes one frame of a story; it cannot be combined with ${option}.`,
    html: (option: string) =>
      `--format html writes a player; it cannot be combined with ${option}.`,
    embed: "--embed writes a player fragment; it needs --format html.",
    picture: (format: string) =>
      `--format ${format} writes one picture; it cannot be combined with --motion animated.`,
    video: (format: string, option: string) =>
      `--format ${format} writes a video; it cannot be combined with ${option}.`,
    stdoutFile: (format: string) =>
      `--format ${format} writes a file; --stdout prints text formats only.`,
    fpsVideo: "--fps sets the frames per second of MP4, WebM and GIF exports.",
    fps: (fps: string) => `--fps takes a whole number from 1 to 60, not "${fps}".`,
    durationVideo: "--duration sets the length of MP4, WebM and GIF exports.",
    duration: (duration: string) =>
      `--duration takes a time up to 600s, such as 5s, not "${duration}".`,
    scalePng: "--scale sets the pixels of PNG exports.",
    scale: (scale: string) => `--scale takes 1 to 8, not "${scale}".`,
    sizeOutput: "--size sets the output of PNG, PDF and video exports.",
    size: (max: number, size: string) =>
      `--size takes WIDTHxHEIGHT from 16 to ${max}, such as 1920x1080, not "${size}".`,
    backgroundHtml: "--background does not apply to HTML players.",
    background: (background: string) =>
      `--background takes transparent, a colour token or a CSS colour, not "${background}".`,
    mp4Transparent: "MP4 has no transparency; choose a colour, or --format webm.",
    linkFormats: "--link applies to SVG and PDF exports.",
    link: (link: string) =>
      `--link takes an https:, http: or mailto: URL, or a relative one, not "${link}".`,
    oneFile: (option: string) => `${option} works on one file; give a .meltemi file, not a folder.`,
    noProfiles: (path: string) => `${path} has no export profiles.`,
    noProfile: (id: string, path: string, available: readonly string[]) =>
      `no profile named "${id}" in ${path}; available: ${listOrNone(available)}.`,
    noStory: (id: string, path: string, available: readonly string[]) =>
      `no story named "${id}" in ${path}; available: ${listOrNone(available)}.`,
    noScenario: (id: string, path: string, available: readonly string[]) =>
      `no scenario named "${id}" in ${path}; available: ${listOrNone(available)}.`,
    stdoutOne: "--stdout prints one diagram; choose it with --diagram.",
    severalDiagrams: (path: string, diagrams: number) =>
      `${path} has ${diagrams} diagrams; --out must be an existing directory or --diagram must choose one.`,
    noFiles: (folder: string) => `${folder} has no .meltemi files.`,
    noFileWithProfile: (folder: string, id: string) =>
      `no file in ${folder} has a profile named "${id}".`,
  },
  import: {
    oneSource: "give exactly one file or folder to import.",
    from: (from: string, formats: readonly string[]) =>
      `--from must be ${formats.join(", ")}, not "${from}".`,
    forceAndMerge: "--force and --merge cannot be combined.",
    fromInFolder: "--from applies to one file; in a folder each file's extension says its format.",
    noSources: (folder: string) => `${folder} has no Mermaid, PlantUML or Markdown files.`,
    replacesSource: "the output would replace the source.",
    exists: (path: string) =>
      `${path} exists; pass --merge to re-import keeping its adjustments, or --force to replace it.`,
    nothing: (source: string) => `nothing was imported from ${source}.`,
    /** The status of an import, as the report names it. */
    status: { complete: "complete", partial: "partial", failed: "failed" },
    /** What happened to the constructs of one imported diagram. */
    coverage: (diagram: string, mapped: number, approximated: number, dropped: number) =>
      `${diagram}: ${mapped} mapped, ${approximated} approximated, ${dropped} dropped`,
    wouldImport: (source: string, out: string, status: string) =>
      `Would import ${source} → ${out} (${status})`,
    imported: (source: string, out: string, status: string, merged: boolean) =>
      `Imported ${source} → ${out} (${status}${merged ? ", merged" : ""})`,
    /** The parts of a folder's summary, by status. */
    folder: {
      complete: (n: number) => `${n} complete`,
      partial: (n: number) => `${n} partial`,
      failed: (n: number) => `${n} failed`,
      notReplaced: (n: number) => `${n} not replaced`,
      withoutDiagrams: (n: number) => `${n} without diagrams`,
    },
    /** The summary of a folder: the files, the folder and the parts above. */
    folderSummary: (check: boolean, files: number, folder: string, parts: readonly string[]) =>
      `${check ? "Would import" : "Imported"} ${count(files, "file")} from ${folder}: ${parts.join(", ")}`,
  },
  init: {
    /** Each template's title and what it holds, as `init --list` prints them. */
    templates: {
      flow: { title: "Flow diagram", description: "A flow diagram to start from" },
      c4: {
        title: "C4 model",
        description: "An architecture model with a context view and a container view",
      },
      sequence: {
        title: "Sequence diagram",
        description: "A sequence diagram with a scenario for each outcome",
      },
      free: {
        title: "Slide",
        description: "A slide composed freely: text, boxes, an icon and a group",
      },
      purchase: {
        title: "Purchase example",
        description:
          "The reference example: a model, its C4 views, a payment sequence, an executive slide, an animated story and export profiles",
      },
    },
    /** A template's contents, the kinds it has in the order given: "1 model, 2 views". */
    contents: (
      counts: readonly (readonly ["models" | "views" | "diagrams" | "stories", number])[],
    ) =>
      counts
        .map(([kind, n]) =>
          count(
            n,
            { models: "model", views: "view", diagrams: "diagram", stories: "story" }[kind],
            {
              models: "models",
              views: "views",
              diagrams: "diagrams",
              stories: "stories",
            }[kind],
          ),
        )
        .join(", "),
    exists: (path: string) => `${path} exists; it is not replaced.`,
    gitlab: `.gitlab-ci.yml exists; add the job with:\n  include:\n    - local: .gitlab/meltemi-diagrams.yml\n`,
    oneFolder: "give one folder.",
    noTemplate: (template: string, templates: readonly string[]) =>
      `no template named "${template}"; use ${templates.join(", ")}.`,
    ci: (ci: string, services: readonly string[]) =>
      `--ci takes ${services.join(" or ")}, not "${ci}".`,
    /** `--cloud` without `--ci`: it only changes the workflow. */
    cloudNeedsCi: (services: readonly string[]) =>
      `--cloud adds a job to the CI workflow; give --ci ${services.join(" or ")} with it.`,
    /** After a workflow with the push job: where its token comes from, and why `--force`. */
    cloudNote: (secret: string) =>
      `The workflow pushes to the cloud on the default branch with --force --strict, because CI cannot answer a question. Add ${secret} to the CI's secrets: create the token in the page, under API tokens in the account menu.`,
    name: "--name needs some text.",
    notAFolder: (path: string) => `${path} is a file, not a folder.`,
    alreadyAProject: (path: string) => `${path} is already a project; --ci adds a workflow to it.`,
    clash: (path: string) => `${path} exists; nothing was written.`,
    created: (path: string) => `Created ${path}`,
    next: "Next:",
  },
  assets: {
    unknownSubcommand: (subcommand: string) =>
      `unknown subcommand "${subcommand}"; use list, icons or lock.`,
    noLicence: "no licence",
    /** The number of icons of a pack. */
    icons: (n: number) => `${n} icons`,
    noRedistribution: "redistribute: no",
    noEmbedding: "embedding: no",
    packs: "Icon packs:",
    aliases: "Aliases:",
    fonts: "Fonts:",
    noWords: "give words to search for.",
    limit: "--limit must be a positive whole number.",
    noMatch: (query: string) => `No icon matches "${query}".`,
  },
  plugins: {
    none: "The project installs no plugins.",
    notLoaded: (name: string, version: string) =>
      `${name} ${version} — not loaded (see the problems below)`,
    from: (homepage: string) => `  from ${homepage}`,
    folder: (path: string, granted: readonly string[]) =>
      `  folder ${path}; granted: ${granted.join(", ") || "nothing"}`,
    type: (type: string, title: string, kinds: readonly string[]) =>
      `  diagram type ${type} (${title}): ${kinds.join(", ")}`,
    icons: (name: string) => `  icon pack ${name}`,
  },
  build: {
    unknownTarget: (target: string) => `unknown target "${target}"; the only one is catalog.`,
    title: "--title needs some text.",
    skipped: (entry: string, reason: string) => `skipped ${entry}: ${reason}.`,
    warning: (warning: string) => `warning: ${warning}`,
    empty: (root: string) => `${root} has no diagram or story to catalog.`,
    /** What a catalog holds, as the line that names the file lists it. */
    diagrams: (n: number) => count(n, "diagram"),
    stories: (n: number) => count(n, "story", "stories"),
    entities: (n: number) => count(n, "entity", "entities"),
    wrote: (path: string, parts: readonly string[], size: string) =>
      `Wrote ${path} (${parts.join(", ")}; ${size})`,
  },
  preview: {
    /** Answers of the preview server to a browser. */
    onlyHere: "The preview answers only on this machine.",
    notFound: "Not found.",
    skipped: (entry: string, reason: string) => `Skipped ${entry}: ${reason}.`,
    /** A build of the catalog: its diagrams and stories, and the time. */
    built: (diagrams: number, stories: number, time: string) =>
      `Built ${count(diagrams, "diagram")} and ${count(stories, "story", "stories")} at ${time}`,
    port: (port: string | undefined) =>
      `--port takes a whole number from 0 to 65535, not "${port}".`,
    serving: (url: string) => `Previewing at ${url} (Ctrl+C to stop)`,
    portInUse: (port: number) => `port ${port} is in use; choose another with --port.`,
  },
  review: {
    baseOrBefore: "--base takes the version before from Git and --before from a path; choose one.",
    sameKinds: "--before and the path must both be folders or both files.",
    /** What was compared: two folders or files by name, or a revision with the working tree. */
    comparedPaths: (before: string, after: string) => `Compared ${before} with ${after}`,
    comparedRevision: (revision: string) => `Compared ${revision} with the working tree`,
    /** The cloud project's current files, or one of its versions, with the working tree. */
    comparedCloud: (project: string, version: number | undefined) =>
      version === undefined
        ? `Compared the cloud project ${project} with the working tree`
        : `Compared version ${version} of the cloud project ${project} with the working tree`,
    /** `--base cloud:<n>` with something that is not a whole number. */
    cloudVersion: "--base takes cloud, or cloud: and a version number such as cloud:3.",
    /** `--project` or `--host` without `--base cloud`. */
    cloudOptions: "--project and --host go with --base cloud.",
    /** No connection to the service was given to the command (never from the command line). */
    cloudUnavailable: "the cloud is not available here.",
    none: "No changes.",
    summary: (files: number, added: number, removed: number, renamed: number, changed: number) =>
      `${files} file${files === 1 ? "" : "s"} changed: ${added} added, ${removed} removed, ${renamed} renamed, ${changed} changed.`,
    /** The kinds of the blocks that hold changes, and a block whose kind is not known. */
    scopes: { diagram: "diagram", model: "model", story: "story" },
    block: "block",
    /** The words of the review page, in the language of the files the command writes. */
    page: {
      title: "Review",
      /** The heading of a changed diagram's pictures. */
      diagram: (id: string) => `diagram ${id}`,
      before: "Before",
      after: "After",
      new: "New",
      removed: "Removed",
      /** The scope a change is in. */
      in: (scope: string) => `in ${scope}`,
      /** The alternative text of a picture: the diagram and `before` or `after`. */
      picture: (id: string, which: "before" | "after") => `${id} ${which}`,
      /** The status of a file and the legend of the marks. */
      status: { added: "added", removed: "removed", renamed: "renamed", changed: "changed" },
    },
  },
  assist: {
    items: (ids: readonly number[], text: string) =>
      `items are ${listOrNone(ids.map(String))}, not "${text}".`,
    proposal: (path: string, revision: string, provider: string, model: string, summary: string) =>
      `Proposal for ${path} (revision ${revision}, ${provider} ${model}): ${summary || "no summary"}`,
    nothingToChange: "  Nothing to change.",
    /** The action of a proposal item, as the list of items names it. */
    actions: {
      create: "create",
      add: "add",
      replace: "replace",
      remove: "remove",
      relation: "relation",
    },
    imports: (imports: readonly string[]) => `  Imports added with any item: ${imports.join("; ")}`,
    together: (problem: string) => `  Every item together: ${problem}`,
    unknownOperation: (operation: string, operations: readonly string[]) =>
      `unknown operation "${operation}"; use ${operations.join(", ")}.`,
    proposalFile: "give the proposal file.",
    notAProposal: (path: string) => `${path} is not a proposal.`,
    oneFile: (operation: string) => `${operation} needs one .meltemi file.`,
    notMeltemi: (path: string) => `${path} is not a .meltemi file.`,
    exists: (path: string) => `${path} exists; use assist modify to change it.`,
    profile: (profile: string, profiles: readonly string[]) =>
      `--profile takes ${profiles.join(", ")}, not "${profile}".`,
    needsPrompt: (operation: string) => `${operation} needs --prompt.`,
    notSent: "nothing was sent; answer yes, or pass --yes.",
    saved: (path: string, name: string) =>
      `Saved ${path}; apply with ${name} assist apply ${path} --items <list>`,
    /** The question before a request is sent; the answers it accepts are below. */
    send: "Send it? [y/N] ",
    conflicts: (ids: readonly number[]) =>
      `item${ids.length === 1 ? "" : "s"} ${ids.join(", ")} changed since the proposal and ${ids.length === 1 ? "was" : "were"} left out.`,
    nothingWritten: "nothing was written.",
    applied: (ids: readonly number[], path: string) =>
      `Applied item${ids.length === 1 ? "" : "s"} ${ids.join(", ")} to ${path}`,
    noChanges: "No changes to explain.",
  },
  /** The cloud commands: login, logout, whoami, and the failures every cloud command shares. */
  cloud: {
    /** A command that takes no arguments, given some. */
    noArguments: (command: string) => `${command} takes no arguments.`,
    /**
     * Why a cloud command failed, by the stable code of the failure (`cloud-errors.ts`); the code is
     * printed before the sentence, and a code that is not here prints the service's own message.
     */
    errors: {
      /** `cloud.host-mismatch`: the manifest's host, the one the command resolved. */
      hostMismatch: (manifestHost: string, host: string) =>
        `project.json names ${manifestHost}, but this command talks to ${host}; pass --host ${manifestHost} to use it.`,
      /** `cloud.insecure-host`. */
      insecureHost: (host: string) =>
        `${host} is an http: address; a token only travels over https:, or over http: to 127.0.0.1, localhost or [::1].`,
      /** `cloud.host-invalid`. */
      hostInvalid: (host: string) =>
        `${host} is not the address of a service; use an origin such as https://diagrams.meltemi.dev.`,
      /** `cloud.unreachable`, with the system's reason. */
      unreachable: (host: string, reason: string) => `cannot reach ${host}: ${reason}.`,
      /** `cloud.timeout`. */
      timeout: (host: string) => `${host} did not answer in time.`,
      /** `cloud.response-too-large`. */
      tooLarge: (host: string) => `${host} sent more than the command line accepts.`,
      /** `cloud.redirect`. */
      redirect: (host: string, status: number) =>
        `${host} answered with a redirect (${status}); a token is never sent where it leads.`,
      /** `cloud.bad-response`: an answer that is not the service's. */
      badResponse: (host: string, status: number) =>
        `${host} answered something that is not the service's answer (${status}).`,
      /** `cloud.not-signed-in`: the command's name. */
      notSignedIn: (name: string, host: string) => `not signed in to ${host}; run "${name} login".`,
      /** `token.invalid`. */
      tokenRefused: (name: string, host: string) =>
        `${host} refused the token (it is unknown or was revoked); run "${name} login".`,
      /** `credentials.corrupt`: nothing is ever written over such a file. */
      credentialsCorrupt: (path: string, reason: string) =>
        `the credentials file ${path} cannot be used: ${reason}. Fix it or delete it; nothing was written over it.`,
      /** `credentials.unreadable`. */
      credentialsUnreadable: (path: string, reason: string) =>
        `the credentials file ${path} cannot be read: ${reason}.`,
      /** `credentials.unwritable`. */
      credentialsUnwritable: (path: string, reason: string) =>
        `the credentials file ${path} cannot be written: ${reason}.`,
      /** `cli.invalid`: the exchange of the one-time code was refused. */
      cliInvalid:
        "the service refused the one-time code (it is unknown, used or expired); nothing was stored. Run login again.",
      /** `cli.rate`. */
      cliRate: (seconds: number) =>
        `too many failed attempts; wait ${seconds} seconds and run login again.`,
      /** `quota.tokens`. */
      quotaTokens:
        "this account already holds 20 API tokens; revoke one on the account page and run login again.",
      /** `login.timeout`. */
      loginTimeout: "no approval arrived within 5 minutes; nothing was stored.",
      /** `login.state-mismatch`. */
      stateMismatch:
        "the approval did not carry this request's state, so it was not accepted; nothing was exchanged or stored.",
      /** `login.environment-token`. */
      environmentToken:
        "MELTEMI_TOKEN is set; it takes precedence over any stored token, so nothing was stored. Unset it to sign in with login.",
      /** `login.token-input`. */
      tokenInput: "--token reads the token from standard input; pipe it in.",
      /** `login.no-token`. */
      noToken: "no token was given on standard input.",
      /** `login.not-a-token`. */
      notAToken: "that is not an API token (they start with mdg_).",
      /** `login.not-stored`: the token was revoked again, with the reason it could not be kept. */
      notStored: (reason: string) => `the token could not be kept (${reason}), so it was revoked.`,
      /** `login.not-revoked`: it could not be kept and could not be revoked either. */
      notStoredNotRevoked: (reason: string) =>
        `the token could not be kept (${reason}) and could not be revoked either; revoke it on the account page.`,
      /** `login.listener`: no port to listen on. */
      listener: (reason: string) => `cannot listen on this computer for the approval: ${reason}.`,
      /** `logout.not-revoked`: the token was kept. */
      notRevoked: (host: string, reason: string, path: string) =>
        `the token for ${host} could not be revoked (${reason}), so it was not forgotten and can be revoked later: run logout again, or revoke it on the account page. It is kept in ${path}.`,
      /** `cloud.no-project`: the folder's manifest names no cloud project; the command's name. */
      noProject: (name: string) =>
        `this folder names no cloud project; give --project <id>, or make one with "${name} push --create".`,
      /** `pull.unsafe-path`: a path of the cloud project that does not stay inside the folder. */
      unsafePath: (path: string) =>
        `the cloud project holds the path ${path}, which is not a safe path inside the folder; nothing was compared or written.`,
      /** `version.not-found`: the version asked for. */
      versionNotFound: (version: string) => `the cloud project has no version ${version}.`,
      /** `project.not-found`: a project that does not exist or that the person may not open. */
      projectNotFound: (project: string) =>
        `the cloud project ${project} does not exist, or you may not open it.`,
      /** `access.denied`: the person sees the project but may not do this. */
      accessDenied:
        "your role on this project does not allow that: publishing, sharing, renaming and deleting are the owner's, and changing files needs the editor role.",
      /** `handle.taken`. */
      handleTaken: (handle: string) =>
        `the handle ${handle} is taken by another account; choose another with --handle.`,
      /** `handle.locked`. */
      handleLocked: (handle: string) =>
        `your handle is ${handle} and it cannot change while pages are published under it; unpublish them first (publish --unpublish --slug <name>).`,
      /** `handle.invalid`. */
      handleInvalid: (handle: string) =>
        `${handle} is not a handle: use 3 to 30 lowercase letters, digits and hyphens.`,
      /** `handle.required`: the command's name. */
      handleRequired: (name: string) =>
        `you have no handle yet: give --handle <name> (it is public and starts every address you publish), or run "${name} publish" in a terminal to be asked.`,
      /** `publish.handle-in-page`: the service refuses an API token the choice of a handle. */
      handleInPage: (handle: string) =>
        `the service does not let an API token choose the handle ${handle}: choose it in the page, in the project's publish dialog, then run publish again.`,
      /** `publish.too-large`: the catalog's size when known. */
      publishTooLarge: (size: string | undefined) =>
        `the catalog${size === undefined ? "" : ` (${size})`} is larger than the 16 MiB a page may be; nothing was sent. Leave out what the page does not need with catalog.exclude in project.json.`,
      /** `publish.rate`: seconds until the earliest request stops counting. */
      publishRate: (seconds: number) =>
        `a project may be published ten times an hour; try again in ${seconds} seconds.`,
      /** `publish.taken`. */
      publishTaken: (slug: string) =>
        `another project of yours already publishes ${slug}; choose another name with --slug.`,
      /** `publish.not-published`: `--unpublish` of a name the project does not publish. */
      notPublished: (slug: string) => `the project publishes nothing under ${slug}.`,
      /** `publish.empty`. */
      publishEmpty:
        "there is nothing to publish: the project has no diagram or story that can be drawn.",
      /** `publish.errors`: `--strict` with errors in the project. */
      publishErrors: "the project has errors, so nothing was pushed or published (--strict).",
    },
    push: pushPullEn.push,
    pull: pushPullEn.pull,
    projectErrors: pushPullEn.errors,
    login: {
      /** The six characters the approval page shows, printed before the browser opens. */
      check: (check: string) => `check: ${check}`,
      checkNote:
        "Approve the request in the browser only if the page shows the same six characters.",
      opening: (url: string) => `Opening ${url}`,
      openFailed: "The browser could not be opened; open the address above yourself.",
      /** `--no-browser`. */
      visit: (url: string) => `Open this address in your browser:\n  ${url}`,
      waiting: "Waiting for the approval (up to 5 minutes)...",
      /** The question of `--token` when standard input is a terminal. */
      tokenPrompt: "Paste the token: ",
      signedIn: (name: string, host: string) => `Signed in as ${name} (${host})`,
      /** The page the browser lands on, in the language of its Accept-Language. */
      page: {
        done: "Done. You can close this window and go back to the terminal.",
        failed: "Signing in did not finish. Go back to the terminal to see why.",
      },
    },
    logout: {
      done: (host: string) => `Signed out of ${host}: the token was revoked and forgotten.`,
      alreadyRevoked: (host: string) =>
        `The token for ${host} was already revoked; it was forgotten.`,
      none: (host: string) => `Not signed in to ${host}; nothing to do.`,
      environment: "MELTEMI_TOKEN is set in the environment and stays in use; it was not revoked.",
    },
    whoami: {
      who: (name: string, handle: string | null) =>
        handle === null ? `${name} (no handle yet)` : `${name} (@${handle})`,
      host: (host: string) => `host: ${host}`,
      environment: "token: from MELTEMI_TOKEN",
    },
    publish: {
      /** The question for the handle on a terminal. */
      askHandle:
        "Choose your handle: it is public and starts every address you publish (3 to 30 lowercase letters, digits and hyphens): ",
      handleSet: (handle: string) => `Handle set: ${handle}`,
      /** What was published, then its size; the address follows on its own line. */
      published: (parts: readonly string[], size: string) =>
        `Published ${parts.join(", ")} (${size}).`,
      unpublished: (slug: string) => `Unpublished ${slug}.`,
      slugInvalid: (slug: string) =>
        `--slug takes 1 to 60 lowercase letters, digits and hyphens, not "${slug}".`,
      handleOption: (handle: string) =>
        `--handle takes 3 to 30 lowercase letters, digits and hyphens, not "${handle}".`,
    },
    projects: {
      none: (name: string) =>
        `You have no cloud projects yet; make one with "${name} push --create".`,
      header: { id: "ID", name: "NAME", role: "ROLE", changed: "LAST CHANGE" },
      roles: { owner: "owner", editor: "editor", viewer: "viewer" },
    },
  },
};
