import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { TEMPLATES, templateManifest, type TemplateName } from "@meltemi/diagrams-project";
import { argumentsError, messages } from "./messages/index.js";

export { TEMPLATES, type TemplateName };

/** What the init command needs from the CLI. */
export interface InitContext {
  readonly name: string;
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly cwd: string;
  /** A path as printed: relative to the working folder. */
  readonly display: (path: string) => string;
  readonly toolVersion: string;
  readonly languageVersion: string;
}

/** The CI services `--ci` writes a workflow for. */
export const CI_SERVICES = ["github", "gitlab"] as const;

const EXIT_OK = 0;
const EXIT_USAGE = 2;

/** The folder of the templates: `templates/` beside `src/` and `dist/`. */
const TEMPLATE_ROOT = fileURLToPath(new URL("../templates/", import.meta.url));

/** The files of a template, relative to its folder, sorted. */
export function templateFiles(template: TemplateName): string[] {
  const root = join(TEMPLATE_ROOT, template);
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else found.push(relative(root, path).split(sep).join("/"));
    }
  };
  walk(root);
  return found.sort();
}

/**
 * A CI template with its cloud job in or out. The job that pushes to the cloud sits at the end of
 * the template between two marker comments (`# {{cloud-begin}}` and `# {{cloud-end}}`, so that the
 * template is the workflow one reads and Prettier keeps it as it is): `--cloud` keeps the job and
 * drops the markers, and without it the job goes, with the blank line before it, so that the
 * workflow is byte for byte what it was before the job existed.
 */
export function withCloudJob(template: string, cloud: boolean): string {
  return cloud
    ? template.replace(/^ *# \{\{cloud-(?:begin|end)\}\}\n/gm, "")
    : template.replace(/\n *# \{\{cloud-begin\}\}\n[\s\S]*?\n *# \{\{cloud-end\}\}\n/, "");
}

/** The Git working tree that holds `folder`, or null. */
function gitTop(folder: string): string | null {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: folder,
    encoding: "utf8",
    windowsHide: true,
  });
  return result.status === 0 ? resolve(result.stdout.trim()) : null;
}

/**
 * Writes the CI workflow of a project: at the top of its Git working tree when it has one, with
 * the project's path from there. A message when a workflow is already there.
 */
function writeCi(
  service: (typeof CI_SERVICES)[number],
  folder: string,
  context: InitContext,
  written: string[],
  cloud: boolean,
): string | undefined {
  const top = gitTop(folder) ?? folder;
  const project = relative(top, folder).split(sep).join("/") || ".";
  const text = withCloudJob(
    readFileSync(join(TEMPLATE_ROOT, "ci", `${service}.yml`), "utf8"),
    cloud,
  )
    .replaceAll("{{project}}", () => project)
    .replaceAll("{{version}}", () => context.toolVersion);
  const t = messages().init;
  let target: string;
  if (service === "github") {
    target = join(top, ".github", "workflows", "meltemi-diagrams.yml");
    if (existsSync(target)) return t.exists(context.display(target));
  } else {
    target = join(top, ".gitlab-ci.yml");
    if (existsSync(target)) {
      target = join(top, ".gitlab", "meltemi-diagrams.yml");
      if (existsSync(target)) return t.exists(context.display(target));
      context.stdout(t.gitlab);
    }
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text);
  written.push(target);
  return undefined;
}

/** `meltemi-diagrams init`. */
export function initCommand(args: readonly string[], context: InitContext): number {
  const fail = (message: string) => {
    context.stderr(`${context.name} init: ${message}\n`);
    return EXIT_USAGE;
  };
  let options: {
    template?: string;
    name?: string;
    list: boolean;
    ci?: string;
    cloud: boolean;
    help: boolean;
  };
  let paths: string[];
  try {
    const parsed = parseArgs({
      args: [...args],
      options: {
        template: { type: "string" },
        name: { type: "string" },
        list: { type: "boolean", default: false },
        ci: { type: "string" },
        cloud: { type: "boolean", default: false },
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
  const t = messages().init;
  const names = Object.keys(TEMPLATES) as TemplateName[];
  if (options.help) {
    context.stdout(messages().help.init(names.join(", ")));
    return EXIT_OK;
  }
  if (options.list) {
    const width = Math.max(...names.map((n) => n.length));
    for (const name of names) context.stdout(`${name.padEnd(width)}  ${t.templates[name]}\n`);
    return EXIT_OK;
  }
  if (paths.length > 1) return fail(t.oneFolder);
  const template = (options.template ?? "flow") as TemplateName;
  if (!(template in TEMPLATES)) return fail(t.noTemplate(String(options.template), names));
  if (options.ci !== undefined && !(CI_SERVICES as readonly string[]).includes(options.ci)) {
    return fail(t.ci(options.ci, CI_SERVICES));
  }
  // The push job is a part of the workflow: there is nothing for `--cloud` to change without one.
  if (options.cloud && options.ci === undefined) return fail(t.cloudNeedsCi(CI_SERVICES));
  if (options.name !== undefined && options.name.trim() === "") return fail(t.name);
  const folder = resolve(context.cwd, paths[0] ?? ".");
  if (existsSync(folder) && !statSync(folder).isDirectory()) {
    return fail(t.notAFolder(context.display(folder)));
  }
  const written: string[] = [];
  const manifest = join(folder, "project.json");

  if (existsSync(manifest)) {
    // An existing project only gets its CI workflow.
    if (options.ci === undefined || options.template !== undefined || options.name !== undefined) {
      return fail(t.alreadyAProject(context.display(folder)));
    }
  } else {
    const files = templateFiles(template);
    const clash = files.map((f) => join(folder, ...f.split("/"))).find((f) => existsSync(f));
    if (clash) return fail(t.clash(context.display(clash)));
    const name = options.name?.trim() ?? (basename(folder) || "diagrams");
    mkdirSync(folder, { recursive: true });
    writeFileSync(manifest, templateManifest(name, template, context));
    written.push(manifest);
    for (const file of files) {
      const target = join(folder, ...file.split("/"));
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, readFileSync(join(TEMPLATE_ROOT, template, ...file.split("/"))));
      written.push(target);
    }
  }
  if (options.ci !== undefined) {
    const problem = writeCi(
      options.ci as (typeof CI_SERVICES)[number],
      folder,
      context,
      written,
      options.cloud,
    );
    if (problem) return fail(problem);
  }
  for (const path of written) context.stdout(`${t.created(context.display(path))}\n`);
  if (options.cloud) context.stdout(`${t.cloudNote("MELTEMI_TOKEN")}\n`);
  if (written.includes(manifest)) {
    const at = context.display(folder);
    context.stdout(
      [
        "",
        t.next,
        `  ${context.name} validate ${at}`,
        `  ${context.name} preview ${at}`,
        `  ${context.name} build catalog ${at}`,
        "",
      ].join("\n"),
    );
  }
  return EXIT_OK;
}
