import { createServer, type IncomingMessage, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { compile } from "@meltemi/diagrams-model";
import { REPO_ROOT } from "../../../test-support/corpus.js";
// @ts-expect-error The generator is a plain script.
import { guideSource } from "../../../scripts/assist-guide.mjs";
import {
  AssistError,
  DEFAULT_ANTHROPIC_MODEL,
  GUIDE_PAGES,
  adapterFor,
  anthropicAdapter,
  applyProposal,
  buildProposal,
  describeDisclosure,
  disclosure,
  openAiCompatibleAdapter,
  parseAnswer,
  propose,
  requestMessage,
  systemPrompt,
  type ModelAdapter,
} from "../src/index.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

interface Seen {
  path: string;
  headers: IncomingMessage["headers"];
  body: Record<string, unknown>;
}

let server: Server;
let base = "";
const seen: Seen[] = [];
let reply: (seen: Seen) => { status: number; body: unknown } = () => ({ status: 200, body: {} });

beforeAll(async () => {
  server = createServer((req, res) => {
    let text = "";
    req.on("data", (chunk) => (text += chunk));
    req.on("end", () => {
      const entry = { path: req.url ?? "", headers: req.headers, body: JSON.parse(text || "{}") };
      seen.push(entry);
      const { status, body } = reply(entry);
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const KEY = "sk-test-0123456789";

describe("adapters", () => {
  it("call Anthropic's Messages API with the key in its header and the newest model", async () => {
    reply = () => ({
      status: 200,
      body: { content: [{ type: "text", text: '{"summary":"ok"}' }], stop_reason: "end_turn" },
    });
    const adapter = anthropicAdapter({ apiKey: KEY, baseUrl: base });
    expect(adapter).toMatchObject({
      provider: "anthropic",
      model: DEFAULT_ANTHROPIC_MODEL,
      remote: false,
    });
    const text = await adapter.complete({
      system: "S",
      messages: [{ role: "user", content: "U" }],
    });
    expect(text).toBe('{"summary":"ok"}');
    const request = seen.at(-1)!;
    expect(request.path).toBe("/v1/messages");
    expect(request.headers["x-api-key"]).toBe(KEY);
    expect(request.headers["anthropic-version"]).toBe("2023-06-01");
    expect(request.body).toMatchObject({
      model: "claude-opus-5-5",
      system: "S",
      messages: [{ role: "user", content: "U" }],
    });
  });

  it("call OpenAI-compatible endpoints and never show the key in errors", async () => {
    reply = () => ({
      status: 200,
      body: { choices: [{ message: { content: "hello" }, finish_reason: "stop" }] },
    });
    const adapter = openAiCompatibleAdapter({
      baseUrl: `${base}/v1/`,
      model: "llama",
      apiKey: KEY,
    });
    expect(
      await adapter.complete({ system: "S", messages: [{ role: "user", content: "U" }] }),
    ).toBe("hello");
    const request = seen.at(-1)!;
    expect(request.path).toBe("/v1/chat/completions");
    expect(request.headers.authorization).toBe(`Bearer ${KEY}`);
    expect(request.body.messages).toEqual([
      { role: "system", content: "S" },
      { role: "user", content: "U" },
    ]);
    reply = () => ({ status: 401, body: { error: { message: `Invalid key ${KEY}` } } });
    const failure = await adapter.complete({ system: "S", messages: [] }).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(AssistError);
    expect((failure as AssistError).message).toBe(
      "The provider answered 401: Invalid key [redacted]",
    );
    reply = () => ({
      status: 200,
      body: { choices: [{ message: { content: "x" }, finish_reason: "length" }] },
    });
    await expect(adapter.complete({ system: "S", messages: [] })).rejects.toThrow(/cut off/);
  });

  it("are configured from settings and the environment, never from projects", () => {
    expect(adapterFor({}, {})).toMatch(/^No AI provider is set/);
    expect(adapterFor({ provider: "anthropic" }, {})).toBe(
      "Anthropic needs a key in ANTHROPIC_API_KEY.",
    );
    const claude = adapterFor({}, { ANTHROPIC_API_KEY: KEY }) as ModelAdapter;
    expect(claude).toMatchObject({
      provider: "anthropic",
      remote: true,
      endpoint: "https://api.anthropic.com",
    });
    expect(adapterFor({ provider: "openai-compatible" }, {})).toMatch(/MELTEMI_AI_BASE_URL/);
    const local = adapterFor(
      {},
      {
        MELTEMI_AI_PROVIDER: "openai-compatible",
        MELTEMI_AI_BASE_URL: base,
        MELTEMI_AI_MODEL: "m",
      },
    ) as ModelAdapter;
    expect(local).toMatchObject({ remote: false, model: "m" });
    expect(adapterFor({ provider: "other" }, {})).toMatch(/Unknown AI provider/);
  });
});

const SHEET = `language "0.2"

// The checkout flow.
diagram checkout: flow {
  layout manual
  client["Client"]
  api["API"]
  client -> api: "HTTPS" as request
  placement {
    place client at (80, 80)
    place api at (320, 80)
  }
}

story tour for checkout {
  scene first {
    reveal client, api
  }
}
`;

const check = (text: string) => compile(text).diagnostics;

describe("proposals", () => {
  it("read the JSON of an answer, fenced or not", () => {
    expect(parseAnswer('Sure!\n```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    expect(parseAnswer('{"b": [2]} trailing')).toEqual({ b: [2] });
    expect(() => parseAnswer("no json")).toThrow(/no JSON object/);
  });

  const modify = buildProposal({
    operation: "modify",
    path: "diagrams/checkout.meltemi",
    baseText: SHEET,
    provider: "test",
    model: "m",
    answer: {
      summary: "Adds a database",
      changes: [
        {
          action: "replace",
          block: "diagram checkout",
          text: `diagram checkout: flow {
  layout manual
  client["Client"]
  api["API"]
  db[("Orders")]
  client -> api: "HTTPS" as request
  api -> db: "SQL" as store
  placement {
    place client at (80, 80)
    place api at (320, 80)
    place db at (560, 80)
  }
}`,
          reason: "Orders are stored",
        },
        {
          action: "add",
          block: "diagram data",
          text: 'diagram data: flow {\n  db[("Orders")]\n}',
          reason: "A data view",
        },
        { action: "remove", block: "story tour", reason: "Outdated" },
        { action: "replace", block: "diagram missing", text: "x", reason: "ignored" },
      ],
    },
  });

  it("list items with what each changes by itself", () => {
    expect(modify.items.map((i) => [i.id, i.action, i.block])).toEqual([
      [1, "replace", "diagram checkout"],
      [2, "add", "diagram data"],
      [3, "remove", "story tour"],
    ]);
    expect(modify.items[0]!.changes.map((c) => `${c.kind} ${c.subject} ${c.id}`)).toEqual([
      "added element db",
      "added relation store",
    ]);
    expect(modify.items[2]!.changes.map((c) => `${c.kind} ${c.subject} ${c.id}`)).toEqual([
      "removed story tour",
    ]);
  });

  it("apply part of a proposal, keeping comments and the rest", () => {
    const result = applyProposal(modify, SHEET, [1], check);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toContain("// The checkout flow.");
    expect(result.text).toContain('api -> db: "SQL" as store');
    expect(result.text).toContain("story tour for checkout");
    expect(result.text).not.toContain("diagram data");
    const all = applyProposal(modify, SHEET, [1, 2, 3], check);
    expect(all.ok && all.text).toContain('diagram data: flow {\n  db[("Orders")]\n}\n');
    expect(all.ok && all.text).not.toContain("story tour");
  });

  it("reconcile with a file that changed since: changed blocks conflict, the rest applies", () => {
    const edited = SHEET.replace('api["API"]', 'api["API Gateway"]');
    const result = applyProposal(modify, edited, [1, 2], check);
    expect(result).toMatchObject({ ok: true, applied: [2], conflicts: [1] });
    expect(result.ok && result.text).toContain('api["API Gateway"]');
  });

  it("refuse what adds errors", () => {
    const broken = buildProposal({
      operation: "modify",
      path: "a.meltemi",
      baseText: SHEET,
      provider: "t",
      model: "m",
      answer: {
        changes: [
          {
            action: "add",
            block: "story more",
            text: "story more for nowhere {\n  scene a {\n    hold 1s\n  }\n}",
          },
        ],
      },
    });
    const result = applyProposal(broken, SHEET, [1], check);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.problems[0]).toMatch(/story\.unknown-diagram/);
  });

  it("add relations as assumptions", () => {
    const relations = buildProposal({
      operation: "relations",
      path: "a.meltemi",
      baseText: SHEET,
      provider: "t",
      model: "m",
      answer: {
        relations: [
          {
            block: "diagram checkout",
            from: "api",
            to: "client",
            label: "Response",
            reason: "Requests get answers",
          },
          { block: "diagram nowhere", from: "a", to: "b", reason: "ignored" },
        ],
      },
    });
    expect(relations.items.map((i) => i.text)).toEqual([
      'api -> client: "Response" { assumption "Requests get answers" }',
    ]);
    const result = applyProposal(relations, SHEET, [1], check);
    expect(result.ok).toBe(true);
    const text = result.ok ? result.text : "";
    expect(text).toContain(
      '  client -> api: "HTTPS" as request\n  api -> client: "Response" { assumption "Requests get answers" }\n  placement {',
    );
    const relation = compile(text).document.diagrams[0]!.relations[1]!;
    expect(relation.assumption).toBe("Requests get answers");
  });

  it("create a new file", () => {
    const created = buildProposal({
      operation: "generate",
      path: "new.meltemi",
      baseText: "",
      provider: "t",
      model: "m",
      answer: { summary: "A flow", file: 'language "0.2"\n\ndiagram x: flow {\n  a -> b\n}' },
    });
    expect(created.items[0]!.changes.map((c) => `${c.kind} ${c.subject} ${c.id}`)).toEqual([
      "added diagram x",
    ]);
    const result = applyProposal(created, "", [1], check);
    expect(result.ok && result.text).toBe('language "0.2"\n\ndiagram x: flow {\n  a -> b\n}\n');
  });
});

/** An adapter that answers from a list and records the conversation. */
function scripted(
  answers: string[],
): ModelAdapter & { calls: { system: string; messages: { role: string; content: string }[] }[] } {
  const calls: { system: string; messages: { role: string; content: string }[] }[] = [];
  return {
    provider: "test",
    model: "scripted",
    endpoint: "http://127.0.0.1",
    remote: false,
    calls,
    complete: async (request) => {
      calls.push({ system: request.system, messages: request.messages.map((m) => ({ ...m })) });
      return answers.shift() ?? "{}";
    },
  };
}

describe("requests", () => {
  const request = {
    operation: "modify" as const,
    path: "diagrams/checkout.meltemi",
    text: SHEET,
    instruction: "Add a database for orders",
    shared: [
      {
        path: "models/m.meltemi",
        text: 'language "0.2"\n\nmodel m {\n  person p "P"\n}\n',
        reason: "imported by it",
      },
    ],
  };

  it("send the guide pages the files need, the file and its imports, and say so first", () => {
    const system = systemPrompt(["language", "c4"]);
    expect(system).toContain("Answer with exactly one JSON object");
    expect(system).toContain('<guide page="c4">');
    const message = requestMessage(request);
    expect(message).toContain('<file path="diagrams/checkout.meltemi">');
    expect(message).toContain('<file path="models/m.meltemi">');
    expect(message).toContain("<request>\nAdd a database for orders\n</request>");
    const adapter = scripted([]);
    expect(describeDisclosure(disclosure(request, adapter))).toEqual([
      "This request goes to test (scripted) at http://127.0.0.1, on this machine, with:",
      `  diagrams/checkout.meltemi (${new TextEncoder().encode(SHEET).length} B, the file)`,
      "  models/m.meltemi (43 B, imported by it)",
      "  your request (25 characters)",
      "  the language guide",
    ]);
  });

  it("send errors back once and keep the corrected answer", async () => {
    const bad = JSON.stringify({
      summary: "x",
      changes: [
        {
          action: "add",
          block: "story more",
          text: "story more for nowhere {\n  scene a {\n    hold 1s\n  }\n}",
        },
      ],
    });
    const good = JSON.stringify({
      summary: "A second story",
      changes: [
        {
          action: "add",
          block: "story more",
          text: "story more for checkout {\n  scene a {\n    hold 1s\n  }\n}",
        },
      ],
    });
    const adapter = scripted([`Here it is: ${bad}`, good]);
    const proposal = await propose(request, { adapter, check });
    expect(proposal.problems).toEqual([]);
    expect(proposal.summary).toBe("A second story");
    expect(adapter.calls).toHaveLength(2);
    expect(adapter.calls[0]!.system).toContain('<guide page="c4">');
    const followUp = adapter.calls[1]!.messages.at(-1)!.content;
    expect(followUp).toMatch(
      /^Applying every change gives these errors:\n- \d+:\d+ story\.unknown-diagram/,
    );
  });

  it("keeps the problems when the answer stays wrong", async () => {
    const bad = JSON.stringify({
      changes: [
        {
          action: "add",
          block: "story more",
          text: "story more for nowhere {\n  scene a {\n    hold 1s\n  }\n}",
        },
      ],
    });
    const proposal = await propose(request, { adapter: scripted([bad, bad]), check });
    expect(proposal.problems[0]).toMatch(/story\.unknown-diagram/);
  });
});

describe("guide", () => {
  it("is the skill's language references", () => {
    expect(readFileSync(join(REPO_ROOT, "packages", "assist", "src", "guide.ts"), "utf8")).toBe(
      guideSource(REPO_ROOT),
    );
    expect(Object.keys(GUIDE_PAGES)).toEqual(["language", "sequence", "c4", "free", "stories"]);
  });
});
