// The authorization server of the MCP endpoint (`mcp-authorization`), over
// `@cloudflare/workers-oauth-provider` (MIT, pinned at 1.2.3), which keeps its state in what it reads
// as the KV namespace `env.OAUTH_KV`: here the D1 table `oauth_store` (`store.ts`, migration 0010),
// handed to it in the environment it is given, so the Worker binds no KV namespace. The library
// answers its own addresses: the metadata (RFC 8414 and RFC 9728), the token endpoint (codes
// with PKCE, rotating refresh tokens, revocation), dynamic client registration (RFC 7591) and
// client-id metadata documents; and it guards `/mcp`, the one protected resource, handing a request
// with a valid token to the endpoint with what the grant holds. The consent page is this service's
// (`routes/oauth.ts`), as are the rate of registrations, the `Origin` rule and every refusal of a
// tool, which the scope and the project's role decide (`mcp/tool.ts`, `access.ts`).
//
// Imported only when such an address is asked for (`routes/mcp.ts`, `routes/oauth.ts`,
// `routes/apps.ts`, `routes/events.ts`), so that an isolate that serves the page and the API never
// evaluates the library.
//
// What the library is given: one provider per origin (production's, staging's, the development
// address), made once per isolate; and an environment per request, the Worker's with the store as
// `OAUTH_KV` and the request's `Ctx`, which reaches the handlers through the environment object the
// library passes on (`RUN`), since a handler is the library's to call. A token is never
// logged, nor any part of a request: the library's refusals are answered and not printed.

import {
  GrantType,
  OAuthProvider,
  getOAuthApi,
  type OAuthHelpers,
  type OAuthProviderOptions,
} from "@cloudflare/workers-oauth-provider";

// What the consent page tells apart: a request the library refused (with a redirect it validated, or
// none) and a client whose metadata document could not be read.
export {
  AuthorizationError,
  CimdFetchError,
  authorizationErrorRedirect,
} from "@cloudflare/workers-oauth-provider";
import type { Ctx } from "../context.js";
import type { Env } from "../env.js";
import { ApiError, errorResponse, fail } from "../errors.js";
import { SCOPES, apiTokenCaller, oauthCaller, type Caller } from "../mcp/caller.js";
import { TOKEN_PREFIX } from "../principal.js";
import type { Deps } from "../types.js";
import {
  ACCESS_TOKEN_TTL_S,
  AUTHORIZE_PATH,
  MCP_PATH,
  OAUTH_SCOPES,
  OFFLINE_ACCESS,
  REFRESH_TOKEN_TTL_S,
  REGISTER_PATH,
  TOKEN_PATH,
  challengeMetadataOf,
  resourceMetadataOf,
  resourceOf,
} from "./settings.js";
import type { KVLike } from "./store.js";

/** Where the request's context rides in the environment the library hands its handlers. */
const RUN = Symbol("meltemi.run");

/**
 * The environment the library is given: the Worker's, with the authorization server's store where
 * the library looks for its KV namespace and, for a request, the request's context beside it.
 */
interface ProviderEnv extends Env {
  readonly OAUTH_KV: KVLike;
  readonly [RUN]?: Ctx;
  OAUTH_PROVIDER?: OAuthHelpers;
}

/** What a grant carries to the endpoint (`completeAuthorization`'s `props`): who, and since when. */
export interface GrantProps {
  readonly kind: "grant";
  readonly sub: string;
  /** When the person approved (ISO): a grant older than the account's deletion opens nothing. */
  readonly at: string;
}

/** What an `mdg_` API token resolved to, beside the grants (`resolveExternalToken`). */
interface ApiTokenProps {
  readonly kind: "api-token";
  readonly caller: Caller;
}

/** What the library sets on the context it hands the endpoint's handler. */
interface ApiContext {
  props?: unknown;
  auth?: { token: string; scope: string[]; clientId?: string; userId?: string };
}

/** The context argument of the library's `fetch`: the platform's `ExecutionContext`. */
type LibraryContext = Parameters<OAuthProvider<ProviderEnv>["fetch"]>[2];

/** The execution context the library is given: it sets `props` and `auth` on it, and nothing waits. */
function executionContext(): LibraryContext {
  const context: ApiContext & { waitUntil(): void; passThroughOnException(): void } = {
    waitUntil: () => {},
    passThroughOnException: () => {},
    props: {},
  };
  return context as unknown as LibraryContext;
}

/** The request's context, which every handler of the library is called with. */
function runOf(env: ProviderEnv): Ctx {
  const run = env[RUN];
  if (!run) throw new Error("the authorization server ran without the request's context");
  return run;
}

/** The Worker's environment (secrets and bindings read through it) with the store as `OAUTH_KV`. */
function storeEnv(env: Env, deps: Pick<Deps, "oauthStore">): ProviderEnv {
  const wrapped = Object.create(env) as ProviderEnv;
  Object.defineProperty(wrapped, "OAUTH_KV", { value: deps.oauthStore, enumerable: true });
  return wrapped;
}

/** The environment for one request: the Worker's own with the store, and the context. */
function providerEnv(ctx: Ctx): ProviderEnv {
  const env = storeEnv(ctx.env, ctx.deps) as ProviderEnv & { [RUN]: Ctx };
  Object.defineProperty(env, RUN, { value: ctx });
  return env;
}

/**
 * A grant's access token is `<user>:<grant>:<secret>`: the grant is its middle part, which the
 * library's context does not carry. Connected apps record its last use under it.
 */
function grantIdOf(token: string): string {
  const parts = token.split(":");
  return parts[parts.length - 2] ?? "";
}

/** Last uses recorded by this isolate, by grant: a grant's row is written at most hourly. */
const touched = new Map<string, number>();

/** How often a grant's last use is written. */
export const TOUCH_EVERY_MS = 60 * 60 * 1000;

/**
 * The caller of a request the library let through: an `mdg_` token's (resolved before, every scope),
 * or a grant's (its account, its scopes). A grant approved before the account was deleted opens
 * nothing (`401`), even while its revocation is still on its way; its last use is recorded at most
 * hourly.
 */
async function callerOf(ctx: Ctx, context: ApiContext): Promise<Caller> {
  const props = context.props as
    | {
        readonly kind?: unknown;
        readonly caller?: Caller;
        readonly sub?: unknown;
        readonly at?: unknown;
      }
    | undefined;
  if (props?.kind === "api-token" && props.caller) return props.caller;
  const auth = context.auth;
  if (props?.kind !== "grant" || typeof props.sub !== "string" || !auth) {
    throw fail("token.invalid");
  }
  const { deps } = ctx;
  if (typeof props.at !== "string" || (await deps.store.deletedSince(props.sub, props.at))) {
    throw fail("token.invalid");
  }
  const grantId = grantIdOf(auth.token);
  const now = deps.now();
  const last = touched.get(grantId) ?? Number.NEGATIVE_INFINITY;
  if (now.getTime() - last >= TOUCH_EVERY_MS) {
    touched.set(grantId, now.getTime());
    if (touched.size > 1000) touched.delete(touched.keys().next().value!);
    try {
      await deps.store.touchApp(
        props.sub,
        grantId,
        now.toISOString(),
        new Date(now.getTime() - TOUCH_EVERY_MS).toISOString(),
      );
    } catch (error) {
      // What Connected apps shows is late by a call; the call itself is not refused for it.
      touched.delete(grantId);
      console.error(
        "cloud: a connected app's last use could not be recorded:",
        error instanceof Error ? error.message : "unknown",
      );
    }
  }
  return oauthCaller({
    sub: props.sub,
    grantId,
    clientId: auth.clientId ?? "",
    scopes: auth.scope,
  });
}

/** The `401` of a token the endpoint does not take, with the challenge that names the metadata. */
function challenged(ctx: Ctx, error: ApiError): Response {
  const refused = errorResponse(error);
  refused.headers.set(
    "WWW-Authenticate",
    `Bearer realm="OAuth", resource_metadata="${challengeMetadataOf(ctx.config.origin)}", error="invalid_token"`,
  );
  return refused;
}

/** The library's options for one origin. */
function optionsFor(origin: string): OAuthProviderOptions<ProviderEnv> {
  return {
    apiRoute: MCP_PATH,
    apiHandler: {
      async fetch(request: Request, env: ProviderEnv, context: unknown): Promise<Response> {
        const ctx = runOf(env);
        let caller: Caller;
        try {
          caller = await callerOf(ctx, context as ApiContext);
        } catch (error) {
          if (error instanceof ApiError) return challenged(ctx, error);
          throw error;
        }
        const { serveMcp } = await import("../mcp/endpoint.js");
        return serveMcp({ ...ctx, request }, caller);
      },
    },
    // Every other address of the Worker is routed by `handler.ts` before the library sees it: this
    // answers only what the library hands back unrouted.
    defaultHandler: { fetch: async () => errorResponse(fail("not-found")) },
    authorizeEndpoint: AUTHORIZE_PATH,
    tokenEndpoint: TOKEN_PATH,
    clientRegistrationEndpoint: REGISTER_PATH,
    scopesSupported: [...OAUTH_SCOPES],
    // The five scopes are what a client asks for first: the consent page names each, and a tool
    // refuses what was not granted with `scope.insufficient`.
    requiredScopes: [...SCOPES],
    resourceMetadata: {
      resource: resourceOf(origin),
      authorization_servers: [origin],
      bearer_methods_supported: ["header"],
      resource_name: "Meltemi Diagrams",
    },
    accessTokenTTL: ACCESS_TOKEN_TTL_S,
    refreshTokenTTL: REFRESH_TOKEN_TTL_S,
    clientIdMetadataDocumentEnabled: true,
    // A refresh token only for a grant with `offline_access`.
    tokenExchangeCallback: ({ grantType, scope }) =>
      grantType === GrantType.AUTHORIZATION_CODE && !scope.includes(OFFLINE_ACCESS)
        ? { refreshTokenTTL: 0 }
        : undefined,
    // The service's own API tokens open the endpoint too, as the account they belong to, with every
    // scope; any other bearer the library does not hold (a JWT of the identity service) is `401`.
    async resolveExternalToken({ token, env }) {
      if (!token.startsWith(TOKEN_PREFIX)) return null;
      const ctx = runOf(env);
      try {
        const caller = await apiTokenCaller(token, ctx.deps);
        const props: ApiTokenProps = { kind: "api-token", caller };
        return { props, audience: resourceOf(ctx.config.origin) };
      } catch (error) {
        if (error instanceof ApiError) return null;
        throw error;
      }
    },
    // A refusal is the client's mistake and is answered, never logged: its description may repeat
    // what the client sent. A failure of the server's own is logged by its code alone.
    onError: ({ status, code }) => {
      if (status >= 500) console.error(`oauth: ${status} ${code}`);
    },
  };
}

/** The providers made, by origin: one in production, one per development address. */
const providers = new Map<string, OAuthProvider<ProviderEnv>>();

function providerFor(origin: string): OAuthProvider<ProviderEnv> {
  let provider = providers.get(origin);
  if (!provider) {
    provider = new OAuthProvider<ProviderEnv>(optionsFor(origin));
    providers.set(origin, provider);
  }
  return provider;
}

/**
 * Hands a request to the library: the metadata, the token endpoint, registration (after its rate)
 * and `/mcp` (after the door). `url` replaces the request's address, for the metadata document the
 * origin's path answers too.
 */
export async function serveProvider(ctx: Ctx, url?: string): Promise<Response> {
  const { origin } = ctx.config;
  const request = url === undefined ? ctx.request : new Request(url, ctx.request);
  const response = await providerFor(origin).fetch(request, providerEnv(ctx), executionContext());
  // The library's challenge names the document at the resource's own path; the service's names
  // the origin's, which answers the same document (`mcp-authorization`, "The challenge").
  const challenge = response.headers.get("WWW-Authenticate");
  const inserted = `resource_metadata="${resourceMetadataOf(origin)}"`;
  if (challenge === null || !challenge.includes(inserted)) return response;
  const answer = new Response(response.body, response);
  answer.headers.set(
    "WWW-Authenticate",
    challenge.replace(inserted, `resource_metadata="${challengeMetadataOf(origin)}"`),
  );
  return answer;
}

/** The library's helpers for this service's own pages: the consent, Connected apps, the deletion. */
export function oauthApi(ctx: Pick<Ctx, "env" | "config" | "deps">): OAuthHelpers {
  return getOAuthApi(optionsFor(ctx.config.origin), storeEnv(ctx.env, ctx.deps));
}
