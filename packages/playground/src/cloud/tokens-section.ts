// The API tokens section of the account panel: the person's tokens, a form that makes one, the new
// token shown once, and a revocation after a confirmation. What it knows and does is
// `TokensModel`'s; this draws it. Names, dates and the service's messages are set as text, never as
// markup. The section reads the list the first time it is shown, and forgets the token it showed
// when the panel closes.

import { getLocale } from "@meltemi/diagrams-i18n";
import { confirmDialog } from "../dialogs.js";
import { messages } from "../messages/index.js";
import { field, h } from "../ui.js";
import { TOKEN_LIMIT, tokenApi, whenText, type ApiToken, type NewToken } from "./tokens.js";
import { TokensModel, type TokensState } from "./tokens-model.js";

let sections = 0;

/** The section's element, how to start it the first time it shows, and how to end it. */
export interface TokensSection {
  readonly element: HTMLElement;
  /** Reads the list (the first time only) and focuses the name field. */
  shown(): void;
  /** The panel closed: the token shown once leaves the page. */
  dispose(): void;
}

/** The section for the person signed in on this page. */
export function tokensSection(): TokensSection {
  const m = messages().tokens;
  const unique = ++sections;
  const api = tokenApi((url, init) => fetch(url, init), location);
  let disposed = false;
  let started = false;
  /** The rows and the token the section is showing, so that it redraws only what changed. */
  let rows: readonly ApiToken[] | undefined;
  let shown: NewToken | undefined;

  const nameInput = h("input", { type: "text", autocomplete: "off", spellcheck: "false" });
  const create = h("button", { type: "submit", class: "button primary with-text" }, m.create);
  const form = h(
    "form",
    { class: "token-form", "aria-labelledby": `token-form-title-${unique}` },
    h("h3", { id: `token-form-title-${unique}` }, m.createTitle),
    field(m.name, nameInput, m.nameHint),
    create,
  );
  const reveal = h("div", { class: "token-reveal", role: "group", "aria-label": m.tokenLabel });
  reveal.hidden = true;
  const status = h("p", { class: "token-status", role: "status" });
  const problem = h("p", { class: "field-problem", role: "alert" });
  const count = h("p", { class: "field-hint token-count" });
  const list = h("ul", {
    class: "token-list",
    role: "list",
    "aria-labelledby": `token-list-title-${unique}`,
  });
  const none = h("p", { hidden: true }, m.none);
  const retry = h(
    "button",
    { type: "button", class: "button with-text", hidden: true },
    m.tryAgain,
  );

  const row = (token: ApiToken): HTMLElement => {
    const locale = getLocale();
    const created = token.createdAt === "" ? [] : [m.createdAt(whenText(token.createdAt, locale))];
    const used =
      token.lastUsedAt === null ? m.neverUsed : m.lastUsedAt(whenText(token.lastUsedAt, locale));
    const revoke = h(
      "button",
      { type: "button", class: "button with-text", "aria-label": m.revokeToken(token.name) },
      m.revoke,
    );
    revoke.addEventListener("click", () => void askRevoke(token));
    return h(
      "li",
      { class: "token-row", "data-token-id": token.id },
      h(
        "div",
        { class: "token-info" },
        h("strong", { class: "token-name" }, token.name),
        h("span", { class: "token-meta" }, [...created, used].join(" · ")),
      ),
      revoke,
    );
  };

  /** What shows a new token, once: the field to read it from and the button to copy it. */
  const revealBlock = (token: NewToken): Node[] => {
    const value = h("input", {
      type: "text",
      class: "token-value",
      value: token.token,
      readonly: true,
      autocomplete: "off",
      spellcheck: "false",
      "aria-label": m.tokenLabel,
    });
    const copied = h("p", { class: "field-hint", role: "status" });
    const copy = h("button", { type: "button", class: "button primary with-text" }, m.copy);
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(value.value);
        copied.textContent = m.copied;
      } catch {
        // Without the clipboard (a page that is not secure, or a refusal) the person copies by hand.
        value.focus();
        value.select();
        copied.textContent = m.selectIt;
      }
    });
    return [h("p", {}, m.copyNow(token.name)), h("div", { class: "row" }, value, copy), copied];
  };

  const render = (state: TokensState): void => {
    if (disposed) return;
    status.textContent = state.status;
    problem.textContent = state.problem;
    if (state.tokens !== rows) {
      rows = state.tokens;
      list.replaceChildren(...rows.map(row));
    }
    const ready = state.list === "ready";
    count.textContent = ready ? m.count(state.tokens.length, TOKEN_LIMIT) : "";
    none.hidden = !(ready && state.tokens.length === 0);
    retry.hidden = state.list !== "failed";
    if (state.revealed !== shown) {
      shown = state.revealed;
      reveal.replaceChildren(...(shown ? revealBlock(shown) : []));
      reveal.hidden = shown === undefined;
    }
    create.disabled = state.busy;
    for (const button of list.querySelectorAll("button")) button.disabled = state.busy;
  };

  const model = new TokensModel(api, () => messages().tokens, render);

  /** Puts focus on the Revoke button at a position of the list, or on the name when none is left. */
  const focusRow = (position: number): void => {
    const buttons = [...list.querySelectorAll("button")];
    (buttons[Math.min(position, buttons.length - 1)] ?? nameInput).focus();
  };

  /** Asks first, then revokes; focus lands on a button that is still there. */
  async function askRevoke(token: ApiToken): Promise<void> {
    const sure = await confirmDialog(m.revokeTitle, m.revokeMessage(token.name), m.revokeConfirm);
    if (!sure || disposed) return;
    const position = model.state.tokens.findIndex((held) => held.id === token.id);
    await model.revoke(token);
    if (!disposed) focusRow(position);
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const made = await model.create(nameInput.value);
    if (disposed) {
      // The panel was closed while the token was being made: nobody sees it, and nothing keeps it.
      model.forget();
      return;
    }
    if (made) {
      nameInput.value = "";
      reveal.querySelector("button")?.focus();
    } else if (!model.state.busy) {
      nameInput.focus();
    }
  });
  retry.addEventListener("click", () => void model.load());

  const element = h(
    "div",
    { class: "account-section-body tokens-section" },
    h("p", { class: "account-intro" }, m.intro),
    form,
    reveal,
    status,
    problem,
    h("h3", { id: `token-list-title-${unique}` }, m.listLabel),
    count,
    list,
    none,
    retry,
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
      // The token is shown once: nothing of it stays in the page.
      disposed = true;
      nameInput.value = "";
      reveal.replaceChildren();
      model.forget();
    },
  };
}
