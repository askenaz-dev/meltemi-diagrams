// The Connected apps section of the account panel (`account-panel`, "Connected apps section"): the
// agents and apps the person approved on the consent page, each with its name and host, what it may
// do in words, when it was approved and last used, and Revoke after a confirmation that names it;
// empty, the address of the MCP endpoint and the agents guide. What it knows and does is
// `AppsModel`'s; this draws it. A client chose its own name, so every value is set as text.

import { getLocale } from "@meltemi/diagrams-i18n";
import { confirmDialog } from "../dialogs.js";
import { messages } from "../messages/index.js";
import { h } from "../ui.js";
import {
  AppsModel,
  appsApi,
  endpointOf,
  hostText,
  scopeTexts,
  type AppsState,
  type ConnectedApp,
} from "./account-panel-apps.js";
import { copyText } from "./clipboard.js";
import { whenText } from "./tokens.js";

/** How long a row that goes takes to fold: the panel's own. */
const ROW_GONE_MS = 150;

/** Whether the page asks for no motion. */
const still = (): boolean => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The section's element, how to start it the first time it shows, and how to end it. */
export interface AppsSection {
  readonly element: HTMLElement;
  /** Reads the list (the first time only). */
  shown(): void;
  dispose(): void;
}

export interface AppsSectionOptions {
  /** Says something in the page's status line. */
  readonly report?: (message: string) => void;
}

/** The section for the person signed in on this page. */
export function appsSection(options: AppsSectionOptions = {}): AppsSection {
  const words = () => messages().accountPanel;
  const m = words();
  const api = appsApi((url, init) => fetch(url, init), location);
  let disposed = false;
  let started = false;

  const list = h("ul", {
    class: "account-rows apps-list",
    "aria-label": m.sections.apps,
  });
  const problem = h("p", { class: "field-problem", role: "alert" });

  // Nothing connected: how an agent connects.
  const endpoint = endpointOf(location);
  const address = h("code", { class: "account-id apps-endpoint" }, endpoint);
  const said = h("p", { class: "field-hint", "aria-live": "polite" });
  const copy = h(
    "button",
    { type: "button", class: "button with-text", "data-action": "copy-endpoint" },
    m.apps.copy,
  );
  copy.addEventListener("click", async () => {
    if (await copyText(endpoint)) {
      said.textContent = m.apps.copied;
      return;
    }
    // The clipboard refused: the address is selected, to copy by hand.
    const range = document.createRange();
    range.selectNodeContents(address);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    said.textContent = m.apps.selectIt;
  });
  const guide = h(
    "a",
    { href: m.apps.guideHref, target: "_blank", rel: "noopener", "data-action": "agents-guide" },
    m.apps.guide,
  );
  const empty = h(
    "div",
    { class: "apps-empty", hidden: true },
    h("p", { class: "account-intro" }, m.apps.empty),
    h(
      "div",
      { class: "account-id-row", role: "group", "aria-label": m.apps.endpointLabel },
      address,
      copy,
    ),
    said,
    h("p", {}, guide, " ", h("span", { class: "field-hint" }, m.newTab)),
  );

  const retry = h("button", { type: "button", class: "button with-text" }, m.tryAgain);
  retry.addEventListener("click", () => void model.load());
  const failed = h(
    "div",
    { class: "account-unavailable", hidden: true },
    h("p", {}, m.apps.failed),
    h("div", { class: "account-actions" }, retry),
  );

  const skeleton = (): HTMLElement[] =>
    Array.from({ length: 2 }, () =>
      h(
        "li",
        { class: "account-row skeleton", "aria-hidden": "true" },
        h("span", { class: "skeleton-line" }),
      ),
    );

  const row = (app: ConnectedApp, state: AppsState): HTMLElement => {
    const locale = getLocale();
    const w = words().apps;
    const meta = [
      ...(app.createdAt === "" ? [] : [w.approvedOn(whenText(app.createdAt, locale))]),
      app.lastUsedAt === null ? w.neverUsed : w.lastUsed(whenText(app.lastUsedAt, locale)),
    ];
    const revoke = h(
      "button",
      {
        type: "button",
        class: "button with-text",
        "data-action": "revoke",
        "aria-label": w.revokeLabel(app.name),
        disabled: state.busy,
      },
      w.revoke,
    );
    revoke.addEventListener("click", () => void askRevoke(app));
    const initial = Array.from(app.name)[0]?.toUpperCase() ?? "?";
    return h(
      "li",
      { class: "account-row", "data-app": app.id },
      h("span", { class: "provider-mark", "aria-hidden": "true" }, initial),
      h(
        "div",
        { class: "account-row-info" },
        h(
          "span",
          { class: "account-row-title" },
          h("strong", {}, app.name),
          h("span", { class: "account-badge" }, hostText(app.uri, w)),
        ),
        h("span", { class: "account-row-meta" }, meta.join(" · ")),
        h(
          "span",
          {
            class: "account-row-title apps-scopes",
            role: "list",
            "aria-label": w.scopesLabel(app.name),
          },
          ...scopeTexts(app.scopes, w).map((text) =>
            h("span", { class: "account-badge", role: "listitem" }, text),
          ),
        ),
      ),
      revoke,
    );
  };

  /** Brings the list to the apps: a row that went folds away, the others are drawn again. */
  const sync = (state: AppsState): void => {
    const wanted = new Set(state.apps.map((app) => app.id));
    for (const old of list.querySelectorAll<HTMLElement>(":scope > [data-app]")) {
      if (wanted.has(old.dataset["app"]!) || old.classList.contains("row-gone")) continue;
      if (still()) {
        old.remove();
        continue;
      }
      old.style.height = `${old.offsetHeight}px`;
      // The height is read back before it folds, so that the fold starts from it.
      void old.offsetHeight;
      old.classList.add("row-gone");
      setTimeout(() => old.remove(), ROW_GONE_MS);
    }
    for (const node of list.querySelectorAll(":scope > .skeleton")) node.remove();
    let previous: HTMLElement | undefined;
    for (const app of state.apps) {
      const made = row(app, state);
      const old = list.querySelector<HTMLElement>(`:scope > [data-app="${CSS.escape(app.id)}"]`);
      if (old) old.replaceWith(made);
      else if (previous) previous.after(made);
      else list.prepend(made);
      previous = made;
    }
  };

  /** Whether the list was drawn once: what changes after that comes in with the section's motion. */
  let drawn = false;
  /** The last status reported, so that a drawing again does not say it twice. */
  let reported = "";

  const render = (state: AppsState): void => {
    if (disposed) return;
    problem.textContent = state.list === "failed" ? "" : state.problem;
    failed.hidden = state.list !== "failed";
    if (state.list === "loading" && list.childElementCount === 0) {
      empty.hidden = true;
      list.replaceChildren(...skeleton());
      return;
    }
    if (state.list === "ready") sync(state);
    // The last row folds away before the way to connect an agent takes its place.
    const folding = list.querySelector(":scope > .row-gone") !== null;
    const none = state.list === "ready" && state.apps.length === 0;
    if (none && folding) setTimeout(() => render(model.state), ROW_GONE_MS);
    const wasHidden = empty.hidden;
    empty.hidden = !none || folding;
    list.hidden = state.list === "failed" || (none && !folding);
    if (!empty.hidden && wasHidden && drawn && !still()) {
      empty.animate(
        [
          { opacity: 0, transform: "translateY(4px)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: 180, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
      );
    }
    if (state.list === "ready") drawn = true;
    if (state.status !== reported) {
      reported = state.status;
      if (reported !== "" && state.list === "ready") options.report?.(reported);
    }
  };

  const model = new AppsModel(api, words, render);

  /** Asks first, then revokes; focus lands on a button that is still there. */
  async function askRevoke(app: ConnectedApp): Promise<void> {
    const w = words().apps;
    const sure = await confirmDialog(w.revokeTitle, w.revokeMessage(app.name), w.revokeConfirm);
    if (!sure || disposed) return;
    const position = model.state.apps.findIndex((held) => held.id === app.id);
    await model.revoke(app);
    if (disposed) return;
    const buttons = [
      ...list.querySelectorAll<HTMLButtonElement>(
        ':scope > [data-app]:not(.row-gone) [data-action="revoke"]',
      ),
    ];
    (buttons[Math.min(position, buttons.length - 1)] ?? copy).focus();
  }

  const element = h(
    "div",
    { class: "account-section-body apps-section" },
    h("p", { class: "account-intro" }, m.apps.intro),
    list,
    empty,
    failed,
    problem,
  );

  return {
    element,
    shown() {
      if (!started) {
        started = true;
        void model.load();
      }
    },
    dispose() {
      disposed = true;
    },
  };
}
