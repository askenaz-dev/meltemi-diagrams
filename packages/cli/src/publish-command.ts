/**
 * `publish` (`cli-cloud`, "Publish"): the catalog of the folder's project as a web page of the cloud
 * service.
 *
 * The order, and why:
 *
 * 1. The project and the session: the folder's manifest names the cloud project (`cloud.project`,
 *    or `--project`), the host is `--host`, `MELTEMI_HOST` or the default, and `cloud.host-mismatch`
 *    and "not signed in" fail before any request.
 * 2. `--unpublish` ends here: one `DELETE`, nothing is built or pushed.
 * 3. `GET …/publish` first: it is the owner's, so a project the person may not publish (`access.denied`,
 *    `project.not-found`) fails before the catalog is built, and it says whether a handle is chosen.
 * 4. The catalog is built in memory, exactly as `build catalog` builds it (same generator, same
 *    defaults, the `--lang` language), before anything is sent: a catalog with nothing in it, with
 *    errors under `--strict`, or too large for a page, fails with nothing pushed and nothing
 *    published.
 * 5. The handle: the first publication needs one (`--handle`, or asked on a terminal). With
 *    `--handle` the handle is set first (`PATCH /api/account`); the service lets a token do that; a
 *    service that answers `403 request.forbidden` instead makes it `publish.handle-in-page`.
 * 6. The folder is pushed when it differs from the cloud project: the command of `push`, with its
 *    comparison and its question (`--force` answers it, as in CI), so what is published is what the
 *    cloud holds.
 * 7. `PUT …/publish`, and the public address printed on a line of its own.
 */

import { statSync } from "node:fs";
import { basename, resolve } from "node:path";
import { parseArgs } from "node:util";
import { catalogScript } from "@meltemi/diagrams-catalog/node";
import { ProjectSessions, buildCatalog, type CatalogBuild } from "@meltemi/diagrams-editor/node";
import type { Diagnostic } from "@meltemi/diagrams-language";
import { sortDiagnostics } from "@meltemi/diagrams-language";
import { BRAND_NAME } from "@meltemi/diagrams-layout";
import { CLOUD_LIMITS, toProjectPath, type Workspace } from "@meltemi/diagrams-project";
import { formatSize } from "./build-command.js";
import {
  openCloud,
  usage,
  usageError,
  type CloudCommand,
  type CloudContext,
} from "./cloud-context.js";
import { CloudError, EXIT_OK, EXIT_USAGE, isCloudError } from "./cloud-errors.js";
import { messages } from "./messages/index.js";
import { withDetails } from "./project-errors.js";
import { pushCommand } from "./push-command.js";

/** The handle and the page name, as the service accepts them. */
const HANDLE = /^[a-z0-9-]{3,30}$/;
const SLUG = /^[a-z0-9-]{1,60}$/;

/** The most a publish request may weigh as JSON: the service's own cap. */
const REQUEST_BYTES = 24 * 1024 * 1024;

/**
 * The size that makes a page too large for the service, or undefined when it fits: the HTML over
 * 16 MiB of UTF-8, or the request that carries it over 24 MiB (JSON escapes quotes and the like, so
 * a page below the first limit can still be above the second). Checked here so that nothing is sent.
 */
export function oversize(slug: string, html: string): number | undefined {
  const htmlBytes = Buffer.byteLength(html);
  if (htmlBytes > CLOUD_LIMITS.publishBytes) return htmlBytes;
  // A request cannot be smaller than its page: only a large page needs the exact count.
  if (htmlBytes <= REQUEST_BYTES / 6) return undefined;
  const requestBytes = Buffer.byteLength(JSON.stringify({ slug, html }));
  return requestBytes > REQUEST_BYTES ? requestBytes : undefined;
}

/** How many times a handle typed on a terminal may be wrong before the command gives up. */
const HANDLE_ATTEMPTS = 3;

/** A page name made of a project's name: lower-case ASCII letters and digits with single hyphens. */
export function slugOf(text: string): string {
  const slug = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return slug === "" ? "diagrams" : slug;
}

/** What `publish` reads from its arguments. */
interface Options {
  readonly folder: string;
  readonly slug: string | undefined;
  readonly handle: string | undefined;
  readonly unpublish: boolean;
  readonly project: string | undefined;
  readonly host: string | undefined;
  readonly force: boolean;
  readonly strict: boolean;
}

function parse(context: CloudContext, args: readonly string[], help: string): Options | number {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...args],
      options: {
        slug: { type: "string" },
        handle: { type: "string" },
        unpublish: { type: "boolean", default: false },
        project: { type: "string" },
        host: { type: "string" },
        force: { type: "boolean", default: false },
        strict: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      } as const,
      allowPositionals: true,
      strict: true,
    });
  } catch (error) {
    return usageError(context, error, help);
  }
  const values = parsed.values;
  if (values.help) {
    context.stdout(help);
    return EXIT_OK;
  }
  const t = messages();
  if (parsed.positionals.length > 1) return usage(context, t.common.oneProject, help);
  if (values.slug !== undefined && !SLUG.test(values.slug)) {
    return usage(context, t.cloud.publish.slugInvalid(values.slug), help);
  }
  if (values.handle !== undefined && !HANDLE.test(values.handle)) {
    return usage(context, t.cloud.publish.handleOption(values.handle), help);
  }
  if (values.unpublish) {
    for (const [name, given] of [
      ["--handle", values.handle !== undefined],
      ["--force", values.force],
      ["--strict", values.strict],
    ] as const) {
      if (given) return usage(context, t.common.cannotCombine("--unpublish", name), help);
    }
  }
  return {
    folder: parsed.positionals[0] ?? ".",
    slug: values.slug,
    handle: values.handle,
    unpublish: values.unpublish === true,
    project: values.project,
    host: values.host,
    force: values.force === true,
    strict: values.strict === true,
  };
}

// ----------------------------------------------------------------------------------- the build

/** Prints diagnostics as `validate` and `build catalog` print them. */
function printDiagnostics(
  context: CloudContext,
  path: string,
  diagnostics: readonly Diagnostic[],
): void {
  for (const d of diagnostics) {
    context.stdout(
      `${path}:${d.range.start.line}:${d.range.start.column}: ${d.severity} ${d.code} ${d.message}\n`,
    );
    for (const hint of d.hints ?? []) {
      context.stdout(`    ${messages().common.hint}: ${hint}\n`);
    }
  }
}

/** The diagnostics of `project.json`, the plugins and the assets, by file: what `build catalog` shows first. */
function projectDiagnostics(workspace: Workspace): Map<string, readonly Diagnostic[]> {
  const manifest = workspace.manifest();
  const byPath = new Map<string, Diagnostic[]>();
  if (manifest.diagnostics.length > 0) byPath.set(manifest.path, [...manifest.diagnostics]);
  for (const [path, list] of [
    ...workspace.limits(),
    ...workspace.plugins().diagnostics,
    ...workspace.assets().diagnostics,
  ]) {
    byPath.set(path, [...(byPath.get(path) ?? []), ...list]);
  }
  return new Map([...byPath].map(([path, list]) => [path, sortDiagnostics(list)]));
}

/** The catalog of a folder's project, exactly as `build catalog` builds it, and whether it has errors. */
function buildPublication(
  context: CloudContext,
  projects: ProjectSessions,
  workspace: Workspace,
): { build: CatalogBuild; errors: boolean } {
  let errors = false;
  for (const [path, diagnostics] of projectDiagnostics(workspace)) {
    printDiagnostics(context, context.display(path), diagnostics);
    errors ||= diagnostics.some((d) => d.severity === "error");
  }
  const build = buildCatalog(workspace, projects, {
    generator: `${BRAND_NAME} ${context.toolVersion}`,
    script: catalogScript,
  });
  for (const [file, diagnostics] of [...build.diagnostics].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  )) {
    printDiagnostics(context, context.display(file), diagnostics);
    errors ||= diagnostics.some((d) => d.severity === "error");
  }
  const t = messages().build;
  for (const entry of build.skipped) {
    context.stderr(
      `${context.name} ${context.command}: ${t.skipped(`${context.display(entry.path)}#${entry.id}`, entry.reason)}\n`,
    );
  }
  for (const warning of build.warnings) {
    context.stderr(`${context.name} ${context.command}: ${t.warning(warning)}\n`);
  }
  return { build, errors };
}

// ---------------------------------------------------------------------------------- the handle

/**
 * The handle to set before publishing, or undefined when the account's own will do: the one given
 * with `--handle` when it is not the account's already, else (the account has none) the one asked
 * for on a terminal; without a terminal, `handle.required`.
 */
async function handleToSet(
  context: CloudContext,
  current: string | null,
  given: string | undefined,
): Promise<string | undefined> {
  if (given !== undefined) return given === current ? undefined : given;
  if (current !== null) return undefined;
  const required = () =>
    new CloudError("handle.required", "Choose a handle before the first publication.");
  const t = messages().cloud;
  if (context.ask === undefined) throw required();
  for (let attempt = 0; attempt < HANDLE_ATTEMPTS; attempt++) {
    const answer = (await context.ask(t.publish.askHandle)).trim();
    if (answer === "") throw required();
    if (HANDLE.test(answer)) return answer;
    context.stderr(`${context.name} ${context.command}: ${t.errors.handleInvalid(answer)}\n`);
  }
  throw required();
}

// ---------------------------------------------------------------------------------- the command

/**
 * The `publish` command, with the step that pushes the folder given: `push`'s own command, which
 * compares the folder with the cloud project and asks (or is forced), and answers its exit code.
 */
export function createPublishCommand(push: CloudCommand): CloudCommand {
  return async (args, context) => {
    const help = messages().help.publish;
    const options = parse(context, args, help);
    if (typeof options === "number") return options;
    const t = messages().cloud;

    const folder = toProjectPath(resolve(context.cwd, options.folder));
    try {
      if (!statSync(folder).isDirectory()) throw new Error("not a folder");
    } catch {
      context.stderr(
        `${context.name} ${context.command}: ${messages().common.pathNotFound(options.folder)}\n`,
      );
      return EXIT_USAGE;
    }
    const projects = new ProjectSessions({
      toolVersion: context.toolVersion,
      ...(context.locale ? { locale: context.locale } : {}),
    });
    const workspace = projects.forFolder(folder);
    const manifest = workspace.manifest().manifest;

    const project = options.project ?? manifest?.cloud?.project;
    if (project === undefined) {
      throw new CloudError("cloud.no-project", "The folder names no cloud project.");
    }
    const { host, client } = openCloud(context, {
      host: options.host,
      manifestHost: manifest?.cloud?.host,
    });
    context.used.project = project;
    const slug = options.slug ?? slugOf(manifest?.name ?? basename(workspace.root));

    if (options.unpublish) {
      try {
        await client.unpublish(project, slug);
      } catch (error) {
        throw isCloudError(error, "not-found")
          ? new CloudError("publish.not-published", error.message, { details: { slug } })
          : error;
      }
      context.stdout(`${t.publish.unpublished(slug)}\n`);
      return EXIT_OK;
    }

    // The owner's route first: nothing is built for a project the person may not publish.
    const state = await client.publication(project);

    const { build, errors } = buildPublication(context, projects, workspace);
    if (build.data.entries.length === 0) {
      throw new CloudError("publish.empty", "The project has nothing to publish.");
    }
    if (options.strict && (errors || build.skipped.length > 0)) {
      throw new CloudError("publish.errors", "The project has errors.");
    }
    const htmlBytes = Buffer.byteLength(build.html);
    const tooLarge = oversize(slug, build.html);
    if (tooLarge !== undefined) {
      throw new CloudError("publish.too-large", "The catalog is larger than a page may be.", {
        details: { bytes: tooLarge },
      });
    }

    const handle = await handleToSet(context, state.handle, options.handle);
    if (handle !== undefined) {
      try {
        await client.setHandle(handle);
      } catch (error) {
        throw withDetails(
          isCloudError(error, "request.forbidden")
            ? new CloudError("publish.handle-in-page", error.message, { status: error.status })
            : error,
          { handle, current: state.handle },
        );
      }
      context.stdout(`${t.publish.handleSet(handle)}\n`);
    }

    const pushed = await push(
      [
        options.folder,
        "--project",
        project,
        "--host",
        host,
        ...(options.force ? ["--force"] : []),
        ...(options.strict ? ["--strict"] : []),
      ],
      context,
    );
    if (pushed !== EXIT_OK) return pushed;

    let published;
    try {
      published = await client.publish(project, { slug, html: build.html });
    } catch (error) {
      throw withDetails(error, { slug, bytes: htmlBytes });
    }
    const diagrams = build.data.entries.filter((e) => e.kind === "diagram").length;
    const b = messages().build;
    context.stdout(
      `${t.publish.published(
        [
          b.diagrams(diagrams),
          b.stories(build.data.entries.length - diagrams),
          ...(build.data.entities.length > 0 ? [b.entities(build.data.entities.length)] : []),
        ],
        formatSize(htmlBytes),
      )}\n${published.url}\n`,
    );
    return EXIT_OK;
  };
}

/** `publish`, pushing the folder with `push`'s own command. */
export const publishCommand: CloudCommand = createPublishCommand(pushCommand);
