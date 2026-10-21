// Import project: a project archive, chosen or dropped, and where it goes: a new project in the
// account (signed in), the project of this browser, or the files of the project that is open. An
// archive never replaces anything without that choice.

import { MANIFEST_NAME } from "@meltemi/diagrams-project";
import { cleanPath, isTextPath } from "../files.js";
import { messages } from "../messages/index.js";
import type { CloudController } from "../cloud/controller.js";
import { ProjectsModel, checkProjectName, nameProblem } from "../cloud/projects-model.js";
import { field, h, openDialog } from "../ui.js";
import { ZipError, readZip } from "../zip.js";

export interface ImportHost {
  readonly cloud: CloudController | undefined;
  /** The name of the project that is open, as the explorer's header shows it. */
  openName(): string;
  /** Whether the project that is open is the one of this browser. */
  localOpen(): boolean;
  /** View mode: nothing of the open project can be replaced. */
  readOnly(): boolean;
  /** The archive's files become the project of this browser, which opens. */
  intoBrowser(files: readonly [string, string | Uint8Array][]): void;
  /** The archive's files replace those of the open project. */
  replaceOpen(files: readonly [string, string | Uint8Array][]): void;
  status(message: string): void;
}

/** A project archive's files, as the page keeps them: texts as strings, other files as bytes. */
export async function archiveFiles(file: File): Promise<[string, string | Uint8Array][]> {
  const files: [string, string | Uint8Array][] = [];
  for (const entry of await readZip(new Uint8Array(await file.arrayBuffer()))) {
    const path = cleanPath(entry.path);
    if (!path) continue;
    files.push([
      path,
      isTextPath(path) && !path.endsWith(".svg")
        ? new TextDecoder().decode(entry.data)
        : entry.data,
    ]);
  }
  return files;
}

/** The name `project.json` gives, if it gives one. */
function manifestName(files: readonly [string, string | Uint8Array][]): string | undefined {
  const manifest = files.find(([path]) => path === MANIFEST_NAME)?.[1];
  if (typeof manifest !== "string") return undefined;
  try {
    const name = (JSON.parse(manifest) as { name?: unknown }).name;
    return typeof name === "string" && name.trim() !== "" ? name.trim() : undefined;
  } catch {
    return undefined;
  }
}

let dialogs = 0;

/** Reads an archive and asks where its project goes. */
export async function importProject(archive: File, host: ImportHost): Promise<void> {
  const words = messages().explorer.importProject;
  let files: [string, string | Uint8Array][];
  try {
    files = await archiveFiles(archive);
  } catch (error) {
    host.status(
      error instanceof ZipError
        ? error.message
        : messages().project.archiveUnreadable(archive.name),
    );
    return;
  }
  if (files.length === 0) {
    host.status(words.noFiles(archive.name));
    return;
  }
  const unique = ++dialogs;
  const named = manifestName(files);
  const group = `import-where-${unique}`;
  const radio = (value: string, checked: boolean) =>
    h("input", { type: "radio", name: group, value, checked }) as HTMLInputElement;
  const option = (input: HTMLInputElement, text: string, hint: string, danger = false) =>
    h(
      "label",
      { class: danger ? "choice danger" : "choice" },
      input,
      h(
        "span",
        { class: "choice-text" },
        h("span", { class: "choice-label" }, text),
        h("span", { class: "field-hint" }, hint),
      ),
    );
  const cloud = host.cloud;
  const toCloud = radio("cloud", cloud !== undefined);
  const toBrowser = radio("browser", cloud === undefined);
  const toOpen = radio("replace", false);
  const name = h("input", {
    type: "text",
    value: named ?? archive.name.replace(/\.zip$/i, ""),
    autocomplete: "off",
    spellcheck: "false",
  }) as HTMLInputElement;
  const nameField = field(words.name, name);
  const problem = h("p", { class: "field-problem", role: "alert" });
  const status = h("p", { class: "projects-status", role: "status" });
  const progress = h("progress", { class: "import-progress", max: 1, value: 0, hidden: true });
  const options = [
    ...(cloud ? [option(toCloud, words.newCloud, words.newCloudHint)] : []),
    option(toBrowser, words.browser, words.browserHint),
    // Replacing the project of this browser is what This browser does already.
    ...(!host.readOnly() && !host.localOpen()
      ? [option(toOpen, words.replace(host.openName()), words.replaceHint, true)]
      : []),
  ];
  const follow = () => {
    nameField.hidden = !toCloud.checked;
  };
  for (const input of [toCloud, toBrowser, toOpen]) input.addEventListener("change", follow);
  follow();

  const run = async (): Promise<boolean> => {
    if (toCloud.checked && cloud) {
      const checked = checkProjectName(name.value);
      if (!checked.ok) {
        problem.textContent = nameProblem(checked.reason, messages().cloud);
        return false;
      }
      progress.hidden = false;
      const model = new ProjectsModel(
        cloud,
        () => messages().cloud,
        (state) => {
          status.textContent = state.status;
          problem.textContent = state.problem;
        },
      );
      try {
        const done = await model.createFromFiles(checked.name, new Map(files), (sent, total) => {
          progress.max = total;
          progress.value = sent;
        });
        if (done) host.status(words.imported(archive.name, files.length));
        return done;
      } finally {
        model.dispose();
        progress.hidden = true;
      }
    }
    if (toOpen.checked) host.replaceOpen(files);
    else host.intoBrowser(files);
    host.status(words.imported(archive.name, files.length));
    return true;
  };

  openDialog(
    words.title,
    [
      h("p", {}, words.summary(archive.name, named, files.length)),
      h(
        "fieldset",
        { class: "choices" },
        h("legend", { class: "field-label" }, words.destination),
        ...options,
      ),
      nameField,
      progress,
      problem,
      status,
    ],
    [{ label: messages().dialog.cancel }, { label: words.import, primary: true, run }],
  );
  (options[0]?.querySelector("input") as HTMLInputElement | null)?.focus();
}
