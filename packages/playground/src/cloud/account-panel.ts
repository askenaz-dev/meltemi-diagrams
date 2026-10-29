// The account panel (`account-panel`): a settings modal with a list of sections beside the one
// shown: Profile (the person, their emails, the publishing handle, sign out), Sign-ins and Devices
// (what the identity service holds, read through the page's own origin), API tokens, Usage and the
// Danger zone. What it knows and does is `AccountPanelModel`'s; this draws it. Nothing of it opens a
// frame, a popup or a tab: linking a sign-in and deleting the account are navigations in this tab
// that come back to the section they left. Names, emails, labels and dates are set as text.

import { getLocale } from "@meltemi/diagrams-i18n";
import { confirmDialog } from "../dialogs.js";
import { messages } from "../messages/index.js";
import { ICONS, field, h, icon, openDialog } from "../ui.js";
import {
  ACCOUNT_SECTIONS,
  AccountPanelModel,
  accountPageAddress,
  deviceLabel,
  linkAddress,
  providerName,
  returnAddressFor,
  type AccountPanelState,
  type AccountSection,
} from "./account-panel-model.js";
import { avatar } from "./avatar.js";
import { copyText } from "./clipboard.js";
import { identityApi, type DeviceView, type IdentityApi, type SigninView } from "./identity-api.js";
import { returnAddress, type SessionUser } from "./session.js";
import { tokensSection, type TokensSection } from "./tokens-section.js";
import { whenText, type Outcome } from "./tokens.js";
import { formatBytes, type UsageSource } from "./usage.js";

/** The icons of the sections, in the canvas's 16 × 16 style. */
const SECTION_ICONS: Record<AccountSection, string> = {
  profile: ICONS.person,
  signins:
    "M5.5 7.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z|M7.3 8.2L13 2.5|M11 4.5l1.5 1.5|M9.5 6l1 1",
  devices: "M2.5 3.5h11v7h-11z|M6 13.5h4|M8 10.5v3",
  tokens: "M2.5 3.5h11v9h-11z|M5 7l2 1.5L5 10|M8.5 10H11",
  usage: "M3 13.5h10|M4.5 11V8|M8 11V4.5|M11.5 11V6.5",
  danger: ICONS.problems,
};

/** The providers a person may link. */
const PROVIDERS = ["github", "google"] as const;

/** How long a row that goes takes to fold, and a row that comes to flash. */
const ROW_GONE_MS = 150;
const CLOSE_MS = 100;

export interface AccountPanelOptions {
  readonly user: SessionUser;
  /** The identity service's account page (the session's `account`). */
  readonly accountPage: string;
  /** Where the sign-out form posts (the session's `signOut`). */
  readonly signOut: string;
  readonly section: AccountSection;
  /** What the account holds; without it the Usage section says the usage could not be read. */
  readonly usage?: UsageSource | undefined;
  /** Keeps the person's work in the browser; called before the page is left. */
  readonly keep: () => void;
  /** Chooses the handle (`PATCH /api/account`). */
  readonly setHandle: (handle: string) => Promise<Outcome<{ readonly handle: string }>>;
  /** The session ended under the page: keep the work and show the page signed out. */
  readonly signedOut: () => void;
  /** Says something in the status line. */
  readonly report?: (message: string) => void;
  /** The identity data's calls; the page's own by default. */
  readonly identity?: IdentityApi;
}

/** The panel that is open, so that a second request shows a section of it instead of another. */
let current:
  { readonly dialog: HTMLDialogElement; show(section: AccountSection): void } | undefined;

/** Whether the page asks for no motion. */
const still = (): boolean => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Opens the panel at a section, or shows that section in the panel already open. */
export function openAccountPanel(options: AccountPanelOptions): void {
  if (current?.dialog.open) {
    current.show(options.section);
    return;
  }
  const words = () => messages().accountPanel;
  const m = words();
  const locale = getLocale();
  let disposed = false;

  // The model -------------------------------------------------------------------------------------
  const model = new AccountPanelModel(
    {
      identity: options.identity ?? identityApi((url, init) => fetch(url, init), location),
      setHandle: options.setHandle,
      signedOut: () => {
        close(false);
        options.signedOut();
      },
      report: (message) => options.report?.(message),
    },
    words,
    () => messages().cloud,
    { section: options.section, handle: options.user.handle },
    (state) => render(state),
  );

  /** Where the identity service brings the person back to, at a section. */
  const back = (section: AccountSection) => returnAddressFor(location.href, section);

  // The tabs --------------------------------------------------------------------------------------
  const tabs = new Map<AccountSection, HTMLButtonElement>();
  const panels = new Map<AccountSection, HTMLElement>();
  const indicator = h("span", { class: "account-tab-indicator", "aria-hidden": "true" });
  const tablist = h("div", {
    class: "account-tabs",
    role: "tablist",
    "aria-orientation": "vertical",
    "aria-label": m.tabsLabel,
  });
  for (const section of ACCOUNT_SECTIONS) {
    const tab = h(
      "button",
      {
        type: "button",
        role: "tab",
        id: `account-tab-${section}`,
        class: "account-tab",
        "aria-controls": `account-section-${section}`,
        "aria-selected": "false",
        tabindex: "-1",
        "data-section": section,
      },
      icon(SECTION_ICONS[section]),
      h("span", {}, m.sections[section]),
    );
    tab.addEventListener("click", () => model.show(section));
    tabs.set(section, tab);
    tablist.append(tab);
  }
  tablist.append(indicator);
  tablist.addEventListener("keydown", (event) => {
    const order = [...ACCOUNT_SECTIONS];
    const at = order.indexOf(model.state.section);
    const vertical = tablist.getAttribute("aria-orientation") === "vertical";
    const next = (to: number) => {
      event.preventDefault();
      const section = order[(to + order.length) % order.length]!;
      model.show(section);
      tabs.get(section)?.focus();
    };
    if (event.key === (vertical ? "ArrowDown" : "ArrowRight")) next(at + 1);
    else if (event.key === (vertical ? "ArrowUp" : "ArrowLeft")) next(at - 1);
    else if (event.key === "Home") next(0);
    else if (event.key === "End") next(order.length - 1);
  });

  const status = h("p", { class: "account-status", role: "status" });
  const problem = h("p", { class: "field-problem account-problem", role: "alert" });
  const sectionsBox = h("div", { class: "account-sections" });
  for (const section of ACCOUNT_SECTIONS) {
    const panel = h("section", {
      class: "account-section",
      role: "tabpanel",
      id: `account-section-${section}`,
      "aria-labelledby": `account-tab-${section}`,
      tabindex: "0",
      hidden: true,
      "data-section": section,
    });
    panel.append(h("h3", { class: "account-section-title" }, m.sections[section]));
    panels.set(section, panel);
    sectionsBox.append(panel);
  }
  sectionsBox.append(status, problem);

  // Rows that come and go -----------------------------------------------------------------------
  /**
   * Brings a list to the rows of `items`: rows whose key went fold away, rows that came flash, and
   * the rest are redrawn in place, the focus kept on the action it was on.
   */
  const syncRows = <T>(
    list: HTMLElement,
    items: readonly T[],
    key: (item: T) => string,
    make: (item: T) => HTMLElement,
  ): void => {
    const held = new Map<string, HTMLElement>();
    for (const row of list.querySelectorAll<HTMLElement>(":scope > [data-key]")) {
      held.set(row.dataset["key"]!, row);
    }
    const wanted = new Set(items.map(key));
    const focusedAction = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>(
      "[data-key] [data-action]",
    );
    const focusedKey = focusedAction?.closest<HTMLElement>("[data-key]")?.dataset["key"];
    for (const [k, row] of held) {
      if (wanted.has(k) || row.classList.contains("row-gone")) continue;
      if (still()) {
        row.remove();
        continue;
      }
      row.style.height = `${row.offsetHeight}px`;
      // The height is read back before it folds, so that the fold starts from it.
      void row.offsetHeight;
      row.classList.add("row-gone");
      setTimeout(() => row.remove(), ROW_GONE_MS);
    }
    const fresh = list.querySelectorAll(":scope > [data-key]").length > 0 || held.size > 0;
    let previous: HTMLElement | undefined;
    for (const item of items) {
      const k = key(item);
      const row = make(item);
      row.dataset["key"] = k;
      const old = held.get(k);
      if (old) {
        old.replaceWith(row);
      } else {
        if (previous) previous.after(row);
        else list.prepend(row);
        // A row that came now, not one of the first drawing, says so.
        if (fresh) row.classList.add("row-new");
      }
      previous = row;
      if (k === focusedKey && focusedAction) {
        row
          .querySelector<HTMLElement>(`[data-action="${focusedAction.dataset["action"]}"]`)
          ?.focus();
      }
    }
  };

  const skeleton = (count: number): HTMLElement[] =>
    Array.from({ length: count }, () =>
      h(
        "li",
        { class: "account-row skeleton", "aria-hidden": "true" },
        h("span", { class: "skeleton-line" }),
      ),
    );

  /** What Sign-ins and Devices show when the identity service could not be reached. */
  const unavailableBlock = (section: AccountSection): HTMLElement => {
    const retry = h("button", { type: "button", class: "button with-text" }, m.tryAgain);
    retry.addEventListener("click", () => void model.load());
    const page = h(
      "a",
      { class: "button with-text", href: accountPageAddress(options.accountPage, back(section)) },
      m.openPage,
    );
    page.addEventListener("click", () => options.keep());
    return h(
      "div",
      { class: "account-unavailable", role: "group" },
      h("p", {}, m.unavailable),
      h("div", { class: "account-actions" }, retry, page),
    );
  };

  // Profile ---------------------------------------------------------------------------------------
  const emails = h("ul", { class: "account-emails", "aria-label": m.emailsLabel });
  const handleInput = h("input", {
    type: "text",
    value: options.user.handle ?? "",
    autocomplete: "off",
    spellcheck: "false",
    autocapitalize: "none",
    maxlength: 64,
  });
  const handleProblem = h("p", { class: "field-problem", "aria-live": "polite" });
  const handleNow = h("p", { class: "field-hint account-handle-now" });
  const handleSave = h(
    "button",
    { type: "submit", class: "button primary with-text", "data-action": "save-handle" },
    m.handleSave,
  );
  const handleForm = h(
    "form",
    { class: "account-handle", novalidate: true },
    field(m.handleLabel, handleInput, m.handleHint),
    handleSave,
  );
  handleForm.append(handleProblem, handleNow);
  handleInput.addEventListener("input", () => model.typedHandle(handleInput.value));
  handleForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const saved = await model.saveHandle(handleInput.value);
    if (!saved && !disposed) handleInput.focus();
  });
  // Sign out is the same plain form as the menu's: its `return_to` is the page.
  const returnTo = h("input", { type: "hidden", name: "return_to" });
  const signOutForm = h(
    "form",
    { method: "post", action: options.signOut, class: "account-sign-out" },
    returnTo,
    h("button", { type: "submit", class: "button with-text" }, m.signOutTitle),
  );
  signOutForm.addEventListener("submit", () => {
    returnTo.value = returnAddress(location.href);
    options.keep();
  });
  // The account id: what an administrator asks a person for, to grant something to their account.
  const accountId = h("code", { class: "account-id" }, options.user.sub);
  const accountIdSaid = h("p", { class: "field-hint", "aria-live": "polite" });
  const accountIdCopy = h(
    "button",
    { type: "button", class: "button with-text", "data-action": "copy-account-id" },
    m.accountIdCopy,
  );
  accountIdCopy.addEventListener("click", async () => {
    if (await copyText(options.user.sub)) {
      accountIdSaid.textContent = m.accountIdCopied;
      return;
    }
    // The clipboard refused: the id is selected, to copy by hand.
    const range = document.createRange();
    range.selectNodeContents(accountId);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    accountIdSaid.textContent = m.accountIdSelect;
  });
  // What the account may do that an administrator granted.
  const unbranded = options.user.entitlements.unbranded
    ? [h("h4", {}, m.unbrandedTitle), h("p", { class: "account-intro" }, m.unbrandedOn)]
    : [];
  const name = options.user.name.trim();
  panels
    .get("profile")!
    .append(
      h(
        "div",
        { class: "account-profile-head" },
        avatar(options.user.picture, 48),
        h(
          "div",
          { class: "account-profile-name" },
          ...(name === "" ? [] : [h("strong", {}, name)]),
          h("span", { class: "account-intro" }, m.profileIntro),
        ),
      ),
      h("h4", {}, m.emailsLabel),
      emails,
      h("h4", {}, m.handleTitle),
      h("p", { class: "account-intro" }, m.handleIntro),
      handleForm,
      h("h4", {}, m.accountIdTitle),
      h("p", { class: "account-intro" }, m.accountIdIntro),
      h("div", { class: "account-id-row" }, accountId, accountIdCopy),
      accountIdSaid,
      ...unbranded,
      h("h4", {}, m.signOutTitle),
      h("p", { class: "account-intro" }, m.signOutIntro),
      signOutForm,
    );

  // Sign-ins --------------------------------------------------------------------------------------
  const signinList = h("ul", {
    class: "account-rows signin-list",
    "aria-label": m.sections.signins,
  });
  const signinNote = h("p", { class: "field-hint" });
  const links = h("div", { class: "account-actions account-links" });
  const linkBlock = h(
    "div",
    { class: "account-link-block" },
    h("h4", {}, m.linkTitle),
    links,
    h("p", { class: "field-hint" }, m.linkHint),
  );
  const signinUnavailable = h("div");
  panels
    .get("signins")!
    .append(
      h("p", { class: "account-intro" }, m.signinsIntro),
      signinList,
      signinNote,
      linkBlock,
      signinUnavailable,
    );

  const signinRow = (signin: SigninView, state: AccountPanelState): HTMLElement => {
    const provider = providerName(signin.provider, m);
    const meta = [
      signin.handle !== "" ? signin.handle : signin.email !== "" ? signin.email : m.noEmail,
      ...(signin.linkedAt === "" ? [] : [m.linkedOn(whenText(signin.linkedAt, locale))]),
    ];
    const unlink = h(
      "button",
      {
        type: "button",
        class: "button with-text",
        "data-action": "unlink",
        "aria-label": m.unlinkLabel(provider),
        disabled: state.busy || !state.view?.canUnlink,
        title: state.view?.canUnlink ? undefined : m.onlySignin,
      },
      m.unlink,
    );
    unlink.addEventListener("click", async () => {
      const sure = await confirmDialog(m.unlinkTitle, m.unlinkMessage(provider), m.unlinkConfirm);
      if (sure && !disposed) await model.unlink(signin.provider);
    });
    return h(
      "li",
      { class: "account-row", "data-provider": signin.provider },
      h(
        "span",
        { class: "provider-mark", "data-provider": signin.provider, "aria-hidden": "true" },
        provider.slice(0, 1),
      ),
      h(
        "div",
        { class: "account-row-info" },
        h(
          "span",
          { class: "account-row-title" },
          h("strong", {}, provider),
          ...(signin.emailVerified ? [h("span", { class: "account-badge" }, m.verified)] : []),
        ),
        h("span", { class: "account-row-meta" }, meta.join(" · ")),
      ),
      unlink,
    );
  };

  // Devices ---------------------------------------------------------------------------------------
  const deviceList = h("ul", {
    class: "account-rows device-list",
    "aria-label": m.sections.devices,
  });
  const revokeOthers = h(
    "button",
    { type: "button", class: "button with-text", "data-action": "revoke-others" },
    m.signOutOthers,
  );
  revokeOthers.addEventListener("click", async () => {
    const sure = await confirmDialog(
      m.signOutOthersTitle,
      m.signOutOthersMessage,
      m.signOutOthersConfirm,
    );
    if (sure && !disposed) await model.revokeOthers();
  });
  const devicesActions = h(
    "div",
    { class: "account-device-actions" },
    h("div", { class: "account-actions" }, revokeOthers),
    h("p", { class: "field-hint" }, m.withinTheHour),
  );
  const devicesUnavailable = h("div");
  panels
    .get("devices")!
    .append(
      h("p", { class: "account-intro" }, m.devicesIntro),
      deviceList,
      devicesActions,
      devicesUnavailable,
    );

  const deviceRow = (device: DeviceView, state: AccountPanelState): HTMLElement => {
    const label = deviceLabel(device.label, m);
    const meta = [
      ...(device.createdAt === "" ? [] : [m.signedInOn(whenText(device.createdAt, locale))]),
      ...(device.lastSeen === "" ? [] : [m.lastSeen(whenText(device.lastSeen, locale))]),
    ];
    const actions: HTMLElement[] = [];
    if (!device.current) {
      const signOut = h(
        "button",
        {
          type: "button",
          class: "button with-text",
          "data-action": "revoke",
          "aria-label": m.signOutDeviceLabel(label),
          disabled: state.busy,
        },
        m.signOutDevice,
      );
      signOut.addEventListener("click", async () => {
        const sure = await confirmDialog(
          m.signOutDeviceTitle,
          m.signOutDeviceMessage(label),
          m.signOutDeviceConfirm,
        );
        if (sure && !disposed) await model.revokeOne(device.sid, device.label);
      });
      actions.push(signOut);
    }
    return h(
      "li",
      { class: "account-row", "data-current": String(device.current) },
      h("span", { class: "device-mark", "aria-hidden": "true" }, icon(SECTION_ICONS.devices)),
      h(
        "div",
        { class: "account-row-info" },
        h(
          "span",
          { class: "account-row-title" },
          h("strong", {}, label),
          ...(device.current ? [h("span", { class: "account-badge current" }, m.thisDevice)] : []),
        ),
        h("span", { class: "account-row-meta" }, meta.join(" · ")),
      ),
      ...actions,
    );
  };

  // API tokens ------------------------------------------------------------------------------------
  let tokens: TokensSection | undefined;

  // Usage -----------------------------------------------------------------------------------------
  const usageRows = h("div", { class: "account-usage-panel" });
  const limitsTable = h("table", { class: "account-limits" });
  const usageFailed = h("div", { class: "account-unavailable", hidden: true });
  {
    const retry = h("button", { type: "button", class: "button with-text" }, m.tryAgain);
    retry.addEventListener("click", () => void readUsage());
    usageFailed.append(h("p", {}, m.usageFailed), h("div", { class: "account-actions" }, retry));
  }
  panels
    .get("usage")!
    .append(
      h("p", { class: "account-intro" }, m.usageIntro),
      usageRows,
      h("h4", {}, m.limitsTitle),
      limitsTable,
      usageFailed,
    );
  let usageRead = false;
  let usageFilled = false;
  const drawUsage = (): void => {
    const view = options.usage?.view;
    usageFailed.hidden = !(usageRead && view === undefined);
    if (!view) return;
    const cloud = messages().cloud;
    const line = (text: string, value: number, max: number) => {
      const fill = h("span", { class: "usage-fill" });
      const share = max > 0 ? Math.min(1, value / max) : 0;
      fill.style.setProperty("--fill", usageFilled || still() ? String(share) : "0");
      if (!usageFilled && !still()) {
        requestAnimationFrame(() => fill.style.setProperty("--fill", String(share)));
      }
      const row = h(
        "div",
        { class: "usage-row" },
        h("span", { class: "usage-text" }, text),
        h("span", { class: "usage-bar", "aria-hidden": "true" }, fill),
      );
      if (value >= max * 0.9) row.classList.add("full");
      return row;
    };
    usageRows.replaceChildren(
      line(cloud.projects.count(view.projects, view.maxProjects), view.projects, view.maxProjects),
      line(
        cloud.usage.storage(
          formatBytes(view.storageBytes, locale),
          formatBytes(view.maxStorageBytes, locale),
        ),
        view.storageBytes,
        view.maxStorageBytes,
      ),
    );
    usageFilled = true;
    const count = (n: number) => new Intl.NumberFormat(locale).format(n);
    const rows: [string, string][] = [
      ["files", count(view.limits.files)],
      ["documentBytes", formatBytes(view.limits.documentBytes, locale)],
      ["binaryBytes", formatBytes(view.limits.binaryBytes, locale)],
      ["versions", count(view.limits.versions)],
    ];
    limitsTable.replaceChildren(
      ...rows.map(([k, value]) =>
        h(
          "tr",
          { "data-limit": k },
          h("th", { scope: "row" }, m.limits[k] ?? k),
          h("td", {}, value),
        ),
      ),
    );
  };
  const stopUsage = options.usage?.listen(drawUsage);
  const readUsage = async (): Promise<void> => {
    if (!options.usage) {
      usageRead = true;
      drawUsage();
      return;
    }
    usageFailed.hidden = true;
    await options.usage.refresh();
    usageRead = true;
    if (!disposed) drawUsage();
  };

  // Danger zone -----------------------------------------------------------------------------------
  const deleteLink = h(
    "a",
    {
      class: "button danger with-text",
      href: accountPageAddress(options.accountPage, back("danger")),
      "data-action": "delete-account",
    },
    m.deleteAccount,
  );
  deleteLink.addEventListener("click", () => options.keep());
  panels
    .get("danger")!
    .append(
      h(
        "div",
        { class: "danger-box" },
        h("h4", {}, m.dangerTitle),
        h("p", {}, m.dangerBody),
        h("p", { class: "field-hint" }, m.dangerHint),
        h("div", { class: "account-actions" }, deleteLink),
      ),
    );

  // Drawing ---------------------------------------------------------------------------------------
  let shownSection: AccountSection | undefined;

  const moveIndicator = (section: AccountSection): void => {
    const tab = tabs.get(section);
    if (!tab) return;
    const vertical = tablist.getAttribute("aria-orientation") === "vertical";
    indicator.style.transform = vertical
      ? `translateY(${tab.offsetTop}px)`
      : `translateX(${tab.offsetLeft}px)`;
    indicator.style.height = vertical ? `${tab.offsetHeight}px` : "";
    indicator.style.width = vertical ? "" : `${tab.offsetWidth}px`;
  };

  const showSection = (section: AccountSection): void => {
    if (shownSection === section) return;
    const first = shownSection === undefined;
    shownSection = section;
    for (const [s, tab] of tabs) {
      const chosen = s === section;
      tab.setAttribute("aria-selected", String(chosen));
      tab.tabIndex = chosen ? 0 : -1;
      panels.get(s)!.hidden = !chosen;
    }
    const panel = panels.get(section)!;
    if (!first && !still()) {
      panel.classList.remove("entering");
      void panel.offsetWidth;
      panel.classList.add("entering");
    }
    moveIndicator(section);
    tabs.get(section)?.scrollIntoView({ block: "nearest", inline: "nearest" });
    if (section === "tokens") {
      if (!tokens) {
        tokens = tokensSection();
        panel.append(tokens.element);
      }
      tokens.shown();
    }
    if (section === "usage") void readUsage();
  };

  const render = (state: AccountPanelState): void => {
    if (disposed) return;
    showSection(state.section);
    status.textContent = state.status;
    problem.textContent = state.problem;

    // Profile
    handleProblem.textContent = state.handleProblem;
    handleNow.textContent = state.handle === null ? m.handleNone : m.handleSaved(state.handle);
    handleSave.disabled = state.busy;
    if (state.identity === "ready" && state.view) {
      const shown = state.view.signins.map((signin) =>
        signin.email !== "" ? signin.email : `${providerName(signin.provider, m)}: ${m.noEmail}`,
      );
      emails.replaceChildren(...[...new Set(shown)].map((email) => h("li", {}, email)));
    } else if (state.identity === "loading") {
      emails.replaceChildren(...skeleton(1));
    } else {
      emails.replaceChildren(h("li", { class: "field-hint" }, m.unavailable));
    }

    // Sign-ins and Devices
    const ready = state.identity === "ready" && state.view !== undefined;
    signinList.hidden = state.identity === "failed";
    deviceList.hidden = state.identity === "failed";
    linkBlock.hidden = !ready;
    devicesActions.hidden = !ready;
    signinUnavailable.replaceChildren(
      ...(state.identity === "failed" ? [unavailableBlock("signins")] : []),
    );
    devicesUnavailable.replaceChildren(
      ...(state.identity === "failed" ? [unavailableBlock("devices")] : []),
    );
    if (state.identity === "loading" && !state.view) {
      signinList.replaceChildren(...skeleton(2));
      deviceList.replaceChildren(...skeleton(2));
    }
    if (ready) {
      const view = state.view!;
      for (const row of signinList.querySelectorAll(".skeleton")) row.remove();
      for (const row of deviceList.querySelectorAll(".skeleton")) row.remove();
      syncRows(
        signinList,
        view.signins,
        (s) => s.provider,
        (s) => signinRow(s, state),
      );
      signinNote.textContent = view.canUnlink ? "" : m.onlySignin;
      const linked = new Set(view.signins.map((s) => s.provider));
      links.replaceChildren(
        ...PROVIDERS.filter((p) => !linked.has(p)).map((provider) => {
          const link = h(
            "a",
            {
              class: "button with-text",
              href: linkAddress(options.accountPage, provider, back("signins")),
              "data-action": `link-${provider}`,
            },
            m.link(providerName(provider, m)),
          );
          link.addEventListener("click", () => options.keep());
          return link;
        }),
      );
      linkBlock.hidden = links.childElementCount === 0;
      syncRows(
        deviceList,
        view.devices,
        (d) => d.sid,
        (d) => deviceRow(d, state),
      );
      revokeOthers.disabled = state.busy || view.devices.filter((d) => !d.current).length === 0;
    }
  };

  // The dialog ------------------------------------------------------------------------------------
  const body = h("div", { class: "account-panel" }, tablist, sectionsBox);
  const dialog = openDialog(m.title, [body], [], { settings: true });
  let closing = false;
  /** Closes with the panel's own motion, unless the page asks for none or `animate` is false. */
  function close(animate = true): void {
    if (closing || !dialog.open) return;
    closing = true;
    if (!animate || still()) {
      dialog.close();
      return;
    }
    dialog.classList.add("closing");
    setTimeout(() => dialog.close(), CLOSE_MS);
  }
  // Escape and the close button take the panel's way out, so that it can fold.
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  dialog.querySelector<HTMLButtonElement>("header .close")?.addEventListener(
    "click",
    (event) => {
      event.stopImmediatePropagation();
      close();
    },
    { capture: true },
  );
  dialog.addEventListener("close", () => {
    disposed = true;
    model.dispose();
    tokens?.dispose();
    stopUsage?.();
    observer.disconnect();
    if (current?.dialog === dialog) current = undefined;
  });

  // Narrow: the tabs become a strip above the content.
  const narrow = window.matchMedia("(max-width: 720px)");
  const orient = (): void => {
    tablist.setAttribute("aria-orientation", narrow.matches ? "horizontal" : "vertical");
    if (shownSection) moveIndicator(shownSection);
  };
  const observer = new ResizeObserver(() => orient());
  observer.observe(dialog);
  orient();

  current = {
    dialog,
    show: (section) => {
      model.show(section);
      tabs.get(section)?.focus();
    },
  };
  render(model.state);
  tabs.get(model.state.section)?.focus();
  void model.load();
}
