import type { Config } from "./config.js";
import type { Env } from "./env.js";
import type { Deps, Principal } from "./types.js";

/**
 * What an operation needs (`operations/*.ts`): the environment, the dependencies, the configuration
 * and who is asking. A route's `Ctx` is one, so a route hands its own context to the operation it
 * reads the request for; the MCP endpoint (`routes/mcp.ts`) builds one for each tool call, with the
 * principal its bearer token resolved to.
 */
export interface OpCtx {
  readonly env: Env;
  readonly deps: Deps;
  readonly config: Config;
  /** Who is asking; undefined for anonymous callers (a project's link may admit them to read). */
  readonly principal: Principal | undefined;
}

/** What every route receives: the request and everything it needs, already read and checked. */
export interface Ctx extends OpCtx {
  readonly request: Request;
  readonly url: URL;
  /** The captured parts of the path (`/api/tokens/:id` gives `id`). */
  readonly params: Readonly<Record<string, string>>;
}

export type Route = (ctx: Ctx) => Promise<Response>;

/**
 * The fields of an operation's input before they are checked: an operation reads each one through
 * the same rule whoever calls it (a route forwards the JSON it read, a tool the arguments its schema
 * admitted), so the shape `T` documents what is expected and nothing is trusted.
 */
export type Unchecked<T> = { readonly [K in keyof T]?: unknown };
