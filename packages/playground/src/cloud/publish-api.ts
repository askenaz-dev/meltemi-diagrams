// The page's calls to publishing (`publishing`): the person's handle (`PATCH /api/account`), what a
// project has published and what the service took down (`GET …/publish`), publishing the catalog built
// by the page (`PUT …/publish`) and unpublishing (`DELETE …/publish/<slug>`). Typed answers, every way a
// call can go wrong as a value (`calls.ts`): nothing here throws. The address in an answer is the
// service's: it is the only place the publish host is known, and it is used as the answer gives it
// once it is known to be a web address the page may link to.

import { call, nothing, segment, timeOf, type Reader } from "./calls.js";
import { TRANSFER_TIMEOUT_MS } from "./client.js";
import { inPage, isObject, parseObject, type Fetch } from "./http.js";
import type { Outcome } from "./tokens.js";

/** The most HTML a publication holds, in bytes: the service's limit (`publish.too-large`). */
export const HTML_MAX_BYTES = 16 * 1024 * 1024;

/** A page that is published from the project. */
export interface Publication {
  readonly slug: string;
  /** Where it is served; undefined when the service gave an address the page will not link to. */
  readonly url: string | undefined;
  readonly publishedAt: string;
  readonly bytes: number;
}

/** A publication the service took down: the owner sees it as removed by the service. */
export interface Takedown {
  readonly slug: string;
  readonly at: string;
  /** What the service said; null when it said nothing. */
  readonly reason: string | null;
}

/** What `GET …/publish` answers: the person's handle, their publications of the project and the takedowns. */
export interface PublishInfo {
  /** Null until the person chose one. */
  readonly handle: string | null;
  readonly publications: readonly Publication[];
  readonly takedowns: readonly Takedown[];
}

/** What `PUT …/publish` answers. */
export interface Published {
  readonly url: string;
  readonly handle: string;
  readonly slug: string;
  readonly bytes: number;
  readonly publishedAt: string;
}

/** The calls. None throws: a failure is an `Outcome` like any other. */
export interface PublishApi {
  info(id: string): Promise<Outcome<PublishInfo>>;
  /** Chooses the account's handle (a cookie principal's call). */
  setHandle(handle: string): Promise<Outcome<{ readonly handle: string }>>;
  publish(id: string, slug: string, html: string): Promise<Outcome<Published>>;
  unpublish(id: string, slug: string): Promise<Outcome<null>>;
}

// Reading answers --------------------------------------------------------------------------------

const text = (value: unknown): value is string => typeof value === "string";
const count = (value: unknown): number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;

/**
 * An address the page may link to: `https:`, or `http:` on the page's own origin (the development
 * host serves publications under `/_published/`); nothing with credentials, nothing else. Undefined
 * for anything that is not one: a `javascript:` or `data:` address never reaches an `<a>`.
 */
export function publicationUrl(value: unknown, page: string): string | undefined {
  if (!text(value) || value === "") return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (url.username !== "" || url.password !== "") return undefined;
  if (url.protocol === "https:") return url.href;
  if (url.protocol !== "http:") return undefined;
  try {
    return url.origin === new URL(page).origin ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function publicationOf(value: unknown, page: string): Publication | undefined {
  if (!isObject(value) || !text(value["slug"]) || value["slug"] === "") return undefined;
  return {
    slug: value["slug"],
    url: publicationUrl(value["url"], page),
    publishedAt: timeOf(value["published_at"]),
    bytes: count(value["bytes"]),
  };
}

function takedownOf(value: unknown): Takedown | undefined {
  if (!isObject(value) || !text(value["slug"]) || value["slug"] === "") return undefined;
  const reason = value["reason"];
  return {
    slug: value["slug"],
    at: timeOf(value["at"]),
    reason: text(reason) && reason.trim() !== "" ? reason.slice(0, 500) : null,
  };
}

function rows<T>(value: unknown, read: (row: unknown) => T | undefined): T[] {
  return Array.isArray(value) ? value.flatMap((row) => read(row) ?? []) : [];
}

const readInfo =
  (page: string): Reader<PublishInfo> =>
  (answer) => {
    const body = parseObject(answer.text);
    if (!body) return undefined;
    return {
      value: {
        handle: text(body["handle"]) && body["handle"] !== "" ? body["handle"] : null,
        publications: rows(body["publications"], (row) => publicationOf(row, page)),
        takedowns: rows(body["takedowns"], takedownOf),
      },
    };
  };

const readHandle: Reader<{ readonly handle: string }> = (answer) => {
  const handle = parseObject(answer.text)?.["handle"];
  return text(handle) && handle !== "" ? { value: { handle } } : undefined;
};

const readPublished =
  (page: string): Reader<Published> =>
  (answer) => {
    const body = parseObject(answer.text);
    if (!body) return undefined;
    const url = publicationUrl(body["url"], page);
    const { handle, slug } = body;
    if (url === undefined || !text(handle) || !text(slug)) return undefined;
    return {
      value: {
        url,
        handle,
        slug,
        bytes: count(body["bytes"]),
        publishedAt: timeOf(body["published_at"]),
      },
    };
  };

// The calls --------------------------------------------------------------------------------------

/** The calls of the page to `PATCH /api/account` and `…/publish`, relative to the page. */
export function publishApi(fetchFn: Fetch, location: Pick<Location, "href">): PublishApi {
  const page = location.href.replace(/#.*$/, "");
  const accept = { Accept: "application/json" };
  const asJson = { ...accept, "Content-Type": "application/json" };
  const at = (id: string, rest = "") => inPage(page, `api/projects/${segment(id)}/publish${rest}`);
  return {
    info: (id) => call(fetchFn, at(id), { headers: accept }, readInfo(page)),
    setHandle: (handle) =>
      call(
        fetchFn,
        inPage(page, "api/account"),
        { method: "PATCH", headers: asJson, body: JSON.stringify({ handle }) },
        readHandle,
      ),
    publish: (id, slug, html) =>
      call(
        fetchFn,
        at(id),
        { method: "PUT", headers: asJson, body: JSON.stringify({ slug, html }) },
        readPublished(page),
        TRANSFER_TIMEOUT_MS,
      ),
    unpublish: (id, slug) =>
      call(fetchFn, at(id, `/${segment(slug)}`), { method: "DELETE", headers: accept }, nothing),
  };
}
