// The private HTTP-shaped service protocol. The hosted named entrypoint is its only platform
// entry; the public router never imports or selects it. Business authorization stays in cloud().
import { readConfig } from "./config.js";
import type { Env } from "./env.js";
import { ApiError, errorResponse, fail } from "./errors.js";
import { cloud } from "./handler.js";
import { json, MAX_JSON_BYTES, readCappedBytes } from "./http.js";
import type { Deps } from "./types.js";

/** The external context uses `admin`; the existing administration answer keeps `administrator`. */
export interface AdministrationContext {
  readonly role: "owner" | "admin" | "invitee" | "none";
  readonly invitation: {
    readonly id: string;
    readonly invitedBy: { readonly name: string };
    readonly expiresAt: string;
  } | null;
}

const MAX_SESSION_LENGTH = 4096;
const JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/** Closed method/path pairs, not a prefix proxy: new operations require a reviewed addition. */
const ADMINISTRATION_PATHS: Readonly<Record<string, readonly RegExp[]>> = {
  GET: [
    /^\/context$/,
    /^\/api\/admin$/,
    /^\/api\/admin\/permissions\/[^/]+$/,
    /^\/api\/admin\/accounts\/[^/]+\/permissions\/[^/]+$/,
  ],
  POST: [
    /^\/account-permission$/,
    /^\/api\/admin\/invitations$/,
    /^\/api\/admin\/invitations\/[^/]+\/(?:accept|decline)$/,
  ],
  DELETE: [
    /^\/api\/admin\/invitations\/[^/]+$/,
    /^\/api\/admin\/administrators\/[^/]+$/,
    /^\/api\/admin\/publications\/[^/]+\/[^/]+$/,
  ],
  PUT: [/^\/api\/admin\/accounts\/[^/]+\/permissions\/[^/]+$/],
};

function admittedPath(method: string, pathname: string): boolean {
  if (!Object.hasOwn(ADMINISTRATION_PATHS, method)) return false;
  if (!ADMINISTRATION_PATHS[method]?.some((pattern) => pattern.test(pathname))) return false;
  try {
    return pathname.split("/").every((part) => {
      const decoded = decodeURIComponent(part);
      // A decoded separator cannot become a different path in the business router.
      // eslint-disable-next-line no-control-regex
      return decoded !== "." && decoded !== ".." && !/[/\\\u0000-\u001f\u007f]/.test(decoded);
    });
  } catch {
    return false;
  }
}

function sessionBearer(request: Request): string {
  const authorization = request.headers.get("Authorization") ?? "";
  // Bound the header before the regular expression or any verifier/fetch is reached.
  if (authorization.length > MAX_SESSION_LENGTH + "Bearer ".length) throw fail("auth.required");
  const token = /^Bearer (\S+)$/i.exec(authorization)?.[1];
  if (!token || token.length > MAX_SESSION_LENGTH || !JWT.test(token)) throw fail("auth.required");
  return token;
}

/** Read once, bounded in bytes; handlers receive the same JSON text for their field validation. */
async function bodyOf(request: Request): Promise<string | undefined> {
  const bytes = await readCappedBytes(request, MAX_JSON_BYTES);
  if (!bytes) throw fail("request.invalid");
  if (bytes.length === 0) return undefined;
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("Content-Type") ?? ""))
    throw fail("request.invalid");
  let text: string;
  let value: unknown;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
    value = JSON.parse(text);
  } catch {
    throw fail("request.invalid");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw fail("request.invalid");
  return text;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Select exact output fields, so future session additions cannot leak through the context. */
function contextOf(value: unknown): AdministrationContext {
  if (!record(value) || !record(value["user"])) throw fail("auth.required");
  const user = value["user"];
  const administration = user["administration"];
  if (record(administration)) {
    if (administration["role"] === "owner") return { role: "owner", invitation: null };
    if (administration["role"] === "administrator") return { role: "admin", invitation: null };
    throw fail("internal");
  }
  if (administration !== null) throw fail("internal");
  const invitation = user["administrationInvitation"];
  if (invitation === null) return { role: "none", invitation: null };
  if (
    !record(invitation) ||
    typeof invitation["id"] !== "string" ||
    typeof invitation["expiresAt"] !== "string" ||
    !record(invitation["invitedBy"]) ||
    typeof invitation["invitedBy"]["name"] !== "string"
  )
    throw fail("internal");
  return {
    role: "invitee",
    invitation: {
      id: invitation["id"],
      invitedBy: { name: invitation["invitedBy"]["name"] },
      expiresAt: invitation["expiresAt"],
    },
  };
}

/** `deps.verifier` is the dedicated fresh-session verifier supplied by the named entrypoint. */
export async function administrationFetch(
  request: Request,
  env: Env,
  deps: Deps,
): Promise<Response> {
  try {
    if (deps.local) throw fail("local.feature-unavailable");
    // DEV must not choose a caller-controlled origin: even its synthetic config request uses
    // ORIGIN from the bound Worker, never the incoming request URL.
    const config = readConfig(env, new Request(new URL(env.ORIGIN).origin));
    const url = new URL(request.url);
    if (
      url.origin !== config.origin ||
      url.username !== "" ||
      url.password !== "" ||
      url.search !== "" ||
      url.hash !== "" ||
      !admittedPath(request.method, url.pathname)
    )
      throw fail("not-found");

    const token = sessionBearer(request);
    if (!(await deps.verifier.verifySession(token, deps.now()))) throw fail("auth.required");
    const body = await bodyOf(request);
    if (request.method === "GET" && body !== undefined) throw fail("request.invalid");
    const context = url.pathname === "/context";
    let pathname = context ? "/api/session" : url.pathname;
    let method = request.method;
    let forwardedBody = body;
    if (url.pathname === "/account-permission") {
      const lookup: unknown = body === undefined ? undefined : JSON.parse(body);
      if (
        !record(lookup) ||
        Object.keys(lookup).length !== 2 ||
        typeof lookup["account"] !== "string" ||
        lookup["account"] === "" ||
        typeof lookup["permission"] !== "string" ||
        lookup["permission"] === ""
      )
        throw fail("request.invalid");
      pathname = `/api/admin/accounts/${encodeURIComponent(lookup["account"])}/permissions/${encodeURIComponent(lookup["permission"])}`;
      if (!admittedPath("GET", pathname)) throw fail("request.invalid");
      method = "GET";
      forwardedBody = undefined;
    }
    const headers = new Headers({ Cookie: `meltemi_session=${token}`, Origin: config.origin });
    if (forwardedBody !== undefined) headers.set("Content-Type", "application/json");
    const forwarded = new Request(new URL(pathname, config.origin), {
      method,
      headers,
      ...(forwardedBody !== undefined ? { body: forwardedBody } : {}),
    });
    const response = await cloud(forwarded, env, deps);
    if (!context || response.status !== 200) return response;
    return json(contextOf(await response.json()));
  } catch (error) {
    if (error instanceof ApiError) return errorResponse(error);
    // A verifier or transport exception may contain its request. Never log its text or headers.
    console.error("cloud: private administration failed");
    return errorResponse(fail("internal"));
  }
}
