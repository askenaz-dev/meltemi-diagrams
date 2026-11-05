import type { Config } from "./config.js";
import { ConfigError } from "./config.js";
import { fail } from "./errors.js";
import { isSafeMethod } from "./http.js";

/** Local mode has one configured IPv4 loopback address, never a request-derived origin. */
export function localConfig(origin: string): Config {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new ConfigError("ORIGIN is not a local address");
  }
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    origin !== url.origin
  ) {
    throw new ConfigError("ORIGIN must be an exact http://127.0.0.1:<port> origin");
  }
  return {
    origin: url.origin,
    host: url.host,
    issuer: "",
    jwksUrl: "",
    dev: false,
    inlineJwks: undefined,
    owners: new Set(),
    publishHost: undefined,
    sponsorsAccount: undefined,
    productName: "diagrams-local",
  };
}

/** The boundary is checked before the local actor or persistent bootstrap is resolved. */
export function guardLocalRequest(request: Request, config: Config): void {
  const url = new URL(request.url);
  const host = request.headers.get("Host");
  if (url.origin !== config.origin || (host !== null && host !== config.host))
    throw fail("request.forbidden");
  const origin = request.headers.get("Origin");
  if (origin !== null && origin !== config.origin) throw fail("request.forbidden");
  if (
    url.pathname !== "/mcp" &&
    (!isSafeMethod(request.method) ||
      request.headers.get("Upgrade")?.toLowerCase() === "websocket") &&
    origin !== config.origin
  ) {
    throw fail("request.forbidden");
  }
}

/** Block hosted-only surfaces independently of the route's method or authentication. */
export function localUnavailable(path: string): boolean {
  return (
    /^\/(?:oauth|\.well-known|_identity|_sponsors|_published|cli-auth)(?:\/|$)/.test(path) ||
    /^\/api\/(?:tokens|admin|invitations|dev|local)(?:\/|$)/.test(path) ||
    /^\/api\/account(?:$|\/(?!usage$))/.test(path) ||
    /^\/api\/projects\/[^/]+\/(?:sharing|members|invitations|live|publish)(?:\/|$)/.test(path) ||
    path === "/__scheduled"
  );
}
