/**
 * `mdg push [folder] [--create [--name <n>]] [--project <id>] [--force] [--check] [--strict]`
 * (`cli-cloud`, "Push"): makes a cloud project equal to a folder, in one transaction, and never
 * overwrites what it has not shown.
 *
 * The order of things, each step before any later one can change the cloud:
 *
 * 1. the arguments, the folder and its manifest; the host (a `cloud.host` of the manifest that is
 *    not the resolved host is `cloud.host-mismatch`) and the token (`cloud.not-signed-in`, exit 3);
 * 2. the push set (`push-set.ts`) and the limits of the cloud, refused with the service's own codes
 *    (`doc.too-large`, `quota.binary`, `quota.files`) before a request is made;
 * 3. the validation diagnostics, as `validate` prints them; `--strict` stops here when there are
 *    errors, or files that cannot be sent (`push.strict`);
 * 4. the cloud's files and revision, fetched once, and the comparison of every path; the differing
 *    paths are listed beside the review by id. Nothing differs: nothing to push. `--check` stops
 *    here (exit 1 when something differs);
 * 5. what differs is asked about on a terminal ("Overwrite these changes in the cloud?") and refused
 *    without one (`push.differs`) unless `--force`;
 * 6. the images and fonts that differ are uploaded (skipping the hashes the cloud has), then
 *    `PUT …/files` carries the texts that differ, the deletions and the binaries' hashes with
 *    `ifRevision`. An upload that changes the room advances its revision by one, so the revision
 *    the push carries is the one fetched plus the uploads that were made. `409 revision.mismatch`
 *    sends the command back to step 4, once, with the new state: it is compared and asked about
 *    again, never overwritten.
 *
 * `--create` makes the project first (the folder's texts), records it in `project.json` and then
 * pushes the rest without asking, as the new project holds nothing the folder has not shown.
 */

import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { LANGUAGE_VERSION } from "@meltemi/diagrams-language";
import { MANIFEST_NAME, isCleanPath, readManifest, toProjectPath } from "@meltemi/diagrams-project";
import { createNodeHost } from "@meltemi/diagrams-project/node";
import {
  MAX_PUSH_BYTES,
  sha256Hex,
  type CloudClient,
  type CloudFiles,
  type PushBody,
} from "./cloud-client.js";
import {
  openCloud,
  usage,
  usageError,
  type CloudCommand,
  type CloudContext,
} from "./cloud-context.js";
import { CloudError, EXIT_FAILED, EXIT_OK, EXIT_USAGE, isCloudError } from "./cloud-errors.js";
import { withCloudField } from "./cloud-manifest.js";
import { printablePath } from "./cloud-paths.js";
import { isYes, messages } from "./messages/index.js";
import {
  compareWithCloud,
  limitError,
  planPush,
  readPushSet,
  type Comparison,
  type PushPlan,
  type PushSet,
} from "./push-set.js";
import { reviewLines, reviewTexts } from "./push-review.js";
import { validateFolder } from "./push-validation.js";
import { withDetails } from "./project-errors.js";

/** Something shaped like an id, to check that a manifest can take the `cloud` field before it is made. */
const PLACEHOLDER_PROJECT = "a".repeat(20);

interface PushOptions {
  readonly host: string | undefined;
  readonly create: boolean;
  readonly name: string | undefined;
  readonly project: string | undefined;
  readonly force: boolean;
  readonly check: boolean;
  readonly strict: boolean;
}

export const pushCommand: CloudCommand = async (args, context) => {
  const help = messages().help.push;
  const t = messages().cloud.push;
  let parsed;
  try {
    parsed = parseArgs({
      args: [...args],
      options: {
        host: { type: "string" },
        create: { type: "boolean", default: false },
        name: { type: "string" },
        project: { type: "string" },
        force: { type: "boolean", default: false },
        check: { type: "boolean", default: false },
        strict: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      } as const,
      allowPositionals: true,
      strict: true,
    });
  } catch (error) {
    return usageError(context, error, help);
  }
  const values = parsed.values as PushOptions & { help?: boolean };
  if (values.help) {
    context.stdout(help);
    return EXIT_OK;
  }
  if (parsed.positionals.length > 1) return usage(context, t.oneFolder, help);
  if (values.name !== undefined && !values.create) return usage(context, t.nameNeedsCreate, help);
  if (values.name !== undefined && values.name.trim() === "") {
    return usage(context, t.nameEmpty, help);
  }
  if (values.create && values.project !== undefined) {
    return usage(context, t.createWithProject, help);
  }
  if (values.create && values.check) return usage(context, t.checkWithCreate, help);

  const given = parsed.positionals[0] ?? ".";
  const folder = resolve(context.cwd, given);
  let isFolder: boolean;
  try {
    isFolder = statSync(folder).isDirectory();
  } catch {
    context.stderr(
      `${context.name} ${context.command}: ${messages().common.pathNotFound(given)}\n`,
    );
    return EXIT_USAGE;
  }
  if (!isFolder) {
    context.stderr(
      `${context.name} ${context.command}: ${t.notAFolder(context.display(folder))}\n`,
    );
    return EXIT_USAGE;
  }

  // The manifest names the project and the host it belongs to; the host a token goes to is never its.
  const manifestResult = readManifest(createNodeHost(), toProjectPath(folder), {
    toolVersion: context.toolVersion,
  });
  const manifest = manifestResult.manifest;
  const linked = manifest?.cloud ?? null;
  const { host, client } = openCloud(context, {
    host: values.host,
    manifestHost: linked?.host,
  });

  let project: string | undefined;
  if (values.create) {
    if (linked !== null) {
      throw new CloudError("push.already-linked", "project.json already names a cloud project.", {
        details: { project: linked.project },
      });
    }
  } else {
    project = values.project ?? linked?.project;
    if (project === undefined) {
      throw new CloudError("cloud.no-project", "No cloud project is named.");
    }
    context.used.project = project;
  }

  const set = readPushSet(folder, manifest);
  // `--project` wins over the manifest, but the project.json that goes up carries its `cloud`
  // setting into the project it goes to: left as it is, the other project would be linked to the
  // first one, and the next push from a copy of it would overwrite the wrong project. What is sent
  // names the project it goes to; the file in the folder is not touched.
  if (project !== undefined && linked !== null && linked.project !== project) {
    const sent = set.texts.get(MANIFEST_NAME);
    if (sent !== undefined) {
      try {
        set.texts.set(MANIFEST_NAME, withCloudField(sent, host, project));
      } catch {
        // A manifest that cannot be edited was reported when it was read.
      }
    }
  }
  const refused = limitError(set);
  if (refused) throw refused;

  printProblems(context, set);
  const validation = validateFolder(folder, {
    toolVersion: context.toolVersion,
    display: context.display,
  });
  if (validation.lines.length > 0) {
    for (const line of validation.lines) context.stdout(`${line}\n`);
    context.stdout(
      `${messages().validate.summary(validation.files, validation.errors, validation.warnings)}\n`,
    );
  }
  if (values.strict && (validation.errors > 0 || set.notSent.length > 0)) {
    throw new CloudError("push.strict", "Validation found problems and --strict is given.", {
      details: { errors: validation.errors, unsent: set.notSent.length },
    });
  }

  if (values.create) return createAndPush(context, client, host, set, values);
  return pushToProject(context, client, host, project!, set, values);
};

// ------------------------------------------------------------------------------------ reporting

/** The files that are not sent, and the kinds the cloud does not keep: said before anything is asked. */
function printProblems(context: CloudContext, set: PushSet): void {
  const t = messages().cloud.push;
  for (const item of set.notSent) {
    const reason =
      item.reason === "unreadable"
        ? t.reasons.unreadable(item.detail ?? "?")
        : t.reasons[item.reason];
    context.stdout(`${t.notSent(item.path, reason)}\n`);
  }
  if (set.ignored.length > 0) {
    const examples = set.ignored.slice(0, 5).join(", ");
    context.stdout(
      `${t.ignored(set.ignored.length, set.ignored.length > 5 ? `${examples}, …` : examples)}\n`,
    );
  }
}

/** The copies two people made at once in the cloud, which a push never touches. */
function printCollisions(context: CloudContext, comparison: Comparison): void {
  const t = messages().cloud.push;
  for (const { path } of comparison.left.filter((item) => item.why === "collision")) {
    context.stdout(`${t.collision(printablePath(path))}\n`);
  }
}

/** The paths that differ and the review by id, as they are shown before anything is asked. */
function printComparison(
  context: CloudContext,
  set: PushSet,
  cloud: CloudFiles,
  comparison: Comparison,
): void {
  const t = messages().cloud.push;
  printCollisions(context, comparison);
  context.stdout(`${t.differs(comparison.differences.length)}\n`);
  for (const { path, change } of comparison.differences) {
    const line =
      change === "added"
        ? t.pathAdded(path)
        : change === "deleted"
          ? t.pathDeleted(path)
          : t.pathChanged(path);
    context.stdout(`${line}\n`);
  }
  // Binaries are not in the review: it sees the diagrams of the sources.
  if (!comparison.differences.some((d) => d.kind === "text")) return;
  try {
    const before = new Map(Object.entries(cloud.files).filter(([path]) => isCleanPath(path)));
    const review = reviewTexts(set.folder, before, set.texts, context.toolVersion);
    context.stdout(`${t.review}\n`);
    for (const line of reviewLines(review)) context.stdout(`${line}\n`);
  } catch {
    // The paths that differ are the answer; a review that cannot be made is not a reason to stop.
  }
}

// ------------------------------------------------------------------------------- push to a project

/** The cloud's files and revision; a project that is not there says which one. */
async function load(client: CloudClient, project: string): Promise<CloudFiles> {
  try {
    return await client.files(project);
  } catch (error) {
    throw withDetails(error, { project });
  }
}

async function pushToProject(
  context: CloudContext,
  client: CloudClient,
  host: string,
  project: string,
  set: PushSet,
  options: PushOptions,
): Promise<number> {
  const t = messages().cloud.push;
  let cloud = await load(client, project);
  for (let round = 0; ; round++) {
    const comparison = compareWithCloud(set, cloud);
    if (comparison.differences.length === 0) {
      printCollisions(context, comparison);
      context.stdout(`${t.identical(project)}\n`);
      return EXIT_OK;
    }
    printComparison(context, set, cloud, comparison);
    if (options.check) {
      context.stdout(`${t.checkDiffers(comparison.differences.length)}\n`);
      return EXIT_FAILED;
    }
    if (!options.force) {
      if (context.ask === undefined) {
        throw new CloudError("push.differs", "The cloud project differs from the folder.", {
          details: { count: comparison.differences.length },
        });
      }
      if (!isYes(await context.ask(t.overwrite))) {
        throw new CloudError("push.declined", "Nothing was pushed.");
      }
    }
    try {
      const plan = planPush(set, comparison, cloud);
      const uploaded = await apply(client, project, plan, cloud.revision);
      const deleted = comparison.differences.filter((d) => d.change === "deleted").length;
      context.stdout(
        `${t.pushed(project, comparison.differences.length - deleted, deleted, uploaded)}\n`,
      );
      context.stdout(`${t.open(`${host}/p/${project}`)}\n`);
      return EXIT_OK;
    } catch (error) {
      // Somebody else changed the project since it was read: look again, never overwrite blindly.
      if (!isCloudError(error, "revision.mismatch") || round >= 1)
        throw withDetails(error, { project });
      context.stdout(`${t.retrying}\n`);
      cloud = await load(client, project);
    }
  }
}

/**
 * Puts the plan into the cloud: uploads the images and fonts it needs, then pushes the texts, the
 * hashes and the deletions in one transaction carrying the revision. Answers how many images and
 * fonts were uploaded.
 */
async function apply(
  client: CloudClient,
  project: string,
  plan: PushPlan,
  revision: number,
): Promise<number> {
  const body = (ifRevision: number): PushBody => ({
    files: plan.texts,
    binaries: plan.binaries,
    ifRevision,
  });
  // Refused before the first upload, so that a push that cannot be made changes nothing.
  if (Buffer.byteLength(JSON.stringify(body(revision))) > MAX_PUSH_BYTES) {
    throw new CloudError("doc.too-large", "The push is larger than the service accepts.");
  }

  let uploaded = 0;
  const put = async ({ path, binary }: PushPlan["uploads"][number]): Promise<void> => {
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(readFileSync(binary.file));
    } catch (error) {
      throw new CloudError("push.file-changed", (error as Error).message, { details: { path } });
    }
    // What was compared is what is sent: a file that changed since it was read is not.
    if (sha256Hex(bytes) !== binary.hash) {
      throw new CloudError("push.file-changed", `${path} changed while it was being pushed.`, {
        details: { path },
      });
    }
    // The service's refusal of an upload (`binary.invalid`, `quota.storage`) names no file: this does.
    const stored = await client.putBinary(project, path, bytes).catch((error: unknown) => {
      throw withDetails(error, { path });
    });
    if (stored !== binary.hash) {
      throw new CloudError("push.file-changed", `${path} was stored as another file.`, {
        details: { path },
      });
    }
    uploaded++;
  };

  const skipped: PushPlan["uploads"][number][] = [];
  for (const upload of plan.uploads) {
    // The cloud has these bytes already (under another name, or from before): nothing to upload.
    if (await client.blobExists(project, upload.binary.hash)) skipped.push(upload);
    else await put(upload);
  }
  try {
    // An upload that changes the room advances its revision by one: those are ours.
    await client.pushFiles(project, body(revision + uploaded));
  } catch (error) {
    // A hash the cloud had only in an old version is not one the project can use: upload it after all.
    if (!isCloudError(error, "blob.unknown") || skipped.length === 0) throw error;
    for (const upload of skipped) await put(upload);
    await client.pushFiles(project, body(revision + uploaded));
  }
  return uploaded;
}

// ------------------------------------------------------------------------------------- --create

/**
 * `--create`: makes the project with the folder's texts, records it in `project.json` (making one
 * when the folder has none) and pushes what is left (the images and fonts, and the manifest with
 * its new field) without asking.
 */
async function createAndPush(
  context: CloudContext,
  client: CloudClient,
  host: string,
  set: PushSet,
  options: PushOptions,
): Promise<number> {
  const t = messages().cloud.push;
  const manifestPath = join(set.folder, MANIFEST_NAME);
  let text = set.texts.get(MANIFEST_NAME);
  if (text === undefined && existsSync(manifestPath)) {
    // A project.json that is there but could not be read is never replaced by a new one.
    throw new CloudError("push.manifest-invalid", "project.json cannot be read as UTF-8 text.", {
      details: { reason: "it cannot be read as UTF-8 text" },
    });
  }
  const name = (
    options.name ??
    readManifest(createNodeHost(), toProjectPath(set.folder), {
      toolVersion: context.toolVersion,
    }).manifest?.name ??
    basename(set.folder)
  )
    .trim()
    .slice(0, 100);
  if (text === undefined) {
    text = `${JSON.stringify({ name: name || "diagrams", language: LANGUAGE_VERSION }, null, 2)}\n`;
    set.texts.set(MANIFEST_NAME, text);
  }
  try {
    withCloudField(text, host, PLACEHOLDER_PROJECT);
  } catch (error) {
    throw new CloudError("push.manifest-invalid", (error as Error).message, {
      details: { reason: (error as Error).message },
    });
  }

  const created = await client.createProject({
    name: name || "diagrams",
    files: Object.fromEntries(set.texts),
  });
  context.stdout(`${t.created(created.id, created.name)}\n`);

  const recorded = withCloudField(text, host, created.id);
  try {
    writeFileSync(manifestPath, recorded, "utf8");
  } catch (error) {
    throw new CloudError("push.manifest-not-written", (error as Error).message, {
      details: { project: created.id, host, reason: (error as Error).message },
    });
  }
  set.texts.set(MANIFEST_NAME, recorded);
  context.stdout(`${t.recorded(context.display(manifestPath))}\n`);

  // What the new project lacks is ours to give: no question, nothing there to overwrite.
  const cloud = await load(client, created.id);
  const comparison = compareWithCloud(set, cloud);
  let uploaded = 0;
  if (comparison.differences.length > 0) {
    uploaded = await apply(client, created.id, planPush(set, comparison, cloud), cloud.revision);
  }
  context.stdout(`${t.pushed(created.id, set.texts.size + set.binaries.size, 0, uploaded)}\n`);
  context.stdout(`${t.open(`${host}/p/${created.id}`)}\n`);
  return EXIT_OK;
}
