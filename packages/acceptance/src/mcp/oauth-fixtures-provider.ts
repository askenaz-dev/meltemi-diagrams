// Production provider/helpers and canonical constants, used only by privileged fixture setup.
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { createHash, randomBytes } from "node:crypto";
import type { KVLike } from "../../../cloud/src/oauth/store.js";
import {
  ACCESS_TOKEN_TTL_S,
  AUTHORIZE_PATH,
  MCP_PATH,
  OAUTH_SCOPES,
  REGISTER_PATH,
  REFRESH_TOKEN_TTL_S,
  TOKEN_PATH,
  userIdOf,
} from "../../../cloud/src/oauth/settings.js";
import {
  FIXTURE_CLIENT_PREFIX,
  fixtureFailure,
  type FixtureKind,
  type OAuthFixtureToken,
} from "./oauth-fixture-format.js";

type Helpers = ReturnType<(typeof import("../../../cloud/src/oauth/provider.js"))["oauthApi"]>;
const CALLBACK = "http://127.0.0.1:1455/mcp-acceptance-fixture";
export const WRONG_RESOURCE_ORIGIN = "https://mcp-acceptance.invalid";

export async function fixtureHelpers(origin: string, store: KVLike): Promise<Helpers> {
  const { oauthApi } = await import("../../../cloud/src/oauth/provider.js");
  return oauthApi({
    env: {},
    config: { origin },
    deps: { oauthStore: store },
  } as unknown as Parameters<typeof oauthApi>[0]);
}

/** Only the library's token endpoint may run here; both application handlers are hard refusals. */
export async function localFixtureExchange(
  origin: string,
  store: KVLike,
  form: URLSearchParams,
): Promise<Response> {
  const require = createRequire(new URL("../../../cloud/package.json", import.meta.url));
  const library = (await import(
    pathToFileURL(require.resolve("@cloudflare/workers-oauth-provider")).href
  )) as {
    OAuthProvider: new (options: Record<string, unknown>) => {
      fetch(request: Request, env: { OAUTH_KV: KVLike }, ctx: unknown): Promise<Response>;
    };
  };
  const refuse = {
    fetch: () => {
      throw new Error("Application handlers cannot run in fixture setup");
    },
  };
  const provider = new library.OAuthProvider({
    apiRoute: MCP_PATH,
    apiHandler: refuse,
    defaultHandler: refuse,
    authorizeEndpoint: AUTHORIZE_PATH,
    tokenEndpoint: TOKEN_PATH,
    clientRegistrationEndpoint: REGISTER_PATH,
    scopesSupported: [...OAUTH_SCOPES],
    resourceMetadata: { resource: origin + MCP_PATH, authorization_servers: [origin] },
    accessTokenTTL: ACCESS_TOKEN_TTL_S,
    refreshTokenTTL: REFRESH_TOKEN_TTL_S,
    tokenExchangeCallback: ({ grantType, scope }: { grantType: string; scope: string[] }) =>
      grantType === "authorization_code" && !scope.includes("offline_access")
        ? { refreshTokenTTL: 0 }
        : undefined,
  });
  return provider.fetch(
    new Request(origin + TOKEN_PATH, { method: "POST", body: form }),
    { OAUTH_KV: store },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

/** Clock overrides are confined to the isolated setup process, never the deployed Worker. */
export async function issueOAuthFixture(options: {
  kind: FixtureKind;
  origin: string;
  sub: string;
  runId: string;
  store: KVLike;
  exchange: (origin: string, form: URLSearchParams) => Promise<Response>;
}): Promise<OAuthFixtureToken> {
  const { kind, sub, runId, store } = options;
  const origin = kind === "wrongResource" ? WRONG_RESOURCE_ORIGIN : options.origin;
  const actualNow = Date.now;
  const clock = kind === "expired" ? actualNow() - 2 * 60 * 60 * 1000 : actualNow();
  if (kind === "expired") Date.now = () => clock;
  try {
    const helpers = await fixtureHelpers(origin, store);
    const scope =
      kind === "narrow"
        ? ["projects:read"]
        : [
            "projects:read",
            "projects:write",
            "sharing",
            "live",
            "publish",
            ...(kind === "normal" ? ["offline_access"] : []),
          ];
    const client = await helpers.createClient({
      clientName: `${FIXTURE_CLIENT_PREFIX}${runId}-${kind}`,
      redirectUris: [CALLBACK],
      tokenEndpointAuthMethod: "none",
      grantTypes: ["authorization_code", "refresh_token"],
      responseTypes: ["code"],
    });
    const verifier = randomBytes(32).toString("base64url");
    const query = new URLSearchParams({
      response_type: "code",
      client_id: client.clientId,
      redirect_uri: CALLBACK,
      scope: scope.join(" "),
      state: randomBytes(16).toString("hex"),
      resource: origin + MCP_PATH,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
    });
    const request = await helpers.parseAuthRequest(
      new Request(`${origin}${AUTHORIZE_PATH}?${query}`),
    );
    const at = new Date(clock).toISOString();
    const { redirectTo } = await helpers.completeAuthorization({
      request,
      userId: userIdOf(sub),
      scope,
      props: { kind: "grant", sub, at },
      metadata: {
        fixtureRunId: runId,
        client: { name: `${FIXTURE_CLIENT_PREFIX}${runId}-${kind}`, uri: new URL(CALLBACK).origin },
        approvedAt: at,
      },
    });
    const code = new URL(redirectTo).searchParams.get("code");
    if (!code) return fixtureFailure();
    const form = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: client.clientId,
      redirect_uri: CALLBACK,
      code_verifier: verifier,
      resource: origin + MCP_PATH,
    });
    const response =
      kind === "expired" || kind === "wrongResource"
        ? await localFixtureExchange(origin, store, form)
        : await options.exchange(origin, form);
    if (!response.ok) return fixtureFailure();
    const token = (await response.json()) as Record<string, unknown>;
    if (
      typeof token["access_token"] !== "string" ||
      token["token_type"] !== "bearer" ||
      token["expires_in"] !== ACCESS_TOKEN_TTL_S ||
      (kind === "normal" && typeof token["refresh_token"] !== "string")
    )
      return fixtureFailure();
    return {
      clientId: client.clientId,
      accessToken: token["access_token"],
      ...(typeof token["refresh_token"] === "string"
        ? { refreshToken: token["refresh_token"] }
        : {}),
      issuedAt: Math.floor(clock / 1000),
      expiresAt: Math.floor(clock / 1000) + ACCESS_TOKEN_TTL_S,
    };
  } catch {
    return fixtureFailure();
  } finally {
    Date.now = actualNow;
  }
}
