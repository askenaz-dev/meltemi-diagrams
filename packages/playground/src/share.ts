import { PROJECT_LIMITS } from "@meltemi/diagrams-project";
import { cleanPath, isTextPath } from "./files.js";
import { messages } from "./messages/index.js";
import { ZipError, deflateRaw, inflateRaw } from "./zip.js";

/** A project as a link carries it: its text files and the file to open. */
export interface SharedProject {
  readonly open: string;
  readonly files: Readonly<Record<string, string>>;
}

export const SHARE_LIMITS = {
  /** The JSON of a link's project once decompressed. */
  decompressed: 4 * 1024 * 1024,
  /** Links longer than this may not survive chat programs and mail. */
  warn: 32 * 1024,
} as const;

/** The fragment key of a shared project. */
export const SHARE_KEY = "p";

export class ShareError extends Error {}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(text: string): Uint8Array {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** The fragment value of a project: its JSON, raw-deflated and in base64url. */
export async function encodeShare(project: SharedProject): Promise<string> {
  const json = JSON.stringify({ v: 1, open: project.open, files: project.files });
  return base64url(await deflateRaw(encoder.encode(json)));
}

/** The project of a fragment value, checked; a `ShareError` says why it cannot be read. */
export async function decodeShare(value: string): Promise<SharedProject> {
  const m = messages().share;
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new ShareError(m.damaged);
  let json: string;
  try {
    json = decoder.decode(await inflateRaw(fromBase64url(value), SHARE_LIMITS.decompressed));
  } catch (error) {
    throw new ShareError(error instanceof ZipError ? m.tooLarge : m.damaged);
  }
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new ShareError(m.damaged);
  }
  const record = data as { v?: unknown; open?: unknown; files?: unknown };
  if (record.v !== 1 || typeof record.files !== "object" || record.files === null) {
    throw new ShareError(m.otherVersion);
  }
  const entries = Object.entries(record.files as Record<string, unknown>);
  if (entries.length > PROJECT_LIMITS.files) {
    throw new ShareError(m.tooMany(entries.length, PROJECT_LIMITS.files));
  }
  const files: Record<string, string> = {};
  for (const [path, text] of entries) {
    const clean = cleanPath(path);
    if (!clean || !isTextPath(clean) || typeof text !== "string") {
      throw new ShareError(m.unopenable(path.slice(0, 80)));
    }
    files[clean] = text;
  }
  const open = typeof record.open === "string" && record.open in files ? record.open : "";
  return { open, files };
}

/** The value of the shared project in a URL's fragment, if it has one. */
export function sharedValue(hash: string): string | undefined {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  return params.get(SHARE_KEY) ?? undefined;
}

/** The link of a project: the page's address with the project in the fragment. */
export function shareLink(page: string, value: string): string {
  return `${page.replace(/#.*$/, "")}#${SHARE_KEY}=${value}`;
}
