import type { DependentInfo } from "@meltemi/diagrams-editor/canvas";
import { clear, h } from "./dom.js";
import { messages } from "./messages/index.js";

export interface MenuItem {
  readonly label: string;
  readonly key?: string;
  readonly disabled?: boolean;
  /** A picture before the label, such as a kind of arrow. */
  readonly picture?: Node;
  /** An item of a choice: checked when it is the current one (a radio item). */
  readonly checked?: boolean;
  /** Attributes for tests and styles, such as `data-kind`. */
  readonly data?: Readonly<Record<string, string>>;
  readonly run: () => void;
}

/**
 * Where a menu `size` big opens at `at`, inside `bounds`: moved left and up as far as it must to
 * fit, and never taller than the bounds, its items scrolling inside it on a short canvas.
 */
export function menuPlace(
  at: { readonly x: number; readonly y: number },
  bounds: { readonly width: number; readonly height: number },
  size: { readonly width: number; readonly height: number },
): { readonly left: number; readonly top: number; readonly maxHeight: number } {
  const maxHeight = Math.max(0, bounds.height - 8);
  const height = Math.min(size.height, maxHeight);
  return {
    left: Math.max(0, Math.min(at.x, bounds.width - size.width - 4)),
    top: Math.max(0, Math.min(at.y, bounds.height - height - 4)),
    maxHeight,
  };
}

/** A context menu operated with the pointer or the keyboard. */
export class Menu {
  readonly element = h("div", {
    class: "menu",
    role: "menu",
    hidden: true,
    "aria-label": messages().menu.label,
  });
  private returnFocus: HTMLElement | null = null;
  private closed: (() => void) | undefined;

  /** Opens the menu at `at`, kept inside `bounds`; `closed` runs when it closes or is replaced. */
  open(
    items: readonly (MenuItem | "-")[],
    at: { x: number; y: number },
    bounds: DOMRect,
    closed?: () => void,
  ): void {
    this.done();
    this.closed = closed;
    clear(this.element);
    this.returnFocus = document.activeElement as HTMLElement | null;
    for (const item of items) {
      if (item === "-") {
        this.element.append(h("div", { role: "separator" }));
        continue;
      }
      const entry = h(
        "div",
        {
          role: item.checked === undefined ? "menuitem" : "menuitemradio",
          tabindex: -1,
          "aria-disabled": item.disabled ? "true" : undefined,
          "aria-checked": item.checked === undefined ? undefined : String(item.checked),
          ...item.data,
        },
        h(
          "span",
          { class: item.picture ? "label pictured" : "label" },
          ...(item.picture ? [item.picture] : []),
          item.label,
        ),
        h("span", { class: "key" }, item.key ?? ""),
      );
      entry.addEventListener("click", () => {
        this.close();
        item.run();
      });
      this.element.append(entry);
    }
    this.element.hidden = false;
    this.element.style.maxHeight = "";
    this.element.scrollTop = 0;
    const place = menuPlace(at, bounds, {
      width: this.element.offsetWidth,
      height: this.element.offsetHeight,
    });
    this.element.style.maxHeight = `${place.maxHeight}px`;
    this.element.style.left = `${place.left}px`;
    this.element.style.top = `${place.top}px`;
    const entries = this.items();
    const first = entries.find((e) => e.getAttribute("aria-checked") === "true") ?? entries[0];
    if (first) this.focusItem(first);
  }

  /** Focuses an item, the menu scrolling to show it when it does not fit the canvas. */
  private focusItem(item: HTMLElement): void {
    item.focus({ preventScroll: true });
    const menu = this.element;
    if (item.offsetTop < menu.scrollTop) menu.scrollTop = item.offsetTop - 4;
    else if (item.offsetTop + item.offsetHeight > menu.scrollTop + menu.clientHeight) {
      menu.scrollTop = item.offsetTop + item.offsetHeight - menu.clientHeight + 4;
    }
  }

  private items(): HTMLElement[] {
    return [
      ...this.element.querySelectorAll<HTMLElement>(
        ':is([role="menuitem"], [role="menuitemradio"]):not([aria-disabled="true"])',
      ),
    ];
  }

  get isOpen(): boolean {
    return !this.element.hidden;
  }

  close(): void {
    if (this.element.hidden) return;
    this.element.hidden = true;
    this.done();
    this.returnFocus?.focus();
  }

  private done(): void {
    const closed = this.closed;
    this.closed = undefined;
    closed?.();
  }

  /** Arrow keys, Enter and Escape while the menu is open. */
  key(e: KeyboardEvent): boolean {
    if (!this.isOpen) return false;
    const items = this.items();
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === "ArrowDown"
        ? items[(index + 1) % items.length]
        : e.key === "ArrowUp"
          ? items[(index - 1 + items.length) % items.length]
          : e.key === "Home"
            ? items[0]
            : e.key === "End"
              ? items[items.length - 1]
              : undefined;
    if (next) this.focusItem(next);
    else if (e.key === "Enter" || e.key === " ")
      (document.activeElement as HTMLElement | null)?.click();
    else if (e.key === "Escape" || e.key === "Tab") this.close();
    else return true;
    e.preventDefault();
    return true;
  }
}

/** "Connect to…": a filtered list of the other elements. */
export class Picker {
  readonly element = h("div", {
    class: "picker",
    hidden: true,
    role: "dialog",
    "aria-label": messages().picker.label,
  });
  private readonly input = h("input", {
    type: "text",
    placeholder: messages().picker.placeholder,
    "aria-label": messages().picker.input,
    "aria-controls": "mdg-picker-list",
    role: "combobox",
    "aria-expanded": "true",
  });
  private readonly list = h("div", {
    id: "mdg-picker-list",
    role: "listbox",
    "aria-label": messages().picker.list,
  });
  private options: { id: string; label: string }[] = [];
  private active = 0;
  private choose: ((id: string) => void) | undefined;
  private returnFocus: HTMLElement | null = null;

  constructor() {
    this.element.append(this.input, this.list);
    this.input.addEventListener("input", () => {
      this.active = 0;
      this.draw();
    });
    this.input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      const shown = this.filtered();
      if (e.key === "ArrowDown") this.active = Math.min(shown.length - 1, this.active + 1);
      else if (e.key === "ArrowUp") this.active = Math.max(0, this.active - 1);
      else if (e.key === "Enter") {
        const option = shown[this.active];
        this.close();
        if (option) this.choose?.(option.id);
        e.preventDefault();
        return;
      } else if (e.key === "Escape") {
        this.close();
        e.preventDefault();
        return;
      } else return;
      e.preventDefault();
      this.draw();
    });
  }

  get isOpen(): boolean {
    return !this.element.hidden;
  }

  open(
    options: { id: string; label: string }[],
    at: { x: number; y: number },
    choose: (id: string) => void,
  ): void {
    this.returnFocus = document.activeElement as HTMLElement | null;
    this.options = options;
    this.choose = choose;
    this.active = 0;
    this.input.value = "";
    this.element.hidden = false;
    this.element.style.left = `${at.x}px`;
    this.element.style.top = `${at.y}px`;
    this.draw();
    this.input.focus();
  }

  close(): void {
    if (this.element.hidden) return;
    this.element.hidden = true;
    this.returnFocus?.focus();
  }

  private filtered() {
    const query = this.input.value.toLowerCase();
    return this.options
      .filter((o) => `${o.id} ${o.label}`.toLowerCase().includes(query))
      .slice(0, 50);
  }

  private draw(): void {
    clear(this.list);
    this.filtered().forEach((option, i) => {
      const row = h(
        "div",
        {
          role: "option",
          id: `mdg-option-${i}`,
          "aria-selected": i === this.active ? "true" : "false",
        },
        `${option.id} — ${option.label}`,
      );
      row.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        this.close();
        this.choose?.(option.id);
      });
      this.list.append(row);
    });
    this.input.setAttribute("aria-activedescendant", `mdg-option-${this.active}`);
  }
}

/** A modal dialog: confirmation before deleting dependents, or the id and place of a new theme. */
export class Dialog {
  readonly element = h("div", {
    class: "dialog",
    hidden: true,
    role: "dialog",
    "aria-modal": "true",
    "aria-labelledby": "mdg-dialog-title",
  });
  private returnFocus: HTMLElement | null = null;

  constructor() {
    this.element.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") this.close();
      if (e.key === "Tab") {
        // Keep focus inside the dialog.
        e.preventDefault();
        const stops = [
          ...this.element.querySelectorAll<HTMLElement>(
            "button:not([disabled]), input:not([disabled])",
          ),
        ].filter((el) => !(el instanceof HTMLInputElement && el.type === "radio" && !el.checked));
        const index = stops.indexOf(document.activeElement as HTMLElement);
        const step = e.shiftKey ? -1 : 1;
        stops[(index + step + stops.length) % stops.length]?.focus();
      }
    });
  }

  get isOpen(): boolean {
    return !this.element.hidden;
  }

  confirm(reason: string, dependents: readonly DependentInfo[], onConfirm: () => void): void {
    this.returnFocus = document.activeElement as HTMLElement | null;
    clear(this.element);
    const words = messages().dialogs;
    const remove = h("button", { class: "primary", type: "button" }, words.deleteAll);
    const cancel = h("button", { type: "button" }, words.cancel);
    const box = h(
      "div",
      { class: "box" },
      h("div", { id: "mdg-dialog-title" }, reason),
      h("ul", {}, ...dependents.map((d) => h("li", {}, d.description))),
      h("div", { class: "buttons" }, cancel, remove),
    );
    this.element.append(box);
    this.element.hidden = false;
    remove.addEventListener("click", () => {
      this.close();
      onConfirm();
    });
    cancel.addEventListener("click", () => this.close());
    remove.focus();
  }

  /**
   * Asks the id of a theme that extends `current` and whether it lives in this file or in the
   * project (offered only inside a project).
   */
  newTheme(
    current: string,
    project: boolean,
    onCreate: (id: string, scope: "file" | "project") => void,
  ): void {
    this.returnFocus = document.activeElement as HTMLElement | null;
    clear(this.element);
    const words = messages().dialogs;
    const input = h("input", {
      type: "text",
      id: "mdg-theme-id",
      spellcheck: "false",
      autocomplete: "off",
      placeholder: words.idPlaceholder,
      "aria-describedby": "mdg-theme-hint",
    });
    const hint = h("div", { id: "mdg-theme-hint", class: "hint" }, words.extends(current));
    const scope = (value: "file" | "project", text: string, note: string, disabled: boolean) => {
      const radio = h("input", {
        type: "radio",
        name: "mdg-theme-scope",
        value,
        id: `mdg-theme-${value}`,
        checked: value === (project ? "project" : "file"),
        disabled,
      });
      return h(
        "label",
        { class: "choice", for: `mdg-theme-${value}` },
        radio,
        h("span", {}, h("strong", {}, text), h("span", { class: "hint" }, note)),
      );
    };
    const create = h("button", { class: "primary", type: "button" }, words.create);
    const cancel = h("button", { type: "button" }, words.cancel);
    const submit = () => {
      const id = input.value.trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(id)) {
        hint.textContent = words.badId;
        hint.classList.add("error");
        input.focus();
        return;
      }
      const chosen = this.element.querySelector<HTMLInputElement>(
        'input[name="mdg-theme-scope"]:checked',
      );
      this.close();
      onCreate(id, chosen?.value === "project" ? "project" : "file");
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submit();
      }
    });
    const box = h(
      "div",
      { class: "box" },
      h("div", { id: "mdg-dialog-title", class: "title" }, words.newTheme),
      h("label", { for: "mdg-theme-id" }, words.id),
      input,
      hint,
      h(
        "fieldset",
        {},
        h("legend", {}, words.where),
        scope("file", words.file, words.fileNote, false),
        scope("project", words.project, project ? words.projectNote : words.noProject, !project),
      ),
      h("div", { class: "buttons" }, cancel, create),
    );
    this.element.append(box);
    this.element.hidden = false;
    create.addEventListener("click", submit);
    cancel.addEventListener("click", () => this.close());
    input.focus();
  }

  close(): void {
    if (this.element.hidden) return;
    this.element.hidden = true;
    this.returnFocus?.focus();
  }
}
