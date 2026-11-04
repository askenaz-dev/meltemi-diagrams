// The page's side of the API tokens: the calls (`GET`, `POST` and `DELETE /api/tokens`), the
// shapes it accepts back, the rules for a token's name and the way a refusal is put in words. No
// DOM and no globals: a fake `fetch` drives all of it in a test.

import type { en } from "../messages/en.js";
import { inPage, isObject, parseObject, send, type Answer, type Fetch } from "./http.js";

/** The most tokens an account may hold: the service's `MAX_TOKENS`. */
export const TOKEN_LIMIT = 20;

/** The longest name a token may have, in characters: the service's limit. */
export const NAME_MAX = 60;

/** A token as the list shows it. The token itself is shown once, when it is created, and never again. */
export interface ApiToken {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  /** Null while the token has never been used. */
  readonly lastUsedAt: string | null;
}

/** The answer to a creation: the one time the token is in clear. */
export interface NewToken {
  readonly id: string;
  readonly name: string;
  readonly token: string;
}

/** Why a call did not give what it was asked for. */
export interface ApiFailure {
  /** The service could not be reached, refused the call, or answered something unreadable. */
  readonly kind: "unreachable" | "refused" | "unexpected";
  /** The HTTP status; 0 when there was no answer. */
  readonly status: number;
  /** The stable code of the service's `{ code, message }`, when it sent one. */
  readonly code?: string;
  /** The service's message (in English), when it sent one. */
  readonly message?: string;
}

export type Outcome<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly failure: ApiFailure };

/** The calls. None throws: a failure is an `Outcome` like any other. */
export interface TokenApi {
  list(): Promise<Outcome<ApiToken[]>>;
  create(name: string): Promise<Outcome<NewToken>>;
  revoke(id: string): Promise<Outcome<null>>;
}

/** What a call accepts from a successful answer: the value, or undefined when it cannot be read. */
export type Reader<T> = (answer: Answer) => { value: T } | undefined;

function refusal(answer: Answer): ApiFailure {
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

/** One call to the service: an `Outcome`, never an exception. The account panel shares it. */
export async function call<T>(
  fetchFn: Fetch,
  url: string,
  init: RequestInit,
  reader: Reader<T>,
): Promise<Outcome<T>> {
  const answer = await send(fetchFn, url, init);
  if (!answer) return { ok: false, failure: { kind: "unreachable", status: 0 } };
  if (answer.status < 200 || answer.status > 299) return { ok: false, failure: refusal(answer) };
  const read = reader(answer);
  return read
    ? { ok: true, value: read.value }
    : { ok: false, failure: { kind: "unexpected", status: answer.status } };
}

function tokenOf(value: unknown): ApiToken | undefined {
  if (!isObject(value) || typeof value["id"] !== "string" || typeof value["name"] !== "string") {
    return undefined;
  }
  const created = value["created_at"];
  const used = value["last_used_at"];
  return {
    id: value["id"],
    name: value["name"],
    createdAt: typeof created === "string" ? created : "",
    lastUsedAt: typeof used === "string" ? used : null,
  };
}

/** `{ tokens: [{ id, name, created_at, last_used_at }] }`; a row without an id or a name is left out. */
const readList: Reader<ApiToken[]> = (answer) => {
  const tokens = parseObject(answer.text)?.["tokens"];
  if (!Array.isArray(tokens)) return undefined;
  return { value: tokens.flatMap((row) => tokenOf(row) ?? []) };
};

/** `{ id, name, token }`, the token not empty. */
const readCreated: Reader<NewToken> = (answer) => {
  const body = parseObject(answer.text);
  if (!body) return undefined;
  const { id, name, token } = body;
  if (typeof id !== "string" || typeof name !== "string") return undefined;
  if (typeof token !== "string" || token === "") return undefined;
  return { value: { id, name, token } };
};

/** The calls of the page to `/api/tokens`, relative to the page and with its cookie. */
export function tokenApi(fetchFn: Fetch, location: Pick<Location, "href">): TokenApi {
  const page = location.href.replace(/#.*$/, "");
  const accept = { Accept: "application/json" };
  return {
    list: () => call(fetchFn, inPage(page, "api/tokens"), { headers: accept }, readList),
    create: (name) =>
      call(
        fetchFn,
        inPage(page, "api/tokens"),
        {
          method: "POST",
          headers: { ...accept, "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        },
        readCreated,
      ),
    revoke: (id) =>
      call(
        fetchFn,
        inPage(page, `api/tokens/${encodeURIComponent(id)}`),
        { method: "DELETE", headers: accept },
        () => ({ value: null }),
      ),
  };
}

// The name of a token ------------------------------------------------------------------------------

/** What the service refuses in a name: control characters, line and paragraph separators, lone surrogates. */
const FORBIDDEN_IN_NAME = /[\p{Cc}\p{Zl}\p{Zp}\p{Cs}]/u;

export type NameCheck =
  | { readonly ok: true; readonly name: string }
  | { readonly ok: false; readonly reason: "empty" | "long" | "control" };

/** The name a person typed, as the service reads it: trimmed, 1 to 60 characters, nothing unshowable. */
export function checkName(raw: string): NameCheck {
  const name = raw.trim();
  const length = Array.from(name).length;
  if (length === 0) return { ok: false, reason: "empty" };
  if (length > NAME_MAX) return { ok: false, reason: "long" };
  if (FORBIDDEN_IN_NAME.test(name)) return { ok: false, reason: "control" };
  return { ok: true, name };
}

// Words ---------------------------------------------------------------------------------------------

/** The tokens dialog's words in a language. */
export type TokenWords = (typeof en)["tokens"];

/** Why a name was refused, in words. */
export function nameProblem(reason: "empty" | "long" | "control", words: TokenWords): string {
  if (reason === "empty") return words.needName;
  return reason === "long" ? words.nameTooLong(NAME_MAX) : words.nameControl;
}

/**
 * A failure in words: the quota and a signed-out page are explained in the page's language; any
 * other refusal shows the service's own message with its code, or the status when it sent none.
 */
export function explain(failure: ApiFailure, words: TokenWords): string {
  if (failure.kind === "unreachable") return words.unreachable;
  if (failure.kind === "unexpected") return words.unexpected;
  if (failure.code === "quota.tokens" || failure.status === 413) {
    return words.quota(TOKEN_LIMIT);
  }
  if (failure.code === "auth.required" || failure.status === 401) return words.signedOut;
  if (failure.message !== undefined && failure.code !== undefined) {
    return words.failed(failure.message, failure.code);
  }
  return words.failedStatus(failure.status);
}

/** A time from the service for the person's eyes, in the page's language and time zone. */
export function whenText(iso: string, locale: string, timeZone?: string): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return iso;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    ...(timeZone ? { timeZone } : {}),
  }).format(time);
}
