import { findShapes, type ShapeName } from "@meltemi/diagrams-editor/canvas";
import { clear, h } from "./dom.js";
import { glyph, glyphName } from "./glyphs.js";
import { messages } from "./messages/index.js";

/** The columns of the grid, which the up and down arrows step over. */
const COLUMNS = 4;

/**
 * The grid of the twenty-three shapes that the arrow of the box (free) or node (flow) button opens,
 * and F: a picture and a name for each shape, in four columns, the current one checked. Typing
 * finds a shape by its name in the interface language or in English (Backspace takes a letter
 * back), the arrows move, Enter, Space or a click chooses, and Escape closes and gives the focus
 * back to where it was. It is the inspector's picture grid with names and a search.
 */
export class ShapeGrid {
  readonly element = h("div", {
    class: "shape-menu",
    id: "mdg-shapes",
    role: "dialog",
    hidden: true,
    "aria-label": messages().shapeGrid.label,
  });
  /** What has been typed, or how to search; read out as it changes. */
  private readonly filter = h("div", {
    class: "shape-filter",
    id: "mdg-shapes-filter",
    "aria-live": "polite",
  });
  private readonly grid = h("div", {
    class: "shape-grid",
    role: "radiogroup",
    "aria-label": messages().shapeGrid.label,
    "aria-describedby": "mdg-shapes-filter",
  });
  private query = "";
  private current: ShapeName = "rounded";
  private choose: ((shape: ShapeName) => void) | undefined;
  /** The button that opened the grid, which says whether it is open; none for F. */
  private opener: HTMLElement | undefined;
  private returnFocus: HTMLElement | null = null;
  /** A press elsewhere closes the grid; a press on its own button closes it through the button. */
  private readonly outside = (e: PointerEvent) => {
    const target = e.target as Node;
    if (!this.element.contains(target) && !this.opener?.contains(target)) this.close(false);
  };

  constructor() {
    this.element.append(this.filter, this.grid);
    this.element.addEventListener("keydown", (e) => this.key(e));
  }

  get isOpen(): boolean {
    return !this.element.hidden;
  }

  /**
   * Opens the grid at `at` (in the coordinates of the element it lives in, kept inside `bounds`)
   * with `current` checked and focused; `choose` receives the shape chosen, after the grid closed.
   * `opener`, the button pressed, is marked expanded while the grid is open.
   */
  open(options: {
    readonly at: { readonly x: number; readonly y: number };
    readonly bounds: { readonly width: number; readonly height: number };
    readonly current: ShapeName;
    readonly choose: (shape: ShapeName) => void;
    readonly opener?: HTMLElement;
  }): void {
    this.close(false);
    this.returnFocus = document.activeElement as HTMLElement | null;
    this.query = "";
    this.current = options.current;
    this.choose = options.choose;
    this.opener = options.opener;
    this.opener?.setAttribute("aria-expanded", "true");
    this.element.hidden = false;
    this.draw(options.current);
    const { at, bounds } = options;
    const x = Math.min(at.x, bounds.width - this.element.offsetWidth - 4);
    const y = Math.min(at.y, bounds.height - this.element.offsetHeight - 4);
    this.element.style.left = `${Math.max(0, x)}px`;
    this.element.style.top = `${Math.max(0, y)}px`;
    document.addEventListener("pointerdown", this.outside, true);
    this.focused()?.focus();
  }

  /** Closes the grid; with `refocus`, the focus goes back to where the grid was opened from. */
  close(refocus = true): void {
    if (this.element.hidden) return;
    this.element.hidden = true;
    document.removeEventListener("pointerdown", this.outside, true);
    this.opener?.setAttribute("aria-expanded", "false");
    this.opener = undefined;
    if (refocus) this.returnFocus?.focus();
  }

  private chips(): HTMLButtonElement[] {
    return [...this.grid.querySelectorAll<HTMLButtonElement>("button[data-shape]")];
  }

  private focused(): HTMLButtonElement | undefined {
    return this.chips().find((chip) => chip.tabIndex === 0);
  }

  /** Draws the shapes the query finds, with `focus` (or the best one found) as the tab stop. */
  private draw(focus?: ShapeName): void {
    const words = messages();
    const found = findShapes(this.query, (shape) => glyphName(shape, "shape"));
    const stop = focus !== undefined && found.includes(focus) ? focus : found[0];
    this.filter.textContent =
      this.query === ""
        ? words.shapeGrid.hint
        : found.length === 0
          ? words.shapeGrid.none(this.query)
          : words.shapeGrid.typed(this.query);
    this.filter.classList.toggle("typed", this.query !== "");
    clear(this.grid);
    for (const shape of found) {
      const name = glyphName(shape, "shape");
      const chip = h(
        "button",
        {
          type: "button",
          role: "radio",
          class: "chip glyph shape",
          "aria-checked": String(shape === this.current),
          "aria-label": name,
          title: name,
          tabindex: shape === stop ? 0 : -1,
          "data-shape": shape,
        },
        glyph("shape", shape),
        h("span", { class: "name", "aria-hidden": "true" }, name),
      );
      chip.addEventListener("click", () => this.pick(shape));
      this.grid.append(chip);
    }
  }

  private pick(shape: ShapeName): void {
    const choose = this.choose;
    this.close(true);
    choose?.(shape);
  }

  private key(e: KeyboardEvent): void {
    // The canvas's keys stay out while the grid is open.
    e.stopPropagation();
    const chips = this.chips();
    const index = chips.indexOf(document.activeElement as HTMLButtonElement);
    const step =
      e.key === "ArrowRight"
        ? 1
        : e.key === "ArrowLeft"
          ? -1
          : e.key === "ArrowDown"
            ? COLUMNS
            : e.key === "ArrowUp"
              ? -COLUMNS
              : 0;
    if (step !== 0) {
      e.preventDefault();
      if (chips.length === 0) return;
      const next = chips[(Math.max(0, index) + step + chips.length) % chips.length]!;
      for (const chip of chips) chip.tabIndex = chip === next ? 0 : -1;
      next.focus();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      this.close(true);
      return;
    }
    if (e.key === "Tab") {
      this.close(false);
      return;
    }
    if (e.key === "Enter") {
      // Enter chooses the highlighted shape, also when the search found nothing to focus.
      e.preventDefault();
      const chip = index >= 0 ? chips[index] : this.focused();
      if (chip?.dataset.shape) this.pick(chip.dataset.shape as ShapeName);
      return;
    }
    if (e.key === "Backspace") {
      e.preventDefault();
      if (this.query === "") return;
      this.search(this.query.slice(0, -1));
      return;
    }
    // A letter (or a digit, a hyphen…) is searched for; Space is left to press the button.
    if (e.key.length === 1 && e.key !== " " && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      this.search(this.query + e.key);
    }
  }

  private search(query: string): void {
    this.query = query;
    this.draw();
    // The grid keeps the focus: on the best shape found, or on itself when none is.
    const stop = this.focused();
    if (stop) stop.focus();
    else {
      this.grid.tabIndex = -1;
      this.grid.focus();
    }
  }
}
