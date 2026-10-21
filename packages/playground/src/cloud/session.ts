// Who the page is for: the person `GET /api/session` says is signed in, if anyone. The page needs no
// account and no server of its own (a static host answers with the file the build wrote), so every
// way the answer can go wrong means "nobody", and says nothing about it.

import { inPage, isObject, parseObject, send, type Fetch } from "./http.js";

/** How long the page waits for the session before it carries on as if nobody were signed in. */
export const SESSION_TIMEOUT_MS = 8_000;

/** The longest `return_to` the identity service accepts; a longer one is refused and nothing starts. */
export const MAX_RETURN_TO_LENGTH = 2048;

/** What the page shows of a person. */
export interface SessionUser {
  readonly sub: string;
  /** May be empty: the page then shows no name. */
  readonly name: string;
  /** An address the avatar may be drawn from (`avatarUrl`), or undefined. */
  readonly picture: string | undefined;
  readonly handle: string | null;
}

/**
 * The three shapes of the answer, as the page uses them. A cookie is a person on the page; a bearer
 * token is the command line's way in, which no page has, so the page treats it as nobody: both it
 * and `anonymous` carry the address to sign in at.
 */
export type Session =
  | { readonly kind: "anonymous"; readonly signIn: string }
  | {
      readonly kind: "cookie";
      readonly user: SessionUser;
      /** The identity service's account page. */
      readonly account: string;
      /** Where a form posts to end the session. */
      readonly signOut: string;
    }
  | {
      readonly kind: "token";
      readonly user: SessionUser;
      readonly token: { readonly id: string; readonly name: string };
      readonly signIn: string;
    };

/** The address of the page without its fragment: where a person comes back to. */
function withoutFragment(href: string): string {
  return href.replace(/#.*$/, "");
}

/**
 * The address the identity service sends a person back to: the page without its fragment. When
 * that is too long for the service to accept, the page's path alone, and failing that its root.
 */
export function returnAddress(href: string): string {
  const page = withoutFragment(href);
  if (page.length <= MAX_RETURN_TO_LENGTH) return page;
  try {
    const url = new URL(page);
    const path = `${url.origin}${url.pathname}`;
    return path.length <= MAX_RETURN_TO_LENGTH ? path : `${url.origin}/`;
  } catch {
    return page;
  }
}

/** The link that signs a person in at the identity service and brings them back to this page. */
export function signInLink(identity: string, href: string): string {
  return `${identity.replace(/\/+$/, "")}/login?return_to=${encodeURIComponent(returnAddress(href))}`;
}

/**
 * The address an avatar may be drawn from: an `https:` address, or an address on the page's own
 * origin (a Worker running locally serves over `http:`). Anything else, and anything with
 * credentials, is no picture. The page's policy decides what actually loads; this keeps a
 * `javascript:` or `data:` address, or a relative one, out of an `<img>` in the first place.
 */
export function avatarUrl(value: unknown, page: string): string | undefined {
  if (typeof value !== "string" || value === "") return undefined;
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

/** An `http:` or `https:` address without credentials, normalised; undefined for anything else. */
function webAddress(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    const web = url.protocol === "https:" || url.protocol === "http:";
    return web && url.username === "" && url.password === "" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function userOf(value: unknown, page: string): SessionUser | undefined {
  if (!isObject(value)) return undefined;
  const { sub, name, picture, handle } = value;
  if (typeof sub !== "string" || sub === "" || typeof name !== "string") return undefined;
  return {
    sub,
    name,
    picture: avatarUrl(picture, page),
    handle: typeof handle === "string" ? handle : null,
  };
}

/**
 * The session an answer's text describes. Never throws: anything that is not one of the three
 * shapes is nobody, with the sign-in link the page builds from the identity origin it was built
 * with. `page` is the page's address, `identity` the identity service's origin.
 */
export function parseSession(text: string, page: string, identity: string): Session {
  const own = signInLink(identity, page);
  const body = parseObject(text);
  if (!body) return { kind: "anonymous", signIn: own };
  // Nobody: the service's own sign-in link when it sent a usable one, else the page's.
  if (body["user"] === null) {
    return { kind: "anonymous", signIn: webAddress(body["signIn"]) ?? own };
  }
  const user = userOf(body["user"], page);
  if (!user) return { kind: "anonymous", signIn: own };
  const account = webAddress(body["account"]);
  const signOut = webAddress(body["signOut"]);
  if (account !== undefined && signOut !== undefined) {
    return { kind: "cookie", user, account, signOut };
  }
  const token = body["token"];
  if (isObject(token) && typeof token["id"] === "string" && typeof token["name"] === "string") {
    return { kind: "token", user, token: { id: token["id"], name: token["name"] }, signIn: own };
  }
  return { kind: "anonymous", signIn: own };
}

/**
 * Asks `GET /api/session` once and says who the page is for. Only a `200` whose text parses as one
 * of the answer's shapes says anyone: a network error, a timeout, a 404 or a 500, HTML, invalid
 * JSON or any other shape is nobody, silently (the page then works as it always has). The body is
 * read as text and parsed here, whatever type the server says it has.
 *
 * @param fetchFn the global `fetch`, or a fake
 * @param location the page's location: the address is where the API is and where a person returns
 * @param identity the origin of the identity service the page was built for
 */
export async function loadSession(
  fetchFn: Fetch,
  location: Pick<Location, "href">,
  identity: string,
  timeoutMs: number = SESSION_TIMEOUT_MS,
): Promise<Session> {
  const page = withoutFragment(location.href);
  try {
    const answer = await send(
      fetchFn,
      inPage(page, "api/session"),
      { headers: { Accept: "application/json" } },
      timeoutMs,
    );
    if (answer?.status === 200) return parseSession(answer.text, page, identity);
  } catch {
    // Nothing the service does may keep the page from starting.
  }
  return { kind: "anonymous", signIn: signInLink(identity, page) };
}
