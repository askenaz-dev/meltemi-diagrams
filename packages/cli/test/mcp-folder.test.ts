// `mdg mcp --folder` (`mcp-local-server`, "A folder with no account" and "Paths of the folder"): the
// command run on a free port and driven by the SDK's client over Streamable HTTP, as an agent drives
// it: two tools, pictures of the files as they are on disk, paths kept inside the folder, the same
// diagnostics as `validate`, and no request to any service.

import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { run } from "../src/index.js";
import { Scratch } from "./cloud-fixtures.js";
import { ok, refusal, startMcp, type Running } from "./mcp-support.js";

const scratch = new Scratch();
const env = { MELTEMI_LANG: "en" };

function mdgSync(args: string[], cwd: string): { code: number; stdout: string; stderr: string } {
  let stdout = "";
  let stderr = "";
  const code = run(args, {
    stdout: (text) => (stdout += text),
    stderr: (text) => (stderr += text),
    cwd,
    env,
  });
  if (typeof code !== "number") throw new Error("a command that waits");
  return { code, stdout, stderr };
}

/** The PNG's width and height from its header. */
function pngSize(base64: string): { width: number; height: number } {
  const bytes = Buffer.from(base64, "base64");
  expect(bytes.subarray(1, 4).toString("latin1")).toBe("PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe("mdg mcp --folder", () => {
  let folder: string;
  let mcp: Running;
  const calls: string[] = [];

  beforeAll(async () => {
    folder = join(scratch.root, "shop");
    expect(mdgSync(["init", folder, "--template", "purchase"], scratch.root).code).toBe(0);
    writeFileSync(join(scratch.root, "secret.meltemi"), 'language "0.2"\n');
    mcp = await startMcp(["--folder", folder], {
      cwd: scratch.root,
      env,
      hooks: {
        fetch: async (input) => {
          calls.push(String(input));
          throw new Error("the folder server made a request");
        },
      },
    });
  }, 60_000);

  afterAll(async () => {
    expect(await mcp.stop()).toBe(0);
  });

  it("prints its address first and names the server", async () => {
    expect(mcp.stdout().split("\n")[0]).toBe(mcp.server.url);
    expect(mcp.server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
    const client = await mcp.connect();
    expect(client.getServerVersion()).toMatchObject({
      name: "meltemi-diagrams",
      version: "1.11.0",
    });
    expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual([
      "validate",
      "preview",
    ]);
  });

  it("answers a PNG of the purchase flow with its report", async () => {
    const result = await mcp.call("preview", { path: "diagrams/payment.meltemi" });
    const report = ok(result);
    expect(report).toMatchObject({ format: "png", truncated: false, cached: false });
    expect(report).not.toHaveProperty("revision");
    expect(Number(report["elements"])).toBeGreaterThan(0);
    const image = result.content.find((item) => item.type === "image");
    expect(image?.mimeType).toBe("image/png");
    expect(pngSize(image!.data!).width).toBe(report["width"]);
  }, 60_000);

  it("draws the file as it is on disk at each call", async () => {
    mkdirSync(join(folder, "drafts"), { recursive: true });
    const file = join(folder, "drafts", "edited.meltemi");
    writeFileSync(file, 'language "0.2"\n\ndiagram one: flow {\n  a -> b\n}\n');
    const first = ok(await mcp.call("preview", { path: "drafts/edited.meltemi", format: "svg" }));
    writeFileSync(file, 'language "0.2"\n\ndiagram one: flow {\n  a -> b\n  b -> c\n  c -> d\n}\n');
    const second = ok(await mcp.call("preview", { path: "drafts/edited.meltemi", format: "svg" }));
    expect(first["elements"]).toBe(2);
    expect(second["elements"]).toBe(4);
    expect(second["cached"]).toBe(false);
    const again = ok(await mcp.call("preview", { path: "drafts/edited.meltemi", format: "svg" }));
    expect(again["cached"]).toBe(true);
  }, 60_000);

  it("keeps paths inside the folder", async () => {
    expect(refusal(await mcp.call("preview", { path: "../secret.meltemi" }))).toBe("path.invalid");
    expect(refusal(await mcp.call("validate", { path: "../secret.meltemi" }))).toBe("path.invalid");
    let linked = true;
    try {
      symlinkSync(join(scratch.root, "secret.meltemi"), join(folder, "out.meltemi"), "file");
    } catch {
      // Windows without the right to make links: the case cannot be built here.
      linked = false;
    }
    if (linked) {
      expect(refusal(await mcp.call("preview", { path: "out.meltemi" }))).toBe("path.invalid");
    }
  });

  it("refuses a width out of bounds and a file it does not hold", async () => {
    const wide = await mcp.call("preview", { path: "diagrams/payment.meltemi", width: 4096 });
    expect(refusal(wide)).toBe("request.invalid");
    expect(wide.structuredContent?.["limit"]).toBe(2048);
    expect(refusal(await mcp.call("preview", { path: "missing.meltemi" }))).toBe("request.invalid");
  });

  it("reports what validate reports for the same folder", async () => {
    writeFileSync(
      join(folder, "drafts", "broken.meltemi"),
      'language "0.2"\n\ndiagram x: flow {\n  a ->\n}\n',
    );
    const checked = ok(await mcp.call("validate", {}));
    const printed = mdgSync(["validate", folder, "--json"], scratch.root);
    const json = JSON.parse(printed.stdout) as { errors?: number; files?: unknown };
    expect(checked["errors"]).toBeGreaterThan(0);
    expect(JSON.stringify(json)).toContain("broken.meltemi");
    const one = ok(await mcp.call("validate", { path: "drafts/broken.meltemi" }));
    expect(one["errors"]).toBe(checked["errors"]);
    const broken = await mcp.call("preview", { path: "drafts/broken.meltemi" });
    expect(refusal(broken)).toBe("diagram.invalid");
    expect(broken.content.some((item) => item.type === "image")).toBe(false);
  }, 60_000);

  it("logs one line a call, and asks nothing of the network", () => {
    const lines = mcp
      .stderr()
      .split("\n")
      .filter((line) => line.startsWith("mcp: "));
    expect(lines.length).toBeGreaterThan(5);
    for (const line of lines) expect(line).toMatch(/^mcp: [a-z_]+ \d+ ms [a-z.-]+$/);
    expect(calls).toEqual([]);
  });
});

describe("mdg mcp's refusals before it listens", () => {
  const io = () => {
    let stderr = "";
    return {
      io: { stdout: () => {}, stderr: (text: string) => (stderr += text), cwd: scratch.root, env },
      stderr: () => stderr,
    };
  };

  it("exits 2 for a folder that does not exist", async () => {
    const { io: streams, stderr } = io();
    expect(await run(["mcp", "--folder", "./missing", "--port", "0"], streams)).toBe(2);
    expect(stderr()).toContain("missing");
  });

  it("exits 2 with the usage for an unknown option and a bad port", async () => {
    const first = io();
    expect(await run(["mcp", "--stdio"], first.io)).toBe(2);
    expect(first.stderr()).toContain("Usage: mcp");
    const second = io();
    expect(await run(["mcp", "--port", "70000"], second.io)).toBe(2);
    expect(second.stderr()).toContain("--port");
  });

  it("exits 2 for a host that is not https", async () => {
    const { io: streams, stderr } = io();
    expect(await run(["mcp", "--host", "http://example.com", "--port", "0"], streams)).toBe(2);
    expect(stderr()).toContain("cloud.insecure-host");
  });

  it("exits 2 for a key that is too short", async () => {
    const { io: streams, stderr } = io();
    const code = await run(["mcp", "--port", "0"], {
      ...streams,
      env: { ...env, MELTEMI_MCP_KEY: "short" },
    });
    expect(code).toBe(2);
    expect(stderr()).toContain("MELTEMI_MCP_KEY");
  });

  it("is listed in the help, in English and in Spanish", () => {
    expect(mdgSync(["--help"], scratch.root).stdout).toMatch(/^ {2}mcp {20}Serve the MCP tools/m);
    let spanish = "";
    run(["--help"], {
      stdout: (text) => (spanish += text),
      stderr: () => {},
      cwd: scratch.root,
      env: { MELTEMI_LANG: "es" },
    });
    expect(spanish).toMatch(/^ {2}mcp {23}Servir las herramientas MCP/m);
  });
});
