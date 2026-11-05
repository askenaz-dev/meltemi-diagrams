// The MCP acceptance suite's own rules (change agent-mcp, `mcp-acceptance`): the scan of its log, how
// steps are skipped and failed, the criteria its steps cover, what a run without tokens does, and
// how a host that does not answer is told apart. The suite's run against a Worker is
// `pnpm acceptance:mcp` (docs/quality/mcp-acceptance.md).
import { describe, expect, it } from "vitest";
import {
  AUTOMATED_CRITERIA,
  MANUAL_CRITERIA,
  NEED_REASONS,
  RunLog,
  runSteps,
  scanLine,
  Skip,
  type Step,
} from "../src/mcp/harness.js";
import { probe, targetFrom, type Fetch } from "../src/mcp/host.js";
import { newState, PREFIX, STEPS, type SuiteState } from "../src/mcp/steps.js";

const TOKEN = `mdg_${"x".repeat(43)}`;

/** A log that prints nowhere, keeping what it would have printed. */
function quietLog() {
  const printed: string[] = [];
  return { log: new RunLog((line) => printed.push(line)), printed };
}

describe("the scan of the suite's log", () => {
  it.each([
    ["an API token", `token ${TOKEN}`, "token mdg_[redacted]"],
    ["a bare prefix", "mdg_", "mdg_[redacted]"],
    [
      "a bearer credential",
      "Authorization: Bearer abc.def-ghi",
      "Authorization: Bearer [redacted]",
    ],
    [
      "an invitation's link",
      "https://diagrams.meltemi.dev/p/abc?invite=Zx9_secret",
      "https://diagrams.meltemi.dev/p/abc?invite=[redacted]",
    ],
    [
      "the address that accepts an invitation",
      "POST /api/invitations/AbCdEfGhIjKlMnOpQrSt_123/accept 200",
      "POST /api/invitations/[redacted] 200",
    ],
    ["a live session's link", "/?project=abc&live=tok3n", "/?project=abc&live=[redacted]"],
    [
      "an authorization code",
      "http://127.0.0.1/callback?code=c0de&state=s",
      "http://127.0.0.1/callback?code=[redacted]&state=s",
    ],
  ])("finds and redacts %s", (_, line, redacted) => {
    expect(scanLine(line)).toEqual({ leaked: true, line: redacted });
  });

  it("finds a secret value of the run wherever it is, but not a short one", () => {
    expect(scanLine("the value s3cr3t-value-123 here", ["s3cr3t-value-123"])).toEqual({
      leaked: true,
      line: "the value [redacted] here",
    });
    expect(scanLine("a b c", ["a"]).leaked).toBe(false);
  });

  it.each([
    'WWW-Authenticate: Bearer resource_metadata="https://x/.well-known/oauth-protected-resource"',
    "the 401 carries WWW-Authenticate: Bearer",
    "code_challenge_method=S256",
    "POST /api/invitations/short/accept",
    "mdg_[redacted] and ?invite=[redacted] and Bearer [redacted]",
  ])("leaves %s alone", (line) => {
    expect(scanLine(line)).toEqual({ leaked: false, line });
  });
});

/** A step that runs `body`, for the harness's tests. */
const step = (
  name: string,
  body: Step<object>["run"],
  extra: Partial<Step<object>> = {},
): Step<object> => ({ name, criterion: 2, run: body, ...extra });

describe("the steps of a run", () => {
  it("fails a step whose log held a secret, names it, and never prints the secret", async () => {
    const { log, printed } = quietLog();
    log.secrets.add(TOKEN);
    const outcome = await runSteps(
      [
        step("leaky", async ({ log: write }) => write(`the token is ${TOKEN}`)),
        step("clean", async ({ log: write }) => write("nothing here")),
      ],
      {},
      { token: true, token2: true },
      log,
    );
    expect(outcome.passed).toBe(false);
    expect(outcome.leaks).toEqual(["leaky"]);
    expect(outcome.results.map((r) => [r.step, r.outcome])).toEqual([
      ["leaky", "failed"],
      ["clean", "passed"],
    ]);
    expect(outcome.results[0]!.error).toMatch(/held a token/);
    expect(printed.join("\n")).not.toContain(TOKEN);
    expect(printed.join("\n")).not.toMatch(/mdg_x/);
  });

  it("redacts a failure's message, skips what builds on it, and says why", async () => {
    const { log, printed } = quietLog();
    const outcome = await runSteps(
      [
        step("first", async ({ secret }) => {
          secret("a-link-that-opens-it");
          throw new Error("refused at https://x/p/1?invite=abcdef and a-link-that-opens-it");
        }),
        step("second", async () => undefined, { after: ["first"] }),
        step("third", async () => {
          throw new Skip("nothing to check here");
        }),
        step("fourth", async () => undefined, { needs: ["token2"] }),
        step("fifth", async () => undefined, { needs: ["grant"] }),
      ],
      {},
      { token: true, token2: false },
      log,
    );
    expect(outcome.passed).toBe(false);
    const [first, second, third, fourth, fifth] = outcome.results;
    expect(first).toMatchObject({ outcome: "failed" });
    expect(first!.error).toBe("refused at https://x/p/1?invite=[redacted] and [redacted]");
    expect(second).toMatchObject({
      outcome: "skipped",
      reason: 'builds on "first", which was failed',
    });
    expect(third).toMatchObject({ outcome: "skipped", reason: "nothing to check here" });
    expect(fourth).toMatchObject({ outcome: "skipped", reason: NEED_REASONS.token2 });
    expect(fifth).toMatchObject({ outcome: "skipped", reason: NEED_REASONS.grant });
    expect(printed.join("\n")).not.toMatch(/abcdef|a-link-that-opens-it/);
  });

  it("passes a run with skipped steps only when none failed", async () => {
    const { log } = quietLog();
    const outcome = await runSteps(
      [
        step("ran", async () => undefined),
        step("not", async () => undefined, { needs: ["token"] }),
      ],
      {},
      { token: false, token2: false },
      log,
    );
    expect(outcome.passed).toBe(true);
    expect(outcome.results.map((r) => r.outcome)).toEqual(["passed", "skipped"]);
  });
});

describe("the suite's steps", () => {
  it("cover criteria 2 to 6, 10 to 23 and 24 to 29, and none of the procedure's", () => {
    const covered = new Set(STEPS.map((s) => s.criterion).filter((c): c is number => c !== null));
    expect([...covered].sort((a, b) => a - b)).toEqual([...AUTOMATED_CRITERIA]);
    for (const criterion of [1, 7, 8, 9]) expect(covered.has(criterion)).toBe(false);
    expect(MANUAL_CRITERIA).toEqual([1, 7, 8, 9, 16]);
  });

  it("are named by their criterion, once each, and build only on earlier steps", () => {
    const names = STEPS.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
    STEPS.forEach((s, i) => {
      if (s.criterion === null) expect(s.name).toMatch(/^(connect|cleanup): /);
      else expect(s.name.startsWith(`${s.criterion} `)).toBe(true);
      for (const earlier of s.after ?? []) {
        expect(names.indexOf(earlier), `${s.name} builds on ${earlier}`).toBeGreaterThanOrEqual(0);
        expect(names.indexOf(earlier)).toBeLessThan(i);
      }
    });
    // The cleanup comes after every step that makes something, and the scan of the log last.
    expect(names.at(-2)).toMatch(/^cleanup: /);
    expect(STEPS.at(-1)!.criterion).toBe(29);
    expect(PREFIX).toBe("mcp-acceptance-");
  });
});

/** A host that answers like the endpoint before the authorization server: 401 with a challenge. */
const challengeOnly: Fetch = async (input) => {
  const path = new URL(input).pathname;
  if (path.startsWith("/.well-known/")) return new Response("{}", { status: 404 });
  if (path === "/mcp") {
    return new Response('{"code":"auth.required"}', {
      status: 401,
      headers: { "WWW-Authenticate": "Bearer" },
    });
  }
  return new Response("", { status: 404 });
};

function stateFor(fetcher: Fetch, token = false): SuiteState {
  return newState({
    target: { origin: "https://staging.example", endpoint: "https://staging.example/mcp" },
    capabilities: { token, token2: false },
    tokens: {},
    fetcher,
    runId: "test",
  });
}

describe("a run without tokens", () => {
  it("checks what anybody sees and reports every other step skipped with its reason", async () => {
    const { log } = quietLog();
    const state = stateFor(challengeOnly);
    const outcome = await runSteps(STEPS, state, state.capabilities, log);
    expect(outcome.passed).toBe(true);
    const ran = outcome.results.filter((r) => r.outcome === "passed").map((r) => r.step);
    expect(ran).toEqual([
      "27 initialize and tools/list without a token: 401 with the challenge",
      "27 a token the service did not issue: 401",
      "29 nothing that grants access is in the run's log",
    ]);
    const skipped = outcome.results.filter((r) => r.outcome === "skipped");
    expect(skipped.length).toBe(STEPS.length - 3);
    for (const result of skipped) expect(result.reason, result.step).toBeTruthy();
    expect(
      skipped.find((r) => r.step === "2 a project created in the account answers its address"),
    ).toMatchObject({ reason: NEED_REASONS.token });
    expect(state.capabilities.oauth).toBe(false);
  });

  it("fails when the endpoint answers without a token", async () => {
    const { log } = quietLog();
    const open: Fetch = async (input) =>
      new URL(input).pathname === "/mcp"
        ? new Response('{"result":{"tools":[]}}', { status: 200 })
        : new Response("", { status: 404 });
    const state = stateFor(open);
    const outcome = await runSteps(STEPS, state, state.capabilities, log);
    expect(outcome.passed).toBe(false);
    expect(outcome.results.filter((r) => r.outcome === "failed").map((r) => r.step)).toEqual([
      "27 initialize and tools/list without a token: 401 with the challenge",
      "27 a token the service did not issue: 401",
    ]);
  });
});

describe("the host", () => {
  const target = { origin: "https://staging.example", endpoint: "https://staging.example/mcp" };

  it("does not answer when its name does not resolve or Cloudflare has nothing behind it", async () => {
    const unresolved: Fetch = async () => {
      throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } });
    };
    expect(await probe(target, unresolved)).toEqual({ answers: false, why: "ENOTFOUND" });
    const unserved: Fetch = async () => new Response("error code: 1016", { status: 530 });
    expect(await probe(target, unserved)).toEqual({
      answers: false,
      why: "Cloudflare answered 530",
    });
    expect(await probe(target, challengeOnly)).toEqual({ answers: true, why: "HTTP 401" });
  });

  it("is read from MELTEMI_ORIGIN or MELTEMI_MCP_URL", () => {
    expect(targetFrom({ MELTEMI_ORIGIN: "https://staging.diagrams.meltemi.dev/" })).toEqual({
      origin: "https://staging.diagrams.meltemi.dev",
      endpoint: "https://staging.diagrams.meltemi.dev/mcp",
    });
    expect(targetFrom({ MELTEMI_MCP_URL: "http://127.0.0.1:8788/mcp" })).toEqual({
      origin: "http://127.0.0.1:8788",
      endpoint: "http://127.0.0.1:8788/mcp",
    });
    expect(targetFrom({})).toBeUndefined();
    expect(targetFrom({ MELTEMI_ORIGIN: "ftp://example" })).toBeUndefined();
  });
});
