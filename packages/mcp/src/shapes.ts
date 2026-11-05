// The shapes the tools share: their arguments and their answers, as `zod` schemas (the SDK shows
// them to clients as JSON Schema and validates the answers against them), a project's address in
// the app, and base64. Both servers read them: the Worker's endpoint and the command line's local
// server.

import * as z from "zod";

/**
 * What an idempotency key is: 1 to 64 visible ASCII characters. The Worker's `IDEMPOTENCY_KEY`
 * (`packages/cloud/src/idempotency.ts`) is the same pattern, and a test holds the two equal.
 */
export const IDEMPOTENCY_KEY = /^[\x21-\x7e]{1,64}$/;

/** A project's id, as `list_projects` and `create_project` answer it. */
export const projectArg = z
  .string()
  .min(1)
  .max(64)
  .describe("The project's id, as list_projects or create_project answer it.");

/** A file's path from the project's root. */
export const pathArg = z
  .string()
  .min(1)
  .max(1024)
  .describe("A file's path from the project's root, such as `flows/checkout.meltemi`.");

/** An idempotency key: the same key with the same arguments answers the first call again. */
export const idempotencyKeyArg = z
  .string()
  .regex(IDEMPOTENCY_KEY)
  .optional()
  .describe(
    "1 to 64 visible ASCII characters, one per logical change: a retry with the same key and the same arguments answers the first call again for a day, and never changes anything twice.",
  );

/** A role in a project. */
export const roleSchema = z.enum(["owner", "editor", "viewer"]);

/** A project as every answer shows it, with its address in the app. */
export const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  updated_at: z.string(),
  thumbnail: z.string().nullable(),
  role: roleSchema,
  url: z.string().describe("The address that opens the project in the app."),
});

/** A diagnostic as a report lists it. */
export const diagnosticSchema = z.object({
  path: z.string(),
  code: z.string(),
  severity: z.enum(["error", "warning", "info"]),
  message: z.string(),
  line: z.number(),
  column: z.number(),
});

/** A diagnostic of a report. */
export type ToolDiagnostic = z.infer<typeof diagnosticSchema>;

/** The address that opens a project in the app (the app takes a project, not a file, in its address). */
export function appUrl(origin: string, projectId: string): string {
  return `${origin}/?project=${encodeURIComponent(projectId)}`;
}

/** The project's link: whoever holds it gets what the link level gives. */
export function projectLink(origin: string, projectId: string): string {
  return `${origin}/p/${encodeURIComponent(projectId)}`;
}

/** The most bytes of images and fonts a preview or a catalog is given: what one RPC carries well. */
export const MAX_DRAWING_BINARY_BYTES = 24 * 1024 * 1024;

/** The fonts of a project, under `assets/fonts/`. */
const PROJECT_FONT = /(^|\/)assets\/fonts\/[^/]+$/i;

/**
 * The images and fonts a drawing may use, of a project's binaries (path to hash): every font under
 * `assets/fonts/`, and every other binary whose file name one of the texts mentions (an image is
 * written by its path in a `.meltemi` file). Both servers choose them this way, so a drawing has
 * the same files on either.
 */
export function drawingBinaryPaths(
  files: Readonly<Record<string, string>>,
  binaries: Readonly<Record<string, string>>,
): [path: string, hash: string][] {
  const texts = Object.values(files).join("\n");
  return Object.entries(binaries).filter(([path]) => {
    if (PROJECT_FONT.test(path)) return true;
    const name = path.slice(path.lastIndexOf("/") + 1);
    return name !== "" && texts.includes(name);
  });
}

/** Bytes as base64: the platform's own encoder when it has one. */
export function toBase64(bytes: Uint8Array): string {
  const native = (bytes as Uint8Array & { toBase64?: () => string }).toBase64;
  if (typeof native === "function") return native.call(bytes);
  let binary = "";
  for (let at = 0; at < bytes.length; at += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  }
  return btoa(binary);
}

/** Base64 as bytes, or undefined when the text is not base64. */
export function fromBase64(text: string): Uint8Array | undefined {
  const clean = text.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || clean.length % 4 !== 0) return undefined;
  const native = (Uint8Array as unknown as { fromBase64?: (text: string) => Uint8Array })
    .fromBase64;
  try {
    if (typeof native === "function") return native(clean);
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return undefined;
  }
}
