// New project: a name and a card per template, each with a picture of its first diagram, its title,
// what it is for and what it holds. Signed in, the project is made in the account (or, when chosen,
// in this browser); nobody signed in, it replaces the project of this browser as a template did.

import { messages } from "../messages/index.js";
import type { CloudController } from "../cloud/controller.js";
import { ProjectsModel, checkProjectName, nameProblem } from "../cloud/projects-model.js";
import {
  templateContents,
  templateDescription,
  templateTitle,
  type Template,
} from "../templates.js";
import { field, h, openDialog } from "../ui.js";

export interface NewProjectHost {
  readonly templates: readonly Template[];
  /** The person's cloud projects; undefined when nobody is signed in. */
  readonly cloud: CloudController | undefined;
  /** Whether the page is dark: the cards show the dark pictures. */
  dark(): boolean;
  /**
   * Replaces the project of this browser with a template's files under a name, asking first when
   * the work differs from every template; true when it did.
   */
  createLocal(template: Template, name: string): Promise<boolean>;
}

let dialogs = 0;

/** Opens New project, with the template `chosen` (the flow template by default) chosen. */
export function openNewProject(host: NewProjectHost, chosen = "flow"): void {
  const words = messages().explorer.newProject;
  const unique = ++dialogs;
  const templates = host.templates;
  let selected = templates.find((t) => t.name === chosen) ?? templates[0];
  if (!selected) return;

  const name = h("input", {
    type: "text",
    value: templateTitle(selected),
    autocomplete: "off",
    spellcheck: "false",
  }) as HTMLInputElement;
  /** The name follows the card chosen until the person types one of their own. */
  let typed = false;
  name.addEventListener("input", () => {
    typed = true;
    problem.textContent = "";
  });
  const problem = h("p", { class: "field-problem", role: "alert" });
  const status = h("p", { class: "projects-status", role: "status" });

  // Cards ------------------------------------------------------------------------------------
  const label = h(
    "span",
    { id: `new-project-cards-${unique}`, class: "field-label" },
    words.templates,
  );
  const cards = h("div", {
    class: "template-cards",
    role: "radiogroup",
    "aria-labelledby": label.id,
  });
  const cardOf = new Map<Template, HTMLElement>();
  const choose = (template: Template, focus: boolean) => {
    selected = template;
    for (const [t, card] of cardOf) {
      const on = t === template;
      card.setAttribute("aria-checked", String(on));
      card.tabIndex = on ? 0 : -1;
    }
    if (!typed) name.value = templateTitle(template);
    if (focus) cardOf.get(template)?.focus();
  };
  for (const template of templates) {
    const picture = h("img", {
      class: "template-thumb",
      src: host.dark() ? template.thumbnails.dark : template.thumbnails.light,
      alt: "",
      decoding: "async",
    });
    const title = h("span", { class: "template-title" }, templateTitle(template));
    const card = h(
      "div",
      {
        class: "template-card",
        role: "radio",
        "aria-checked": "false",
        tabindex: "-1",
        "data-template": template.name,
      },
      h("span", { class: "template-picture" }, picture),
      h(
        "span",
        { class: "template-text" },
        title,
        h("span", { class: "template-description" }, templateDescription(template)),
        h("span", { class: "template-contents" }, templateContents(template)),
      ),
    );
    card.setAttribute("aria-label", `${templateTitle(template)}: ${templateDescription(template)}`);
    card.addEventListener("click", () => choose(template, true));
    card.addEventListener("dblclick", () => void create().then((done) => done && dialog.close()));
    card.addEventListener("keydown", (e) => {
      const index = templates.indexOf(template);
      const columns = Math.max(
        1,
        Math.round(cards.clientWidth / Math.max(1, card.getBoundingClientRect().width)),
      );
      const step =
        e.key === "ArrowRight"
          ? 1
          : e.key === "ArrowLeft"
            ? -1
            : e.key === "ArrowDown"
              ? columns
              : e.key === "ArrowUp"
                ? -columns
                : 0;
      if (step !== 0) {
        e.preventDefault();
        const next = templates[(index + step + templates.length) % templates.length];
        if (next) choose(next, true);
      } else if (e.key === " ") {
        e.preventDefault();
        choose(template, true);
      } else if (e.key === "Enter") {
        e.preventDefault();
        void create().then((done) => done && dialog.close());
      }
    });
    cardOf.set(template, card);
    cards.append(card);
  }

  // Where it goes, for a person signed in -----------------------------------------------------
  const whereName = `new-project-where-${unique}`;
  const inCloud = h("input", { type: "radio", name: whereName, value: "cloud", checked: true });
  const inBrowser = h("input", { type: "radio", name: whereName, value: "browser" });
  const option = (input: HTMLElement, text: string, hint: string) =>
    h(
      "label",
      { class: "choice" },
      input,
      h(
        "span",
        { class: "choice-text" },
        h("span", { class: "choice-label" }, text),
        h("span", { class: "field-hint" }, hint),
      ),
    );
  const where = host.cloud
    ? [
        h(
          "fieldset",
          { class: "choices" },
          h("legend", { class: "field-label" }, words.where),
          option(inCloud, words.inCloud, words.inCloudHint),
          option(inBrowser, words.inBrowser, words.inBrowserHint),
        ),
      ]
    : [];

  async function create(): Promise<boolean> {
    const template = selected;
    if (!template) return false;
    const checked = checkProjectName(name.value);
    if (!checked.ok) {
      problem.textContent = nameProblem(checked.reason, messages().cloud);
      name.focus();
      return false;
    }
    const cloud = host.cloud;
    if (cloud && (inCloud as HTMLInputElement).checked) {
      const model = new ProjectsModel(
        cloud,
        () => messages().cloud,
        (state) => {
          status.textContent = state.status;
          problem.textContent = state.problem;
        },
      );
      try {
        return await model.create(checked.name, template.name);
      } finally {
        model.dispose();
      }
    }
    return host.createLocal(template, checked.name);
  }

  const dialog = openDialog(
    words.title,
    [field(words.name, name, words.nameHint), ...where, label, cards, problem, status],
    [
      { label: messages().dialog.cancel },
      { label: words.create, primary: true, run: () => create() },
    ],
    { wide: true },
  );
  dialog.classList.add("new-project");
  choose(selected, false);
  name.focus();
  name.select();
  name.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void create().then((done) => done && dialog.close());
    }
  });
}
