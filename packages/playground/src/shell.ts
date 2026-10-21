import type { CanvasApp } from "@meltemi/diagrams-canvas";
import { definition, formatDocument, rename, setJsonField } from "@meltemi/diagrams-editor";
import { LOCALES, getLocale, resolveLocale } from "@meltemi/diagrams-i18n";
import {
  LANGUAGE_VERSION,
  applyTextEdits,
  type Diagnostic,
  type Range,
  type TextEdit,
} from "@meltemi/diagrams-language";
import { MANIFEST_NAME, templateManifest } from "@meltemi/diagrams-project";
import { mountCanvas } from "./canvas-host.js";
import { accountControl } from "./cloud/account.js";
import { planOpen } from "./cloud/address.js";
import { CloudController, manifestName, type CloudEnvironment } from "./cloud/controller.js";
import { explainFailure } from "./cloud/explain.js";
import { CLOUD_ICON } from "./cloud/icons.js";
import { mountCloudExtras } from "./cloud/mount.js";
import { openShareDialog } from "./cloud/share.js";
import type { Session } from "./cloud/session.js";
import { announcement, statusText, type ConnectionStatus } from "./cloud/status.js";
import { viewBar, type ViewBar } from "./cloud/view-bar.js";
import type { ViewState } from "./cloud/view-mode.js";
import { viewerStatusWords } from "./cloud/view-model.js";
import { ViewPage, type ViewEnvironment } from "./cloud/view-page.js";
import { CodePane, type CodeLanguage } from "./code/pane.js";
import {
  aboutDialog,
  confirmDialog,
  continueDialog,
  importDialog,
  shareDialog,
} from "./dialogs.js";
import { openExportDialog, writePlayer } from "./exports/dialog.js";
import {
  downloadCatalog,
  downloadModel,
  downloadProject,
  downloadSource,
} from "./exports/files.js";
import {
  Explorer,
  EXPLORER_WIDTH,
  type ExplorerHost,
  type ExplorerSettings,
} from "./explorer/explorer.js";
import { EXPLORER_ICONS } from "./explorer/icons.js";
import { importProject } from "./explorer/import.js";
import { openNewProject } from "./explorer/new-project.js";
import { cleanPath, isImagePath, isTextPath } from "./files.js";
import { LANGUAGE_NAMES, languageChoice, type LanguageChoice } from "./language.js";
import type { LazyFiles } from "./lazy.js";
import { menuButton, type MenuEntry } from "./menu.js";
import { messages } from "./messages/index.js";
import { ShareError, decodeShare, sharedValue } from "./share.js";
import {
  KEPT_IMAGE_BYTES,
  STORE_KEYS,
  forget,
  keepProject,
  keepProjectIfCurrent,
  keptProject,
  loadSettings,
  saveSettings,
  type Settings,
} from "./store.js";
import type { OpenAnalysis, Studio } from "./studio.js";
import {
  isTemplate,
  templateEntry,
  templateTitle,
  type Template,
  type TemplateSet,
} from "./templates.js";
import { ICONS, announce, chooseFiles, command, h, icon, iconButton, liveRegion } from "./ui.js";

export interface PlaygroundOptions {
  readonly version: string;
  readonly templates: TemplateSet;
  readonly fonts: LazyFiles;
  readonly assets: LazyFiles;
  /** The page's own address, without the fragment. */
  readonly page: string;
  /** Who the page is for: a person signed in at the identity service, or nobody. */
  readonly session: Session;
  /**
   * The browser's parts the cloud projects use (the socket, IndexedDB, storage, the address bar).
   * Given only where a person can be signed in; without it, or without a person, the page has no
   * trace of the cloud.
   */
  readonly cloud?: CloudEnvironment;
  /**
   * The browser's parts for opening a project by its link, for a person signed in or not: the
   * page's calls, its clock and its address bar. Nothing is asked of the service until an address
   * names a project.
   */
  readonly view: ViewEnvironment;
}

/** Below this width the code and the canvas are tabs. */
const NARROW = 768;
const KEEP_DELAY = 500;

const languageOf = (path: string): CodeLanguage =>
  path.endsWith(".meltemi") ? "meltemi" : path.endsWith(".json") ? "json" : "plain";

/**
 * The playground page: its header, the files of the project, the code pane with its problems,
 * the canvas, the status line and the keyboard, around a `Studio`.
 */
export class Playground {
  readonly code: CodePane;
  canvas!: CanvasApp;
  readonly settings: Settings;
  /** The explorer: the project switcher and the tree of folders and diagrams. */
  explorer!: Explorer;
  /** The open file's place in the project, above the code. */
  private readonly codePath = h("div", { class: "code-path", "aria-live": "off" });
  private readonly codeHost = h("div", { class: "code-host" });
  private readonly preview = h("figure", { class: "image-preview", hidden: true });
  private readonly problemsTitle = h("h2", { id: "problems-title" }, messages().problems.title);
  private readonly problemList = h("ul", { class: "problem-list" });
  private readonly others = h("ul", { class: "problem-list others" });
  private readonly statusText = h("span", { class: "status-text" });
  /** The status line's note that the work stays in the browser: not true of a cloud project. */
  private privacy!: HTMLElement;
  /** The open cloud project's connection: saved, saving, offline, reconnecting. */
  private readonly connection = h("span", { class: "cloud-status", hidden: true });
  private shownConnection: ConnectionStatus | undefined;
  /** The page's cloud projects, for a person who is signed in. */
  readonly cloud: CloudController | undefined;
  /**
   * Where the header shows what only a cloud project has (the versions panel's button, say): beside
   * the Projects button, and hidden while no cloud project is open. Another module appends its
   * controls here and follows `cloud.subscribe`.
   */
  readonly cloudSlot = h("span", { class: "cloud-actions", hidden: true });
  /** Whether a cloud project is the one open: the browser's own copy of the anonymous one rests. */
  private cloudActive = false;
  /** The text file the code pane shows, so that the same file is not reopened under the caret. */
  private shownPath: string | undefined;
  private readonly panes = h("main", { class: "panes" });
  private readonly tabs = h("div", {
    class: "view-tabs",
    role: "tablist",
    "aria-label": messages().header.views,
  });
  private readonly undoButton = iconButton("undo", messages().header.undo);
  private readonly redoButton = iconButton("redo", messages().header.redo);
  private keepTimer: ReturnType<typeof setTimeout> | undefined;
  /** Whether the person edited the anonymous project since it was last kept or loaded here. */
  private unkept = false;
  private problemsTimer: ReturnType<typeof setTimeout> | undefined;
  private keepWarned = false;
  private previewUrl: string | undefined;
  private view: "files" | "code" | "canvas" = "code";
  /** The problems last announced, so that screen readers hear changes only. */
  private announced = "";
  /** Viewing a project by its link: the mode, the snapshot, opening an address and the copies. */
  readonly viewing: ViewPage;
  /** The header's badge and copies and the status bar's reload hint; made when view mode is first entered. */
  private viewControls: ViewBar | undefined;
  /** The buttons that edit the project: off in view mode. */
  private readonly editControls: HTMLElement[] = [];
  /** Whether the reload hint was already said to screen readers. */
  private staleSaid = false;

  constructor(
    readonly root: HTMLElement,
    readonly studio: Studio,
    readonly options: PlaygroundOptions,
  ) {
    this.settings = loadSettings();
    this.applyTheme();
    this.code = new CodePane({
      typed: (text, before, after) =>
        studio.setText(studio.open, text, { typing: true, before, after }),
      edit: (edits, after) => this.applyEdits(new Map([[studio.open, edits]]), after),
      caret: (offset) => studio.caret(offset),
      analysis: () => studio.document(),
      format: () => this.format(),
      rename: (offset, newId) => this.rename(offset, newId),
      definition: (offset) => this.definition(offset),
    });
    // Cloud projects exist only for a person signed in with a cookie; nobody else gets any of it.
    if (options.session.kind === "cookie" && options.cloud) {
      this.cloud = new CloudController(options.cloud, {
        studio,
        templates: () => this.templates,
        selection: () => this.code.selection(),
        words: () => messages().cloud,
        report: (message) => this.status(message),
        status: (status) => this.showConnection(status),
        changed: (project) => this.cloudChanged(project !== undefined),
        // Nothing open yet (the page is starting) has nothing to keep: an empty project must never
        // replace the work the browser holds.
        keepLocal: () => {
          if (this.studio.host.paths().length > 0) this.keepNow({ edited: false });
        },
        showLocal: () => this.openAnonymous(),
        undoChanged: () => this.updateUndo(),
        localFiles: () => this.files(),
        // What the person is to the project decides the mode: a viewer's page edits nothing.
        access: (access) => this.viewing.access(access),
      });
    }
    this.viewing = new ViewPage({
      studio,
      cloud: this.cloud,
      environment: options.view,
      words: () => messages(),
      report: (message) => this.status(message),
      files: () => this.files(),
      keptWork: () => keptProject(STORE_KEYS.project),
      templates: () => this.templates,
      isTemplate,
      confirm: confirmDialog,
      showLocal: () => this.openAnonymous(),
      replaceProject: (files, open) => this.replaceProject(files, open),
    });
    this.build();
    // View mode: the code pane, the buttons and the canvas follow the Studio's flag, the header
    // follows what is being viewed.
    studio.listen({ readOnly: (on) => this.showReadOnly(on) });
    this.viewing.mode.listen((state) => this.showView(state));
    studio.listen({
      files: () => {
        this.showFile();
        if (this.studio.open !== "") this.cloud?.rememberOpen(this.studio.open);
      },
      text: (path, text, selection) => {
        if (path === studio.open) this.code.setText(text, selection);
      },
      changed: () => this.scheduleKeep(),
      analysis: (analysis) => this.showAnalysis(analysis),
      reveal: (range) => {
        this.code.reveal(range.start, range.end, range.focus);
        if (range.focus) this.show("code");
      },
      status: (message) => this.status(message),
    });
    // The versions button and the thumbnail: only for a person signed in, and only while a cloud
    // project is open.
    if (this.cloud) mountCloudExtras(this, this.cloud);
  }

  get templates(): readonly Template[] {
    return this.options.templates.templates;
  }

  // Layout ------------------------------------------------------------------------------------

  private build(): void {
    const root = this.root;
    root.classList.remove("loading");
    root.classList.add("shell");
    root.replaceChildren();
    const m = messages();

    const brand = h(
      "div",
      { class: "brand" },
      h("img", { src: "favicon.svg", alt: "", width: 22, height: 22 }),
      h("span", { class: "brand-name" }, "Meltemi Diagrams"),
      h("span", { class: "brand-tag" }, m.header.tag),
    );
    const open = iconButton("open", m.header.open, { text: true, title: m.header.openTitle });
    open.addEventListener("click", () => void this.openLocal());
    const importButton = iconButton("import", m.header.import, {
      text: true,
      title: m.header.importTitle,
    });
    importButton.addEventListener("click", () => importDialog(this));
    this.undoButton.addEventListener("click", () => this.undo());
    this.redoButton.addEventListener("click", () => this.redo());
    const format = iconButton("format", m.header.format);
    format.addEventListener("click", () => this.format());
    const share = iconButton("share", m.header.share, { text: true, title: m.header.shareTitle });
    // A cloud project offers its own link and its people, and so does a project that is only shown to
    // view by its link (nobody signed in included); the anonymous project's dialog is the `#p=` one.
    share.addEventListener("click", () =>
      this.cloud?.current() !== undefined || this.viewing.mode.active
        ? openShareDialog(this)
        : shareDialog(this),
    );
    const exportButton = iconButton("export", m.header.export, {
      text: true,
      title: m.header.exportTitle,
    });
    exportButton.addEventListener("click", () => openExportDialog(this));
    const theme = iconButton(this.dark() ? "sun" : "moon", m.header.theme);
    theme.addEventListener("click", () => {
      this.settings.theme = this.dark() ? "light" : "dark";
      saveSettings(this.settings);
      this.applyTheme();
      theme.replaceChildren(icon(ICONS[this.dark() ? "sun" : "moon"]));
    });
    const about = iconButton("info", m.header.about);
    about.addEventListener("click", () => aboutDialog(this));
    const language = LANGUAGE_NAMES[getLocale()];

    const actions = h(
      "nav",
      { class: "actions", "aria-label": m.header.actions },
      // Signed in: what only an open cloud project has (its versions, its people).
      ...(this.cloud
        ? [this.cloudSlot, h("span", { class: "separator cloud-separator", role: "presentation" })]
        : []),
      open,
      importButton,
      h("span", { class: "separator", role: "presentation" }),
      this.undoButton,
      this.redoButton,
      format,
      h("span", { class: "separator", role: "presentation" }),
      share,
      exportButton,
      menuButton({ id: "download", label: m.header.download, icon: "download" }, () =>
        this.downloadMenu(),
      ),
      h("span", { class: "separator", role: "presentation" }),
      theme,
      about,
      menuButton(
        {
          id: "language",
          label: language,
          icon: "language",
          name: m.language.button(language),
          menu: m.language.menu,
        },
        () => this.languageMenu(),
      ),
      h("span", { class: "separator", role: "presentation" }),
      // Nobody signed in: a "Sign in" link. A person: their avatar and name, and a menu.
      accountControl(this.options.session, {
        keep: () => void this.keepNow({ edited: false }),
        // Where cloud projects exist, the menu shows what the account holds.
        ...(this.cloud ? { usage: this.cloud.usage } : {}),
      }),
    );
    const header = h("header", { class: "topbar" }, brand, actions);

    // View tabs for narrow screens.
    for (const [view, label] of [
      ["files", m.explorer.pane.files],
      ["code", m.header.code],
      ["canvas", m.header.canvas],
    ] as const) {
      const tab = h(
        "button",
        {
          type: "button",
          role: "tab",
          id: `tab-${view}`,
          "aria-controls": view === "files" ? "explorer" : `${view}-pane`,
          "aria-selected": view === this.view ? "true" : "false",
          class: "view-tab",
        },
        icon(view === "files" ? EXPLORER_ICONS.folder : ICONS[view === "code" ? "code" : "canvas"]),
        label,
      );
      tab.addEventListener("click", () => this.show(view));
      tab.addEventListener("keydown", (e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          const order = ["files", "code", "canvas"] as const;
          const step = e.key === "ArrowLeft" ? order.length - 1 : 1;
          this.show(order[(order.indexOf(this.view) + step) % order.length]!);
          (this.tabs.querySelector(`#tab-${this.view}`) as HTMLElement | null)?.focus();
        }
      });
      this.tabs.append(tab);
    }

    // Code pane: where the open file is, the code and the problems. The files are the explorer's.
    // What edits the project: off while the page only shows it (view mode).
    this.editControls.push(open, importButton, format);
    this.codeHost.append(this.code.element, this.preview);
    const help = h("p", { id: "code-help", class: "sr-only" }, m.code.help);
    const problems = h(
      "section",
      { class: "problems", "aria-labelledby": "problems-title" },
      this.problemsTitle,
      this.problemList,
      this.others,
    );
    const codePane = h(
      "section",
      { id: "code-pane", class: "pane code-pane", role: "tabpanel", "aria-labelledby": "tab-code" },
      this.codePath,
      this.codeHost,
      help,
      problems,
    );
    const divider = h("div", {
      class: "divider",
      role: "separator",
      tabindex: "0",
      "aria-orientation": "vertical",
      "aria-label": m.code.width,
      "aria-controls": "code-pane",
      "aria-valuemin": "20",
      "aria-valuemax": "80",
    });
    this.dividerBehaviour(divider);
    const canvasRoot = h("div", { id: "app" });
    const canvasPane = h(
      "section",
      {
        id: "canvas-pane",
        class: "pane canvas-pane",
        role: "tabpanel",
        "aria-labelledby": "tab-canvas",
      },
      canvasRoot,
    );
    this.explorer = new Explorer(this.explorerHost());
    this.panes.append(this.explorer.element, this.explorer.edge, codePane, divider, canvasPane);
    this.split(this.settings.split ?? 0.42);

    this.privacy = h("span", { class: "privacy" }, m.status.privacy);
    const status = h(
      "footer",
      { class: "statusbar" },
      this.privacy,
      this.connection,
      this.statusText,
      h("span", { class: "version" }, `Meltemi Diagrams ${this.options.version}`),
    );
    root.append(header, this.tabs, this.panes, status, liveRegion());

    this.canvas = mountCanvas(
      canvasRoot,
      this.studio,
      {
        copy: (text) => void this.copy(text),
        paste: () => this.paste(),
        pickImage: () => this.pickImage(),
        exportDialog: () => openExportDialog(this),
        exportPlayer: (story) => void writePlayer(this, story),
        openModel: () => this.openModel(),
      },
      {
        get: () => this.settings.canvas as never,
        set: (state) => {
          this.settings.canvas = state;
          saveSettings(this.settings);
        },
      },
    );

    document.addEventListener("keydown", (e) => this.onKey(e));
    if (this.cloud) {
      // The connection changes with the network, and the work is kept as the page is left.
      window.addEventListener("online", () => this.cloud?.network());
      window.addEventListener("offline", () => this.cloud?.network());
      window.addEventListener("pagehide", () => this.cloud?.flush());
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") this.cloud?.flush();
        else this.cloud?.network();
      });
    }
    const narrow = window.matchMedia(`(max-width: ${NARROW - 1}px)`);
    const layout = () => root.classList.toggle("narrow", narrow.matches);
    narrow.addEventListener("change", layout);
    layout();
    this.show("code");
    window.addEventListener("hashchange", () => void this.openSharedFromHash());
  }

  /** Shows the code or the canvas on narrow screens. */
  /** Shows the files, the code or the canvas on narrow screens. */
  show(view: "files" | "code" | "canvas"): void {
    this.view = view;
    this.root.dataset.view = view;
    for (const tab of this.tabs.querySelectorAll("[role=tab]")) {
      tab.setAttribute("aria-selected", tab.id === `tab-${view}` ? "true" : "false");
      tab.setAttribute("tabindex", tab.id === `tab-${view}` ? "0" : "-1");
    }
  }

  /** The code's share of the width the explorer leaves, from 0.2 to 0.8. */
  private split(fraction: number): void {
    const value = Math.min(0.8, Math.max(0.2, fraction));
    this.panes.style.setProperty("--split", String(value));
    this.panes
      .querySelector(".divider")
      ?.setAttribute("aria-valuenow", String(Math.round(value * 100)));
    this.settings.split = value;
  }

  private dividerBehaviour(divider: HTMLElement): void {
    divider.addEventListener("pointerdown", (e) => {
      divider.setPointerCapture(e.pointerId);
      // The code starts after the explorer; the divider shares what is left with the canvas.
      const code = this.panes.querySelector(".code-pane")!.getBoundingClientRect();
      const right = this.panes.getBoundingClientRect().right;
      document.documentElement.classList.add("resizing");
      const move = (event: PointerEvent) =>
        this.split((event.clientX - code.left) / Math.max(1, right - code.left - 6));
      const up = () => {
        divider.removeEventListener("pointermove", move);
        divider.removeEventListener("pointerup", up);
        document.documentElement.classList.remove("resizing");
        saveSettings(this.settings);
      };
      divider.addEventListener("pointermove", move);
      divider.addEventListener("pointerup", up);
    });
    divider.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      this.split((this.settings.split ?? 0.42) + (e.key === "ArrowLeft" ? -0.05 : 0.05));
      saveSettings(this.settings);
    });
  }

  private dark(): boolean {
    return (
      this.settings.theme === "dark" ||
      (this.settings.theme === undefined &&
        window.matchMedia("(prefers-color-scheme: dark)").matches)
    );
  }

  private applyTheme(): void {
    if (this.settings.theme) document.documentElement.dataset.theme = this.settings.theme;
    else delete document.documentElement.dataset.theme;
  }

  // Menus -------------------------------------------------------------------------------------

  private downloadMenu(): (MenuEntry | "-")[] {
    const m = messages().download;
    const meltemi = this.studio.open.endsWith(".meltemi");
    return [
      {
        label: m.source,
        detail: this.studio.open || m.noFile,
        disabled: !isTextPath(this.studio.open),
        run: () => downloadSource(this),
      },
      {
        label: m.project,
        detail: m.projectDetail,
        run: () => void downloadProject(this),
      },
      {
        label: m.model,
        detail: m.modelDetail,
        disabled: !meltemi,
        run: () => downloadModel(this),
      },
      {
        label: m.catalog,
        detail: m.catalogDetail,
        run: () => void downloadCatalog(this),
      },
      "-",
      {
        label: m.continue,
        detail: m.continueDetail,
        run: () => continueDialog(this),
      },
    ];
  }

  /** The interface languages: the browser's, or one of the product's, each by its own name. */
  private languageMenu(): MenuEntry[] {
    const m = messages().language;
    const chosen = languageChoice(this.settings.language);
    return [
      {
        label: m.auto,
        detail: m.autoDetail(resolveLocale(navigator.language)),
        checked: chosen === "auto",
        run: () => void this.chooseLanguage("auto"),
      },
      ...LOCALES.map((locale) => ({
        label: LANGUAGE_NAMES[locale],
        lang: locale,
        checked: chosen === locale,
        run: () => void this.chooseLanguage(locale),
      })),
    ];
  }

  /**
   * Keeps a new interface language and reloads the page in it. The project and its open file are
   * kept in the browser first, so the page opens them again; without storage nothing changes, and
   * images too large to keep are named first.
   */
  private async chooseLanguage(choice: LanguageChoice): Promise<void> {
    const before = this.settings.language;
    if (languageChoice(before) === choice) return;
    const large = [...this.files()]
      .filter(([, content]) => typeof content !== "string" && content.length > KEPT_IMAGE_BYTES)
      .map(([path]) => path);
    if (large.length > 0) {
      const m = messages().language;
      if (!(await confirmDialog(m.confirmTitle, m.confirmMessage(large), m.confirm))) return;
    }
    this.settings.language = choice;
    if (!saveSettings(this.settings) || this.keepNow({ edited: false }) !== "kept") {
      // The reload would lose the work, and the page would not remember the language anyway.
      this.settings.language = before;
      saveSettings(this.settings);
      this.status(messages().language.unavailable);
      return;
    }
    location.reload();
  }

  // Projects ----------------------------------------------------------------------------------

  /**
   * Opens the first project: the project the address names (the mode follows what the person is to
   * it: the normal page, or view mode, for anyone its link admits, signed in or not), a link's, the
   * kept one, or the flow template. An address that names a project is kept as it is: a reload
   * reopens it, and the sign-in link of a page nobody is signed in on returns to it.
   */
  async start(): Promise<void> {
    const plan = planOpen(location.search);
    let notice: string | undefined;
    if (plan.kind !== "none") {
      notice = await this.viewing.open(plan);
      // The project is open (bound, or shown to view): nothing more to start.
      if (notice === undefined) return;
    }
    if (!(await this.openSharedFromHash())) this.openAnonymous();
    // What the address asked is said after the anonymous project opened, not before.
    if (notice !== undefined) this.status(notice);
  }

  /** Opens the anonymous project: the kept one, or the flow template. */
  private openAnonymous(): void {
    const kept = keptProject(STORE_KEYS.project, { loading: true });
    this.unkept = false;
    if (kept && kept.files.size > 0) {
      this.studio.load(kept.files, kept.open);
      if (kept.skipped?.length) this.status(messages().project.largeImages(kept.skipped));
      return;
    }
    const flow = this.templates.find((t) => t.name === "flow") ?? this.templates[0];
    if (flow) this.loadTemplate(flow);
  }

  // Cloud projects ------------------------------------------------------------------------------

  /** A cloud project was opened or closed: what the page says about where the work is changes. */
  private cloudChanged(active: boolean): void {
    this.cloudActive = active;
    this.privacy.hidden = active;
    this.connection.hidden = !active;
    this.cloudSlot.hidden = !active;
    this.root.dataset.cloud = active ? "open" : "none";
    if (!active) this.showConnection(undefined);
    // The explorer's header names the project that is open now, and where it lives.
    this.explorer?.switcher.update();
  }

  /** Draws the connection of the open cloud project in the status line. */
  private showConnection(status: ConnectionStatus | undefined): void {
    if (!status) {
      this.connection.replaceChildren();
      delete this.connection.dataset.state;
      delete this.connection.dataset.kept;
      this.shownConnection = undefined;
      return;
    }
    // A viewer follows the room and saves nothing: its connection has words of its own.
    const words = this.viewing.mode.active
      ? viewerStatusWords(messages().viewing.status)
      : messages().cloud.status;
    this.connection.dataset.state = status.state;
    this.connection.dataset.kept = String(status.kept);
    this.connection.replaceChildren(
      icon(CLOUD_ICON),
      h("span", { class: "cloud-status-text" }, statusText(status, words)),
    );
    if (status.state === "full") {
      // The page tries again by itself; the person may not want to wait.
      const retry = h("button", { type: "button", class: "cloud-retry" }, words.retry);
      retry.addEventListener("click", () => this.cloud?.network());
      this.connection.append(retry);
    }
    const note = announcement(this.shownConnection, status, words);
    if (note !== undefined) announce(note);
    this.shownConnection = status;
    this.explorer?.switcher.update();
  }

  /** The project as it is, for keeping and sharing. */
  files(): Map<string, string | Uint8Array> {
    const files = new Map<string, string | Uint8Array>();
    for (const path of this.studio.host.paths()) files.set(path, this.studio.host.get(path)!);
    return files;
  }

  /**
   * Replaces the project, keeping the work it replaces as the previous project. A cloud project is
   * not the browser's to keep: its files change in the cloud, and the previous project stays the
   * anonymous one's.
   */
  replaceProject(files: Iterable<readonly [string, string | Uint8Array]>, open?: string): void {
    const current = this.files();
    if (!this.inCloud() && current.size > 0 && !isTemplate(current, this.templates)) {
      keepProject(STORE_KEYS.previous, { open: this.studio.open, files: current });
    }
    this.studio.load(files, open);
    this.keepNow();
  }

  /**
   * Whether the project in the page is not the anonymous one: a cloud project is open, or one is
   * being viewed by its link. Either way the browser keeps nothing of it, and the anonymous
   * project that rests behind it is never replaced by it.
   */
  inCloud(): boolean {
    return this.cloudActive || this.studio.isBound() || this.viewing.mode.active;
  }

  // The explorer --------------------------------------------------------------------------------

  /** The name of the project that is open: the viewed one's, the cloud project's, or this browser's. */
  projectName(): string {
    const viewed = this.viewing.mode.state;
    if (viewed) return viewed.name;
    const cloud = this.cloud?.openProject;
    if (cloud) return cloud.name;
    return this.localName();
  }

  /** The name the project of this browser goes by: its `project.json`'s, wherever it rests now. */
  private localName(): string {
    const files = this.inCloud()
      ? (keptProject(STORE_KEYS.project)?.files ?? new Map<string, string | Uint8Array>())
      : this.files();
    return manifestName(files) ?? messages().explorer.switcher.untitled;
  }

  /** A `project.json` for a project that has none, as `init` writes it. */
  private manifestFor(name: string): string {
    return templateManifest(name, "flow", {
      toolVersion: this.options.version,
      languageVersion: LANGUAGE_VERSION,
    });
  }

  /** Renames the open project: the cloud project, or the `name` of this browser's `project.json`. */
  private async renameProject(name: string): Promise<boolean> {
    if (this.viewOnly()) return false;
    const words = messages().explorer.switcher;
    const cloud = this.cloud;
    const open = cloud?.openProject;
    if (cloud && open) {
      const done = await cloud.api.update(open.id, { name });
      if (!done.ok) {
        this.status(explainFailure(done.failure, messages().cloud.errors));
        return false;
      }
      cloud.renamed(open.id, done.value.name);
      this.status(words.renamed(done.value.name));
      return true;
    }
    const text = this.studio.host.text(MANIFEST_NAME);
    if (text === undefined) {
      this.studio.addFiles([[MANIFEST_NAME, this.manifestFor(name)]]);
    } else {
      try {
        this.applyEdits(new Map([[MANIFEST_NAME, setJsonField(text, "name", name)]]));
      } catch {
        // A project.json that is not an object: opened, so that its problem shows.
        this.studio.select(MANIFEST_NAME);
        this.show("code");
        return false;
      }
    }
    this.keepNow();
    this.status(words.renamed(name));
    return true;
  }

  /** Opens `project.json`, made first as `init` writes it when the project has none. */
  private projectSettings(): void {
    if (this.viewOnly()) return;
    if (!this.studio.host.has(MANIFEST_NAME)) {
      this.studio.addFiles([[MANIFEST_NAME, this.manifestFor(this.projectName())]], MANIFEST_NAME);
      this.keepNow();
      this.status(messages().explorer.switcher.settingsMissing);
    } else this.studio.select(MANIFEST_NAME);
    this.show("code");
    this.code.focus();
  }

  /** Opens a file of the project in the code pane; on a narrow screen the code tab shows it. */
  openFile(path: string): void {
    if (path !== this.studio.open) this.studio.select(path);
    this.show("code");
  }

  /** The explorer's settings as kept, within their bounds; a first visit on a small screen gets a rail. */
  private explorerSettings(): ExplorerSettings {
    const kept = this.settings.explorer;
    const width = Number(kept?.width);
    return {
      width: Number.isFinite(width)
        ? Math.min(EXPLORER_WIDTH.max, Math.max(EXPLORER_WIDTH.min, width))
        : EXPLORER_WIDTH.initial,
      collapsed: typeof kept?.collapsed === "boolean" ? kept.collapsed : window.innerWidth < 1100,
      showAll: kept?.showAll === true,
    };
  }

  /** What the explorer asks of the page. */
  private explorerHost(): ExplorerHost {
    const session = this.options.session;
    return {
      studio: this.studio,
      switcher: {
        project: () => {
          const viewed = this.viewing.mode.state;
          const status = this.cloud?.status;
          if (viewed) return { name: viewed.name, where: "view", ...(status ? { status } : {}) };
          const open = this.cloud?.openProject;
          if (open) return { name: open.name, where: "cloud", ...(status ? { status } : {}) };
          return { name: this.localName(), where: "browser" };
        },
        rename: (name) => this.renameProject(name),
        cloud: this.cloud,
        signIn: session.kind === "cookie" ? undefined : session.signIn,
        local: () => ({ name: this.localName(), open: !this.inCloud() }),
        hasPrevious: () => keptProject(STORE_KEYS.previous) !== undefined,
        openLocal: () => this.viewing.leave(),
        restorePrevious: () => void this.restorePrevious(),
        newProject: () =>
          openNewProject({
            templates: this.templates,
            cloud: this.cloud,
            dark: () => this.dark(),
            createLocal: (template, name) => this.createLocal(template, name),
          }),
        importProject: () =>
          void chooseFiles(".zip", false).then(([file]) => file && this.importArchive(file)),
        exportProject: () => void downloadProject(this),
        settings: () => this.projectSettings(),
        readOnly: () => this.studio.readOnly,
      },
      settings: () => this.explorerSettings(),
      saveSettings: (next) => {
        this.settings.explorer = { ...next };
        saveSettings(this.settings);
      },
      layout: (width, collapsed) => {
        this.panes.style.setProperty("--explorer", collapsed ? "36px" : `${width}px`);
        this.root.dataset.explorer = collapsed ? "rail" : "open";
      },
      openFile: (path) => this.openFile(path),
      status: (message) => this.status(message),
      confirm: confirmDialog,
      keep: () => void this.keepNow(),
      addFiles: (files, folder) => this.addLocalFiles(files, folder),
      importArchive: (file) => this.importArchive(file),
    };
  }

  // View mode -----------------------------------------------------------------------------------

  /**
   * Refuses an edit in view mode, saying why in the status line. Every method of the page that
   * edits asks first; the Studio refuses them too, so that nothing slips past a button or a key.
   */
  private viewOnly(): boolean {
    if (!this.studio.readOnly) return false;
    this.status(messages().viewing.readOnly);
    return true;
  }

  /** The Studio entered or left view mode: the code pane, the buttons and the undo follow it. */
  private showReadOnly(on: boolean): void {
    this.code.setReadOnly(on);
    for (const control of this.editControls) (control as HTMLButtonElement).disabled = on;
    this.updateUndo();
  }

  /** What is being viewed changed (undefined: view mode ended): the header and the status bar follow it. */
  private showView(state: ViewState | undefined): void {
    if (state && !this.viewControls) {
      this.viewControls = viewBar({
        copy: () => void this.viewing.makeCopy(),
        save: () => void this.viewing.saveCopy(),
        reload: () => void this.viewing.reload(),
      });
      this.root.querySelector(".topbar .actions")?.prepend(this.viewControls.header);
      this.root.querySelector(".statusbar")?.insertBefore(this.viewControls.hint, this.statusText);
    }
    this.viewControls?.update(state, this.viewing.canSave);
    this.explorer?.switcher.update();
    if (state) this.root.dataset.viewing = state.live ? "live" : "snapshot";
    else delete this.root.dataset.viewing;
    // Nothing of a viewed project is kept in this browser, which the status line's note would say.
    this.privacy.hidden = state !== undefined || this.cloudActive;
    // The reload hint is said once to screen readers, when it appears.
    if (state?.stale && !this.staleSaid) announce(messages().viewing.staleHint);
    this.staleSaid = state?.stale === true;
  }

  private loadTemplate(template: Template): void {
    this.studio.load(Object.entries(template.files), templateEntry(template));
    this.keepNow();
  }

  /**
   * Makes the project of this browser a template's, named `name` in its `project.json`: a cloud
   * project or a viewed one that is open is left first (it stays where it is), and work that
   * differs from every template is asked about, then kept as the previous project. True when done.
   */
  async createLocal(template: Template, name: string): Promise<boolean> {
    // A project shown to view is left from This browser, never by making a project over it.
    if (this.viewOnly()) return false;
    if (this.inCloud()) this.viewing.leave();
    const m = messages().templates;
    const current = this.files();
    if (current.size > 0 && !isTemplate(current, this.templates)) {
      const title = templateTitle(template);
      const yes = await confirmDialog(m.confirmTitle, m.confirmMessage(title), m.confirm);
      if (!yes) return false;
    }
    const files = Object.entries(template.files).map(([path, text]): [string, string] => {
      if (path !== MANIFEST_NAME) return [path, text];
      try {
        return [path, applyTextEdits(text, setJsonField(text, "name", name))];
      } catch {
        return [path, text];
      }
    });
    this.replaceProject(files, templateEntry(template));
    this.status(messages().explorer.newProject.created(name));
    return true;
  }

  /** Brings back the project a template, an archive or a link replaced in this browser. */
  async restorePrevious(): Promise<void> {
    if (this.viewOnly()) return;
    if (this.inCloud()) this.viewing.leave();
    const previous = keptProject(STORE_KEYS.previous);
    if (!previous) return;
    const current = this.files();
    forget(STORE_KEYS.previous);
    if (current.size > 0 && !isTemplate(current, this.templates)) {
      keepProject(STORE_KEYS.previous, { open: this.studio.open, files: current });
    }
    this.studio.load(previous.files, previous.open);
    this.keepNow();
    this.status(messages().templates.restored);
  }

  /** Opens the project of a share link in the address, if there is one; true when it did. */
  async openSharedFromHash(): Promise<boolean> {
    const value = sharedValue(location.hash);
    if (value === undefined) return false;
    history.replaceState(null, "", this.options.page);
    // A link opens as the anonymous project: a cloud project that is open, or one that is being
    // viewed, is left first, and the drawer then offers to save what the link brought.
    if (this.inCloud()) {
      this.cloud?.leaveToLocal();
      this.viewing.leave();
    }
    const m = messages().project;
    try {
      const shared = await decodeShare(value);
      this.replaceProject(Object.entries(shared.files), shared.open || undefined);
      this.status(m.openedShared);
      return true;
    } catch (error) {
      this.status(m.workUnchanged(error instanceof ShareError ? error.message : m.linkUnreadable));
      if (this.studio.host.paths().length === 0) {
        const kept = keptProject(STORE_KEYS.project, { loading: true });
        this.unkept = false;
        if (kept) this.studio.load(kept.files, kept.open);
        else {
          const flow = this.templates.find((t) => t.name === "flow");
          if (flow) this.loadTemplate(flow);
        }
      }
      return true;
    }
  }

  private scheduleKeep(): void {
    clearTimeout(this.keepTimer);
    // A cloud project is kept in its document, not in the slot of the anonymous project.
    if (this.inCloud()) return;
    this.unkept = true;
    this.keepTimer = setTimeout(() => this.keepNow(), KEEP_DELAY);
  }

  /**
   * Keeps the project and its open file in the browser now; says once when it cannot. A cloud
   * project is not kept here (it keeps itself, in IndexedDB and in the room), and the anonymous
   * project that rests behind it is never replaced by it.
   */
  keepNow(options: { edited?: boolean } = {}): ReturnType<typeof keepProject> {
    clearTimeout(this.keepTimer);
    if (this.inCloud()) return "kept";
    const project = { open: this.studio.open, files: this.files() };
    // What does not edit (opening a cloud project, signing in, changing the language) must not
    // put this tab's older copy over what another tab kept meanwhile.
    const result =
      (options.edited ?? true) || this.unkept
        ? keepProject(STORE_KEYS.project, project)
        : keepProjectIfCurrent(STORE_KEYS.project, project);
    if (result === "kept") this.unkept = false;
    if (result !== "kept" && !this.keepWarned) {
      this.keepWarned = true;
      const m = messages().project;
      this.status(result === "full" ? m.noRoom : m.noStorage);
    }
    return result;
  }

  // Files -------------------------------------------------------------------------------------

  /** The open file in the code pane, and its place in the project above it. */
  private showFile(): void {
    const m = messages().files;
    const open = this.studio.open;
    const segments = open === "" ? [] : open.split("/");
    this.codePath.replaceChildren(
      ...segments.flatMap((segment, index) => {
        const last = index === segments.length - 1;
        const part = h("span", { class: last ? "code-path-file" : "code-path-folder" }, segment);
        return index === 0
          ? [part]
          : [h("span", { class: "code-path-sep", "aria-hidden": "true" }, "/"), part];
      }),
    );
    this.codePath.title = open || m.noFile;
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
    this.previewUrl = undefined;
    const content = this.studio.host.get(open);
    if (content instanceof Uint8Array && !isTextPath(open)) {
      this.shownPath = undefined;
      const type = open.endsWith(".png")
        ? "image/png"
        : open.endsWith(".gif")
          ? "image/gif"
          : open.endsWith(".webp")
            ? "image/webp"
            : "image/jpeg";
      this.previewUrl = URL.createObjectURL(
        new Blob([content as Uint8Array<ArrayBuffer>], { type }),
      );
      this.preview.replaceChildren(
        h("img", { src: this.previewUrl, alt: open }),
        h(
          "figcaption",
          {},
          m.preview(open, Math.round(content.length / 1024), open.slice(open.lastIndexOf("/") + 1)),
        ),
      );
      this.preview.hidden = false;
      this.code.element.hidden = true;
    } else {
      this.preview.hidden = true;
      this.code.element.hidden = false;
      // The same file with the same text stays as it is: reopening it would put the caret at the
      // start and the scroll at the top, which a change of another file (or of the file list, as a
      // cloud project's remote changes make) must not do.
      if (this.shownPath !== open || this.code.text !== this.studio.text(open)) {
        this.code.open(this.studio.text(open), languageOf(open), open || m.noFile);
      }
      this.shownPath = open;
    }
    this.updateUndo();
  }

  /**
   * Opens files the person chooses with Open: a project `.zip` goes to the import dialog, which asks
   * where its project goes; `.meltemi`, text and image files are added beside the open file.
   */
  async openLocal(files?: File[]): Promise<void> {
    if (this.viewOnly()) return;
    const chosen =
      files ?? (await chooseFiles(".meltemi,.json,.md,.zip,.png,.jpg,.jpeg,.gif,.webp,.svg"));
    if (chosen.length === 0) return;
    const archive = chosen.find((f) => f.name.toLowerCase().endsWith(".zip"));
    if (archive) {
      this.importArchive(archive);
      return;
    }
    const open = this.studio.open;
    await this.addLocalFiles(
      chosen,
      open.includes("/") ? open.slice(0, open.lastIndexOf("/")) : "",
      true,
    );
  }

  /** Reads a project archive and asks where its project goes (`explorer/import.ts`). */
  importArchive(archive: File): void {
    if (this.viewOnly()) return;
    void importProject(archive, {
      cloud: this.cloud,
      openName: () => this.projectName(),
      localOpen: () => !this.inCloud(),
      readOnly: () => this.studio.readOnly,
      intoBrowser: (files) => {
        if (this.inCloud()) this.viewing.leave();
        this.replaceProject(files);
      },
      replaceOpen: (files) => this.replaceProject(files),
      status: (message) => this.status(message),
    });
  }

  /**
   * Adds files from outside the page into a folder (`""`: the root), asking before one replaces a
   * file of the project. With `beside` (Open), a `.meltemi` file chosen while a root file is open
   * goes to `diagrams/`, and a `project.json` to the root.
   */
  async addLocalFiles(chosen: readonly File[], folder: string, beside = false): Promise<void> {
    if (this.viewOnly()) return;
    const m = messages().project;
    const prefix = folder === "" ? "" : `${folder}/`;
    const added: [string, string | Uint8Array][] = [];
    for (const file of chosen) {
      const name = cleanPath(file.name);
      if (!name) continue;
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (name === MANIFEST_NAME && (beside || folder === "")) {
        added.push([name, new TextDecoder().decode(bytes)]);
      } else if (name.endsWith(".meltemi")) {
        const into = beside && prefix === "" ? "diagrams/" : prefix;
        added.push([`${into}${name}`, new TextDecoder().decode(bytes)]);
      } else if (isImagePath(name)) added.push([`${prefix}${name}`, bytes]);
      else if (isTextPath(name)) added.push([`${prefix}${name}`, new TextDecoder().decode(bytes)]);
    }
    if (added.length === 0) {
      this.status(m.noneOpenable);
      return;
    }
    const replaced = added.filter(([path]) => this.studio.host.has(path)).map(([path]) => path);
    if (replaced.length > 0) {
      const yes = await confirmDialog(m.replaceTitle, m.replaceMessage(replaced), m.replace);
      if (!yes) return;
    }
    if (this.viewOnly()) return;
    const first = added.find(([path]) => path.endsWith(".meltemi"))?.[0];
    this.studio.addFiles(added, first);
    this.keepNow();
    this.status(m.added(added.map(([p]) => p)));
    if (first) this.explorer.reveal(first);
  }

  /** Asks for an image file, adds it beside the open file and returns its relative path. */
  private async pickImage(): Promise<string | undefined> {
    if (this.viewOnly()) return undefined;
    const [file] = await chooseFiles(".png,.jpg,.jpeg,.gif,.webp,.svg", false);
    const name = file && cleanPath(file.name);
    if (!file || !name) return undefined;
    const folder = this.studio.open.includes("/")
      ? this.studio.open.slice(0, this.studio.open.lastIndexOf("/") + 1)
      : "";
    const path = `${folder}${name}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (this.viewOnly()) return undefined;
    const open = this.studio.open;
    this.studio.addFiles([[path, path.endsWith(".svg") ? new TextDecoder().decode(bytes) : bytes]]);
    if (this.studio.open !== open) this.studio.select(open);
    this.keepNow();
    return name;
  }

  private openModel(): void {
    const analysis = this.studio.document();
    const views = analysis?.diagrams.filter((d) => d.diagram.type === "c4") ?? [];
    const view = views.find((d) => d.id === this.studio.session.current) ?? views[0];
    const resolved = view?.diagram.c4?.resolved;
    if (!resolved) {
      this.status(messages().code.noModel);
      return;
    }
    const path = resolved.file === null ? this.studio.open : this.studio.relative(resolved.file);
    if (path === undefined) return;
    this.reveal(path, resolved.definition.idRange);
  }

  /** Opens a file and selects a range of it. */
  reveal(path: string, range: Range): void {
    if (path !== this.studio.open) this.studio.select(path);
    this.code.reveal(range.start.offset, range.end.offset, true);
    this.show("code");
  }

  // Code services -----------------------------------------------------------------------------

  /** Applies edits of several files (relative paths) as one step. */
  applyEdits(
    edits: ReadonlyMap<string, readonly TextEdit[]>,
    after?: { start: number; end: number },
  ): void {
    if (this.viewOnly()) return;
    this.studio.applyEdits(edits, after);
    this.updateUndo();
  }

  private format(): void {
    if (this.viewOnly()) return;
    const analysis = this.studio.document();
    if (!analysis) return;
    const m = messages().code;
    const edits = formatDocument(analysis);
    if (edits.length === 0) {
      this.status(
        analysis.compilation.parse.diagnostics.some((d) => d.severity === "error")
          ? m.syntaxErrors
          : m.alreadyFormatted,
      );
      return;
    }
    this.applyEdits(new Map([[this.studio.open, edits]]));
    this.status(m.formatted);
  }

  private rename(offset: number, newId: string): string | undefined {
    if (this.studio.readOnly) return messages().viewing.readOnly;
    const analysis = this.studio.document();
    if (!analysis) return messages().code.notAnalysed;
    const absolute = this.studio.absolute(this.studio.open);
    const projects = this.studio.projects;
    const project =
      projects.entityRename(absolute, offset, newId) ??
      projects.storyTargetRename(absolute, offset, newId);
    const relativeEdits = (edits: ReadonlyMap<string, readonly TextEdit[]>) => {
      const out = new Map<string, readonly TextEdit[]>();
      for (const [file, list] of edits) {
        const relative = this.studio.relative(file);
        if (relative !== undefined) out.set(relative, list);
      }
      return out;
    };
    if (project) {
      if (!project.ok) return project.reason;
      this.applyEdits(relativeEdits(project.edits));
      return undefined;
    }
    const result = rename(analysis, offset, newId);
    if (!result.ok) return result.rejection.reason;
    const edits = relativeEdits(projects.storyRenames(absolute, result.plan.operation));
    edits.set(this.studio.open, result.plan.edits);
    this.applyEdits(edits);
    return undefined;
  }

  private definition(offset: number): void {
    const analysis = this.studio.document();
    if (!analysis) return;
    const local = definition(analysis, offset);
    if (local) {
      this.code.reveal(local.start.offset, local.end.offset, true);
      return;
    }
    const absolute = this.studio.absolute(this.studio.open);
    const projects = this.studio.projects;
    const found =
      projects.entityDefinition(absolute, offset) ??
      projects.linkDefinition(absolute, offset) ??
      projects.storyDefinition(absolute, offset);
    const path = found && this.studio.relative(found.path);
    if (found && path !== undefined) this.reveal(path, found.range);
    else this.status(messages().code.noDefinition);
  }

  // Problems ----------------------------------------------------------------------------------

  private showAnalysis(analysis: OpenAnalysis): void {
    this.code.setAnalysis(analysis.text, analysis.diagnostics, analysis.document);
    const diagnostics = analysis.diagnostics.filter((d) => d.severity !== "info");
    const errors = diagnostics.filter((d) => d.severity === "error").length;
    const warnings = diagnostics.length - errors;
    const m = messages().problems;
    this.problemsTitle.textContent =
      diagnostics.length === 0 ? m.none : m.summary(errors, warnings);
    this.problemList.replaceChildren(
      ...analysis.diagnostics.slice(0, 200).map((d) => this.problemItem(d)),
    );
    this.root.dataset.problems = String(errors);
    const summary = `${analysis.path}: ${this.problemsTitle.textContent}`;
    if (summary !== this.announced) {
      this.announced = summary;
      announce(summary);
    }
    this.updateUndo();
    clearTimeout(this.problemsTimer);
    this.problemsTimer = setTimeout(() => this.showOtherProblems(), 600);
  }

  private problemItem(d: Diagnostic): HTMLElement {
    const go = h(
      "button",
      { type: "button", class: `problem is-${d.severity}` },
      icon(ICONS[d.severity === "info" ? "info" : "problems"]),
      h("span", { class: "problem-message" }, d.message),
      h(
        "span",
        { class: "problem-where" },
        messages().problems.where(d.code, d.range.start.line, d.range.start.column),
      ),
    );
    go.addEventListener("click", () => {
      this.code.reveal(d.range.start.offset, d.range.end.offset, true);
      this.show("code");
    });
    const item = h("li", {}, go);
    const fixes = this.code
      .fixesAt(d.range.start.offset, d.range.end.offset)
      .filter((a) => a.diagnostic === d || a.diagnostic?.code === d.code);
    const fix = fixes.find((a) => a.preferred) ?? fixes[0];
    if (fix) {
      const button = h("button", { type: "button", class: "button with-text fix" }, fix.title);
      button.addEventListener("click", () =>
        this.applyEdits(new Map([[this.studio.open, fix.edits]])),
      );
      item.append(button);
    }
    return item;
  }

  private showOtherProblems(): void {
    let problems: ReturnType<Studio["problems"]>;
    try {
      problems = this.studio.problems();
    } catch {
      return;
    }
    const m = messages().problems;
    const items: HTMLElement[] = [];
    for (const [path, count] of [...problems].sort(([a], [b]) => (a < b ? -1 : 1))) {
      if (path === this.studio.open || count.errors + count.warnings === 0) continue;
      const button = h(
        "button",
        { type: "button", class: `problem is-${count.errors > 0 ? "error" : "warning"}` },
        icon(ICONS.problems),
        h("span", { class: "problem-message" }, path),
        h("span", { class: "problem-where" }, m.counts(count.errors, count.warnings)),
      );
      button.addEventListener("click", () => this.studio.select(path));
      items.push(h("li", {}, button));
    }
    this.others.replaceChildren(
      ...(items.length > 0 ? [h("li", { class: "others-title" }, m.others), ...items] : []),
    );
  }

  // Undo, clipboard and keys ------------------------------------------------------------------

  undo(): void {
    if (this.viewOnly()) return;
    if (!this.studio.undo()) this.status(messages().code.nothingToUndo);
    this.updateUndo();
  }

  redo(): void {
    if (this.viewOnly()) return;
    if (!this.studio.redo()) this.status(messages().code.nothingToRedo);
    this.updateUndo();
  }

  private updateUndo(): void {
    this.undoButton.disabled = !this.studio.canUndo();
    this.redoButton.disabled = !this.studio.canRedo();
  }

  private clipboard = "";

  private async copy(text: string): Promise<void> {
    this.clipboard = text;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // The page's own clipboard still pastes inside the playground.
    }
  }

  private async paste(): Promise<string | undefined> {
    try {
      const text = await navigator.clipboard.readText();
      if (text) return text;
    } catch {
      // Reading the clipboard needs the person's permission; the page's own is used instead.
    }
    return this.clipboard || undefined;
  }

  private onKey(e: KeyboardEvent): void {
    if (document.querySelector("dialog[open]")) return;
    const target = e.target as HTMLElement;
    const native =
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement ||
      target.isContentEditable ||
      (target instanceof HTMLTextAreaElement && target !== this.code.input);
    if (!command(e) || native) return;
    const key = e.key.toLowerCase();
    // The explorer's keys, as VS Code has them: Ctrl+B shows or hides it, Ctrl+Shift+E goes to it.
    if (key === "b" && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      this.explorer.setCollapsed(!this.explorer.collapsed);
      if (this.view === "files" && this.explorer.collapsed) this.show("code");
      return;
    }
    if (key === "e" && e.shiftKey && !e.altKey) {
      e.preventDefault();
      if (this.root.classList.contains("narrow")) this.show("files");
      this.explorer.focusTree();
      return;
    }
    if (key === "z" && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      this.undo();
    } else if ((key === "z" && e.shiftKey) || key === "y") {
      e.preventDefault();
      this.redo();
    } else if (key === "s") {
      e.preventDefault();
      if (this.studio.readOnly) {
        // A project that is only being viewed has nothing to save: the way to keep it is a copy.
        announce(messages().viewing.nothingToSave);
        this.status(messages().viewing.nothingToSave);
        return;
      }
      if (this.inCloud()) {
        // A cloud project saves itself: send what waits, and say where the work is.
        this.cloud?.flush();
        announce(messages().cloud.project.savedShortcut);
        this.status(messages().cloud.project.savedShortcut);
        return;
      }
      this.keepNow();
      const m = messages().project;
      announce(m.kept);
      this.status(m.keptHere);
    }
  }

  status(message: string): void {
    this.statusText.textContent = message;
    announce(message);
  }
}
