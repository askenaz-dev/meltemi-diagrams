// The account in the header. Nobody signed in: a "Sign in" link to the identity service. A person
// signed in: a button with their avatar and name, and a menu with Account and API tokens (which open
// the account panel at a section) and "Sign out", and, where the page has cloud projects, what the
// account holds (its projects and its storage against their limits, read when the menu opens and
// never waited for), which opens the panel at Usage. Signing in and out are navigations to the
// identity service (a link, and a form the page's policy allows), never requests the page makes, so
// the page never handles a credential. Everything a person or the service wrote reaches the page as
// text or as an attribute, never as markup.

import { getLocale } from "@meltemi/diagrams-i18n";
import { messages } from "../messages/index.js";
import { ICONS, h, icon } from "../ui.js";
import { openAccountPanel } from "./account-panel.js";
import type { AccountSection } from "./account-panel-model.js";
import { avatar } from "./avatar.js";
import { returnAddress, type Session, type SessionUser } from "./session.js";
import type { Outcome } from "./tokens.js";
import { formatBytes, type UsageSource } from "./usage.js";

export { avatar };

/** The room, in pixels, the account menu keeps between itself and the edge of the page. */
const MENU_MARGIN = 8;

/** A door with an arrow into it, in the canvas's 16 × 16 style. */
const SIGN_IN_ICON = "M9 3h3.5a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H9|M2.5 8h7|M7 5.5L9.5 8 7 10.5";

export interface AccountHooks {
  /** Keeps the person's work in the browser; called before the page is left for the identity service. */
  readonly keep: () => void;
  /** What the account holds. Without it (a page with no cloud projects) the menu shows none of it. */
  readonly usage?: UsageSource;
  /** Chooses the publishing handle (`PATCH /api/account`), for the panel's Profile. */
  readonly setHandle: (handle: string) => Promise<Outcome<{ readonly handle: string }>>;
  /** The session ended under the page: keep the work and show the page signed out. */
  readonly signedOut: () => void;
  /** Says something in the status line. */
  readonly report?: (message: string) => void;
}

/** The header's account control, and the way to open the account panel at a section. */
export interface AccountControl {
  readonly element: HTMLElement;
  /** Opens the account panel at a section; nobody signed in has none. */
  open(section: AccountSection): void;
}

/** The header's account control for a session: the sign-in link, or the account menu. */
export function accountControl(session: Session, hooks: AccountHooks): AccountControl {
  if (session.kind !== "cookie") {
    return { element: signInAnchor(session.signIn, hooks), open: () => {} };
  }
  const open = (section: AccountSection): void =>
    openAccountPanel({
      user: session.user,
      accountPage: session.account,
      signOut: session.signOut,
      section,
      usage: hooks.usage,
      keep: hooks.keep,
      setHandle: hooks.setHandle,
      signedOut: hooks.signedOut,
      ...(hooks.report ? { report: hooks.report } : {}),
    });
  return { element: accountMenu(session.user, session.signOut, hooks, open), open };
}

function signInAnchor(href: string, hooks: AccountHooks): HTMLElement {
  const m = messages().account;
  const link = h(
    "a",
    { class: "button sign-in", href, title: m.signInTitle },
    icon(SIGN_IN_ICON),
    h("span", {}, m.signIn),
  );
  link.addEventListener("click", () => hooks.keep());
  return link;
}

/** A meter from 0 to `max` at `value`, which stays full when the account is over its limit. */
function setMeter(meter: HTMLMeterElement, value: number, max: number): void {
  meter.max = max;
  meter.value = Math.min(value, max);
  // Nearly full: the bar says so in the warning colour, and the text beside it says the numbers.
  meter.classList.toggle("full", value >= max * 0.9);
}

/**
 * The account's usage, as it goes under the menu's entries: a line of text and a thin meter for the
 * projects and the same for the storage. The text carries everything (the meters are for the eye,
 * so a screen reader skips them), and the section is hidden while there are no numbers: before the
 * first answer, and when the service cannot be reached. `watch` starts following the numbers and
 * reading them again, and returns how to stop; the menu calls it as it opens and closes.
 */
function usageSection(
  source: UsageSource,
  openUsage: () => void,
): { element: HTMLElement; watch: () => () => void } {
  const m = messages().cloud;
  const line = () => ({
    text: h("span", { class: "usage-text" }),
    meter: h("meter", { class: "usage-meter", min: 0, max: 1, value: 0, "aria-hidden": "true" }),
  });
  const projects = line();
  const storage = line();
  // The numbers open the panel's Usage, where the other limits are.
  const more = h(
    "button",
    {
      type: "button",
      class: "account-usage-button",
      title: messages().accountPanel.sections.usage,
    },
    h("span", { class: "usage-row" }, projects.text, projects.meter),
    h("span", { class: "usage-row" }, storage.text, storage.meter),
  );
  more.addEventListener("click", openUsage);
  const element = h(
    "div",
    { class: "account-usage", role: "group", "aria-label": m.usage.label, hidden: true },
    more,
  );
  const draw = (): void => {
    const view = source.view;
    element.hidden = view === undefined;
    if (!view) return;
    const locale = getLocale();
    projects.text.textContent = m.projects.count(view.projects, view.maxProjects);
    setMeter(projects.meter, view.projects, view.maxProjects);
    storage.text.textContent = m.usage.storage(
      formatBytes(view.storageBytes, locale),
      formatBytes(view.maxStorageBytes, locale),
    );
    setMeter(storage.meter, view.storageBytes, view.maxStorageBytes);
  };
  return {
    element,
    watch: () => {
      const stop = source.listen(draw);
      // What was last read shows at once; the answer to this read replaces it when it comes.
      draw();
      void source.refresh();
      return stop;
    },
  };
}

function accountMenu(
  user: SessionUser,
  signOutAction: string,
  hooks: AccountHooks,
  openPanel: (section: AccountSection) => void,
): HTMLElement {
  const m = messages().account;
  const id = "menu-account";
  const name = user.name.trim();
  const label = name === "" ? m.menu : m.button(name);

  const button = h(
    "button",
    {
      type: "button",
      class: "button account-button",
      "aria-haspopup": "menu",
      "aria-expanded": "false",
      "aria-controls": id,
      "aria-label": label,
      title: label,
    },
    avatar(user.picture),
    ...(name === "" ? [] : [h("span", { class: "account-name" }, name)]),
    icon(ICONS.chevron),
  );

  const entry = (text: string) => h("span", { class: "pg-menu-label" }, text);
  const accountItem = h(
    "button",
    { type: "button", class: "pg-menu-item", role: "menuitem", tabindex: "-1" },
    entry(m.account),
  );
  const tokens = h(
    "button",
    { type: "button", class: "pg-menu-item", role: "menuitem", tabindex: "-1" },
    entry(m.tokens),
  );
  // An owner or an administrator reaches the Administration section from here; an invitee, their
  // invitation. Nobody else has the entry.
  const administers = user.administration !== null;
  const administration =
    administers || user.administrationInvitation !== null
      ? h(
          "button",
          { type: "button", class: "pg-menu-item", role: "menuitem", tabindex: "-1" },
          entry(administers ? m.administration : m.administrationInvitation),
        )
      : undefined;
  // Sign out is a plain form the identity service reads: its `return_to` is the page, and the
  // policy's `form-action` allows the identity origin the page was built with.
  const returnTo = h("input", { type: "hidden", name: "return_to" });
  const signOut = h(
    "button",
    { type: "submit", class: "pg-menu-item", role: "menuitem", tabindex: "-1" },
    entry(m.signOut),
  );
  const form = h(
    "form",
    { method: "post", action: signOutAction, role: "none" },
    returnTo,
    signOut,
  );
  form.addEventListener("submit", () => {
    returnTo.value = returnAddress(location.href);
    hooks.keep();
  });

  // The menu proper holds the entries and nothing else; what the account holds goes beside it, in
  // the same box, as text a screen reader finds by reading on (a menu owns only its items).
  const menu = h(
    "div",
    { class: "account-menu", role: "menu", id, "aria-label": m.menu },
    accountItem,
    tokens,
    ...(administration ? [administration] : []),
    h("div", { class: "pg-menu-separator", role: "separator" }),
    form,
  );
  const usage = hooks.usage
    ? usageSection(hooks.usage, () => {
        close();
        openPanel("usage");
      })
    : undefined;
  const popup = h(
    "div",
    { class: "pg-menu", hidden: true },
    menu,
    ...(usage ? [usage.element] : []),
  );
  const wrapper = h("div", { class: "pg-menu-wrapper" }, button, popup);
  /** Stops following the usage while the menu is closed. */
  let stopUsage: (() => void) | undefined;

  const items = () => [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')];
  const outside = (event: Event) => {
    if (!wrapper.contains(event.target as Node)) close(false);
  };
  function close(focus = true): void {
    if (popup.hidden) return;
    popup.hidden = true;
    button.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", outside, true);
    stopUsage?.();
    stopUsage = undefined;
    if (focus) button.focus();
  }
  /**
   * Below the button from its start, or from its end when the page has no room on that side. On a
   * narrow screen the button can be in the middle of a row with no room on either side: the menu is
   * then slid back into view.
   */
  function place(): void {
    popup.classList.remove("end");
    popup.style.transform = "";
    const room = document.documentElement.clientWidth;
    if (popup.getBoundingClientRect().right > room) popup.classList.add("end");
    const { left, right } = popup.getBoundingClientRect();
    const slide = left < MENU_MARGIN ? MENU_MARGIN - left : Math.min(0, room - MENU_MARGIN - right);
    if (slide !== 0) popup.style.transform = `translateX(${slide}px)`;
  }
  function show(last = false): void {
    popup.hidden = false;
    place();
    button.setAttribute("aria-expanded", "true");
    document.addEventListener("pointerdown", outside, true);
    const list = items();
    (last ? list[list.length - 1] : list[0])?.focus();
    // After the focus, so that reading the numbers never delays the menu or moves the focus; the
    // numbers may change the box's height, which `place` does not depend on.
    stopUsage?.();
    stopUsage = usage?.watch();
  }

  button.addEventListener("click", () => (popup.hidden ? show() : close()));
  button.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      show(event.key === "ArrowUp");
    }
  });
  menu.addEventListener("keydown", (event) => {
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      list[(index + (event.key === "ArrowDown" ? 1 : list.length - 1)) % list.length]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      (event.key === "Home" ? list[0] : list[list.length - 1])?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Tab") {
      close(false);
    }
  });
  accountItem.addEventListener("click", () => {
    close();
    openPanel("profile");
  });
  tokens.addEventListener("click", () => {
    close();
    openPanel("tokens");
  });
  administration?.addEventListener("click", () => {
    close();
    openPanel("administration");
  });
  return wrapper;
}
