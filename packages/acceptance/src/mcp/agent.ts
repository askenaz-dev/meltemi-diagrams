// An agent of the suite: the official SDK's client (`@modelcontextprotocol/client` 2.3.1), connected
// to the endpoint with one test account's API token, as Codex connects with `bearer_token_env_var`.
// Its errors say a tool's name and the service's code and message, never the arguments or a result,
// which may hold a link that grants access.

import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import type { Target } from "./host.js";

/** A tool's result as the suite reads it. */
export interface ToolResult {
  readonly isError?: boolean;
  readonly content: readonly {
    readonly type: string;
    readonly text?: string;
    readonly data?: string;
    readonly mimeType?: string;
  }[];
  readonly structuredContent?: Record<string, unknown>;
}

/** A tool's refusal: the service's code, its message and its other fields. */
export interface Refusal {
  readonly code: string;
  readonly message: string;
  readonly fields: Record<string, unknown>;
}

/** The client's name and version, as `results.json` names them. */
export const CLIENT_INFO = { name: "meltemi-mcp-acceptance", version: "1.0.0" } as const;
/** The SDK the suite's client is, pinned in `packages/acceptance/package.json`. */
export const SDK = { name: "@modelcontextprotocol/client", version: "2.3.1" } as const;

/** One connected test account. */
export class Agent {
  /** The tool calls this agent made. */
  calls = 0;

  private constructor(
    readonly client: Client,
    private readonly transport: StreamableHTTPClientTransport,
  ) {}

  /** Connects with `token` (`initialize`, as the SDK negotiates it). */
  static async connect(target: Target, token: string): Promise<Agent> {
    const client = new Client(CLIENT_INFO);
    const transport = new StreamableHTTPClientTransport(new URL(target.endpoint), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    });
    await client.connect(transport);
    return new Agent(client, transport);
  }

  /** The server's name and version, as `initialize` gave them. */
  server(): { name: string; version: string } | undefined {
    const info = this.client.getServerVersion();
    return info ? { name: info.name, version: info.version } : undefined;
  }

  /** The protocol revision the connection negotiated. */
  protocolVersion(): string | undefined {
    return this.client.getNegotiatedProtocolVersion();
  }

  /** Calls a tool and answers its result, an error or not. */
  async call(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
    this.calls++;
    return (await this.client.callTool({ name, arguments: args })) as unknown as ToolResult;
  }

  /** Calls a tool that must succeed, and answers its structured result. */
  async ok(name: string, args: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const result = await this.call(name, args);
    if (result.isError) {
      const refusal = refusalOf(result);
      throw new Error(`${name} was refused: ${refusal.code}: ${refusal.message}`);
    }
    if (!result.structuredContent) throw new Error(`${name} answered no structured content`);
    return result.structuredContent;
  }

  /** Calls a tool that must be refused (with `code`, when given), and answers the refusal. */
  async refused(name: string, args: Record<string, unknown>, code?: string): Promise<Refusal> {
    const result = await this.call(name, args);
    if (!result.isError) throw new Error(`${name} was not refused`);
    const refusal = refusalOf(result);
    if (code !== undefined && refusal.code !== code) {
      throw new Error(`${name} was refused with ${refusal.code}, not ${code}: ${refusal.message}`);
    }
    return refusal;
  }

  async close(): Promise<void> {
    await this.client.close().catch(() => undefined);
    await this.transport.close().catch(() => undefined);
  }
}

/** The refusal an `isError` result carries. */
export function refusalOf(result: ToolResult): Refusal {
  const body = result.structuredContent ?? {};
  const { code, message, ...fields } = body as { code?: unknown; message?: unknown };
  return {
    code: typeof code === "string" ? code : "(no code)",
    message: typeof message === "string" ? message : "",
    fields,
  };
}
