// The dialogs of the explorer's actions: a new diagram (a name and a kind), a new folder or file (a
// name), and Move to (a folder, or a new one in it). Each checks what is typed as it is confirmed and
// says why a name is refused, keeping the dialog open.

import { messages } from "../messages/index.js";
import { field, h, icon, openDialog } from "../ui.js";
import { EXPLORER_ICONS } from "./icons.js";
import type { NameProblem } from "./tree-model.js";

/** A refused name in words. */
export function problemText(problem: NameProblem): string {
  const words = messages().explorer.actions;
  switch (problem.reason) {
    case "empty":
      return words.empty;
    case "invalid":
      return words.invalid;
    case "extension":
      return words.extension;
    case "exists":
      return words.exists(problem.path);
    case "itself":
      return words.itself;
  }
}

/** A name field that answers, on Enter or the dialog's button, what `accept` says of the name. */
function nameDialog(
  title: string,
  hint: string,
  where: string,
  extra: readonly HTMLElement[],
  accept: (name: string) => string | undefined,
  returnTo: () => HTMLElement | undefined,
): void {
  const words = messages().explorer.actions;
  const input = h("input", {
    type: "text",
    autocomplete: "off",
    spellcheck: "false",
  }) as HTMLInputElement;
  const problem = h("p", { class: "field-problem", role: "alert" });
  const run = () => {
    const reason = accept(input.value);
    problem.textContent = reason ?? "";
    if (reason !== undefined) input.focus();
    return reason === undefined;
  };
  const dialog = openDialog(
    title,
    [h("p", { class: "dialog-where" }, where), field(words.name, input, hint), ...extra, problem],
    [{ label: messages().dialog.cancel }, { label: words.create, primary: true, run }],
    { returnTo },
  );
  input.addEventListener("input", () => (problem.textContent = ""));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (run()) dialog.close();
    }
  });
  input.focus();
}

/** New diagram: its name, and its kind as a choice of three. */
export function newDiagramDialog(
  folder: string,
  accept: (name: string, kind: "flow" | "free" | "sequence") => string | undefined,
  returnTo: () => HTMLElement | undefined,
): void {
  const words = messages().explorer.actions;
  const group = `new-diagram-kind-${Math.random().toString(36).slice(2)}`;
  const kinds = (["flow", "free", "sequence"] as const).map((kind, index) => {
    const input = h("input", {
      type: "radio",
      name: group,
      value: kind,
      checked: index === 0,
    }) as HTMLInputElement;
    return {
      kind,
      input,
      label: h(
        "label",
        { class: "segment" },
        input,
        icon(EXPLORER_ICONS[kind]),
        h("span", {}, words.kinds[kind]),
      ),
    };
  });
  const chooser = h(
    "fieldset",
    { class: "segments" },
    h("legend", { class: "field-label" }, words.kind),
    ...kinds.map((k) => k.label),
  );
  nameDialog(
    words.newDiagramTitle,
    words.diagramHint,
    words.where(folder),
    [chooser],
    (name) => accept(name, kinds.find((k) => k.input.checked)?.kind ?? "flow"),
    returnTo,
  );
}

export function newFolderDialog(
  folder: string,
  accept: (name: string) => string | undefined,
  returnTo: () => HTMLElement | undefined,
): void {
  const words = messages().explorer.actions;
  nameDialog(words.newFolderTitle, words.folderHint, words.where(folder), [], accept, returnTo);
}

export function newFileDialog(
  folder: string,
  accept: (name: string) => string | undefined,
  returnTo: () => HTMLElement | undefined,
): void {
  const words = messages().explorer.actions;
  nameDialog(words.newFileTitle, words.fileHint, words.where(folder), [], accept, returnTo);
}

/**
 * Move to: the project's folders to choose one, and a new folder to make in it. `accept` answers
 * why the move is refused, or nothing once it is made.
 */
export function moveDialog(
  what: string,
  folders: readonly string[],
  from: string,
  accept: (folder: string) => string | undefined,
  returnTo: () => HTMLElement | undefined,
): void {
  const words = messages().explorer.actions;
  const choices = ["", ...folders];
  const select = h(
    "select",
    { class: "move-folders", size: String(Math.min(8, Math.max(3, choices.length))) },
    ...choices.map((folder) =>
      h(
        "option",
        { value: folder, selected: folder === from },
        folder === "" ? words.root : folder,
      ),
    ),
  ) as HTMLSelectElement;
  const fresh = h("input", {
    type: "text",
    autocomplete: "off",
    spellcheck: "false",
  }) as HTMLInputElement;
  const problem = h("p", { class: "field-problem", role: "alert" });
  const run = () => {
    const name = fresh.value.trim();
    const base = select.value;
    const target = name === "" ? base : base === "" ? name : `${base}/${name}`;
    const reason = accept(target);
    problem.textContent = reason ?? "";
    return reason === undefined;
  };
  const dialog = openDialog(
    words.moveTitle(what),
    [field(words.moveTo, select), field(words.newFolder, fresh), problem],
    [{ label: messages().dialog.cancel }, { label: words.move, primary: true, run }],
    { returnTo },
  );
  for (const control of [select, fresh] as HTMLElement[]) {
    control.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (run()) dialog.close();
      }
    });
    control.addEventListener("input", () => (problem.textContent = ""));
  }
  select.focus();
}
