import { list, plural } from "@meltemi/diagrams-i18n";

const files = (n: number) => `${n} ${plural("en", n, { one: "file", other: "files" })}`;

/**
 * The words of the explorer (`project-explorer`): the tree and its actions, the project switcher
 * and its panel, New project and Import project. The page's `en` catalog holds them as `explorer`;
 * `explorer-es.ts` has the same entries in Spanish.
 */
export const explorer = {
  /** The pane, its tree and its footer. */
  pane: {
    label: "Explorer",
    files: "Files",
    tree: "Files of the project",
    show: "Show the explorer",
    hide: "Hide the explorer",
    width: "Width of the explorer",
    newDiagram: "New diagram…",
    newFolder: "New folder…",
    newFile: "New file…",
    collapseAll: "Collapse the folders",
    showAll: "Show all files",
    showAllHint: "Also lists project.json, the lock file, fonts and other files",
    hiddenProblems: (n: number) =>
      n === 1 ? "1 hidden file has problems" : `${n} hidden files have problems`,
    showHidden: "Show",
    empty: "No diagrams yet.",
    more: (name: string) => `More actions for ${name}`,
    counts: (errors: number, warnings: number) =>
      errors > 0
        ? `${errors} ${plural("en", errors, { one: "error", other: "errors" })}`
        : `${warnings} ${plural("en", warnings, { one: "warning", other: "warnings" })}`,
    /** What each picture of the tree stands for, for screen readers. */
    kinds: {
      folder: "Folder",
      flow: "Flow diagram",
      free: "Free composition",
      sequence: "Sequence diagram",
      c4: "C4 view",
      model: "Model",
      story: "Story",
      theme: "Theme",
      image: "Image",
      settings: "Project settings",
      file: "File",
    },
  },

  /** The context menu of a row, and of the tree's empty space. */
  menu: {
    label: (name: string) => `Actions for ${name}`,
    root: "Actions for the project",
    open: "Open",
    newDiagram: "New diagram…",
    newFolder: "New folder…",
    newFile: "New file…",
    rename: "Rename",
    moveTo: "Move to…",
    duplicate: "Duplicate",
    download: "Download",
    delete: "Delete",
  },

  /** The dialogs of the tree's actions, the names they take and what they say once done. */
  actions: {
    newDiagramTitle: "New diagram",
    newFolderTitle: "New folder",
    newFileTitle: "New file",
    name: "Name",
    diagramHint: "The file's name; the diagram takes it as its title.",
    folderHint: "The folder is listed until you leave the page; it stays once a diagram is in it.",
    fileHint: "Such as notes.md or data.json.",
    kind: "Kind",
    kinds: {
      flow: "Flow diagram",
      free: "Free composition",
      sequence: "Sequence diagram",
    },
    where: (folder: string) => (folder === "" ? "In the project's root" : `In ${folder}`),
    create: "Create",
    renameLabel: (name: string) => `New name for ${name}`,
    moveTitle: (what: string) => `Move ${what}`,
    moveMany: (n: number) => files(n),
    moveTo: "To the folder",
    root: "The project's root",
    newFolder: "Or a new folder in it",
    move: "Move",
    deleteFileTitle: "Delete the file?",
    deleteFile: (path: string) =>
      `${path} is removed from the project. Undo does not bring it back.`,
    deleteFolderTitle: "Delete the folder?",
    deleteFolder: (folder: string, n: number) =>
      `${folder} and its ${files(n)} are removed from the project. Undo does not bring them back.`,
    deleteConfirm: "Delete",
    empty: "Give it a name.",
    invalid: "A name cannot start with a dot or hold /, \\ or :.",
    extension: "Keep the file's extension.",
    editable: "The playground edits .meltemi, .json and .md files.",
    exists: (path: string) => `${path} exists.`,
    itself: "A folder cannot move into itself.",
    created: (path: string) => `Created ${path}.`,
    madeFolder: (folder: string) => `Made the folder ${folder}. Add a diagram to keep it.`,
    renamed: (from: string, to: string) => `Renamed ${from} to ${to}.`,
    moved: (n: number, folder: string) =>
      `Moved ${files(n)} to ${folder === "" ? "the project's root" : folder}.`,
    importsFollow: (paths: readonly string[]) => ` Updated the imports in ${list("en", paths)}.`,
    importsSkipped: (paths: readonly string[]) =>
      ` ${list("en", paths)} could not be read, so ${paths.length === 1 ? "its" : "their"} imports were not changed.`,
    notMoved: (path: string) => `${path} exists; nothing was moved.`,
    duplicated: (path: string) => `Made a copy: ${path}.`,
    deleted: (path: string) => `Deleted ${path}.`,
    deletedFolder: (folder: string, n: number) => `Deleted ${folder} and its ${files(n)}.`,
    downloaded: (name: string) => `Downloaded ${name}.`,
    added: (paths: readonly string[]) => `Added ${list("en", paths)}.`,
    noneAdded: "None of the files can be added to the project.",
  },

  /** The switcher in the explorer's header: the open project, where it lives, its name. */
  switcher: {
    open: (name: string) => `Projects: ${name} is open`,
    rename: "Rename the project",
    renameTitle: "Rename the project",
    renameLabel: "Name",
    renamed: (name: string) => `Renamed the project to ${name}.`,
    untitled: "Untitled project",
    browser: "This browser",
    viewOnly: "View only",
    settingsMissing: "The project had no project.json; it has one now.",
  },

  /** The panel the switcher opens: the actions on projects and the projects themselves. */
  panel: {
    title: "Projects",
    newProject: "New project…",
    importProject: "Import project…",
    exportProject: "Export project (.zip)",
    saveToCloud: "Save this project to the cloud",
    settings: "Project settings",
    browser: "This browser",
    browserHint: "Kept in this browser only",
    openNow: "Open now",
    openLocal: (name: string) => `Open ${name}, the project of this browser`,
    previous: "Previous project",
    previousHint: "What a template, an archive or a link replaced",
    restore: "Restore",
    cloud: "In the cloud",
    signInLine: "Sign in to keep projects in your account and open them on every device.",
    signIn: "Sign in",
    filter: "Filter the projects",
    noMatch: "No project matches.",
    close: "Close",
  },

  /** New project: a name and the cards of the templates. */
  newProject: {
    title: "New project",
    name: "Name",
    nameHint: "From 1 to 100 characters.",
    templates: "Start from",
    where: "Where",
    inCloud: "In your account",
    inCloudHint: "It opens on every device and can be shared.",
    inBrowser: "In this browser",
    inBrowserHint:
      "It replaces the project of this browser; your work there is kept as the previous project.",
    create: "Create the project",
    created: (name: string) => `Created ${name}.`,
  },

  /** Import project: an archive and where it goes. */
  importProject: {
    title: "Import a project",
    summary: (archive: string, name: string | undefined, n: number) =>
      `${archive}: ${name === undefined ? "a project" : `the project ${name}`}, ${files(n)}.`,
    destination: "Where it goes",
    newCloud: "A new project in your account",
    newCloudHint: "Its files, images and fonts are uploaded, and the project opens.",
    browser: "This browser",
    browserHint:
      "It replaces the project of this browser; your work there is kept as the previous project.",
    replace: (name: string) => `Replace the files of ${name}`,
    replaceHint:
      "Every file of the open project is replaced by the archive's. Download the project first to keep a copy.",
    name: "Name of the new project",
    import: "Import",
    choose: "Choose a project archive",
    noFiles: (archive: string) => `${archive} holds no file of a project.`,
    imported: (archive: string, n: number) => `Imported ${archive}: ${files(n)}.`,
  },
};
