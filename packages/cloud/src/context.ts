import type { Config } from "./config.js";
import type { Env } from "./env.js";
import type { Deps, Principal } from "./types.js";

/** What every route receives: the request and everything it needs, already read and checked. */
export interface Ctx {
  readonly request: Request;
  readonly url: URL;
  readonly env: Env;
  readonly deps: Deps;
  readonly config: Config;
  /** Who is asking; resolved for the routes that need it, undefined for anonymous callers. */
  readonly principal: Principal | undefined;
  /** The captured parts of the path (`/api/tokens/:id` gives `id`). */
  readonly params: Readonly<Record<string, string>>;
}

export type Route = (ctx: Ctx) => Promise<Response>;
