import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { compile } from "@meltemi/diagrams-model";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
import { run } from "../src/index.js";

const scratch = mkdtempSync(join(tmpdir(), "mdg-assist-"));
const project = join(scratch, "architecture");
cpSync(join(CORPUS_ROOT, "projects", "valid", "architecture"), project, { recursive: true });

let server: Server;
let env: Record<string, string> = {};
const bodies: { messages: { role: string; content: string }[] }[] = [];
let answers: string[] = [];
let status = 200;

beforeAll(async () => {
  server = createServer((req, res) => {
    let text = "";
    req.on("data", (chunk) => (text += chunk));
    req.on("end", () => {
      bodies.push(JSON.parse(text));
      res.writeHead(status, { "content-type": "application/json" });
      res.end(
        JSON.stringify(
          status === 200
            ? {
                choices: [{ message: { content: answers.shift() ?? "{}" }, finish_reason: "stop" }],
              }
            : { error: { message: "The model is busy" } },
        ),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  env = {
    MELTEMI_AI_PROVIDER: "openai-compatible",
    MELTEMI_AI_BASE_URL: `http://127.0.0.1:${port}/v1`,
    MELTEMI_AI_MODEL: "local-model",
  };
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(scratch, { recursive: true, force: true });
});

async function mdg(args: string[], options: { ask?: string; env?: Record<string, string> } = {}) {
  let stdout = "";
  let stderr = "";
  const code = await run(args, {
    stdout: (t) => (stdout += t),
    stderr: (t) => (stderr += t),
    cwd: scratch,
    env: options.env ?? env,
    ...(options.ask !== undefined ? { ask: async () => options.ask! } : {}),
  });
  return { code, stdout, stderr };
}

const CONTAINERS = join("architecture", "diagrams", "containers.meltemi");
const RENAME = JSON.stringify({
  summary: "Clearer label for the API",
  changes: [
    {
      action: "replace",
      block: "diagram containers",
      text: `diagram containers: c4 using commerce {
  level container
  scope shop
  layout assisted
  direction TB
  label shop.api "API de compras"

  placement {
    place customer at (141, 64)
    place shop.web at (141, 360)
    place shop.api at (141, 605)
    place shop.db at (113, 843)
    place bank at (218, 1107)
  }
}`,
      reason: "The API takes purchases",
    },
  ],
});

describe("assist", () => {
  it("needs a provider, and validation never does", async () => {
    const { code, stderr } = await mdg(["assist", "modify", CONTAINERS, "--prompt", "x"], {
      env: {},
    });
    expect(code).toBe(2);
    expect(stderr).toContain("No AI provider is set");
  });

  it("sends nothing without a yes, after saying what it would send", async () => {
    const before = bodies.length;
    const refused = await mdg(["assist", "modify", CONTAINERS, "--prompt", "Rename the API"]);
    expect(refused.code).toBe(2);
    expect(refused.stderr).toContain(
      "This request goes to openai-compatible (local-model) at http://127.0.0.1:",
    );
    expect(refused.stderr).toContain("  diagrams/containers.meltemi (");
    expect(refused.stderr).toContain("  models/commerce.meltemi (");
    expect(refused.stderr).toContain("nothing was sent");
    const declined = await mdg(["assist", "modify", CONTAINERS, "--prompt", "Rename the API"], {
      ask: "n",
    });
    expect(declined.code).toBe(2);
    expect(bodies.length).toBe(before);
  });

  it("proposes, saves and applies part of a change, with project-relative paths only", async () => {
    answers = [RENAME];
    const { code, stdout } = await mdg(
      ["assist", "modify", CONTAINERS, "--prompt", "Rename the API", "--save", "proposal.json"],
      { ask: "yes" },
    );
    expect(code).toBe(0);
    expect(stdout).toContain("1. replace diagram containers: The API takes purchases");
    expect(stdout).toContain(
      '~ element shop.api "API de compras": label "API de pedidos" → "API de compras"',
    );
    const sent = JSON.stringify(bodies.at(-1));
    expect(sent).toContain('<file path=\\"diagrams/containers.meltemi\\">');
    expect(sent).not.toContain(scratch.replace(/\\/g, "/"));
    expect(sent).not.toContain(scratch.replace(/\\/g, "\\\\"));
    expect(readFileSync(join(scratch, CONTAINERS), "utf8")).toContain("API de pedidos");
    const applied = await mdg(["assist", "apply", "proposal.json", "--items", "1"]);
    expect(applied.code).toBe(0);
    expect(applied.stdout).toBe("Applied item 1 to architecture/diagrams/containers.meltemi\n");
    const text = readFileSync(join(scratch, CONTAINERS), "utf8");
    expect(text).toContain('label shop.api "API de compras"');
    expect(text.startsWith('language "0.2"\n\nimport commerce from')).toBe(true);
  });

  it("leaves out items whose block changed since the proposal", async () => {
    answers = [RENAME.replace("API de compras", "API de ventas")];
    await mdg(["assist", "modify", CONTAINERS, "--prompt", "x", "--save", "later.json", "--yes"]);
    const file = join(scratch, CONTAINERS);
    writeFileSync(file, readFileSync(file, "utf8").replace("direction TB", "direction LR"));
    const { code, stderr } = await mdg(["assist", "apply", "later.json"]);
    expect(code).toBe(1);
    expect(stderr).toContain("item 1 changed since the proposal and was left out");
    expect(stderr).toContain("nothing was written");
  });

  it("adds suggested relations as assumptions to a model", async () => {
    answers = [
      JSON.stringify({
        summary: "One missing relation",
        relations: [
          {
            block: "model commerce",
            from: "bank",
            to: "customer",
            label: "Notifies",
            reason: "Banks notify card holders",
          },
        ],
      }),
    ];
    const model = join("architecture", "models", "commerce.meltemi");
    const { code, stdout } = await mdg(["assist", "relations", model, "--yes", "--apply", "all"]);
    expect(code).toBe(0);
    expect(stdout).toContain(
      '1. relation model commerce: Banks notify card holders\n       bank -> customer: "Notifies" { assumption "Banks notify card holders" }',
    );
    const relation = compile(
      readFileSync(join(scratch, model), "utf8"),
    ).document.models[0]!.relations.at(-1)!;
    expect(relation).toMatchObject({
      from: "bank",
      to: "customer",
      assumption: "Banks notify card holders",
    });
  });

  it("generates a new sheet that imports the project's model", async () => {
    answers = [
      JSON.stringify({
        summary: "A context view",
        file: 'language "0.2"\n\nimport commerce from "../models/commerce.meltemi"\n\ndiagram overview: c4 using commerce {\n  level context\n}\n',
      }),
    ];
    const target = join("architecture", "diagrams", "overview.meltemi");
    const { code } = await mdg([
      "assist",
      "generate",
      target,
      "--prompt",
      "A context view of the shop",
      "--profile",
      "c4",
      "--yes",
      "--apply",
      "all",
    ]);
    expect(code).toBe(0);
    expect(bodies.at(-1)!.messages[1]!.content).toContain('<file path="models/commerce.meltemi">');
    expect(readFileSync(join(scratch, target), "utf8")).toContain(
      "diagram overview: c4 using commerce",
    );
    expect(
      (await mdg(["assist", "generate", target, "--prompt", "again", "--yes"])).stderr,
    ).toContain("exists; use assist modify");
  });

  it("explains what changed since another version", async () => {
    const before = join(scratch, "before");
    cpSync(join(CORPUS_ROOT, "projects", "valid", "architecture"), before, { recursive: true });
    answers = [JSON.stringify({ summary: "s", explanation: "The API now takes purchases." })];
    const { code, stdout, stderr } = await mdg([
      "assist",
      "explain",
      "architecture",
      "--before",
      "before",
      "--yes",
    ]);
    expect(code).toBe(0);
    expect(stdout).toBe("The API now takes purchases.\n");
    expect(stderr).toContain("  the list of changes (");
    expect(bodies.at(-1)!.messages[1]!.content).toContain(
      'label "API de pedidos" → "API de compras"',
    );
  });

  it("reports provider errors and refuses bad usage", async () => {
    status = 503;
    const failed = await mdg(["assist", "modify", CONTAINERS, "--prompt", "x", "--yes"]);
    status = 200;
    expect(failed.code).toBe(1);
    expect(failed.stderr).toContain("The provider answered 503: The model is busy");
    expect((await mdg(["assist", "modify", CONTAINERS])).stderr).toContain("modify needs --prompt");
    expect((await mdg(["assist", "draw"])).code).toBe(2);
    expect((await mdg(["assist", "generate", "x.txt", "--prompt", "p", "--yes"])).code).toBe(2);
    expect((await mdg(["assist", "apply", "proposal.json", "--items", "9"])).stderr).toContain(
      "items are 1",
    );
    expect(existsSync(join(scratch, "x.txt"))).toBe(false);
    expect((await mdg(["assist", "--help"])).stdout).toContain("Usage: assist <operation>");
  });
});
