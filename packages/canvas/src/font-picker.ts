import type { FontOption } from "@meltemi/diagrams-editor/canvas";
import { ICONS, h, icon } from "./dom.js";
import { pickerPlace } from "./icon-picker.js";
import { messages } from "./messages/index.js";

/** The groups of the picker, in the order it shows them. */
export const FONT_PICKER_GROUPS = ["sans", "serif", "mono", "hand", "project"] as const;
type FontGroup = (typeof FONT_PICKER_GROUPS)[number];

/** A group of the picker's rows: its families in the order the session listed them. */
export interface FontRowGroup {
  readonly group: FontGroup;
  readonly families: readonly FontOption[];
}

/**
 * The rows the picker shows for a search: the families whose name contains every word typed,
 * in any case, in their groups (Sans, Serif, Monospace, Handwriting, Project fonts); groups left
 * empty are left out.
 */
export function fontRows(families: readonly FontOption[], query: string): FontRowGroup[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (f: FontOption) => words.every((w) => f.family.toLowerCase().includes(w));
  return FONT_PICKER_GROUPS.map((group) => ({
    group,
    families: families.filter((f) => f.group === group && matches(f)),
  })).filter((g) => g.families.length > 0);
}

/** The first family of a CSS font stack, without quotes. */
export function firstFamily(stack: string): string {
  return (stack.split(",")[0] ?? "").trim().replace(/^["']|["']$/g, "");
}

/**
 * What a font button shows: the written family, or the one that applies greyed (`inherited`),
 * "custom" for a written stack whose first family the picker does not list, "mixed" for a
 * selection whose values differ. `family` is the family to draw the name in, when there is one.
 */
export function fontShown(
  value: string | null,
  placeholder: string | undefined,
  mixed: boolean,
  families: readonly string[] | undefined,
): { readonly text: string; readonly family?: string; readonly state: FontState } {
  const words = messages().fontPicker;
  if (mixed) return { text: messages().inspector.mixed, state: "mixed" };
  if (value === null) {
    return placeholder
      ? { text: placeholder, family: placeholder, state: "inherited" }
      : { text: words.theme, state: "inherited" };
  }
  const family = firstFamily(value);
  if (families && !families.includes(family)) return { text: words.custom, state: "custom" };
  return { text: family, family, state: "written" };
}

export type FontState = "written" | "inherited" | "custom" | "mixed";

/**
 * The name a picker uses for a family in its own faces, so that the rules it adds never change
 * how the page's other text is drawn.
 */
export function rowFamily(family: string): string {
  return `mdg-font ${family}`;
}

/** A face rule of the session renamed to the picker's own family name (`rowFamily`). */
export function rowFace(rule: string): string {
  return rule.replace(/font-family:"([^"]+)"/, (_, family: string) => {
    return `font-family:"${rowFamily(family)}"`;
  });
}

/** What the font picker asks of the canvas. */
export interface FontPickerActions {
  /** Asks the session for the families; `received` takes the answer. */
  list(token: number): void;
}

/** How the font picker is opened. */
export interface FontPickerOptions {
  readonly at: { readonly x: number; readonly y: number };
  readonly bounds: { readonly width: number; readonly height: number };
  readonly above?: number;
  /** The button that opened it: marked expanded while it is open; a press on it toggles. */
  readonly opener?: HTMLElement;
  /** Finds the opener again once a render has drawn it anew. */
  readonly findOpener?: () => HTMLElement | null;
  /** The family written, or null when the field inherits. */
  readonly current: string | null;
  /** The words of the row that writes nothing: "theme" in the strip, "inherit" in the panel. */
  readonly inherit: string;
  /** A family chosen, or null for the row that inherits again. */
  readonly choose: (family: string | null) => void;
}

/** A row of the list: the inheriting row (`family` null) or a family. */
interface Row {
  readonly family: string | null;
  readonly element: HTMLElement;
}

/**
 * The font picker: a popover under its button with a search field that filters as it is typed,
 * the families in groups, each row its name and "Aa" drawn in the family itself, a row that
 * inherits again, a lock on a project font that only measures. The arrows move through the rows
 * while the search keeps the focus, Enter or a click chooses, Escape closes and gives the focus
 * back. Families whose faces have not arrived are drawn in the interface font at the same height,
 * and swap in place when a later answer brings them.
 */
export class FontPicker {
  readonly element = h("div", {
    class: "font-picker",
    id: "mdg-fonts",
    role: "dialog",
    hidden: true,
    "aria-label": messages().fontPicker.label,
  });
  private readonly input: HTMLInputElement;
  private readonly list = h("div", {
    class: "font-results",
    id: "mdg-font-results",
    role: "listbox",
    "aria-label": messages().fontPicker.results,
  });
  private readonly faces = h("style", {});
  private readonly status = h("div", { class: "font-picker-status", "aria-live": "polite" });
  private options: FontPickerOptions | undefined;
  private families: readonly FontOption[] = [];
  /** The faces already in the picker's style, by family. */
  private readonly loaded = new Map<string, number>();
  private token = 0;
  /** Enter came before the families arrived: the first row is chosen when they do. */
  private chooseOnAnswer = false;
  private rows: Row[] = [];
  private active = -1;
  private returnFocus: HTMLElement | null = null;
  private readonly outside = (e: PointerEvent) => {
    const target = e.target as Node;
    if (!this.element.contains(target) && !this.currentOpener()?.contains(target))
      this.close(false);
  };

  constructor(private readonly actions: FontPickerActions) {
    const words = messages().fontPicker;
    this.input = h("input", {
      type: "search",
      class: "font-search-input",
      placeholder: words.search,
      "aria-label": words.searchLabel,
      role: "combobox",
      "aria-controls": "mdg-font-results",
      "aria-autocomplete": "list",
      "aria-expanded": "true",
      autocomplete: "off",
      spellcheck: "false",
    });
    this.input.addEventListener("input", () => {
      this.chooseOnAnswer = false;
      this.draw(false);
    });
    this.input.addEventListener("keydown", (e) => this.key(e));
    this.element.append(
      this.faces,
      h("label", { class: "icon-search font-search" }, icon(ICONS.search), this.input),
      this.list,
      this.status,
    );
    this.element.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") {
        e.preventDefault();
        this.close(true);
      }
    });
    // A press on a row or a gap leaves the focus in the search, so the keys go on working there.
    this.element.addEventListener("pointerdown", (e) => {
      if (e.target === this.input) return;
      const box = this.list.getBoundingClientRect();
      if (e.target === this.list && e.clientX - box.left > this.list.clientWidth) return;
      e.preventDefault();
      if (document.activeElement !== this.input) this.input.focus({ preventScroll: true });
    });
    this.element.addEventListener("focusout", (e) => {
      const next = e.relatedTarget as Node | null;
      if (next && !this.element.contains(next) && !this.currentOpener()?.contains(next)) {
        this.close(false);
      }
    });
  }

  get isOpen(): boolean {
    return !this.element.hidden;
  }

  get opener(): HTMLElement | undefined {
    return this.currentOpener();
  }

  private currentOpener(): HTMLElement | undefined {
    const options = this.options;
    const opener = options?.opener;
    if (!options || !opener || opener.isConnected) return opener;
    const found = options.findOpener?.();
    if (!found) return opener;
    found.setAttribute("aria-expanded", "true");
    if (this.returnFocus === opener) this.returnFocus = found;
    this.options = { ...options, opener: found };
    return found;
  }

  open(options: FontPickerOptions): void {
    this.close(false);
    this.options = options;
    this.returnFocus = document.activeElement as HTMLElement | null;
    this.input.value = "";
    this.active = -1;
    this.chooseOnAnswer = false;
    options.opener?.setAttribute("aria-expanded", "true");
    this.element.hidden = false;
    this.draw(true);
    this.place(options);
    document.addEventListener("pointerdown", this.outside, true);
    this.input.focus({ preventScroll: true });
    this.ask();
  }

  close(refocus = true): void {
    if (this.element.hidden) return;
    const opener = this.currentOpener();
    this.element.hidden = true;
    document.removeEventListener("pointerdown", this.outside, true);
    opener?.setAttribute("aria-expanded", "false");
    this.options = undefined;
    this.token++;
    if (refocus && this.returnFocus?.isConnected) this.returnFocus.focus({ preventScroll: true });
  }

  /** After a render: the opener is found again, and the families are asked for anew. */
  refresh(): void {
    if (this.element.hidden) return;
    this.currentOpener();
    this.ask();
  }

  /** The answer to `listFonts`: drawn when it is the last one asked for. */
  received(token: number, families: readonly FontOption[]): void {
    if (token !== this.token || this.element.hidden) return;
    this.families = families;
    // The faces a row needs, added once; a family whose faces arrive later swaps in place.
    const rules: string[] = [];
    for (const family of families) {
      if (family.faces.length === 0 || this.loaded.get(family.family) === family.faces.length) {
        continue;
      }
      this.loaded.set(family.family, family.faces.length);
      rules.push(...family.faces.map(rowFace));
    }
    if (rules.length > 0) this.faces.append(document.createTextNode(`${rules.join("\n")}\n`));
    this.draw(false);
    if (this.chooseOnAnswer) {
      this.chooseOnAnswer = false;
      const row = this.rows[this.active];
      if (row) this.choose(row.family);
    }
  }

  private ask(): void {
    this.token++;
    this.actions.list(this.token);
  }

  private place(options: FontPickerOptions): void {
    const place = pickerPlace(options.at, options.bounds, this.element.offsetWidth, options.above);
    const style = this.element.style;
    style.left = `${place.left}px`;
    style.top = place.top === undefined ? "auto" : `${place.top}px`;
    style.bottom = place.bottom === undefined ? "auto" : `${place.bottom}px`;
    style.maxHeight = `${place.maxHeight}px`;
    this.element.dataset.side = place.side;
  }

  /** Draws the rows; `opening` makes the written family (or the inheriting row) the active one. */
  private draw(opening: boolean): void {
    const words = messages().fontPicker;
    const options = this.options;
    const current = options?.current === null || !options ? null : firstFamily(options.current);
    const query = this.input.value;
    const groups = fontRows(this.families, query);
    this.list.replaceChildren();
    this.rows = [];
    const add = (row: Row) => {
      row.element.dataset.index = String(this.rows.length);
      row.element.id = `mdg-font-${this.rows.length}`;
      this.rows.push(row);
    };
    if (query.trim() === "") {
      const element = h(
        "div",
        {
          class: "font-option inherit",
          role: "option",
          "aria-selected": String(current === null),
        },
        h("span", { class: "font-name" }, options?.inherit ?? words.theme),
      );
      add({ family: null, element });
      this.list.append(element);
    }
    for (const group of groups) {
      const titleId = `mdg-font-group-${group.group}`;
      const block = h(
        "div",
        { class: "font-group", role: "group", "aria-labelledby": titleId },
        h("div", { class: "font-group-title", id: titleId }, words.groups[group.group]),
      );
      for (const family of group.families) {
        const drawn = family.faces.length > 0;
        const style = drawn ? `font-family:"${rowFamily(family.family)}", system-ui` : undefined;
        const element = h(
          "div",
          {
            class: drawn ? "font-option" : "font-option waiting",
            role: "option",
            "aria-selected": String(current === family.family),
            "data-family": family.family,
            title: family.restricted ? words.restricted(family.family) : family.family,
          },
          h("span", { class: "font-name", style }, family.family),
          h("span", { class: "font-sample", style, "aria-hidden": "true" }, "Aa"),
        );
        if (family.restricted) element.append(icon(ICONS.lock));
        add({ family: family.family, element });
        block.append(element);
      }
      this.list.append(block);
    }
    for (const row of this.rows) {
      row.element.addEventListener("click", () => this.choose(row.family));
      row.element.addEventListener("pointermove", () => {
        const index = Number(row.element.dataset.index);
        if (index !== this.active) this.activate(index, false);
      });
    }
    if (this.families.length > 0 && groups.length === 0) {
      this.status.textContent = words.none(query.trim());
      this.status.hidden = false;
    } else if (this.families.length === 0) {
      this.status.textContent = words.loading;
      this.status.hidden = false;
    } else {
      this.status.hidden = true;
    }
    const chosen = this.rows.findIndex((r) => r.family === current);
    const keep = this.active >= 0 && this.active < this.rows.length ? this.active : 0;
    this.activate(opening && chosen >= 0 ? chosen : query.trim() !== "" ? 0 : keep, opening);
  }

  private activate(index: number, scroll: boolean): void {
    this.rows[this.active]?.element.classList.remove("active");
    this.active = this.rows.length === 0 ? -1 : Math.max(0, Math.min(index, this.rows.length - 1));
    const row = this.rows[this.active];
    if (!row) {
      this.input.removeAttribute("aria-activedescendant");
      return;
    }
    row.element.classList.add("active");
    this.input.setAttribute("aria-activedescendant", row.element.id);
    if (scroll) row.element.scrollIntoView({ block: "nearest" });
  }

  private key(e: KeyboardEvent): void {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      this.activate(this.active + (e.key === "ArrowDown" ? 1 : -1), true);
    } else if (e.key === "Home" || e.key === "End") {
      if (this.input.value !== "") return;
      e.preventDefault();
      this.activate(e.key === "Home" ? 0 : this.rows.length - 1, true);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = this.rows[this.active];
      if (row) this.choose(row.family);
      else if (this.families.length === 0) this.chooseOnAnswer = true;
    }
  }

  private choose(family: string | null): void {
    const options = this.options;
    if (!options) return;
    this.close(true);
    options.choose(family);
  }
}
