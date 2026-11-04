/**
 * The half of `mdg login` that runs on this computer (`cli-cloud`, "Signing in from the command
 * line"): a listener on `127.0.0.1` at a random port that the approval page redirects the browser
 * to, with the one-time `code` and the `state` of this request.
 *
 * It answers `GET /` with a `code` and a `state` and nothing else (anything else is refused and the
 * wait goes on), checks the `Host` header so that a name that resolves to this machine is no way in,
 * stops listening the moment the first such request arrives, and answers the browser only when the
 * caller says how signing in ended, so the page never claims more than the truth. The code is never
 * printed or logged.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { DEFAULT_LOCALE, getLocale, resolveLocale, type Locale } from "@meltemi/diagrams-i18n";
import { messages } from "./messages/index.js";

/** How long a person has to approve: five minutes, as the service's one-time code lives. */
export const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** RFC 4648 base32, upper case and without padding, of bytes. */
export function base32(bytes: Uint8Array): string {
  let result = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += BASE32[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
    buffer &= (1 << bits) - 1;
  }
  if (bits > 0) result += BASE32[(buffer << (5 - bits)) & 31];
  return result;
}

/**
 * The six characters the approval page shows for a `state`: the first six of the base32 of its
 * SHA-256, so that a person can tell their own terminal's request from somebody else's.
 */
export function approvalCheck(state: string): string {
  return base32(createHash("sha256").update(state).digest()).slice(0, 6);
}

/**
 * The language of a page from an `Accept-Language` header: the first language, by preference, that
 * is English or Spanish; the fallback when the header names neither.
 */
export function languageOf(header: string | undefined, fallback: Locale = DEFAULT_LOCALE): Locale {
  if (!header) return fallback;
  const preferences = header
    .split(",")
    .map((part, index) => {
      const [tag = "", ...parameters] = part.trim().split(";");
      const q = parameters.map((p) => /^\s*q\s*=\s*([0-9.]+)\s*$/i.exec(p)?.[1]).find(Boolean);
      return { tag: tag.trim().toLowerCase(), q: q === undefined ? 1 : Number(q), index };
    })
    .filter((p) => p.tag !== "" && p.tag !== "*" && Number.isFinite(p.q) && p.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  for (const { tag } of preferences) {
    const language = tag.split("-")[0];
    if (language === "es" || language === "en") return resolveLocale(tag);
  }
  return fallback;
}

const escape = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The small page the browser lands on: done, or that signing in did not finish. */
export function donePage(locale: Locale, finished: boolean): string {
  const t = messages(locale).cloud.login.page;
  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>Meltemi Diagrams</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem}</style>
</head>
<body>
<h1>Meltemi Diagrams</h1>
<p>${escape(finished ? t.done : t.failed)}</p>
</body>
</html>
`;
}

/** The one-time code and the state a request brought, and the way to answer the browser. */
export interface Arrival {
  readonly code: string;
  readonly state: string;
  /** Answers the browser: `true` when signing in finished, `false` when it did not. Once. */
  reply(finished: boolean): void;
}

export interface Approval {
  /** The port the listener is on. */
  readonly port: number;
  /**
   * Resolves with the first request that brought a `code` and a `state`, or with `timeout` when
   * none came in time. The listener is closed by then (nothing more is accepted), and what was
   * left open is closed once the arrival is answered.
   */
  readonly outcome: Promise<Arrival | "timeout">;
  /** Stops listening and drops every connection; safe to call more than once. */
  close(): Promise<void>;
}

export interface ListenOptions {
  /** Milliseconds to wait for the approval. */
  readonly timeoutMs: number;
  /** The language of the page when the browser's `Accept-Language` names neither of ours. */
  readonly fallbackLocale?: Locale;
}

/** Whether two texts are equal, in time that does not depend on where they differ. */
export function sameText(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function refuse(response: ServerResponse, status: number, headers: Record<string, string> = {}) {
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", ...headers });
  response.end(`${status}\n`);
}

/** Starts the listener on `127.0.0.1` at a free port. */
export function listenForApproval(options: ListenOptions): Promise<Approval> {
  const server: Server = createServer();
  let arrived = false;
  let settle!: (value: Arrival | "timeout") => void;
  const outcome = new Promise<Arrival | "timeout">((resolve) => (settle = resolve));
  let timer: ReturnType<typeof setTimeout> | undefined;

  const closing = new Promise<void>((resolve) => server.once("close", () => resolve()));
  const close = async (): Promise<void> => {
    clearTimeout(timer);
    if (server.listening) server.close();
    server.closeAllConnections();
    await closing;
  };

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;

      server.on("request", (request: IncomingMessage, response: ServerResponse) => {
        // Only this computer's own address names the listener: a page that makes the browser
        // call it under another name (DNS rebinding) is turned away.
        if (request.headers.host !== `127.0.0.1:${port}`) return refuse(response, 421);
        if (request.method !== "GET") return refuse(response, 405, { Allow: "GET" });
        const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
        if (url.pathname !== "/") return refuse(response, 404);
        const codes = url.searchParams.getAll("code");
        const states = url.searchParams.getAll("state");
        if (codes.length !== 1 || states.length !== 1 || !codes[0] || !states[0]) {
          return refuse(response, 400);
        }
        if (arrived) return refuse(response, 409, { Connection: "close" });
        arrived = true;
        // The first request with a code is the only one: stop listening at once.
        server.close();
        clearTimeout(timer);
        const locale = languageOf(
          request.headers["accept-language"],
          options.fallbackLocale ?? getLocale(),
        );
        let replied = false;
        settle({
          code: codes[0],
          state: states[0],
          reply: (finished) => {
            if (replied) return;
            replied = true;
            const page = donePage(locale, finished);
            response.writeHead(finished ? 200 : 400, {
              "Content-Type": "text/html; charset=utf-8",
              "Content-Length": Buffer.byteLength(page),
              "Cache-Control": "no-store",
              "Content-Security-Policy":
                "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
              "Referrer-Policy": "no-referrer",
              "X-Content-Type-Options": "nosniff",
              Connection: "close",
            });
            response.end(page, () => server.closeAllConnections());
          },
        });
      });

      timer = setTimeout(() => {
        if (arrived) return;
        arrived = true;
        void close();
        settle("timeout");
      }, options.timeoutMs);
      resolve({ port, outcome, close });
    });
  });
}
