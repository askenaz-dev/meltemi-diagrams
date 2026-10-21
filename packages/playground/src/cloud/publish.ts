// The publish dialog of a cloud project, opened from the share dialog and for the owner only: a form
// that publishes the project's HTML catalog (the page builds it, exactly as the catalog export does) at
// an address the service gives, asking for the person's handle the first time; the address of what was
// just published with copy and an open-link; the project's published pages with publish again and
// unpublish (after a confirmation); and what the service took down, said as removed by the service.
// What it knows and does is `PublishModel`'s; this draws it. Names, addresses, dates and the service's
// words are set as text, never as markup, and the one link the dialog makes (to a published page) is
// the address the service gave, once `publicationUrl` allowed it, opened in a new tab with no opener.

import { getLocale } from "@meltemi/diagrams-i18n";
import { confirmDialog } from "../dialogs.js";
import { projectCatalog } from "../exports/files.js";
import { messages } from "../messages/index.js";
import type { Playground } from "../shell.js";
import { ICONS, field, h, icon, openDialog } from "../ui.js";
import { copyText } from "./clipboard.js";
import type { Publication, PublishApi, Published, Takedown } from "./publish-api.js";
import { publishApi } from "./publish-api.js";
import {
  PublishModel,
  checkHandle,
  checkSlug,
  defaultSlug,
  type BuiltCatalog,
  type PublishState,
} from "./publish-model.js";
import { whenText } from "./tokens.js";
import { formatBytes } from "./usage.js";

/** What the dialog is about and how it reaches the page: the page's own parts, handed in. */
export interface PublishOptions {
  readonly project: { readonly id: string; readonly name: string };
  readonly api: PublishApi;
  /** Builds the project's HTML catalog exactly as the catalog export does. */
  readonly build: () => Promise<BuiltCatalog>;
  /** Says something in the status line. */
  readonly report: (message: string) => void;
  /** Writes to the clipboard; the browser's by default. */
  readonly copy?: (text: string) => Promise<boolean>;
}

let dialogs = 0;

/** Opens the dialog of the open cloud project of a playground. */
export function openPublishDialog(playground: Playground): void {
  const cloud = playground.cloud;
  const project = cloud?.openProject;
  const env = playground.options.cloud;
  if (!cloud || !project || !env) return;
  openPublish({
    project,
    api: publishApi(env.fetch, { href: env.location.href() }),
    build: async () => {
      const built = await projectCatalog(playground, { strict: true });
      return {
        html: built.html,
        entries: built.data.entries.length,
        skipped: built.skipped.length,
      };
    },
    report: (message) => cloud.report(message),
  });
}

/** Opens the dialog for a project. */
export function openPublish(options: PublishOptions): HTMLDialogElement {
  const words = () => messages().cloud;
  const m = words().publishing;
  const unique = ++dialogs;
  const locale = getLocale();
  let closed = false;
  /** What the dialog is drawing, so that it draws a list again only when it changed. */
  let shownPublications: readonly Publication[] | undefined;
  let shownTakedowns: readonly Takedown[] | undefined;
  let shownPublished: Published | undefined;

  const copy = options.copy ?? copyText;

  const status = h("p", { class: "share-status", role: "status" });
  const problem = h("p", { class: "field-problem", role: "alert" });
  const messagesBox = h("div", { class: "share-messages" }, status, problem);
  const retry = h(
    "button",
    { type: "button", class: "button with-text", hidden: true },
    m.tryAgain,
  );
  retry.addEventListener("click", () => void model.load());

  // The form ---------------------------------------------------------------------------------------
  const handleInput = h("input", {
    type: "text",
    autocomplete: "off",
    spellcheck: "false",
    autocapitalize: "none",
    maxlength: 64,
  });
  const handleProblem = h("p", {
    class: "field-problem",
    id: `publish-handle-problem-${unique}`,
    "aria-live": "polite",
  });
  const handleField = field(m.handleLabel, handleInput, m.handleHint);
  const slugInput = h("input", {
    type: "text",
    value: defaultSlug(options.project.name, words()),
    autocomplete: "off",
    spellcheck: "false",
    autocapitalize: "none",
    maxlength: 128,
  });
  const slugProblem = h("p", {
    class: "field-problem",
    id: `publish-slug-problem-${unique}`,
    "aria-live": "polite",
  });
  const slugField = field(m.slugLabel, slugInput, m.slugHint);
  handleInput.setAttribute("aria-describedby", `${handleInput.id}-hint ${handleProblem.id}`);
  slugInput.setAttribute("aria-describedby", `${slugInput.id}-hint ${slugProblem.id}`);
  const addressEnd = h("p", { class: "field-hint publish-address-end" });
  const publishButton = h(
    "button",
    { type: "submit", class: "button primary with-text" },
    m.publishButton,
  );
  const handleBlock = h(
    "div",
    { class: "publish-handle", hidden: true },
    handleField,
    handleProblem,
  );
  const form = h(
    "form",
    { class: "publish-form", novalidate: true, hidden: true, "aria-label": m.title },
    handleBlock,
    slugField,
    slugProblem,
    addressEnd,
    publishButton,
  );

  /** What the address will end in, said while both parts are fine. */
  const showAddressEnd = (state: PublishState): void => {
    const handle =
      state.handle ?? (checkHandle(handleInput.value).ok ? handleInput.value.trim() : "");
    const slug = checkSlug(slugInput.value);
    addressEnd.textContent = handle !== "" && slug.ok ? m.addressEnd(handle, slug.value) : "";
  };

  handleInput.addEventListener("input", () => {
    model.typedHandle(handleInput.value);
    showAddressEnd(model.state);
  });
  slugInput.addEventListener("input", () => {
    model.typedSlug(slugInput.value);
    showAddressEnd(model.state);
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const published = await model.publish({ slug: slugInput.value, handle: handleInput.value });
    if (closed) return;
    if (published) reveal.querySelector<HTMLElement>('[data-action="copy"]')?.focus();
    else if (model.state.handleProblem !== "" && !handleBlock.hidden) handleInput.focus();
    else if (model.state.slugProblem !== "") slugInput.focus();
  });

  // The page just published -------------------------------------------------------------------------
  const addressBlock = (page: { slug: string; url: string }, fresh: boolean): HTMLElement => {
    const box = h("input", {
      type: "text",
      class: "share-link share-invitation-link",
      value: page.url,
      readonly: true,
      autocomplete: "off",
      spellcheck: "false",
      "aria-label": m.addressLabel(page.slug),
    });
    const copyIt = h(
      "button",
      {
        type: "button",
        class: "button with-text",
        "data-action": "copy",
        "aria-label": m.copyLabel(page.slug),
      },
      h("span", {}, m.copy),
    );
    copyIt.addEventListener("click", async () => {
      if (!(await model.copy(page.url)) && !closed) {
        box.focus();
        box.select();
      }
    });
    const open = h(
      "a",
      {
        class: "button with-text",
        href: page.url,
        target: "_blank",
        rel: "noopener noreferrer",
        "aria-label": m.openLabel(page.slug),
      },
      icon(ICONS.link),
      h("span", {}, m.open),
    );
    return h("div", { class: fresh ? "share-row publish-fresh" : "share-row" }, box, copyIt, open);
  };

  const reveal = h("div", {
    class: "share-reveal",
    role: "group",
    "aria-label": m.title,
    hidden: true,
  });

  // What the project has published --------------------------------------------------------------------
  const listTitle = h("h3", { id: `publish-list-${unique}` }, m.listTitle);
  const list = h("ul", { class: "share-list", "aria-labelledby": listTitle.id });
  const none = h("p", { class: "share-none", hidden: true }, m.none);
  const listSection = h("section", { class: "share-section", hidden: true }, listTitle, list, none);

  const row = (publication: Publication): HTMLElement => {
    const again = h(
      "button",
      {
        type: "button",
        class: "button with-text",
        "data-action": "republish",
        "aria-label": m.republishLabel(publication.slug),
      },
      icon(ICONS.restore),
      h("span", {}, m.republish),
    );
    again.addEventListener("click", () => {
      void model.publish({ slug: publication.slug });
    });
    const remove = h(
      "button",
      {
        type: "button",
        class: "button with-text",
        "data-action": "unpublish",
        "aria-label": m.unpublishLabel(publication.slug),
      },
      icon(ICONS.trash),
      h("span", {}, m.unpublish),
    );
    remove.addEventListener("click", () => void askUnpublish(publication));
    const when =
      publication.publishedAt === ""
        ? []
        : [m.publishedAt(whenText(publication.publishedAt, locale))];
    const size = publication.bytes > 0 ? [formatBytes(publication.bytes, locale)] : [];
    return h(
      "li",
      { class: "share-person publish-row", "data-key": publication.slug },
      h(
        "div",
        { class: "share-person-info" },
        h("strong", { class: "share-person-name" }, publication.slug),
        ...(publication.url === undefined
          ? []
          : [
              h(
                "a",
                {
                  class: "publish-url",
                  href: publication.url,
                  target: "_blank",
                  rel: "noopener noreferrer",
                },
                publication.url,
              ),
            ]),
        h("span", { class: "share-meta" }, [...when, ...size].join(" · ")),
      ),
      h(
        "div",
        { class: "share-controls" },
        ...(publication.url === undefined ? [] : [copyRow(publication)]),
        again,
        remove,
      ),
    );
  };

  /** The copy button of a row: the address is in the row as a link, so this needs no field. */
  const copyRow = (publication: Publication): HTMLElement => {
    const button = h(
      "button",
      {
        type: "button",
        class: "button with-text",
        "data-action": "copy",
        "aria-label": m.copyLabel(publication.slug),
      },
      h("span", {}, m.copy),
    );
    button.addEventListener("click", () => {
      void model.copy(publication.url ?? "").then((copied) => {
        if (!copied && !closed) selectLink(publication.slug);
      });
    });
    return button;
  };

  /** Without the clipboard the person copies by hand: the row's address is selected. */
  function selectLink(slug: string): void {
    const link = [...list.querySelectorAll<HTMLElement>("li")]
      .find((item) => item.getAttribute("data-key") === slug)
      ?.querySelector(".publish-url");
    if (!link) return;
    const range = document.createRange();
    range.selectNodeContents(link);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  async function askUnpublish(publication: Publication): Promise<void> {
    const position = model.state.publications.findIndex((held) => held.slug === publication.slug);
    const sure = await confirmDialog(
      m.unpublishTitle,
      m.unpublishMessage(publication.slug),
      m.unpublishConfirm,
    );
    if (!sure || closed) return;
    await model.unpublish(publication.slug);
    if (closed) return;
    const rows = [...list.querySelectorAll<HTMLElement>("li")];
    const next = rows[Math.min(position, rows.length - 1)];
    (next?.querySelector<HTMLElement>('[data-action="unpublish"]') ?? slugInput).focus();
  }

  // What the service took down -----------------------------------------------------------------------
  const removedTitle = h("h3", { id: `publish-removed-${unique}` }, m.removedTitle);
  const removedList = h("ul", { class: "share-list", "aria-labelledby": removedTitle.id });
  const removedSection = h(
    "section",
    { class: "share-section", hidden: true },
    removedTitle,
    removedList,
  );
  const takedownRow = (takedown: Takedown): HTMLElement =>
    h(
      "li",
      { class: "publish-removed", "data-slug": takedown.slug },
      h(
        "span",
        { class: "share-person-name" },
        m.removedByService(takedown.slug, takedown.at === "" ? "" : whenText(takedown.at, locale)),
      ),
      ...(takedown.reason === null
        ? []
        : [h("span", { class: "share-meta" }, m.removedReason(takedown.reason))]),
    );

  // Drawing -------------------------------------------------------------------------------------
  interface Held {
    readonly element: HTMLElement;
    readonly key: string | undefined;
    readonly action: string | undefined;
  }
  let held: Held | undefined;
  let wasBusy = false;

  const remember = (): Held | undefined => {
    const active = document.activeElement as HTMLElement | null;
    if (!active || !dialog.contains(active)) return undefined;
    return {
      element: active,
      key: active.closest("[data-key]")?.getAttribute("data-key") ?? undefined,
      action: active.getAttribute("data-action") ?? undefined,
    };
  };

  const restoreFocus = (to: Held): void => {
    const again =
      to.key === undefined
        ? undefined
        : [...list.querySelectorAll<HTMLElement>("[data-key]")]
            .find((item) => item.getAttribute("data-key") === to.key)
            ?.querySelector<HTMLElement>(`[data-action="${to.action ?? ""}"]`);
    (again ?? (dialog.contains(to.element) && !to.element.hidden ? to.element : slugInput)).focus();
  };

  const render = (state: PublishState): void => {
    if (closed) return;
    if (state.busy && !wasBusy) held = remember();
    status.textContent = state.status;
    problem.textContent = state.problem;
    handleProblem.textContent = state.handleProblem;
    slugProblem.textContent = state.slugProblem;
    for (const [input, wrong] of [
      [handleInput, state.handleProblem !== ""],
      [slugInput, state.slugProblem !== ""],
    ] as const) {
      if (wrong) input.setAttribute("aria-invalid", "true");
      else input.removeAttribute("aria-invalid");
    }
    retry.hidden = state.list !== "failed";

    const ready = state.list === "ready";
    form.hidden = !ready;
    handleBlock.hidden = state.handle !== null;
    listSection.hidden = !ready;
    none.hidden = !(ready && state.publications.length === 0);
    removedSection.hidden = !(ready && state.takedowns.length > 0);
    showAddressEnd(state);

    if (state.publications !== shownPublications) {
      shownPublications = state.publications;
      list.replaceChildren(...state.publications.map(row));
    }
    if (state.takedowns !== shownTakedowns) {
      shownTakedowns = state.takedowns;
      removedList.replaceChildren(...state.takedowns.map(takedownRow));
    }
    if (state.published !== shownPublished) {
      shownPublished = state.published;
      reveal.replaceChildren(
        ...(state.published
          ? [
              h("p", { class: "share-reveal-note" }, m.published(state.published.slug)),
              addressBlock(state.published, true),
            ]
          : []),
      );
      reveal.hidden = state.published === undefined;
    }

    dialog.querySelector(".dialog-body")?.setAttribute("aria-busy", String(state.busy));
    for (const control of dialog.querySelectorAll<HTMLButtonElement>(".dialog-body button")) {
      control.disabled = state.busy;
    }
    handleInput.readOnly = state.busy;
    slugInput.readOnly = state.busy;
    if (!state.busy && wasBusy && held) {
      restoreFocus(held);
      held = undefined;
    }
    wasBusy = state.busy;
  };

  const model = new PublishModel(
    { api: options.api, build: options.build, copy, report: options.report },
    options.project.id,
    words,
    render,
  );

  const dialog = openDialog(
    m.title,
    [h("p", {}, m.intro), messagesBox, retry, form, reveal, listSection, removedSection],
    [{ label: m.close, primary: true }],
  );
  dialog.addEventListener("close", () => {
    closed = true;
    model.dispose();
  });
  render(model.state);
  void model.load().then(() => {
    // The form appears once what is published is read: focus goes to it unless the person moved on.
    const active = document.activeElement;
    const resting = active === dialog || active?.classList.contains("close") === true;
    if (!closed && model.state.list === "ready" && resting) {
      (handleBlock.hidden ? slugInput : handleInput).focus();
    }
  });
  return dialog;
}
