import { NO_BROWSER, NO_FFMPEG } from "@meltemi/diagrams-capture";

/**
 * The words of the extension at run time, in English: messages and their buttons, pickers,
 * progress, the output channel and the canvas page's title. Sentences with values are functions,
 * so each language builds its own grammar.
 */
export const en = {
  /** Words that more than one command shows. */
  common: {
    openMeltemiFirst: "Open a .meltemi file first.",
    saveBeforeExporting: "Save the file before exporting it.",
    noDiagramToExport: "The file has no diagram to export.",
    showProblems: "Show Problems",
    /** The files a command wrote, by name. */
    wrote: (names: readonly string[]) => `Wrote ${names.join(", ")}.`,
  },
  /** The canvas page and the edits of the project it asks for. */
  canvas: {
    title: "Meltemi Canvas",
    textChanged: "The text changed; the canvas shows it again.",
    saveBeforeImages: "Save the file before adding images to it.",
    saveBeforeProjectThemes: "Save the file in a project before editing project themes.",
    projectNotWritten: "The project's files could not be written.",
    themeCreated: (theme: string) =>
      `Created the project's theme \`${theme}\` in themes/${theme}.meltemi.`,
    fileNotChanged: (file: string) => `${file} could not be changed.`,
    themeChanged: (file: string) => `Changed the theme in ${file}.`,
  },
  /** The picker of images for the canvas. */
  pickers: {
    useImage: "Use Image",
    images: "Images",
    imageOutside: (root: string) =>
      `The image must be inside the project folder (${root}); copy it there first.`,
  },
  /** Exports: SVG, PNG and PDF, videos, HTML players and export profiles. */
  exports: {
    allEvents: "All events",
    allEventsDetail: "every branch and one pass of each loop",
    exportDiagram: (diagram: string) => `Export ${diagram}`,
    scenarioPlaceholder: "Export every event or one scenario",
    /** Diagrams left out because of problems, and the files written all the same. */
    notExported: (skipped: readonly string[], written: readonly string[]) =>
      `Not exported, because of problems: ${skipped.join(", ")}.${written.length > 0 ? ` Wrote ${written.join(", ")}.` : ""}`,
    player: "Export HTML Player",
    playerPlaceholder: "The story or diagram to play",
    story: "Story",
    diagramAndEffects: "Diagram and its effects",
    nothingToPlay: "The file has no story or diagram to export.",
    cannotDraw: (id: string) => `\`${id}\` cannot be drawn because of problems.`,
    noBrowser: NO_BROWSER,
    noFfmpeg: NO_FFMPEG,
    recording: (file: string) => `Recording ${file}`,
    frame: (done: number, total: number) => `frame ${done} of ${total}`,
    videoFailed: (reason: string) => `The video export failed: ${reason}`,
    exportingWithBrowser: "Exporting with the browser…",
    failed: (reason: string) => `The export failed: ${reason}`,
    video: "Export Video",
    formatPlaceholder: "The format",
    /** The description of a story without a title. */
    storyDescription: "story",
    diagramEffects: (type: string) => `${type} diagram and its effects`,
    videoPlaceholder: "The story or diagram",
    durationPrompt: "The effects repeat forever (or there are none); how long is the video?",
    durationInvalid: "A time such as 5s or 2500ms",
    noProfile: "The file has no export profile; write `export <id> for <diagram> { format png }`.",
    allProfiles: "All profiles",
    profileOf: (format: string, target: string) => `${format} of ${target}`,
    profile: "Run Export Profile",
    profilePlaceholder: "The profile to write",
  },
  /** The catalog of a project. */
  catalog: {
    openProjectFirst: "Open a .meltemi file or a folder of a project first.",
    building: "Building the catalog",
    failed: (reason: string) => `The catalog failed: ${reason}`,
    skipped: (file: string, id: string, reason: string) => `${file}#${id} was skipped: ${reason}.`,
    empty: "The project has no diagram or story to catalog.",
    written: (path: string, diagrams: number, stories: number) =>
      `Wrote ${path} (${diagrams} diagram${diagrams === 1 ? "" : "s"}, ${stories} stor${stories === 1 ? "y" : "ies"}).`,
    openInBrowser: "Open in Browser",
  },
  /** Commands that change the diagram or open its model. */
  commands: {
    fixBeforeArranging: "Fix the problems of the diagram before arranging it.",
    positionsWritten: "Every position is already written.",
    noModelView: "Show a C4 view whose model resolves to open the model.",
    noFlowDiagram: "Show a flow diagram without problems to convert it.",
  },
  /** AI assistance. */
  assist: {
    openSettings: "Open Settings",
    setKey: "Set AI Key",
    send: "Send",
    nothingToChange: (summary: string) => `Nothing to change${summary ? `: ${summary}` : "."}`,
    /** The title of the proposal's diff. */
    proposal: (name: string) => `Proposal: ${name}`,
    /** The title of the choice of changes. */
    choose: (summary: string, problems: boolean) =>
      `${summary || "Proposal"}${problems ? " (with problems)" : ""}`,
    choosePlaceholder: "Choose the changes to apply",
    leftOut: (items: readonly number[]) =>
      `Items ${items.join(", ")} changed since the proposal and were left out.`,
    notApplied: (problems: readonly string[]) =>
      `The proposal was not applied: ${problems.join("; ")}`,
    openSavedFirst: "Open a saved .meltemi file first.",
    modify: "Modify with AI",
    modifyPrompt: "What should change? Such as: add a cache between the API and the database",
    asking: (model: string) => `Asking ${model}`,
    failed: (reason: string) => `The assistant failed: ${reason}`,
    generate: "Generate a diagram with AI",
    generatePrompt: "Describe the diagram, such as: the checkout of an online shop with payments",
    startFrom: "Start from",
    /** What each kind of diagram a generated sheet starts from draws. */
    profiles: {
      flow: "Boxes and arrows",
      c4: "A model and its views",
      sequence: "Messages in time",
      free: "A slide composed freely",
    },
    openProjectFirst: "Open a file or folder of a project first.",
    /** What replaces the command line's `--before <path>` in a reason from Git. */
    commandLine: "the command line",
    nothingChanged: "Nothing changed since the last commit.",
    /** The heading of the explanation. */
    changesSince: (base: string) => `Changes since ${base}`,
    key: "AI key",
    keyPrompt: "The key of the AI provider; kept in VS Code's secret storage, never in files",
    keyStored: "The AI key is stored.",
    keyRemoved: "The AI key is removed.",
  },
  /** Imports from Mermaid, PlantUML and Markdown. */
  importer: {
    /** The output channel of the import reports. */
    channel: "Meltemi Import",
    /** The file types of the open dialog. */
    filter: "Mermaid, PlantUML and Markdown",
    import: "Import",
    importFile: "Import from Mermaid or PlantUML",
    cannotRead: (path: string, reason: string) => `Cannot read ${path}: ${reason}`,
    selectFirst: "Select Mermaid or PlantUML text first.",
    importSelection: "Import Selection as Meltemi Diagram",
    selectionLanguage: "Which language is the selection written in?",
    saveSheet: "Save the imported sheet",
    nothingImported: (file: string, reason: string) =>
      `Nothing could be imported from ${file}: ${reason}`,
    unknownError: "unknown error",
    exists: (file: string) => `${file} already exists.`,
    mergeOrReplace:
      "Merge keeps its placement, styles and other adjustments; Replace starts again from the source.",
    merge: "Merge",
    replace: "Replace",
    partial: (file: string) =>
      `${file} was imported partially: something essential could not be imported.`,
    showFindings: "Show Findings",
    /** The first line of an import's report in the output channel. */
    report: (source: string, target: string, status: string) =>
      `Import of ${source} → ${target}: ${status}`,
    /** How much of a diagram the import kept, in the output channel. */
    coverage: (diagram: string, mapped: number, approximated: number, dropped: number) =>
      `${diagram}: ${mapped} mapped, ${approximated} approximated, ${dropped} dropped`,
  },
  /** The Problems view. */
  problems: {
    /** A hint under the message of a diagnostic. */
    hint: (hint: string) => `Hint: ${hint}`,
  },
};
