import { h, icon, ICONS } from "./ui.js";

export interface MenuEntry {
  readonly label: string;
  readonly detail?: string;
  readonly disabled?: boolean;
  /** Set on entries that are a choice of one among them: whether this one is chosen. */
  readonly checked?: boolean;
  /** The language of the label when it is not the page's, such as a language's own name. */
  readonly lang?: string;
  /** A picture before the label, as path data of the page's icons. */
  readonly icon?: string;
  /** The key that does the same, shown at the end of the entry. */
  readonly keys?: string;
  /** An entry that removes or replaces something: drawn in the colour of errors. */
  readonly danger?: boolean;
  readonly run: () => void;
}

export interface MenuOptions {
  /** A stable name for the menu's id, the same in every language. */
  readonly id: string;
  /** The button's text; it names the menu too, unless `menu` does. */
  readonly label: string;
  readonly icon: keyof typeof ICONS;
  /** The button's accessible name, when its text alone does not say what it opens. */
  readonly name?: string;
  /** The menu's accessible name, when it is not the button's text. */
  readonly menu?: string;
}

let open: { close: () => void } | undefined;

/** Closes the menu that is open, if any, without moving focus. */
export function closeMenus(): void {
  open?.close();
}

/** The items of a menu, made anew each time it opens. `close` runs before an entry's action. */
function fillMenu(menu: HTMLElement, entries: readonly (MenuEntry | "-")[], close: () => void) {
  menu.replaceChildren();
  for (const entry of entries) {
    if (entry === "-") {
      menu.append(h("div", { class: "pg-menu-separator", role: "separator" }));
      continue;
    }
    const choice = entry.checked !== undefined;
    const label = h("span", { class: "pg-menu-label", lang: entry.lang }, entry.label);
    if (choice) label.prepend(icon(ICONS.check));
    else if (entry.icon) label.prepend(icon(entry.icon));
    const item = h(
      "button",
      {
        type: "button",
        class: entry.danger ? "pg-menu-item danger" : "pg-menu-item",
        role: choice ? "menuitemradio" : "menuitem",
        "aria-checked": choice ? String(entry.checked) : undefined,
        "aria-keyshortcuts": entry.keys,
        disabled: entry.disabled,
        tabindex: "-1",
      },
      label,
    );
    if (entry.keys) label.append(h("kbd", { class: "pg-menu-keys" }, entry.keys));
    if (entry.detail) item.append(h("span", { class: "pg-menu-detail" }, entry.detail));
    item.addEventListener("click", () => {
      close();
      entry.run();
    });
    menu.append(item);
  }
}

/** Arrow keys, Home and End move among the items; Escape and Tab close. */
function menuKeys(menu: HTMLElement, close: (focus: boolean) => void): void {
  const items = () => [
    ...menu.querySelectorAll<HTMLButtonElement>("[role^=menuitem]:not([disabled])"),
  ];
  menu.addEventListener("keydown", (e) => {
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = (index + (e.key === "ArrowDown" ? 1 : list.length - 1)) % list.length;
      list[next]?.focus();
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      (e.key === "Home" ? list[0] : list[list.length - 1])?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === "Tab") {
      close(false);
    }
    // The tree and the page's keys never see what the menu handles.
    e.stopPropagation();
  });
}

/**
 * A button that opens a menu below it: arrow keys move, Enter chooses, Escape and a click
 * elsewhere close it, and focus returns to the button.
 */
export function menuButton(
  options: MenuOptions,
  entries: () => readonly (MenuEntry | "-")[],
): HTMLElement {
  const id = `menu-${options.id}`;
  const button = h("button", {
    type: "button",
    class: "button with-text",
    "aria-haspopup": "menu",
    "aria-expanded": "false",
    "aria-controls": id,
    "aria-label": options.name,
    // Every button of the header has a title, which the page's bubble shows; a menu without a
    // name of its own is titled by its label.
    title: options.name ?? options.label,
  });
  button.append(icon(ICONS[options.icon]), h("span", {}, options.label), icon(ICONS.chevron));
  const menu = h("div", {
    class: "pg-menu",
    role: "menu",
    id,
    "aria-label": options.menu ?? options.label,
    hidden: true,
  });
  const wrapper = h("div", { class: "pg-menu-wrapper" }, button, menu);

  const close = (focus = true) => {
    if (menu.hidden) return;
    menu.hidden = true;
    button.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", outside, true);
    if (open?.close === closeHandle) open = undefined;
    if (focus) button.focus();
  };
  const closeHandle = () => close(false);
  const outside = (e: Event) => {
    if (!wrapper.contains(e.target as Node)) close(false);
  };
  const show = (focusLast = false) => {
    open?.close();
    fillMenu(menu, entries(), () => close());
    menu.hidden = false;
    // Below the button from its start, or from its end when the page has no room on that side.
    menu.classList.remove("end");
    if (menu.getBoundingClientRect().right > document.documentElement.clientWidth) {
      menu.classList.add("end");
    }
    button.setAttribute("aria-expanded", "true");
    open = { close: closeHandle };
    document.addEventListener("pointerdown", outside, true);
    const list = [...menu.querySelectorAll<HTMLButtonElement>("[role^=menuitem]:not([disabled])")];
    const checked = list.find((item) => item.getAttribute("aria-checked") === "true");
    (focusLast ? list[list.length - 1] : (checked ?? list[0]))?.focus();
  };
  button.addEventListener("click", () => (menu.hidden ? show() : close()));
  button.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      show(e.key === "ArrowUp");
    }
  });
  menuKeys(menu, (focus) => close(focus));
  return wrapper;
}

/**
 * A menu at a point of the page (a right click), or under an element (the keyboard's menu key or
 * a "…" button): the same items and keys as `menuButton`'s, kept inside the window. Focus returns
 * to `returnTo` when the menu closes with Escape or after an entry that leaves focus nowhere.
 */
export function contextMenu(
  entries: readonly (MenuEntry | "-")[],
  at: { readonly x: number; readonly y: number } | HTMLElement,
  options: { readonly label: string; readonly returnTo?: HTMLElement },
): void {
  open?.close();
  const menu = h("div", {
    class: "pg-menu context",
    role: "menu",
    "aria-label": options.label,
  });
  let closed = false;
  const close = (focus: boolean) => {
    if (closed) return;
    closed = true;
    document.removeEventListener("pointerdown", outside, true);
    window.removeEventListener("blur", blur);
    window.removeEventListener("resize", blur);
    menu.classList.add("leaving");
    const gone = () => menu.remove();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) gone();
    else setTimeout(gone, 100);
    if (open?.close === handle) open = undefined;
    if (focus) options.returnTo?.focus();
  };
  const handle = () => close(false);
  const blur = () => close(false);
  const outside = (e: Event) => {
    if (!menu.contains(e.target as Node)) close(false);
  };
  fillMenu(menu, entries, () => {
    close(false);
    // An entry that opens nothing leaves focus where the menu was asked from.
    queueMicrotask(() => {
      if (document.activeElement === document.body) options.returnTo?.focus();
    });
  });
  menuKeys(menu, (focus) => close(focus));
  document.body.append(menu);
  const point =
    at instanceof HTMLElement
      ? { x: at.getBoundingClientRect().left + 8, y: at.getBoundingClientRect().bottom + 2 }
      : at;
  const box = menu.getBoundingClientRect();
  const width = document.documentElement.clientWidth;
  const height = document.documentElement.clientHeight;
  menu.style.left = `${Math.max(4, Math.min(point.x, width - box.width - 4))}px`;
  menu.style.top = `${
    point.y + box.height + 4 > height ? Math.max(4, point.y - box.height) : point.y
  }px`;
  open = { close: handle };
  document.addEventListener("pointerdown", outside, true);
  window.addEventListener("blur", blur);
  window.addEventListener("resize", blur);
  menu.querySelector<HTMLButtonElement>("[role^=menuitem]:not([disabled])")?.focus();
}
