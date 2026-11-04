/**
 * How the failures of `push` and `pull` read in the interface language (`cli-cloud`): by stable
 * code, with the facts the failure carries in its `details` (a path, a count, a project id).
 * `describeCloudError` (`cloud-context.ts`) asks here for every code it has no sentence of its own
 * for and falls back to the failure's English message when this does not know the code either.
 *
 * Besides the commands' own codes (`push.*`, `pull.*`) these are the service's codes as a push or a
 * pull meets them (`revision.mismatch`, `quota.files`, `quota.binary`, `doc.too-large`, ...). The
 * codes that `cloud-context.ts` has sentences for (`cloud.no-project`, `pull.unsafe-path`,
 * `project.not-found`, `version.not-found`, `access.denied`) are not repeated here.
 */

import { CloudError } from "./cloud-errors.js";
import { messages } from "./messages/index.js";

/** A detail as text: a string or a number, else `fallback`. */
function text(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  return typeof value === "number" ? String(value) : fallback;
}

/** A detail as a count. */
function whole(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

/** The sentence of a failure of `push`, `pull` or the service as they meet it; undefined for any other code. */
export function describeProjectError(error: CloudError): string | undefined {
  const t = messages().cloud.projectErrors;
  const d = error.details;
  const path = text(d["path"]);
  switch (error.code) {
    case "revision.mismatch":
      return t.revisionMismatch;
    case "quota.files":
      return t.quotaFiles;
    case "quota.binary":
      return t.quotaBinary(path);
    case "quota.storage":
      return t.quotaStorage;
    case "quota.projects":
      return t.quotaProjects;
    case "doc.too-large":
      return t.docTooLarge(path);
    case "path.invalid":
      return t.pathInvalid(path);
    case "binary.invalid":
      return t.binaryInvalid(path);
    case "push.differs":
      return t.pushDiffers(whole(d["count"]));
    case "push.declined":
      return t.pushDeclined;
    case "push.already-linked":
      return t.pushLinked(text(d["project"], "?"));
    case "push.strict":
      return t.pushStrict(whole(d["errors"]), whole(d["unsent"]));
    case "push.manifest-invalid":
      return t.pushManifestInvalid(text(d["reason"], error.message));
    case "push.manifest-not-written":
      return t.pushManifestNotWritten(
        text(d["project"], "?"),
        text(d["host"], "?"),
        text(d["reason"], error.message),
      );
    case "push.file-changed":
      return t.pushFileChanged(path);
    case "pull.no-project":
      return t.pullNoProject;
    case "pull.other-project":
      return t.pullOtherProject(text(d["project"], "?"), text(d["linked"], "?"));
    case "pull.not-a-folder":
      return t.pullNotAFolder(path);
    case "pull.manifest-not-updated":
      return t.pullManifestNotUpdated(text(d["reason"], error.message));
    case "pull.write":
      return t.pullWrite(path, text(d["reason"], error.message));
    default:
      return undefined;
  }
}

/** The same failure with more facts in its `details` (the project or version it was about). */
export function withDetails(error: unknown, details: Readonly<Record<string, unknown>>): unknown {
  if (!(error instanceof CloudError)) return error;
  return new CloudError(error.code, error.message, {
    status: error.status,
    details: { ...error.details, ...details },
    exitCode: error.exitCode,
    ...(error.retryAfter === undefined ? {} : { retryAfter: error.retryAfter }),
  });
}
