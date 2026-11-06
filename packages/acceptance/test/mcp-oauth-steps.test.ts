import { afterEach, describe, expect, it, vi } from "vitest";
import { Agent, type ToolResult } from "../src/mcp/agent.js";
import { RunLog, runSteps, type Step } from "../src/mcp/harness.js";
import { type Fetch } from "../src/mcp/host.js";
import {
  FIXTURE_CLIENT_PREFIX,
  fixtureSecrets,
  type OAuthFixtures,
} from "../src/mcp/oauth-fixture-format.js";
import { newState, STEPS, type SuiteState } from "../src/mcp/steps.js";

const origin = "https://staging.diagrams.meltemi.dev";
const credential = (grant: string, suffix: string) =>
  `fixture-first:${grant.repeat(16)}:${suffix.repeat(40)}`;
const fixtures: OAuthFixtures = {
  format: 1,
  environment: "staging",
  origin,
  runId: "a".repeat(24),
  firstSub: "fixture-first",
  secondSub: "fixture-second",
  fixtures: {
    normal: {
      clientId: "a".repeat(16),
      accessToken: credential("a", "A"),
      refreshToken: credential("a", "R"),
    },
    narrow: { clientId: "b".repeat(16), accessToken: credential("b", "B") },
    expired: { clientId: "c".repeat(16), accessToken: credential("c", "C") },
    wrongResource: { clientId: "d".repeat(16), accessToken: credential("d", "D") },
  },
  cleanup: { clientIds: ["a", "b", "c", "d"].map((value) => value.repeat(16)) },
};

afterEach(() => vi.restoreAllMocks());

function setup(fetcher: Fetch, recordOAuthClient?: SuiteState["recordOAuthClient"]) {
  const lines: string[] = [];
  const log = new RunLog((line) => lines.push(line));
  for (const value of fixtureSecrets(fixtures)) log.secrets.add(value);
  return {
    state: newState({
      target: { origin, endpoint: `${origin}/mcp` },
      capabilities: { token: true, token2: true, grant: true },
      tokens: {},
      oauthFixtures: fixtures,
      runId: fixtures.runId,
      ...(recordOAuthClient ? { recordOAuthClient } : {}),
      fetcher,
    }),
    log,
    lines,
  };
}

async function runCase(name: string, state: SuiteState, log: RunLog) {
  const tested = STEPS.find((step) => step.name.startsWith(name))!;
  const dependencies: Step<SuiteState>[] = (tested.after ?? []).map((name) => ({
    name,
    criterion: null,
    async run() {},
  }));
  return runSteps([...dependencies, tested], state, state.capabilities, log);
}

const denied = () => new Response("{}", { status: 401, headers: { "WWW-Authenticate": "Bearer" } });

describe("the public client's cleanup receipt", () => {
  it("registers publicly and records only that returned client before checking resources", async () => {
    const receipt = vi.fn();
    const { state, log } = setup(async (url, init) => {
      if (new URL(url).pathname === "/oauth/register") {
        expect(JSON.parse(String(init?.body)).client_name).toBe(
          `${FIXTURE_CLIENT_PREFIX}${fixtures.runId}-registration`,
        );
        return Response.json({ client_id: "e".repeat(16) }, { status: 201 });
      }
      expect(receipt).toHaveBeenCalledOnce();
      return new URL(url).searchParams.get("resource") === "https://other.example/mcp"
        ? new Response("{}", { status: 400 })
        : new Response(null, {
            status: 302,
            headers: { Location: "https://id.meltemi.dev/login" },
          });
    }, receipt);
    state.capabilities.oauth = true;
    state.oauth = {
      registration: `${origin}/oauth/register`,
      authorization: `${origin}/oauth/authorize`,
    };
    const outcome = await runCase("27 a wrong resource", state, log);
    expect(outcome.passed).toBe(true);
    expect(receipt).toHaveBeenCalledWith({
      clientId: "e".repeat(16),
      clientName: `${FIXTURE_CLIENT_PREFIX}${fixtures.runId}-registration`,
    });
  });

  it("fails a hosted registration limit rather than hiding it as a skip", async () => {
    const { state, log } = setup(
      async () => new Response("{}", { status: 429 }),
      () => {},
    );
    state.capabilities.oauth = true;
    state.oauth = { registration: `${origin}/oauth/register` };
    const outcome = await runCase("27 a wrong resource", state, log);
    expect(outcome.results.at(-1)).toMatchObject({ outcome: "failed" });
    expect(outcome.results.at(-1)?.error).toContain("registration limit");
  });

  it("does not register a client if its cleanup receipt cannot be recorded", async () => {
    const fetcher = vi.fn<Fetch>();
    const { state, log } = setup(fetcher);
    state.capabilities.oauth = true;
    state.oauth = { registration: `${origin}/oauth/register` };
    const outcome = await runCase("27 a wrong resource", state, log);
    expect(outcome.passed).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("preprovisioned OAuth access acceptance", () => {
  it("checks expiry/resource at the real MCP path and refuses a narrow token's write", async () => {
    const asked: string[] = [];
    const { state, log, lines } = setup(async (url, init) => {
      expect(url).toBe(`${origin}/mcp`);
      asked.push(new Headers(init?.headers).get("Authorization") ?? "");
      return denied();
    });
    const narrow = {
      ok: vi.fn(async (name: string) =>
        name === "whoami"
          ? { sub: fixtures.firstSub, scopes: ["projects:read"] }
          : { projects: [] },
      ),
      call: vi.fn(async (): Promise<ToolResult> => ({
        isError: true,
        content: [],
        structuredContent: { code: "scope.insufficient", scope: "projects:write" },
      })),
      close: vi.fn(async () => {}),
    };
    vi.spyOn(Agent, "connect").mockResolvedValue(narrow as unknown as Agent);
    const outcome = await runCase("27 an expired", state, log);
    expect(outcome.passed).toBe(true);
    expect(asked).toEqual(
      [fixtures.fixtures.expired, fixtures.fixtures.wrongResource].map(
        (value) => `Bearer ${value.accessToken}`,
      ),
    );
    expect(narrow.call).toHaveBeenCalledWith("create_project", expect.any(Object));
    expect(narrow.close).toHaveBeenCalledOnce();
    for (const secret of fixtureSecrets(fixtures)) expect(lines.join("\n")).not.toContain(secret);
  });

  it("fails when an expired credential is accepted", async () => {
    const { state, log } = setup(async () => new Response("{}"));
    const outcome = await runCase("27 an expired", state, log);
    expect(outcome.passed).toBe(false);
    expect(outcome.results.at(-1)?.error).toContain("OAuth access credential is refused");
  });

  it("tracks an unexpected narrow write for cleanup before failing and redacts SDK errors", async () => {
    const { state, log, lines } = setup(async () => denied());
    vi.spyOn(Agent, "connect").mockResolvedValue({
      ok: async () => ({ sub: fixtures.firstSub, scopes: ["projects:read"] }),
      call: async () => ({ content: [], structuredContent: { id: "unexpected-project" } }),
      close: async () => {},
    } as unknown as Agent);
    const outcome = await runCase("27 an expired", state, log);
    expect(outcome.passed).toBe(false);
    expect(state.created).toEqual(["unexpected-project"]);
    vi.spyOn(Agent, "connect").mockRejectedValue(
      new Error(`SDK refused ${fixtures.fixtures.narrow.accessToken}`),
    );
    const failure = await runCase("27 an expired", state, log);
    expect(failure.results.at(-1)?.error).toBe("SDK refused [redacted]");
    expect(lines.join("\n")).not.toContain(fixtures.fixtures.narrow.accessToken);
  });
});

describe("refresh and revocation acceptance", () => {
  it.each([
    "correct",
    "old refresh accepted",
    "access survives revocation",
    "refresh survives revocation",
  ] as const)("enforces the deployed lifecycle: %s", async (behavior) => {
    const one = {
      access_token: credential("a", "E"),
      refresh_token: credential("a", "F"),
      token_type: "Bearer",
    };
    const two = {
      access_token: credential("a", "G"),
      refresh_token: credential("a", "H"),
      token_type: "Bearer",
    };
    let refreshed = false;
    let revoked = false;
    const calls: URLSearchParams[] = [];
    const { state, log, lines } = setup(async (url, init) => {
      if (new URL(url).pathname === "/mcp") {
        expect(revoked).toBe(true);
        return behavior === "access survives revocation" ? new Response("{}") : denied();
      }
      expect(url).toBe(`${origin}/oauth/token`);
      const fields = new URLSearchParams(String(init?.body));
      calls.push(fields);
      expect(fields.get("client_id")).toBe(fixtures.fixtures.normal.clientId);
      if (!fields.has("grant_type")) {
        expect(fields.get("token_type_hint")).toBe("refresh_token");
        expect(fields.get("token")).toBe(two.refresh_token);
        revoked = true;
        return Response.json({});
      }
      const refresh = fields.get("refresh_token");
      if (revoked)
        return behavior === "refresh survives revocation"
          ? Response.json(two)
          : Response.json({ error: "invalid_grant" }, { status: 400 });
      if (refresh === fixtures.fixtures.normal.refreshToken && !refreshed) {
        refreshed = true;
        return Response.json(one);
      }
      if (refresh === one.refresh_token) return Response.json(two);
      return behavior === "old refresh accepted"
        ? Response.json(two)
        : Response.json({ error: "invalid_grant" }, { status: 400 });
    });
    vi.spyOn(Agent, "connect").mockResolvedValue({
      ok: async () => ({ sub: fixtures.firstSub }),
      close: async () => {},
    } as unknown as Agent);
    const outcome = await runCase("28 a refresh token rotates", state, log);
    expect(outcome.passed).toBe(behavior === "correct");
    expect(calls.slice(0, 3).map((fields) => fields.get("refresh_token"))).toEqual([
      fixtures.fixtures.normal.refreshToken,
      one.refresh_token,
      fixtures.fixtures.normal.refreshToken,
    ]);
    for (const secret of [
      ...fixtureSecrets(fixtures),
      ...Object.values(one),
      ...Object.values(two),
    ].filter((value) => value !== "Bearer"))
      expect(lines.join("\n")).not.toContain(secret);
  });
});
