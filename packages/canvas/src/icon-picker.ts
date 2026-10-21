import type { IconChoiceInfo, IconGroupInfo } from "@meltemi/diagrams-editor/canvas";
import { ICONS, clear, h, icon } from "./dom.js";
import type { IconPlacement } from "./glyphs.js";
import { messages } from "./messages/index.js";
import { PlacementControl } from "./placement.js";

/** How long typing rests before the picker searches, in milliseconds. */
export const SEARCH_DEBOUNCE = 80;
/** How many icons chosen earlier the picker keeps at the top of an empty search. */
export const RECENT_LIMIT = 10;
/** How far a pointer moves before a result is dragged instead of clicked, in screen pixels. */
const DRAG_THRESHOLD = 4;
/** How many results fade in one after the other; the rest fade in with the last of them. */
const STAGGERED = 12;
/** The room the picker wants below its anchor before it opens over it instead, in pixels. */
const ROOMY = 320;

/** A group of the picker's results: the recent icons, or a group the session sent. */
export interface PickerGroup {
  readonly id: string;
  readonly title: string;
  readonly items: readonly IconChoiceInfo[];
}

/**
 * The recent icons after `choice` was chosen: it goes first, once, and the oldest beyond `limit`
 * are forgotten.
 */
export function withRecent(
  recent: readonly IconChoiceInfo[],
  choice: IconChoiceInfo,
  limit = RECENT_LIMIT,
): IconChoiceInfo[] {
  return [choice, ...recent.filter((r) => r.reference !== choice.reference)].slice(0, limit);
}

/**
 * The groups the picker shows: for an empty query the recent icons first, then the session's
 * groups without them, so that each icon is listed once; for a query, the session's groups. Empty
 * groups are left out.
 */
export function pickerGroups(
  recent: readonly IconChoiceInfo[],
  groups: readonly IconGroupInfo[],
  query: string,
  recentTitle: string,
): PickerGroup[] {
  const head = query.trim() === "" && recent.length > 0 ? recent : [];
  const listed = new Set(head.map((r) => r.reference));
  const rest = groups
    .map((g) => ({
      id: g.id,
      title: g.title,
      items: g.items.filter((item) => !listed.has(item.reference)),
    }))
    .filter((g) => g.items.length > 0);
  return head.length > 0 ? [{ id: "recent", title: recentTitle, items: head }, ...rest] : rest;
}

/** Where the picker goes: its left edge, its top or bottom edge, and the height it may take. */
export interface PickerPlace {
  readonly left: number;
  /** The top edge when it opens under its anchor. */
  readonly top?: number;
  /** The distance from the bottom of the bounds when it opens over its anchor, growing upwards. */
  readonly bottom?: number;
  readonly maxHeight: number;
  readonly side: "top" | "bottom";
}

/**
 * Where the picker opens, `width` wide, inside `bounds`: under `at`, as tall as the room below
 * allows; over `above` (the top of its anchor), growing upwards, when the room below is short and
 * the room above is larger. Raised when the room below is short, it never runs past the bounds:
 * on a short canvas it takes the room there is.
 */
export function pickerPlace(
  at: { readonly x: number; readonly y: number },
  bounds: { readonly width: number; readonly height: number },
  width: number,
  above?: number,
): PickerPlace {
  const left = Math.max(4, Math.min(at.x, bounds.width - width - 8));
  const below = bounds.height - at.y - 8;
  const over = above === undefined ? 0 : above - 8;
  if (below < ROOMY && over > below) {
    return { left, bottom: bounds.height - above! + 4, maxHeight: over, side: "top" };
  }
  const top = Math.max(4, Math.min(at.y, bounds.height - ROOMY - 8));
  return { left, top, maxHeight: Math.max(0, bounds.height - top - 8), side: "bottom" };
}

/** Where a result is drawn: its left and top edges and its size, in any one unit. */
export interface Cell {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The result an arrow key moves to from `index` among cells laid out in rows (the groups' grids
 * one under the other): Left and Right go to the previous and next result, through the rows;
 * Up and Down to the row above or below, at the nearest column. At the ends it stays.
 */
export function stepIn(
  cells: readonly Cell[],
  index: number,
  key: "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown",
): number {
  if (cells.length === 0) return -1;
  if (index < 0 || index >= cells.length) return 0;
  if (key === "ArrowLeft") return Math.max(0, index - 1);
  if (key === "ArrowRight") return Math.min(cells.length - 1, index + 1);
  const from = cells[index]!;
  const middle = (c: Cell) => c.y + c.height / 2;
  const below = key === "ArrowDown";
  // The nearest row in that direction: the cells whose middles lie past this one's edge.
  const row = cells
    .map((cell, i) => ({ cell, i }))
    .filter(({ cell }) => (below ? middle(cell) > from.y + from.height : middle(cell) < from.y));
  if (row.length === 0) return index;
  const rowMiddle = below
    ? Math.min(...row.map(({ cell }) => middle(cell)))
    : Math.max(...row.map(({ cell }) => middle(cell)));
  const centre = from.x + from.width / 2;
  let best = row[0]!;
  let distance = Infinity;
  for (const candidate of row) {
    if (Math.abs(middle(candidate.cell) - rowMiddle) > 1) continue;
    const d = Math.abs(candidate.cell.x + candidate.cell.width / 2 - centre);
    if (d < distance) {
      distance = d;
      best = candidate;
    }
  }
  return best.i;
}

/** What the icon picker asks of the canvas. */
export interface IconPickerActions {
  /** Asks the session for the icons that match `query`; `received` takes the answer. */
  search(query: string, token: number): void;
  /** A new placement chosen in the picker's placement control. */
  placement(placement: IconPlacement): void;
  /**
   * A result dragged out of the picker: the canvas follows the pointer from here and ends with
   * `dragEnded`.
   */
  drag(choice: IconChoiceInfo, event: PointerEvent): void;
}

/** How the picker is opened. */
export interface IconPickerOptions {
  /** The point it opens at, in the coordinates of the element it lives in, kept inside `bounds`. */
  readonly at: { readonly x: number; readonly y: number };
  readonly bounds: { readonly width: number; readonly height: number };
  /**
   * The top of what it opens under (in the same coordinates): with too little room below, the
   * picker opens over it instead, growing upwards.
   */
  readonly above?: number;
  /** The button that opened it, marked expanded while it is open; a press on it toggles. */
  readonly opener?: HTMLElement;
  /**
   * Finds the opener again once a render has drawn it anew (the inspector's Choose…), so that it
   * keeps toggling the picker, is marked expanded, and gets the focus back.
   */
  readonly findOpener?: () => HTMLElement | null;
  /**
   * The elements the choice goes to, named in the header; without them the picker places an icon
   * and shows the placement control.
   */
  readonly targets?: readonly string[];
  /** The placement control's choice and whether the diagram takes the icon alone (free). */
  readonly placement?: { readonly current: IconPlacement; readonly free: boolean };
  /** The icon chosen: with a click on a result, or Enter on the active one. */
  readonly choose: (choice: IconChoiceInfo, via: "click" | "enter") => void;
}

/**
 * The icon picker: a popover with a search field focused on open, the icons the session finds as
 * the query is typed (debounced), grouped by pack or library with a thumbnail and a name each, the
 * icons chosen earlier on top of an empty search, and, when it places icons, the placement
 * control. The arrows move through the results while the field keeps the focus, Enter chooses,
 * Escape closes and gives the focus back; a result is clicked or dragged out onto the canvas.
 */
export class IconPicker {
  readonly element = h("div", {
    class: "icon-picker",
    id: "mdg-icons",
    role: "dialog",
    hidden: true,
    "aria-label": messages().iconPicker.label,
  });
  private readonly head = h("div", { class: "icon-picker-head" });
  private readonly input: HTMLInputElement;
  private readonly control: PlacementControl;
  private readonly results = h("div", {
    class: "icon-results",
    id: "mdg-icon-results",
    role: "listbox",
    "aria-label": messages().iconPicker.results,
  });
  private readonly status = h("div", { class: "icon-picker-status", "aria-live": "polite" });
  private readonly foot = h("div", { class: "icon-picker-foot" });
  private options: IconPickerOptions | undefined;
  private recent: IconChoiceInfo[] = [];
  private groups: readonly IconGroupInfo[] = [];
  /** The token of the last search sent; answers to older ones are dropped. */
  private token = 0;
  private pending = false;
  /** Enter came while a search was on its way: its first result is chosen when it arrives. */
  private chooseOnAnswer = false;
  private timer: number | undefined;
  /** The query of the results shown. */
  private shownQuery = "";
  private active = -1;
  private choices: IconChoiceInfo[] = [];
  /** The references drawn last, which do not fade in again when the results change. */
  private drawn = new Set<string>();
  private returnFocus: HTMLElement | null = null;
  /** Where the pointer was last seen while the picker is open, in client pixels. */
  private pointerAt: { x: number; y: number } | undefined;
  /** A press elsewhere closes the picker; one on its own button toggles it through the button. */
  private readonly outside = (e: PointerEvent) => {
    const target = e.target as Node;
    if (this.element.classList.contains("lent")) return;
    if (!this.element.contains(target) && !this.currentOpener()?.contains(target)) {
      this.close(false);
    }
  };
  /**
   * The pointer moving over a result makes it the active one. Only a pointer that really moves:
   * results drawn anew under a pointer at rest (as each query's are) do not take Enter from the
   * first of them.
   */
  private readonly track = (e: PointerEvent) => {
    const last = this.pointerAt;
    this.pointerAt = { x: e.clientX, y: e.clientY };
    if (!last || (last.x === e.clientX && last.y === e.clientY)) return;
    if (e.buttons !== 0 || this.element.classList.contains("lent")) return;
    const option = (e.target as Element | null)?.closest?.<HTMLElement>('[role="option"]');
    if (!option || !this.results.contains(option)) return;
    const index = Number(option.dataset.index);
    if (index !== this.active) this.activate(index, false);
  };
  /** Escape closes the picker even when the focus has gone out of it (to the page, or its button). */
  private readonly escape = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || this.element.contains(e.target as Node)) return;
    e.preventDefault();
    e.stopPropagation();
    this.close(true);
  };

  constructor(private readonly actions: IconPickerActions) {
    const words = messages().iconPicker;
    this.input = h("input", {
      type: "search",
      class: "icon-search-input",
      placeholder: words.search,
      "aria-label": words.searchLabel,
      role: "combobox",
      "aria-controls": "mdg-icon-results",
      "aria-autocomplete": "list",
      "aria-expanded": "true",
      autocomplete: "off",
      spellcheck: "false",
    });
    this.control = new PlacementControl((placement) => this.actions.placement(placement));
    this.input.addEventListener("input", () => this.typed());
    this.input.addEventListener("keydown", (e) => this.key(e));
    this.element.append(
      this.head,
      h("label", { class: "icon-search" }, icon(ICONS.search), this.input),
      this.control.element,
      this.results,
      this.status,
      this.foot,
    );
    // The canvas's keys stay out while the picker is open; Escape closes it from anywhere in it.
    this.element.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape" && e.target !== this.input) {
        e.preventDefault();
        this.close(true);
      }
    });
    // A press on what does not take the focus (a title, the foot, the gaps, a result, a choice of
    // placement) leaves it in the search, so the keys go on working there.
    this.element.addEventListener("pointerdown", (e) => {
      if (e.target === this.input) return;
      // The scrollbar of the results keeps its own drag.
      const results = this.results.getBoundingClientRect();
      if (e.target === this.results && e.clientX - results.left > this.results.clientWidth) return;
      e.preventDefault();
      if (document.activeElement !== this.input) this.input.focus({ preventScroll: true });
    });
    // The focus leaving for elsewhere closes it; for its own button, the button's click does.
    this.element.addEventListener("focusout", (e) => {
      const next = e.relatedTarget as Node | null;
      if (
        next &&
        !this.element.contains(next) &&
        !this.currentOpener()?.contains(next) &&
        !this.element.classList.contains("lent")
      ) {
        this.close(false);
      }
    });
  }

  get isOpen(): boolean {
    return !this.element.hidden;
  }

  /** The button that opened the picker, if any, as it is drawn now. */
  get opener(): HTMLElement | undefined {
    return this.currentOpener();
  }

  /**
   * The opener as it is drawn now: one that a render replaced is found again, marked expanded,
   * and kept, with the focus going back to it.
   */
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

  /** After a render: the opener, drawn anew, is marked expanded again. */
  syncOpener(): void {
    if (!this.element.hidden) this.currentOpener();
  }

  /** Opens the picker with an empty search: the recent icons, then what the session suggests. */
  open(options: IconPickerOptions): void {
    this.close(false);
    this.options = options;
    this.returnFocus = document.activeElement as HTMLElement | null;
    const words = messages().iconPicker;
    const targets = options.targets ?? [];
    this.head.textContent = targets.length > 0 ? words.forTargets(targets) : "";
    this.head.hidden = targets.length === 0;
    const placing = targets.length === 0 && options.placement !== undefined;
    this.control.element.hidden = !placing;
    if (placing) this.control.set(options.placement!.current, options.placement!.free);
    this.foot.textContent = placing ? words.hintPlace : words.hintApply;
    this.input.value = "";
    this.shownQuery = "";
    this.groups = [];
    this.drawn = new Set();
    this.active = -1;
    this.pointerAt = undefined;
    this.element.classList.remove("lent");
    options.opener?.setAttribute("aria-expanded", "true");
    this.element.hidden = false;
    this.draw(false);
    this.place(options);
    document.addEventListener("pointerdown", this.outside, true);
    document.addEventListener("pointermove", this.track, true);
    document.addEventListener("keydown", this.escape, true);
    this.input.focus({ preventScroll: true });
    this.send();
  }

  /** Closes the picker; with `refocus`, the focus goes back to where it was opened from. */
  close(refocus = true): void {
    if (this.element.hidden) return;
    const opener = this.currentOpener();
    window.clearTimeout(this.timer);
    this.timer = undefined;
    this.element.hidden = true;
    this.element.classList.remove("lent");
    document.removeEventListener("pointerdown", this.outside, true);
    document.removeEventListener("pointermove", this.track, true);
    document.removeEventListener("keydown", this.escape, true);
    opener?.setAttribute("aria-expanded", "false");
    this.options = undefined;
    // Answers on their way are for a picker that is gone.
    this.token++;
    this.pending = false;
    this.chooseOnAnswer = false;
    if (refocus && this.returnFocus?.isConnected) this.returnFocus.focus({ preventScroll: true });
  }

  /** The answer to a search: shown when it is the last one asked for. */
  received(token: number, groups: readonly IconGroupInfo[]): void {
    if (token !== this.token || this.element.hidden) return;
    this.pending = false;
    this.groups = groups;
    // The results of another query start from their first; the same one asked again (as packs
    // arrive) keeps the active result.
    const query = this.input.value.trim();
    const same = query === this.shownQuery;
    this.shownQuery = query;
    this.draw(same);
    if (this.chooseOnAnswer) {
      this.chooseOnAnswer = false;
      const choice = this.choices[this.active];
      if (choice) this.pick(choice, "enter");
    }
  }

  /**
   * Asks again after a new drawing: the packs load as they are first searched, and a drawing
   * follows when one arrives, with icons and thumbnails the last answer could not hold yet.
   */
  refresh(): void {
    if (!this.element.hidden && !this.pending) this.send();
  }

  /** Keeps an icon chosen anywhere on the canvas among the recent ones. */
  remember(choice: IconChoiceInfo): void {
    this.recent = withRecent(this.recent, choice);
    if (!this.element.hidden && this.input.value.trim() === "") this.draw(true);
  }

  /** Shows another placement as the current one (chosen in the Libraries panel). */
  setPlacement(placement: IconPlacement, free: boolean): void {
    if (!this.control.element.hidden) this.control.set(placement, free);
    if (this.options?.placement) {
      this.options = { ...this.options, placement: { current: placement, free } };
    }
  }

  /**
   * While a result is dragged onto the canvas the picker fades away from what lies under it and
   * takes no presses; `done` (something was placed or given its icon) closes it, else it comes
   * back with the focus in its search.
   */
  lend(on: boolean, done = false): void {
    if (this.element.hidden) return;
    this.element.classList.toggle("lent", on);
    if (on) return;
    if (done) this.close(false);
    else this.input.focus({ preventScroll: true });
  }

  /**
   * Places the picker under its anchor, inside the bounds, as tall as the room below allows; over
   * the anchor, growing upwards, when the room below is short and the room above is larger.
   */
  private place(options: IconPickerOptions): void {
    const place = pickerPlace(options.at, options.bounds, this.element.offsetWidth, options.above);
    const style = this.element.style;
    style.left = `${place.left}px`;
    style.top = place.top === undefined ? "auto" : `${place.top}px`;
    style.bottom = place.bottom === undefined ? "auto" : `${place.bottom}px`;
    style.maxHeight = `${place.maxHeight}px`;
    this.element.dataset.side = place.side;
  }

  private typed(): void {
    this.chooseOnAnswer = false;
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.send(), SEARCH_DEBOUNCE);
  }

  private send(): void {
    window.clearTimeout(this.timer);
    this.timer = undefined;
    this.pending = true;
    this.token++;
    this.results.setAttribute("aria-busy", "true");
    this.actions.search(this.input.value.trim(), this.token);
    this.drawStatus();
  }

  private drawStatus(): void {
    const words = messages().iconPicker;
    const query = this.input.value.trim();
    const empty = this.choices.length === 0;
    this.status.textContent =
      this.pending && empty
        ? words.searching
        : !this.pending && empty
          ? query === ""
            ? words.empty
            : words.none(query)
          : "";
    this.status.hidden = this.status.textContent === "";
    if (!this.pending) this.results.removeAttribute("aria-busy");
  }

  /**
   * Draws the groups of results; with `keep` (the same query's results again), the active result
   * stays where it can, else the first one is active.
   */
  private draw(keep: boolean): void {
    const words = messages().iconPicker;
    const activeReference = keep ? this.choices[this.active]?.reference : undefined;
    const groups = pickerGroups(this.recent, this.groups, this.shownQuery, words.recent);
    clear(this.results);
    this.choices = [];
    const drawn = new Set<string>();
    let fresh = 0;
    groups.forEach((group, g) => {
      const titleId = `mdg-icon-group-${g}`;
      const grid = h("div", { class: "icon-grid" });
      for (const item of group.items) {
        const index = this.choices.length;
        this.choices.push(item);
        const option = h("div", {
          role: "option",
          id: `mdg-icon-${index}`,
          class: "icon-option",
          "aria-selected": "false",
          title: words.itemTitle(item.label, item.reference),
          "data-reference": item.reference,
          "data-index": index,
        });
        const thumb = h("span", { class: "thumb", "aria-hidden": "true" });
        if (item.svg) thumb.innerHTML = item.svg;
        else if (item.missing) {
          // No pack has it: a mark of its own, never the shimmer of a pack on its way.
          thumb.classList.add("missing");
          thumb.append(icon(ICONS.missing));
        } else thumb.classList.add("loading");
        option.append(thumb, h("span", { class: "name" }, item.label));
        // Results that were not there before fade in, one after the other.
        if (!this.drawn.has(item.reference)) {
          option.classList.add("fresh");
          option.style.setProperty("--i", String(Math.min(fresh++, STAGGERED)));
        }
        drawn.add(item.reference);
        this.attach(option, item);
        grid.append(option);
      }
      this.results.append(
        h(
          "div",
          { class: "icon-group", role: "group", "aria-labelledby": titleId },
          h(
            "div",
            { class: "icon-group-title", id: titleId },
            h("span", {}, group.title),
            h("span", { class: "count", "aria-hidden": "true" }, String(group.items.length)),
          ),
          grid,
        ),
      );
    });
    this.drawn = drawn;
    const kept = this.choices.findIndex((c) => c.reference === activeReference);
    this.activate(kept >= 0 ? kept : this.choices.length > 0 ? 0 : -1, false);
    this.drawStatus();
  }

  private optionAt(index: number): HTMLElement | null {
    return this.results.querySelector<HTMLElement>(`#mdg-icon-${index}`);
  }

  /** Makes a result the active one: highlighted, read out, and scrolled into view. */
  private activate(index: number, reveal = true): void {
    this.optionAt(this.active)?.setAttribute("aria-selected", "false");
    this.active = index;
    const option = this.optionAt(index);
    if (!option) {
      this.input.removeAttribute("aria-activedescendant");
      return;
    }
    option.setAttribute("aria-selected", "true");
    this.input.setAttribute("aria-activedescendant", option.id);
    if (reveal) option.scrollIntoView({ block: "nearest" });
  }

  private key(e: KeyboardEvent): void {
    if (e.isComposing) return;
    if (
      e.key === "ArrowDown" ||
      e.key === "ArrowUp" ||
      e.key === "ArrowLeft" ||
      e.key === "ArrowRight"
    ) {
      if (this.choices.length === 0) return;
      e.preventDefault();
      const cells = this.choices.map((_, i) => {
        const r = this.optionAt(i)!.getBoundingClientRect();
        return { x: r.left, y: r.top, width: r.width, height: r.height };
      });
      this.activate(stepIn(cells, this.active, e.key));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      // The search the typing waits for goes first: Enter chooses the first of its results.
      if (this.timer !== undefined) this.send();
      if (this.pending) {
        this.chooseOnAnswer = true;
        return;
      }
      const choice = this.choices[this.active] ?? this.choices[0];
      if (choice) this.pick(choice, "enter");
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      this.close(true);
    }
  }

  private pick(choice: IconChoiceInfo, via: "click" | "enter"): void {
    const choose = this.options?.choose;
    this.close(false);
    choose?.(choice, via);
  }

  /** A click chooses; a press that moves drags the icon out onto the canvas. */
  private attach(option: HTMLElement, choice: IconChoiceInfo): void {
    option.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      // The field keeps the focus, so typing goes on after a press.
      e.preventDefault();
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
        this.actions.drag(choice, event);
      };
      const up = (event: PointerEvent) => {
        if (event.pointerId !== pointer) return;
        stop();
        this.pick(choice, "click");
      };
      document.addEventListener("pointermove", move, true);
      document.addEventListener("pointerup", up, true);
      document.addEventListener("pointercancel", stop, true);
    });
  }
}
