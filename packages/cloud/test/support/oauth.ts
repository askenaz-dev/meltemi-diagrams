// Test support for the authorization server (`mcp-authorization`): a client of its own that registers
// (dynamic registration), starts the flow with PKCE, shows the consent page to a person signed in,
// presses Approve or Deny as their browser would (the session cookie, the library's binding cookie,
// the page's `Origin`), and exchanges the code; and an MCP client of the official SDK with the
// access token it got. Everything goes through `cloud()` in this process.

import { createHash, randomBytes } from "node:crypto";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import type { Harness } from "./index.js";

/** The loopback callback an agent such as Codex listens on. */
export const CALLBACK = "http://127.0.0.1:1455/callback";

/** The endpoint's scopes, all of them. */
export const ALL_SCOPES = "projects:read projects:write sharing live publish";

/** A PKCE pair: the verifier the client keeps and its S256 challenge. */
export interface Pkce {
  readonly verifier: string;
  readonly challenge: string;
}

export function pkce(): Pkce {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

/** The address of `path` at the harness's origin. */
const at = (h: Harness, path: string) => `${h.env.ORIGIN}${path}`;

/** Registers a client by dynamic registration; answers the response and, on success, the client's id. */
export async function register(
  h: Harness,
  metadata: Record<string, unknown> = {},
  ip = "203.0.113.9",
): Promise<{ response: Response; clientId: string }> {
  const response = await h.request("/oauth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip },
    body: JSON.stringify({
      client_name: "Codex",
      redirect_uris: [CALLBACK],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      ...metadata,
    }),
  });
  const body = response.ok ? ((await response.clone().json()) as { client_id?: string }) : {};
  return { response, clientId: body.client_id ?? "" };
}

/** The query of an authorization request, with PKCE and the endpoint as its resource. */
export function authorizeQuery(
  h: Harness,
  clientId: string,
  challenge: string,
  extra: Record<string, string> = {},
): string {
  return new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: CALLBACK,
    scope: `${ALL_SCOPES} offline_access`,
    state: "state-1234567890",
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource: at(h, "/mcp"),
    ...extra,
  }).toString();
}

/** A consent page as a browser of the person got it: its HTML, its form's fields and its cookie. */
export interface Consent {
  readonly response: Response;
  readonly html: string;
  /** The form's `action`, as written. */
  readonly action: string;
  readonly handle: string;
  readonly csrf: string;
  /** The library's binding cookie, `name=value`, which the browser sends back with the form. */
  readonly binding: string;
}

/** The value of a hidden field of a page. */
export function hiddenField(html: string, name: string): string {
  return new RegExp(`<input type="hidden" name="${name}" value="([^"]*)">`).exec(html)?.[1] ?? "";
}

/** Undoes the page's escaping of an attribute's value. */
const unescape = (value: string) =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/** Opens the consent page with the person's cookie. */
export async function consent(
  h: Harness,
  cookie: string,
  query: string,
  headers: Record<string, string> = {},
): Promise<Consent> {
  const response = await h.request(`/oauth/authorize?${query}`, {
    headers: { Cookie: cookie, ...headers },
  });
  const html = await response.clone().text();
  const binding = (response.headers.getSetCookie()[0] ?? "").split(";")[0] ?? "";
  return {
    response,
    html,
    action: unescape(/<form method="post" action="([^"]*)">/.exec(html)?.[1] ?? ""),
    handle: hiddenField(html, "handle"),
    csrf: hiddenField(html, "csrf"),
    binding,
  };
}

/** Presses a button of the consent page: posts its form from the page, with both cookies. */
export function decide(
  h: Harness,
  cookie: string,
  page: Consent,
  decision: "approve" | "deny",
  fields: Record<string, string> = {},
): Promise<Response> {
  return h.request(page.action, {
    method: "POST",
    headers: {
      Cookie: `${cookie}; ${page.binding}`,
      Origin: h.env.ORIGIN,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      handle: page.handle,
      csrf: page.csrf,
      decision,
      ...fields,
    }).toString(),
  });
}

/** What the client's callback was given: the code (or the error), the state and the issuer. */
export function callbackOf(response: Response): URLSearchParams {
  const location = response.headers.get("Location") ?? "";
  if (!location.startsWith(CALLBACK))
    throw new Error(`not a redirect to the callback: ${location}`);
  return new URL(location).searchParams;
}

/** A token request: form-encoded, as an OAuth client sends it. */
export function tokenRequest(h: Harness, fields: Record<string, string>): Promise<Response> {
  return h.request("/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
}

/** The token answer of a successful request. */
export interface Tokens {
  readonly access_token: string;
  readonly token_type: string;
  readonly expires_in: number;
  readonly refresh_token?: string;
  readonly scope: string;
  readonly resource?: string;
}

/** Exchanges a code with its verifier for the endpoint. */
export function exchange(
  h: Harness,
  clientId: string,
  code: string,
  verifier: string,
): Promise<Response> {
  return tokenRequest(h, {
    grant_type: "authorization_code",
    code,
    redirect_uri: CALLBACK,
    client_id: clientId,
    code_verifier: verifier,
    resource: at(h, "/mcp"),
  });
}

/**
 * The whole flow for a person: a client registered, the consent approved, the code exchanged.
 * Answers the client's id and the tokens.
 */
export async function connectApp(
  h: Harness,
  cookie: string,
  options: { scope?: string; name?: string } = {},
): Promise<{ clientId: string; tokens: Tokens }> {
  const { clientId } = await register(h, options.name ? { client_name: options.name } : {});
  const pair = pkce();
  const page = await consent(
    h,
    cookie,
    authorizeQuery(h, clientId, pair.challenge, options.scope ? { scope: options.scope } : {}),
  );
  if (page.response.status !== 200) throw new Error(`no consent page: ${page.response.status}`);
  const approved = await decide(h, cookie, page, "approve");
  const code = callbackOf(approved).get("code");
  if (!code) throw new Error("the approval gave no code");
  const exchanged = await exchange(h, clientId, code, pair.verifier);
  if (exchanged.status !== 200) throw new Error(`no tokens: ${await exchanged.text()}`);
  return { clientId, tokens: (await exchanged.json()) as Tokens };
}

/** A connected MCP client of the official SDK with a bearer token. */
export async function mcpClient(h: Harness, bearer: string): Promise<Client> {
  const client = new Client({ name: "oauth-tests", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(at(h, "/mcp")), {
      fetch: (url, init) => h.request(String(url), init),
      requestInit: { headers: { Authorization: `Bearer ${bearer}` } },
    }),
  );
  return client;
}

/** A raw `POST /mcp` of `tools/list` with a bearer token. */
export function listTools(h: Harness, bearer?: string): Promise<Response> {
  return h.request("/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(bearer !== undefined ? { Authorization: `Bearer ${bearer}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
}
