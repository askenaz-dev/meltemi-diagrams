import { CLOUD_LIMITS } from "@meltemi/diagrams-project";
import type { Bytes } from "./crypto.js";
import { fail } from "./errors.js";

/** A JSON answer; API answers are never cached. */
export function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

/** A redirect with no body; `Response.redirect` has immutable headers in some runtimes. */
export function redirect(location: string, status = 302): Response {
  return new Response(null, {
    status,
    headers: { Location: location, "Cache-Control": "no-store" },
  });
}

/**
 * What the Worker adds to the page's own files (the assets binding's answers): no other site may
 * frame the page, and a file is what its type says. The page's Content-Security-Policy is a `meta`
 * tag, which cannot say `frame-ancestors`, so without this header any site could frame a signed-in
 * page and trick a person into pressing Revoke, Create or Sign out. A copy is returned because the
 * headers of the binding's answer are immutable; its status, body and other headers are untouched.
 */
export function pageResponse(asset: Response): Response {
  const response = new Response(asset.body, asset);
  response.headers.set("Content-Security-Policy", "frame-ancestors 'self'");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

/** The `Origin` header's origin, or undefined when it is absent or `null`. */
export function originOf(request: Request): string | undefined {
  const origin = request.headers.get("Origin");
  if (!origin || origin === "null") return undefined;
  try {
    return new URL(origin).origin;
  } catch {
    return undefined;
  }
}

/**
 * The body of a request as bytes, without ever holding more than `maxBytes` of it: a request that
 * declares more, or sends more, gives `undefined` and the rest of its stream is not read. The
 * limit is in bytes, not characters. Every route that reads a body reads it through this, so no
 * caller (a signed-out one least of all) can make the Worker buffer what it did not ask for.
 */
export async function readCappedBytes(
  request: Request,
  maxBytes: number,
): Promise<Bytes | undefined> {
  const declared = request.headers.get("Content-Length");
  if (declared !== null && /^\d+$/.test(declared) && Number(declared) > maxBytes) return undefined;

  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const result = await reader.read();
    if (result.done) break;
    size += result.value.byteLength;
    if (size > maxBytes) {
      void reader.cancel().catch(() => {});
      return undefined;
    }
    chunks.push(result.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** The most a JSON request of the page may weigh: a token's name and a little more. */
export const MAX_JSON_BYTES = 8 * 1024;

/**
 * The most a push (`PUT /api/projects/:id/files`) may weigh: a whole document of the largest size
 * a project may hold, and a megabyte for the JSON around it. A body over it is `413 doc.too-large`.
 */
export const MAX_PUSH_BYTES = CLOUD_LIMITS.documentBytes + 1024 * 1024;

/** The JSON object a request carries, or a `400 request.invalid` (never an exception). */
export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  const bytes = await readCappedBytes(request, MAX_JSON_BYTES);
  if (bytes === undefined) throw fail("request.invalid", "The request body is too long.");
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw fail("request.invalid");
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw fail("request.invalid");
  }
  return value as Record<string, unknown>;
}

/** Methods that do not change state: the `Origin` rule does not apply to them. */
export function isSafeMethod(method: string): boolean {
  return method === "GET" || method === "HEAD" || method === "OPTIONS";
}
