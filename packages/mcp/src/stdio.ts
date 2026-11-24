// The MCP over standard input and output (`mcp-stdio`), for a client that starts the server
// itself, such as a plugin: the same server, one connection, no listener. Node only.

import type { Readable, Writable } from "node:stream";
import type { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport, serveStdio } from "@modelcontextprotocol/server/stdio";

/** The streams a stdio server reads requests from and writes answers to. */
export interface StdioStreams {
  readonly input: Readable;
  readonly output: Writable;
}

/**
 * Serves the server `factory` makes over a pair of streams, one connection for their lifetime, and
 * settles once the input has ended and the connection is closed. Only protocol messages are written
 * to `output`.
 */
export async function serveOverStdio(
  factory: () => McpServer | Promise<McpServer>,
  streams: StdioStreams,
  onerror?: (error: Error) => void,
): Promise<void> {
  const ended = new Promise<void>((resolve) => {
    streams.input.once("end", resolve);
    streams.input.once("close", resolve);
  });
  const transport = new StdioServerTransport(streams.input, streams.output);
  const handle = serveStdio(() => factory(), { transport, ...(onerror ? { onerror } : {}) });
  await ended;
  await handle.close();
}
