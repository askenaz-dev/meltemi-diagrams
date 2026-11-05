/**
 * The MCP endpoint in the real runtime (change agent-mcp): an agent's client of the official SDK,
 * from Node, with an API token, against the Worker `wrangler dev` runs with a real D1 (migration
 * 0008's tables), a real R2 and the real renderer object. What only workerd can prove is here: the
 * SDK bundled for workerd and imported on the first request, a key kept in D1 and replayed, a push
 * checked by the renderer object over RPC, an SVG and a PNG drawn by it (ELK and resvg in the Worker),
 * a catalog it built, published and read back from the Worker's own origin, and the log of the calls.
 */
import assert from "node:assert/strict";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import type { Scenario } from "./scenario.js";

/** A flow diagram of two steps and a relation. */
const FLOW =
  'language "0.2"\n\ndiagram checkout: flow {\n  cart["Cart"]\n  pay["Pay"]\n  cart -> pay\n}\n';

type Result = {
  isError?: boolean;
  content: { type: string; text?: string; data?: string; mimeType?: string }[];
  structuredContent?: Record<string, unknown>;
};

export const mcpScenarios: Scenario[] = [
  {
    name: "mcp: an agent with an API token creates a project once, writes, validates, previews as SVG and PNG, publishes and reads back, in the real runtime",
    signedIn: "u-ana-mcp",
    async run(t) {
      const made = await t.me.api("POST", "/api/tokens", { name: "agent" });
      assert.equal(made.status, 201, made.text);
      const token = String(made.json()["token"]);
      assert.equal((await t.me.api("PATCH", "/api/account", { handle: "ana-mcp" })).status, 200);

      // Without a token the door says so, and a page of another site is refused.
      const anonymous = await t.ask("/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      });
      assert.equal(anonymous.status, 401);
      const foreign = await t.ask("/mcp", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, Origin: "https://evil.example" },
        body: "{}",
      });
      assert.equal(foreign.status, 403);

      const client = new Client({ name: "browser-suite", version: "1.0.0" });
      await client.connect(
        new StreamableHTTPClientTransport(new URL(`${t.origin}/mcp`), {
          requestInit: { headers: { Authorization: `Bearer ${token}` } },
        }),
      );
      const call = async (name: string, args: Record<string, unknown> = {}): Promise<Result> =>
        (await client.callTool({ name, arguments: args })) as unknown as Result;
      const ok = async (name: string, args: Record<string, unknown> = {}) => {
        const result = await call(name, args);
        assert.ok(!result.isError, `${name}: ${JSON.stringify(result.structuredContent)}`);
        return result.structuredContent!;
      };

      assert.equal((await client.listTools()).tools.length, 27);
      assert.equal((await ok("whoami"))["sub"], "u-ana-mcp");

      // A key kept in D1: the retry answers the same project, and one exists.
      const first = await ok("create_project", { name: "Agentic", idempotencyKey: "suite-create" });
      const again = await ok("create_project", { name: "Agentic", idempotencyKey: "suite-create" });
      assert.equal(again["id"], first["id"]);
      const project = String(first["id"]);
      const listed = (await ok("list_projects"))["projects"] as { id: string }[];
      assert.equal(listed.filter((p) => p.id === project).length, 1);

      // A push the renderer object checks first: one with an error changes nothing.
      const bad = await call("write_files", {
        project,
        files: { "bad.meltemi": "diagram x: flow {\n  a ->\n}\n" },
        ifRevision: 0,
      });
      assert.equal(bad.structuredContent?.["code"], "diagram.invalid");
      const written = await ok("write_files", {
        project,
        files: { "checkout.meltemi": FLOW },
        ifRevision: 0,
      });
      assert.equal(written["revision"], 1);
      assert.equal((await ok("validate", { project }))["errors"], 0);

      // An SVG and a PNG, drawn by the renderer object with ELK and resvg in workerd.
      const svg = await call("preview", { project, path: "checkout.meltemi", format: "svg" });
      assert.ok(!svg.isError, JSON.stringify(svg.structuredContent));
      assert.match(svg.content[0]?.text ?? "", /^<svg\b/);
      assert.equal(svg.structuredContent?.["relations"], 1);
      const png = await call("preview", { project, path: "checkout.meltemi", width: 640 });
      assert.ok(!png.isError, JSON.stringify(png.structuredContent));
      const image = png.content.find((item) => item.type === "image");
      assert.equal(image?.mimeType, "image/png");
      const bytes = Buffer.from(image!.data!, "base64");
      assert.equal(bytes.readUInt32BE(16), 640, "the PNG's width");
      const cached = await ok("preview", { project, path: "checkout.meltemi", width: 640 });
      assert.equal(cached["cached"], true);

      // A catalog built by the object, published, and read back from the Worker's own origin.
      const published = await ok("publish", { project, slug: "agentic" });
      const url = String(published["url"]);
      assert.equal(url, `${t.origin}/_published/ana-mcp/agentic/`);
      const page = await t.ask(new URL(url).pathname);
      assert.equal(page.status, 200);
      assert.match(page.text, /^<!doctype html>/i);
      await ok("unpublish", { project, slug: "agentic" });
      assert.equal((await t.ask(new URL(url).pathname)).status, 404);

      await client.close();
      // What the agent made goes, as the suite leaves nothing of its own behind.
      assert.equal((await t.me.api("DELETE", `/api/projects/${project}`)).status, 204);
    },
  },
];
