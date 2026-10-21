import { h, icon, ICONS } from "./ui.js";

export interface MenuEntry {
  readonly label: string;
  readonly detail?: string;
  readonly disabled?: boolean;
  /** Set on entries that are a choice of one among them: whether this one is chosen. */
  readonly checked?: boolean;
  /** The language of the label when it is not the page's, such as a language's own name. */
  readonly lang?: string;
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
    title: options.name,
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
  const items = () => [
    ...menu.querySelectorAll<HTMLButtonElement>("[role^=menuitem]:not([disabled])"),
  ];
  const show = (focusLast = false) => {
    open?.close();
    menu.replaceChildren();
    for (const entry of entries()) {
      if (entry === "-") {
        menu.append(h("div", { class: "pg-menu-separator", role: "separator" }));
        continue;
      }
      const choice = entry.checked !== undefined;
      const label = h("span", { class: "pg-menu-label", lang: entry.lang }, entry.label);
      if (choice) label.prepend(icon(ICONS.check));
      const item = h(
        "button",
        {
          type: "button",
          class: "pg-menu-item",
          role: choice ? "menuitemradio" : "menuitem",
          "aria-checked": choice ? String(entry.checked) : undefined,
          disabled: entry.disabled,
          tabindex: "-1",
        },
        label,
      );
      if (entry.detail) item.append(h("span", { class: "pg-menu-detail" }, entry.detail));
      item.addEventListener("click", () => {
        close();
        entry.run();
      });
      menu.append(item);
    }
    menu.hidden = false;
    // Below the button from its start, or from its end when the page has no room on that side.
    menu.classList.remove("end");
    if (menu.getBoundingClientRect().right > document.documentElement.clientWidth) {
      menu.classList.add("end");
    }
    button.setAttribute("aria-expanded", "true");
    open = { close: closeHandle };
    document.addEventListener("pointerdown", outside, true);
    const list = items();
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
      close();
    } else if (e.key === "Tab") {
      close(false);
    }
  });
  return wrapper;
}
