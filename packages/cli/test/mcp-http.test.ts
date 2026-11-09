// The local server's door (`mcp-local-server`, "Only this machine" and "A key for a shared
// machine"): what it answers before the handler reads anything, over a real port, with requests
// built header by header as a rebinding page, a page of another port or another account would send
// them; and the port in use.

import { request } from "node:http";
import { FOLDER_TOOLS, buildServer, statelessHandler } from "@meltemi/diagrams-mcp";
import { afterEach, describe, expect, it } from "vitest";
import { run } from "../src/index.js";
import { PortInUse, startLocalServer, type LocalServer } from "../src/mcp-http.js";
import { startMcp } from "./mcp-support.js";

const KEY = "a-key-for-the-shared-machine";

/** A handler whose tools answer nothing of interest: the door is what is under test. */
const handler = statelessHandler(() =>
  buildServer(
    { name: "meltemi-diagrams", title: "Meltemi Diagrams", version: "0.0.0" },
    "Test.",
    Object.values(FOLDER_TOOLS),
    {
      validate: async () => ({
        structured: { errors: 0, warnings: 0, diagnostics: [], truncated: false },
      }),
      preview: async () => {
        throw new Error("not drawn here");
      },
      inspect_story: async () => {
        throw new Error("not inspected here");
      },
    },
    { log: () => {} },
  ),
);

const INITIALIZE = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "door-test", version: "1.0.0" },
  },
});

interface Answer {
  readonly status: number;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly body: string;
}

/** One raw request to the server, every header as given. */
function send(
  server: LocalServer,
  options: {
    method?: string;
    path?: string;
    headers?: Record<string, string>;
    body?: Buffer | string;
  },
): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const outgoing = request(
      {
        host: "127.0.0.1",
        port: server.port,
        method: options.method ?? "POST",
        path: options.path ?? "/mcp",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          ...options.headers,
        },
      },
      (incoming) => {
        let body = "";
        incoming.setEncoding("utf8");
        incoming.on("data", (chunk: string) => (body += chunk));
        incoming.on("end", () =>
          resolve({ status: incoming.statusCode ?? 0, headers: incoming.headers, body }),
        );
      },
    );
    outgoing.on("error", reject);
    if (options.body !== undefined) outgoing.write(options.body);
    outgoing.end();
  });
}

describe("the local server's door", () => {
  let server: LocalServer | undefined;
  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it("serves an initialize from this machine", async () => {
    server = await startLocalServer({ port: 0, handler });
    const answer = await send(server, { body: INITIALIZE });
    expect(answer.status).toBe(200);
    expect(answer.body).toContain('"name":"meltemi-diagrams"');
    expect(answer.headers["x-content-type-options"]).toBe("nosniff");
    // A JSON answer is `no-store`; the SDK's event stream keeps its own `no-cache`.
    expect(String(answer.headers["cache-control"])).toMatch(/no-store|no-cache/);
  });

  it("refuses a Host that is not the loopback, as a rebinding page sends it", async () => {
    server = await startLocalServer({ port: 0, handler });
    const answer = await send(server, {
      headers: { Host: `attacker.example:${server.port}` },
      body: INITIALIZE,
    });
    expect(answer.status).toBe(403);
    expect(answer.body).not.toContain("meltemi-diagrams");
  });

  it("refuses a page of another origin, and serves its own", async () => {
    server = await startLocalServer({ port: 0, handler });
    const other = await send(server, {
      headers: { Origin: "http://localhost:3000" },
      body: INITIALIZE,
    });
    expect(other.status).toBe(403);
    const foreign = await send(server, {
      headers: { Origin: "https://evil.example" },
      body: INITIALIZE,
    });
    expect(foreign.status).toBe(403);
    const own = await send(server, {
      headers: { Origin: `http://127.0.0.1:${server.port}` },
      body: INITIALIZE,
    });
    expect(own.status).toBe(200);
  });

  it("answers GET with 405, another path with 404 and a body over 24 MiB with 413", async () => {
    server = await startLocalServer({ port: 0, handler });
    const get = await send(server, { method: "GET" });
    expect(get.status).toBe(405);
    expect(get.headers["allow"]).toBe("POST");
    expect((await send(server, { path: "/other", body: INITIALIZE })).status).toBe(404);
    const large = await send(server, { body: Buffer.alloc(25 * 1024 * 1024, 0x20) });
    expect(large.status).toBe(413);
  });

  it("refuses a protocol version the SDK does not serve", async () => {
    server = await startLocalServer({ port: 0, handler });
    const answer = await send(server, {
      headers: { "MCP-Protocol-Version": "1999-01-01" },
      body: INITIALIZE,
    });
    expect(answer.status).toBe(400);
  });

  it("asks for the key when there is one", async () => {
    server = await startLocalServer({ port: 0, handler, key: KEY });
    const none = await send(server, { body: INITIALIZE });
    expect(none.status).toBe(401);
    expect(none.headers["www-authenticate"]).toBe("Bearer");
    const wrong = await send(server, {
      headers: { Authorization: `Bearer ${KEY}-not` },
      body: INITIALIZE,
    });
    expect(wrong.status).toBe(401);
    const right = await send(server, {
      headers: { Authorization: `Bearer ${KEY}` },
      body: INITIALIZE,
    });
    expect(right.status).toBe(200);
  });

  it("knows a port in use", async () => {
    server = await startLocalServer({ port: 0, handler });
    await expect(startLocalServer({ port: server.port, handler })).rejects.toBeInstanceOf(
      PortInUse,
    );
    let stderr = "";
    const code = await run(["mcp", "--folder", ".", "--port", String(server.port)], {
      stdout: () => {},
      stderr: (text) => (stderr += text),
      cwd: process.cwd(),
      env: { MELTEMI_LANG: "en" },
    });
    expect(code).toBe(2);
    expect(stderr).toContain("mcp.port-in-use");
    expect(stderr).toContain(String(server.port));
  });

  it("serves the command's clients with the key as their bearer token", async () => {
    const mcp = await startMcp(["--folder", "."], {
      cwd: process.cwd(),
      env: { MELTEMI_LANG: "en", MELTEMI_MCP_KEY: KEY },
    });
    try {
      await expect(mcp.connect()).rejects.toThrow();
      const client = await mcp.connect({ Authorization: `Bearer ${KEY}` });
      expect((await client.listTools()).tools).toHaveLength(3);
      expect(mcp.stdout() + mcp.stderr()).not.toContain(KEY);
    } finally {
      expect(await mcp.stop()).toBe(0);
    }
  });
});
