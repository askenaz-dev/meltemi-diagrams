// The versions panel: the open project's versions with their number, name, time and the files that
// changed, a form that names the current state as a version, and a restore after a confirmation. What
// it knows and does is `VersionsModel`'s; this draws it. Names, times and paths are set as text,
// never as markup. A restore reaches the page from the room as a remote change: nothing here edits
// a file.

import { getLocale } from "@meltemi/diagrams-i18n";
import { CLOUD_LIMITS } from "@meltemi/diagrams-project";
import { confirmDialog } from "../dialogs.js";
import { messages } from "../messages/index.js";
import { ICONS, field, h, icon, openDialog } from "../ui.js";
import type { ProjectVersion } from "./client.js";
import type { CloudController } from "./controller.js";
import { whenText } from "./tokens.js";
import {
  LABEL_MAX,
  VersionsModel,
  changedPaths,
  type VersionsHost,
  type VersionsState,
} from "./versions-model.js";

/** The header's "Versions" button: opens the panel. */
export function versionsButton(open: () => void): HTMLButtonElement {
  const m = messages().cloud.versions;
  const button = h(
    "button",
    {
      type: "button",
      class: "button with-text versions-button",
      "aria-haspopup": "dialog",
      title: m.buttonTitle,
    },
    icon(ICONS.restore),
    h("span", {}, m.button),
  );
  button.addEventListener("click", open);
  return button;
}

let panels = 0;

/** Opens the panel for the cloud project that is open. */
export function openVersionsDrawer(controller: CloudController): void {
  const project = controller.current();
  if (project === undefined) return;
  const words = () => messages().cloud;
  const m = words().versions;
  const unique = ++panels;
  let closed = false;
  /** What the panel is showing, so that it redraws the list only when it changed. */
  let shownRows: readonly ProjectVersion[] | undefined;

  const status = h("p", { class: "versions-status", role: "status" });
  const problem = h("p", { class: "field-problem", role: "alert" });
  const count = h("p", { class: "field-hint versions-count" });
  const list = h("ul", { class: "version-list", "aria-label": m.listLabel });
  const none = h("p", { hidden: true }, m.none);
  const retry = h(
    "button",
    { type: "button", class: "button with-text", hidden: true },
    m.tryAgain,
  );

  // Name the current state -----------------------------------------------------------------------
  const nameInput = h("input", { type: "text", autocomplete: "off", spellcheck: "false" });
  const create = h("button", { type: "submit", class: "button primary with-text" }, m.nameButton);
  const form = h(
    "form",
    { class: "version-form", "aria-labelledby": `version-form-title-${unique}` },
    h("h3", { id: `version-form-title-${unique}` }, m.nameTitle),
    field(m.nameLabel, nameInput, m.nameHint(LABEL_MAX)),
    create,
  );

  // One version ---------------------------------------------------------------------------------
  const timeOf = (version: ProjectVersion): string =>
    version.createdAt === "" ? "" : whenText(version.createdAt, getLocale());

  const changedBlock = (version: ProjectVersion): HTMLElement => {
    if (version.changed.length === 0) {
      return h("span", { class: "version-meta" }, m.changed(0));
    }
    const { shown, more } = changedPaths(version.changed);
    return h(
      "details",
      { class: "version-changed" },
      h("summary", {}, m.changed(version.changed.length)),
      h(
        "ul",
        { class: "version-files" },
        ...shown.map((path) => h("li", {}, h("code", {}, path))),
        ...(more > 0 ? [h("li", { class: "version-more" }, m.changedMore(more))] : []),
      ),
    );
  };

  const row = (version: ProjectVersion): HTMLElement => {
    const restore = h(
      "button",
      {
        type: "button",
        class: "button with-text version-restore",
        "data-action": "restore",
        "aria-label": m.restoreLabel(version.number),
        title: m.restoreLabel(version.number),
      },
      icon(ICONS.restore),
      h("span", {}, m.restore),
    );
    restore.addEventListener("click", () => void askRestore(version));
    const time = timeOf(version);
    return h(
      "li",
      { class: "version-row", "data-version": String(version.number) },
      h(
        "div",
        { class: "version-info" },
        h(
          "div",
          { class: "version-head" },
          h("strong", { class: "version-number" }, m.number(version.number)),
          ...(version.auto ? [h("span", { class: "version-badge" }, m.automatic)] : []),
        ),
        ...(version.label !== null
          ? [h("span", { class: "version-label" }, version.label)]
          : version.auto
            ? []
            : [h("span", { class: "version-label version-unnamed" }, m.unnamed)]),
        ...(time === ""
          ? []
          : [h("time", { class: "version-meta", datetime: version.createdAt }, time)]),
        changedBlock(version),
      ),
      restore,
    );
  };

  async function askRestore(version: ProjectVersion): Promise<void> {
    const sure = await confirmDialog(
      m.restoreTitle,
      m.restoreMessage(version.number, timeOf(version)),
      m.restoreConfirm,
    );
    if (!sure || closed) return;
    await model.restore(version);
  }

  // Drawing -------------------------------------------------------------------------------------
  /** Where focus was when an action began: the row and the action, or the element itself. */
  interface Held {
    readonly element: HTMLElement;
    readonly version: string | undefined;
    readonly action: string | undefined;
  }
  let held: Held | undefined;
  let wasBusy = false;

  const remember = (): Held | undefined => {
    const active = document.activeElement as HTMLElement | null;
    if (!active || !dialog.contains(active)) return undefined;
    return {
      element: active,
      version: active.closest("[data-version]")?.getAttribute("data-version") ?? undefined,
      action: active.getAttribute("data-action") ?? undefined,
    };
  };

  /** Focus goes back to where it was; the list may have been drawn again, so the button is found anew. */
  const restoreFocus = (to: Held): void => {
    const again =
      to.version === undefined
        ? undefined
        : [...list.querySelectorAll<HTMLElement>("[data-version]")]
            .find((r) => r.getAttribute("data-version") === to.version)
            ?.querySelector<HTMLElement>(`[data-action="${to.action ?? ""}"]`);
    (again ?? (dialog.contains(to.element) ? to.element : nameInput)).focus();
  };

  const render = (state: VersionsState): void => {
    if (closed) return;
    if (state.busy && !wasBusy) held = remember();
    status.textContent = state.status;
    problem.textContent = state.problem;
    if (state.versions !== shownRows) {
      shownRows = state.versions;
      list.replaceChildren(...state.versions.map(row));
    }
    const ready = state.list === "ready";
    count.textContent = ready ? m.count(state.versions.length, CLOUD_LIMITS.versions) : "";
    none.hidden = !(ready && state.versions.length === 0);
    retry.hidden = state.list !== "failed";
    nameInput.readOnly = state.busy;
    dialog.querySelector(".dialog-body")?.setAttribute("aria-busy", String(state.busy));
    for (const control of dialog.querySelectorAll<HTMLButtonElement>(".dialog-body button")) {
      control.disabled = state.busy;
    }
    if (!state.busy && wasBusy && held) {
      restoreFocus(held);
      held = undefined;
    }
    wasBusy = state.busy;
  };

  const host: VersionsHost = {
    api: controller.api,
    current: () => controller.current(),
    flush: () => controller.flush(),
    report: (message) => controller.report(message),
    restored: () => controller.restored(),
  };
  const model = new VersionsModel(host, project, words, render);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const made = await model.name(nameInput.value);
    if (made && !closed) nameInput.value = "";
  });
  retry.addEventListener("click", () => void model.load());

  const dialog = openDialog(
    m.title,
    [h("p", {}, m.intro), form, status, problem, count, list, none, retry],
    [{ label: m.close, primary: true }],
    { drawer: true },
  );
  dialog.addEventListener("close", () => {
    closed = true;
  });
  render(model.state);
  nameInput.focus();
  void model.load();
}
