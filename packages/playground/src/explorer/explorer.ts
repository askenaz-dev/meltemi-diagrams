// The explorer pane (`project-explorer`, decision 0048): the open project's switcher, the tree of its
// folders and diagrams, and a footer with Show all files. It follows the Studio (files, analyses and
// what the canvas shows), redraws by key, and turns the tree's gestures into the Studio's file
// operations: new diagrams, folders and files, renames and moves that keep imports working, copies,
// downloads and deletions. It sits in the page's first column, resizable and collapsible to a rail.

import { messages } from "../messages/index.js";
import type { Studio } from "../studio.js";
import { download, h, icon } from "../ui.js";
import { writeZip } from "../zip.js";
import { isTextPath } from "../files.js";
import { contextMenu, type MenuEntry } from "../menu.js";
import {
  moveDialog,
  newDiagramDialog,
  newFileDialog,
  newFolderDialog,
  problemText,
} from "./dialogs.js";
import { EXPLORER_ICONS } from "./icons.js";
import { Switcher, type SwitcherHost } from "./switcher.js";
import { TreeView } from "./tree.js";
import {
  ancestorKeys,
  baseName,
  buildTree,
  checkSegment,
  copyPath,
  diagramPath,
  filesIn,
  folderMoves,
  folderOf,
  hiddenProblems,
  movesInto,
  newDiagramText,
  renamedPath,
  within,
  type TreeNode,
} from "./tree-model.js";
import type { FileOutline, ProjectProblems } from "../studio.js";

/** The explorer's settings, kept with the page's. */
export interface ExplorerSettings {
  readonly width: number;
  readonly collapsed: boolean;
  readonly showAll: boolean;
}

export const EXPLORER_WIDTH = { min: 180, max: 480, initial: 260, step: 16 } as const;

/** What the explorer asks of the page. */
export interface ExplorerHost {
  readonly studio: Studio;
  /** The switcher's part: the open project, the panel's actions. */
  readonly switcher: Omit<SwitcherHost, "showAll" | "setShowAll">;
  settings(): ExplorerSettings;
  saveSettings(settings: ExplorerSettings): void;
  /** The explorer's width or rail changed: the page lays its columns out again. */
  layout(width: number, collapsed: boolean): void;
  /** Opens a file of the project in the code pane (the code tab on a narrow screen). */
  openFile(path: string): void;
  status(message: string): void;
  confirm(title: string, message: string, confirm: string): Promise<boolean>;
  /** Keeps the anonymous project now, after files changed. */
  keep(): void;
  /** Adds files from outside the page into a folder. */
  addFiles(files: readonly File[], folder: string): Promise<void>;
  /** Opens the import dialog for a project archive. */
  importArchive(file: File): void;
}

export class Explorer {
  readonly element: HTMLElement;
  /** The edge between the explorer and the code, which resizes it. */
  readonly edge: HTMLElement;
  readonly switcher: Switcher;
  private readonly tree: TreeView;
  private readonly body: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly empty: HTMLElement;
  private readonly hidden: HTMLElement;
  private readonly showAllBox: HTMLInputElement;
  private readonly railButton: HTMLButtonElement;
  private readonly collapseButton: HTMLButtonElement;
  private settings: ExplorerSettings;
  /** Folders made here that hold no file yet. */
  private readonly made = new Set<string>();
  private outlines = new Map<string, FileOutline>();
  private problems: ProjectProblems = new Map();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private due = Infinity;
  /** The diagram and story the canvas shows, as it last said. */
  private shown: { diagram?: string; story?: string } = {};
  private lastOpen: string | undefined;
  /** The row a dialog that is closing gives focus to. */
  private focusNext: string | undefined;

  constructor(private readonly host: ExplorerHost) {
    const words = messages().explorer.pane;
    this.settings = host.settings();
    this.switcher = new Switcher({
      ...host.switcher,
      showAll: () => this.settings.showAll,
      setShowAll: (on) => this.setShowAll(on),
    });
    this.tree = new TreeView({
      activate: (node) => this.activate(node),
      menu: (node, at) => this.menu(node, at),
      rename: (node, name) => this.rename(node, name),
      key: (node, e) => this.key(node, e),
      move: (nodes, folder) => this.moveInto(nodes, folder),
      drop: (files, folder) => void this.dropFiles(files, folder),
      editable: () => !host.studio.readOnly,
    });

    const button = (path: string, label: string, run: () => void) => {
      const b = h("button", { type: "button", class: "button", "aria-label": label, title: label });
      b.append(icon(path));
      b.addEventListener("click", run);
      return b as HTMLButtonElement;
    };
    this.collapseButton = button(EXPLORER_ICONS.sidebar, words.hide, () => this.setCollapsed(true));
    this.collapseButton.setAttribute("aria-expanded", "true");
    this.railButton = button(EXPLORER_ICONS.sidebar, words.show, () => this.setCollapsed(false));
    this.railButton.setAttribute("aria-expanded", "false");
    this.bar = h(
      "div",
      { class: "explorer-bar" },
      h("span", { class: "explorer-bar-title", id: "explorer-files" }, words.files),
      button(EXPLORER_ICONS.newDiagram, words.newDiagram, () =>
        this.newDiagram(this.targetFolder()),
      ),
      button(EXPLORER_ICONS.newFolder, words.newFolder, () => this.newFolder(this.targetFolder())),
      button(EXPLORER_ICONS.collapseAll, words.collapseAll, () => this.tree.collapseAll()),
    );
    const emptyButton = h(
      "button",
      { type: "button", class: "button with-text" },
      words.newDiagram,
    );
    emptyButton.addEventListener("click", () => this.newDiagram(""));
    this.empty = h(
      "div",
      { class: "explorer-empty", hidden: true },
      h("p", {}, words.empty),
      emptyButton,
    );
    // The tree fills the scroll area, so that its empty space is the project's root: a right
    // click there makes something at the root, and a drop there puts it there.
    const scroll = h("div", { class: "explorer-scroll" }, this.tree.element, this.empty);

    const showHidden = h("button", { type: "button", class: "link-button" }, words.showHidden);
    showHidden.addEventListener("click", () => {
      const first = hiddenProblems(this.input())[0];
      this.setShowAll(true);
      if (first) this.reveal(first);
    });
    this.hidden = h(
      "p",
      { class: "explorer-hidden", hidden: true },
      icon(EXPLORER_ICONS.settings),
      h("span", { class: "explorer-hidden-text" }),
      showHidden,
    );
    this.showAllBox = h("input", {
      type: "checkbox",
      role: "switch",
      class: "switch-input",
    }) as HTMLInputElement;
    this.showAllBox.checked = this.settings.showAll;
    this.showAllBox.addEventListener("change", () => this.setShowAll(this.showAllBox.checked));
    const showAll = h(
      "label",
      { class: "switch", title: words.showAllHint },
      this.showAllBox,
      h("span", { class: "switch-track", "aria-hidden": "true" }),
      h("span", {}, words.showAll),
    );

    this.body = h(
      "div",
      { class: "explorer-body" },
      h("div", { class: "explorer-head" }, this.switcher.element, this.collapseButton),
      this.bar,
      scroll,
      h("div", { class: "explorer-foot" }, this.hidden, showAll),
    );
    this.element = h(
      "aside",
      { id: "explorer", class: "explorer", "aria-label": words.label },
      h("div", { class: "explorer-rail" }, this.railButton),
      this.body,
    );
    this.edge = h("div", {
      class: "explorer-edge",
      role: "separator",
      tabindex: "0",
      "aria-orientation": "vertical",
      "aria-label": words.width,
      "aria-controls": "explorer",
      "aria-valuemin": String(EXPLORER_WIDTH.min),
      "aria-valuemax": String(EXPLORER_WIDTH.max),
    });
    this.edgeBehaviour();
    this.applyLayout(false);

    const studio = host.studio;
    studio.listen({
      files: () => this.schedule(30),
      analysis: () => this.schedule(200),
      changed: () => this.schedule(700),
      readOnly: () => this.showReadOnly(),
      canvas: (list) => {
        let changed = false;
        for (const message of list) {
          if (message.type === "render" && message.diagram !== this.shown.diagram) {
            this.shown = { ...this.shown, diagram: message.diagram };
            changed = true;
          } else if (message.type === "story") {
            const story = message.playback?.id;
            if (story !== this.shown.story) {
              this.shown = { ...this.shown, ...(story ? { story } : { story: undefined }) };
              changed = true;
            }
          } else if (message.type === "empty") {
            this.shown = {};
            changed = true;
          }
        }
        if (changed) this.showCurrent();
      },
    });
    this.showReadOnly();
  }

  // Layout ---------------------------------------------------------------------------------------

  private applyLayout(save: boolean): void {
    const { width, collapsed } = this.settings;
    // The stylesheet hides the body (a rail stays) and the edge keeps its column, unseen: the
    // columns after it must not move. On a narrow screen the explorer is a tab, never a rail.
    this.element.dataset.collapsed = String(collapsed);
    this.edge.dataset.collapsed = String(collapsed);
    this.collapseButton.setAttribute("aria-expanded", String(!collapsed));
    this.railButton.setAttribute("aria-expanded", String(!collapsed));
    this.edge.setAttribute("aria-valuenow", String(width));
    this.host.layout(width, collapsed);
    if (save) this.host.saveSettings(this.settings);
  }

  get collapsed(): boolean {
    return this.settings.collapsed;
  }

  setCollapsed(collapsed: boolean): void {
    if (collapsed === this.settings.collapsed) return;
    const hadFocus = this.body.contains(document.activeElement);
    this.settings = { ...this.settings, collapsed };
    this.applyLayout(true);
    if (collapsed && hadFocus) this.railButton.focus();
    if (!collapsed) this.tree.focus();
  }

  private setWidth(width: number, save: boolean): void {
    const clamped = Math.round(Math.min(EXPLORER_WIDTH.max, Math.max(EXPLORER_WIDTH.min, width)));
    this.settings = { ...this.settings, width: clamped };
    this.applyLayout(save);
  }

  private edgeBehaviour(): void {
    const edge = this.edge;
    edge.addEventListener("pointerdown", (e) => {
      edge.setPointerCapture(e.pointerId);
      const left = this.element.getBoundingClientRect().left;
      document.documentElement.classList.add("resizing");
      const move = (event: PointerEvent) => this.setWidth(event.clientX - left, false);
      const up = () => {
        edge.removeEventListener("pointermove", move);
        edge.removeEventListener("pointerup", up);
        document.documentElement.classList.remove("resizing");
        this.host.saveSettings(this.settings);
      };
      edge.addEventListener("pointermove", move);
      edge.addEventListener("pointerup", up);
    });
    edge.addEventListener("dblclick", () => this.setWidth(EXPLORER_WIDTH.initial, true));
    edge.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      const step = e.key === "ArrowLeft" ? -EXPLORER_WIDTH.step : EXPLORER_WIDTH.step;
      this.setWidth(this.settings.width + step, true);
    });
  }

  /** Puts focus in the tree, opening the explorer when it is a rail. */
  focusTree(): void {
    if (this.settings.collapsed) this.setCollapsed(false);
    else this.tree.focus();
  }

  // Drawing --------------------------------------------------------------------------------------

  /** Redraws after `delay` ms, or sooner when a nearer redraw is already due. */
  schedule(delay: number): void {
    const at = Date.now() + delay;
    if (this.timer !== undefined && this.due <= at) return;
    clearTimeout(this.timer);
    this.due = at;
    this.timer = setTimeout(() => this.refresh(), delay);
  }

  private input() {
    const paths = this.host.studio.host.paths();
    for (const folder of [...this.made]) {
      if (paths.some((p) => p.startsWith(`${folder}/`))) this.made.delete(folder);
    }
    return {
      paths,
      outlines: this.outlines,
      problems: this.problems,
      showAll: this.settings.showAll,
      folders: [...this.made],
    };
  }

  /** Reads the project again and redraws the tree, now. */
  refresh(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.due = Infinity;
    const studio = this.host.studio;
    try {
      this.outlines = studio.outlines();
      this.problems = studio.problems();
    } catch {
      // A project the compiler cannot read yet (fonts arriving) keeps what it showed.
    }
    const input = this.input();
    const nodes = buildTree(input);
    this.tree.render(nodes);
    this.empty.hidden = nodes.length > 0;
    const hidden = hiddenProblems(input);
    this.hidden.hidden = hidden.length === 0;
    this.hidden.querySelector(".explorer-hidden-text")!.textContent =
      messages().explorer.pane.hiddenProblems(hidden.length);
    this.showCurrent();
    this.switcher.update();
  }

  /** Marks the open file and what the canvas shows in it; a newly opened file comes into view. */
  private showCurrent(): void {
    const open = this.host.studio.open;
    const fileKey = open ? `f:${open}` : undefined;
    const story = this.shown.story ? `s:${open}#${this.shown.story}` : undefined;
    const diagram = this.shown.diagram ? `g:${open}#${this.shown.diagram}` : undefined;
    const part = [story, diagram].find((key) => key !== undefined && this.tree.node(key));
    // Once its row is drawn: what the canvas says may come before the tree's first drawing.
    if (open && open !== this.lastOpen && fileKey && this.tree.node(fileKey)) {
      this.lastOpen = open;
      this.tree.expand(ancestorKeys(open));
      // A file with several diagrams opens, so that the one on the canvas can be seen.
      if (this.tree.node(`f:${open}`)?.children.length) this.tree.toggle(`f:${open}`, true);
    }
    this.tree.setCurrent(fileKey, part);
  }

  private showReadOnly(): void {
    const readOnly = this.host.studio.readOnly;
    this.element.dataset.readonly = String(readOnly);
    for (const control of this.bar.querySelectorAll<HTMLButtonElement>("button")) {
      control.hidden = readOnly;
    }
    this.switcher.update();
  }

  private setShowAll(on: boolean): void {
    if (on === this.settings.showAll) return;
    this.settings = { ...this.settings, showAll: on };
    this.showAllBox.checked = on;
    this.host.saveSettings(this.settings);
    this.refresh();
  }

  /** Shows a file in the tree: its folders open, and the row focused. */
  reveal(path: string): void {
    this.refresh();
    this.focusAfter(`f:${path}`);
  }

  // What the rows do -----------------------------------------------------------------------------

  private editable(): boolean {
    if (!this.host.studio.readOnly) return true;
    this.host.status(messages().viewing.readOnly);
    return false;
  }

  /** The folder an action of the bar works in: the focused folder, or the focused file's. */
  private targetFolder(): string {
    const node = this.tree.chosen()[0];
    if (!node) return folderOf(this.host.studio.open);
    return node.kind === "folder" ? node.path : folderOf(node.path);
  }

  private activate(node: TreeNode): void {
    const studio = this.host.studio;
    if (node.kind === "folder") return;
    this.host.openFile(node.path);
    if (node.kind === "diagram" && node.id) {
      if (this.shown.story) studio.receive({ type: "pickStory", story: null });
      studio.receive({ type: "pickDiagram", diagram: node.id });
    } else if (node.kind === "story" && node.id) {
      studio.receive({ type: "pickStory", story: node.id });
    }
  }

  private key(node: TreeNode, e: KeyboardEvent): boolean {
    if (this.host.studio.readOnly) return false;
    const plain = !e.ctrlKey && !e.metaKey && !e.altKey;
    if (e.key === "F2" && plain && (node.kind === "file" || node.kind === "folder")) {
      this.startRename(node);
      return true;
    }
    if (e.key === "Delete" && plain) {
      void this.remove(this.chosenFiles(node));
      return true;
    }
    if ((e.key === "d" || e.key === "D") && (e.ctrlKey || e.metaKey) && !e.altKey) {
      if (node.kind === "file") this.duplicate(node);
      return true;
    }
    // Move to… has no letter: letters jump to the row whose name starts with them.
    return false;
  }

  /** The files and folders an action takes: the selection when the row is in it, else the row. */
  private chosenFiles(node: TreeNode): TreeNode[] {
    const chosen = this.tree.chosen().filter((n) => n.kind === "file" || n.kind === "folder");
    const list = chosen.some((n) => n.key === node.key) ? chosen : [node];
    return list.filter((n) => n.kind === "file" || n.kind === "folder");
  }

  private menu(node: TreeNode | undefined, at: { x: number; y: number } | HTMLElement): void {
    if (this.host.studio.readOnly) return;
    const words = messages().explorer.menu;
    const returnTo =
      (node && document.querySelector<HTMLElement>(`[data-key="${CSS.escape(node.key)}"]`)) ??
      this.tree.element;
    const folder = !node ? "" : node.kind === "folder" ? node.path : folderOf(node.path);
    const creating: MenuEntry[] = [
      {
        label: words.newDiagram,
        icon: EXPLORER_ICONS.newDiagram,
        run: () => this.newDiagram(folder),
      },
      { label: words.newFolder, icon: EXPLORER_ICONS.newFolder, run: () => this.newFolder(folder) },
      ...(this.settings.showAll
        ? [{ label: words.newFile, icon: EXPLORER_ICONS.file, run: () => this.newFile(folder) }]
        : []),
    ];
    let entries: (MenuEntry | "-")[];
    if (!node) entries = creating;
    else if (node.kind === "diagram" || node.kind === "story") {
      entries = [{ label: words.open, run: () => this.activate(node) }];
    } else {
      const chosen = this.chosenFiles(node);
      const many = chosen.length > 1;
      entries = [
        ...(node.kind === "file" && !many
          ? [{ label: words.open, run: () => this.activate(node) }, "-" as const]
          : []),
        ...(node.kind === "folder" && !many ? [...creating, "-" as const] : []),
        ...(many
          ? []
          : [
              {
                label: words.rename,
                icon: EXPLORER_ICONS.rename,
                keys: "F2",
                run: () => this.startRename(node),
              },
            ]),
        {
          label: words.moveTo,
          icon: EXPLORER_ICONS.move,
          run: () => this.moveTo(chosen),
        },
        ...(node.kind === "file" && !many
          ? [
              {
                label: words.duplicate,
                icon: EXPLORER_ICONS.duplicate,
                keys: "Ctrl+D",
                run: () => this.duplicate(node),
              },
            ]
          : []),
        ...(many
          ? []
          : [
              {
                label: words.download,
                icon: EXPLORER_ICONS.download,
                run: () => void this.download(node),
              },
            ]),
        "-",
        {
          label: words.delete,
          icon: EXPLORER_ICONS.trash,
          keys: "Delete",
          danger: true,
          run: () => void this.remove(chosen),
        },
      ];
    }
    contextMenu(entries, at, {
      label: node ? words.label(node.name) : words.root,
      returnTo,
    });
  }

  // Making files and folders ---------------------------------------------------------------------

  private exists(path: string): boolean {
    const paths = this.host.studio.host.paths();
    return (
      paths.includes(path) || paths.some((p) => p.startsWith(`${path}/`)) || this.made.has(path)
    );
  }

  newDiagram(folder: string): void {
    if (!this.editable()) return;
    const words = messages().explorer.actions;
    newDiagramDialog(
      folder,
      (name, kind) => {
        const problem = checkSegment(name);
        if (problem) return problemText(problem);
        const path = diagramPath(folder, name);
        if (this.exists(path)) return words.exists(path);
        if (!this.editable()) return undefined;
        this.host.studio.addFiles([[path, newDiagramText(kind, name)]], path);
        this.host.keep();
        this.made.delete(folder);
        this.reveal(path);
        this.host.status(words.created(path));
        return undefined;
      },
      this.returning,
    );
  }

  newFolder(parent: string): void {
    if (!this.editable()) return;
    const words = messages().explorer.actions;
    newFolderDialog(
      parent,
      (name) => {
        const problem = checkSegment(name);
        if (problem) return problemText(problem);
        const path = within(parent, name.trim());
        if (this.exists(path)) return words.exists(path);
        this.made.add(path);
        this.refresh();
        this.focusAfter(`d:${path}`);
        this.host.status(words.madeFolder(path));
        return undefined;
      },
      this.returning,
    );
  }

  newFile(folder: string): void {
    if (!this.editable()) return;
    const words = messages().explorer.actions;
    newFileDialog(
      folder,
      (name) => {
        const problem = checkSegment(name);
        if (problem) return problemText(problem);
        const path = within(folder, name.trim());
        if (!isTextPath(path)) return words.editable;
        if (this.exists(path)) return words.exists(path);
        this.host.studio.addFiles([[path, ""]], path);
        this.host.keep();
        this.reveal(path);
        this.host.status(words.created(path));
        return undefined;
      },
      this.returning,
    );
  }

  // Renames and moves ----------------------------------------------------------------------------

  private startRename(node: TreeNode): void {
    if (!this.editable() || (node.kind !== "file" && node.kind !== "folder")) return;
    const value = node.kind === "file" ? baseName(node.path).replace(/\.meltemi$/, "") : node.name;
    this.tree.startRename(node.key, value);
  }

  /** A rename typed in a row: refused with a reason, or made with the imports that follow. */
  private rename(node: TreeNode, name: string): string | undefined {
    if (!this.editable()) return undefined;
    const words = messages().explorer.actions;
    if (node.kind !== "file" && node.kind !== "folder") return undefined;
    const target = renamedPath(node.path, name, node.kind);
    if (!("path" in target)) return problemText(target);
    if (target.path === node.path) return undefined;
    if (node.kind === "folder") {
      if (this.made.has(node.path) && !filesIn(node.path, this.host.studio.host.paths()).length) {
        if (this.exists(target.path)) return words.exists(target.path);
        this.made.delete(node.path);
        this.made.add(target.path);
        this.refresh();
        this.focusAfter(`d:${target.path}`);
        return undefined;
      }
      const moves = folderMoves(node.path, target.path, this.host.studio.host.paths());
      if (!("moves" in moves)) return problemText(moves);
      if (this.exists(target.path)) return words.exists(target.path);
      return this.applyMoves(
        moves.moves,
        words.renamed(node.path, target.path),
        `d:${target.path}`,
      );
    }
    if (this.exists(target.path)) return words.exists(target.path);
    return this.applyMoves(
      [[node.path, target.path]],
      words.renamed(node.path, target.path),
      `f:${target.path}`,
    );
  }

  /** Makes moves through the Studio as one step, and says what followed them. */
  private applyMoves(
    moves: readonly [string, string][],
    said: string,
    focus: string | undefined,
  ): string | undefined {
    const words = messages().explorer.actions;
    if (moves.length === 0) return undefined;
    const outcome = this.host.studio.moveFiles(moves);
    if (!outcome) return words.exists(moves[0]![1]);
    this.host.keep();
    // Folders made here follow a move into them.
    for (const [, to] of moves) {
      for (const folder of [...this.made])
        if (to.startsWith(`${folder}/`)) this.made.delete(folder);
    }
    const others = outcome.edited.filter((path) => !moves.some(([, to]) => to === path));
    this.host.status(
      said +
        (others.length > 0 ? words.importsFollow(others) : "") +
        (outcome.skipped.length > 0 ? words.importsSkipped(outcome.skipped) : ""),
    );
    this.refresh();
    if (focus) this.focusAfter(focus);
    return undefined;
  }

  /**
   * Brings a row that was just made, renamed or moved into view and focus. A dialog that is still
   * open gives focus to it when it closes (`returning`).
   */
  private focusAfter(key: string): void {
    const path = key.slice(2);
    this.tree.expand(ancestorKeys(path));
    this.tree.setFocus(key, true);
    this.tree.flash(key);
    this.focusNext = key;
  }

  /** Where a dialog of the explorer returns focus: the row its action made, else the tree. */
  private readonly returning = (): HTMLElement | undefined => {
    const key = this.focusNext;
    this.focusNext = undefined;
    if (key) this.tree.setFocus(key, false);
    const row = key
      ? this.tree.element.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`)
      : null;
    return row ?? this.tree.element.querySelector<HTMLElement>("li[tabindex='0']") ?? undefined;
  };

  /** Drops rows into a folder. */
  private moveInto(nodes: readonly TreeNode[], folder: string): void {
    if (!this.editable()) return;
    const words = messages().explorer.actions;
    const sources = nodes.flatMap((n) =>
      n.kind === "file" || n.kind === "folder" ? [{ kind: n.kind, path: n.path }] : [],
    );
    const planned = movesInto(sources, folder, this.host.studio.host.paths());
    if (!("moves" in planned)) {
      this.host.status(
        planned.reason === "exists" ? words.notMoved(planned.path) : problemText(planned),
      );
      return;
    }
    // A folder made here and still empty just changes its place.
    for (const source of sources) {
      if (source.kind === "folder" && this.made.has(source.path)) {
        this.made.delete(source.path);
        this.made.add(within(folder, baseName(source.path)));
      }
    }
    const first = nodes[0];
    const focus =
      first?.kind === "folder"
        ? `d:${within(folder, baseName(first.path))}`
        : first
          ? `f:${within(folder, baseName(first.path))}`
          : undefined;
    if (planned.moves.length === 0) {
      this.refresh();
      return;
    }
    this.applyMoves(planned.moves, words.moved(planned.moves.length, folder), focus);
  }

  private moveTo(nodes: readonly TreeNode[]): void {
    if (!this.editable() || nodes.length === 0) return;
    const words = messages().explorer.actions;
    const paths = this.host.studio.host.paths();
    const folders = new Set<string>(this.made);
    for (const path of paths) {
      let folder = folderOf(path);
      while (folder !== "") {
        folders.add(folder);
        folder = folderOf(folder);
      }
    }
    const what = nodes.length === 1 ? nodes[0]!.name : words.moveMany(nodes.length);
    moveDialog(
      what,
      [...folders].sort(),
      folderOf(nodes[0]!.path),
      (target) => {
        for (const segment of target === "" ? [] : target.split("/")) {
          const problem = checkSegment(segment);
          if (problem) return problemText(problem);
        }
        const sources = nodes.map((n) => ({ kind: n.kind as "file" | "folder", path: n.path }));
        const planned = movesInto(sources, target, this.host.studio.host.paths());
        if (!("moves" in planned)) return problemText(planned);
        this.moveInto(nodes, target);
        return undefined;
      },
      this.returning,
    );
  }

  // Copies, downloads and deletions --------------------------------------------------------------

  private duplicate(node: TreeNode): void {
    if (!this.editable() || node.kind !== "file") return;
    const studio = this.host.studio;
    const content = studio.host.get(node.path);
    if (content === undefined) return;
    const copy = copyPath(node.path, (p) => studio.host.has(p));
    const open = studio.open;
    studio.addFiles([[copy, content]]);
    if (studio.open !== open) studio.select(open);
    this.host.keep();
    this.host.status(messages().explorer.actions.duplicated(copy));
    this.refresh();
    this.focusAfter(`f:${copy}`);
  }

  private async download(node: TreeNode): Promise<void> {
    const studio = this.host.studio;
    const words = messages().explorer.actions;
    if (node.kind === "file") {
      const content = studio.host.get(node.path);
      if (content === undefined) return;
      const name = baseName(node.path);
      download(
        name,
        typeof content === "string" ? content : (content as Uint8Array<ArrayBuffer>),
        typeof content === "string" ? "text/plain;charset=utf-8" : "application/octet-stream",
      );
      this.host.status(words.downloaded(name));
      return;
    }
    if (node.kind !== "folder") return;
    const encoder = new TextEncoder();
    const parent = folderOf(node.path);
    const entries = filesIn(node.path, studio.host.paths()).map((path) => {
      const content = studio.host.get(path)!;
      return {
        path: parent === "" ? path : path.slice(parent.length + 1),
        data: typeof content === "string" ? encoder.encode(content) : content,
      };
    });
    const name = `${baseName(node.path)}.zip`;
    download(name, (await writeZip(entries)) as Uint8Array<ArrayBuffer>, "application/zip");
    this.host.status(words.downloaded(name));
  }

  private async remove(nodes: readonly TreeNode[]): Promise<void> {
    if (!this.editable() || nodes.length === 0) return;
    const words = messages().explorer.actions;
    const studio = this.host.studio;
    const paths = studio.host.paths();
    const files = new Set<string>();
    const folders: string[] = [];
    for (const node of nodes) {
      if (node.kind === "file") files.add(node.path);
      else if (node.kind === "folder") {
        folders.push(node.path);
        for (const file of filesIn(node.path, paths)) files.add(file);
      }
    }
    const single = nodes.length === 1 ? nodes[0]! : undefined;
    const sure =
      single?.kind === "file"
        ? await this.host.confirm(
            words.deleteFileTitle,
            words.deleteFile(single.path),
            words.deleteConfirm,
          )
        : await this.host.confirm(
            words.deleteFolderTitle,
            words.deleteFolder(single?.path ?? words.moveMany(nodes.length), files.size),
            words.deleteConfirm,
          );
    if (!sure || !this.editable()) return;
    // The row after the last one deleted takes the focus.
    studio.batch(() => {
      for (const file of files) studio.deleteFile(file);
    });
    for (const folder of folders) {
      for (const made of [...this.made]) {
        if (made === folder || made.startsWith(`${folder}/`)) this.made.delete(made);
      }
    }
    this.host.keep();
    this.host.status(
      single?.kind === "file"
        ? words.deleted(single.path)
        : words.deletedFolder(single?.path ?? words.moveMany(nodes.length), files.size),
    );
    this.refresh();
    this.tree.focus();
  }

  /** Files dropped from outside the page: an archive is imported, others are added to the folder. */
  private async dropFiles(files: readonly File[], folder: string): Promise<void> {
    if (!this.editable()) return;
    const archive = files.find((f) => f.name.toLowerCase().endsWith(".zip"));
    if (archive) {
      this.host.importArchive(archive);
      return;
    }
    await this.host.addFiles(files, folder);
    this.refresh();
  }
}
