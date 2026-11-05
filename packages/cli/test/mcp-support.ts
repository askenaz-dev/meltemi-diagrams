/**
 * What the tests of `mdg mcp` share: the command run in this process on a free port, told to the
 * test once it listens, an MCP client of the official SDK connected to the address it printed, and
 * a way to stop it and read what it wrote.
 */

import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import type { CloudHooks } from "../src/cloud-context.js";
import { run } from "../src/index.js";
import type { LocalServer } from "../src/mcp-http.js";

/** A tool's result as the client reads it. */
export interface ToolResult {
  readonly isError?: boolean;
  readonly content: readonly { type: string; text?: string; data?: string; mimeType?: string }[];
  readonly structuredContent?: Record<string, unknown>;
}

export interface Running {
  readonly server: LocalServer;
  /** What the command wrote so far. */
  stdout(): string;
  stderr(): string;
  /** A client connected to the server, with the headers given on every request. */
  connect(headers?: Record<string, string>): Promise<Client>;
  /** Calls a tool through a client of its own. */
  call(name: string, args?: Record<string, unknown>): Promise<ToolResult>;
  /** Stops the server; the command's exit code. */
  stop(): Promise<number>;
}

/** Runs `mdg mcp <args> --port 0` and answers once it listens, or throws with what it wrote. */
export async function startMcp(
  args: readonly string[],
  options: { cwd: string; env: Record<string, string>; hooks?: CloudHooks },
): Promise<Running> {
  let stdout = "";
  let stderr = "";
  let started: (server: LocalServer) => void = () => {};
  const listening = new Promise<LocalServer>((resolve) => (started = resolve));
  const exited = Promise.resolve(
    run(["mcp", ...args, "--port", "0"], {
      stdout: (text) => (stdout += text),
      stderr: (text) => (stderr += text),
      cwd: options.cwd,
      env: options.env,
      cloud: { ...options.hooks, mcpStarted: (server) => started(server) },
    }),
  );
  const server = await Promise.race([
    listening,
    exited.then((code) => {
      throw new Error(`mdg mcp exited ${code}:\n${stderr}`);
    }),
  ]);
  const clients: Client[] = [];
  const connect = async (headers: Record<string, string> = {}): Promise<Client> => {
    const client = new Client({ name: "meltemi-cli-tests", version: "1.0.0" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(server.url), { requestInit: { headers } }),
    );
    clients.push(client);
    return client;
  };
  let shared: Client | undefined;
  return {
    server,
    stdout: () => stdout,
    stderr: () => stderr,
    connect,
    call: async (name, callArgs = {}) => {
      shared ??= await connect();
      return (await shared.callTool({ name, arguments: callArgs })) as unknown as ToolResult;
    },
    stop: async () => {
      await Promise.all(clients.map((client) => client.close().catch(() => undefined)));
      await server.close();
      return exited;
    },
  };
}

/** The structured result of a call that did not fail, or an error naming its refusal. */
export function ok(result: ToolResult): Record<string, unknown> {
  if (result.isError) throw new Error(`refused: ${JSON.stringify(result.structuredContent)}`);
  return result.structuredContent ?? {};
}

/** The code of a call's refusal. */
export function refusal(result: ToolResult): string | undefined {
  return result.isError ? (result.structuredContent?.["code"] as string | undefined) : undefined;
}
