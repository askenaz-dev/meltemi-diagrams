// The explorer's header: the open project's name, where it lives (this browser, or the cloud and
// its connection, or view only) and the panel it opens: New project, Import and Export, Save to the
// cloud, Project settings and Show all files; the project of this browser and the previous one;
// and, signed in, the person's cloud projects with their thumbnails, to open, rename, duplicate,
// link and delete. The cloud list is `ProjectsModel`'s, as the drawer it replaces had it.

import { getLocale } from "@meltemi/diagrams-i18n";
import { confirmDialog, promptName } from "../dialogs.js";
import { messages } from "../messages/index.js";
import { ICONS, field, h, icon, openDialog } from "../ui.js";
import type { CloudProject } from "../cloud/client.js";
import type { CloudController } from "../cloud/controller.js";
import { FOLDER_ICON } from "../cloud/icons.js";
import {
  ProjectsModel,
  checkProjectName,
  nameProblem,
  type ProjectsState,
} from "../cloud/projects-model.js";
import { statusText, type ConnectionStatus } from "../cloud/status.js";
import { whenText } from "../cloud/tokens.js";
import { viewerStatusWords } from "../cloud/view-model.js";
import { EXPLORER_ICONS } from "./icons.js";

/** The open project as the header shows it. */
export interface SwitcherProject {
  readonly name: string;
  readonly where: "browser" | "cloud" | "view";
  /** A cloud project's connection. */
  readonly status?: ConnectionStatus;
}

/** What the switcher asks of the page. */
export interface SwitcherHost {
  project(): SwitcherProject;
  /** Renames the open project (its `project.json`, or the cloud project); true when it was. */
  rename(name: string): Promise<boolean>;
  readonly cloud: CloudController | undefined;
  /** Where to sign in, for a page nobody is signed in on. */
  readonly signIn: string | undefined;
  /** The project of this browser: its name, and whether it is the one open. */
  local(): { readonly name: string; readonly open: boolean };
  hasPrevious(): boolean;
  openLocal(): void;
  restorePrevious(): void;
  newProject(): void;
  importProject(): void;
  exportProject(): void;
  settings(): void;
  showAll(): boolean;
  setShowAll(on: boolean): void;
  /** View mode: the project is shown, and nothing of it is changed from here. */
  readOnly(): boolean;
}

/** Below this many cloud projects the panel has no filter. */
const FILTER_FROM = 8;

let panels = 0;

export class Switcher {
  readonly element: HTMLElement;
  private readonly button: HTMLButtonElement;
  private readonly iconHolder = h("span", { class: "switcher-icon", "aria-hidden": "true" });
  private readonly name = h("span", { class: "switcher-name" });
  private readonly where = h("span", { class: "switcher-where" });
  private readonly renameButton: HTMLButtonElement;
  private panel: { close(focus: boolean): void; refresh(): void } | undefined;

  constructor(private readonly host: SwitcherHost) {
    const words = messages().explorer.switcher;
    this.button = h(
      "button",
      {
        type: "button",
        class: "switcher-button",
        "aria-haspopup": "dialog",
        "aria-expanded": "false",
      },
      this.iconHolder,
      h("span", { class: "switcher-text" }, this.name, this.where),
      icon(ICONS.chevron),
    ) as HTMLButtonElement;
    this.button.addEventListener("click", () => (this.panel ? this.close(true) : this.open()));
    this.button.addEventListener("keydown", (e) => {
      if (e.key === "F2" && !this.renameButton.hidden) {
        e.preventDefault();
        void this.rename();
      } else if (e.key === "ArrowDown" && !this.panel) {
        e.preventDefault();
        this.open();
      }
    });
    this.renameButton = h("button", {
      type: "button",
      class: "button switcher-rename",
      "aria-label": words.rename,
      title: words.rename,
    }) as HTMLButtonElement;
    this.renameButton.append(icon(ICONS.rename));
    this.renameButton.addEventListener("click", () => void this.rename());
    this.element = h("div", { class: "switcher" }, this.button, this.renameButton);
    this.update();
  }

  /** Draws the open project's name and where it lives again. */
  update(): void {
    const words = messages().explorer.switcher;
    const project = this.host.project();
    this.name.textContent = project.name;
    this.iconHolder.replaceChildren(
      icon(project.where === "browser" ? EXPLORER_ICONS.browser : EXPLORER_ICONS.cloud),
    );
    this.where.dataset.state =
      project.where === "browser" ? "browser" : (project.status?.state ?? project.where);
    if (project.where === "browser") this.where.textContent = words.browser;
    else if (project.where === "view" && !project.status) this.where.textContent = words.viewOnly;
    else {
      const status = project.status;
      const statusWords =
        project.where === "view"
          ? viewerStatusWords(messages().viewing.status)
          : messages().cloud.status;
      this.where.textContent = status ? statusText(status, statusWords) : words.viewOnly;
    }
    this.button.setAttribute("aria-label", words.open(project.name));
    this.button.title = words.open(project.name);
    this.renameButton.hidden = this.host.readOnly() || project.where === "view";
    this.panel?.refresh();
  }

  /** Asks for the project's new name, as the drawer's rename did. */
  async rename(): Promise<void> {
    if (this.host.readOnly()) return;
    const words = messages().explorer.switcher;
    const name = await promptName(
      words.renameTitle,
      words.renameLabel,
      this.host.project().name,
      (value) => {
        const checked = checkProjectName(value);
        return checked.ok ? undefined : nameProblem(checked.reason, messages().cloud);
      },
    );
    if (name === undefined) return;
    if (await this.host.rename(name)) this.update();
  }

  close(focus: boolean): void {
    this.panel?.close(focus);
  }

  /** Opens the panel under the header. */
  open(): void {
    if (this.panel) return;
    const host = this.host;
    const words = messages().explorer.panel;
    const cloudWords = messages().cloud.projects;
    const unique = ++panels;
    const title = h("h2", { id: `switcher-title-${unique}`, class: "switcher-title" }, words.title);
    const panel = h("div", {
      class: "switcher-panel",
      role: "dialog",
      "aria-labelledby": title.id,
    });
    const closeButton = h("button", {
      type: "button",
      class: "button switcher-close",
      "aria-label": words.close,
      title: words.close,
    });
    closeButton.append(icon(ICONS.close));
    closeButton.addEventListener("click", () => this.close(true));

    let model: ProjectsModel | undefined;
    let closed = false;

    // Actions ----------------------------------------------------------------------------------
    const action = (path: string, label: string, run: () => void, hint?: string) => {
      const button = h(
        "button",
        { type: "button", class: "panel-action" },
        icon(path),
        h("span", { class: "panel-action-label" }, label),
        ...(hint ? [h("span", { class: "panel-action-hint" }, hint)] : []),
      );
      button.addEventListener("click", () => {
        this.close(false);
        run();
      });
      return button;
    };
    /** Save this project to the cloud: asked a name, uploaded with progress here, then opened. */
    const saveButton = () => {
      const button = h(
        "button",
        { type: "button", class: "panel-action" },
        icon(EXPLORER_ICONS.cloud),
        h("span", { class: "panel-action-label" }, words.saveToCloud),
      );
      button.addEventListener("click", async () => {
        const controller = host.cloud;
        if (!controller || !model) return;
        const name = await promptName(
          cloudWords.saveTitle,
          cloudWords.saveLabel,
          controller.localName(),
          (value) => {
            const checked = checkProjectName(value);
            return checked.ok ? undefined : nameProblem(checked.reason, messages().cloud);
          },
        );
        if (name !== undefined && !closed && (await model.saveLocal(name))) this.close(false);
      });
      return button;
    };
    const showAll = h(
      "button",
      { type: "button", class: "panel-action toggle", "aria-pressed": String(host.showAll()) },
      icon(EXPLORER_ICONS.file),
      h("span", { class: "panel-action-label" }, messages().explorer.pane.showAll),
      h("span", { class: "switch-track", "aria-hidden": "true" }),
    );
    showAll.addEventListener("click", () => {
      host.setShowAll(!host.showAll());
      showAll.setAttribute("aria-pressed", String(host.showAll()));
    });
    const actions = h("div", { class: "panel-actions" });
    const drawActions = () => {
      const readOnly = host.readOnly();
      actions.replaceChildren(
        ...(readOnly
          ? []
          : [action(EXPLORER_ICONS.plus, words.newProject, () => host.newProject())]),
        ...(readOnly
          ? []
          : [action(EXPLORER_ICONS.import, words.importProject, () => host.importProject())]),
        action(EXPLORER_ICONS.download, words.exportProject, () => host.exportProject()),
        ...(model?.state.canSave && !readOnly ? [saveButton()] : []),
        ...(readOnly
          ? []
          : [action(EXPLORER_ICONS.settings, words.settings, () => host.settings())]),
        showAll,
      );
    };

    // This browser -----------------------------------------------------------------------------
    const browser = h("ul", { class: "panel-list" });
    const drawBrowser = () => {
      const local = host.local();
      const open = h(
        "button",
        {
          type: "button",
          class: "panel-project",
          "aria-label": words.openLocal(local.name),
          "aria-current": local.open ? "true" : undefined,
        },
        h("span", { class: "panel-thumb outline" }, icon(EXPLORER_ICONS.browser)),
        h(
          "span",
          { class: "panel-project-text" },
          h("span", { class: "panel-project-name" }, local.name),
          h("span", { class: "panel-project-meta" }, words.browserHint),
        ),
        ...(local.open ? [h("span", { class: "project-badge" }, words.openNow)] : []),
      );
      open.addEventListener("click", () => {
        this.close(false);
        if (!local.open) host.openLocal();
      });
      const rows: HTMLElement[] = [h("li", { class: "panel-row" }, open)];
      if (host.hasPrevious() && !host.readOnly()) {
        const restore = h("button", { type: "button", class: "button with-text" }, words.restore);
        restore.addEventListener("click", () => {
          this.close(false);
          host.restorePrevious();
        });
        rows.push(
          h(
            "li",
            { class: "panel-row previous" },
            h("span", { class: "panel-thumb outline small" }, icon(EXPLORER_ICONS.restore)),
            h(
              "span",
              { class: "panel-project-text" },
              h("span", { class: "panel-project-name" }, words.previous),
              h("span", { class: "panel-project-meta" }, words.previousHint),
            ),
            restore,
          ),
        );
      }
      browser.replaceChildren(...rows);
    };

    // In the cloud -----------------------------------------------------------------------------
    const cloudSection = h("section", { class: "panel-section", "aria-label": words.cloud });
    const cloudList = h("ul", { class: "panel-list", "aria-label": cloudWords.listLabel });
    const status = h("p", { class: "projects-status", role: "status" });
    const problem = h("p", { class: "field-problem", role: "alert" });
    const count = h("span", { class: "panel-count" });
    const filter = h("input", {
      type: "search",
      class: "panel-filter",
      placeholder: words.filter,
      "aria-label": words.filter,
      hidden: true,
    }) as HTMLInputElement;
    const noMatch = h("p", { class: "field-hint", hidden: true }, words.noMatch);

    const thumbnail = (controller: CloudController, project: CloudProject): HTMLElement => {
      const placeholder = () => h("span", { class: "panel-thumb outline" }, icon(FOLDER_ICON));
      const source = controller.thumbnails.address(project.id, project.thumbnail);
      if (!source) return placeholder();
      const image = h("img", {
        class: "panel-thumb",
        src: source,
        alt: "",
        width: 64,
        height: 44,
        loading: "lazy",
        decoding: "async",
        referrerpolicy: "no-referrer",
      });
      image.addEventListener("error", () => image.replaceWith(placeholder()), { once: true });
      return image;
    };

    const rowButton = (actionName: string, path: string, label: string) => {
      const button = h("button", {
        type: "button",
        class: "button project-action",
        "data-action": actionName,
        "aria-label": label,
        title: label,
      });
      button.append(icon(path));
      return button;
    };

    const cloudRow = (
      controller: CloudController,
      project: CloudProject,
      current: boolean,
    ): HTMLElement => {
      const open = h(
        "button",
        {
          type: "button",
          class: "panel-project",
          "data-action": "open",
          "aria-label": cloudWords.open(project.name),
          "aria-current": current ? "true" : undefined,
        },
        thumbnail(controller, project),
        h(
          "span",
          { class: "panel-project-text" },
          h("span", { class: "panel-project-name project-name" }, project.name),
          h(
            "span",
            { class: "panel-project-meta" },
            project.role === "owner"
              ? project.updatedAt === ""
                ? cloudWords.neverChanged
                : cloudWords.updated(whenText(project.updatedAt, getLocale()))
              : messages().viewing.sharedAs(project.role),
          ),
        ),
        ...(current ? [h("span", { class: "project-badge" }, cloudWords.openNow)] : []),
      );
      open.addEventListener("click", async () => {
        if (model && (await model.open(project))) this.close(false);
      });
      const managing = project.role === "owner";
      const rename = rowButton("rename", ICONS.rename, cloudWords.rename(project.name));
      rename.addEventListener("click", () => void askRename(project));
      const duplicate = rowButton(
        "duplicate",
        EXPLORER_ICONS.duplicate,
        cloudWords.duplicate(project.name),
      );
      duplicate.addEventListener("click", () => void model?.duplicate(project));
      const link = rowButton("link", ICONS.link, cloudWords.copyLink(project.name));
      link.addEventListener("click", () => void copyLink(controller, project));
      const remove = rowButton("delete", ICONS.trash, cloudWords.delete(project.name));
      remove.addEventListener("click", () => void askRemove(project));
      return h(
        "li",
        { class: "panel-row project-row", "data-project-id": project.id },
        open,
        h(
          "span",
          { class: "project-actions" },
          ...(managing ? [rename, duplicate, link, remove] : [duplicate, link]),
        ),
      );
    };

    const checkName = (value: string): string | undefined => {
      const checked = checkProjectName(value);
      return checked.ok ? undefined : nameProblem(checked.reason, messages().cloud);
    };
    const askRename = async (project: CloudProject) => {
      const name = await promptName(
        cloudWords.renameTitle,
        cloudWords.renameLabel,
        project.name,
        checkName,
      );
      if (name !== undefined && !closed) await model?.rename(project, name);
    };
    const askRemove = async (project: CloudProject) => {
      const sure = await confirmDialog(
        cloudWords.deleteTitle,
        cloudWords.deleteMessage(project.name),
        cloudWords.deleteConfirm,
      );
      if (sure && !closed) await model?.remove(project);
    };
    const copyLink = async (controller: CloudController, project: CloudProject) => {
      const address = controller.link(project.id);
      try {
        await navigator.clipboard.writeText(address);
        model?.say(cloudWords.linkCopied);
      } catch {
        const box = h("input", {
          type: "text",
          value: address,
          readonly: true,
          class: "share-link",
          "aria-label": cloudWords.linkLabel,
        }) as HTMLInputElement;
        openDialog(cloudWords.linkTitle, [field(cloudWords.linkLabel, box, cloudWords.linkHint)]);
        box.focus();
        box.select();
        model?.say(cloudWords.linkSelect);
      }
    };

    /** Where focus was when an action began: the row and the action, so it comes back to it. */
    let held: { id: string | undefined; action: string | undefined } | undefined;
    let wasBusy = false;
    let shown: { rows: readonly CloudProject[]; current: string | undefined; query: string } = {
      rows: [],
      current: undefined,
      query: "",
    };
    const drawCloud = (state: ProjectsState) => {
      const controller = host.cloud;
      if (!controller || closed) return;
      if (state.busy && !wasBusy) {
        const active = document.activeElement as HTMLElement | null;
        held =
          active && panel.contains(active)
            ? {
                id:
                  active.closest("[data-project-id]")?.getAttribute("data-project-id") ?? undefined,
                action: active.getAttribute("data-action") ?? undefined,
              }
            : undefined;
      }
      status.textContent = state.status;
      problem.textContent = state.problem;
      const query = filter.value.trim().toLocaleLowerCase();
      if (
        state.projects !== shown.rows ||
        state.current !== shown.current ||
        query !== shown.query
      ) {
        shown = { rows: state.projects, current: state.current, query };
        const matching = state.projects.filter((p) => p.name.toLocaleLowerCase().includes(query));
        cloudList.replaceChildren(
          ...matching.map((p) => cloudRow(controller, p, p.id === state.current)),
        );
        noMatch.hidden = matching.length > 0 || state.projects.length === 0;
      }
      const ready = state.list === "ready";
      count.textContent = ready ? cloudWords.count(state.projects.length, state.limit) : "";
      filter.hidden = !(ready && state.projects.length > FILTER_FROM);
      for (const control of cloudList.querySelectorAll<HTMLButtonElement>("button")) {
        control.disabled = state.busy;
      }
      if (!state.busy && wasBusy && held) {
        const again = [...cloudList.querySelectorAll<HTMLElement>("[data-project-id]")]
          .find((row) => row.getAttribute("data-project-id") === held!.id)
          ?.querySelector<HTMLElement>(`[data-action="${held.action ?? ""}"]`);
        (again ?? cloudList.querySelector<HTMLElement>("button") ?? closeButton).focus();
        held = undefined;
      }
      wasBusy = state.busy;
      drawActions();
      drawBrowser();
    };

    if (host.cloud) {
      const none = h("p", { class: "field-hint", hidden: true }, cloudWords.none);
      cloudSection.append(
        h("h3", { class: "panel-heading" }, h("span", {}, words.cloud), count),
        filter,
        status,
        problem,
        cloudList,
        noMatch,
        none,
      );
      model = new ProjectsModel(
        host.cloud,
        () => messages().cloud,
        (state) => {
          none.hidden = !(state.list === "ready" && state.projects.length === 0);
          drawCloud(state);
        },
      );
      filter.addEventListener("input", () => model && drawCloud(model.state));
    } else {
      const signIn = host.signIn
        ? [h("a", { class: "button with-text sign-in", href: host.signIn }, words.signIn)]
        : [];
      cloudSection.append(
        h("h3", { class: "panel-heading" }, h("span", {}, words.cloud)),
        h("p", { class: "panel-note" }, words.signInLine),
        ...signIn,
      );
    }

    drawActions();
    drawBrowser();
    panel.append(
      h("header", { class: "switcher-panel-header" }, title, closeButton),
      h(
        "div",
        { class: "switcher-panel-body" },
        actions,
        h(
          "section",
          { class: "panel-section", "aria-label": words.browser },
          h("h3", { class: "panel-heading" }, h("span", {}, words.browser)),
          browser,
        ),
        cloudSection,
      ),
    );

    // Placing and closing ----------------------------------------------------------------------
    document.body.append(panel);
    const place = () => {
      const anchor = this.element.getBoundingClientRect();
      const width = document.documentElement.clientWidth;
      const height = document.documentElement.clientHeight;
      const narrow = width < 520;
      const panelWidth = narrow ? width - 16 : Math.min(400, width - 16);
      const left = narrow ? 8 : Math.max(8, Math.min(anchor.left, width - panelWidth - 8));
      panel.style.left = `${left}px`;
      panel.style.width = `${panelWidth}px`;
      panel.style.top = `${anchor.bottom + 4}px`;
      panel.style.maxHeight = `${Math.max(200, height - anchor.bottom - 16)}px`;
    };
    place();
    const outside = (e: Event) => {
      const target = e.target as Node;
      if (panel.contains(target) || this.element.contains(target)) return;
      // A dialog opened from the panel (a rename, a confirmation) leaves it open.
      if ((target as Element).closest?.("dialog")) return;
      this.close(false);
    };
    const keys = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("dialog[open]")) {
        e.preventDefault();
        e.stopPropagation();
        this.close(true);
      }
    };
    const stopThumbnails = host.cloud?.thumbnails.listen((id) => {
      const project = model?.state.projects.find((p) => p.id === id);
      const image = cloudList.querySelector<HTMLImageElement>(
        `[data-project-id="${CSS.escape(id)}"] img.panel-thumb`,
      );
      const source = project && host.cloud?.thumbnails.address(id, project.thumbnail);
      if (image && source) image.src = source;
    });
    document.addEventListener("pointerdown", outside, true);
    panel.addEventListener("keydown", keys);
    window.addEventListener("resize", place);
    this.button.setAttribute("aria-expanded", "true");
    this.panel = {
      refresh: () => {
        drawActions();
        drawBrowser();
        model?.refreshFlags();
      },
      close: (focus: boolean) => {
        if (closed) return;
        closed = true;
        this.panel = undefined;
        model?.dispose();
        stopThumbnails?.();
        document.removeEventListener("pointerdown", outside, true);
        window.removeEventListener("resize", place);
        this.button.setAttribute("aria-expanded", "false");
        panel.classList.add("leaving");
        const gone = () => panel.remove();
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) gone();
        else setTimeout(gone, 100);
        if (focus) this.button.focus();
      },
    };
    panel.querySelector<HTMLElement>(".panel-action")?.focus();
    if (model) void model.load();
  }
}
