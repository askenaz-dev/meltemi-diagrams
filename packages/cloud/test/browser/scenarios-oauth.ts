/**
 * The authorization server of the MCP endpoint in the real runtime (change agent-mcp, tasks 2.1 to
 * 2.3): a client of its own registers from Node by dynamic registration, with a loopback callback as
 * an agent such as Codex has, and the person answers on the consent page in a real browser, in
 * English and in Spanish. What only a browser and workerd prove is here: the library bundled for
 * workerd with its KV namespace, the page's policy and binding cookie, the form that ends at the
 * client's callback, the code exchanged with PKCE, the token opening `/mcp` and dying with its grant
 * revoked from Connected apps.
 */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import type { Page } from "playwright-core";
import type { Run, Scenario } from "./scenario.js";
import { listen, type Listener } from "./support.js";

/**
 * A picture of the consent page, for a person to look at: only when `CLOUD_TEST_SHOTS` is set, in
 * `meltemi-cloud-browser-shots` of the temporary folder.
 */
async function shot(page: Page, name: string): Promise<void> {
  if (!process.env["CLOUD_TEST_SHOTS"]) return;
  const folder = join(tmpdir(), "meltemi-cloud-browser-shots");
  mkdirSync(folder, { recursive: true });
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(folder, `${name}.png`), fullPage: true });
}

/** A client registered by dynamic registration, its PKCE pair and the authorization address. */
async function startFlow(
  t: Run,
  listener: Listener,
  name: string,
): Promise<{ clientId: string; verifier: string; address: string; callback: string }> {
  const callback = `${listener.origin}/callback`;
  const registered = await t.ask("/oauth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: name,
      redirect_uris: [callback],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    }),
  });
  assert.equal(registered.status, 201, registered.text);
  const clientId = String(registered.json()["client_id"]);
  const verifier = randomBytes(32).toString("base64url");
  const query = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: callback,
    scope: "projects:read projects:write sharing live publish offline_access",
    state: "browser-suite-state",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    resource: `${t.origin}/mcp`,
  });
  return { clientId, verifier, address: `${t.origin}/oauth/authorize?${query}`, callback };
}

export const oauthScenarios: Scenario[] = [
  {
    name: "oauth: an agent registers, the person approves on the consent page, the token opens /mcp and dies when the app is revoked",
    signedIn: "u-ana-oauth",
    async run(t) {
      const { page } = t;
      // Discovery, as a client starts: the challenge names the endpoint's metadata, which names the server.
      const challenge = await t.ask("/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      });
      assert.equal(challenge.status, 401);
      const named = /resource_metadata="([^"]+)"/.exec(
        challenge.headers.get("WWW-Authenticate") ?? "",
      );
      assert.equal(named?.[1], `${t.origin}/.well-known/oauth-protected-resource`);
      const resource = await t.ask(new URL(named![1]!).pathname);
      assert.deepEqual(resource.json()["authorization_servers"], [t.origin]);
      const server = await t.ask("/.well-known/oauth-authorization-server");
      assert.equal(server.json()["registration_endpoint"], `${t.origin}/oauth/register`);
      assert.equal(server.json()["client_id_metadata_document_supported"], true);

      const listener = await listen();
      t.allow(listener.origin);
      try {
        const flow = await startFlow(t, listener, "Codex");
        const response = await page.goto(flow.address);
        assert.equal(response?.status(), 200);
        const headers = response?.headers() ?? {};
        assert.ok(
          headers["content-security-policy"]?.includes(`form-action 'self' ${listener.origin}`),
          headers["content-security-policy"],
        );
        assert.equal(headers["x-frame-options"], "DENY");
        assert.equal(
          (await page.locator("h1").innerText()).trim(),
          "Allow Codex to use your Meltemi Diagrams account?",
        );
        const text = await page.locator("main").innerText();
        assert.match(text, /You are signed in as Ana\./);
        assert.match(text, /This app registered itself: its name is not verified\./);
        assert.match(text, /If you approve, access is sent to 127\.0\.0\.1\./);
        assert.match(text, /An app on this computer/);
        assert.deepEqual(await page.locator(".scope strong").allInnerTexts(), [
          "Read your projects",
          "Change your projects",
          "Share your projects",
          "Run live sessions",
          "Publish catalogs",
          "Stay connected",
        ]);
        // The page moves in, and its scopes after it.
        assert.equal(
          await page.locator(".card").evaluate((card) => getComputedStyle(card).animationName),
          "page-in",
        );
        await shot(page, "oauth-consent-en");

        // Approve: the browser lands on the client's callback with a code, the state and the issuer.
        await Promise.all([
          page.waitForURL((address) => address.origin === listener.origin),
          page.getByRole("button", { name: "Approve", exact: true }).click(),
        ]);
        const landed = new URL(page.url());
        assert.equal(landed.pathname, "/callback");
        assert.equal(landed.searchParams.get("state"), "browser-suite-state");
        assert.equal(landed.searchParams.get("iss"), t.origin);
        const code = landed.searchParams.get("code") ?? "";
        assert.ok(code !== "", "a code");

        // The client exchanges it with its verifier, from Node.
        const exchanged = await t.ask("/oauth/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            code,
            redirect_uri: flow.callback,
            client_id: flow.clientId,
            code_verifier: flow.verifier,
            resource: `${t.origin}/mcp`,
          }).toString(),
        });
        assert.equal(exchanged.status, 200, exchanged.text);
        const tokens = exchanged.json() as {
          access_token: string;
          expires_in: number;
          refresh_token?: string;
        };
        assert.equal(tokens.expires_in, 3600);
        assert.ok(tokens.refresh_token);

        const client = new Client({ name: "browser-suite-oauth", version: "1.0.0" });
        await client.connect(
          new StreamableHTTPClientTransport(new URL(`${t.origin}/mcp`), {
            requestInit: { headers: { Authorization: `Bearer ${tokens.access_token}` } },
          }),
        );
        const who = (await client.callTool({ name: "whoami", arguments: {} })) as {
          structuredContent?: Record<string, unknown>;
        };
        assert.equal(who.structuredContent?.["sub"], "u-ana-oauth");
        assert.deepEqual(who.structuredContent?.["scopes"], [
          "projects:read",
          "projects:write",
          "sharing",
          "live",
          "publish",
        ]);
        await client.close();
        // Never on the API.
        const api = await t.ask("/api/projects", {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        assert.equal(api.status, 401);

        // Connected apps lists it, used; revoking it kills the token at once.
        const apps = await t.ask("/api/account/apps", { headers: t.cookie });
        const grants = apps.json()["grants"] as {
          id: string;
          client: { name: string };
          lastUsedAt: string | null;
        }[];
        assert.equal(grants.length, 1);
        assert.equal(grants[0]?.client.name, "Codex");
        assert.ok(grants[0]?.lastUsedAt, "the call was recorded");
        const revoked = await t.api("DELETE", `/api/account/apps/${grants[0]!.id}`);
        assert.equal(revoked.status, 204);
        const after = await t.ask("/mcp", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${tokens.access_token}`,
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
          },
          body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
        });
        assert.equal(after.status, 401);
        assert.equal(JSON.stringify(listener.arrivals).includes(tokens.access_token), false);
      } finally {
        await listener.close();
      }
    },
  },
  {
    name: "oauth: the consent page in Spanish, and Denegar gives the client access_denied",
    signedIn: "u-ana-oauth-es",
    locale: "es-CL",
    async run(t) {
      const { page } = t;
      const listener = await listen();
      t.allow(listener.origin);
      try {
        const flow = await startFlow(t, listener, "Codex");
        await page.goto(flow.address);
        assert.equal(await page.evaluate(() => document.documentElement.lang), "es");
        assert.equal(
          (await page.locator("h1").innerText()).trim(),
          "¿Permitir que Codex use tu cuenta de Meltemi Diagrams?",
        );
        const text = await page.locator("main").innerText();
        assert.match(text, /Has iniciado sesión como Ana\./);
        assert.match(text, /Si la apruebas, el acceso se envía a 127\.0\.0\.1\./);
        assert.match(text, /Aplicaciones conectadas/);
        assert.deepEqual(await page.locator(".scope strong").allInnerTexts(), [
          "Leer tus proyectos",
          "Cambiar tus proyectos",
          "Compartir tus proyectos",
          "Llevar sesiones en vivo",
          "Publicar catálogos",
          "Seguir conectada",
        ]);
        await page.getByRole("button", { name: "Aprobar", exact: true }).waitFor();
        await shot(page, "oauth-consent-es");
        await Promise.all([
          page.waitForURL((address) => address.origin === listener.origin),
          page.getByRole("button", { name: "Denegar", exact: true }).click(),
        ]);
        const landed = new URL(page.url());
        assert.equal(landed.searchParams.get("error"), "access_denied");
        assert.equal(landed.searchParams.get("state"), "browser-suite-state");
        assert.equal(landed.searchParams.get("code"), null);
        const apps = await t.ask("/api/account/apps", { headers: t.cookie });
        assert.deepEqual(apps.json(), { grants: [] });
      } finally {
        await listener.close();
      }
    },
  },
];
