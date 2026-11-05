// The wrapper every tool of both servers goes through (`mcp-server`, "Results and errors";
// `mcp-local-server`, "Logs and limits of the local server"): arguments refused with their field, an
// unexpected throw as `internal` with nothing of it shown, a result its schema refuses as `internal`
// when the server asks for the check, a refusal's details (but a missing project's), and one log line
// of the tool, its milliseconds and its code.

import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { describe, expect, it } from "vitest";
import * as z from "zod";
import {
  Refusal,
  buildServer,
  define,
  type AnyHandler,
  type ServeHooks,
  type ToolDefinition,
} from "../src/index.js";

const echo = define({
  name: "echo",
  title: "Echo",
  description: "Answers its word.",
  scope: "projects:read",
  input: z.object({ word: z.string().min(1), secret: z.string().optional() }),
  output: z.object({ word: z.string() }),
  annotations: { readOnlyHint: true },
});

interface Result {
  readonly isError?: boolean;
  readonly structuredContent?: Record<string, unknown>;
  readonly content: readonly { type: string; text?: string }[];
}

async function serve(
  handler: AnyHandler,
  hooks: ServeHooks = {},
  catalogue: readonly ToolDefinition[] = [echo],
): Promise<{ call: (args: unknown) => Promise<Result>; lines: string[]; unexpected: unknown[] }> {
  const lines: string[] = [];
  const unexpected: unknown[] = [];
  const server = buildServer(
    { name: "meltemi-diagrams", title: "Meltemi Diagrams", version: "0.0.0" },
    "Test.",
    catalogue,
    { echo: handler },
    { log: (line) => lines.push(line), unexpected: (error) => unexpected.push(error), ...hooks },
  );
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "serve-test", version: "1.0.0" });
  await client.connect(clientSide);
  return {
    call: async (args) =>
      (await client.callTool({
        name: "echo",
        arguments: args as Record<string, unknown>,
      })) as Result,
    lines,
    unexpected,
  };
}

describe("the wrapper", () => {
  it("answers a call with its structured result and its JSON", async () => {
    const { call, lines } = await serve(async ({ word }) => ({ structured: { word } }));
    const result = await call({ word: "hola" });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({ word: "hola" });
    expect(result.content.at(-1)?.text).toBe('{"word":"hola"}');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^mcp: echo \d+ ms ok$/);
  });

  it("refuses arguments of another shape as request.invalid, naming the field", async () => {
    let ran = false;
    const { call, lines } = await serve(async () => {
      ran = true;
      return { structured: { word: "" } };
    });
    const result = await call({ word: "" });
    expect(result.isError).toBe(true);
    expect(result.structuredContent?.["code"]).toBe("request.invalid");
    expect(String(result.structuredContent?.["message"])).toContain("word");
    expect(ran).toBe(false);
    expect(lines[0]).toMatch(/^mcp: echo \d+ ms request\.invalid$/);
  });

  it("answers an unexpected throw as internal, and shows nothing of it", async () => {
    const { call, unexpected } = await serve(async () => {
      throw new Error("the disk is on fire at C:/secret");
    });
    const result = await call({ word: "x" });
    expect(result.structuredContent).toEqual({
      code: "internal",
      message: "Something went wrong.",
    });
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(unexpected).toHaveLength(1);
  });

  it("answers a result its schema refuses as internal when the server checks results", async () => {
    const wrong = async () => ({ structured: { word: 42 } as unknown as { word: string } });
    // The SDK refuses it too, but with a sentence: the check answers the service's stable code.
    const unchecked = await serve(wrong);
    expect((await unchecked.call({ word: "x" })).structuredContent?.["code"]).not.toBe("internal");
    const checked = await serve(wrong, { checkOutput: true });
    expect((await checked.call({ word: "x" })).structuredContent?.["code"]).toBe("internal");
  });

  it("answers a refusal with its details, and a missing project with nothing more", async () => {
    const { call } = await serve(async ({ word }) => {
      if (word === "stale") throw new Refusal("revision.mismatch", "Read again.", { revision: 43 });
      throw new Refusal("project.not-found", "There is no such project.", { owner: "someone" });
    });
    expect((await call({ word: "stale" })).structuredContent).toEqual({
      code: "revision.mismatch",
      message: "Read again.",
      revision: 43,
    });
    expect((await call({ word: "gone" })).structuredContent).toEqual({
      code: "project.not-found",
      message: "There is no such project.",
    });
  });

  it("turns a server's own errors into refusals through its hook", async () => {
    class Own extends Error {}
    const { call } = await serve(
      async () => {
        throw new Own("token.invalid");
      },
      {
        refusal: (error) => (error instanceof Own ? new Refusal(error.message, "No.") : undefined),
      },
    );
    expect((await call({ word: "x" })).structuredContent?.["code"]).toBe("token.invalid");
  });

  it("runs the hooks before the arguments are read and before the handler", async () => {
    const order: string[] = [];
    const { call } = await serve(
      async ({ word }) => {
        order.push("handler");
        return { structured: { word } };
      },
      {
        beforeCheck: () => void order.push("check"),
        beforeRun: () => void order.push("run"),
      },
    );
    await call({ word: "x" });
    await call({ word: "" });
    expect(order).toEqual(["check", "run", "handler", "check"]);
  });

  it("logs no argument and no result", async () => {
    const { call, lines } = await serve(async ({ word }) => ({ structured: { word } }));
    await call({ word: "visible", secret: "mdg_abcdefghijklmnopqrstuvwxyz" });
    expect(lines.join("\n")).not.toContain("visible");
    expect(lines.join("\n")).not.toContain("mdg_");
  });

  it("refuses to serve a tool without a handler", () => {
    expect(() => buildServer({ name: "n", title: "t", version: "0" }, "Test.", [echo], {})).toThrow(
      /echo has no handler/,
    );
  });
});
