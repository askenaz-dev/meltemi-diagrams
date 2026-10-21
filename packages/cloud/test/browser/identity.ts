/**
 * A stand-in for the family's identity service, which the suite does not run (it has providers, a
 * database and secrets of its own). The Worker asks it one thing, whether a session is live:
 * `GET <issuer>/sessions/<sid>` answers `204` for a live session and `404` for one that has
 * ended (the contract in the README of `@meltemi/identity`). The Worker's issuer is
 * `http://localhost:8787`, and `localhost` may be the IPv4 or the IPv6 loopback address to the
 * runtime that asks (workerd tries `::1` first), so both are served.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { SuiteError } from "./support.js";
import { IDENTITY, IDENTITY_PORT } from "./worker.js";

export interface FakeIdentity {
  /** The session ids the Worker asked about, in order. */
  readonly asked: string[];
  /** Ends a session: from now on its check answers `404`. */
  end(sid: string): void;
  /** Stops answering. The identity service is then not running, as in a developer's first hour. */
  close(): Promise<void>;
}

/**
 * Starts the stand-in on the issuer's port. Fails, saying why, when something else is there: a
 * real identity service (`pnpm identity:dev` in Meltemi Web) would not know the sessions the suite
 * mints, and every cookie would count as nobody's.
 */
export async function startFakeIdentity(): Promise<FakeIdentity> {
  const asked: string[] = [];
  const ended = new Set<string>();

  const answer = (request: IncomingMessage, response: ServerResponse): void => {
    const match = /^\/sessions\/([^/?#]+)$/.exec(request.url ?? "");
    if (request.method !== "GET" || !match) {
      response.writeHead(404).end();
      return;
    }
    const sid = decodeURIComponent(match[1] ?? "");
    asked.push(sid);
    response.writeHead(ended.has(sid) ? 404 : 204).end();
  };

  const servers: Server[] = [];
  const failures: NodeJS.ErrnoException[] = [];
  for (const host of ["127.0.0.1", "::1"]) {
    const server = createServer(answer);
    try {
      await new Promise<void>((done, fail) => {
        server.once("error", fail);
        server.listen(IDENTITY_PORT, host, done);
      });
      servers.push(server);
    } catch (error) {
      failures.push(error as NodeJS.ErrnoException);
    }
  }

  const stop = async (): Promise<void> => {
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((closed) => {
            server.close(() => closed());
            server.closeAllConnections();
          }),
      ),
    );
  };

  if (failures.some((failure) => failure.code === "EADDRINUSE")) {
    await stop();
    throw new SuiteError(
      `Something is listening on port ${IDENTITY_PORT}, where the suite stands in for the identity ` +
        `service (${IDENTITY}). Stop it (pnpm identity:dev) and run the suite again: it would be ` +
        "asked about sessions it has never issued.",
    );
  }
  if (servers.length === 0) {
    const reason = failures.map((failure) => failure.message).join("; ");
    throw new SuiteError(`The stand-in for the identity service cannot listen: ${reason}`);
  }
  return { asked, end: (sid) => void ended.add(sid), close: stop };
}
