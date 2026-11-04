// The Administration section of the account panel (`account-panel`, "Administration section"): for
// an owner or an administrator, the administrators, the invitations (owners only), the permissions
// and their holders, the takedown of a publication and the recent changes; for a person invited to
// administer, the invitation alone. It reads `GET /api/admin` when it is first shown and after every
// change it makes. A change of role (an acceptance, a decline, a leave, or a `404` that says the role
// is gone) reloads the page at the right section, which reads the session answer again; the work in
// the browser is kept first. Names, emails, addresses and reasons are set as text, never as markup.

import { getLocale } from "@meltemi/diagrams-i18n";
import { confirmDialog } from "../dialogs.js";
import { messages } from "../messages/index.js";
import { field, h } from "../ui.js";
import { returnAddressFor, type AccountWords } from "./account-panel-model.js";
import {
  adminApi,
  isEmail,
  logText,
  permissionName,
  publicationAt,
  whoText,
  type AdminApi,
  type AdminHolder,
  type AdminView,
} from "./administration.js";
import type { SessionUser } from "./session.js";
import { whenText, type ApiFailure } from "./tokens.js";

let sections = 0;

export interface AdministrationSection {
  readonly element: HTMLElement;
  /** Reads the administration (the first time only). */
  shown(): void;
  dispose(): void;
}

export interface AdministrationOptions {
  readonly user: SessionUser;
  /** Keeps the person's work in the browser; called before the page reloads. */
  readonly keep: () => void;
  /** Says something in the status line. */
  readonly report: (message: string) => void;
  /** The calls; the page's own by default. */
  readonly api?: AdminApi;
  /** Reloads the page at a section of the panel; the page's own by default. */
  readonly reload?: (section: "administration" | "profile") => void;
}

/** The section for the person signed in on this page. */
export function administrationSection(options: AdministrationOptions): AdministrationSection {
  const words = (): AccountWords => messages().accountPanel;
  const m = words().administration;
  const unique = ++sections;
  const api = options.api ?? adminApi((url, init) => fetch(url, init), location);
  const reload =
    options.reload ??
    ((section) => {
      options.keep();
      location.assign(returnAddressFor(location.href, section));
    });
  let disposed = false;
  let started = false;
  let busy = false;
  let view: AdminView | undefined;
  const when = (iso: string) => (iso === "" ? "" : whenText(iso, getLocale()));

  const status = h("p", { class: "token-status", role: "status" });
  const problem = h("p", { class: "field-problem", role: "alert" });
  const body = h("div", { class: "administration-body" });

  /** A failure in words; a `404` of a role that is gone reloads the page instead. */
  const explain = (failure: ApiFailure, notFound: string): string => {
    const a = words().administration;
    if (failure.kind === "unreachable") return words().unreachable;
    switch (failure.code) {
      case "admin.already":
        return a.already;
      case "admin.limit":
        return failure.message?.includes("administrators")
          ? a.administratorsLimit
          : a.invitationsLimit;
      case "account.ambiguous":
        return a.ambiguous;
      case "request.invalid":
        return failure.message ?? words().failedStatus(failure.status);
    }
    if (failure.status === 404) return notFound;
    if (failure.message !== undefined && failure.code !== undefined) {
      return words().failed(failure.message, failure.code);
    }
    return words().failedStatus(failure.status);
  };

  /** Whether the person still has a role, after a `404`: the page reloads to Profile when not. */
  const stillAdministers = async (): Promise<boolean> => {
    const read = await api.load();
    if (read.ok) {
      view = read.value;
      return true;
    }
    if (read.failure.status === 404) reload("profile");
    return false;
  };

  /** Runs an action; on success reads the view again and says `done`. */
  const act = async (
    action: () => Promise<{ ok: boolean; failure?: ApiFailure }>,
    done: string,
    notFound: string,
    where: HTMLElement = problem,
  ): Promise<boolean> => {
    if (busy || disposed) return false;
    busy = true;
    status.textContent = "";
    problem.textContent = "";
    where.textContent = "";
    render();
    const outcome = await action();
    busy = false;
    if (disposed) return false;
    if (outcome.ok) {
      status.textContent = done;
      options.report(done);
      await load();
      return true;
    }
    const failure = outcome.failure!;
    if (failure.status === 404 && !(await stillAdministers())) return false;
    where.textContent = explain(failure, notFound);
    render();
    return false;
  };

  // The invitee -----------------------------------------------------------------------------------
  const invitee = (): HTMLElement => {
    const invitation = options.user.administrationInvitation!;
    const acceptButton = h(
      "button",
      { type: "button", class: "button primary with-text" },
      m.accept,
    );
    const declineButton = h("button", { type: "button", class: "button with-text" }, m.decline);
    const answer = async (accept: boolean) => {
      if (busy) return;
      busy = true;
      acceptButton.disabled = declineButton.disabled = true;
      const outcome = accept ? await api.accept(invitation.id) : await api.decline(invitation.id);
      busy = false;
      if (disposed) return;
      if (outcome.ok) {
        options.report(accept ? m.accepted : m.declined);
        reload(accept ? "administration" : "profile");
        return;
      }
      acceptButton.disabled = declineButton.disabled = false;
      problem.textContent = explain(outcome.failure, m.gone);
    };
    acceptButton.addEventListener("click", () => void answer(true));
    declineButton.addEventListener("click", () => void answer(false));
    return h(
      "div",
      { class: "administration-invitation" },
      h("h3", {}, m.invitationTitle),
      h("p", {}, m.invitationBody(invitation.invitedBy)),
      h("p", {}, m.invitationPowers),
      h("p", { class: "field-hint" }, m.invitationUntil(when(invitation.expiresAt))),
      h("div", { class: "row" }, acceptButton, declineButton),
    );
  };

  // Administrators ----------------------------------------------------------------------------------
  const administrators = (v: AdminView): HTMLElement => {
    const rows: HTMLElement[] = v.owners.map((owner) =>
      h(
        "li",
        { class: "token-row", "data-sub": owner.sub },
        h(
          "div",
          { class: "token-info" },
          h("strong", {}, whoText(owner, words())),
          h("span", { class: "token-meta" }, [m.owner, owner.email].filter(Boolean).join(" · ")),
        ),
      ),
    );
    for (const administrator of v.administrators) {
      const name = whoText(administrator, words());
      const self = administrator.sub === options.user.sub;
      const actions: HTMLElement[] = [];
      if (v.role === "owner" || self) {
        const button = h(
          "button",
          {
            type: "button",
            class: "button with-text",
            "data-action": self ? "leave" : "remove",
            ...(self ? {} : { "aria-label": m.removeLabel(name) }),
          },
          self ? m.leave : m.remove,
        );
        button.disabled = busy;
        button.addEventListener("click", async () => {
          const sure = self
            ? await confirmDialog(m.leaveTitle, m.leaveMessage, m.leaveConfirm)
            : await confirmDialog(m.removeTitle, m.removeMessage(name), m.removeConfirm);
          if (!sure) return;
          const done = await act(
            () => api.removeAdministrator(administrator.sub),
            self ? m.left : m.removed(name),
            "",
          );
          if (done && self) reload("profile");
        });
        actions.push(button);
      }
      rows.push(
        h(
          "li",
          { class: "token-row", "data-sub": administrator.sub },
          h(
            "div",
            { class: "token-info" },
            h("strong", {}, name),
            h(
              "span",
              { class: "token-meta" },
              [
                administrator.email,
                m.since(whoText(administrator.invitedBy, words()), when(administrator.since)),
              ]
                .filter(Boolean)
                .join(" · "),
            ),
          ),
          ...actions,
        ),
      );
    }
    return h(
      "div",
      { class: "administration-part", "data-part": "administrators" },
      h("h3", {}, m.administratorsTitle),
      h("ul", { class: "token-list", role: "list" }, ...rows),
    );
  };

  // Invitations (owners) ----------------------------------------------------------------------------
  const inviteInput = h("input", { type: "email", autocomplete: "off", spellcheck: "false" });
  const inviteProblem = h("p", { class: "field-problem", role: "alert" });
  const inviteForm = h(
    "form",
    // The page says what is wrong in its own words, not the browser's bubble.
    { class: "token-form", novalidate: "", "aria-labelledby": `admin-invite-title-${unique}` },
    field(m.email, inviteInput),
    h("button", { type: "submit", class: "button primary with-text" }, m.invite),
    inviteProblem,
  );
  inviteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = inviteInput.value.trim();
    if (!isEmail(email)) {
      inviteProblem.textContent = m.notEmail;
      inviteInput.focus();
      return;
    }
    if (await act(() => api.invite(email), m.invited(email.toLowerCase()), "", inviteProblem)) {
      inviteInput.value = "";
    }
  });
  const invitations = (v: AdminView): HTMLElement => {
    const rows = v.invitations.map((invitation) => {
      const revoke = h(
        "button",
        {
          type: "button",
          class: "button with-text",
          "data-action": "revoke",
          "aria-label": m.revokeLabel(invitation.email),
        },
        m.revoke,
      );
      revoke.disabled = busy;
      revoke.addEventListener(
        "click",
        () => void act(() => api.revokeInvitation(invitation.id), m.revoked(invitation.email), ""),
      );
      return h(
        "li",
        { class: "token-row", "data-invitation": invitation.id },
        h(
          "div",
          { class: "token-info" },
          h("strong", {}, invitation.email),
          h(
            "span",
            { class: "token-meta" },
            m.pending(whoText(invitation.invitedBy, words()), when(invitation.expiresAt)),
          ),
        ),
        revoke,
      );
    });
    return h(
      "div",
      { class: "administration-part", "data-part": "invitations" },
      h("h3", { id: `admin-invite-title-${unique}` }, m.invitationsTitle),
      h("p", { class: "field-hint" }, m.invitationsIntro),
      inviteForm,
      rows.length > 0
        ? h("ul", { class: "token-list", role: "list" }, ...rows)
        : h("p", { class: "field-hint" }, m.noInvitations),
    );
  };

  // Permissions -------------------------------------------------------------------------------------
  /** The grant fields, one per permission, kept across redrawings so that typing survives them. */
  const grants = new Map<
    string,
    { input: HTMLInputElement; problem: HTMLElement; form: HTMLElement }
  >();
  const grantFor = (id: string) => {
    let held = grants.get(id);
    if (held) return held;
    const input = h("input", { type: "text", autocomplete: "off", spellcheck: "false" });
    const fieldProblem = h("p", { class: "field-problem", role: "alert" });
    const form = h(
      "form",
      { class: "token-form" },
      field(m.grantTo, input, m.grantHint),
      h("button", { type: "submit", class: "button primary with-text" }, m.grant),
      fieldProblem,
    );
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const account = input.value.trim();
      if (account === "") {
        input.focus();
        return;
      }
      const name = permissionName(id, words());
      const done = await act(
        () => api.setPermission(account, id, true),
        m.granted(account, name),
        m.noAccount,
        fieldProblem,
      );
      if (done) input.value = "";
    });
    held = { input, problem: fieldProblem, form };
    grants.set(id, held);
    return held;
  };
  const holderRow = (id: string, holder: AdminHolder): HTMLElement => {
    const name = whoText(holder, words());
    const revoke = h(
      "button",
      {
        type: "button",
        class: "button with-text",
        "data-action": "revoke",
        "aria-label": m.revokePermissionLabel(name),
      },
      m.revoke,
    );
    revoke.disabled = busy;
    revoke.addEventListener(
      "click",
      () =>
        void act(
          () => api.setPermission(holder.sub, id, false),
          m.revokedPermission(name, permissionName(id, words())),
          m.noAccount,
        ),
    );
    const granted =
      holder.by && holder.at ? [m.grantedBy(whoText(holder.by, words()), when(holder.at))] : [];
    return h(
      "li",
      { class: "token-row", "data-sub": holder.sub },
      h(
        "div",
        { class: "token-info" },
        h("strong", {}, name),
        h(
          "span",
          { class: "token-meta" },
          [holder.handle ? `@${holder.handle}` : "", holder.email, ...granted]
            .filter(Boolean)
            .join(" · "),
        ),
      ),
      revoke,
    );
  };
  const permissions = (v: AdminView): HTMLElement =>
    h(
      "div",
      { class: "administration-part", "data-part": "permissions" },
      h("h3", {}, m.permissionsTitle),
      h("p", { class: "field-hint" }, m.implicit),
      ...v.permissions.map((permission) =>
        h(
          "div",
          { class: "administration-permission", "data-permission": permission.id },
          h("h4", {}, permissionName(permission.id, words())),
          h("p", { class: "field-hint" }, m.permissions[permission.id]?.description ?? ""),
          grantFor(permission.id).form,
          h("p", { class: "field-label" }, m.holders),
          permission.holders.length > 0
            ? h(
                "ul",
                { class: "token-list", role: "list" },
                ...permission.holders.map((holder) => holderRow(permission.id, holder)),
              )
            : h("p", { class: "field-hint" }, m.noHolders),
        ),
      ),
    );

  // Takedown ----------------------------------------------------------------------------------------
  const addressInput = h("input", { type: "text", autocomplete: "off", spellcheck: "false" });
  const reasonInput = h("input", { type: "text", autocomplete: "off", maxlength: "500" });
  const takedownProblem = h("p", { class: "field-problem", role: "alert" });
  const takedownForm = h(
    "form",
    { class: "token-form" },
    field(m.address, addressInput, " "),
    field(m.reason, reasonInput),
    h("button", { type: "submit", class: "button with-text" }, m.takedown),
    takedownProblem,
  );
  takedownForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    takedownProblem.textContent = "";
    const found = publicationAt(addressInput.value, view?.publishHost ?? null);
    if (!found) {
      takedownProblem.textContent = m.notAddress;
      addressInput.focus();
      return;
    }
    const address = `${found.handle}/${found.slug}`;
    if (
      !(await confirmDialog(m.takedownConfirmTitle, m.takedownMessage(address), m.takedownConfirm))
    )
      return;
    const done = await act(
      () => api.takeDown(found.handle, found.slug, reasonInput.value.trim()),
      m.takenDown(address),
      m.noPublication,
      takedownProblem,
    );
    if (done) {
      addressInput.value = "";
      reasonInput.value = "";
    }
  });
  const takedown = (v: AdminView): HTMLElement => {
    const hint = takedownForm.querySelector<HTMLElement>(".field-hint");
    if (hint) hint.textContent = m.addressHint(v.publishHost ?? "");
    return h(
      "div",
      { class: "administration-part", "data-part": "takedown" },
      h("h3", {}, m.takedownTitle),
      h("p", { class: "field-hint" }, m.takedownIntro),
      takedownForm,
    );
  };

  // Recent changes ------------------------------------------------------------------------------------
  const recent = (v: AdminView): HTMLElement =>
    h(
      "div",
      { class: "administration-part", "data-part": "log" },
      h("h3", {}, m.logTitle),
      v.log.length > 0
        ? h(
            "ul",
            { class: "token-list administration-log", role: "list" },
            ...v.log.map((entry) =>
              h(
                "li",
                { class: "token-row" },
                h(
                  "div",
                  { class: "token-info" },
                  h("span", {}, logText(entry, words())),
                  h("span", { class: "token-meta" }, when(entry.at)),
                ),
              ),
            ),
          )
        : h("p", { class: "field-hint" }, m.noLog),
    );

  // Drawing ---------------------------------------------------------------------------------------
  const retry = h("button", { type: "button", class: "button with-text" }, words().tryAgain);
  retry.addEventListener("click", () => void load());
  let failed = false;

  function render(): void {
    if (disposed) return;
    if (options.user.administration === null) {
      if (body.childElementCount === 0) body.append(invitee());
      return;
    }
    if (!view) {
      body.replaceChildren(
        failed
          ? h("div", {}, h("p", {}, m.loadFailed), retry)
          : h("p", { class: "field-hint" }, words().loading),
      );
      return;
    }
    body.replaceChildren(
      administrators(view),
      ...(view.role === "owner" ? [invitations(view)] : []),
      permissions(view),
      takedown(view),
      recent(view),
    );
    for (const button of body.querySelectorAll<HTMLButtonElement>("form button")) {
      button.disabled = busy;
    }
  }

  async function load(): Promise<void> {
    const read = await api.load();
    if (disposed) return;
    if (read.ok) {
      view = read.value;
      failed = false;
    } else if (read.failure.status === 404) {
      reload("profile");
      return;
    } else {
      failed = view === undefined;
    }
    render();
  }

  const element = h(
    "div",
    { class: "account-section-body administration-section" },
    h("p", { class: "account-intro" }, m.intro),
    status,
    problem,
    body,
  );

  return {
    element,
    shown() {
      render();
      if (!started && options.user.administration !== null) {
        started = true;
        void load();
      }
    },
    dispose() {
      disposed = true;
    },
  };
}
