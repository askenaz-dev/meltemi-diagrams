import { importText, stemOf, type ImportResult } from "@meltemi/diagrams-import";
import { cleanPath, isImagePath, isTextPath } from "./files.js";
import { markdown } from "./code/markdown.js";
import { messages } from "./messages/index.js";
import type { Playground } from "./shell.js";
import { SHARE_LIMITS, encodeShare, shareLink } from "./share.js";
import { announce, chooseFiles, download, field, h, openDialog } from "./ui.js";

/** Asks a yes-or-no question; resolves true when the person confirms. */
export function confirmDialog(title: string, message: string, confirm: string): Promise<boolean> {
  return new Promise((resolve) => {
    let answer = false;
    const dialog = openDialog(
      title,
      [h("p", {}, message)],
      [
        { label: messages().dialog.cancel },
        { label: confirm, primary: true, run: () => void (answer = true) },
      ],
    );
    dialog.addEventListener("close", () => resolve(answer));
  });
}

/** Asks for a name; `check` returns why a value is refused. */
export function promptName(
  title: string,
  label: string,
  initial: string,
  check: (value: string) => string | undefined,
): Promise<string | undefined> {
  return new Promise((resolve) => {
    let answer: string | undefined;
    const input = h("input", {
      type: "text",
      value: initial,
      spellcheck: "false",
      autocomplete: "off",
    });
    const problem = h("p", { class: "field-problem", role: "alert" });
    const accept = () => {
      const reason = check(input.value.trim());
      problem.textContent = reason ?? "";
      if (reason) return false;
      answer = input.value.trim();
      return true;
    };
    const m = messages().dialog;
    const dialog = openDialog(
      title,
      [field(label, input), problem],
      [{ label: m.cancel }, { label: m.ok, primary: true, run: accept }],
    );
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (accept()) dialog.close();
      }
    });
    const dot = initial.lastIndexOf(".");
    const slash = initial.lastIndexOf("/");
    input.focus();
    input.setSelectionRange(slash + 1, dot > slash ? dot : initial.length);
    dialog.addEventListener("close", () => resolve(answer));
  });
}

// Import --------------------------------------------------------------------------------------

/**
 * The Markdown report of an import, as the CLI's `--report` prints it, in the interface language;
 * the importer's values (formats, statuses, codes) and findings stay as it gives them.
 */
function importReport(name: string, result: ImportResult): string {
  const m = messages().import.report;
  const lines = [m.title(name), "", m.format(result.format, result.status), ""];
  for (const diagram of result.diagrams) {
    const coverage = result.coverage.find((c) => c.diagram === diagram.id);
    lines.push(m.diagram(diagram.id, diagram.type, diagram.source.kind, coverage));
  }
  if (result.findings.length > 0) {
    lines.push("", m.findings, "");
    for (const f of result.findings) {
      lines.push(m.finding(f.range.start.line, f.severity, f.code, f.message));
    }
  }
  return `${lines.join("\n")}\n`;
}

/** Imports Mermaid, PlantUML or Markdown text into a new `.meltemi` file of the project. */
export function importDialog(playground: Playground): void {
  const m = messages().import;
  const source = h("textarea", {
    class: "import-source",
    rows: 12,
    spellcheck: "false",
    placeholder: m.placeholder,
  });
  const name = h("input", { type: "text", value: "imported", spellcheck: "false" });
  const outcome = h("div", { class: "import-outcome", role: "status" });
  const chooseFile = h("button", { type: "button", class: "button with-text" }, m.chooseFile);
  chooseFile.addEventListener("click", async () => {
    const [file] = await chooseFiles(
      ".mmd,.mermaid,.md,.markdown,.puml,.plantuml,.pu,.iuml,.txt",
      false,
    );
    if (!file) return;
    source.value = await file.text();
    name.value = stemOf(file.name) || "imported";
  });
  let report: string | undefined;
  const run = () => {
    // The dialog may have been open when the page turned read-only: nothing is added then, and
    // it must not say it was.
    if (playground.studio.readOnly) {
      outcome.replaceChildren(h("p", { class: "field-problem" }, messages().viewing.readOnly));
      return false;
    }
    const text = source.value;
    if (text.trim() === "") {
      outcome.replaceChildren(h("p", { class: "field-problem" }, m.empty));
      return false;
    }
    const result = importText(text, { fileName: `${name.value || "imported"}.txt` });
    report = importReport(name.value || "imported", result);
    const findings = h(
      "ul",
      { class: "import-findings" },
      ...result.findings
        .slice(0, 50)
        .map((f) =>
          h("li", { class: `is-${f.severity}` }, m.finding(f.range.start.line, f.message, f.code)),
        ),
    );
    if (result.text === null) {
      outcome.replaceChildren(h("p", { class: "field-problem" }, m.nothing), findings);
      return false;
    }
    const stem = cleanPath(name.value.replace(/\.meltemi$/, "")) ?? "imported";
    let path = `diagrams/${stem}.meltemi`;
    for (let n = 2; playground.studio.host.has(path); n++) path = `diagrams/${stem}-${n}.meltemi`;
    playground.studio.addFiles([[path, result.text]], path);
    playground.keepNow();
    playground.status(
      m.imported(String(result.format), path, result.status, result.findings.length),
    );
    if (result.findings.length > 0) {
      outcome.replaceChildren(
        h("p", {}, m.importedInto(path, result.status)),
        findings,
        saveReport,
      );
      return false;
    }
    return true;
  };
  const saveReport = h("button", { type: "button", class: "button with-text" }, m.downloadReport);
  saveReport.addEventListener("click", () => {
    if (report) download(`${name.value || "imported"}.import.md`, report, "text/markdown");
  });
  openDialog(
    m.title,
    [
      h("p", {}, m.intro),
      field(m.source, source),
      h("div", { class: "row" }, chooseFile),
      field(m.name, name),
      outcome,
    ],
    [{ label: messages().dialog.close }, { label: m.import, primary: true, run }],
    { wide: true },
  );
  source.focus();
}

// Share ---------------------------------------------------------------------------------------

/** Makes a link that carries the project and copies it. */
export async function shareDialog(playground: Playground): Promise<void> {
  const files: Record<string, string> = {};
  const left: string[] = [];
  for (const [path, content] of playground.files()) {
    if (typeof content === "string" && isTextPath(path)) files[path] = content;
    else left.push(path);
  }
  const value = await encodeShare({ open: playground.studio.open, files });
  const link = shareLink(playground.options.page, value);
  const m = messages().share;
  const box = h("input", {
    type: "text",
    value: link,
    readonly: true,
    class: "share-link",
    "aria-label": m.linkLabel,
  });
  const size = link.length;
  const notes = [h("p", {}, m.holds(Object.keys(files).length, size))];
  if (left.length > 0) notes.push(h("p", { class: "field-hint" }, m.images(left)));
  if (size > SHARE_LIMITS.warn) notes.push(h("p", { class: "field-problem" }, m.long));
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      announce(m.copied);
      playground.status(m.copiedStatus);
    } catch {
      box.select();
      playground.status(m.selectIt);
      return false;
    }
    return true;
  };
  // A live session needs the project in an account: the way there is offered (`live-sessions`).
  const live = messages().cloud.live.anonymous;
  const session = playground.options.session;
  const toLive =
    playground.cloud !== undefined
      ? h("button", { type: "button", class: "button with-text" }, live.save)
      : session.kind !== "cookie"
        ? h("a", { class: "button with-text", href: session.signIn }, live.signIn)
        : undefined;
  const liveNote = h(
    "div",
    { class: "share-live-note" },
    h("p", { class: "field-hint" }, live.text),
    ...(toLive ? [toLive] : []),
  );
  const dialog = openDialog(
    m.title,
    [...notes, field(m.link, box), liveNote],
    [{ label: messages().dialog.close }, { label: m.copy, primary: true, run: copy }],
  );
  if (toLive instanceof HTMLButtonElement) {
    toLive.addEventListener("click", () => {
      dialog.close();
      // The switcher's panel saves this project to the person's account, and opens it there.
      playground.explorer.switcher.open();
    });
  }
  box.focus();
  box.select();
}

// About and continuing locally ----------------------------------------------------------------

export function aboutDialog(playground: Playground): void {
  const m = messages().about;
  const list = h("ul", { class: "notices" }, h("li", {}, m.loading));
  void fetch("notices.json", { credentials: "same-origin" })
    .then((r) => r.json() as Promise<{ name: string; version: string; license: string }[]>)
    .then((packages) =>
      list.replaceChildren(
        ...packages.map((p) =>
          h("li", {}, h("strong", {}, p.name), ` ${p.version} · ${p.license}`),
        ),
      ),
    )
    .catch(() => list.replaceChildren(h("li", {}, m.unreadable)));
  openDialog(m.title, [
    markdown(m.text(playground.options.version)),
    list,
    h("p", {}, h("a", { href: "NOTICES.md", target: "_blank", rel: "noopener" }, m.notices)),
    // The agent setup page beside the playground, in the interface's language (decision 0063).
    h("p", {}, h("a", { href: m.agentsPage, target: "_blank", rel: "noopener" }, m.agents)),
  ]);
}

export function continueDialog(playground: Playground): void {
  const m = messages().continue;
  const name = (playground.files().has("project.json") ? "project" : "diagrams").replace(
    /\W/g,
    "-",
  );
  const commands = [
    [m.install, "npm install --global @meltemi/diagrams-cli"],
    [m.validate, `meltemi-diagrams validate ${name}`],
    [m.export, `meltemi-diagrams export ${name}`],
    [m.catalog, `meltemi-diagrams build catalog ${name}`],
    [m.init, "meltemi-diagrams init my-project --template purchase"],
    [m.skill, "meltemi-diagrams skill install"],
  ];
  const download = h("button", { type: "button", class: "button primary with-text" }, m.download);
  download.addEventListener("click", () => {
    void import("./exports/files.js").then((files) => files.downloadProject(playground));
  });
  openDialog(m.title, [
    h("p", {}, m.text(name)),
    download,
    h(
      "dl",
      { class: "commands" },
      ...commands.flatMap(([label, text]) => [
        h("dt", {}, label!),
        h("dd", {}, h("code", {}, text!)),
      ]),
    ),
  ]);
}

/** Whether a file chosen by the person is one the playground opens. */
export function openable(name: string): boolean {
  return name.endsWith(".zip") || isTextPath(name) || isImagePath(name);
}
