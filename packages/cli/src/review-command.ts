import { getLocale, type Locale } from "@meltemi/diagrams-i18n";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  ProjectSessions,
  REVIEW_COLOURS,
  gitRevisionHost,
  reviewProjects,
  type Review,
  type ReviewFile,
  type ReviewSide,
} from "@meltemi/diagrams-editor/node";
import { describeChange, type ModelChange } from "@meltemi/diagrams-model";
import { toProjectPath, type ProjectHost } from "@meltemi/diagrams-project";
import { createNodeHost } from "@meltemi/diagrams-project/node";
import { cloudHost } from "./cloud-host.js";
import { printablePath } from "./cloud-paths.js";
import { openCloud, reportCloudError, type CloudContext } from "./cloud-context.js";
import { CloudError } from "./cloud-errors.js";
import { argumentsError, messages } from "./messages/index.js";
import { redactSecrets } from "./redact.js";

/** What the review command needs from the CLI. */
export interface ReviewContext {
  readonly name: string;
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly cwd: string;
  /** A path as printed: relative to the working folder. */
  readonly display: (path: string) => string;
  readonly toolVersion: string;
  /** The language of what the command writes: `--lang`, when given. */
  readonly locale?: Locale;
  /**
   * The connection to the cloud service, for `--base cloud[:<n>]` (`cloudContext("review", …)` of
   * `cloud-command.ts`). Everything the command prints or writes goes through its `redactSecrets`,
   * so no token reaches a line, the JSON or the review page.
   */
  readonly cloud?: CloudContext;
}

/**
 * What `--base` names when it is the cloud: `cloud` (the project's current files) or `cloud:<n>`
 * (version `n`); `invalid` for `cloud:` and `cloud:x`; undefined for a Git revision.
 */
export function parseCloudBase(
  base: string | undefined,
): { readonly version: number | undefined } | "invalid" | undefined {
  if (base === "cloud") return { version: undefined };
  if (base === undefined || !base.startsWith("cloud:")) return undefined;
  return /^cloud:[0-9]{1,9}$/.test(base) ? { version: Number(base.slice(6)) } : "invalid";
}

const EXIT_OK = 0;
const EXIT_FINDINGS = 1;
const EXIT_USAGE = 2;

const SIGNS: Readonly<Record<ReviewFile["status"], string>> = {
  added: "+",
  removed: "-",
  renamed: ">",
  changed: "~",
};

function exists(path: string): "file" | "folder" | null {
  try {
    return statSync(path).isDirectory() ? "folder" : "file";
  } catch {
    return null;
  }
}

/** Counts of changes by kind, over every file. */
export function reviewSummary(
  review: Review,
): Record<ModelChange["kind"], number> & { files: number } {
  const counts = { files: review.files.length, added: 0, removed: 0, renamed: 0, changed: 0 };
  for (const file of review.files) for (const c of file.changes) counts[c.kind]++;
  return counts;
}

/** The summary of a review, in the interface language or the one given. */
function summaryLine(review: Review, locale: Locale = getLocale()): string {
  const s = reviewSummary(review);
  const t = messages(locale).review;
  if (s.files === 0) return t.none;
  return t.summary(s.files, s.added, s.removed, s.renamed, s.changed);
}

/** The changes of a file, grouped under the diagram, model or story they are in. */
function fileLines(file: ReviewFile): string[] {
  const head = file.status === "renamed" ? `${file.from} → ${file.path}` : `${file.path}`;
  const lines = [`${SIGNS[file.status]} ${head}`];
  const top = file.changes.filter((c) => c.scope === null);
  for (const c of top) {
    lines.push(`    ${describeChange(c)}`);
    const inside = file.changes.filter((x) => x.scope === c.id);
    for (const x of inside) lines.push(`        ${describeChange(x)}`);
  }
  // Scopes whose block itself did not change.
  const scopes = [...new Set(file.changes.map((c) => c.scope).filter((s) => s !== null))];
  const t = messages().review;
  for (const scope of scopes) {
    if (top.some((c) => c.id === scope)) continue;
    const kind = file.scopes[scope!];
    lines.push(`    ${kind === undefined ? t.block : t.scopes[kind]} ${scope}`);
    for (const x of file.changes.filter((c) => c.scope === scope)) {
      lines.push(`        ${describeChange(x)}`);
    }
  }
  return lines;
}

const escape = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);
const url = (path: string) => path.split("/").map(encodeURIComponent).join("/");

/**
 * The review page: the changes of every file and the pictures of its changed diagrams, with its
 * words in `locale`, the language of the files the command writes (never the machine's).
 */
export function reviewPage(
  review: Review,
  title: string,
  compared: string,
  pictures: ReadonlyMap<string, { before: string | null; after: string | null }>,
  locale: Locale = "en",
): string {
  const t = messages(locale).review.page;
  const kind = (c: ModelChange) => c.kind;
  const sections = review.files.map((file) => {
    const changes = file.changes
      .map(
        (c) =>
          `<li class="${kind(c)}">${escape(describeChange(c, locale))}${c.scope ? ` <span class="in">${escape(t.in(c.scope))}</span>` : ""}</li>`,
      )
      .join("");
    const diagrams = file.diagrams
      .map((d) => {
        const key = `${file.path}#${d.id}`;
        const files = pictures.get(key);
        const figure = (which: "before" | "after", src: string | null | undefined) =>
          `<figure><figcaption>${which === "before" ? t.before : t.after}</figcaption>${
            src
              ? `<img src="${escape(url(src))}" alt="${escape(t.picture(d.id, which))}">`
              : `<p class="none">${which === "before" ? t.new : t.removed}</p>`
          }</figure>`;
        return `<h3>${escape(t.diagram(d.from && d.from !== d.id ? `${d.from} → ${d.id}` : d.id))}</h3><div class="pair">${figure("before", files?.before)}${figure("after", files?.after)}</div>`;
      })
      .join("");
    const head = file.status === "renamed" ? `${file.from} → ${file.path}` : file.path;
    return `<section><h2><span class="status ${file.status}">${t.status[file.status]}</span> ${escape(head)}</h2><ul class="changes">${changes}</ul>${diagrams}</section>`;
  });
  const legend = (Object.keys(REVIEW_COLOURS) as (keyof typeof REVIEW_COLOURS)[])
    .map((k) => `<span><i style="border-color:${REVIEW_COLOURS[k]}"></i>${t.status[k]}</span>`)
    .join("");
  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'">
<title>${escape(`${t.title} · ${title}`)}</title>
<style>
:root { color-scheme: light dark; --bg: #f6f7f9; --panel: #fff; --fg: #1b1f24; --muted: #59626e; --line: #d8dde4; }
@media (prefers-color-scheme: dark) { :root { --bg: #0f1216; --panel: #171b21; --fg: #e6e9ee; --muted: #9ba5b2; --line: #2c323b; } }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.5 system-ui, sans-serif; }
main { max-width: 1400px; margin: 0 auto; padding: 24px 16px 48px; }
h1 { margin: 0 0 4px; font-size: 1.6rem; }
h2 { margin: 32px 0 8px; font-size: 1.1rem; }
h3 { margin: 16px 0 8px; font-size: 1rem; }
.lead, .in, .none { color: var(--muted); }
.legend { display: flex; flex-wrap: wrap; gap: 16px; color: var(--muted); }
.legend i { display: inline-block; width: 12px; height: 12px; margin-right: 6px; border: 3px solid; border-radius: 3px; vertical-align: -2px; }
.status { display: inline-block; padding: 0 6px; border-radius: 4px; font-size: 0.75rem; text-transform: uppercase; color: #fff; }
.status.added { background: ${REVIEW_COLOURS.added}; } .status.removed { background: ${REVIEW_COLOURS.removed}; }
.status.renamed { background: ${REVIEW_COLOURS.renamed}; } .status.changed { background: ${REVIEW_COLOURS.changed}; }
.changes { padding-left: 1.2em; font: 0.9rem/1.6 ui-monospace, "Cascadia Mono", Consolas, monospace; }
.changes .added { color: ${REVIEW_COLOURS.added}; } .changes .removed { color: ${REVIEW_COLOURS.removed}; }
.changes .renamed { color: ${REVIEW_COLOURS.renamed}; }
.pair { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; }
figure { margin: 0; padding: 8px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); }
figcaption { margin-bottom: 6px; color: var(--muted); font-size: 0.85rem; }
figure img { display: block; max-width: 100%; max-height: 80vh; width: auto; height: auto; margin: 0 auto; }
</style>
</head>
<body>
<main>
<h1>${escape(t.title)}</h1>
<p class="lead">${escape(`${compared}. ${summaryLine(review, locale)}`)}</p>
<p class="legend">${legend}</p>
${sections.join("\n")}
</main>
</body>
</html>
`;
}

/** `meltemi-diagrams review`; asynchronous, because `--base cloud` reads the cloud project first. */
export async function reviewCommand(
  args: readonly string[],
  context: ReviewContext,
): Promise<number> {
  /** What the command prints and writes: with a cloud context, without any token in it. */
  const clean = (text: string): string =>
    context.cloud ? redactSecrets(text, context.cloud.env) : text;
  const stdout = (text: string): void => context.stdout(clean(text));
  const stderr = (text: string): void => context.stderr(clean(text));
  const fail = (message: string) => {
    stderr(`${context.name} review: ${message}\n`);
    return EXIT_USAGE;
  };
  let options: {
    base?: string;
    before?: string;
    out?: string;
    project?: string;
    host?: string;
    json: boolean;
    "exit-code": boolean;
    help: boolean;
  };
  let paths: string[];
  try {
    const parsed = parseArgs({
      args: [...args],
      options: {
        base: { type: "string" },
        before: { type: "string" },
        out: { type: "string" },
        project: { type: "string" },
        host: { type: "string" },
        json: { type: "boolean", default: false },
        "exit-code": { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
      allowPositionals: true,
      strict: true,
    });
    options = parsed.values as typeof options;
    paths = parsed.positionals;
  } catch (error) {
    return fail(argumentsError(error));
  }
  const t = messages().review;
  if (options.help) {
    stdout(messages().help.review);
    return EXIT_OK;
  }
  if (paths.length > 1) return fail(messages().common.oneProjectFolderOrFile);
  if (options.base !== undefined && options.before !== undefined) return fail(t.baseOrBefore);
  const cloudBase = parseCloudBase(options.base);
  if (cloudBase === "invalid") return fail(t.cloudVersion);
  if (cloudBase === undefined && (options.project !== undefined || options.host !== undefined)) {
    return fail(t.cloudOptions);
  }
  const target = toProjectPath(resolve(context.cwd, paths[0] ?? "."));
  const kind = exists(target);
  if (!kind) return fail(messages().common.pathNotFound(paths[0] ?? "."));
  const scopeOf = (path: string, isFolder: boolean, workspace: { root: string }) =>
    isFolder && path === workspace.root ? null : path;

  const afterProjects = new ProjectSessions({
    toolVersion: context.toolVersion,
    ...localeOf(context),
  });
  const afterWorkspace =
    kind === "folder" ? afterProjects.forFolder(target) : afterProjects.forFile(target);
  const after: ReviewSide = {
    workspace: afterWorkspace,
    projects: afterProjects,
    scope: scopeOf(target, kind === "folder", afterWorkspace),
  };

  let before: ReviewSide;
  /** What was compared, in a language: the terminal's, or the report's. */
  let compared: (locale: Locale) => string;
  if (options.before !== undefined) {
    const path = toProjectPath(resolve(context.cwd, options.before));
    const beforeKind = exists(path);
    if (!beforeKind) return fail(messages().common.pathNotFound(options.before));
    if (beforeKind !== kind) return fail(t.sameKinds);
    const projects = new ProjectSessions({
      toolVersion: context.toolVersion,
      ...localeOf(context),
      host: createNodeHost(),
    });
    const workspace = kind === "folder" ? projects.forFolder(path) : projects.forFile(path);
    before = { workspace, projects, scope: scopeOf(path, kind === "folder", workspace) };
    // Names, not paths: the page is shared, and paths would tell where the files live.
    compared = (locale) => messages(locale).review.comparedPaths(baseName(path), baseName(target));
  } else if (cloudBase !== undefined) {
    const cloud = context.cloud;
    if (cloud === undefined) return fail(t.cloudUnavailable);
    let host: ProjectHost;
    let project: string;
    try {
      const manifest = afterWorkspace.manifest().manifest;
      // The manifest never chooses the host (`cloud.host-mismatch`); it names the project.
      const named = options.project ?? manifest?.cloud?.project;
      if (named === undefined) {
        throw new CloudError("cloud.no-project", "The folder names no cloud project.");
      }
      project = named;
      cloud.used.project = project;
      const { client } = openCloud(cloud, {
        host: options.host,
        manifestHost: manifest?.cloud?.host,
      });
      host = await cloudHost(client, {
        project,
        root: afterWorkspace.root,
        ...(cloudBase.version === undefined ? {} : { version: cloudBase.version }),
      });
    } catch (error) {
      if (error instanceof CloudError) return reportCloudError(error, cloud);
      throw error;
    }
    const projects = new ProjectSessions({
      toolVersion: context.toolVersion,
      host,
      ...localeOf(context),
    });
    const workspace = kind === "folder" ? projects.forFolder(target) : projects.forFile(target);
    before = { workspace, projects, scope: scopeOf(target, kind === "folder", workspace) };
    compared = (locale) => messages(locale).review.comparedCloud(project, cloudBase.version);
  } else {
    const revision = options.base ?? "HEAD";
    const host = gitRevisionHost(kind === "folder" ? target : dirname(target), revision);
    if (typeof host === "string") return fail(host);
    const projects = new ProjectSessions({
      toolVersion: context.toolVersion,
      host,
      ...localeOf(context),
    });
    const workspace = kind === "folder" ? projects.forFolder(target) : projects.forFile(target);
    before = { workspace, projects, scope: scopeOf(target, kind === "folder", workspace) };
    compared = (locale) => messages(locale).review.comparedRevision(revision);
  }

  const review = reviewProjects(before, after, { images: options.out !== undefined });
  const changed = review.files.length > 0;

  if (options.out !== undefined) {
    const out = resolve(context.cwd, options.out);
    const pictures = new Map<string, { before: string | null; after: string | null }>();
    try {
      for (const file of review.files) {
        for (const diagram of file.diagrams) {
          const stem = file.path.replace(/\.meltemi$/, "");
          const write = (which: "before" | "after", svg: string | null) => {
            if (svg === null) return null;
            const name = `${stem}/${diagram.id}.${which}.svg`;
            mkdirSync(dirname(join(out, name)), { recursive: true });
            writeFileSync(join(out, name), clean(svg));
            return name;
          };
          pictures.set(`${file.path}#${diagram.id}`, {
            before: write("before", diagram.before),
            after: write("after", diagram.after),
          });
        }
      }
      mkdirSync(out, { recursive: true });
      const title = afterWorkspace.manifest().manifest?.name ?? context.display(target);
      // The report is a written file: `--lang`, else the project's `locale`, else English.
      const locale = afterProjects.contentLocale(afterWorkspace);
      writeFileSync(
        join(out, "index.html"),
        clean(reviewPage(review, title, compared(locale), pictures, locale)),
      );
    } catch (error) {
      return fail(messages().common.cannotWrite(context.display(out), (error as Error).message));
    }
    if (!options.json) {
      stdout(`${messages().common.wrote(context.display(join(out, "index.html")))}\n`);
    }
  }

  if (options.json) {
    stdout(
      `${JSON.stringify(
        {
          compared: compared(getLocale()),
          files: review.files.map(({ diagrams: _d, ...file }) => file),
          summary: reviewSummary(review),
        },
        null,
        2,
      )}\n`,
    );
  } else {
    // The labels may come from the cloud's texts, which a collaborator wrote: control characters
    // (an escape sequence could repaint the terminal) are written out.
    for (const file of review.files) stdout(`${fileLines(file).map(printablePath).join("\n")}\n`);
    stdout(`${summaryLine(review)}\n`);
  }
  return changed && options["exit-code"] ? EXIT_FINDINGS : EXIT_OK;
}

/** The session option for the language of written files, when the command was given one. */
function localeOf(context: { readonly locale?: Locale }): { locale?: Locale } {
  return context.locale ? { locale: context.locale } : {};
}
