// The host the MCP acceptance suite runs against: where it is, whether it answers, and plain HTTP to
// it for what is not a tool (the challenge, the metadata documents, a person's push, an anonymous
// reader, the deletion of what the suite made). Nothing here prints a header or a body.

/** The run's settings, from the environment. */
export interface Target {
  /** The service's origin, such as `https://staging.diagrams.meltemi.dev`. */
  readonly origin: string;
  /** The endpoint, `<origin>/mcp`. */
  readonly endpoint: string;
}

/**
 * The target from `MELTEMI_ORIGIN` (the origin) or `MELTEMI_MCP_URL` (the endpoint), the first that
 * is set; undefined when neither is, or when what is set is not an http(s) address.
 */
export function targetFrom(env: NodeJS.ProcessEnv): Target | undefined {
  const endpoint = env["MELTEMI_MCP_URL"]?.trim();
  const origin = env["MELTEMI_ORIGIN"]?.trim();
  const raw = origin || endpoint;
  if (!raw) return undefined;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
  if (origin) return { origin: url.origin, endpoint: `${url.origin}/mcp` };
  return { origin: url.origin, endpoint: `${url.origin}${url.pathname.replace(/\/$/, "")}` };
}

/** An HTTP answer, read once. */
export interface Answer {
  readonly status: number;
  readonly headers: Headers;
  readonly text: string;
  json<T = Record<string, unknown>>(): T;
}

/** The fetch the suite uses: the platform's, or a stand-in in the tests. */
export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/** How long one request may take. */
const REQUEST_TIMEOUT_MS = 60_000;

/** A request to the host, read to its end; `redirect: "manual"` unless asked otherwise. */
export async function ask(
  target: Target,
  path: string,
  init: RequestInit & { token?: string } = {},
  fetcher: Fetch = fetch,
): Promise<Answer> {
  const { token, headers, ...rest } = init;
  const merged = new Headers(headers);
  if (token) merged.set("Authorization", `Bearer ${token}`);
  const url = /^https?:/.test(path) ? path : `${target.origin}${path}`;
  const response = await fetcher(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    ...rest,
    headers: merged,
  });
  const text = await response.text();
  return {
    status: response.status,
    headers: response.headers,
    text,
    json: <T>() => JSON.parse(text) as T,
  };
}

/** A JSON-RPC request posted to the endpoint as an MCP client would, without the SDK. */
export function rpc(method: string, params: Record<string, unknown> = {}): RequestInit {
  return {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  };
}

/** What the host's first answer says. */
export interface Probe {
  readonly answers: boolean;
  /** What answered, or why nothing did: a status or an error's name, never a body. */
  readonly why: string;
}

/**
 * Cloudflare's answers when there is nothing behind a host: its connection and DNS errors (522, 523,
 * 530, the last carrying the 1xxx errors). Anything else came from the Worker, which the suite then
 * judges.
 */
const UNSERVED = new Set([522, 523, 530]);

/** Whether the host answers the endpoint: one unauthenticated `initialize`, whatever it answers. */
export async function probe(target: Target, fetcher: Fetch = fetch): Promise<Probe> {
  try {
    const answer = await ask(
      target,
      new URL(target.endpoint).pathname,
      rpc("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "mcp-acceptance-probe", version: "1.0.0" },
      }),
      fetcher,
    );
    if (UNSERVED.has(answer.status)) {
      return { answers: false, why: `Cloudflare answered ${answer.status}` };
    }
    return { answers: true, why: `HTTP ${answer.status}` };
  } catch (error) {
    const cause = (error as { cause?: { code?: string } }).cause?.code;
    const name = error instanceof Error ? error.name : "error";
    return { answers: false, why: cause ?? name };
  }
}

/** Probes up to `tries` times, `pauseMs` apart, until the host answers (a fresh upload takes seconds). */
export async function probeUntil(
  target: Target,
  tries: number,
  pauseMs: number,
  fetcher: Fetch = fetch,
): Promise<Probe> {
  let last: Probe = { answers: false, why: "not asked" };
  for (let i = 0; i < tries; i++) {
    last = await probe(target, fetcher);
    if (last.answers) return last;
    if (i + 1 < tries) await new Promise((done) => setTimeout(done, pauseMs));
  }
  return last;
}
