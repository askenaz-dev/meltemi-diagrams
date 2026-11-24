// `mdg mcp --stdio` (`mcp-stdio`): the real command started as a process by the SDK's stdio client,
// as a plugin's client starts it: the folder's tools over standard input and output, nothing but
// protocol messages on standard output, the same picture as over HTTP, the end of the input, and
// the refusals made before anything is read.

import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { run } from "../src/index.js";
import { Scratch } from "./cloud-fixtures.js";
import { startMcp } from "./mcp-support.js";

const scratch = new Scratch();
const REPO = resolve(import.meta.dirname, "..", "..", "..");
const TSX = join(REPO, "node_modules", "tsx", "dist", "cli.mjs");
const BIN = join(REPO, "packages", "cli", "src", "bin.ts");
/** The command as a client starts it: Node running the sources, with the interface in English. */
const command = (args: readonly string[]) => ({
  command: process.execPath,
  args: [TSX, "--conditions=@meltemi/diagrams-source", BIN, "mcp", "--stdio", ...args],
  env: { ...process.env, MELTEMI_LANG: "en" } as Record<string, string>,
});

const SHEET = `language "0.2"

diagram checkout: flow {
  title "Checkout"
  client["Client"]
  api["API"]
  client -> api: "HTTPS"
}
`;

/** Connects a client to a stdio server started in `cwd`, as a plugin's client does. */
async function connect(cwd: string, args: readonly string[]) {
  const transport = new StdioClientTransport({ ...command(args), cwd, stderr: "pipe" });
  const client = new Client({ name: "meltemi-stdio-tests", version: "1.0.0" });
  await client.connect(transport);
  return { client, transport };
}

const text = (result: unknown) =>
  ((result as { content: { type: string; text?: string }[] }).content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");

describe("mdg mcp --stdio", () => {
  let folder: string;

  beforeAll(() => {
    folder = join(scratch.root, "My diagrams");
    mkdirSync(join(folder, "diagrams"), { recursive: true });
    writeFileSync(join(folder, "diagrams", "checkout.meltemi"), SHEET);
  });

  it("serves the folder's tools over standard input and output", async () => {
    const { client } = await connect(scratch.root, ["--folder", folder]);
    try {
      const tools = (await client.listTools()).tools.map((t) => t.name).sort();
      expect(tools).toEqual(["inspect_story", "preview", "validate"]);
      const checked = await client.callTool({
        name: "validate",
        arguments: { path: "diagrams/checkout.meltemi" },
      });
      expect(checked.isError ?? false).toBe(false);
      const picture = await client.callTool({
        name: "preview",
        arguments: { path: "diagrams/checkout.meltemi", format: "svg" },
      });
      expect(picture.isError ?? false).toBe(false);
      expect(text(picture)).toContain('role="img"');
    } finally {
      await client.close();
    }
  }, 120_000);

  it("draws the same picture as the server over HTTP", async () => {
    const args = { path: "diagrams/checkout.meltemi", format: "svg" };
    const { client } = await connect(scratch.root, ["--folder", folder]);
    let overStdio: string;
    try {
      overStdio = text(await client.callTool({ name: "preview", arguments: args }));
    } finally {
      await client.close();
    }
    const http = await startMcp(["--folder", folder], {
      cwd: scratch.root,
      env: { MELTEMI_LANG: "en" },
    });
    try {
      const overHttp = text(await http.call("preview", args));
      expect(overStdio).toBe(overHttp);
    } finally {
      expect(await http.stop()).toBe(0);
    }
  }, 120_000);

  it("writes nothing but protocol messages and exits with 0 when its input closes", async () => {
    const started = command(["--folder", folder]);
    const child = spawn(started.command, started.args, { cwd: scratch.root, env: started.env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    const initialize = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "raw", version: "1.0.0" },
      },
    };
    child.stdin.write(`${JSON.stringify(initialize)}\n`);
    await new Promise<void>((done) => {
      const check = () => (stdout.includes('"id":1') ? done() : setTimeout(check, 50));
      check();
    });
    child.stdin.end();
    const code = await new Promise<number | null>((done) => child.on("exit", done));
    expect(code).toBe(0);
    const lines = stdout.split("\n").filter((line) => line.trim() !== "");
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(JSON.parse(line).jsonrpc).toBe("2.0");
    expect(stderr).toContain(`for the files of ${folder}`);
  }, 120_000);

  it("reads an unexpanded placeholder as the working folder", async () => {
    const { client } = await connect(folder, ["--folder", "${CLAUDE_PROJECT_DIR}"]);
    try {
      const checked = await client.callTool({
        name: "validate",
        arguments: { path: "diagrams/checkout.meltemi" },
      });
      expect(checked.isError ?? false).toBe(false);
      const outside = await client.callTool({
        name: "validate",
        arguments: { path: "../other/sheet.meltemi" },
      });
      expect(outside.isError).toBe(true);
    } finally {
      await client.close();
    }
  }, 120_000);

  it("takes no port, starts while 7373 is taken, and refuses a folder that is not there", async () => {
    const refused = (args: string[]) => {
      let stdout = "";
      let stderr = "";
      const code = run(["mcp", "--stdio", ...args], {
        stdout: (t) => (stdout += t),
        stderr: (t) => (stderr += t),
        cwd: scratch.root,
        env: { MELTEMI_LANG: "en" },
      });
      return Promise.resolve(code).then((exit) => ({ exit, stdout, stderr }));
    };
    const port = await refused(["--port", "8000", "--folder", folder]);
    expect(port.exit).toBe(2);
    expect(port.stderr).toContain("--stdio opens no port");
    expect(port.stdout).toBe("");
    const missing = await refused(["--folder", join(scratch.root, "missing")]);
    expect(missing.exit).toBe(2);
    expect(missing.stderr).toContain("missing");

    const taken = createServer();
    // When something else already holds 7373, the port is taken as wanted.
    await new Promise<void>((done) => {
      taken.once("error", () => done());
      taken.listen(7373, "127.0.0.1", () => done());
    });
    try {
      const { client } = await connect(scratch.root, ["--folder", folder]);
      expect((await client.getServerVersion())?.name).toBeDefined();
      await client.close();
    } finally {
      taken.close();
    }
  }, 120_000);

  it("lists --stdio in its help, in English and in Spanish", () => {
    for (const lang of ["en", "es"]) {
      const help = spawnSync(
        process.execPath,
        [TSX, "--conditions=@meltemi/diagrams-source", BIN, "mcp", "--help"],
        {
          env: { ...process.env, MELTEMI_LANG: lang },
          encoding: "utf8",
        },
      );
      expect(help.stdout).toMatch(/--stdio\s+(Serve over standard input|Servir por la entrada)/);
    }
  }, 60_000);
});
