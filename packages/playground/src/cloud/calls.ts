// What the page's calls to the sharing and publishing routes have in common: sending one, reading
// what comes back as a typed value, and every way it can go wrong as a failure (never a throw). The
// tokens and the projects have the same shape (`tokens.ts`, `client.ts`); this is the third copy of
// a dozen lines, kept apart so that those files stay as the other changes left them.

import { parseObject, send, type Answer, type Fetch } from "./http.js";
import type { ApiFailure, Outcome } from "./tokens.js";

/** What a call accepts from a successful answer: the value, or undefined when it cannot be read. */
export type Reader<T> = (answer: Answer) => { value: T } | undefined;

/** The service's `{ code, message }` as a failure (a body that is not one gives the status only). */
export function refusal(answer: Answer): ApiFailure {
  const body = parseObject(answer.text);
  const code = body?.["code"];
  const message = body?.["message"];
  return {
    kind: "refused",
    status: answer.status,
    ...(typeof code === "string" && code !== "" ? { code: code.slice(0, 80) } : {}),
    ...(typeof message === "string" && message !== "" ? { message: message.slice(0, 300) } : {}),
  };
}

/**
 * Sends a call and reads the answer: a 2xx the reader accepts is `{ ok: true }`; a 2xx it cannot
 * read is `unexpected`; any other status is the service's refusal; no answer at all is `unreachable`.
 */
export async function call<T>(
  fetchFn: Fetch,
  url: string,
  init: RequestInit,
  reader: Reader<T>,
  timeoutMs?: number,
): Promise<Outcome<T>> {
  const answer = await send(fetchFn, url, init, timeoutMs);
  if (!answer) return { ok: false, failure: { kind: "unreachable", status: 0 } };
  if (answer.status < 200 || answer.status > 299) return { ok: false, failure: refusal(answer) };
  const read = reader(answer);
  return read
    ? { ok: true, value: read.value }
    : { ok: false, failure: { kind: "unexpected", status: answer.status } };
}

/** For an answer with nothing to read (`204`). */
export const nothing: Reader<null> = () => ({ value: null });

/** A time as an ISO string: the service writes one; a number is read as epoch milliseconds. */
export function timeOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }
  return "";
}

/** A path segment of an address: the part of a person or a page named in the route. */
export const segment = encodeURIComponent;
