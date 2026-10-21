// The share dialog of a cloud project: the project's link with copy, who the link admits (the owner's
// three choices), the people with their roles, an invitation by email, the invitations that wait with
// their links, leaving (a member's) and the entry that opens the publish dialog (the owner's). What it
// knows and does is `ShareModel`'s, and what each person is shown is `shareView`'s; this draws it. A
// control the person may not use is not drawn at all. Names, emails, dates and the service's messages
// are set as text, never as markup; a person's picture is an `<img>` with no alternative text (the name
// is beside it), no referrer and an address `avatarUrl` allows, and the outline of a person when it
// cannot be loaded. The anonymous project's dialog is the `#p=` one (`dialogs.ts`), not this.

import { getLocale } from "@meltemi/diagrams-i18n";
import { confirmDialog } from "../dialogs.js";
import { messages } from "../messages/index.js";
import type { Playground } from "../shell.js";
import { ICONS, field, h, icon, openDialog, select } from "../ui.js";
import { projectLink } from "./address.js";
import { copyText } from "./clipboard.js";
import { openPublishDialog } from "./publish.js";
import { sharingApi, type MemberRole, type SharingApi } from "./share-api.js";
import {
  ShareModel,
  shareTarget,
  shareView,
  type InvitationRow,
  type LevelChoice,
  type PersonRow,
  type ShareState,
} from "./share-model.js";

/** What the dialog is about and how it reaches the page: the page's own parts, handed in. */
export interface ShareOptions {
  readonly project: { readonly id: string; readonly name: string };
  readonly api: SharingApi;
  /** The project's link, `<origin>/p/<id>`. */
  readonly link: string;
  /** The `sub` of the person looking, when the page knows it: their row says "you". */
  readonly me: string | undefined;
  /** Says something in the status line. */
  readonly report: (message: string) => void;
  /** The person left the project: the page lets go of it. */
  readonly left: () => void;
  /** Opens the publish dialog; given only where the page can publish. The dialog offers it to the owner. */
  readonly publish?: () => void;
  /** Writes to the clipboard; the browser's by default. */
  readonly copy?: (text: string) => Promise<boolean>;
}

let dialogs = 0;

/** A person's picture, or the outline of a person when they have none or it cannot be loaded. */
function picture(source: string | undefined): HTMLElement {
  const outline = () => h("span", { class: "share-avatar outline" }, icon(ICONS.person));
  if (source === undefined) return outline();
  const image = h("img", {
    class: "share-avatar",
    src: source,
    alt: "",
    width: 28,
    height: 28,
    referrerpolicy: "no-referrer",
    decoding: "async",
    loading: "lazy",
  });
  image.addEventListener("error", () => image.replaceWith(outline()), { once: true });
  return image;
}

/**
 * Opens the dialog of the project a playground has open in the cloud, or shows to view by its link
 * (a person nobody is signed in as has no cloud project, only the project's link to give and a role
 * to read: the calls the dialog makes are the ones a link that admits them answers).
 */
export function openShareDialog(playground: Playground): void {
  const cloud = playground.cloud;
  const viewed = playground.viewing.mode.state;
  const project = shareTarget(cloud?.openProject, viewed && { id: viewed.id, name: viewed.name });
  // A person signed in has the cloud's own parts; anybody else, the page's for viewing by a link.
  const env = playground.options.cloud ?? playground.options.view;
  if (!project) return;
  const session = playground.options.session;
  const location = { href: env.location.href() };
  openShare({
    project,
    api: sharingApi(env.fetch, location),
    link: projectLink(new URL(location.href).origin, project.id),
    me: session.kind === "cookie" ? session.user.sub : undefined,
    report: (message) => (cloud ? cloud.report(message) : playground.status(message)),
    // Leaving is, for this page, what deleting is: the browser's copy goes and the page lets go. Only
    // a member can leave, and nobody signed in is one.
    left: () => cloud?.deleted(project.id),
    // Only the owner publishes, and only a person signed in is one.
    ...(cloud ? { publish: () => openPublishDialog(playground) } : {}),
  });
}

/** Opens the dialog for a project: the owner manages, anyone else sees what the service tells them. */
export function openShare(options: ShareOptions): HTMLDialogElement {
  const words = () => messages().cloud;
  const m = words().sharing;
  const unique = ++dialogs;
  let closed = false;
  /** What the dialog is drawing, so that it draws a list again only when it changed. */
  let shownSharing: ShareState["sharing"];
  let shownInvited: ShareState["invited"];
  let shownLeft = false;

  const copy = options.copy ?? copyText;

  // The project's link -----------------------------------------------------------------------------
  const linkBox = h("input", {
    type: "text",
    id: `share-link-${unique}`,
    class: "share-link",
    value: options.link,
    readonly: true,
    autocomplete: "off",
    spellcheck: "false",
    "aria-describedby": `share-link-hint-${unique}`,
  });
  const copyLink = h(
    "button",
    {
      type: "button",
      class: "button primary with-text",
      "data-action": "copy-link",
      "aria-label": m.copyLinkLabel,
    },
    h("span", {}, m.copy),
  );
  const linkField = h(
    "div",
    { class: "field share-link-field" },
    h("label", { class: "field-label", for: linkBox.id }, m.linkLabel),
    h("div", { class: "share-row share-link-row" }, linkBox, copyLink),
    h("span", { class: "field-hint", id: `share-link-hint-${unique}` }, m.linkHint),
  );
  copyLink.addEventListener("click", async () => {
    if (!(await model.copy("link")) && !closed) {
      linkBox.focus();
      linkBox.select();
    }
  });

  const roleLine = h("p", { class: "share-role-line", hidden: true });
  const status = h("p", { class: "share-status", role: "status" });
  const problem = h("p", { class: "field-problem", role: "alert" });
  const messagesBox = h("div", { class: "share-messages" }, status, problem);
  const retry = h(
    "button",
    { type: "button", class: "button with-text", hidden: true },
    m.tryAgain,
  );
  retry.addEventListener("click", () => void model.load());

  // Who the link admits: the owner's choice ------------------------------------------------------
  const levelSet = h(
    "fieldset",
    { class: "share-level", hidden: true },
    h("legend", {}, m.levelLegend),
  );
  const radios = new Map<string, HTMLInputElement>();
  const buildLevel = (choices: readonly LevelChoice[]): void => {
    for (const choice of choices) {
      const id = `share-level-${unique}-${choice.value}`;
      const radio = h("input", {
        type: "radio",
        id,
        name: `share-level-${unique}`,
        value: choice.value,
        "aria-describedby": `${id}-text`,
      });
      radio.addEventListener("change", () => {
        if (radio.checked) void model.setLink(choice.value);
      });
      radios.set(choice.value, radio);
      levelSet.append(
        h(
          "div",
          { class: "share-level-option" },
          radio,
          h("label", { for: id }, choice.label),
          h("span", { class: "field-hint share-level-text", id: `${id}-text` }, choice.text),
        ),
      );
    }
  };

  // The people ------------------------------------------------------------------------------------
  const peopleTitle = h("h3", { id: `share-people-${unique}` }, m.peopleTitle);
  const count = h("p", { class: "field-hint share-count" });
  const peopleList = h("ul", { class: "share-list", "aria-labelledby": peopleTitle.id });
  const noPeople = h("p", { class: "share-none", hidden: true }, m.noPeople);
  const peopleSection = h(
    "section",
    { class: "share-section", hidden: true },
    peopleTitle,
    count,
    peopleList,
    noPeople,
  );

  const rowButton = (action: string, path: string, text: string, label: string): HTMLElement =>
    h(
      "button",
      { type: "button", class: "button with-text", "data-action": action, "aria-label": label },
      icon(path),
      h("span", {}, text),
    );

  const personRow = (row: PersonRow): HTMLElement => {
    const name = h(
      "span",
      { class: "share-person-name" },
      row.name,
      ...(row.you ? [h("span", { class: "share-you" }, ` (${m.you})`)] : []),
    );
    const info = h(
      "div",
      { class: "share-person-info" },
      name,
      ...(row.email !== undefined && row.email !== row.name
        ? [h("span", { class: "share-meta" }, row.email)]
        : []),
    );
    const controls: HTMLElement[] = [];
    if (row.editable) {
      const role = select(
        [
          { value: "viewer", label: m.roles.viewer },
          { value: "editor", label: m.roles.editor },
        ],
        row.role,
      );
      role.className = "share-role";
      role.dataset["action"] = "role";
      role.setAttribute("aria-label", m.roleOf(row.name));
      role.addEventListener("change", async () => {
        const changed = await model.setRole(row.key, role.value as MemberRole);
        // A change the service did not take leaves the role as it was.
        const held = model.state.sharing?.members?.find((member) => member.sub === row.key);
        if (!changed && !closed && held) role.value = held.role;
      });
      const remove = rowButton("remove", ICONS.trash, m.remove, m.removeLabel(row.name));
      remove.addEventListener("click", () => void askRemove(row));
      controls.push(role, remove);
    } else {
      controls.push(h("span", { class: "share-role-text" }, row.roleText));
    }
    return h(
      "li",
      { class: "share-person", "data-key": row.key },
      picture(row.picture),
      info,
      h("div", { class: "share-controls" }, ...controls),
    );
  };

  async function askRemove(row: PersonRow): Promise<void> {
    const position = model.state.sharing?.members?.findIndex((member) => member.sub === row.key);
    const sure = await confirmDialog(m.removeTitle, m.removeMessage(row.name), m.removeConfirm);
    if (!sure || closed) return;
    await model.remove(row.key);
    if (!closed) focusNear(peopleList, "li", position ?? 0, "remove");
  }

  // Inviting --------------------------------------------------------------------------------------
  const emailInput = h("input", {
    type: "text",
    inputmode: "email",
    autocomplete: "off",
    spellcheck: "false",
  });
  const emailProblem = h("p", {
    class: "field-problem",
    id: `share-email-problem-${unique}`,
    role: "alert",
  });
  const roleChoice = select(
    [
      { value: "viewer", label: m.roles.viewer },
      { value: "editor", label: m.roles.editor },
    ],
    "viewer",
  );
  const emailField = field(m.emailLabel, emailInput);
  emailField.classList.add("share-email");
  const inviteButton = h(
    "button",
    { type: "submit", class: "button primary with-text" },
    m.inviteButton,
  );
  const inviteForm = h(
    "form",
    {
      class: "share-invite",
      novalidate: true,
      "aria-labelledby": `share-invite-title-${unique}`,
      hidden: true,
    },
    h("h3", { id: `share-invite-title-${unique}` }, m.inviteTitle),
    h("div", { class: "share-invite-fields" }, emailField, field(m.roleLabel, roleChoice)),
    emailProblem,
    h("p", { class: "field-hint", id: `share-invite-hint-${unique}` }, m.inviteHint),
    inviteButton,
  );
  emailInput.setAttribute("aria-describedby", `share-invite-hint-${unique} ${emailProblem.id}`);
  inviteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const made = await model.invite(emailInput.value, roleChoice.value as MemberRole);
    if (closed) return;
    if (made) {
      emailInput.value = "";
      reveal.querySelector<HTMLElement>('[data-action="copy"]')?.focus();
    } else if (model.state.emailProblem !== "") {
      emailInput.focus();
    }
  });

  // An invitation, with its link ----------------------------------------------------------------------
  const invitationBlock = (row: InvitationRow): HTMLElement => {
    const link = h("input", {
      type: "text",
      class: "share-link share-invitation-link",
      value: row.link,
      readonly: true,
      autocomplete: "off",
      spellcheck: "false",
      "aria-label": m.revealLabel(row.email),
    });
    const copyIt = h(
      "button",
      {
        type: "button",
        class: "button with-text",
        "data-action": "copy",
        "aria-label": m.copyInvitationLabel(row.email),
      },
      h("span", {}, m.copyInvitation),
    );
    copyIt.addEventListener("click", async () => {
      if (!(await model.copy({ invitation: row.key })) && !closed) {
        link.focus();
        link.select();
      }
    });
    const revoke = rowButton("revoke", ICONS.close, m.revoke, m.revokeLabel(row.email));
    revoke.addEventListener("click", async () => {
      const position = pendingList.querySelectorAll("li").length;
      await model.revoke(row.key);
      if (!closed) focusNear(pendingList, "li", position, "revoke");
    });
    return h(
      "div",
      { class: "share-invitation", "data-key": row.key },
      h(
        "div",
        { class: "share-invitation-head" },
        h("strong", { class: "share-person-name" }, row.email),
        h("span", { class: "share-role-text" }, row.roleText),
        ...(row.expires === "" ? [] : [h("span", { class: "share-meta" }, row.expires)]),
      ),
      h("div", { class: "share-row" }, link, copyIt, revoke),
    );
  };

  const reveal = h("div", {
    class: "share-reveal",
    role: "group",
    "aria-label": m.pendingTitle,
    hidden: true,
  });
  const pendingTitle = h("h3", { id: `share-pending-${unique}` }, m.pendingTitle);
  const pendingList = h("ul", { class: "share-list", "aria-labelledby": pendingTitle.id });
  const noPending = h("p", { class: "share-none", hidden: true }, m.noPending);
  const pendingSection = h(
    "section",
    { class: "share-section", hidden: true },
    pendingTitle,
    pendingList,
    noPending,
  );

  // Leaving, and publishing --------------------------------------------------------------------------
  const leave = h("button", { type: "button", class: "button with-text" }, m.leave);
  const leaveSection = h(
    "section",
    { class: "share-section", hidden: true },
    h("h3", {}, m.leaveTitle),
    h("p", { class: "field-hint" }, m.leaveHint),
    leave,
  );
  leave.addEventListener("click", async () => {
    const sure = await confirmDialog(
      m.leaveConfirmTitle,
      m.leaveMessage(options.project.name),
      m.leaveConfirm,
    );
    if (!sure || closed) return;
    if (await model.leave()) dialog.close();
  });

  const publish = h("button", { type: "button", class: "button with-text" }, m.publishButton);
  publish.setAttribute("aria-haspopup", "dialog");
  publish.addEventListener("click", () => options.publish?.());
  const publishSection = h(
    "section",
    { class: "share-section", hidden: true },
    h("h3", {}, m.publishTitle),
    h("p", { class: "field-hint" }, m.publishText),
    publish,
  );

  // Drawing -------------------------------------------------------------------------------------
  /** Puts focus on an action of the row at a position of a list, or on what is still there. */
  function focusNear(list: HTMLElement, tag: string, position: number, action: string): void {
    const rows = [...list.querySelectorAll<HTMLElement>(tag)];
    const row = rows[Math.min(position, rows.length - 1)];
    (row?.querySelector<HTMLElement>(`[data-action="${action}"]`) ?? fallback()).focus();
  }

  /** Where focus goes when what it was on is gone: the email field, or the link's copy button. */
  function fallback(): HTMLElement {
    return inviteForm.hidden ? copyLink : emailInput;
  }

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

  /** Focus goes back to where it was; a list may have been drawn again, so the control is found anew. */
  const restoreFocus = (to: Held): void => {
    const again =
      to.key === undefined
        ? undefined
        : [...dialog.querySelectorAll<HTMLElement>("[data-key]")]
            .find((row) => row.getAttribute("data-key") === to.key)
            ?.querySelector<HTMLElement>(`[data-action="${to.action ?? ""}"]`);
    (
      again ?? (dialog.contains(to.element) && !to.element.hidden ? to.element : fallback())
    ).focus();
  };

  const render = (state: ShareState): void => {
    if (closed) return;
    if (state.busy && !wasBusy) held = remember();
    const view = shareView(state, {
      words: words(),
      link: options.link,
      me: options.me,
      locale: getLocale(),
      canPublish: options.publish !== undefined,
    });
    status.textContent = state.status;
    problem.textContent = state.problem;
    emailProblem.textContent = state.emailProblem;
    if (state.emailProblem !== "") emailInput.setAttribute("aria-invalid", "true");
    else emailInput.removeAttribute("aria-invalid");
    retry.hidden = !view.retry;

    roleLine.hidden = view.role === undefined || view.role === "owner";
    roleLine.textContent = view.roleText;

    levelSet.hidden = view.level === undefined;
    if (view.level) {
      if (radios.size === 0) buildLevel(view.level);
      // While a change is on its way the radio shows the person's choice, not the old one.
      if (!state.busy)
        for (const choice of view.level) radios.get(choice.value)!.checked = choice.checked;
    }

    peopleSection.hidden = view.people === undefined;
    count.textContent = view.count;
    inviteForm.hidden = !view.invite;
    pendingSection.hidden = view.invitations === undefined;
    leaveSection.hidden = !view.leave;
    publishSection.hidden = !view.publish;

    if (
      state.sharing !== shownSharing ||
      state.invited !== shownInvited ||
      state.left !== shownLeft
    ) {
      shownSharing = state.sharing;
      shownInvited = state.invited;
      shownLeft = state.left;
      peopleList.replaceChildren(...(view.people ?? []).map(personRow));
      noPeople.hidden = !(view.people && view.people.length === 0);
      const waiting = (view.invitations ?? []).filter((row) => row.key !== view.revealed?.key);
      pendingList.replaceChildren(
        ...waiting.map((row) => h("li", { class: "share-invitation-item" }, invitationBlock(row))),
      );
      noPending.hidden = !(view.invitations && waiting.length === 0 && !view.revealed);
      reveal.replaceChildren(
        ...(view.revealed
          ? [h("p", { class: "share-reveal-note" }, m.revealNote), invitationBlock(view.revealed)]
          : []),
      );
      reveal.hidden = view.revealed === undefined;
    }

    // The controls wait while an action is on its way, and the page says so to assistive technology.
    dialog.querySelector(".dialog-body")?.setAttribute("aria-busy", String(state.busy));
    for (const control of dialog.querySelectorAll<
      HTMLButtonElement | HTMLSelectElement | HTMLInputElement
    >(".dialog-body button, .dialog-body select, .dialog-body input[type='radio']")) {
      control.disabled = state.busy;
    }
    emailInput.readOnly = state.busy;
    if (!state.busy && wasBusy && held) {
      restoreFocus(held);
      held = undefined;
    }
    wasBusy = state.busy;
  };

  const model = new ShareModel(
    {
      api: options.api,
      copy,
      report: options.report,
      left: options.left,
    },
    options.project.id,
    options.link,
    words,
    render,
  );

  const dialog = openDialog(
    m.title,
    [
      linkField,
      roleLine,
      messagesBox,
      retry,
      levelSet,
      peopleSection,
      inviteForm,
      reveal,
      pendingSection,
      leaveSection,
      publishSection,
    ],
    [{ label: messages().dialog.close, primary: true }],
  );
  dialog.addEventListener("close", () => {
    closed = true;
    model.dispose();
  });
  render(model.state);
  copyLink.focus();
  void model.load();
  return dialog;
}
