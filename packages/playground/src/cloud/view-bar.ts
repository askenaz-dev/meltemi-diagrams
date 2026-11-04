// What the page shows while it is in view mode (`project-sharing`, "Viewing by link"): in the header a
// quiet "View only" badge with "Make a copy" and, for a person signed in, "Save a copy to my
// projects"; in the status bar the hint, after five minutes on a snapshot, that the project may
// have changed, with the button that reads it again. Everything is set as text, never as markup.
// The page makes it the first time it enters view mode, so a page that never does has none of it.

import { messages } from "../messages/index.js";
import { ICONS, h, icon } from "../ui.js";
import { CLOUD_ICON, DUPLICATE_ICON } from "./icons.js";
import type { ViewState } from "./view-mode.js";

export interface ViewBarActions {
  readonly copy: () => void;
  readonly save: () => void;
  readonly reload: () => void;
}

export interface ViewBar {
  /** For the header's actions: the badge and the copies. Hidden outside view mode. */
  readonly header: HTMLElement;
  /** For the status bar: the reload hint. Hidden until a snapshot is stale. */
  readonly hint: HTMLElement;
  /** Shows the state (undefined: not in view mode); `canSave` says whether a person is signed in. */
  update(state: ViewState | undefined, canSave: boolean): void;
}

/** A button with an icon and a visible label (hidden, but named, on a narrow screen). */
function labelled(
  className: string,
  path: string,
  label: string,
  title: string,
  run: () => void,
): HTMLButtonElement {
  const button = h(
    "button",
    { type: "button", class: `button with-text ${className}`, title },
    icon(path),
    h("span", {}, label),
  );
  button.addEventListener("click", run);
  return button;
}

export function viewBar(actions: ViewBarActions): ViewBar {
  const m = messages().viewing;
  const badge = h("span", { class: "view-badge", title: m.badgeTitle }, m.badge);
  const copy = labelled("view-copy", DUPLICATE_ICON, m.copy, m.copyTitle, actions.copy);
  const save = labelled("view-save", CLOUD_ICON, m.save, m.saveTitle, actions.save);
  save.hidden = true;
  const header = h(
    "span",
    { class: "view-actions", role: "group", "aria-label": m.group, hidden: true },
    badge,
    copy,
    save,
  );
  const reload = h(
    "button",
    { type: "button", class: "button with-text view-reload" },
    icon(ICONS.restore),
    h("span", {}, m.reload),
  );
  reload.addEventListener("click", actions.reload);
  const hint = h("span", { class: "view-hint", hidden: true }, h("span", {}, m.staleHint), reload);
  return {
    header,
    hint,
    update(state, canSave) {
      header.hidden = state === undefined;
      save.hidden = !canSave;
      hint.hidden = !(state && !state.live && state.stale);
    },
  };
}
