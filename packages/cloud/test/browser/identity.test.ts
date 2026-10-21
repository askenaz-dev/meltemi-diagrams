// The stand-in for the identity service that the browser suite starts on port 8787. No socket is
// opened here: `node:http` is replaced by a server that cannot listen, as when something else
// (`pnpm identity:dev`) already holds the port.

import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

vi.mock("node:http", () => ({
  createServer: () => {
    const server = new EventEmitter() as EventEmitter & {
      listen: (port: number, host: string, done: () => void) => unknown;
      close: (done?: () => void) => unknown;
      closeAllConnections: () => void;
    };
    server.listen = () => {
      queueMicrotask(() =>
        server.emit("error", Object.assign(new Error("listen EADDRINUSE"), { code: "EADDRINUSE" })),
      );
      return server;
    };
    server.close = (done) => {
      done?.();
      return server;
    };
    server.closeAllConnections = () => {};
    return server;
  },
}));

const { startFakeIdentity } = await import("./identity.js");
const { SuiteError } = await import("./support.js");

describe("the stand-in for the identity service", () => {
  it("fails at once, naming the port and the service to stop, when something listens there", async () => {
    const started = startFakeIdentity();
    await expect(started).rejects.toBeInstanceOf(SuiteError);
    await expect(started).rejects.toThrow(/port 8787/);
    await expect(started).rejects.toThrow(/pnpm identity:dev/);
  });

  it("says why it cannot listen when the cause is another one", async () => {
    vi.resetModules();
    vi.doMock("node:http", () => ({
      createServer: () => {
        const server = new EventEmitter() as EventEmitter & {
          listen: () => unknown;
          close: (done?: () => void) => unknown;
          closeAllConnections: () => void;
        };
        server.listen = () => {
          queueMicrotask(() =>
            server.emit("error", Object.assign(new Error("listen EACCES"), { code: "EACCES" })),
          );
          return server;
        };
        server.close = (done) => {
          done?.();
          return server;
        };
        server.closeAllConnections = () => {};
        return server;
      },
    }));
    const { startFakeIdentity: start } = await import("./identity.js");
    await expect(start()).rejects.toThrow(/cannot listen: .*EACCES/);
    vi.doUnmock("node:http");
  });
});
