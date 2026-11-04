/**
 * `mdg pull [<id>] [folder] [--version <n>] [--force]` (`cli-cloud`, "Pull"): writes a cloud
 * project's files into a folder, and never writes anything it has not checked first.
 *
 * Every path the cloud answers is checked before the first byte is written (`cloud-paths.ts`): it
 * must be in the canonical form the cloud keeps (`isCleanPath`, so no `..`, no absolute path, no
 * backslash, nothing hidden such as `.git/hooks/post-checkout`), a name Windows could keep, not
 * differ from another path only in letter case, and resolve inside the folder; and it must not go
 * through a link in the folder (a link is never followed out of it). One that fails refuses the
 * whole pull with `pull.unsafe-path` naming it, and nothing is written, not even the folder.
 *
 * Then, per file: absent in the folder, it is written (images and fonts are fetched by hash and
 * checked against it); identical, it is left alone; existing and different, it is listed and kept
 * unless `--force`; a folder where a file belongs is kept too. Files only in the folder stay. The
 * losers of a name collision (`<path>~<id>`) are skipped with a note. `project.json` gains
 * `cloud` when it has none, through `setJsonObjectField`, and nothing else of it changes. The exit
 * code is 1 when a file was kept.
 */

import { randomBytes } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  CLOUD_LIMITS,
  CLOUD_PROJECT_ID,
  MANIFEST_NAME,
  readManifest,
  toProjectPath,
} from "@meltemi/diagrams-project";
import { createNodeHost } from "@meltemi/diagrams-project/node";
import { sha256Hex, type CloudClient } from "./cloud-client.js";
import {
  openCloud,
  usage,
  usageError,
  type CloudCommand,
  type CloudContext,
} from "./cloud-context.js";
import { CloudError, EXIT_FAILED, EXIT_OK } from "./cloud-errors.js";
import { withCloudField } from "./cloud-manifest.js";
import {
  collisionLosers,
  insideFolder,
  pathProblem,
  printablePath,
  setProblems,
} from "./cloud-paths.js";
import { messages } from "./messages/index.js";
import { withDetails } from "./project-errors.js";

/** What lies where a cloud path would be written. */
type Slot =
  | { readonly state: "free" }
  | { readonly state: "file"; readonly file: string; readonly size: number }
  /** A link is in the way (the file itself, or a folder on the way to it): never written through. */
  | { readonly state: "link" }
  /** A folder where the file belongs, or a file where a folder is needed. */
  | { readonly state: "blocked" };

/** Looks at the folder's tree for a path, one name at a time, never following a link. */
function inspect(root: string, path: string): Slot {
  const names = path.split("/");
  let current = root;
  for (let i = 0; i < names.length; i++) {
    current = join(current, names[i]!);
    let stats;
    try {
      stats = lstatSync(current);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      return code === "ENOENT" || code === "ENOTDIR" ? { state: "free" } : { state: "blocked" };
    }
    if (stats.isSymbolicLink()) return { state: "link" };
    if (i < names.length - 1) {
      if (!stats.isDirectory()) return { state: "blocked" };
    } else if (stats.isFile()) {
      return { state: "file", file: current, size: stats.size };
    } else {
      return { state: "blocked" };
    }
  }
  return { state: "free" };
}

/** Writes a file through a temporary file in its folder and a rename, so a link there is replaced, not followed. */
function writeFile(target: string, data: string | Uint8Array): void {
  mkdirSync(dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    writeFileSync(temporary, data, { flag: "wx" });
    renameSync(temporary, target);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}

interface Entry {
  readonly path: string;
  readonly target: string;
  readonly kind: "text" | "binary";
  /** The cloud's text, or the hash of the image or font. */
  readonly content: string;
  readonly action: "write" | "same" | "keep" | "blocked";
}

/** Whether the file in the folder holds what the cloud holds. */
function sameContent(slot: Extract<Slot, { state: "file" }>, kind: Entry["kind"], content: string) {
  try {
    if (kind === "binary") {
      if (slot.size > CLOUD_LIMITS.binaryBytes) return false;
      return sha256Hex(readFileSync(slot.file)) === content;
    }
    // A text is content, byte for byte: the line endings and a byte order mark included.
    return (
      slot.size === Buffer.byteLength(content) &&
      readFileSync(slot.file).equals(Buffer.from(content, "utf8"))
    );
  } catch {
    // A file that cannot be read cannot be said to match: it is kept, or fails to be written.
    return false;
  }
}

interface PullOptions {
  readonly host: string | undefined;
  readonly version: string | undefined;
  readonly force: boolean;
}

export const pullCommand: CloudCommand = async (args, context) => {
  const help = messages().help.pull;
  const t = messages().cloud.pull;
  let parsed;
  try {
    parsed = parseArgs({
      args: [...args],
      options: {
        host: { type: "string" },
        version: { type: "string" },
        force: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      } as const,
      allowPositionals: true,
      strict: true,
    });
  } catch (error) {
    return usageError(context, error, help);
  }
  const values = parsed.values as PullOptions & { help?: boolean };
  if (values.help) {
    context.stdout(help);
    return EXIT_OK;
  }
  if (parsed.positionals.length > 2) return usage(context, t.tooMany, help);
  let version: number | undefined;
  if (values.version !== undefined) {
    if (!/^[0-9]+$/.test(values.version) || Number(values.version) < 1) {
      return usage(context, t.version(values.version), help);
    }
    version = Number(values.version);
  }
  // One argument is the id when it has the shape of one, else the folder.
  let id: string | undefined;
  let given: string | undefined;
  if (parsed.positionals.length === 2) [id, given] = parsed.positionals as [string, string];
  else if (parsed.positionals[0] !== undefined) {
    if (CLOUD_PROJECT_ID.test(parsed.positionals[0])) id = parsed.positionals[0];
    else given = parsed.positionals[0];
  }

  const folder = resolve(context.cwd, given ?? ".");
  if (existsSync(folder) && !statSync(folder).isDirectory()) {
    throw new CloudError("pull.not-a-folder", `${folder} exists and is not a folder.`, {
      details: { path: context.display(folder) },
    });
  }
  const manifest = readManifest(createNodeHost(), toProjectPath(folder), {
    toolVersion: context.toolVersion,
  }).manifest;
  const linked = manifest?.cloud ?? null;
  const { host, client } = openCloud(context, { host: values.host, manifestHost: linked?.host });
  const project = id ?? linked?.project;
  if (project === undefined) {
    throw new CloudError("pull.no-project", "No cloud project is named.");
  }
  context.used.project = project;
  if (id !== undefined && linked !== null && linked.project !== id) {
    throw new CloudError("pull.other-project", "The folder is another cloud project's.", {
      details: { project: id, linked: linked.project },
    });
  }

  const answer = await read(client, project, version);
  const everything = [...Object.keys(answer.files), ...Object.keys(answer.binaries)];
  const losers = collisionLosers(everything, answer.collisions);
  const entries = plan(
    folder,
    answer,
    everything.filter((path) => !losers.has(path)),
    values.force,
  );

  // Everything is checked; from here on the folder is written.
  const lines: string[] = [];
  let written = 0;
  let identical = 0;
  const kept: string[] = [];
  for (const entry of entries) {
    if (entry.action === "same") {
      identical++;
    } else if (entry.action === "write") {
      try {
        const data =
          entry.kind === "text" ? entry.content : await client.blob(project, entry.content);
        writeFile(entry.target, data);
      } catch (error) {
        if (error instanceof CloudError) throw withDetails(error, { project });
        throw new CloudError("pull.write", (error as Error).message, {
          details: { path: entry.path, reason: (error as Error).message },
        });
      }
      written++;
      lines.push(t.wrote(entry.path));
    } else {
      kept.push(entry.action === "blocked" ? t.inTheWay(entry.path) : t.kept(entry.path));
    }
  }
  for (const path of [...losers].filter((p) => everything.includes(p)).sort()) {
    lines.push(t.loser(printablePath(path)));
  }
  for (const line of lines) context.stdout(`${line}\n`);
  for (const line of kept) context.stdout(`${line}\n`);
  if (kept.length > 0 && !values.force) context.stdout(`${t.keptHint}\n`);

  const failure = recordProject(context, folder, host, project);
  context.stdout(
    `${t.pulled(project, version ?? null, context.display(folder), written, identical, kept.length)}\n`,
  );
  if (failure !== undefined) throw failure;
  return kept.length > 0 ? EXIT_FAILED : EXIT_OK;
};

/** The project's files, or a version's, as the service answers them. */
async function read(client: CloudClient, project: string, version: number | undefined) {
  try {
    if (version === undefined) return await client.files(project);
    return {
      ...(await client.readVersion(project, version)),
      collisions: [] as readonly unknown[],
    };
  } catch (error) {
    throw withDetails(error, { project, ...(version === undefined ? {} : { version }) });
  }
}

/**
 * What to do with each of the cloud's paths in a folder, after every one has been checked. Throws
 * `pull.unsafe-path` (nothing written) for the first path that is not safe.
 */
function plan(
  folder: string,
  answer: { files: Readonly<Record<string, string>>; binaries: Readonly<Record<string, string>> },
  paths: readonly string[],
  force: boolean,
): Entry[] {
  const root = existsSync(folder) ? realpathSync(folder) : folder;
  const unsafe: string[] = [];
  const sorted = [...paths].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const named = sorted.filter((path) => pathProblem(path) === undefined);
  const together = setProblems(named);
  const entries: Entry[] = [];
  for (const path of sorted) {
    const target = pathProblem(path) === undefined ? insideFolder(root, path) : undefined;
    if (target === undefined || together.has(path)) {
      unsafe.push(path);
      continue;
    }
    const text = Object.hasOwn(answer.files, path);
    const kind = text ? "text" : "binary";
    const content = text ? answer.files[path]! : answer.binaries[path]!;
    const slot = inspect(root, path);
    if (slot.state === "link") unsafe.push(path);
    else if (slot.state === "blocked")
      entries.push({ path, target, kind, content, action: "blocked" });
    else if (slot.state === "free") entries.push({ path, target, kind, content, action: "write" });
    else if (sameContent(slot, kind, content)) {
      entries.push({ path, target, kind, content, action: "same" });
    } else entries.push({ path, target, kind, content, action: force ? "write" : "keep" });
  }
  if (unsafe.length > 0) {
    // The path is the cloud's to name and the terminal is the person's: it is printed escaped.
    const shown = printablePath(unsafe[0]!);
    throw new CloudError(
      "pull.unsafe-path",
      `The cloud project holds ${shown}, which is not a safe path inside the folder.`,
      { details: { path: shown } },
    );
  }
  return entries;
}

/**
 * Adds `cloud` to the folder's `project.json` when it has none (or one that is not valid), through
 * `setJsonObjectField`: the rest of the file is untouched, byte for byte. Answers the failure, when
 * there is one, so that the summary is printed first.
 */
function recordProject(
  context: CloudContext,
  folder: string,
  host: string,
  project: string,
): CloudError | undefined {
  const t = messages().cloud.pull;
  const file = join(folder, MANIFEST_NAME);
  if (!existsSync(file)) {
    context.stdout(`${t.noManifest}\n`);
    return undefined;
  }
  const current = readManifest(createNodeHost(), toProjectPath(folder), {
    toolVersion: context.toolVersion,
  }).manifest;
  // A project.json pulled from the cloud may name ANOTHER project: a copy of a project (the page's
  // Duplicate) keeps its files verbatim. The folder belongs to the project it was pulled from, so
  // the setting is rewritten, or the next push would overwrite the project it names.
  if (current?.cloud && current.cloud.project === project && current.cloud.host === host) {
    return undefined;
  }
  // A link is never followed (the files of a pull are not written through one either): the setting
  // is not written into whatever a link points at.
  if (lstatSync(file).isSymbolicLink()) {
    return new CloudError("pull.manifest-not-updated", "project.json is a link.", {
      details: { reason: "project.json is a link, and a pull never writes through one" },
    });
  }
  try {
    const text = readFileSync(file, "utf8");
    const edited = withCloudField(text, host, project);
    if (edited !== text) writeFileSync(file, edited, "utf8");
    context.stdout(`${t.recorded(context.display(file))}\n`);
    return undefined;
  } catch (error) {
    return new CloudError("pull.manifest-not-updated", (error as Error).message, {
      details: { reason: (error as Error).message },
    });
  }
}
