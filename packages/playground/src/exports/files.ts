import { buildCatalog } from "@meltemi/diagrams-editor";
import type { Locale } from "@meltemi/diagrams-i18n";
import { stringifyJson, toJson } from "@meltemi/diagrams-model";
import { ROOT } from "../files.js";
import { messages } from "../messages/index.js";
import type { Playground } from "../shell.js";
import { download } from "../ui.js";
import { writeZip } from "../zip.js";

const encoder = new TextEncoder();

/** The name of a file without its folder. */
export const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);

/** The open file's name without `.meltemi`. */
export const stemOf = (path: string) => baseName(path).replace(/\.meltemi$/, "");

/** The project's name from project.json, as a folder name. */
export function projectSlug(playground: Playground): string {
  try {
    const name = (JSON.parse(playground.studio.text("project.json")) as { name?: unknown }).name;
    if (typeof name === "string") {
      const slug = name
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^A-Za-z0-9._-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase();
      if (slug) return slug;
    }
  } catch {
    // No project.json, or one that does not parse.
  }
  return "meltemi-project";
}

export function downloadSource(playground: Playground): void {
  const path = playground.studio.open;
  if (!path) return;
  download(baseName(path), playground.studio.text(path), "text/plain;charset=utf-8");
  playground.status(messages().download.downloaded(baseName(path)));
}

/** The project as a `.zip` whose files sit in a folder named after the project. */
export async function projectArchive(
  playground: Playground,
): Promise<{ name: string; data: Uint8Array }> {
  const slug = projectSlug(playground);
  const entries = [...playground.files()].map(([path, content]) => ({
    path: `${slug}/${path}`,
    data: typeof content === "string" ? encoder.encode(content) : content,
  }));
  return { name: `${slug}.zip`, data: await writeZip(entries) };
}

export async function downloadProject(playground: Playground): Promise<void> {
  const { name, data } = await projectArchive(playground);
  download(name, data as Uint8Array<ArrayBuffer>, "application/zip");
  playground.status(messages().download.projectDownloaded(name));
}

/** The model JSON of the open file, as `meltemi-diagrams convert --to json` writes it. */
export function downloadModel(playground: Playground): void {
  const analysis = playground.studio.document();
  if (!analysis) return;
  const name = `${stemOf(playground.studio.open)}.model.json`;
  download(name, stringifyJson(toJson(analysis.compilation)), "application/json");
  playground.status(messages().download.downloaded(name));
}

/**
 * Builds the project's HTML catalog, as `meltemi-diagrams build catalog` writes it: the one build
 * the download and publishing (`cloud/publish.ts`) share, so that a published page is the page the
 * catalog export makes. With `strict`, a catalog script that cannot be fetched is an error and not
 * the text of whatever answered (publishing must never send that).
 */
export async function projectCatalog(
  playground: Playground,
  options: {
    readonly locale?: Locale | undefined;
    readonly strict?: boolean;
    /** `"none"`: the pictures without the Meltemi strip, for an export without the branding. */
    readonly frame?: "none" | undefined;
  } = {},
) {
  const script = await fetch("assets/catalog.js", { credentials: "same-origin" }).then((r) => {
    if (options.strict && !r.ok) throw new Error(`assets/catalog.js: ${r.status}`);
    return r.text();
  });
  return playground.studio.settledIn(options.locale, (projects) =>
    buildCatalog(projects.forFolder(ROOT), projects, {
      script: () => script,
      generator: `Meltemi Diagrams ${playground.options.version}`,
      ...(options.frame ? { frame: options.frame } : {}),
    }),
  );
}

/**
 * The project's HTML catalog, as `meltemi-diagrams build catalog` writes it, with its headings,
 * controls and drawings in `locale`: the project's language when it is left out, as with the
 * command line without `--lang`.
 */
export async function downloadCatalog(
  playground: Playground,
  locale?: Locale,
  frame?: "none",
): Promise<void> {
  const m = messages().download;
  playground.status(m.building);
  const build = await projectCatalog(playground, { locale, frame });
  const name = `${projectSlug(playground)}-catalog.html`;
  download(name, build.html, "text/html;charset=utf-8");
  playground.status(m.catalogDownloaded(name, build.data.entries.length, build.skipped.length));
}
