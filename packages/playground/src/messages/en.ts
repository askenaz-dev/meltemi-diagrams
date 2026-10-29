import { plural, type Locale } from "@meltemi/diagrams-i18n";
import { accountPanel } from "./account-panel-en.js";
import { cloud } from "./cloud-en.js";
import { explorer } from "./explorer-en.js";
import { presence } from "./cloud-presence-en.js";
import { viewing } from "./cloud-view-en.js";

const counts = (errors: number, warnings: number) =>
  `${errors} ${plural("en", errors, { one: "error", other: "errors" })}, ${warnings} ${plural("en", warnings, { one: "warning", other: "warnings" })}`;

/** The playground's words in English. `es.ts` has the same entries in Spanish. */
export const en = {
  /** The page itself: its title and description, and what it says while it starts. */
  page: {
    title: "Meltemi Diagrams Playground",
    description:
      "Meltemi Diagrams playground: write diagrams as code, adjust them on a canvas and export them, in your browser. No account needed.",
    loading: "Loading the playground…",
    failed: (reason: string) => `The playground could not start: ${reason}`,
    templatesUnreadable: (status: number) => `The templates could not be read (${status}).`,
  },

  /** The header: the brand, the actions and the view tabs of narrow screens. */
  header: {
    tag: "Playground",
    actions: "Playground",
    open: "Open",
    openTitle: "Open files or a project .zip",
    import: "Import",
    importTitle: "Import Mermaid or PlantUML",
    undo: "Undo",
    redo: "Redo",
    format: "Format the file (Shift+Alt+F)",
    share: "Share",
    shareTitle: "Copy a link to the project",
    export: "Export",
    exportTitle: "Export pictures, players and videos",
    download: "Download",
    theme: "Switch light and dark",
    about: "About the playground",
    views: "View",
    code: "Code",
    canvas: "Canvas",
  },

  /** The language switch of the header; the languages are listed by their own names. */
  language: {
    menu: "Language",
    button: (name: string) => `Language: ${name}`,
    auto: "Automatic",
    autoDetail: (browser: Locale) =>
      `Follows the browser: ${browser === "es" ? "Spanish" : "English"}`,
    unavailable:
      "The language cannot change: this browser does not keep the project or the settings between visits. Download the project to keep it.",
    confirmTitle: "Change the language?",
    confirmMessage: (images: readonly string[]) =>
      `The page reloads in the new language. The browser does not keep large images, so ${images.join(", ")} must be added again.`,
    confirm: "Change the language",
  },

  /** The account in the header: the sign-in link, and the menu of a person who is signed in. */
  account: {
    signIn: "Sign in",
    signInTitle: "Sign in with your Meltemi account",
    button: (name: string) => `Account: ${name}`,
    menu: "Account",
    account: "Account",
    tokens: "API tokens",
    signOut: "Sign out",
  },

  /** The API tokens dialog, opened from the account menu. */
  tokens: {
    title: "API tokens",
    intro:
      "A token lets the command line and your scripts act as you. Keep it as secret as a password; you can revoke it here at any time.",
    loading: "Loading your tokens…",
    listLabel: "Your tokens",
    none: "You have no API tokens yet.",
    count: (held: number, most: number) => `${held} of ${most} tokens`,
    createdAt: (when: string) => `Created ${when}`,
    lastUsedAt: (when: string) => `Last used ${when}`,
    neverUsed: "Never used",
    revoke: "Revoke",
    revokeToken: (name: string) => `Revoke the token ${name}`,
    revokeTitle: "Revoke the token?",
    revokeMessage: (name: string) =>
      `Whatever uses the token ${name} stops working at once. This cannot be undone.`,
    revokeConfirm: "Revoke the token",
    revoked: (name: string) => `Revoked the token ${name}.`,
    alreadyGone: "That token was already revoked.",
    createTitle: "Create a token",
    name: "Name",
    nameHint: "What the token is for, such as laptop or CI.",
    create: "Create",
    creating: "Creating the token…",
    made: (name: string) => `Created the token ${name}.`,
    copyNow: (name: string) => `Copy the token ${name} now: it will not be shown again.`,
    tokenLabel: "API token",
    copy: "Copy the token",
    copied: "The token was copied.",
    selectIt: "Select the token and copy it.",
    needName: "Give the token a name.",
    nameTooLong: (most: number) => `The name takes at most ${most} characters.`,
    nameControl: "The name cannot hold control characters.",
    tryAgain: "Try again",
    unreachable: "The service could not be reached. Check the connection and try again.",
    unexpected: "The service answered something the page cannot read.",
    signedOut: "You are signed out. Reload the page and sign in again.",
    quota: (most: number) =>
      `An account holds at most ${most} tokens. Revoke one you no longer use, then create this one.`,
    failed: (message: string, code: string) => `${message} (${code})`,
    failedStatus: (status: number) => `The service answered with status ${status}.`,
  },

  /** The status line. */
  status: {
    privacy: "Runs in your browser; nothing you write is sent anywhere.",
  },

  /** The templates of New project, by the name `init --template` takes. */
  templates: {
    /** Each template's title, by name, as its card shows it. */
    titles: {
      flow: "Flow diagram",
      c4: "C4 model",
      sequence: "Sequence diagram",
      free: "Slide",
      kanban: "Kanban board",
      whiteboard: "Whiteboard",
      purchase: "Purchase example",
    },
    /** What a template holds, the kinds it has in order: "1 model · 2 views". */
    contents: (
      counts: readonly (readonly ["models" | "views" | "diagrams" | "stories", number])[],
    ) =>
      counts
        .map(([kind, n]) => {
          const [one, other] = {
            models: ["model", "models"],
            views: ["view", "views"],
            diagrams: ["diagram", "diagrams"],
            stories: ["story", "stories"],
          }[kind];
          return `${n} ${plural("en", n, { one: one!, other: other! })}`;
        })
        .join(" · "),
    /** What each template of `init` holds, by name. */
    descriptions: {
      flow: "A flow diagram to start from",
      c4: "An architecture model with a context view and a container view",
      sequence: "A sequence diagram with a scenario for each outcome",
      free: "A slide composed freely: text, boxes, an icon and a group",
      kanban: "A board of columns and sticky cards",
      whiteboard: "A sketched board with strokes, stickies and a story that draws them",
      purchase:
        "The reference example: a model, its C4 views, a payment sequence, an executive slide, an animated story and export profiles",
    },
    confirmTitle: "Open the template?",
    confirmMessage: (name: string) =>
      `The ${name} template replaces the project. Your work is kept as the previous project, which the Projects panel restores.`,
    confirm: "Open the template",
    restored: "Restored the previous project.",
  },

  /** The Download menu and what its entries say once done. */
  download: {
    source: "Source file",
    noFile: "No file",
    project: "Project (.zip)",
    projectDetail: "Every file, for the CLI and VS Code",
    model: "Model JSON",
    modelDetail: "As meltemi-diagrams convert writes it",
    catalog: "Catalog (HTML)",
    catalogDetail: "Every diagram and story, offline",
    continue: "Continue locally…",
    continueDetail: "The CLI and the VS Code extension",
    downloaded: (name: string) => `Downloaded ${name}.`,
    projectDownloaded: (name: string) =>
      `Downloaded ${name}. Extract it and run meltemi-diagrams validate on the folder.`,
    building: "Building the catalog…",
    catalogDownloaded: (name: string, entries: number, skipped: number) =>
      `Downloaded ${name}: ${entries} entries.${skipped > 0 ? ` ${skipped} could not be drawn and were left out.` : ""}`,
  },

  /** Opening and keeping projects: archives, local files, links and the browser's storage. */
  project: {
    largeImages: (paths: readonly string[]) => `Large images were not kept: ${paths.join(", ")}.`,
    openedShared:
      "Opened the shared project. Your previous work can be restored from the Projects panel.",
    linkUnreadable: "The link could not be read.",
    workUnchanged: (reason: string) => `${reason} Your work is as it was.`,
    noRoom: "The browser has no room to keep this project; download it to keep it.",
    noStorage: "This browser does not keep pages' data; download the project to keep it.",
    kept: "Kept in this browser.",
    keptHere: "Kept in this browser. Download the project to keep it elsewhere.",
    archiveUnreadable: (name: string) => `${name} could not be read.`,
    noneOpenable: "None of the files can be opened in the playground.",
    replaceTitle: "Replace files?",
    replaceMessage: (paths: readonly string[]) => `${paths.join(", ")} will be replaced.`,
    replace: "Replace",
    added: (paths: readonly string[]) => `Added ${paths.join(", ")}.`,
  },

  /** The open file's place above the code, and an image shown in the code pane. */
  files: {
    preview: (path: string, kilobytes: number, name: string) =>
      `${path} · ${kilobytes} KB · images are used by diagrams beside them, such as image "${name}".`,
    noFile: "no file",
  },

  /** The code pane: its keyboard help, lists, rename box and what its commands say. */
  code: {
    help: "Tab indents; press Escape, then Tab, to move on. Ctrl+Space suggests, Ctrl+Period offers fixes, Shift+Alt+F formats, F2 renames and F12 goes to the definition.",
    width: "Width of the code",
    /** The rail's button, which unfolds the code pane, and the bar's, which folds it. */
    show: "Show the code (Ctrl+J)",
    hide: "Hide the code (Ctrl+J)",
    source: "Source",
    sourceOf: (file: string) => `Source of ${file}`,
    suggestions: "Suggestions",
    quickFixes: "Quick fixes",
    newName: "New name",
    noSuggestions: "No suggestions here.",
    noFixes: "No quick fixes here.",
    giveName: "Give a new name.",
    syntaxErrors: "The file has syntax errors; fix them to format it.",
    alreadyFormatted: "The file is formatted.",
    formatted: "Formatted the file.",
    notAnalysed: "The file cannot be analysed.",
    noDefinition: "No definition here.",
    nothingToUndo: "Nothing to undo in this file.",
    nothingToRedo: "Nothing to redo in this file.",
    noModel: "Show a C4 view whose model resolves to open the model.",
  },

  /** The problems under the code. */
  problems: {
    title: "Problems",
    none: "No problems",
    summary: (errors: number, warnings: number) => `Problems: ${counts(errors, warnings)}`,
    counts,
    where: (code: string, line: number, column: number) => `${code} · line ${line}:${column}`,
    others: "Other files",
  },

  /** Words every dialog shares. */
  dialog: {
    cancel: "Cancel",
    ok: "OK",
    close: "Close",
  },

  /** The import dialog and the Markdown report it downloads, as the CLI's `--report` writes it. */
  import: {
    title: "Import Mermaid or PlantUML",
    intro:
      "Paste a Mermaid flowchart, sequence, C4, architecture or block diagram, PlantUML (component, deployment, use case, sequence, C4) or Markdown with diagram blocks. The import becomes a new file; what it could not keep is listed.",
    placeholder: "flowchart LR\n  shop[Shop] --> orders[(Orders)]",
    source: "Source",
    name: "Name of the new file",
    chooseFile: "Choose a file…",
    import: "Import",
    empty: "Paste a diagram or choose a file first.",
    nothing: "Nothing could be imported.",
    finding: (line: number, message: string, code: string) => `Line ${line}: ${message} (${code})`,
    imported: (format: string, path: string, status: string, findings: number) =>
      `Imported ${format} into ${path}: ${status}${findings ? `, ${findings} findings` : ""}.`,
    importedInto: (path: string, status: string) => `Imported into ${path} (${status}).`,
    downloadReport: "Download the report",
    report: {
      title: (name: string) => `# Import of ${name}`,
      format: (format: string | null, status: string) =>
        `Format: ${format ?? "unknown"} · status: ${status}`,
      diagram: (
        id: string,
        type: string,
        from: string,
        coverage?: { mapped: number; approximated: number; dropped: number },
      ) =>
        `- \`${id}\` (${type}, from ${from})${coverage ? `: ${coverage.mapped} mapped, ${coverage.approximated} approximated, ${coverage.dropped} dropped` : ""}`,
      findings: "## Findings",
      finding: (line: number, severity: string, code: string, message: string) =>
        `- line ${line}: ${severity} \`${code}\` ${message}`,
    },
  },

  /** The share dialog and the links it makes; links that cannot be read say why. */
  share: {
    title: "Share the project",
    link: "Link",
    linkLabel: "Link to the project",
    holds: (files: number, bytes: number) =>
      `The link holds the project's ${files} text files (${(bytes / 1024).toFixed(1)} KB). It stays in the part of the address after #, which browsers never send to a server.`,
    images: (paths: readonly string[]) =>
      `Images do not travel in links: ${paths.join(", ")}. Download the project to share them.`,
    long: "The link is long; some chat programs and mail cut long links. Download the project instead if it does not open.",
    copy: "Copy the link",
    copied: "The link was copied.",
    copiedStatus: "The link to the project was copied.",
    selectIt: "Select the link and copy it.",
    damaged: "The link is damaged.",
    tooLarge: "The link's project is larger than 4 MiB; it is not opened.",
    otherVersion: "The link was made by another version of the playground.",
    tooMany: (files: number, most: number) => `The link holds ${files} files; at most ${most}.`,
    unopenable: (path: string) => `The link holds a file that cannot be opened: ${path}`,
  },

  /** The About dialog. */
  about: {
    title: "About the playground",
    loading: "Loading the list of components…",
    unreadable: "The list could not be read; see NOTICES.md.",
    text: (version: string) =>
      `**Meltemi Diagrams ${version}**: diagrams as code, a canvas to compose them and exports for documents, slides and video.\n\nThe playground runs entirely in your browser. There is no account, nothing you write is sent anywhere, and your work stays in this browser until you download it.\n\nMeltemi Diagrams is MIT. The playground bundles the components below under their own licences: the fonts under the SIL Open Font License 1.1, elkjs under the Eclipse Public License 2.0 (source at github.com/kieler/elkjs), and the others as listed.`,
    notices: "Read every licence (NOTICES.md)",
    agents: "Drawing with coding agents",
    /** The agent setup page, relative to the playground. */
    agentsPage: "agent-setup/",
  },

  /** The dialog that continues the work with the command line and VS Code. */
  continue: {
    title: "Continue locally",
    text: (folder: string) =>
      `Download the project and extract it into a folder named ${folder}. It is an ordinary project: Git keeps its history, the command line validates and exports it, and the VS Code extension (Meltemi Diagrams) edits it with the same canvas.`,
    download: "Download the project (.zip)",
    install: "Install the command line",
    validate: "Check the project",
    export: "Export every profile",
    catalog: "Build the catalog",
    init: "Start a new project from a template",
    skill: "Give your coding agents the skill",
  },

  /** The export dialog: its fields, the profiles and the catalog, and what an export says. */
  exports: {
    title: "Export",
    export: "Export",
    what: "What",
    format: "Format",
    theme: "Theme",
    language: "Language",
    languageHint:
      "The words the tool adds to the picture or the page, such as the type lines of C4 views and the player's controls.",
    formats: {
      svg: "SVG picture",
      png: "PNG picture",
      pdf: "PDF (print to PDF)",
      html: "HTML player",
      gif: "GIF animation",
      webm: "WebM video",
      mp4: "MP4 video",
    },
    diagram: (id: string, title: string | null | undefined) =>
      `Diagram ${id}${title ? ` · ${title}` : ""}`,
    story: (id: string, title: string | null | undefined) =>
      `Story ${id}${title ? ` · ${title}` : ""}`,
    ownTheme: "The diagram's theme",
    everyMessage: "Every message",
    fontPolicies: {
      embedded: "Embedded (the picture carries its fonts)",
      outlined: "Outlined (text as shapes)",
      system: "System (names only)",
    },
    motions: {
      static: "Static",
      animated: "Animated (CSS effects)",
    },
    atPlaceholder: "such as 1.5s",
    sizePlaceholder: "the picture's own, such as 1920x1080",
    backgroundPlaceholder: "the theme's; transparent, a token or a colour",
    durationPlaceholder: "the story's or the effects' length",
    /** What an empty Duration field gives, as its placeholder: "6s, one loop of the effects". */
    durationStory: (time: string) => `${time}, the story's length`,
    durationFinite: (time: string) => `${time}, when the effects end`,
    durationLoop: (time: string) => `${time}, one loop of the effects`,
    webmBackground:
      "This browser records WebM without transparency: the theme's background was used; the command line keeps it (meltemi-diagrams export --format webm --background transparent).",
    durationLongest: (time: string) => `${time}, the longest cycle of the effects`,
    durationStill: (time: string) => `${time}, no moving effects`,
    scenario: "Scenario",
    fonts: "Fonts",
    effects: "Effects",
    instant: "Instant",
    instantHint: "Draws the picture at this time of the effects or the story.",
    scale: "Scale",
    scaleHint: "Pixels per point, 1 to 8.",
    size: "Size",
    sizeHint: "Width × height; the picture is fitted and centred.",
    background: "Background",
    link: "Link",
    linkHint: "The whole picture links to this address.",
    embed: "A fragment to paste into a page",
    autoplay: "Plays when it opens",
    loop: "Loops",
    fps: "Frames per second",
    duration: "Duration",
    commandLine: (reason: string, format: string) =>
      `${reason} The command line makes it: meltemi-diagrams export --format ${format}.`,
    pdfHint:
      'PDF opens the browser\'s print dialog; choose "Save as PDF" to keep the picture as vectors.',
    profiles: "Profiles of the file",
    profilesHint:
      "Each makes the output its export block describes, as meltemi-diagrams export --profile does.",
    profile: (format: string, target: string) => `${format} of ${target}`,
    exportProfile: (id: string) => `Export the profile ${id}`,
    catalog: "Catalog of the project",
    catalogHint:
      "Every diagram and story of the project in one page that works offline, as meltemi-diagrams build catalog writes it.",
    exportCatalog: "Export the catalog of the project",
    drawing: "Drawing the frames…",
    frame: (done: number, total: number) => `Frame ${done} of ${total}`,
    downloaded: (name: string) => `Downloaded ${name}.`,
    downloadedVideo: (name: string, width: number, height: number, fps: number) =>
      `Downloaded ${name} (${width} × ${height}, ${fps} fps).`,
    printing: (name: string) =>
      `The print dialog shows ${name}; choose "Save as PDF" to keep it as vectors.`,
    cancelled: "The export was cancelled.",
    openSource: "Open a .meltemi file to export it.",
    nothingToDraw: "The file has no diagram that can be drawn; fix its problems first.",
    noStory: (id: string) => `There is no story named ${id}.`,
    noDiagram: (id: string) => `There is no diagram named ${id}.`,
    badInstant: (value: string) =>
      `The instant takes a time such as 600ms or 1.5s, not "${value}".`,
    badScale: "The scale takes 1 to 8.",
    badSize: (most: number) => `The size takes WIDTHxHEIGHT from 16 to ${most}, such as 1920x1080.`,
    badBackground: "The background takes transparent, a colour token or a CSS colour.",
    badLink: "The link takes an https:, http: or mailto: address, or a relative one.",
    badFps: "Frames per second takes a whole number from 1 to 60.",
    badDuration: "The duration takes a time up to 600s, such as 5s.",
    profileGone: (id: string) => `The profile ${id} is gone.`,
    playerUnreadable: "The player's runtime could not be read.",
    printTitle: "Picture to print",
  },

  /** What the browser cannot do when it draws pictures and records videos. */
  video: {
    noEncoder: "This browser has no video encoder (WebCodecs).",
    vp: "VP9 or VP8",
    cannotEncode: (codec: string) => `This browser cannot encode ${codec} video.`,
    commandLineCan: (codec: string, format: string) =>
      `This browser cannot encode ${codec} video; the command line can (meltemi-diagrams export --format ${format}).`,
    transparent:
      "Transparent video is made by the command line (meltemi-diagrams export --format webm --background transparent).",
    noDecoderConfig: "The browser's H.264 encoder gave no decoder configuration.",
    pictureFailed: "The browser could not make the picture.",
    mp4TooLarge: "The video is too large for this MP4 writer.",
    webmTooLarge: "The video is too large for WebM.",
  },

  /** Why an archive cannot be read. */
  archive: {
    tooLarge: "The content is larger than allowed.",
    notZip: "The file is not a ZIP archive.",
    tooMany: (files: number, most: number) =>
      `The archive holds ${files} files; at most ${most} are read.`,
    directoryDamaged: "The archive's directory is damaged.",
    encrypted: (name: string) => `${name} is encrypted.`,
    filesTooLarge: "The archive's files are larger than allowed.",
    damaged: (name: string) => `${name} is damaged.`,
    compression: (name: string) => `${name} uses a compression this page does not read.`,
  },

  /** What the studio tells the canvas and the status line. */
  studio: {
    noFiles: "The project has no files; add one or open a template.",
    manifest: "project.json describes the project; open a .meltemi file to see its diagrams.",
    openSource: "Open a .meltemi file to see its diagrams.",
    stale: "The text changed; the canvas shows it again.",
    themeCreated: (theme: string) =>
      `Created the project's theme \`${theme}\` in themes/${theme}.meltemi.`,
    notInProject: (file: string) => `\`${file}\` is not a file of the project.`,
    /** Other files of the project an edit of the canvas wrote, with the open one. */
    filesChanged: (files: readonly string[]) => `Changed ${files.join(", ")}.`,
  },

  /** The explorer, the project switcher, New project and Import project (`explorer-en.ts`). */
  explorer,
  /** The cloud projects: the drawer, the connection, what the service refuses (`cloud-en.ts`). */
  cloud,
  /** Viewing a project by its link: the badge, the copies, the reload hint (`cloud-view-en.ts`). */
  viewing,
  /** Who else is in the open project (`cloud-presence-en.ts`). */
  presence,
  /** The account panel: profile, sign-ins, devices, tokens, usage (`account-panel-en.ts`). */
  accountPanel,
};
