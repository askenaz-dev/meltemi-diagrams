// The explorer's tree in the page: a WAI-ARIA tree of folders, diagrams and images that redraws by
// key (so focus, scroll, a rename in progress and an opening folder survive the project's changes),
// with the tree's keys, a rename box in the row, selection with Ctrl and Shift, and drag and drop of
// rows and of files from outside the page. What the rows do is the explorer's (`explorer.ts`).

import { messages } from "../messages/index.js";
import { h, icon } from "../ui.js";
import { EXPLORER_ICONS, nodeIcon } from "./icons.js";
import { folderOf, visibleRows, type TreeNode, type TreeRow } from "./tree-model.js";

/** What the tree asks of the explorer. */
export interface TreeActions {
  /** A row was activated: a click, Enter or Space. */
  activate(node: TreeNode): void;
  /** The menu of a row, or of the tree's empty space (no node), at a point or under the row. */
  menu(node: TreeNode | undefined, at: { x: number; y: number } | HTMLElement): void;
  /** A rename typed in the row: answers why it is refused, or nothing once it is done. */
  rename(node: TreeNode, name: string): string | undefined;
  /** A key the explorer handles on a row (F2 starts a rename here): true when it did. */
  key(node: TreeNode, event: KeyboardEvent): boolean;
  /** Rows dropped into a folder (`""`: the root). */
  move(nodes: readonly TreeNode[], folder: string): void;
  /** Files from outside the page dropped into a folder. */
  drop(files: readonly File[], folder: string): void;
  /** Whether the person may change the project: no drags, renames or menus otherwise. */
  editable(): boolean;
}

interface Item {
  readonly li: HTMLLIElement;
  readonly row: HTMLElement;
  readonly twist: HTMLElement;
  readonly picture: HTMLElement;
  readonly name: HTMLElement;
  readonly badge: HTMLElement;
  readonly more: HTMLButtonElement;
  group: HTMLUListElement | undefined;
  node: TreeNode;
  /** What was drawn last, so that an unchanged row is left alone. */
  drawn: string;
}

const PATHS_TYPE = "application/x-meltemi-paths";
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export class TreeView {
  readonly element: HTMLUListElement;
  private readonly items = new Map<string, Item>();
  private nodes: readonly TreeNode[] = [];
  private rows: TreeRow[] = [];
  readonly expanded = new Set<string>();
  private selected = new Set<string>();
  private anchor: string | undefined;
  private focusKey: string | undefined;
  /** The open file's key, and the key of the diagram or story the canvas shows in it. */
  private current: { file?: string; part?: string } = {};
  private renaming: { key: string; input: HTMLInputElement; problem: HTMLElement } | undefined;
  private typed = "";
  private typedAt = 0;
  private dragging: TreeNode[] = [];
  private hoverOpen: ReturnType<typeof setTimeout> | undefined;
  private target: HTMLElement | undefined;

  constructor(private readonly actions: TreeActions) {
    this.element = h("ul", {
      class: "tree",
      role: "tree",
      "aria-label": messages().explorer.pane.tree,
      "aria-multiselectable": "true",
    });
    this.element.addEventListener("keydown", (e) => this.onKey(e));
    this.element.addEventListener("click", (e) => this.onClick(e));
    this.element.addEventListener("contextmenu", (e) => this.onContextMenu(e));
    this.element.addEventListener("focusin", (e) => {
      const li = (e.target as HTMLElement).closest<HTMLLIElement>("li[role=treeitem]");
      if (li?.dataset.key) this.setFocus(li.dataset.key, false);
    });
    this.dragBehaviour();
  }

  // Drawing ------------------------------------------------------------------------------------

  /** Draws the tree: rows are kept by key and changed only where their data changed. */
  render(nodes: readonly TreeNode[]): void {
    this.nodes = nodes;
    const seen = new Set<string>();
    this.renderList(this.element, nodes, 1, seen);
    const gone = [...this.items].filter(([key]) => !seen.has(key));
    for (const [key] of gone) this.items.delete(key);
    for (const [, item] of gone) {
      // A row inside a folder that goes, goes with it.
      const parent = item.li.parentElement?.closest<HTMLElement>(
        "li[role=treeitem], li[data-leaving]",
      );
      if (parent && (parent.dataset.leaving || !this.items.has(parent.dataset.key ?? ""))) continue;
      this.leave(item.li);
    }
    for (const key of [...this.selected]) if (!seen.has(key)) this.selected.delete(key);
    for (const key of [...this.expanded]) if (!seen.has(key)) this.expanded.delete(key);
    this.rows = visibleRows(nodes, this.expanded);
    if (this.focusKey === undefined || !this.items.has(this.focusKey)) {
      this.focusKey = this.current.part ?? this.current.file ?? this.rows[0]?.node.key;
    }
    this.syncStates();
  }

  private renderList(
    list: HTMLUListElement,
    nodes: readonly TreeNode[],
    level: number,
    seen: Set<string>,
  ): void {
    let cursor: ChildNode | null = list.firstChild;
    for (const node of nodes) {
      seen.add(node.key);
      let item = this.items.get(node.key);
      if (!item) {
        item = this.create(node);
        this.items.set(node.key, item);
      }
      this.update(item, node, level);
      if (node.children.length > 0) {
        if (!item.group) item.group = this.groupOf(item);
        this.renderList(item.group, node.children, level + 1, seen);
      } else if (item.group) {
        item.group.parentElement?.remove();
        item.group = undefined;
      }
      // Rows that are leaving keep their place until they are gone.
      while (cursor && cursor instanceof HTMLElement && cursor.dataset.leaving) {
        cursor = cursor.nextSibling;
      }
      if (cursor !== item.li) list.insertBefore(item.li, cursor);
      else cursor = cursor.nextSibling;
    }
  }

  private create(node: TreeNode): Item {
    const twist = h("span", { class: "tree-twist", "aria-hidden": "true" });
    const picture = h("span", { class: "tree-icon", "aria-hidden": "true" });
    const name = h("span", { class: "tree-name" });
    const badge = h("span", { class: "tree-badge", "aria-hidden": "true" });
    const more = h("button", { type: "button", class: "tree-more", tabindex: "-1" });
    more.append(icon(EXPLORER_ICONS.more, true));
    const row = h("div", { class: "tree-row" }, twist, picture, name, badge, more);
    const li = h(
      "li",
      { role: "treeitem", class: "tree-item", tabindex: "-1" },
      row,
    ) as HTMLLIElement;
    li.dataset.key = node.key;
    return { li, row, twist, picture, name, badge, more, group: undefined, node, drawn: "" };
  }

  private groupOf(item: Item): HTMLUListElement {
    const group = h("ul", { class: "tree-group", role: "group" }) as HTMLUListElement;
    item.li.append(h("div", { class: "tree-group-wrap" }, group));
    return group;
  }

  private update(item: Item, node: TreeNode, level: number): void {
    item.node = node;
    const expandable = node.children.length > 0;
    const open = expandable && this.expanded.has(node.key);
    const drawn = [node.name, node.icon, node.errors, node.warnings, level, expandable, open].join(
      "\u0000",
    );
    if (drawn === item.drawn) return;
    item.drawn = drawn;
    const words = messages().explorer.pane;
    item.li.setAttribute("aria-level", String(level));
    item.row.style.setProperty("--level", String(level - 1));
    item.li.dataset.kind = node.kind;
    if (expandable) item.li.setAttribute("aria-expanded", String(open));
    else item.li.removeAttribute("aria-expanded");
    item.li.classList.toggle("open", open);
    item.twist.replaceChildren(...(expandable ? [icon(EXPLORER_ICONS.chevron)] : []));
    item.picture.replaceChildren(icon(nodeIcon(node.icon, open)));
    item.picture.dataset.icon = node.icon;
    item.picture.title = words.kinds[node.icon];
    if (!this.renaming || this.renaming.key !== node.key) item.name.textContent = node.name;
    const problems = node.errors + node.warnings;
    // A folder says what it holds only while it is closed: open, its files say it themselves.
    const counted = problems > 0 && (node.kind !== "folder" || !open);
    item.badge.textContent = counted ? String(node.errors > 0 ? node.errors : node.warnings) : "";
    item.badge.className = `tree-badge ${node.errors > 0 ? "is-error" : "is-warning"}`;
    item.badge.hidden = !counted;
    const label = [node.name, words.kinds[node.icon]];
    if (counted) label.push(words.counts(node.errors, node.warnings));
    item.li.setAttribute("aria-label", label.join(", "));
    item.more.setAttribute("aria-label", words.more(node.name));
    item.more.title = words.more(node.name);
    item.li.draggable = node.kind === "file" || node.kind === "folder";
  }

  /** A row that went: its height closes, then it is removed. */
  private leave(li: HTMLElement): void {
    if (reduced() || !li.isConnected) {
      li.remove();
      return;
    }
    // A row that goes is no row any more: a new one may take its key while it fades.
    li.dataset.leaving = "true";
    delete li.dataset.key;
    for (const name of ["role", "aria-current", "aria-selected", "aria-level", "aria-expanded"]) {
      li.removeAttribute(name);
    }
    li.tabIndex = -1;
    li.inert = true;
    li.style.height = `${li.offsetHeight}px`;
    void li.offsetHeight;
    li.classList.add("leaving");
    li.style.height = "0px";
    setTimeout(() => li.remove(), 160);
  }

  /** Marks the open file, the shown diagram, the selection and the one row in the tab order. */
  private syncStates(): void {
    for (const [key, item] of this.items) {
      item.li.setAttribute("aria-selected", String(this.selected.has(key)));
      item.li.classList.toggle("current", key === this.current.file);
      item.li.classList.toggle("shown", key === this.current.part);
      if (key === this.current.file) item.li.setAttribute("aria-current", "true");
      else item.li.removeAttribute("aria-current");
      item.li.tabIndex = key === this.focusKey ? 0 : -1;
      const group = item.group?.parentElement;
      if (group) {
        const open = this.expanded.has(key);
        group.toggleAttribute("inert", !open);
      }
    }
  }

  // State --------------------------------------------------------------------------------------

  /** The open file and what the canvas shows in it; the file's folders open to show it. */
  setCurrent(file: string | undefined, part: string | undefined): void {
    const before = this.current.file;
    this.current = { ...(file ? { file } : {}), ...(part ? { part } : {}) };
    if (file && file !== before) {
      this.selected = new Set([part ?? file]);
      this.anchor = part ?? file;
      this.focusKey = part ?? file;
    } else if (part && this.selected.size <= 1) {
      this.selected = new Set([part]);
      this.focusKey = part;
    }
    this.syncStates();
  }

  /** Opens or closes a row with children. */
  toggle(key: string, open = !this.expanded.has(key)): void {
    const item = this.items.get(key);
    if (!item || item.node.children.length === 0 || this.expanded.has(key) === open) return;
    if (open) this.expanded.add(key);
    else this.expanded.delete(key);
    item.drawn = "";
    this.update(item, item.node, Number(item.li.getAttribute("aria-level")));
    this.rows = visibleRows(this.nodes, this.expanded);
    // Focus inside a closing folder goes to the folder.
    if (
      !open &&
      this.focusKey &&
      item.li.querySelector(`[data-key="${CSS.escape(this.focusKey)}"]`)
    ) {
      this.setFocus(key, true);
    }
    this.syncStates();
  }

  /** Opens these rows (the folders that hold a file, say) without animating anything else. */
  expand(keys: readonly string[]): void {
    for (const key of keys) this.toggle(key, true);
  }

  collapseAll(): void {
    for (const key of [...this.expanded]) this.toggle(key, false);
  }

  /** The rows the person chose: the selection, or the focused row. */
  chosen(): TreeNode[] {
    const keys = this.selected.size > 0 ? [...this.selected] : this.focusKey ? [this.focusKey] : [];
    return keys.flatMap((key) => this.items.get(key)?.node ?? []);
  }

  /** The node of a key, if it is drawn. */
  node(key: string): TreeNode | undefined {
    return this.items.get(key)?.node;
  }

  /** Puts focus on a row; with `move`, the page's focus too, and the row comes into view. */
  setFocus(key: string, move: boolean): void {
    if (!this.items.has(key)) return;
    this.focusKey = key;
    for (const [k, item] of this.items) item.li.tabIndex = k === key ? 0 : -1;
    if (move) {
      const li = this.items.get(key)!.li;
      li.focus({ preventScroll: true });
      li.querySelector(".tree-row")?.scrollIntoView({ block: "nearest" });
    }
  }

  /** Focuses the tree: the focused row, else the open file, else the first row. */
  focus(): void {
    const key = this.focusKey ?? this.current.file ?? this.rows[0]?.node.key;
    if (key) this.setFocus(key, true);
  }

  /** Draws attention to a row that was just made, renamed or moved, and brings it into view. */
  flash(key: string): void {
    const item = this.items.get(key);
    if (!item) return;
    item.row.scrollIntoView({ block: "nearest" });
    item.li.classList.remove("flash");
    void item.li.offsetWidth;
    item.li.classList.add("flash");
    setTimeout(() => item.li.classList.remove("flash"), 700);
  }

  // Rename in the row ----------------------------------------------------------------------------

  /** Puts a box in the row in place of its name; Enter keeps the new name, Escape the old. */
  startRename(key: string, value: string): void {
    const item = this.items.get(key);
    if (!item || !this.actions.editable()) return;
    this.endRename();
    const words = messages().explorer.actions;
    const input = h("input", {
      type: "text",
      class: "tree-rename",
      value,
      spellcheck: "false",
      autocomplete: "off",
      "aria-label": words.renameLabel(item.node.name),
    }) as HTMLInputElement;
    const problem = h("div", { class: "tree-rename-problem", role: "alert", hidden: true });
    this.renaming = { key, input, problem };
    item.name.replaceChildren(input);
    item.row.append(problem);
    /** Set while a rename is being made, so that the box leaving the page does not make it again. */
    let committing = false;
    const done = (keep: boolean) => {
      if (this.renaming?.input !== input || committing) return;
      if (keep && input.value.trim() !== item.node.name) {
        committing = true;
        const reason = this.actions.rename(item.node, input.value);
        committing = false;
        if (reason !== undefined) {
          problem.textContent = reason;
          problem.hidden = false;
          input.setAttribute("aria-invalid", "true");
          input.focus();
          return;
        }
        // The row is another one now: the explorer focuses it.
        this.endRename();
        return;
      }
      this.endRename();
      this.setFocus(key, true);
    };
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        e.preventDefault();
        done(true);
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.endRename();
        this.setFocus(key, true);
      }
    });
    input.addEventListener("input", () => {
      problem.hidden = true;
      input.removeAttribute("aria-invalid");
    });
    // Leaving the box keeps a name that is accepted, and forgets one that is not.
    input.addEventListener("blur", () => {
      if (this.renaming?.input !== input || committing) return;
      if (input.value.trim() !== item.node.name) {
        committing = true;
        this.actions.rename(item.node, input.value);
        committing = false;
      }
      this.endRename();
    });
    input.addEventListener("click", (e) => e.stopPropagation());
    input.focus();
    const dot = value.lastIndexOf(".");
    input.setSelectionRange(0, dot > 0 ? dot : value.length);
  }

  /** Whether a rename box is open. */
  get isRenaming(): boolean {
    return this.renaming !== undefined;
  }

  /** Closes the rename box, if one is open, and shows the row's name again. */
  endRename(): void {
    const renaming = this.renaming;
    if (!renaming) return;
    this.renaming = undefined;
    renaming.problem.remove();
    const item = this.items.get(renaming.key);
    // A row renamed is another row now: the box goes with the old one, which is fading.
    if (item) item.name.textContent = item.node.name;
    else renaming.input.remove();
  }

  // Pointer --------------------------------------------------------------------------------------

  private itemOf(target: EventTarget | null): Item | undefined {
    const li = (target as HTMLElement | null)?.closest<HTMLLIElement>("li[role=treeitem]");
    return li?.dataset.key ? this.items.get(li.dataset.key) : undefined;
  }

  private onClick(e: MouseEvent): void {
    const item = this.itemOf(e.target);
    if (!item) return;
    const target = e.target as HTMLElement;
    if (target.closest(".tree-more")) {
      e.stopPropagation();
      this.selectOnly(item.node.key);
      this.actions.menu(item.node, item.more);
      return;
    }
    const additive = e.ctrlKey || e.metaKey;
    if (e.shiftKey && this.anchor) {
      this.selectRange(this.anchor, item.node.key);
      this.setFocus(item.node.key, true);
      this.syncStates();
      return;
    }
    if (additive) {
      if (this.selected.has(item.node.key)) this.selected.delete(item.node.key);
      else this.selected.add(item.node.key);
      this.anchor = item.node.key;
      this.setFocus(item.node.key, true);
      this.syncStates();
      return;
    }
    this.selectOnly(item.node.key);
    this.setFocus(item.node.key, true);
    // The chevron of a file with diagrams opens it; a folder opens and closes from anywhere.
    if (item.node.kind === "folder" || target.closest(".tree-twist")) {
      this.toggle(item.node.key);
      if (item.node.kind === "folder") return;
    }
    if (!target.closest(".tree-twist")) this.actions.activate(item.node);
  }

  private onContextMenu(e: MouseEvent): void {
    e.preventDefault();
    const item = this.itemOf(e.target);
    if (item && !this.selected.has(item.node.key)) this.selectOnly(item.node.key);
    if (item) this.setFocus(item.node.key, true);
    this.actions.menu(item?.node, { x: e.clientX, y: e.clientY });
  }

  private selectOnly(key: string): void {
    this.selected = new Set([key]);
    this.anchor = key;
    this.syncStates();
  }

  private selectRange(from: string, to: string): void {
    const keys = this.rows.map((r) => r.node.key);
    const a = keys.indexOf(from);
    const b = keys.indexOf(to);
    if (a < 0 || b < 0) return;
    this.selected = new Set(keys.slice(Math.min(a, b), Math.max(a, b) + 1));
  }

  // Keys ---------------------------------------------------------------------------------------

  private onKey(e: KeyboardEvent): void {
    if (this.renaming || e.target instanceof HTMLInputElement) return;
    const index = this.rows.findIndex((r) => r.node.key === this.focusKey);
    const row = this.rows[index];
    if (!row) return;
    const node = row.node;
    const go = (to: number, extend = false) => {
      const next = this.rows[Math.max(0, Math.min(this.rows.length - 1, to))];
      if (!next) return;
      if (extend && this.anchor) this.selectRange(this.anchor, next.node.key);
      else if (!extend) this.anchor = next.node.key;
      this.setFocus(next.node.key, true);
      this.syncStates();
    };
    const handled = (): boolean => {
      switch (e.key) {
        case "ArrowDown":
          go(index + 1, e.shiftKey);
          return true;
        case "ArrowUp":
          go(index - 1, e.shiftKey);
          return true;
        case "Home":
          go(0, e.shiftKey);
          return true;
        case "End":
          go(this.rows.length - 1, e.shiftKey);
          return true;
        case "ArrowRight":
          if (node.children.length === 0) return true;
          if (!this.expanded.has(node.key)) this.toggle(node.key, true);
          else go(index + 1);
          return true;
        case "ArrowLeft":
          if (node.children.length > 0 && this.expanded.has(node.key)) this.toggle(node.key, false);
          else if (row.parent) {
            this.setFocus(row.parent, true);
            this.syncStates();
          }
          return true;
        case "Enter":
          if (e.ctrlKey || e.metaKey || e.altKey) return false;
          this.selectOnly(node.key);
          if (node.kind === "folder") this.toggle(node.key);
          else this.actions.activate(node);
          return true;
        case " ":
          if (e.ctrlKey || e.metaKey) {
            if (this.selected.has(node.key)) this.selected.delete(node.key);
            else this.selected.add(node.key);
            this.syncStates();
            return true;
          }
          this.selectOnly(node.key);
          if (node.kind === "folder") this.toggle(node.key);
          else this.actions.activate(node);
          return true;
        case "ContextMenu":
          this.actions.menu(node, this.items.get(node.key)!.row);
          return true;
        case "F10":
          if (!e.shiftKey) return false;
          this.actions.menu(node, this.items.get(node.key)!.row);
          return true;
        case "*": {
          // Opens every folder beside the focused row, as the tree pattern's asterisk does.
          const siblings = this.rows.filter((r) => r.parent === row.parent);
          for (const sibling of siblings) this.toggle(sibling.node.key, true);
          return true;
        }
        default:
          return false;
      }
    };
    if (handled() || this.actions.key(node, e)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    // Typing a letter goes to the next row whose name starts with what was typed.
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && e.key !== " ") {
      const now = Date.now();
      this.typed = now - this.typedAt > 600 ? e.key : this.typed + e.key;
      this.typedAt = now;
      const lower = this.typed.toLocaleLowerCase();
      const order = [...this.rows.slice(index + (this.typed.length === 1 ? 1 : 0)), ...this.rows];
      const found = order.find((r) => r.node.name.toLocaleLowerCase().startsWith(lower));
      if (found) {
        this.anchor = found.node.key;
        this.setFocus(found.node.key, true);
        this.syncStates();
      }
      e.preventDefault();
    }
  }

  // Drag and drop --------------------------------------------------------------------------------

  /** The folder a drop over this element goes into: a folder's own, a file's, or the root. */
  private dropFolder(target: EventTarget | null): { folder: string; li: HTMLElement | undefined } {
    const item = this.itemOf(target);
    if (!item) return { folder: "", li: undefined };
    if (item.node.kind === "folder") return { folder: item.node.path, li: item.li };
    const folder = folderOf(item.node.path);
    return { folder, li: folder === "" ? undefined : this.items.get(`d:${folder}`)?.li };
  }

  private showTarget(li: HTMLElement | undefined, root: boolean): void {
    const next = li ?? (root ? this.element : undefined);
    if (this.target === next) return;
    this.target?.classList.remove("drop-target");
    this.target = next;
    next?.classList.add("drop-target");
    clearTimeout(this.hoverOpen);
    const key = li?.dataset.key;
    if (key && !this.expanded.has(key)) {
      // A folder held under the pointer opens, as file managers do.
      this.hoverOpen = setTimeout(() => this.toggle(key, true), 600);
    }
  }

  private endDrag(): void {
    clearTimeout(this.hoverOpen);
    this.target?.classList.remove("drop-target");
    this.target = undefined;
    for (const node of this.dragging) this.items.get(node.key)?.li.classList.remove("dragging");
    this.dragging = [];
    document.querySelector(".tree-drag-chip")?.remove();
  }

  private dragBehaviour(): void {
    const tree = this.element;
    tree.addEventListener("dragstart", (e) => {
      const item = this.itemOf(e.target);
      if (!item || !e.dataTransfer || !this.actions.editable() || this.renaming) {
        e.preventDefault();
        return;
      }
      if (!this.selected.has(item.node.key)) this.selectOnly(item.node.key);
      this.dragging = this.chosen().filter((n) => n.kind === "file" || n.kind === "folder");
      if (this.dragging.length === 0) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData(PATHS_TYPE, JSON.stringify(this.dragging.map((n) => n.key)));
      e.dataTransfer.setData("text/plain", this.dragging.map((n) => n.path).join("\n"));
      // The picture under the pointer: the row's icon and name, and how many more go along.
      const chip = h(
        "div",
        { class: "tree-drag-chip" },
        icon(nodeIcon(item.node.icon)),
        h("span", {}, item.node.name),
        ...(this.dragging.length > 1
          ? [h("span", { class: "count" }, `+${this.dragging.length - 1}`)]
          : []),
      );
      document.body.append(chip);
      e.dataTransfer.setDragImage(chip, 12, 14);
      for (const node of this.dragging) this.items.get(node.key)?.li.classList.add("dragging");
    });
    tree.addEventListener("dragend", () => this.endDrag());
    const over = (e: DragEvent) => {
      const types = [...(e.dataTransfer?.types ?? [])];
      const inner = types.includes(PATHS_TYPE);
      const files = types.includes("Files");
      if ((!inner && !files) || !this.actions.editable()) return;
      e.preventDefault();
      const { folder, li } = this.dropFolder(e.target);
      if (inner) {
        // A row cannot go into itself or where it already is.
        const refused = this.dragging.some(
          (n) =>
            (n.kind === "folder" && (folder === n.path || folder.startsWith(`${n.path}/`))) ||
            folderOf(n.path) === folder,
        );
        if (refused) {
          e.dataTransfer!.dropEffect = "none";
          this.showTarget(undefined, false);
          return;
        }
      }
      e.dataTransfer!.dropEffect = inner ? "move" : "copy";
      this.showTarget(li, folder === "");
    };
    tree.addEventListener("dragenter", over);
    tree.addEventListener("dragover", over);
    tree.addEventListener("dragleave", (e) => {
      if (!tree.contains(e.relatedTarget as Node | null)) this.showTarget(undefined, false);
    });
    tree.addEventListener("drop", (e) => {
      const types = [...(e.dataTransfer?.types ?? [])];
      if (!types.includes(PATHS_TYPE) && !types.includes("Files")) return;
      e.preventDefault();
      const { folder } = this.dropFolder(e.target);
      const files = [...(e.dataTransfer?.files ?? [])];
      const moving = this.dragging;
      this.endDrag();
      if (types.includes(PATHS_TYPE) && moving.length > 0) this.actions.move(moving, folder);
      else if (files.length > 0) this.actions.drop(files, folder);
    });
  }
}
