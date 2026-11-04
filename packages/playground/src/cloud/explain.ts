// What the service and the room refuse, in the page's words. One table of codes serves both: the
// service answers `{ code, message }` with a status, the room says `{ code }` in a kind 4 message,
// and the codes are the same (`quota.projects`, `doc.too-large`, `path.invalid`, ...).

import { CLOUD_LIMITS } from "@meltemi/diagrams-project";
import type { en } from "../messages/en.js";
import type { ApiFailure } from "./tokens.js";

/** The words of the cloud projects in a language. */
export type CloudWords = (typeof en)["cloud"];

const MEBIBYTE = 1024 * 1024;

/** Characters one text file may hold, as the words say it: "2 Mi". */
const TEXT_LIMIT = `${CLOUD_LIMITS.textCharacters / MEBIBYTE} Mi`;

/**
 * The sentence for a code the service or the room uses, naming the limit when it is one; undefined
 * for a code the page has no words for.
 */
export function codeText(code: string, words: CloudWords["errors"]): string | undefined {
  switch (code) {
    case "auth.required":
      return words.signedOut;
    case "project.not-found":
      return words.notFound;
    case "version.not-found":
      return words.versionNotFound;
    case "quota.projects":
      return words.quotaProjects(CLOUD_LIMITS.projects);
    case "quota.storage":
      return words.quotaStorage(CLOUD_LIMITS.storageBytes / MEBIBYTE);
    case "quota.files":
      return words.quotaFiles(CLOUD_LIMITS.files);
    case "quota.binary":
      return words.quotaBinary(CLOUD_LIMITS.binaryBytes / MEBIBYTE);
    case "quota.versions":
      return words.quotaVersions(CLOUD_LIMITS.versions);
    case "doc.too-large":
      return words.docTooLarge(CLOUD_LIMITS.documentBytes / MEBIBYTE, TEXT_LIMIT);
    case "message.too-large":
      return words.messageTooLarge(CLOUD_LIMITS.message / 1024);
    case "path.invalid":
      return words.pathInvalid;
    case "blob.unknown":
      return words.blobUnknown;
    case "doc.invalid":
      return words.docInvalid;
    case "binary.invalid":
      return words.binaryInvalid;
    case "versions.rate":
      return words.versionsRate;
    case "thumbnail.rate":
      return words.thumbnailRate;
    case "access.denied":
      return words.accessDenied;
    case "room.full":
      return words.roomFull(CLOUD_LIMITS.clients);
    case "session.ended":
      return words.sessionEnded;
    case "connections.limit":
      return words.connectionsLimit;
    default:
      return undefined;
  }
}

/**
 * A failed call in words: the codes the page knows, a signed-out page and a missing project in the
 * page's language; any other refusal shows the service's message with its code, or the status.
 */
export function explainFailure(failure: ApiFailure, words: CloudWords["errors"]): string {
  if (failure.kind === "unreachable") return words.unreachable;
  if (failure.kind === "unexpected") return words.unexpected;
  const known = failure.code === undefined ? undefined : codeText(failure.code, words);
  if (known !== undefined) return known;
  if (failure.status === 401) return words.signedOut;
  if (failure.status === 404) return words.notFound;
  if (failure.message !== undefined && failure.code !== undefined) {
    return words.failed(failure.message, failure.code);
  }
  return words.failedStatus(failure.status);
}

/** What the room refused (a kind 4 code), and that the last change went with it. */
export function explainRefusal(code: string, words: CloudWords): string {
  return words.refusal.undone(codeText(code, words.errors) ?? words.errors.other(code));
}
