import { ICONS as CANVAS_ICONS, clear, h, icon, s } from "@meltemi/diagrams-canvas";
import { messages } from "./messages/index.js";

export { clear, h, icon, s };

/** Icons of the page, as path data separated by `|`, in the canvas's 16 × 16 style. */
export const ICONS = {
  ...CANVAS_ICONS,
  file: "M4 2.5h5l3 3v8H4z|M9 2.5v3h3",
  newFile: "M4 2.5h5l3 3v8H4z|M9 2.5v3h3|M8 8v4|M6 10h4",
  open: "M2.5 4.5h4l1 1h6v7h-11z",
  template: "M2.5 2.5h11v11h-11z|M2.5 6h11|M6 6v7.5",
  import: "M8 2.5V10|M5 7l3 3 3-3|M3 9.5v4h10v-4",
  download: "M8 2.5V10|M5 7l3 3 3-3|M3 12.5h10",
  share:
    "M11.5 2.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z|M4.5 6.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z|M11.5 10.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z|M5.9 7.3l4.2-2.1|M5.9 8.7l4.2 2.1",
  undo: "M5.5 5.5L3 8l2.5 2.5|M3 8h6.5a3.5 3.5 0 0 1 0 7H8",
  redo: "M10.5 5.5L13 8l-2.5 2.5|M13 8H6.5a3.5 3.5 0 0 0 0 7H8",
  format: "M3 4h10|M5 7h8|M5 10h8|M3 13h10",
  rename: "M3 12.5l1-3 6.5-6.5 2 2L6 11.5z|M9 4.5l2 2",
  trash: "M3.5 4.5h9|M6 4.5V3h4v1.5|M4.5 4.5l.7 9h5.6l.7-9",
  sun: "M8 5a3 3 0 1 1 0 6 3 3 0 0 1 0-6z|M8 1.5v1.5|M8 13v1.5|M1.5 8H3|M13 8h1.5|M3.4 3.4l1 1|M11.6 11.6l1 1|M3.4 12.6l1-1|M11.6 4.4l1-1",
  moon: "M12.5 9.5A5 5 0 0 1 6.5 3.5a5 5 0 1 0 6 6z",
  info: "M8 2.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11z|M8 7.5v3.5|M8 5h.01",
  problems: "M8 2.5l6 10.5H2z|M8 6.5v3|M8 11.3h.01",
  chevron: "M4.5 6.5L8 10l3.5-3.5",
  code: "M5.5 4.5L2 8l3.5 3.5|M10.5 4.5L14 8l-3.5 3.5",
  /** The explorer's sidebar glyph mirrored: the code pane folds towards the explorer. */
  codePane: "M2.5 3h11v10h-11z|M9.8 3v10",
  canvas: "M2.5 3.5h11v9h-11z|M5 6h3v2.5H5z|M9.5 8h1.5v2H9.5z",
  link: "M7 9a2.5 2.5 0 0 0 3.5 0l2-2a2.5 2.5 0 0 0-3.5-3.5L8 4.5|M9 7a2.5 2.5 0 0 0-3.5 0l-2 2A2.5 2.5 0 0 0 7 12.5L8 11.5",
  restore: "M3 8a5 5 0 1 0 1.5-3.5|M3 2.5v2.5h2.5",
  language:
    "M8 2.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11z|M2.5 8h11|M8 2.5c1.6 1.5 2.4 3.3 2.4 5.5s-.8 4-2.4 5.5|M8 2.5C6.4 4 5.6 5.8 5.6 8s.8 4 2.4 5.5",
  check: "M3.5 8.5l3 3 6-7",
};

/** A toolbar button with an icon and a visible or hidden label. */
export function iconButton(
  name: keyof typeof ICONS,
  label: string,
  options: { text?: boolean; title?: string; id?: string } = {},
): HTMLButtonElement {
  const button = h("button", {
    type: "button",
    class: options.text ? "button with-text" : "button",
    title: options.title ?? label,
    "aria-label": options.text ? undefined : label,
    id: options.id,
  });
  button.append(icon(ICONS[name]));
  if (options.text) button.append(h("span", {}, label));
  return button;
}

let live: HTMLElement | undefined;

/** The page's polite live region. */
export function liveRegion(): HTMLElement {
  live ??= h("div", { class: "sr-only", role: "status", "aria-live": "polite" });
  return live;
}

/** Says something to screen readers, once. */
export function announce(message: string): void {
  const region = liveRegion();
  region.textContent = "";
  // A new text node after clearing makes readers speak repeated messages too.
  setTimeout(() => (region.textContent = message), 30);
}

/** Saves data as a file through the browser's download. */
export function download(name: string, data: BlobPart, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = h("a", { href: url, download: name, hidden: true });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Asks the person to choose local files. */
export function chooseFiles(accept: string, multiple = true): Promise<File[]> {
  return new Promise((resolve) => {
    const input = h("input", { type: "file", accept, hidden: true, multiple });
    input.addEventListener("change", () => {
      resolve([...(input.files ?? [])]);
      input.remove();
    });
    input.addEventListener("cancel", () => {
      resolve([]);
      input.remove();
    });
    document.body.append(input);
    input.click();
  });
}

export interface DialogAction {
  readonly label: string;
  readonly primary?: boolean;
  /** Returns false to keep the dialog open. */
  readonly run?: () => boolean | void | Promise<boolean | void>;
}

/**
 * A modal dialog: a title, a body and actions. The browser's `<dialog>` keeps focus inside and
 * closes on Escape; focus returns to where it was.
 */
export function openDialog(
  title: string,
  body: (Node | string)[],
  actions: readonly DialogAction[] = [{ label: messages().dialog.close, primary: true }],
  options: {
    wide?: boolean;
    drawer?: boolean;
    /** A settings dialog: wide and tall, with a list of sections beside the one shown. */
    settings?: boolean;
    label?: string;
    /** Where focus goes when the dialog closes, when its action says (a row it made, say). */
    returnTo?: () => HTMLElement | undefined;
  } = {},
): HTMLDialogElement {
  const returnFocus = document.activeElement as HTMLElement | null;
  const heading = h("h2", { id: `dialog-${Math.random().toString(36).slice(2)}` }, title);
  const dialog = h("dialog", {
    class: [
      "pg-dialog",
      options.wide ? "wide" : "",
      options.drawer ? "drawer" : "",
      options.settings ? "settings" : "",
    ]
      .filter(Boolean)
      .join(" "),
    "aria-labelledby": heading.id,
  });
  const footer = h("div", { class: "dialog-actions" });
  for (const action of actions) {
    const button = h(
      "button",
      { type: "button", class: action.primary ? "button primary with-text" : "button with-text" },
      action.label,
    );
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        const keep = (await action.run?.()) === false;
        if (!keep) dialog.close();
      } finally {
        button.disabled = false;
      }
    });
    footer.append(button);
  }
  const close = h("button", {
    type: "button",
    class: "button close",
    "aria-label": messages().dialog.close,
  });
  close.append(icon(ICONS.close));
  close.addEventListener("click", () => dialog.close());
  dialog.append(h("header", {}, heading, close), h("div", { class: "dialog-body" }, ...body));
  if (actions.length > 0) dialog.append(footer);
  dialog.addEventListener("close", () => {
    dialog.remove();
    const target = options.returnTo?.() ?? returnFocus;
    // An element that went (the item of a menu that closed) cannot take focus back.
    if (target?.isConnected) target.focus();
  });
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}

let fields = 0;

/** A labelled form field; a hint describes the control without being part of its name. */
export function field(label: string, control: HTMLElement, hint?: string): HTMLElement {
  const id = control.id || `field-${++fields}`;
  control.id = id;
  const wrapper = h(
    "div",
    { class: "field" },
    h("label", { class: "field-label", for: id }, label),
    control,
  );
  if (hint) {
    const note = h("span", { class: "field-hint", id: `${id}-hint` }, hint);
    control.setAttribute("aria-describedby", note.id);
    wrapper.append(note);
  }
  return wrapper;
}

/** A `<select>` with options. */
export function select(
  options: readonly { value: string; label: string; disabled?: boolean }[],
  value?: string,
): HTMLSelectElement {
  const element = h("select");
  for (const option of options) {
    element.append(h("option", { value: option.value, disabled: option.disabled }, option.label));
  }
  if (value !== undefined) element.value = value;
  return element;
}

/** Whether the platform's command key is Meta. */
export const isMac = /mac|iphone|ipad/i.test(navigator.platform);

/** The command modifier of a keyboard event: Meta on Apple systems, Ctrl elsewhere. */
export function command(e: KeyboardEvent | MouseEvent): boolean {
  return isMac ? e.metaKey : e.ctrlKey;
}
