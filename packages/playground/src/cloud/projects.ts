// The projects drawer: the person's cloud projects with their thumbnails and last change, a form that
// makes one from a template, "Save this project to the cloud" for the anonymous project, and per
// project open, rename, duplicate, copy the link and delete (after a confirmation). What it knows and
// does is `ProjectsModel`'s; this draws it. Names, dates and messages are set as text, never as
// markup, and a thumbnail is an `<img>` whose source is an address on the page's own origin.

import { getLocale } from "@meltemi/diagrams-i18n";
import { confirmDialog, promptName } from "../dialogs.js";
import { messages } from "../messages/index.js";
import type { Template } from "../templates.js";
import { ICONS, field, h, icon, openDialog, select } from "../ui.js";
import type { CloudProject } from "./client.js";
import type { CloudController } from "./controller.js";
import { DUPLICATE_ICON, FOLDER_ICON } from "./icons.js";
import {
  ProjectsModel,
  checkProjectName,
  nameProblem,
  type ProjectsState,
} from "./projects-model.js";
import { whenText } from "./tokens.js";

/** The header's "Projects" button: opens the drawer. */
export function projectsButton(open: () => void): HTMLButtonElement {
  const m = messages().cloud.projects;
  const button = h(
    "button",
    {
      type: "button",
      class: "button with-text projects-button",
      "aria-haspopup": "dialog",
      title: m.buttonTitle,
    },
    icon(FOLDER_ICON),
    h("span", {}, m.button),
  );
  button.addEventListener("click", open);
  return button;
}

let drawers = 0;

/** A button with an icon and a name for assistive technology, for an action of a row. */
function rowButton(action: string, path: string, label: string): HTMLButtonElement {
  const button = h("button", {
    type: "button",
    class: "button project-action",
    "data-action": action,
    "aria-label": label,
    title: label,
  });
  button.append(icon(path));
  return button;
}

/** Opens the drawer for the person signed in. */
export function openProjectsDrawer(
  controller: CloudController,
  templates: readonly Template[],
): void {
  const words = () => messages().cloud;
  const m = words().projects;
  const unique = ++drawers;
  let closed = false;
  /** What the drawer is showing, so that it redraws only what changed. */
  let shownRows: readonly CloudProject[] | undefined;
  let shownCurrent: string | undefined;

  const status = h("p", { class: "projects-status", role: "status" });
  const problem = h("p", { class: "field-problem", role: "alert" });
  const count = h("p", { class: "field-hint projects-count" });
  const list = h("ul", { class: "project-list", "aria-label": m.listLabel });
  const none = h("p", { hidden: true }, m.none);
  const retry = h(
    "button",
    { type: "button", class: "button with-text", hidden: true },
    m.tryAgain,
  );

  // New project ------------------------------------------------------------------------------
  const nameInput = h("input", {
    type: "text",
    value: m.defaultName,
    autocomplete: "off",
    spellcheck: "false",
  });
  const choices = select(
    templates.map((t) => ({ value: t.name, label: t.name })),
    templates.some((t) => t.name === "flow") ? "flow" : templates[0]?.name,
  );
  const create = h("button", { type: "submit", class: "button primary with-text" }, m.newCreate);
  const form = h(
    "form",
    { class: "project-form", "aria-labelledby": `project-form-title-${unique}` },
    h("h3", { id: `project-form-title-${unique}` }, m.newTitle),
    field(m.newName, nameInput, m.newNameHint),
    field(m.newTemplate, choices),
    create,
  );

  // The anonymous project, and the way back to it ------------------------------------------------
  const save = h("button", { type: "button", class: "button with-text" }, m.saveButton);
  const saveBlock = h(
    "div",
    { class: "project-aside", hidden: true },
    save,
    h("p", { class: "field-hint" }, m.saveHint),
  );
  const back = h("button", { type: "button", class: "button with-text" }, m.localButton);
  const backBlock = h(
    "div",
    { class: "project-aside", hidden: true },
    back,
    h("p", { class: "field-hint" }, m.localHint),
  );

  const checkName = (value: string): string | undefined => {
    const checked = checkProjectName(value);
    return checked.ok ? undefined : nameProblem(checked.reason, words());
  };

  // One project ----------------------------------------------------------------------------------
  const thumbnail = (project: CloudProject): HTMLElement => {
    const placeholder = () => h("span", { class: "project-thumb outline" }, icon(FOLDER_ICON));
    const source = controller.thumbnails.address(project.id, project.thumbnail);
    if (!source) return placeholder();
    const image = h("img", {
      class: "project-thumb",
      src: source,
      alt: "",
      width: 96,
      height: 64,
      loading: "lazy",
      decoding: "async",
      referrerpolicy: "no-referrer",
    });
    // A thumbnail the service does not have (yet) is the outline of a folder.
    image.addEventListener("error", () => image.replaceWith(placeholder()), { once: true });
    return image;
  };

  const row = (project: CloudProject, current: boolean): HTMLElement => {
    const open = h(
      "button",
      {
        type: "button",
        class: "project-open",
        "data-action": "open",
        "aria-label": m.open(project.name),
        "aria-current": current ? "true" : undefined,
      },
      h("span", { class: "project-name" }, project.name),
      ...(current ? [h("span", { class: "project-badge" }, m.openNow)] : []),
    );
    open.addEventListener("click", async () => {
      if (await model.open(project)) dialog.close();
    });
    const rename = rowButton("rename", ICONS.rename, m.rename(project.name));
    rename.addEventListener("click", () => void askRename(project));
    const duplicate = rowButton("duplicate", DUPLICATE_ICON, m.duplicate(project.name));
    duplicate.addEventListener("click", () => void model.duplicate(project));
    const link = rowButton("link", ICONS.link, m.copyLink(project.name));
    link.addEventListener("click", () => void copyLink(project));
    const remove = rowButton("delete", ICONS.trash, m.delete(project.name));
    remove.addEventListener("click", () => void askRemove(project));
    const managing = project.role === "owner";
    return h(
      "li",
      { class: "project-row", "data-project-id": project.id },
      thumbnail(project),
      h(
        "div",
        { class: "project-info" },
        open,
        h(
          "span",
          { class: "project-meta" },
          project.updatedAt === ""
            ? m.neverChanged
            : m.updated(whenText(project.updatedAt, getLocale())),
        ),
        // A project somebody else owns says so: what the person may do with it differs.
        ...(managing
          ? []
          : [h("span", { class: "project-meta" }, messages().viewing.sharedAs(project.role))]),
      ),
      h(
        "div",
        { class: "project-actions" },
        ...(managing ? [rename, duplicate, link, remove] : [duplicate, link]),
      ),
    );
  };

  async function askRename(project: CloudProject): Promise<void> {
    const name = await promptName(m.renameTitle, m.renameLabel, project.name, checkName);
    if (name !== undefined && !closed) await model.rename(project, name);
  }

  async function askRemove(project: CloudProject): Promise<void> {
    const position = model.state.projects.findIndex((held) => held.id === project.id);
    const sure = await confirmDialog(m.deleteTitle, m.deleteMessage(project.name), m.deleteConfirm);
    if (!sure || closed) return;
    await model.remove(project);
    if (!closed) focusRow(position);
  }

  async function copyLink(project: CloudProject): Promise<void> {
    const link = controller.link(project.id);
    try {
      await navigator.clipboard.writeText(link);
      model.say(m.linkCopied);
    } catch {
      // Without the clipboard (a page that is not secure, or a refusal) the person copies by hand.
      const box = h("input", {
        type: "text",
        value: link,
        readonly: true,
        class: "share-link",
        "aria-label": m.linkLabel,
      });
      openDialog(m.linkTitle, [field(m.linkLabel, box, m.linkHint)]);
      box.focus();
      box.select();
      model.say(m.linkSelect);
    }
  }

  /** Puts focus on the first action of a row at a position, or on the name when none is left. */
  function focusRow(position: number): void {
    const opens = [...list.querySelectorAll<HTMLElement>(".project-open")];
    (opens[Math.min(position, opens.length - 1)] ?? nameInput).focus();
  }

  // Drawing -------------------------------------------------------------------------------------
  /** Where focus was when an action began: the row and the action, or the element itself. */
  interface Held {
    readonly element: HTMLElement;
    readonly id: string | undefined;
    readonly action: string | undefined;
  }
  let held: Held | undefined;
  let wasBusy = false;

  const remember = (): Held | undefined => {
    const active = document.activeElement as HTMLElement | null;
    if (!active || !dialog.contains(active)) return undefined;
    return {
      element: active,
      id: active.closest("[data-project-id]")?.getAttribute("data-project-id") ?? undefined,
      action: active.getAttribute("data-action") ?? undefined,
    };
  };

  /** Focus goes back to where it was; the list is drawn again, so the row's button is found anew. */
  const restore = (to: Held): void => {
    const rows = [...list.querySelectorAll<HTMLElement>("[data-project-id]")];
    const again =
      to.id === undefined
        ? undefined
        : rows
            .find((r) => r.getAttribute("data-project-id") === to.id)
            ?.querySelector<HTMLElement>(`[data-action="${to.action ?? ""}"]`);
    const target = again ?? (dialog.contains(to.element) ? to.element : nameInput);
    target.focus();
  };

  const render = (state: ProjectsState): void => {
    if (closed) return;
    if (state.busy && !wasBusy) held = remember();
    status.textContent = state.status;
    problem.textContent = state.problem;
    if (state.projects !== shownRows || state.current !== shownCurrent) {
      shownRows = state.projects;
      shownCurrent = state.current;
      list.replaceChildren(
        ...state.projects.map((project) => row(project, project.id === state.current)),
      );
    }
    const ready = state.list === "ready";
    count.textContent = ready ? m.count(state.projects.length, state.limit) : "";
    none.hidden = !(ready && state.projects.length === 0);
    retry.hidden = state.list !== "failed";
    saveBlock.hidden = !state.canSave;
    backBlock.hidden = state.current === undefined;
    for (const control of dialog.querySelectorAll<HTMLButtonElement | HTMLSelectElement>(
      ".dialog-body button, .dialog-body select",
    )) {
      control.disabled = state.busy;
    }
    if (!state.busy && wasBusy && held) {
      restore(held);
      held = undefined;
    }
    wasBusy = state.busy;
  };

  const model = new ProjectsModel(controller, words, render);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (await model.create(nameInput.value, choices.value)) dialog.close();
  });
  save.addEventListener("click", async () => {
    const name = await promptName(m.saveTitle, m.saveLabel, controller.localName(), checkName);
    if (name !== undefined && !closed && (await model.saveLocal(name))) dialog.close();
  });
  back.addEventListener("click", () => {
    model.leaveToLocal();
    dialog.close();
  });
  retry.addEventListener("click", () => void model.load());

  const dialog = openDialog(
    m.title,
    [h("p", {}, m.intro), saveBlock, backBlock, form, status, problem, count, list, none, retry],
    [{ label: m.close, primary: true }],
    { drawer: true },
  );
  // A thumbnail this page sends while the drawer is open shows at once, under a new address.
  const stopThumbnails = controller.thumbnails.listen((id) => {
    const project = model.state.projects.find((held) => held.id === id);
    const row = [...list.querySelectorAll<HTMLElement>("[data-project-id]")].find(
      (element) => element.getAttribute("data-project-id") === id,
    );
    const image = row?.querySelector<HTMLImageElement>("img.project-thumb");
    const source = project && controller.thumbnails.address(id, project.thumbnail);
    if (image && source) image.src = source;
  });
  dialog.addEventListener("close", () => {
    closed = true;
    model.dispose();
    stopThumbnails();
  });
  render(model.state);
  nameInput.focus();
  nameInput.select();
  void model.load();
}
