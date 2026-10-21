import type { LibraryInfo, LibraryItemInfo } from "@meltemi/diagrams-editor/canvas";
import { clear, h } from "./dom.js";
import type { IconPlacement } from "./glyphs.js";
import { messages } from "./messages/index.js";
import { PlacementControl } from "./placement.js";

export interface LibraryActions {
  /** Asks the host for the elements of a category, or for a search. */
  items(library: string, category: string): void;
  search(query: string): void;
  /** Creates an element at the centre of the view, as the placement control says. */
  create(item: LibraryItemInfo): void;
  /**
   * An element dragged out of the panel, past the threshold: the canvas follows the pointer from
   * here, highlighting the shape it would give the icon to, and drops it where the drag ends.
   */
  drag(item: LibraryItemInfo, event: PointerEvent): void;
  /** A new placement chosen in the panel's placement control. */
  placement(placement: IconPlacement): void;
}

/** How far a pointer moves before an element is dragged instead of clicked, in screen pixels. */
const DRAG_THRESHOLD = 4;

/**
 * The element libraries panel: a search box, the placement control (the icon as the shape, in a
 * box, or alone), the libraries with their categories, and the elements of the open categories
 * with their thumbnails; a click creates, a drag drops onto the canvas or onto a shape.
 */
export class LibraryPanel {
  readonly element = h("aside", {
    class: "panel library",
    "aria-label": messages().library.label,
    tabindex: -1,
    hidden: true,
  });
  private libraries: readonly LibraryInfo[] = [];
  private readonly open = new Set<string>();
  private readonly items = new Map<string, readonly LibraryItemInfo[]>();
  private readonly input: HTMLInputElement;
  private readonly results = h("div", { class: "library-results", hidden: true });
  private readonly list = h("div", { class: "library-list" });
  private query = "";
  private searchResults: readonly LibraryItemInfo[] = [];
  private readonly control: PlacementControl;

  constructor(private readonly actions: LibraryActions) {
    const words = messages().library;
    this.input = h("input", {
      type: "search",
      placeholder: words.search,
      "aria-label": words.search,
      autocomplete: "off",
    });
    this.input.addEventListener("input", () => {
      this.query = this.input.value.trim();
      if (this.query === "") {
        this.searchResults = [];
        this.draw();
      } else this.actions.search(this.query);
    });
    this.input.addEventListener("keydown", (e) => e.stopPropagation());
    this.control = new PlacementControl((placement) => this.actions.placement(placement));
    this.element.append(
      h("h2", {}, words.title),
      this.input,
      this.control.element,
      this.results,
      this.list,
    );
  }

  /** Shows the current placement, among those of a free diagram or of a flow one. */
  setPlacement(placement: IconPlacement, free: boolean): void {
    this.control.set(placement, free);
  }

  /** The libraries the host knows; categories keep their open state and their elements. */
  show(libraries: readonly LibraryInfo[]): void {
    this.libraries = libraries;
    this.draw();
    for (const key of this.open) {
      if (!this.items.has(key)) {
        const [library, category] = key.split("/") as [string, string];
        this.actions.items(library, category);
      }
    }
  }

  received(library: string, category: string, items: readonly LibraryItemInfo[]): void {
    this.items.set(`${library}/${category}`, items);
    this.draw();
  }

  searched(query: string, items: readonly LibraryItemInfo[]): void {
    if (query !== this.query) return;
    this.searchResults = items;
    this.draw();
  }

  /** Asks again for the elements whose thumbnails were missing: a pack may have arrived. */
  refreshMissing(): void {
    for (const [key, items] of this.items) {
      const [library, category] = key.split("/") as [string, string];
      const expected =
        this.libraries.find((l) => l.id === library)?.categories.find((c) => c.id === category)
          ?.count ?? 0;
      // Fewer elements than the category holds: its pack was not there yet.
      if (items.length < expected || items.some((i) => i.svg === null)) {
        this.actions.items(library, category);
      }
    }
    if (this.query !== "") this.actions.search(this.query);
  }

  focus(): void {
    this.input.focus();
  }

  private draw(): void {
    const words = messages().library;
    clear(this.results);
    clear(this.list);
    if (this.query !== "") {
      this.results.hidden = false;
      this.list.hidden = true;
      if (this.searchResults.length === 0) {
        this.results.append(h("p", { class: "field-hint" }, words.noResults(this.query)));
      } else this.results.append(this.grid(this.searchResults, true));
      return;
    }
    this.results.hidden = true;
    this.list.hidden = false;
    if (this.libraries.length === 0) {
      this.list.append(h("p", { class: "field-hint" }, words.none));
      return;
    }
    for (const library of this.libraries) {
      const section = h("section", { class: "library-section" });
      section.append(h("h3", {}, library.title));
      for (const category of library.categories) {
        const key = `${library.id}/${category.id}`;
        const opened = this.open.has(key);
        const button = h(
          "button",
          { type: "button", class: "category", "aria-expanded": String(opened) },
          h("span", { class: "chevron" }, opened ? "▾" : "▸"),
          h("span", { class: "name" }, category.title),
          h("span", { class: "count" }, String(category.count)),
        );
        button.addEventListener("click", () => {
          if (opened) this.open.delete(key);
          else {
            this.open.add(key);
            if (!this.items.has(key)) this.actions.items(library.id, category.id);
          }
          this.draw();
        });
        section.append(button);
        if (opened) {
          const items = this.items.get(key);
          section.append(
            items ? this.grid(items, false) : h("p", { class: "field-hint" }, words.loading),
          );
        }
      }
      this.list.append(section);
    }
  }

  private grid(items: readonly LibraryItemInfo[], withLibrary: boolean): HTMLElement {
    const words = messages().library;
    const grid = h("div", { class: "library-grid", role: "list" });
    for (const item of items) {
      const title = withLibrary
        ? `${item.label} · ${this.libraries.find((l) => l.id === item.library)?.title ?? item.library}`
        : item.label;
      const button = h("button", {
        type: "button",
        class: "library-item",
        role: "listitem",
        title: words.itemTitle(title),
        "data-icon": item.icon,
      });
      const picture = h("span", { class: "thumb", "aria-hidden": "true" });
      if (item.svg) picture.innerHTML = item.svg;
      button.append(picture, h("span", { class: "label" }, item.label));
      this.attach(button, item);
      grid.append(button);
    }
    return grid;
  }

  /**
   * A click creates at the centre; a press that moves hands the drag to the canvas, which creates
   * where it ends or gives the icon to the shape it ends on.
   */
  private attach(button: HTMLButtonElement, item: LibraryItemInfo): void {
    button.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      // A drag selects no text on its way across the panels; the element takes the focus all the
      // same, so the keys go on from it.
      e.preventDefault();
      button.focus({ preventScroll: true });
      const pointer = e.pointerId;
      const start = { x: e.clientX, y: e.clientY };
      const stop = () => {
        document.removeEventListener("pointermove", move, true);
        document.removeEventListener("pointerup", up, true);
        document.removeEventListener("pointercancel", stop, true);
      };
      const move = (event: PointerEvent) => {
        if (event.pointerId !== pointer) return;
        if (Math.hypot(event.clientX - start.x, event.clientY - start.y) < DRAG_THRESHOLD) return;
        stop();
        button.classList.add("dragging");
        this.actions.drag(item, event);
        const done = () => {
          button.classList.remove("dragging");
          document.removeEventListener("pointerup", done, true);
          document.removeEventListener("pointercancel", done, true);
        };
        document.addEventListener("pointerup", done, true);
        document.addEventListener("pointercancel", done, true);
      };
      const up = (event: PointerEvent) => {
        if (event.pointerId !== pointer) return;
        stop();
        this.actions.create(item);
      };
      document.addEventListener("pointermove", move, true);
      document.addEventListener("pointerup", up, true);
      document.addEventListener("pointercancel", stop, true);
    });
    button.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this.actions.create(item);
      }
    });
  }
}
