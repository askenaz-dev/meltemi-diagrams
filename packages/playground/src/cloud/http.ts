// What the page's calls to the cloud service have in common. The page works without a service, so a
// call that fails is an answer like any other: it never throws and never writes to the console.

/** The part of `fetch` the page uses: the global `fetch` fits, and so does a fake in a test. */
export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/** How long a call to the service may take before the page gives up on it. */
export const REQUEST_TIMEOUT_MS = 15_000;

/** What the service answered: the status and the body as text, whatever the body is. */
export interface Answer {
  readonly status: number;
  readonly text: string;
}

/**
 * Sends a request to the page's own origin with the person's cookie and reads the whole answer as
 * text. The type of the answer is never trusted (a static server calls an extensionless file
 * `application/octet-stream`; a proxy may answer HTML): callers parse the text themselves. Gives
 * undefined when the service cannot be reached, answers too slowly or the answer cannot be read.
 */
export async function send(
  fetchFn: Fetch,
  url: string,
  init: RequestInit = {},
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<Answer | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(url, {
      ...init,
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    });
    return { status: response.status, text: await response.text() };
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/** A JSON object, or undefined for anything else: other JSON, text that is not JSON, nothing. */
export function parseObject(text: string): Record<string, unknown> | undefined {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  return isObject(value) ? value : undefined;
}

/** Whether a value is a JSON object (not null, not an array). */
export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** An address on the page's folder: the page is at the root of its site, and so is the API. */
export function inPage(page: string, path: string): string {
  return new URL(path, page).href;
}
