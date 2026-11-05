// What the Worker logs (`mcp-acceptance`, criterion 29; `docs/cloud.md`, "Configuration"): the cloud
// Worker keeps its own log lines and no invocation logs, so its lines are the whole log, and none
// of them may hold an address, a token, a session id, an invitation's or a live session's link or
// an OAuth code. This drives the routes that carry them, the refusals included, and reads every
// line at every level.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonOf } from "./support/index.js";
import { call, mcp, ok } from "./support/mcp.js";
import {
  authorizeQuery,
  callbackOf,
  consent,
  decide,
  exchange,
  listTools,
  pkce,
  register,
  type Tokens,
} from "./support/oauth.js";

const ANA = "u-ana";
const BOB = "u-bob";
const T = "2026-10-14T12:00:00.000Z";

let said: string[];
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(T) });
  said = [];
  for (const level of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      said.push(args.map(String).join(" "));
    });
  }
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("the Worker's log", () => {
  it("holds no address, token, session id, invitation or live link, nor OAuth code, whatever the routes do", async () => {
    const m = await mcp();
    const secrets: string[] = [];
    const keep = (value: string | null | undefined) => {
      if (value) secrets.push(value);
      return value ?? "";
    };

    // An agent with an API token: a project, an invitation and a live session.
    const token = keep(await m.token(ANA));
    const agent = await m.connect(token);
    const { id } = ok<{ id: string }>(await call(agent, "create_project", { name: "Logged" }));
    const { link: invitation } = ok<{ link: string }>(
      await call(agent, "invite", { project: id, email: "bob@example.com", role: "editor" }),
    );
    const invite = keep(new URL(invitation).searchParams.get("invite"));
    const { link: live } = ok<{ link: string }>(await call(agent, "start_live", { project: id }));
    keep(new URL(live).searchParams.get("live"));
    await call(agent, "get_live", { project: id });
    await call(agent, "get_project", { project: "nope-nope-nope-nope0" });

    // The invitation accepted, and the page opened with both links.
    expect((await m.sendJson(BOB, "POST", `/api/invitations/${invite}/accept`, {})).status).toBe(
      200,
    );
    expect((await m.sendJson(BOB, "POST", "/api/invitations/not-a-token/accept", {})).status).toBe(
      404,
    );
    for (const address of [new URL(invitation), new URL(live)]) {
      await m.h.request(`${address.pathname}${address.search}`);
    }

    // The authorization server: a consent approved, a code exchanged, replayed and refused.
    const { cookie, sid } = await m.h.signedIn({ sub: ANA, sid: "sid-logged" });
    keep(sid);
    const { clientId } = await register(m.h);
    const pair = pkce();
    keep(pair.verifier);
    const page = await consent(m.h, cookie, authorizeQuery(m.h, clientId, pair.challenge));
    keep(page.handle);
    keep(page.csrf);
    const code = keep(callbackOf(await decide(m.h, cookie, page, "approve")).get("code"));
    await exchange(m.h, clientId, code, pkce().verifier);
    const tokens = await jsonOf<Tokens>(await exchange(m.h, clientId, code, pair.verifier));
    keep(tokens.access_token);
    keep(tokens.refresh_token);
    await listTools(m.h, tokens.access_token);
    await listTools(m.h, `${tokens.access_token}x`);
    await exchange(m.h, clientId, code, pair.verifier);
    await m.h.request("/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: "u:g:invented" }),
    });

    // Refusals that log: an identity service that cannot be reached, on a route with a session id.
    m.h.identity.api = () => {
      throw new TypeError("unreachable");
    };
    const revoked = await m.h.request(
      "/api/account/identity/sessions/sid-other-device/revoke",
      m.h.fromPage(cookie, { method: "POST" }),
    );
    expect(revoked.status).toBe(502);
    keep("sid-other-device");
    await listTools(m.h, "mdg_0000000000000000000000000000000000000000000");

    const log = said.join("\n");
    expect(said.some((line) => line.startsWith("cloud: the identity service's POST"))).toBe(true);
    for (const forbidden of ["mdg_", "Bearer", "?invite=", "?live=", "http://", "https://"]) {
      expect(log, forbidden).not.toContain(forbidden);
    }
    for (const secret of secrets) expect(log).not.toContain(secret);
  });
});
