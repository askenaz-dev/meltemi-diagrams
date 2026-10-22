/**
 * A stand-in for the family's identity service, which the suite does not run (it has providers, a
 * database and secrets of its own). The Worker asks it whether a session is live:
 * `GET <issuer>/sessions/<sid>` answers `204` for a live session and `404` for one that has
 * ended (the contract in the README of `@meltemi/identity`). Once the Worker runs, it also answers
 * the account API the account panel reads through the Worker (`serveAccounts`): it checks the
 * product's signature with the run's secret and the person's token with the run's keys, as the
 * real service does, and keeps each person's sign-ins and sessions in memory. The Worker's issuer
 * is `http://localhost:8787`, and `localhost` may be the IPv4 or the IPv6 loopback address to the
 * runtime that asks (workerd tries `::1` first), so both are served.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  sessionVerifier,
  verifyProductRequest,
  type AccountIdentity,
  type AccountView,
} from "@meltemi/identity";
import { testJwks, type TestKeys } from "@meltemi/identity/testing";
import { SuiteError } from "./support.js";
import { IDENTITY, IDENTITY_PORT } from "./worker.js";

/** A call of the account API the stand-in answered, for a scenario to look at. */
export interface AccountCall {
  readonly method: string;
  readonly path: string;
  /** The product whose signature verified, or undefined when none did. */
  readonly product: string | undefined;
  /** The `sub` of the bearer token, or undefined when it did not verify. */
  readonly sub: string | undefined;
  readonly status: number;
}

export interface FakeIdentity {
  /** The session ids the Worker asked about, in order. */
  readonly asked: string[];
  /** The calls of the account API, in order. */
  readonly accountCalls: AccountCall[];
  /** Ends a session: from now on its check answers `404`. */
  end(sid: string): void;
  /** Answers the account API from now on, checking calls with the Worker's secret and keys. */
  serveAccounts(options: { readonly secret: string; readonly keys: TestKeys }): void;
  /**
   * A person's sign-ins (a GitHub identity by default) and other sessions; the session a call
   * presents joins the person's sessions by itself.
   */
  account(
    sub: string,
    options?: {
      readonly identities?: readonly AccountIdentity[];
      readonly sessions?: readonly { readonly sid: string; readonly label: string }[];
    },
  ): void;
  /** Stops answering. The identity service is then not running, as in a developer's first hour. */
  close(): Promise<void>;
}

interface HeldSession {
  readonly sid: string;
  readonly label: string;
  readonly createdAt: string;
}

interface HeldAccount {
  identities: AccountIdentity[];
  readonly sessions: Map<string, HeldSession>;
}

const SINCE = "2026-10-01T00:00:00.000Z";

/** The GitHub identity a person has unless a scenario says otherwise. */
function githubOf(sub: string): AccountIdentity {
  return {
    provider: "github",
    email: `${sub}@example.com`,
    emailVerified: true,
    handle: sub,
    linkedAt: SINCE,
  };
}

/** The body of a request, as text. */
function bodyOf(request: IncomingMessage): Promise<string> {
  return new Promise((done, fail) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => done(Buffer.concat(chunks).toString("utf8")));
    request.on("error", fail);
  });
}

/**
 * Starts the stand-in on the issuer's port. Fails, saying why, when something else is there: a
 * real identity service (`pnpm identity:dev` in Meltemi Web) would not know the sessions the suite
 * mints, and every cookie would count as nobody's.
 */
export async function startFakeIdentity(): Promise<FakeIdentity> {
  const asked: string[] = [];
  const accountCalls: AccountCall[] = [];
  const ended = new Set<string>();
  const accounts = new Map<string, HeldAccount>();
  let serving:
    { readonly secret: string; readonly verifier: ReturnType<typeof sessionVerifier> } | undefined;

  const accountOf = (sub: string): HeldAccount => {
    let held = accounts.get(sub);
    if (!held) {
      held = { identities: [githubOf(sub)], sessions: new Map() };
      accounts.set(sub, held);
    }
    return held;
  };

  const viewOf = (sub: string, current: string): AccountView => {
    const held = accountOf(sub);
    return {
      user: { id: sub, name: "Ana", picture: "" },
      identities: held.identities,
      sessions: [...held.sessions.values()]
        .filter((session) => !ended.has(session.sid))
        .reverse()
        .map((session) => ({
          sid: session.sid,
          label: session.label,
          createdAt: session.createdAt,
          lastSeen: new Date().toISOString(),
          expiresAt: "2026-12-31T00:00:00.000Z",
          current: session.sid === current,
        })),
      canUnlink: new Set(held.identities.map((identity) => identity.provider)).size > 1,
    };
  };

  /** The account API, as the identity service answers it for a product's signed call. */
  const answerAccount = async (
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> => {
    const path = (request.url ?? "").split("?")[0] ?? "";
    const send = (status: number, value: unknown, product?: string, sub?: string) => {
      accountCalls.push({ method: request.method ?? "", path, product, sub, status });
      response
        .writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" })
        .end(JSON.stringify(value));
    };
    const body = await bodyOf(request);
    if (!serving) return send(404, { error: "not-found" });
    const headers = new Headers();
    for (const [name, value] of Object.entries(request.headers)) {
      if (typeof value === "string") headers.set(name, value);
    }
    const asRequest = new Request(`${IDENTITY}${request.url ?? "/"}`, {
      method: request.method ?? "GET",
      headers,
    });
    const secret = serving.secret;
    const signed = await verifyProductRequest(asRequest, body, (name) =>
      name === "diagrams" ? secret : undefined,
    );
    if (!signed) return send(401, { error: "product.unauthorized" });
    const token = /^Bearer\s+(\S+)$/i.exec(headers.get("Authorization") ?? "")?.[1];
    const claims = token ? await serving.verifier.verifySession(token) : undefined;
    if (!claims || ended.has(claims.sid)) {
      return send(401, { error: "session.invalid" }, signed.product);
    }
    const sub = claims.sub;
    const held = accountOf(sub);
    if (!held.sessions.has(claims.sid)) {
      held.sessions.set(claims.sid, {
        sid: claims.sid,
        label: "Chrome on Windows",
        createdAt: SINCE,
      });
    }
    const ok = () => send(200, viewOf(sub, claims.sid), signed.product, sub);
    const refuse = (status: number, error: string) => send(status, { error }, signed.product, sub);
    if (request.method === "GET" && path === "/api/account") return ok();
    if (request.method !== "POST") return refuse(404, "not-found");
    if (path === "/api/account/unlink") {
      let provider: unknown;
      try {
        provider = (JSON.parse(body || "{}") as Record<string, unknown>)["provider"];
      } catch {
        return refuse(400, "request.invalid");
      }
      if (provider !== "github" && provider !== "google") return refuse(400, "provider.unknown");
      const left = held.identities.filter((identity) => identity.provider !== provider);
      if (left.length === 0) return refuse(409, "identity.last");
      held.identities = left;
      return ok();
    }
    if (path === "/api/account/sessions/revoke-others") {
      for (const sid of held.sessions.keys()) if (sid !== claims.sid) ended.add(sid);
      return ok();
    }
    const one = /^\/api\/account\/sessions\/([^/]+)\/revoke$/.exec(path);
    if (one) {
      const sid = decodeURIComponent(one[1] ?? "");
      if (sid === claims.sid) return refuse(409, "session.current");
      if (!held.sessions.has(sid)) return refuse(404, "session.not-found");
      ended.add(sid);
      return ok();
    }
    return refuse(404, "not-found");
  };

  const answer = (request: IncomingMessage, response: ServerResponse): void => {
    if ((request.url ?? "").startsWith("/api/")) {
      answerAccount(request, response).catch(() => {
        if (!response.headersSent) response.writeHead(500).end();
      });
      return;
    }
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
  return {
    asked,
    accountCalls,
    end: (sid) => void ended.add(sid),
    serveAccounts: ({ secret, keys }) => {
      serving = {
        secret,
        // The real service reads its own rows; the stand-in knows the sessions it ended.
        verifier: sessionVerifier({ issuer: IDENTITY, jwks: testJwks(keys), checkSession: false }),
      };
    },
    account: (sub, options = {}) => {
      const held = accountOf(sub);
      if (options.identities) held.identities = [...options.identities];
      for (const session of options.sessions ?? []) {
        held.sessions.set(session.sid, { ...session, createdAt: SINCE });
      }
    },
    close: stop,
  };
}
